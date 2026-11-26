"""Add cart_items table.

Revision ID: 0003_add_cart_items
Revises: 0002_products_and_order_fields
Create Date: 2026-11-26
"""
import sqlalchemy as sa
from alembic import op
from backend.models import CartItem

revision = '0003_add_cart_items'
down_revision = '0002_products_and_order_fields'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    CartItem.__table__.create(bind=bind, checkfirst=True)


def downgrade():
    op.drop_table('cart_items')

