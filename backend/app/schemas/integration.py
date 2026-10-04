from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field, model_validator


class RiskEvent(BaseModel):
    session_id: str = Field(min_length=1, max_length=100)
    event_id: str = Field(min_length=1, max_length=100)
    # Scores are nullable by contract: Person 2's coordination-only events carry risk_score=null and
    # anomaly_score=null. Null means "not measured" and is never replaced by an invented value.
    risk_score: float | None = Field(default=None, ge=0, le=1)
    anomaly_score: float | None = Field(default=None, ge=0, le=1)
    coordination_score: float | None = Field(default=None, ge=0, le=1)
    campaign_id: str | None = Field(default=None, max_length=100)
    attack_type: str | None = Field(default=None, max_length=100)
    evidence: list[str] = Field(default_factory=list, max_length=50)
    model_version: str = Field(min_length=1, max_length=100)
    timestamp: datetime

    @model_validator(mode="after")
    def _needs_a_signal(self):
        if self.risk_score is None and self.anomaly_score is None and self.coordination_score is None:
            raise ValueError("RiskEvent must carry at least one of risk_score, anomaly_score, coordination_score")
        return self


class AllocationEvent(BaseModel):
    event_id: str
    session_id: str | None = None
    allocation_id: int
    inventory_id: int | None = None
    state: str
    idempotency_key: str | None = None
    timestamp: datetime


class IncidentContext(BaseModel):
    event_id: str
    metrics: dict[str, Any] = Field(default_factory=dict)
    mitigation_events: list[dict[str, Any]] = Field(default_factory=list)
