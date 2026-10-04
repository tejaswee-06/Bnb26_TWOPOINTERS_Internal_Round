from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.event import Event
from app.models.reservation import Reservation
from app.models.session import UserSession
from app.policy.service import PolicyService
from app.services.drop_service import DropService
from app.queue.store import QueueStore
from app.security.tokens import credential_hash, issue_admission_token, verify_credential


class SessionService:
    def __init__(self, db: Session, queue: QueueStore):
        self.db = db
        self.queue = queue

    def ensure_event(self, event_id: str, *, name: str | None = None, admission_limit: int | None = None) -> Event:
        event = self.db.get(Event, event_id)
        if event:
            return event
        event = Event(id=event_id, name=name or event_id, admission_limit=admission_limit or settings.admission_window)
        self.db.add(event)
        self.db.commit()
        return event

    def _expire_admissions(self, event_id: str) -> int:
        now = datetime.now(timezone.utc)
        expired = self.db.execute(
            select(UserSession).where(
                UserSession.event_id == event_id,
                UserSession.state.in_(["ADMITTED", "ALLOCATING"]),
                UserSession.admission_expires_at.is_not(None),
                UserSession.admission_expires_at <= now,
            )
        ).scalars().all()
        for session in expired:
            session.state = "QUEUED"
            session.token_version += 1
            session.admission_expires_at = None
            try:
                session.queue_sequence = self.queue.join(event_id, session.id, settings.session_ttl_seconds)
            except Exception:
                # DB remains authoritative; the next rebuild can restore Redis.
                pass
        if expired:
            self.db.commit()
        return len(expired)

    def authenticate(self, session_id: str, credential: str | None, *, user_id: str | None = None, event_id: str | None = None) -> UserSession | None:
        session = self.db.get(UserSession, session_id)
        if not session or not verify_credential(credential, session.credential_hash):
            return None
        if user_id is not None and session.user_id != user_id:
            return None
        if event_id is not None and session.event_id != event_id:
            return None
        return session

    def join(self, event_id: str, user_id: str, session_id: str | None = None, credential: str | None = None) -> tuple[UserSession, str | None]:
        event = self.ensure_event(event_id)
        if event.mode == "FAIR":
            DropService(self.db, self.queue).advance_if_due(event)
            event = self.db.get(Event, event_id)
        if session_id:
            existing = self.db.get(UserSession, session_id)
            if not existing:
                raise ValueError("session not found")
            if existing.event_id != event_id or existing.user_id != user_id:
                raise ValueError("session does not belong to this user/event")
            if not verify_credential(credential, existing.credential_hash):
                raise ValueError("valid session credential required")
            if existing.state in {"CREATED", "ACTIVE", "PREQUEUE", "QUEUED", "ADMITTED", "ALLOCATING", "COMPLETED"}:
                self.queue.set_session_hot(session_id, {"event_id": event_id, "user_id": user_id, "state": existing.state}, settings.session_ttl_seconds)
                return existing, None
            raise ValueError("completed/expired session cannot be reopened")

        if event.mode == "FAIR" and event.phase != "PRE_QUEUE_OPEN":
            raise ValueError("PRE_QUEUE_NOT_OPEN" if event.phase == "PREPARED" else "PRE_QUEUE_CLOSED")
        dup = self.db.execute(select(UserSession.id).where(UserSession.event_id == event_id, UserSession.user_id == user_id)).first()
        if dup:
            raise ValueError("DUPLICATE_SESSION: this account already has an entry for this event; resume it with its session credential")

        sid = uuid.uuid4().hex
        raw_credential = secrets.token_urlsafe(32)
        session = UserSession(id=sid, event_id=event_id, user_id=user_id, credential_hash=credential_hash(raw_credential), state="ACTIVE")
        self.db.add(session)
        try:
            self.db.flush()
        except IntegrityError:  # concurrent duplicate join for the same account
            self.db.rollback()
            raise ValueError("DUPLICATE_SESSION: this account already has an entry for this event; resume it with its session credential")
        if event.mode == "FAIR":
            session.state = "PREQUEUE"  # no queue position until the verifiable draw
            self.db.commit()
            self.queue.set_session_hot(sid, {"event_id": event_id, "user_id": user_id, "state": "PREQUEUE"}, settings.session_ttl_seconds)
            return session, raw_credential
        try:
            sequence = self.queue.join(event_id, sid, settings.session_ttl_seconds)
        except Exception:
            self.db.rollback()
            raise ValueError("queue service unavailable")
        session.state = "QUEUED"
        session.queue_sequence = sequence
        self.db.commit()
        self.queue.set_session_hot(sid, {"event_id": event_id, "user_id": user_id, "state": "QUEUED", "sequence": sequence}, settings.session_ttl_seconds)
        return session, raw_credential

    def status(self, session_id: str, credential: str | None = None) -> dict:
        session = self.db.get(UserSession, session_id)
        if not session:
            return {"found": False}
        if not verify_credential(credential, session.credential_hash):
            return {"found": False, "unauthorized": True}
        if session.state in {"ADMITTED", "ALLOCATING"}:
            self._expire_admissions(session.event_id)
            session = self.db.get(UserSession, session_id)
        position = self.queue.position(session.event_id, session.id) if session.state == "QUEUED" else None
        policy_action, _ = PolicyService(self.db, self.queue).effective(session.id)
        reservation = self.db.execute(select(Reservation).where(Reservation.session_id == session.id, Reservation.status.in_(["HELD", "CONFIRMED"]))).scalars().first()
        res = None
        if reservation:
            from app.models.inventory import Inventory
            inv = self.db.get(Inventory, reservation.inventory_id) if reservation.inventory_id else None
            res = {"reservation_id": reservation.id, "status": reservation.status, "held_until": reservation.held_until.isoformat() if reservation.held_until else None, "ticket_type": inv.ticket_type if inv else None, "item_code": inv.item_code if inv else None}
        return {
            "found": True,
            "session_id": session.id,
            "event_id": session.event_id,
            "user_id": session.user_id,
            "state": session.state,
            "position": position,
            "queue_depth": self.queue.depth(session.event_id),
            "admitted": session.state in {"ADMITTED", "ALLOCATING"},
            "admission_expires_at": session.admission_expires_at.isoformat() if session.admission_expires_at else None,
            "queue_sequence": session.queue_sequence,
            "policy_action": policy_action,
            "reservation": res,
        }

    def admit(self, session_id: str, credential: str | None = None) -> dict:
        session = self.authenticate(session_id, credential)
        if not session:
            return {"success": False, "status": "UNAUTHORIZED"}
        event = self.db.get(Event, session.event_id)
        if not event or event.status != "OPEN":
            return {"success": False, "status": "EVENT_CLOSED"}
        if event.mode == "FAIR":
            DropService(self.db, self.queue).advance_if_due(event)
            event = self.db.get(Event, event.id)
            if event.phase != "ADMITTING":
                return {"success": False, "status": "ADMISSION_NOT_OPEN", "phase": event.phase}
        self._expire_admissions(event.id)
        session = self.db.get(UserSession, session_id)
        # Deterministic policy gate (reads the stored decision; ML is never consulted here).
        blocked = PolicyService(self.db, self.queue).admit_gate(session)
        if blocked:
            return blocked
        session = self.db.get(UserSession, session_id)
        if session.state == "ADMITTED":
            token = issue_admission_token(event_id=event.id, session_id=session.id, user_id=session.user_id, version=session.token_version)
            return {"success": True, "status": "ADMITTED", "token": token, "admission_expires_at": session.admission_expires_at.isoformat() if session.admission_expires_at else None}
        if session.state != "QUEUED":
            return {"success": False, "status": session.state}
        position = self.queue.position(event.id, session.id)
        if position is None:
            return {"success": False, "status": "SESSION_NOT_QUEUED"}

        # Serialize admission decisions on the event row in PostgreSQL.
        locked_event = self.db.execute(select(Event).where(Event.id == event.id).with_for_update()).scalar_one()
        active_count = self.db.execute(
            select(func.count(UserSession.id)).where(
                UserSession.event_id == event.id,
                UserSession.state.in_(["ADMITTED", "ALLOCATING"]),
                UserSession.admission_expires_at.is_not(None),
                UserSession.admission_expires_at > datetime.now(timezone.utc),
            )
        ).scalar_one()
        if active_count >= locked_event.admission_limit:
            self.db.rollback()
            return {"success": False, "status": "ADMISSION_CAPACITY_FULL", "position": position, "admission_limit": locked_event.admission_limit}
        if position > locked_event.admission_limit:
            self.db.rollback()
            return {"success": False, "status": "QUEUED", "position": position, "admission_limit": locked_event.admission_limit}

        expires = datetime.now(timezone.utc) + timedelta(seconds=settings.admission_ttl_seconds)
        self.queue.mark_admitted(event.id, session.id, settings.session_ttl_seconds)
        session.state = "ADMITTED"
        session.token_version += 1
        session.admission_expires_at = expires
        self.db.commit()
        self.queue.set_session_hot(session.id, {"event_id": event.id, "user_id": session.user_id, "state": "ADMITTED"}, settings.session_ttl_seconds)
        token = issue_admission_token(event_id=event.id, session_id=session.id, user_id=session.user_id, version=session.token_version)
        return {"success": True, "status": "ADMITTED", "token": token, "position": position, "admission_limit": locked_event.admission_limit, "admission_expires_at": expires.isoformat()}
