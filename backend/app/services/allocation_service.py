from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.consumed_token import ConsumedAdmissionToken
from app.models.inventory import Inventory
from app.models.reservation import Reservation
from app.models.session import UserSession
from app.policy.service import PolicyService
from app.queue.store import QueueStore
from app.repositories.inventory_repository import InventoryRepository
from app.schemas.allocation import AllocationRequest, AllocationResponse, ConfirmRequest, HoldRequest, HoldResponse, ReleaseRequest, ReservationResponse
from app.security.tokens import TokenError, verify_admission_token
from app.telemetry import emit


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def fingerprint(operation: str, **data: object) -> str:
    body = {"operation": operation, **data}
    return hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


class AllocationService:
    def __init__(self, db: Session, queue: QueueStore | None = None):
        self.db = db
        self.queue = queue
        self.repository = InventoryRepository(db)

    def _existing_reservation(self, key: str) -> Reservation | None:
        return self.db.execute(select(Reservation).where(Reservation.idempotency_key == key)).scalar_one_or_none()

    def _authenticate_session(self, request: AllocationRequest | HoldRequest) -> UserSession | None:
        if not request.session_id:
            return None
        session = self.db.get(UserSession, request.session_id)
        if not session or session.user_id != request.user_id or session.event_id != request.event_id:
            return None
        from app.security.tokens import verify_credential
        if not verify_credential(request.session_credential, session.credential_hash):
            return None
        return session

    def _consume_admission_token(self, token: str, payload: dict) -> bool:
        now = datetime.now(timezone.utc)
        record = ConsumedAdmissionToken(
            jti=payload["jti"],
            event_id=payload["event_id"],
            session_id=payload["session_id"],
            expires_at=datetime.fromtimestamp(payload["exp"], timezone.utc),
        )
        self.db.add(record)
        try:
            self.db.flush()
            # Remove expired replay records opportunistically.
            self.db.query(ConsumedAdmissionToken).filter(ConsumedAdmissionToken.expires_at < now).delete(synchronize_session=False)
            return True
        except IntegrityError:
            self.db.rollback()
            return False

    def _authorize(self, request: AllocationRequest, *, existing: Reservation | None = None) -> tuple[bool, str | None, UserSession | None]:
        if request.session_id:
            session = self._authenticate_session(request)
            if not session:
                return False, "invalid session credential", None
        else:
            session = None
        if settings.allow_direct_allocation:
            return True, None, session
        if not request.session_id or not request.admission_token:
            return False, "Valid admission session and token are required", session
        try:
            payload = verify_admission_token(request.admission_token, event_id=request.event_id, session_id=request.session_id, user_id=request.user_id)
            if not session or session.state not in {"ADMITTED", "ALLOCATING"} or int(payload.get("ver", 0)) != session.token_version:
                return False, "admission token is no longer current", session
            if session.admission_expires_at and _as_utc(session.admission_expires_at) <= datetime.now(timezone.utc):
                return False, "admission expired", session
            if existing is None and not self._consume_admission_token(request.admission_token, payload):
                return False, "admission token has already been used", session
            return True, None, session
        except TokenError as exc:
            return False, str(exc), session

    def _validate_idempotency(self, existing: Reservation, request: HoldRequest) -> HoldResponse:
        fp = fingerprint("hold", event_id=request.event_id, user_id=request.user_id, session_id=request.session_id, ticket_type=request.ticket_type)
        if existing.request_fingerprint and existing.request_fingerprint != fp:
            return HoldResponse(success=False, status="IDEMPOTENCY_CONFLICT", reservation_id=existing.id, message="Idempotency key is already bound to a different request.")
        inventory = self.repository.get_by_id(existing.inventory_id)
        return HoldResponse(success=existing.status in {"HELD", "CONFIRMED"}, status=existing.status, reservation_id=existing.id, item_code=inventory.item_code if inventory else None, held_until=existing.held_until, ticket_type=inventory.ticket_type if inventory else None, message="Existing reservation returned idempotently.")

    def hold(self, request: HoldRequest) -> HoldResponse:
        existing = self._existing_reservation(request.idempotency_key)
        if existing:
            # Credential is still required when a session is supplied; replay does not consume the admission token again.
            if request.session_id and not self._authenticate_session(request):
                return HoldResponse(success=False, status="INVALID_SESSION", reservation_id=existing.id, message="Invalid session credential.")
            if existing.user_id != request.user_id or existing.event_id != request.event_id:
                return HoldResponse(success=False, status="IDEMPOTENCY_CONFLICT", reservation_id=existing.id, message="Idempotency key is already bound to another request.")
            return self._validate_idempotency(existing, request)

        if request.session_id:
            pre = self._authenticate_session(request)
            if pre:
                blocked = PolicyService(self.db, self.queue).allocation_block(pre.id, stage="hold")
                if blocked:  # checked BEFORE the admission token is consumed so a challenged user keeps a usable token
                    return HoldResponse(success=False, status=blocked[0], message=blocked[1])

        authorized, reason, session = self._authorize(request)
        if not authorized:
            return HoldResponse(success=False, status="ADMISSION_REQUIRED", message=reason or "Admission required")

        if session:
            prior = self.db.execute(select(Reservation).where(Reservation.session_id == request.session_id, Reservation.status.in_(["HELD", "CONFIRMED"]))).scalar_one_or_none()
            if prior:
                inventory = self.repository.get_by_id(prior.inventory_id)
                return HoldResponse(success=True, status=prior.status, reservation_id=prior.id, item_code=inventory.item_code if inventory else None, held_until=prior.held_until, ticket_type=inventory.ticket_type if inventory else None, message="Session already has an active allocation.")

        self.repository.expire_due_holds(request.event_id)
        self.db.commit()
        fp = fingerprint("hold", event_id=request.event_id, user_id=request.user_id, session_id=request.session_id, ticket_type=request.ticket_type)

        for _ in range(max(1, settings.allocation_retry_attempts)):
            held_until = datetime.now(timezone.utc) + timedelta(seconds=settings.hold_seconds)
            reservation = Reservation(event_id=request.event_id, inventory_id=None, session_id=request.session_id, user_id=request.user_id, idempotency_key=request.idempotency_key, request_fingerprint=fp, status="HELD", held_until=held_until)
            self.db.add(reservation)
            try:
                self.db.flush()
                claimed = self.repository.claim_available(request.event_id, request.user_id, reservation.id, held_until, request.ticket_type)
                if claimed != 1:
                    self.db.rollback()
                    return HoldResponse(success=False, status="SOLD_OUT", message="No inventory is currently available.")
                inventory = self.db.execute(select(Inventory).where(Inventory.reservation_id == reservation.id)).scalar_one()
                reservation.inventory_id = inventory.id
                if session:
                    session.state = "ALLOCATING"
                    session.admission_expires_at = held_until + timedelta(seconds=30)
                emit(self.db, "RESERVATION_HELD", event_id=request.event_id, session_id=request.session_id, reservation_id=reservation.id, allocation_id=reservation.id, user_id=request.user_id, idempotency_key=request.idempotency_key, payload={"reservation_id": reservation.id, "inventory_id": inventory.id}, commit=False)
                self.db.commit()
                return HoldResponse(success=True, status="HELD", reservation_id=reservation.id, item_code=inventory.item_code, held_until=held_until, ticket_type=inventory.ticket_type, message="Inventory held successfully.")
            except IntegrityError:
                self.db.rollback()
                existing = self._existing_reservation(request.idempotency_key)
                if existing:
                    if existing.user_id != request.user_id or existing.event_id != request.event_id:
                        return HoldResponse(success=False, status="IDEMPOTENCY_CONFLICT", reservation_id=existing.id, message="Idempotency key conflict")
                    return self._validate_idempotency(existing, request)
        return HoldResponse(success=False, status="SOLD_OUT", message="No inventory is currently available.")

    def _auth_reservation(self, reservation: Reservation, request: ConfirmRequest | ReleaseRequest) -> UserSession | None:
        if reservation.user_id != request.user_id:
            return None
        if reservation.session_id:
            if request.session_id != reservation.session_id:
                return None
            session = self.db.get(UserSession, reservation.session_id)
            from app.security.tokens import verify_credential
            if not session or not verify_credential(request.session_credential, session.credential_hash):
                return None
            return session
        return None

    def confirm(self, request: ConfirmRequest) -> ReservationResponse:
        reservation = self.db.get(Reservation, request.reservation_id)
        if reservation is None:
            return ReservationResponse(success=False, status="NOT_FOUND", reservation_id=request.reservation_id, item_code="", message="Reservation not found.")
        session = self._auth_reservation(reservation, request)
        if reservation.session_id and not session:
            return ReservationResponse(success=False, status="FORBIDDEN", reservation_id=reservation.id, item_code="", message="Valid session credential required.")
        if session:
            blocked = PolicyService(self.db, self.queue).allocation_block(session.id, stage="confirm")
            if blocked:  # the hold stays and simply expires; policy never rewrites inventory state directly
                return ReservationResponse(success=False, status=blocked[0], reservation_id=reservation.id, item_code="", message=blocked[1])
        inventory = self.repository.get_by_id(reservation.inventory_id)
        if inventory is None:
            return ReservationResponse(success=False, status="INTEGRITY_ERROR", reservation_id=reservation.id, item_code="", message="Inventory record not found.")
        if reservation.status == "CONFIRMED":
            return ReservationResponse(success=True, status="CONFIRMED", reservation_id=reservation.id, item_code=inventory.item_code, message="Already confirmed.")
        if reservation.status != "HELD":
            return ReservationResponse(success=False, status=reservation.status, reservation_id=reservation.id, item_code=inventory.item_code, message="Reservation cannot be confirmed.")
        now = datetime.now(timezone.utc)
        if reservation.held_until and _as_utc(reservation.held_until) <= now:
            self.repository.expire_due_holds(reservation.event_id)
            self.db.commit()
            return ReservationResponse(success=False, status="EXPIRED", reservation_id=reservation.id, item_code=inventory.item_code, message="Reservation expired.")
        changed = self.db.execute(update(Reservation).where(Reservation.id == reservation.id, Reservation.status == "HELD").values(status="CONFIRMED", confirmed_at=now)).rowcount or 0
        if changed != 1:
            self.db.rollback()
            fresh = self.db.get(Reservation, reservation.id)
            status = fresh.status if fresh else "NOT_FOUND"
            return ReservationResponse(success=status == "CONFIRMED", status=status, reservation_id=reservation.id, item_code=inventory.item_code, message="Reservation state changed concurrently.")
        inv_changed = self.db.execute(update(Inventory).where(Inventory.id == inventory.id, Inventory.status == "HELD", Inventory.reservation_id == reservation.id).values(status="CONFIRMED", confirmed_at=now, held_until=None)).rowcount or 0
        if inv_changed != 1:
            self.db.rollback()
            return ReservationResponse(success=False, status="INTEGRITY_ERROR", reservation_id=reservation.id, item_code=inventory.item_code, message="Atomic inventory confirmation failed.")
        if session:
            session.state = "COMPLETED"
            session.admission_expires_at = None
        emit(self.db, "RESERVATION_CONFIRMED", event_id=reservation.event_id, session_id=reservation.session_id, reservation_id=reservation.id, allocation_id=reservation.id, user_id=reservation.user_id, idempotency_key=reservation.idempotency_key, payload={"reservation_id": reservation.id, "inventory_id": inventory.id}, commit=False)
        self.db.commit()
        return ReservationResponse(success=True, status="CONFIRMED", reservation_id=reservation.id, item_code=inventory.item_code, message="Allocation confirmed.")

    def release(self, request: ReleaseRequest) -> ReservationResponse:
        reservation = self.db.get(Reservation, request.reservation_id)
        if reservation is None:
            return ReservationResponse(success=False, status="NOT_FOUND", reservation_id=request.reservation_id, item_code="", message="Reservation not found.")
        session = self._auth_reservation(reservation, request)
        if reservation.session_id and not session:
            return ReservationResponse(success=False, status="FORBIDDEN", reservation_id=reservation.id, item_code="", message="Valid session credential required.")
        inventory = self.repository.get_by_id(reservation.inventory_id)
        if inventory is None:
            return ReservationResponse(success=False, status="INTEGRITY_ERROR", reservation_id=reservation.id, item_code="", message="Inventory record not found.")
        if reservation.status in {"RELEASED", "EXPIRED", "CANCELLED"}:
            return ReservationResponse(success=True, status=reservation.status, reservation_id=reservation.id, item_code=inventory.item_code, message="Reservation already released.")
        if reservation.status == "CONFIRMED":
            return ReservationResponse(success=False, status="CONFIRMED", reservation_id=reservation.id, item_code=inventory.item_code, message="Confirmed allocation cannot be released.")
        changed = self.db.execute(update(Reservation).where(Reservation.id == reservation.id, Reservation.status == "HELD").values(status="CANCELLED", released_at=datetime.now(timezone.utc))).rowcount or 0
        if changed != 1:
            self.db.rollback()
            fresh = self.db.get(Reservation, reservation.id)
            status = fresh.status if fresh else "NOT_FOUND"
            return ReservationResponse(success=status in {"CANCELLED", "RELEASED", "EXPIRED"}, status=status, reservation_id=reservation.id, item_code=inventory.item_code, message="Reservation state changed concurrently.")
        self.db.execute(update(Inventory).where(Inventory.id == inventory.id, Inventory.status == "HELD", Inventory.reservation_id == reservation.id).values(status="AVAILABLE", holder_id=None, reservation_id=None, held_until=None))
        if session:
            session.state = "ADMITTED"
            session.token_version += 1
            session.admission_expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.admission_ttl_seconds)
        emit(self.db, "RESERVATION_RELEASED", event_id=reservation.event_id, session_id=reservation.session_id, reservation_id=reservation.id, allocation_id=reservation.id, user_id=reservation.user_id, idempotency_key=reservation.idempotency_key, payload={"reservation_id": reservation.id, "inventory_id": inventory.id}, commit=False)
        self.db.commit()
        return ReservationResponse(success=True, status="CANCELLED", reservation_id=reservation.id, item_code=inventory.item_code, message="Reservation released.")

    def allocate_direct(self, request: AllocationRequest) -> AllocationResponse:
        hold = self.hold(HoldRequest(**request.model_dump()))
        if not hold.success:
            return AllocationResponse(success=False, status=hold.status, allocation_id=hold.reservation_id, item_code=hold.item_code, message=hold.message)
        confirmed = self.confirm(ConfirmRequest(reservation_id=hold.reservation_id, user_id=request.user_id, session_id=request.session_id, session_credential=request.session_credential))
        if not confirmed.success and confirmed.status != "CONFIRMED":
            return AllocationResponse(success=False, status=confirmed.status, allocation_id=confirmed.reservation_id, item_code=confirmed.item_code, message=confirmed.message)
        return AllocationResponse(success=True, status=confirmed.status, allocation_id=confirmed.reservation_id, item_code=confirmed.item_code, message=confirmed.message)
