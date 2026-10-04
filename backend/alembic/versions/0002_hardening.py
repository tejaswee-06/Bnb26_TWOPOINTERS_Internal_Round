"""Person 1 hardening: credentials, fingerprints, token replay and audit chain."""
from alembic import op
import sqlalchemy as sa

revision = "0002_hardening"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user_sessions", sa.Column("credential_hash", sa.String(128), nullable=True))
    op.add_column("user_sessions", sa.Column("admission_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_user_sessions_admission_expires_at", "user_sessions", ["admission_expires_at"])

    op.add_column("reservations", sa.Column("request_fingerprint", sa.String(64), nullable=True))

    op.add_column("audit_events", sa.Column("reservation_id", sa.Integer(), nullable=True))
    op.add_column("audit_events", sa.Column("allocation_id", sa.Integer(), nullable=True))
    op.add_column("audit_events", sa.Column("user_id", sa.String(100), nullable=True))
    op.add_column("audit_events", sa.Column("idempotency_key", sa.String(200), nullable=True))
    op.add_column("audit_events", sa.Column("previous_hash", sa.String(64), nullable=True))
    op.add_column("audit_events", sa.Column("event_hash", sa.String(64), nullable=True))
    op.create_index("ix_audit_events_reservation_id", "audit_events", ["reservation_id"])
    op.create_index("ix_audit_events_allocation_id", "audit_events", ["allocation_id"])
    op.create_index("ix_audit_events_user_id", "audit_events", ["user_id"])
    op.create_index("ix_audit_events_idempotency_key", "audit_events", ["idempotency_key"])
    op.create_index("ix_audit_events_event_hash", "audit_events", ["event_hash"])

    op.create_table(
        "consumed_admission_tokens",
        sa.Column("jti", sa.String(64), primary_key=True),
        sa.Column("event_id", sa.String(100), nullable=False),
        sa.Column("session_id", sa.String(100), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_consumed_admission_tokens_event_id", "consumed_admission_tokens", ["event_id"])
    op.create_index("ix_consumed_admission_tokens_session_id", "consumed_admission_tokens", ["session_id"])
    op.create_index("ix_consumed_admission_tokens_expires_at", "consumed_admission_tokens", ["expires_at"])

    # Existing rows are only valid for migrated installations; generate a deterministic
    # non-secret credential placeholder and require fresh sessions after migration.
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE user_sessions SET credential_hash = 'MIGRATED_SESSION_REQUIRES_REJOIN' WHERE credential_hash IS NULL"))
    bind.execute(sa.text("UPDATE reservations SET request_fingerprint = '' WHERE request_fingerprint IS NULL"))
    with op.batch_alter_table("user_sessions") as batch:
        batch.alter_column("credential_hash", existing_type=sa.String(128), nullable=False)
    with op.batch_alter_table("reservations") as batch:
        batch.alter_column("request_fingerprint", existing_type=sa.String(64), nullable=False)


def downgrade():
    op.drop_table("consumed_admission_tokens")
    for idx in ["ix_audit_events_event_hash", "ix_audit_events_idempotency_key", "ix_audit_events_user_id", "ix_audit_events_allocation_id", "ix_audit_events_reservation_id"]:
        op.drop_index(idx, table_name="audit_events")
    for col in ["event_hash", "previous_hash", "idempotency_key", "user_id", "allocation_id", "reservation_id"]:
        op.drop_column("audit_events", col)
    op.drop_column("reservations", "request_fingerprint")
    op.drop_index("ix_user_sessions_admission_expires_at", table_name="user_sessions")
    op.drop_column("user_sessions", "admission_expires_at")
    op.drop_column("user_sessions", "credential_hash")
