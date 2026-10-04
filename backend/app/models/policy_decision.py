from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class PolicyDecision(Base):
    """Explainable record of one deterministic policy decision (ML-driven or challenge outcome)."""

    __tablename__ = "policy_decisions"
    __table_args__ = (UniqueConstraint("session_id", "risk_event_id", "source", name="uq_policy_session_riskevent_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(String(100), index=True)
    ticket_event_id: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)  # session's event, if the session is known
    session_known: Mapped[bool] = mapped_column(default=False)
    risk_event_id: Mapped[str] = mapped_column(String(100), index=True)  # RiskEvent.event_id from Person 2
    source: Mapped[str] = mapped_column(String(20), default="ml")  # ml | challenge
    action: Mapped[str] = mapped_column(String(16), index=True)
    severity: Mapped[int] = mapped_column(Integer, default=0)
    reason: Mapped[str] = mapped_column(String(500))
    rules_fired: Mapped[list] = mapped_column(JSON, default=list)
    evidence: Mapped[list] = mapped_column(JSON, default=list)
    risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    anomaly_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    coordination_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    campaign_id: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)
    attack_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    policy_version: Mapped[str] = mapped_column(String(50))
    risk_event_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
