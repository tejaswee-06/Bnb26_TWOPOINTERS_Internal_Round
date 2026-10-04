from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.queue.store import QueueStore
from app.resilience import resilience
from app.schemas.session import AdmitResponse, JoinRequest, SessionResponse
from app.services.session_service import SessionService

router = APIRouter(tags=["Queue & Sessions"])
queue_store = QueueStore()


def _rate_limit(key: str, limit: int, window: int) -> None:
    allowed, remaining = queue_store.rate_limit(key, limit, window)
    if not allowed:
        raise HTTPException(status_code=429, detail={"message": "Rate limit exceeded", "remaining": remaining})


def _response(data: dict) -> SessionResponse:
    if data.get("unauthorized"):
        raise HTTPException(status_code=403, detail="Invalid session credential")
    return SessionResponse(**{k: data.get(k) for k in SessionResponse.model_fields})


@router.post("/events/{event_id}/join", response_model=SessionResponse)
def join_event(event_id: str, request: JoinRequest, db: Session = Depends(get_db)):
    # Backpressure: in PROTECTIVE state new joins are shed (503 + Retry-After) so sessions already queued/admitted keep priority on capacity.
    if not request.session_id and not resilience.allow("join"):
        raise HTTPException(status_code=503, detail={"status": "PROTECTIVE", "message": "Queue is shedding new arrivals; retry shortly", "retry_after_seconds": 5}, headers={"Retry-After": "5"})
    _rate_limit(f"join:{event_id}:{request.user_id}", settings.rate_limit_requests, settings.rate_limit_window_seconds)
    try:
        session, credential = SessionService(db, queue_store).join(event_id, request.user_id, request.session_id, request.credential)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    status = SessionService(db, queue_store).status(session.id, credential or request.credential)
    result = _response(status)
    result.credential = credential
    return result


@router.get("/queue/{session_id}", response_model=SessionResponse)
def queue_status(session_id: str, x_session_credential: str | None = Header(default=None), db: Session = Depends(get_db)):
    _rate_limit(f"poll:{session_id}", settings.queue_poll_rate_limit, settings.queue_poll_window_seconds)
    return _response(SessionService(db, queue_store).status(session_id, x_session_credential))


@router.post("/queue/{session_id}/admit", response_model=AdmitResponse)
def admit(session_id: str, x_session_credential: str | None = Header(default=None), db: Session = Depends(get_db)):
    _rate_limit(f"admit:{session_id}", 20, 10)
    result = SessionService(db, queue_store).admit(session_id, x_session_credential)
    if result.get("status") == "NOT_FOUND":
        raise HTTPException(status_code=404, detail="Session not found")
    if result.get("status") == "UNAUTHORIZED":
        raise HTTPException(status_code=403, detail="Invalid session credential")
    return AdmitResponse(**result)


@router.get("/sessions/{session_id}", response_model=SessionResponse)
def get_session(session_id: str, x_session_credential: str | None = Header(default=None), db: Session = Depends(get_db)):
    return _response(SessionService(db, queue_store).status(session_id, x_session_credential))
