import json
import logging
import os
import random
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Literal, TypedDict

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from backend.models import CartItem, ChatMessage, ChatSession, Order, Product, SupportTicket, User

load_dotenv(Path(__file__).with_name('.env'), override=True)
logger = logging.getLogger('uvicorn.error')
LANGUAGE_NAMES = {'en': 'English', 'am': 'Amharic', 'om': 'Afaan Oromo', 'ti': 'Tigrinya'}


def gemini_client():
    key = os.getenv('GEMINI_API_KEY')
    if not key:
        return None
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(model=os.getenv('GEMINI_MODEL', 'gemini-3.5-flash-lite'), google_api_key=key)


# --- Customer Tool Argument Schemas ---
class MyProfileArgs(BaseModel):
    field: str = Field(default='full_name', description='One of: full_name, email, phone, preferred_language')

class UpdateProfileArgs(BaseModel):
    field: str = Field(description='One of: full_name, email, phone, preferred_language')
    value: str = Field(description='New value requested by customer')

class SearchProductsArgs(BaseModel):
    query: str = Field(default='', description='Product name or keyword e.g. coffee, headphones, bag')
    category: str = Field(default='All', description='Category filter or All')
    max_price: float = Field(default=100000.0, description='Maximum price in ETB')

class ProductDetailsArgs(BaseModel):
    product_identifier: str = Field(description='Product ID or exact/partial product name')

class CartActionArgs(BaseModel):
    pass

class AddToCartArgs(BaseModel):
    product_identifier: str = Field(description='Product ID or name to add to cart')
    quantity: int = Field(default=1, description='Quantity to add (minimum 1)')

class RemoveFromCartArgs(BaseModel):
    product_identifier: str = Field(description='Product ID or name to remove from cart')
    quantity: int | None = Field(default=None, description='Optional quantity to deduct; omit to remove entire item')

class CheckoutCartArgs(BaseModel):
    shipping_address: str = Field(description='Delivery destination address in Ethiopia e.g. Bole Atlas, Addis Ababa')
    payment_method: str = Field(default='Telebirr', description='Payment method: Telebirr, CBE Birr, Demo Card, or Cash on Delivery')

class OrderLookupArgs(BaseModel):
    order_number: str = Field(description='Exact order number e.g. ADDIS-1001')

class CancelOrderArgs(BaseModel):
    order_number: str = Field(description='Order number to cancel (only allowed if processing)')

class TicketArgs(BaseModel):
    issue_summary: str = Field(description='Concise issue summary for support staff')
    priority: str = Field(default='normal', description='One of: low, normal, high, urgent')

class EscalationArgs(BaseModel):
    reason_summary: str = Field(description='Concise reason this conversation should be escalated to human support')


# --- Admin Tool Argument Schemas ---
class AdminOrdersArgs(BaseModel):
    status: str = Field(default='all', description='Filter by status: all, processing, shipped, delivered, cancelled')
    limit: int = Field(default=10, description='Maximum number of orders to return')

class AdminUpdateOrderArgs(BaseModel):
    order_number: str = Field(description='Order number to update')
    new_status: str = Field(description='One of: processing, shipped, delivered, cancelled')
    carrier: str | None = Field(default=None, description='Optional shipping carrier name')

class AdminProductsArgs(BaseModel):
    category: str = Field(default='all', description='Category filter or all')
    low_stock_only: bool = Field(default=False, description='Only show items with stock < 25')

class AdminUpdateProductArgs(BaseModel):
    product_identifier: str = Field(description='Product ID or exact name')
    new_price: float | None = Field(default=None, description='Updated price in ETB')
    new_stock: int | None = Field(default=None, description='Updated inventory stock quantity')

class AdminCreateProductArgs(BaseModel):
    name: str = Field(description='Product title')
    category: str = Field(description='Category e.g. Coffee & Gourmet, Electronics, Fashion & Leather')
    price: float = Field(description='Price in ETB')
    description: str = Field(description='Detailed product description')
    stock: int = Field(default=50, description='Initial stock quantity')
    image_url: str = Field(default='', description='Image URL')

class AdminTicketsArgs(BaseModel):
    status: str = Field(default='all', description='Filter: all, open, in_progress, resolved, closed')
    limit: int = Field(default=10, description='Max tickets to return')

class AdminUpdateTicketArgs(BaseModel):
    ticket_number: str = Field(description='Ticket number e.g. SUP-...')
    status: str = Field(description='One of: open, in_progress, resolved, closed')


# --- State for LangGraph ReAct Loop ---
class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    user_id: str
    is_admin: bool
    context: str
    tool_results: list[dict]
    escalation_summary: str | None
    cart_updated: bool
    iterations: int


def build_tools(db: Session, user: User, chat_session: ChatSession, is_admin: bool = False) -> tuple[list[StructuredTool], dict[str, Any]]:
    collected: list[dict] = []
    meta = {'cart_updated': False, 'escalation_summary': None, 'collected': collected}

    # Helper: resolve product by ID or name
    def find_product(identifier: str) -> Product | None:
        raw = identifier.strip()
        if raw.isdigit():
            p = db.get(Product, int(raw))
            if p:
                return p
        term = f"%{raw.lower()}%"
        return db.scalar(select(Product).where(func.lower(Product.name).like(term)).limit(1))

    # Helper: get current cart contents
    def get_cart_payload() -> dict:
        items_db = db.execute(
            select(CartItem, Product).join(Product, Product.id == CartItem.product_id)
            .where(CartItem.user_id == user.id).order_by(CartItem.id)
        ).all()
        items = []
        subtotal = 0.0
        for ci, p in items_db:
            line_total = round(p.price * ci.quantity, 2)
            subtotal += line_total
            items.append({
                'cart_item_id': ci.id,
                'product_id': p.id,
                'name': p.name,
                'price': p.price,
                'quantity': ci.quantity,
                'line_total': line_total,
                'image_url': p.image_url
            })
        shipping = 0.0 if (subtotal == 0 or subtotal >= 2000.0) else 150.0
        return {
            'items': items,
            'subtotal': round(subtotal, 2),
            'shipping': shipping,
            'grand_total': round(subtotal + shipping, 2),
            'total_items': sum(i['quantity'] for i in items)
        }

    # 1. Customer: Profile
    def lookup_my_profile(field: str = 'full_name') -> dict:
        allowed = {'full_name', 'email', 'phone', 'preferred_language'}
        if field not in allowed:
            field = 'full_name'
        val = getattr(user, field, None)
        res = {'found': val is not None, 'field': field, 'value': val}
        collected.append({'tool': 'lookup_my_profile', 'result': res})
        return res

    def update_user_profile(field: str, value: str) -> dict:
        allowed = {'full_name', 'email', 'phone', 'preferred_language'}
        if field not in allowed:
            return {'updated': False, 'reason': f'Field {field} cannot be modified.'}
        if field == 'preferred_language' and value not in LANGUAGE_NAMES:
            return {'updated': False, 'reason': 'Supported languages: en, am, om, ti.'}
        if field == 'email' and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value.strip()):
            return {'updated': False, 'reason': 'Invalid email address.'}
        if field == 'phone' and not re.fullmatch(r'\+?[0-9 ()-]{7,24}', value.strip()):
            return {'updated': False, 'reason': 'Invalid phone number.'}
        setattr(user, field, value.strip()[:254])
        db.flush()
        res = {'updated': True, 'field': field, 'value': value.strip()}
        collected.append({'tool': 'update_user_profile', 'result': res})
        return res

    # 2. Customer: Products Catalog
    def search_products(query: str = '', category: str = 'All', max_price: float = 100000.0) -> dict:
        stmt = select(Product)
        if category and category.lower() != 'all':
            stmt = stmt.where(func.lower(Product.category) == category.lower().strip())
        if query and query.strip():
            term = f"%{query.strip().lower()}%"
            stmt = stmt.where(or_(func.lower(Product.name).like(term), func.lower(Product.description).like(term)))
        stmt = stmt.where(Product.price <= max_price).order_by(Product.id).limit(8)
        prods = db.scalars(stmt).all()
        items = [
            {'id': p.id, 'name': p.name, 'category': p.category, 'price': p.price,
             'rating': p.rating, 'stock': p.stock, 'image_url': p.image_url}
            for p in prods
        ]
        res = {'count': len(items), 'products': items}
        collected.append({'tool': 'search_products', 'result': res})
        return res

    def get_product_details(product_identifier: str) -> dict:
        p = find_product(product_identifier)
        if not p:
            res = {'found': False, 'reason': f'No product found matching "{product_identifier}".'}
        else:
            res = {
                'found': True, 'id': p.id, 'name': p.name, 'category': p.category,
                'price': p.price, 'stock': p.stock, 'rating': p.rating,
                'description': p.description, 'image_url': p.image_url
            }
        collected.append({'tool': 'get_product_details', 'result': res})
        return res

    # 3. Customer: Cart Operations
    def view_cart() -> dict:
        cart_data = get_cart_payload()
        collected.append({'tool': 'view_cart', 'result': cart_data})
        return cart_data

    def add_to_cart(product_identifier: str, quantity: int = 1) -> dict:
        qty = max(1, quantity)
        p = find_product(product_identifier)
        if not p:
            res = {'success': False, 'reason': f'Product "{product_identifier}" not found in catalog.'}
            collected.append({'tool': 'add_to_cart', 'result': res})
            return res
        if p.stock < qty:
            res = {'success': False, 'reason': f'Only {p.stock} units available in stock.'}
            collected.append({'tool': 'add_to_cart', 'result': res})
            return res
        existing = db.scalar(select(CartItem).where(CartItem.user_id == user.id, CartItem.product_id == p.id))
        if existing:
            existing.quantity += qty
        else:
            db.add(CartItem(user_id=user.id, product_id=p.id, quantity=qty))
        db.flush()
        meta['cart_updated'] = True
        cart_data = get_cart_payload()
        res = {'success': True, 'added_item': {'name': p.name, 'quantity': qty, 'price': p.price}, 'cart': cart_data}
        collected.append({'tool': 'add_to_cart', 'result': res})
        return res

    def remove_from_cart(product_identifier: str, quantity: int | None = None) -> dict:
        p = find_product(product_identifier)
        if not p:
            return {'success': False, 'reason': f'Product "{product_identifier}" not found.'}
        existing = db.scalar(select(CartItem).where(CartItem.user_id == user.id, CartItem.product_id == p.id))
        if not existing:
            return {'success': False, 'reason': f'"{p.name}" is not in your cart.'}
        if quantity is None or quantity >= existing.quantity:
            db.delete(existing)
        else:
            existing.quantity -= quantity
        db.flush()
        meta['cart_updated'] = True
        cart_data = get_cart_payload()
        res = {'success': True, 'removed': p.name, 'cart': cart_data}
        collected.append({'tool': 'remove_from_cart', 'result': res})
        return res

    def clear_cart() -> dict:
        items = db.scalars(select(CartItem).where(CartItem.user_id == user.id)).all()
        for it in items:
            db.delete(it)
        db.flush()
        meta['cart_updated'] = True
        res = {'success': True, 'message': 'Shopping cart cleared.'}
        collected.append({'tool': 'clear_cart', 'result': res})
        return res

    def checkout_cart(shipping_address: str, payment_method: str = 'Telebirr') -> dict:
        cart_data = get_cart_payload()
        if not cart_data['items']:
            res = {'success': False, 'reason': 'Your shopping cart is empty. Add items before checking out.'}
            collected.append({'tool': 'checkout_cart', 'result': res})
            return res
        # Generate unique order number
        order_number = f"ADDIS-{random.randint(2000, 9999)}"
        while db.scalar(select(Order.id).where(Order.order_number == order_number)):
            order_number = f"ADDIS-{random.randint(2000, 9999)}"

        eta = date.today() + timedelta(days=2 if 'addis' in shipping_address.lower() else 3)
        carrier = 'Addis Express' if 'addis' in shipping_address.lower() else 'Ethio Post'
        order = Order(
            order_number=order_number,
            user_id=user.id,
            status='processing',
            estimated_delivery=eta,
            carrier=carrier,
            items=[{'name': i['name'], 'quantity': i['quantity'], 'price': i['price']} for i in cart_data['items']],
            total_amount=cart_data['grand_total'],
            payment_method=payment_method,
            shipping_address=shipping_address
        )
        db.add(order)
        # Clear cart
        for ci in db.scalars(select(CartItem).where(CartItem.user_id == user.id)).all():
            db.delete(ci)
        db.flush()
        meta['cart_updated'] = True
        res = {
            'success': True,
            'order_number': order.order_number,
            'status': order.status,
            'estimated_delivery': order.estimated_delivery.isoformat(),
            'carrier': order.carrier,
            'total_amount': order.total_amount,
            'payment_method': order.payment_method,
            'items': order.items
        }
        collected.append({'tool': 'checkout_cart', 'result': res})
        return res

    # 4. Customer: Orders
    def lookup_user_orders(order_number: str) -> dict:
        rec = db.scalar(select(Order).where(Order.order_number == order_number.strip().upper(), Order.user_id == user.id))
        if not rec:
            res = {'found': False, 'order_number': order_number.strip().upper()}
        else:
            res = {
                'found': True, 'order_number': rec.order_number, 'status': rec.status,
                'estimated_delivery': rec.estimated_delivery.isoformat() if rec.estimated_delivery else None,
                'carrier': rec.carrier, 'items': rec.items,
                'total_amount': getattr(rec, 'total_amount', 0.0),
                'payment_method': getattr(rec, 'payment_method', None),
                'shipping_address': getattr(rec, 'shipping_address', None)
            }
        collected.append({'tool': 'lookup_user_orders', 'result': res})
        return res

    def list_my_orders() -> dict:
        records = db.scalars(select(Order).where(Order.user_id == user.id).order_by(desc(Order.updated_at)).limit(8)).all()
        orders = [
            {'order_number': o.order_number, 'status': o.status,
             'estimated_delivery': o.estimated_delivery.isoformat() if o.estimated_delivery else None,
             'carrier': o.carrier, 'total_amount': o.total_amount, 'items': o.items}
            for o in records
        ]
        res = {'orders': orders, 'count': len(orders)}
        collected.append({'tool': 'list_my_orders', 'result': res})
        return res

    def cancel_order(order_number: str) -> dict:
        rec = db.scalar(select(Order).where(Order.order_number == order_number.strip().upper(), Order.user_id == user.id))
        if not rec:
            res = {'cancelled': False, 'reason': f'Order {order_number} not found on your profile.'}
        elif rec.status.lower() != 'processing':
            res = {'cancelled': False, 'reason': f'Order {rec.order_number} cannot be cancelled because its status is already "{rec.status}".'}
        else:
            rec.status = 'cancelled'
            db.flush()
            res = {'cancelled': True, 'order_number': rec.order_number, 'status': 'cancelled'}
        collected.append({'tool': 'cancel_order', 'result': res})
        return res

    # 5. Customer: Support & Escalation
    def create_support_ticket(issue_summary: str, priority: str = 'normal') -> dict:
        allowed = {'low', 'normal', 'high', 'urgent'}
        p = priority.lower().strip() if priority.lower().strip() in allowed else 'normal'
        ticket = SupportTicket(ticket_number=f"SUP-{uuid.uuid4().hex[:8].upper()}", user_id=user.id,
                               session_id=chat_session.id, issue_summary=issue_summary[:1200], priority=p)
        db.add(ticket)
        db.flush()
        res = {'ticket_id': ticket.ticket_number, 'priority': ticket.priority, 'status': ticket.status}
        collected.append({'tool': 'create_support_ticket', 'result': res})
        return res

    def escalate_to_human(reason_summary: str) -> dict:
        summary = reason_summary[:1200]
        chat_session.status = 'escalated'
        chat_session.escalation_summary = summary
        ticket = SupportTicket(ticket_number=f"SUP-{uuid.uuid4().hex[:8].upper()}", user_id=user.id,
                               session_id=chat_session.id, issue_summary=summary, priority='high')
        db.add(ticket)
        db.flush()
        meta['escalation_summary'] = summary
        res = {'escalated': True, 'ticket_id': ticket.ticket_number, 'summary': summary}
        collected.append({'tool': 'escalate_to_human', 'result': res})
        return res

    tools: list[StructuredTool] = [
        StructuredTool.from_function(lookup_my_profile, name='lookup_my_profile', description='Look up the signed-in customer’s profile fields (name, email, phone, language).', args_schema=MyProfileArgs),
        StructuredTool.from_function(update_user_profile, name='update_user_profile', description='Update customer profile field (full_name, email, phone, preferred_language).', args_schema=UpdateProfileArgs),
        StructuredTool.from_function(search_products, name='search_products', description='Search products in the store by keyword, category, or maximum price.', args_schema=SearchProductsArgs),
        StructuredTool.from_function(get_product_details, name='get_product_details', description='Get detailed specifications, price, stock, and description for a specific product.', args_schema=ProductDetailsArgs),
        StructuredTool.from_function(view_cart, name='view_cart', description='View the customer’s active shopping cart, items, subtotal, and delivery calculation.', args_schema=CartActionArgs),
        StructuredTool.from_function(add_to_cart, name='add_to_cart', description='Add a product to the customer’s shopping cart with specified quantity.', args_schema=AddToCartArgs),
        StructuredTool.from_function(remove_from_cart, name='remove_from_cart', description='Remove an item or decrease its quantity in the shopping cart.', args_schema=RemoveFromCartArgs),
        StructuredTool.from_function(clear_cart, name='clear_cart', description='Empty all items from the customer’s shopping cart.', args_schema=CartActionArgs),
        StructuredTool.from_function(checkout_cart, name='checkout_cart', description='Checkout cart items to place an order with delivery address and payment method (Telebirr, CBE Birr, etc.).', args_schema=CheckoutCartArgs),
        StructuredTool.from_function(lookup_user_orders, name='lookup_user_orders', description='Look up an order by order number (e.g. ADDIS-1001) for this customer.', args_schema=OrderLookupArgs),
        StructuredTool.from_function(list_my_orders, name='list_my_orders', description='List recent orders placed by the current customer.', args_schema=CartActionArgs),
        StructuredTool.from_function(cancel_order, name='cancel_order', description='Cancel an order if it is still in processing status.', args_schema=CancelOrderArgs),
        StructuredTool.from_function(create_support_ticket, name='create_support_ticket', description='Create a support ticket for staff investigation.', args_schema=TicketArgs),
        StructuredTool.from_function(escalate_to_human, name='escalate_to_human', description='Escalate the session to human staff and generate an urgent ticket.', args_schema=EscalationArgs),
    ]

    # Admin Tools (Only injected when authenticated as admin)
    if is_admin:
        def admin_get_overview() -> dict:
            tot_users = db.scalar(select(func.count(User.id))) or 0
            tot_orders = db.scalar(select(func.count(Order.id))) or 0
            tot_revenue = db.scalar(select(func.sum(Order.total_amount))) or 0.0
            open_tickets = db.scalar(select(func.count(SupportTicket.id)).where(SupportTicket.status == 'open')) or 0
            escalations = db.scalar(select(func.count(ChatSession.id)).where(ChatSession.status == 'escalated')) or 0
            low_stock = db.scalars(select(Product.name).where(Product.stock < 25)).all()
            res = {
                'total_users': tot_users,
                'total_orders': tot_orders,
                'total_revenue_etb': round(tot_revenue, 2),
                'open_tickets': open_tickets,
                'escalated_conversations': escalations,
                'low_stock_products': low_stock
            }
            collected.append({'tool': 'admin_get_overview', 'result': res})
            return res

        def admin_list_orders(status: str = 'all', limit: int = 10) -> dict:
            stmt = select(Order, User.full_name, User.email).join(User, User.id == Order.user_id)
            if status and status.lower() != 'all':
                stmt = stmt.where(func.lower(Order.status) == status.lower().strip())
            stmt = stmt.order_by(desc(Order.updated_at)).limit(min(limit, 25))
            rows = db.execute(stmt).all()
            orders = [
                {'order_number': o.order_number, 'customer': name, 'email': email,
                 'status': o.status, 'total_amount': o.total_amount, 'carrier': o.carrier,
                 'delivery_date': o.estimated_delivery.isoformat() if o.estimated_delivery else None,
                 'items': [i.get('name') for i in o.items if isinstance(i, dict)]}
                for o, name, email in rows
            ]
            res = {'orders': orders, 'count': len(orders)}
            collected.append({'tool': 'admin_list_orders', 'result': res})
            return res

        def admin_update_order_status(order_number: str, new_status: str, carrier: str | None = None) -> dict:
            allowed = {'processing', 'shipped', 'delivered', 'cancelled'}
            st = new_status.lower().strip()
            if st not in allowed:
                return {'updated': False, 'reason': f'Allowed statuses: {", ".join(allowed)}'}
            rec = db.scalar(select(Order).where(Order.order_number == order_number.strip().upper()))
            if not rec:
                return {'updated': False, 'reason': f'Order {order_number} not found.'}
            rec.status = st
            if carrier:
                rec.carrier = carrier.strip()
            db.flush()
            res = {'updated': True, 'order_number': rec.order_number, 'status': rec.status, 'carrier': rec.carrier}
            collected.append({'tool': 'admin_update_order_status', 'result': res})
            return res

        def admin_list_products(category: str = 'all', low_stock_only: bool = False) -> dict:
            stmt = select(Product)
            if category and category.lower() != 'all':
                stmt = stmt.where(func.lower(Product.category) == category.lower().strip())
            if low_stock_only:
                stmt = stmt.where(Product.stock < 25)
            stmt = stmt.order_by(Product.id)
            prods = db.scalars(stmt).all()
            items = [{'id': p.id, 'name': p.name, 'category': p.category, 'price': p.price, 'stock': p.stock} for p in prods]
            res = {'products': items, 'count': len(items)}
            collected.append({'tool': 'admin_list_products', 'result': res})
            return res

        def admin_update_product(product_identifier: str, new_price: float | None = None, new_stock: int | None = None) -> dict:
            p = find_product(product_identifier)
            if not p:
                return {'updated': False, 'reason': f'Product "{product_identifier}" not found.'}
            if new_price is not None and new_price >= 0:
                p.price = round(new_price, 2)
            if new_stock is not None and new_stock >= 0:
                p.stock = new_stock
            db.flush()
            res = {'updated': True, 'id': p.id, 'name': p.name, 'price': p.price, 'stock': p.stock}
            collected.append({'tool': 'admin_update_product', 'result': res})
            return res

        def admin_create_product(name: str, category: str, price: float, description: str, stock: int = 50, image_url: str = '') -> dict:
            new_p = Product(
                name=name.strip(),
                category=category.strip(),
                price=round(price, 2),
                description=description.strip(),
                stock=max(0, stock),
                image_url=image_url.strip() or 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800&q=80',
                rating=4.9
            )
            db.add(new_p)
            db.flush()
            res = {'created': True, 'id': new_p.id, 'name': new_p.name, 'price': new_p.price, 'category': new_p.category}
            collected.append({'tool': 'admin_create_product', 'result': res})
            return res

        def admin_list_tickets(status: str = 'all', limit: int = 10) -> dict:
            stmt = select(SupportTicket, User.full_name).join(User, User.id == SupportTicket.user_id)
            if status and status.lower() != 'all':
                stmt = stmt.where(func.lower(SupportTicket.status) == status.lower().strip())
            stmt = stmt.order_by(desc(SupportTicket.created_at)).limit(min(limit, 25))
            rows = db.execute(stmt).all()
            tickets = [
                {'ticket_number': t.ticket_number, 'customer': name, 'summary': t.issue_summary,
                 'priority': t.priority, 'status': t.status, 'created_at': t.created_at.isoformat()}
                for t, name in rows
            ]
            res = {'tickets': tickets, 'count': len(tickets)}
            collected.append({'tool': 'admin_list_tickets', 'result': res})
            return res

        def admin_update_ticket(ticket_number: str, status: str) -> dict:
            allowed = {'open', 'in_progress', 'resolved', 'closed'}
            st = status.lower().strip()
            if st not in allowed:
                return {'updated': False, 'reason': f'Allowed ticket statuses: {", ".join(allowed)}'}
            t = db.scalar(select(SupportTicket).where(SupportTicket.ticket_number == ticket_number.strip().upper()))
            if not t:
                return {'updated': False, 'reason': f'Ticket {ticket_number} not found.'}
            t.status = st
            db.flush()
            res = {'updated': True, 'ticket_number': t.ticket_number, 'status': t.status}
            collected.append({'tool': 'admin_update_ticket', 'result': res})
            return res

        admin_tools = [
            StructuredTool.from_function(admin_get_overview, name='admin_get_overview', description='Get high-level store analytics: total customers, revenue, orders, tickets, low stock.', args_schema=CartActionArgs),
            StructuredTool.from_function(admin_list_orders, name='admin_list_orders', description='List and filter store orders across all customers.', args_schema=AdminOrdersArgs),
            StructuredTool.from_function(admin_update_order_status, name='admin_update_order_status', description='Update status of an order (processing, shipped, delivered, cancelled).', args_schema=AdminUpdateOrderArgs),
            StructuredTool.from_function(admin_list_products, name='admin_list_products', description='List catalog products with current stock counts.', args_schema=AdminProductsArgs),
            StructuredTool.from_function(admin_update_product, name='admin_update_product', description='Update a product’s price or inventory stock quantity.', args_schema=AdminUpdateProductArgs),
            StructuredTool.from_function(admin_create_product, name='admin_create_product', description='Add a new product to the catalog.', args_schema=AdminCreateProductArgs),
            StructuredTool.from_function(admin_list_tickets, name='admin_list_tickets', description='List customer support tickets and their statuses.', args_schema=AdminTicketsArgs),
            StructuredTool.from_function(admin_update_ticket, name='admin_update_ticket', description='Update support ticket status (open, in_progress, resolved, closed).', args_schema=AdminUpdateTicketArgs),
        ]
        tools.extend(admin_tools)

    return tools, meta


def run_react_agent(
    db: Session,
    user: User,
    chat_session: ChatSession,
    message: str,
    history: list[dict],
    context: str,
    is_admin: bool = False
) -> tuple[list[dict], str | None, bool, str | None]:
    """
    Executes the conversational commerce ReAct loop using LangGraph StateGraph.
    Returns: (collected_tool_results, escalation_summary, cart_updated, final_ai_reply)
    """
    tools, meta = build_tools(db, user, chat_session, is_admin=is_admin)
    tool_map = {t.name: t for t in tools}
    client = gemini_client()

    # Fallback to direct heuristic tool execution if Gemini is unavailable
    if client is None:
        lowered = message.casefold()
        if is_admin:
            if 'overview' in lowered or 'analytic' in lowered or 'stat' in lowered or 'revenue' in lowered:
                tool_map['admin_get_overview'].invoke({})
            elif 'order' in lowered:
                tool_map['admin_list_orders'].invoke({})
            elif 'product' in lowered or 'stock' in lowered or 'catalog' in lowered or 'item' in lowered:
                tool_map['admin_list_products'].invoke({})
            elif 'ticket' in lowered or 'support' in lowered:
                tool_map['admin_list_tickets'].invoke({})
        else:
            if 'cart' in lowered or 'basket' in lowered:
                if any(w in lowered for w in ['view', 'show', 'check', 'what', 'list']):
                    tool_map['view_cart'].invoke({})
                elif 'clear' in lowered or 'empty' in lowered:
                    tool_map['clear_cart'].invoke({})
            elif 'order' in lowered:
                m = re.search(r'\bADDIS-\d{4,}\b', message, re.I)
                if m:
                    tool_map['lookup_user_orders'].invoke({'order_number': m.group(0)})
                else:
                    tool_map['list_my_orders'].invoke({})
            elif 'product' in lowered or 'item' in lowered or 'search' in lowered or 'shop' in lowered:
                tool_map['search_products'].invoke({'query': ''})
            elif 'profile' in lowered or 'account' in lowered:
                tool_map['lookup_my_profile'].invoke({'field': 'full_name'})
        return meta['collected'], meta['escalation_summary'], meta['cart_updated'], None

    # Construct System Prompt based on role
    role_instruction = (
        "You are Addis AI Store Copilot for staff/administrators. You have full access to admin operations: "
        "checking revenue overview, updating order delivery/status, updating inventory stock/prices, adding products, and managing tickets. "
        "Reason step-by-step and call appropriate admin tools. Confirm before executing destructive actions."
        if is_admin else
        "You are Addis AI Customer Care and Conversational Commerce Assistant. "
        "You help customers browse products, view product details, manage their shopping cart (add, view, remove, clear), "
        "checkout and place orders, track past orders, cancel processing orders, and get help grounded in store documents. "
        "Always reason through what database tool is required. Never invent order numbers, prices, or inventory."
    )

    system_content = f"{role_instruction}\n\nGround policy claims in this context:\n{context or 'No specific store documentation found.'}"

    # Build ReAct StateGraph
    def call_model(state: AgentState) -> dict:
        bound_llm = client.bind_tools(tools)
        response = bound_llm.invoke(state['messages'])
        return {
            'messages': [response],
            'iterations': state.get('iterations', 0) + 1
        }

    def execute_tools(state: AgentState) -> dict:
        last_message = state['messages'][-1]
        tool_messages = []
        calls = getattr(last_message, 'tool_calls', []) or []
        for call in calls:
            name = call.get('name')
            tool_func = tool_map.get(name)
            if not tool_func:
                continue
            try:
                res = tool_func.invoke(call.get('args') or {})
            except Exception as e:
                res = {'error': str(e)}
            tool_messages.append(ToolMessage(
                content=json.dumps(res, ensure_ascii=False, default=str),
                tool_call_id=call['id']
            ))
        return {'messages': tool_messages}

    def should_continue(state: AgentState) -> Literal['tools', 'end']:
        last_message = state['messages'][-1]
        calls = getattr(last_message, 'tool_calls', []) or []
        if calls and state.get('iterations', 0) < 6:
            return 'tools'
        return 'end'

    workflow = StateGraph(AgentState)
    workflow.add_node('agent', call_model)
    workflow.add_node('tools', execute_tools)

    workflow.add_edge(START, 'agent')
    workflow.add_conditional_edges('agent', should_continue, {'tools': 'tools', 'end': END})
    workflow.add_edge('tools', 'agent')

    graph = workflow.compile()

    # Prepare message history
    initial_messages: list[AnyMessage] = [SystemMessage(content=system_content)]
    for h in history[-8:]:
        initial_messages.append(HumanMessage(content=h['content']) if h['role'] == 'user' else AIMessage(content=h['content']))
    initial_messages.append(HumanMessage(content=message))

    try:
        final_state = graph.invoke({
            'messages': initial_messages,
            'user_id': user.id,
            'is_admin': is_admin,
            'context': context,
            'tool_results': [],
            'escalation_summary': None,
            'cart_updated': False,
            'iterations': 0
        })
        final_ai = final_state['messages'][-1]
        if isinstance(final_ai.content, list):
            text_parts = [b.get('text', '') if isinstance(b, dict) else str(b) for b in final_ai.content]
            final_content = "".join(text_parts)
        else:
            final_content = str(final_ai.content or '')
        return meta['collected'], meta['escalation_summary'], meta['cart_updated'], final_content.strip() or None
    except Exception as exc:
        logger.error('LangGraph ReAct loop encountered an error: %s', exc)
        return meta['collected'], meta['escalation_summary'], meta['cart_updated'], None
