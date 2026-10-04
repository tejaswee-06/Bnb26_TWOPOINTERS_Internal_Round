from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.sessions import queue_store
from app.core.config import settings
from app.db.database import get_db
from app.resilience import resilience
from app.schemas.allocation import AllocationRequest, AllocationResponse, ConfirmRequest, HoldRequest, HoldResponse, ReleaseRequest, ReservationResponse
from app.services.allocation_service import AllocationService

router = APIRouter(tags=["Allocation"])


def _guard(endpoint: str, key: str) -> None:
    if not resilience.allow(endpoint):
        raise HTTPException(status_code=503, detail={"status": "PROTECTIVE", "message": "Service is protecting critical capacity", "retry_after_seconds": 2})
    allowed, remaining = queue_store.rate_limit(key, settings.mutation_rate_limit_requests, settings.mutation_rate_limit_window_seconds)
    if not allowed:
        raise HTTPException(status_code=429, detail={"message": "Mutation rate limit exceeded", "remaining": remaining})


@router.post("/allocation", response_model=AllocationResponse)
def allocate(request: AllocationRequest, db: Session = Depends(get_db)) -> AllocationResponse:
    _guard("allocation", f"allocation:{request.event_id}:{request.user_id}")
    return AllocationService(db, queue_store).allocate_direct(request)


@router.post("/allocation/hold", response_model=HoldResponse)
@router.post("/reservations", response_model=HoldResponse)
def hold(request: HoldRequest, db: Session = Depends(get_db)) -> HoldResponse:
    _guard("allocation", f"hold:{request.event_id}:{request.user_id}")
    return AllocationService(db, queue_store).hold(request)


@router.post("/allocation/confirm", response_model=ReservationResponse)
def confirm(request: ConfirmRequest, db: Session = Depends(get_db)) -> ReservationResponse:
    _guard("confirm", f"confirm:{request.reservation_id}:{request.user_id}")
    return AllocationService(db, queue_store).confirm(request)


@router.post("/allocation/release", response_model=ReservationResponse)
def release(request: ReleaseRequest, db: Session = Depends(get_db)) -> ReservationResponse:
    _guard("release", f"release:{request.reservation_id}:{request.user_id}")
    return AllocationService(db, queue_store).release(request)


@router.post("/reservations/{reservation_id}/confirm", response_model=ReservationResponse)
def confirm_reservation(reservation_id: int, request: ConfirmRequest, db: Session = Depends(get_db)) -> ReservationResponse:
    request.reservation_id = reservation_id
    _guard("confirm", f"confirm:{reservation_id}:{request.user_id}")
    return AllocationService(db, queue_store).confirm(request)


@router.post("/reservations/{reservation_id}/release", response_model=ReservationResponse)
def release_reservation(reservation_id: int, request: ReleaseRequest, db: Session = Depends(get_db)) -> ReservationResponse:
    request.reservation_id = reservation_id
    _guard("release", f"release:{reservation_id}:{request.user_id}")
    return AllocationService(db, queue_store).release(request)
