from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class UserSession(Base):
    __tablename__ = "user_sessions"
    # One session per person per event (identity multiplicity control): re-joining resumes with the credential, it never multiplies entries.
    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_session_event_user"),)

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    credential_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="CREATED", index=True)
    queue_sequence: Mapped[int | None] = mapped_column(nullable=True, index=True)
    token_version: Mapped[int] = mapped_column(default=1, nullable=False)
    admission_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
