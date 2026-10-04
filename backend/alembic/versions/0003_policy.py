"""Deterministic policy decisions (explainable ML-driven actions)."""
from alembic import op
import sqlalchemy as sa

revision = "0003_policy"
down_revision = "0002_hardening"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "policy_decisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.String(100), nullable=False),
        sa.Column("ticket_event_id", sa.String(100), nullable=True),
        sa.Column("session_known", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("risk_event_id", sa.String(100), nullable=False),
        sa.Column("source", sa.String(20), nullable=False, server_default="ml"),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("severity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("rules_fired", sa.JSON(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("risk_score", sa.Float(), nullable=True),
        sa.Column("anomaly_score", sa.Float(), nullable=True),
        sa.Column("coordination_score", sa.Float(), nullable=True),
        sa.Column("campaign_id", sa.String(100), nullable=True),
        sa.Column("attack_type", sa.String(100), nullable=True),
        sa.Column("model_version", sa.String(100), nullable=True),
        sa.Column("policy_version", sa.String(50), nullable=False),
        sa.Column("risk_event_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("session_id", "risk_event_id", "source", name="uq_policy_session_riskevent_source"),
    )
    for col in ("session_id", "ticket_event_id", "risk_event_id", "action", "campaign_id", "expires_at"):
        op.create_index(f"ix_policy_decisions_{col}", "policy_decisions", [col])


def downgrade():
    op.drop_table("policy_decisions")
