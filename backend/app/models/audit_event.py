from datetime import datetime

from sqlalchemy import DateTime, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    event_id: Mapped[str | None] = mapped_column(String(100), index=True)
    session_id: Mapped[str | None] = mapped_column(String(100), index=True)
    reservation_id: Mapped[int | None] = mapped_column(index=True)
    allocation_id: Mapped[int | None] = mapped_column(index=True)
    user_id: Mapped[str | None] = mapped_column(String(100), index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(200), index=True)
    correlation_id: Mapped[str | None] = mapped_column(String(100), index=True)
    previous_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
