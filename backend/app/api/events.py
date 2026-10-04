from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.event import Event
from app.schemas.event import EventCreate, EventResponse
from app.security.admin import require_admin_key
from app.services.drop_service import DropError, DropService
from app.api.sessions import queue_store

router = APIRouter(prefix="/events", tags=["Events"])


def _resp(event: Event) -> EventResponse:
    return EventResponse(event_id=event.id, name=event.name, status=event.status, admission_limit=event.admission_limit, mode=event.mode, phase=event.phase)


@router.post("", response_model=EventResponse, dependencies=[Depends(require_admin_key)])
def create_event(request: EventCreate, db: Session = Depends(get_db)):
    if db.get(Event, request.event_id):
        raise HTTPException(status_code=409, detail="Event already exists")
    fair = request.mode == "FAIR"
    event = Event(id=request.event_id, name=request.name, admission_limit=request.admission_limit, mode=request.mode, phase="PREPARED" if fair else "ADMITTING",
                  prequeue_seconds=request.prequeue_seconds, auto_advance=request.auto_advance)
    db.add(event)
    db.commit()
    return _resp(event)


@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: str, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return _resp(event)


@router.get("/{event_id}/drop")
def drop_info(event_id: str, db: Session = Depends(get_db)):
    """Public read model for the customer journey: phase, countdown, counts, inventory by ticket type, published commitment."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    svc = DropService(db, queue_store)
    svc.advance_if_due(event)
    db.refresh(event)
    return svc.info(event)


@router.get("/{event_id}/proof")
def drop_proof(event_id: str, db: Session = Depends(get_db)):
    """Commit-reveal bundle + canonical eligible list (opaque session ids). Available only after the seed is revealed at randomisation."""
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    try:
        return DropService(db, queue_store).proof(event)
    except DropError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
