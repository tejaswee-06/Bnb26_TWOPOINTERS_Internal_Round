from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN", index=True)
    admission_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    # --- fair pre-queue / controlled admission (mode FAIR). mode FIFO keeps the original immediate-queue behaviour. ---
    mode: Mapped[str] = mapped_column(String(10), nullable=False, default="FIFO")
    phase: Mapped[str] = mapped_column(String(20), nullable=False, default="ADMITTING", index=True)
    auto_advance: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    prequeue_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    prequeue_opens_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    prequeue_closes_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    commitment: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    server_seed: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # secret until seed_revealed
    seed_revealed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    eligible_root: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    eligible_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    shuffle_seed: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    randomized_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
