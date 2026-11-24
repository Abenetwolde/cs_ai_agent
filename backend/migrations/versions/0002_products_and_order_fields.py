"""Add products and order fields.

Revision ID: 0002_products_and_order_fields
Revises: 0001_initial
Create Date: 2026-11-24
"""
import sqlalchemy as sa
from alembic import op
from backend.models import Product

revision = '0002_products_and_order_fields'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    Product.__table__.create(bind=bind, checkfirst=True)
    inspector = sa.inspect(bind)
    existing_columns = {c['name'] for c in inspector.get_columns('orders')}
    if 'total_amount' not in existing_columns:
        op.add_column('orders', sa.Column('total_amount', sa.Float(), nullable=False, server_default='0.0'))
    if 'payment_method' not in existing_columns:
        op.add_column('orders', sa.Column('payment_method', sa.String(length=50), nullable=True))
    if 'shipping_address' not in existing_columns:
        op.add_column('orders', sa.Column('shipping_address', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('orders', 'shipping_address')
    op.drop_column('orders', 'payment_method')
    op.drop_column('orders', 'total_amount')
    op.drop_table('products')
