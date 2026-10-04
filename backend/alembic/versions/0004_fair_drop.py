"""Fair pre-queue phases, commit-reveal proof fields, ticket types, one-session-per-person."""
from alembic import op
import sqlalchemy as sa

revision = "0004_fair_drop"
down_revision = "0003_policy"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("events") as b:
        b.add_column(sa.Column("mode", sa.String(10), nullable=False, server_default="FIFO"))
        b.add_column(sa.Column("phase", sa.String(20), nullable=False, server_default="ADMITTING"))
        b.add_column(sa.Column("auto_advance", sa.Boolean(), nullable=False, server_default=sa.true()))
        b.add_column(sa.Column("prequeue_seconds", sa.Integer(), nullable=False, server_default="0"))
        b.add_column(sa.Column("prequeue_opens_at", sa.DateTime(timezone=True), nullable=True))
        b.add_column(sa.Column("prequeue_closes_at", sa.DateTime(timezone=True), nullable=True))
        b.add_column(sa.Column("commitment", sa.String(64), nullable=True))
        b.add_column(sa.Column("server_seed", sa.String(64), nullable=True))
        b.add_column(sa.Column("seed_revealed", sa.Boolean(), nullable=False, server_default=sa.false()))
        b.add_column(sa.Column("eligible_root", sa.String(64), nullable=True))
        b.add_column(sa.Column("eligible_count", sa.Integer(), nullable=False, server_default="0"))
        b.add_column(sa.Column("shuffle_seed", sa.String(64), nullable=True))
        b.add_column(sa.Column("randomized_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_events_phase", "events", ["phase"])
    with op.batch_alter_table("inventory") as b:
        b.add_column(sa.Column("ticket_type", sa.String(60), nullable=True))
    op.create_index("ix_inventory_ticket_type", "inventory", ["ticket_type"])
    with op.batch_alter_table("user_sessions") as b:
        b.create_unique_constraint("uq_session_event_user", ["event_id", "user_id"])


def downgrade():
    with op.batch_alter_table("user_sessions") as b:
        b.drop_constraint("uq_session_event_user", type_="unique")
    op.drop_index("ix_inventory_ticket_type", "inventory")
    with op.batch_alter_table("inventory") as b:
        b.drop_column("ticket_type")
    op.drop_index("ix_events_phase", "events")
    with op.batch_alter_table("events") as b:
        for c in ("mode", "phase", "auto_advance", "prequeue_seconds", "prequeue_opens_at", "prequeue_closes_at", "commitment", "server_seed", "seed_revealed", "eligible_root", "eligible_count", "shuffle_seed", "randomized_at"):
            b.drop_column(c)
