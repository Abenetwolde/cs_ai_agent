from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.models import Order, User

DEMO_EMAIL = "demo.customer@example.com"
DEMO_ORDER_NUMBERS = ("ADDIS-1001", "ADDIS-1002")

def seed_demo_data(db: Session) -> None:
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if user is None:
        user = User(id="demo-user-0001", full_name="Demo Customer", email=DEMO_EMAIL, phone=None, preferred_language="en")
        db.add(user)
        db.flush()
    existing = set(db.scalars(select(Order.order_number).where(Order.order_number.in_(DEMO_ORDER_NUMBERS))))
    records = [
        ("ADDIS-1001", "shipped", date(2026, 11, 24), "Ethio Post", [{"name": "Sample item", "quantity": 1}]),
        ("ADDIS-1002", "processing", None, None, [{"name": "Sample item", "quantity": 2}]),
    ]
    for number, status, eta, carrier, items in records:
        if number not in existing:
            db.add(Order(order_number=number, user_id=user.id, status=status, estimated_delivery=eta, carrier=carrier, items=items))
    db.commit()
