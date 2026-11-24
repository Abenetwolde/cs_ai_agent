from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.models import Order, Product, User

DEMO_EMAIL = "demo.customer@example.com"
DEMO_ORDER_NUMBERS = ("ADDIS-1001", "ADDIS-1002")

INITIAL_PRODUCTS = [
    {
        "name": "Yirgacheffe Single-Origin Special Reserve",
        "category": "Coffee & Gourmet",
        "price": 1250.0,
        "description": "Grade 1 washed Arabica coffee beans harvested from the misty highlands of Yirgacheffe (altitude 2,100m). Features an elegant floral aroma with bright notes of bergamot, lemon zest, and wild jasmine honey. Freshly roasted in Addis Ababa, 500g whole bean bag.",
        "image_url": "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800&q=80",
        "stock": 45,
        "rating": 4.9,
    },
    {
        "name": "Sidama Natural Sun-Dried Organic Coffee",
        "category": "Coffee & Gourmet",
        "price": 1100.0,
        "description": "Naturally processed Ethiopian heirloom coffee dried slowly on raised African beds. Velvety, heavy body with tasting notes of ripe wild strawberry, dark cacao, and blueberry pie. Medium dark roast, 500g bag.",
        "image_url": "https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=800&q=80",
        "stock": 60,
        "rating": 4.8,
    },
    {
        "name": "Addis ANC Pro Wireless Headphones",
        "category": "Electronics",
        "price": 4800.0,
        "description": "Flagship over-ear active noise-cancelling Bluetooth 5.4 headphones. 45-hour battery playtime, rapid USB-C fast charge (10 mins gives 5 hours), spatial audio with dynamic bass boost, and memory foam protein ear cups.",
        "image_url": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80",
        "stock": 25,
        "rating": 4.9,
    },
    {
        "name": "SolarPulse 20,000mAh Rugged Power Bank",
        "category": "Electronics",
        "price": 2450.0,
        "description": "High-capacity dual solar charging portable battery pack. 22.5W Power Delivery fast charging, IP67 waterproof & shockproof casing, ultra-bright emergency LED torch, and 15W Qi wireless charging surface.",
        "image_url": "https://images.unsplash.com/photo-1609592424365-a86d2eb15729?w=800&q=80",
        "stock": 40,
        "rating": 4.7,
    },
    {
        "name": "Handcrafted Ethiopian Leather Messenger Bag",
        "category": "Fashion & Leather",
        "price": 5600.0,
        "description": "100% full-grain Ethiopian highland calf leather, vegetable-tanned and handcrafted by master artisans in Addis Ababa. Fits laptops up to 15.6 inches with dedicated padded sleeve, antique brass zippers, and adjustable shoulder strap.",
        "image_url": "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80",
        "stock": 18,
        "rating": 5.0,
    },
    {
        "name": "Handwoven Shema Cotton Scarf (Netela)",
        "category": "Fashion & Traditional",
        "price": 1850.0,
        "description": "Traditional gossamer-light Ethiopian Netela scarf handwoven on wooden looms from pure organic Ethiopian cotton. Accented with vibrant multi-colored Tibeb border embroidery. Lightweight, breathable, and culturally iconic.",
        "image_url": "https://images.unsplash.com/photo-1607083206968-13611e3d76db?w=800&q=80",
        "stock": 35,
        "rating": 4.9,
    },
    {
        "name": "Jebena Traditional Coffee Ceremony Set",
        "category": "Home & Living",
        "price": 3200.0,
        "description": "Authentic Ethiopian clay coffee pot (Jebena) fired by traditional potters, paired with 6 hand-painted porcelain Cini cups, a carved wooden Rekebot serving table, and a clay Frankincense burner.",
        "image_url": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&q=80",
        "stock": 20,
        "rating": 4.8,
    },
    {
        "name": "Addis Smart Fitness Watch Tracker",
        "category": "Electronics",
        "price": 3400.0,
        "description": "High-definition 1.43-inch AMOLED display with continuous heart rate, blood oxygen (SpO2), sleep analysis, and 100+ sport modes. Up to 12-day battery life, 5ATM water resistance, and multilingual push notifications.",
        "image_url": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80",
        "stock": 30,
        "rating": 4.7,
    },
]


def seed_demo_data(db: Session) -> None:
    # 1. Seed Products
    existing_products = set(db.scalars(select(Product.name)).all())
    for item in INITIAL_PRODUCTS:
        if item["name"] not in existing_products:
            db.add(Product(**item))

    # 2. Seed Demo User
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if user is None:
        user = User(id="demo-user-0001", full_name="Demo Customer", email=DEMO_EMAIL, phone="+251911223344", preferred_language="en")
        db.add(user)
        db.flush()

    # 3. Seed Demo Orders
    existing_orders = set(db.scalars(select(Order.order_number).where(Order.order_number.in_(DEMO_ORDER_NUMBERS))))
    sample_records = [
        ("ADDIS-1001", "shipped", date(2026, 11, 24), "Ethio Post", [
            {"name": "Yirgacheffe Single-Origin Special Reserve", "quantity": 1, "price": 1250.0}
        ], 1250.0, "Telebirr", "Bole Subcity, Woreda 03, Addis Ababa"),
        ("ADDIS-1002", "processing", None, "Addis Express", [
            {"name": "Addis ANC Pro Wireless Headphones", "quantity": 1, "price": 4800.0},
            {"name": "Sidama Natural Sun-Dried Organic Coffee", "quantity": 1, "price": 1100.0}
        ], 5900.0, "CBE Birr", "Kazanchis, Kirkos Subcity, Addis Ababa"),
    ]
    for number, status, eta, carrier, items, total, payment, addr in sample_records:
        if number not in existing_orders:
            db.add(Order(
                order_number=number,
                user_id=user.id,
                status=status,
                estimated_delivery=eta,
                carrier=carrier,
                items=items,
                total_amount=total,
                payment_method=payment,
                shipping_address=addr
            ))
    db.commit()
