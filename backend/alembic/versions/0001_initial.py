"""initial Fair Drop Person 1 schema"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("events",
        sa.Column("id", sa.String(100), primary_key=True), sa.Column("name", sa.String(200), nullable=False),
        sa.Column("status", sa.String(20), nullable=False), sa.Column("admission_limit", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_events_status", "events", ["status"])
    op.create_table("user_sessions",
        sa.Column("id", sa.String(100), primary_key=True), sa.Column("event_id", sa.String(100), nullable=False),
        sa.Column("user_id", sa.String(100), nullable=False), sa.Column("state", sa.String(20), nullable=False),
        sa.Column("queue_sequence", sa.Integer(), nullable=True), sa.Column("token_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_user_sessions_event_id", "user_sessions", ["event_id"])
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_state", "user_sessions", ["state"])
    op.create_index("ix_user_sessions_queue_sequence", "user_sessions", ["queue_sequence"])
    op.create_table("inventory",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("event_id", sa.String(100), nullable=False),
        sa.Column("item_code", sa.String(120), nullable=False, unique=True), sa.Column("status", sa.String(20), nullable=False),
        sa.Column("holder_id", sa.String(100), nullable=True), sa.Column("reservation_id", sa.Integer(), nullable=True),
        sa.Column("held_until", sa.DateTime(timezone=True), nullable=True), sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_inventory_event_id", "inventory", ["event_id"])
    op.create_index("ix_inventory_status", "inventory", ["status"])
    op.create_index("ix_inventory_event_status", "inventory", ["event_id", "status"])
    op.create_table("reservations",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("event_id", sa.String(100), nullable=False),
        sa.Column("inventory_id", sa.Integer(), nullable=True), sa.Column("session_id", sa.String(100), nullable=True),
        sa.Column("user_id", sa.String(100), nullable=False), sa.Column("idempotency_key", sa.String(200), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False), sa.Column("held_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True), sa.Column("released_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_reservations_event_id", "reservations", ["event_id"])
    op.create_index("ix_reservations_inventory_id", "reservations", ["inventory_id"])
    op.create_index("ix_reservations_session_id", "reservations", ["session_id"])
    op.create_index("ix_reservations_user_id", "reservations", ["user_id"])
    op.create_index("ix_reservations_status", "reservations", ["status"])
    op.create_table("audit_events",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("event_id", sa.String(100), nullable=True), sa.Column("session_id", sa.String(100), nullable=True),
        sa.Column("correlation_id", sa.String(100), nullable=True), sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_audit_events_event_type", "audit_events", ["event_type"])
    op.create_index("ix_audit_events_event_id", "audit_events", ["event_id"])
    op.create_index("ix_audit_events_session_id", "audit_events", ["session_id"])


def downgrade():
    op.drop_table("audit_events")
    op.drop_table("reservations")
    op.drop_table("inventory")
    op.drop_table("user_sessions")
    op.drop_table("events")
