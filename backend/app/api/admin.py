"""Operator API (X-Admin-Key). The Next.js server proxy injects the key after checking the organizer cookie; browsers never hold it."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.sessions import queue_store
from app.db.database import get_db
from app.models.event import Event
from app.models.inventory import Inventory
from app.models.policy_decision import PolicyDecision
from app.models.session import UserSession
from app.resilience import resilience
from app.schemas.event import ProvisionRequest
from app.security.admin import require_admin_key
from app.services.drop_service import DropError, DropService

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin_key)])

ACTIONS = {"close", "randomize", "admit", "pause", "end"}


@router.post("/events/provision")
def provision(req: ProvisionRequest, db: Session = Depends(get_db)):
    """Idempotent: create a FAIR event with typed inventory if it does not exist yet."""
    event = db.get(Event, req.event_id)
    created = False
    if not event:
        event = Event(id=req.event_id, name=req.name, admission_limit=req.admission_limit, mode="FAIR", phase="PREPARED", prequeue_seconds=req.prequeue_seconds, auto_advance=req.auto_advance)
        db.add(event)
        db.flush()
        for t in req.ticket_types:
            db.add_all([Inventory(event_id=req.event_id, item_code=f"{req.event_id}-{t.ticket_type.upper()}-{i:05d}", status="AVAILABLE", ticket_type=t.ticket_type) for i in range(1, t.count + 1)])
        db.commit()
        created = True
    return {"created": created, "event_id": event.id, "mode": event.mode, "phase": event.phase}


@router.post("/events/{event_id}/open")
def open_prequeue(event_id: str, seconds: int | None = None, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return _run(db, lambda svc: svc.open(event_id, seconds or event.prequeue_seconds or 60))


@router.post("/events/{event_id}/{action}")
def operate(event_id: str, action: str, db: Session = Depends(get_db)):
    if action not in ACTIONS:
        raise HTTPException(status_code=404, detail="Unknown action")
    fn = {"close": "close", "randomize": "randomize", "admit": "start_admission", "pause": "pause", "end": "end"}[action]
    return _run(db, lambda svc: getattr(svc, fn)(event_id))


def _run(db: Session, call):
    svc = DropService(db, queue_store)
    try:
        event = call(svc)
    except DropError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.refresh(event)
    return svc.info(event)


@router.get("/events/{event_id}/overview")
def overview(event_id: str, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    svc = DropService(db, queue_store)
    svc.advance_if_due(event)
    db.refresh(event)
    states = dict(db.execute(select(UserSession.state, func.count(UserSession.id)).where(UserSession.event_id == event_id).group_by(UserSession.state)).all())
    decisions = dict(db.execute(select(PolicyDecision.action, func.count(PolicyDecision.id)).where(PolicyDecision.ticket_event_id == event_id).group_by(PolicyDecision.action)).all())
    return {**svc.info(event), "sessions_by_state": states, "policy_decisions_by_action": decisions, "resilience": resilience.snapshot(), "queue_backend": "redis" if queue_store.using_redis else "memory-fallback"}
