from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.sessions import queue_store
from app.core.config import settings
from app.db.database import get_db
from app.models.policy_decision import PolicyDecision
from app.models.session import UserSession
from app.policy.service import PolicyService, decision_to_dict, normalize_session_id
from app.schemas.integration import AllocationEvent, RiskEvent
from app.telemetry import emit


def require_integration_key(x_integration_key: str | None = Header(default=None)) -> None:
    """Service-to-service auth. If INTEGRATION_API_KEY is unset (dev/test) the endpoints stay open; production refuses to start without it."""
    if settings.integration_api_key:
        import hmac
        if not x_integration_key or not hmac.compare_digest(x_integration_key, settings.integration_api_key):
            raise HTTPException(status_code=401, detail="Valid X-Integration-Key required")


router = APIRouter(prefix="/integration", tags=["Integration"], dependencies=[Depends(require_integration_key)])


@router.post("/risk-events")
def ingest_risk_event(event: RiskEvent, db: Session = Depends(get_db)):
    """Person 2 -> Person 1. Evaluates deterministic policy and records an explainable decision.

    ML supplies evidence only; the response reports the policy's action. Idempotent on (session_id, event_id).
    """
    emit(db, "RISK_EVENT_RECEIVED", event_id=event.event_id, session_id=normalize_session_id(event.session_id), payload=event.model_dump(mode="json"))
    result = PolicyService(db, queue_store).ingest(event)
    return {**result, "event_id": event.event_id, "session_id": normalize_session_id(event.session_id), "policy_mutation": result.get("applied", [])}


@router.post("/risk-events/batch")
def ingest_risk_events(events: list[RiskEvent], db: Session = Depends(get_db)):
    if len(events) > 500:
        raise HTTPException(status_code=413, detail="max 500 events per batch")
    svc = PolicyService(db, queue_store)
    results = [svc.ingest(e) for e in events]
    return {"accepted": len(results), "duplicates": sum(1 for r in results if r["duplicate"]), "decisions": [r["decision"] for r in results]}


@router.get("/ml/status")
def ml_status():
    return PolicyService.ml_status()


@router.post("/ml/sync")
def ml_sync(db: Session = Depends(get_db)):
    return PolicyService(db, queue_store).sync_from_ml()


@router.get("/decisions")
def list_decisions(session_id: str | None = None, campaign_id: str | None = None, action: str | None = None, limit: int = 100, db: Session = Depends(get_db)):
    q = select(PolicyDecision).order_by(PolicyDecision.id.desc()).limit(min(max(limit, 1), 500))
    if session_id:
        q = q.where(PolicyDecision.session_id == normalize_session_id(session_id))
    if campaign_id:
        q = q.where(PolicyDecision.campaign_id == campaign_id)
    if action:
        q = q.where(PolicyDecision.action == action.upper())
    return {"decisions": [decision_to_dict(d) for d in db.execute(q).scalars().all()]}


@router.get("/policy/session/{session_id}")
def session_policy(session_id: str, db: Session = Depends(get_db)):
    sid = normalize_session_id(session_id)
    action, d = PolicyService(db, queue_store).effective(sid)
    return {"session_id": sid, "effective_action": action, "decision": decision_to_dict(d) if d else None, "policy_version": settings.policy_version}


@router.post("/allocation-events")
def publish_allocation_event(event: AllocationEvent, db: Session = Depends(get_db)):
    emit(db, "ALLOCATION_EVENT_PUBLISHED", event_id=event.event_id, session_id=event.session_id, allocation_id=event.allocation_id, payload=event.model_dump(mode="json"))
    return {"accepted": True, "allocation_id": event.allocation_id}


@router.get("/sessions")
def live_session_roster(event_id: str | None = None, limit: int = 1000, db: Session = Depends(get_db)):
    """Telemetry feed for Person 2: REAL live session ids with server-side join facts. RiskEvents for live customers must reference these ids."""
    q = select(UserSession.id, UserSession.event_id, UserSession.state, UserSession.created_at, UserSession.queue_sequence).order_by(UserSession.created_at.desc()).limit(min(max(limit, 1), 5000))
    if event_id:
        q = q.where(UserSession.event_id == event_id)
    return {"sessions": [{"session_id": r.id, "event_id": r.event_id, "state": r.state, "joined_at": r.created_at.isoformat() if r.created_at else None, "queue_sequence": r.queue_sequence} for r in db.execute(q).all()]}
