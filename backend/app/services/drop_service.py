"""Fair pre-queue lifecycle for events with mode=FAIR (Master PDF: fair pre-queue -> controlled admission).

PREPARED -> PRE_QUEUE_OPEN -> PRE_QUEUE_CLOSED -> RANDOMIZED -> ADMITTING <-> PAUSED -> ENDED

* Arrival time inside the window is irrelevant: sessions are held in state PREQUEUE (no queue position).
* At randomisation every PREQUEUE session enters one verifiable draw (commit-reveal); ranks are written to the DB (authoritative)
  and then to the queue store. Policy never alters the draw; it only gates admission afterwards (see PolicyService).
* Admission itself stays in SessionService.admit (window enforced with a row lock, signed one-time tokens).
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.fairness import ALGORITHM, commitment_of, deterministic_shuffle, root_of, shuffle_seed
from app.models.event import Event
from app.models.inventory import Inventory
from app.models.session import UserSession
from app.queue.store import QueueStore
from app.telemetry import emit

PHASES = ("PREPARED", "PRE_QUEUE_OPEN", "PRE_QUEUE_CLOSED", "RANDOMIZED", "ADMITTING", "PAUSED", "ENDED")


class DropError(ValueError):
    pass


def _utc(v: datetime | None) -> datetime | None:
    if v is None:
        return None
    return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v.astimezone(timezone.utc)


class DropService:
    def __init__(self, db: Session, queue: QueueStore):
        self.db, self.queue = db, queue

    # ------------------------------------------------------------------ helpers
    def _locked(self, event_id: str) -> Event:
        event = self.db.execute(select(Event).where(Event.id == event_id).with_for_update().execution_options(populate_existing=True)).scalar_one_or_none()
        if not event:
            raise DropError("EVENT_NOT_FOUND")
        if event.mode != "FAIR":
            raise DropError("EVENT_NOT_FAIR_MODE")
        return event

    def _cas(self, event_id: str, allowed_from: set[str], to: str, err: str) -> Event:
        """Atomic compare-and-set phase transition: exactly one concurrent caller wins (works on SQLite and PostgreSQL)."""
        changed = self.db.execute(update(Event).where(Event.id == event_id, Event.phase.in_(allowed_from)).values(phase=to)).rowcount or 0
        if changed != 1:
            self.db.rollback()
            raise DropError(err)
        return self.db.execute(select(Event).where(Event.id == event_id).execution_options(populate_existing=True)).scalar_one()

    def advance_if_due(self, event: Event) -> None:
        """Lazy autopilot: when the pre-queue deadline has passed, close -> randomise -> admit (if auto_advance)."""
        if event.mode != "FAIR" or event.phase != "PRE_QUEUE_OPEN" or not event.auto_advance:
            return
        closes = _utc(event.prequeue_closes_at)
        if closes and datetime.now(timezone.utc) >= closes:
            try:
                self.close(event.id, _auto=True)
                self.randomize(event.id, _auto=True)
                self.start_admission(event.id, _auto=True)
            except DropError:
                self.db.rollback()  # another worker advanced it first

    # ------------------------------------------------------------------ operator actions
    def open(self, event_id: str, seconds: int) -> Event:
        self._locked(event_id)
        event = self._cas(event_id, {"PREPARED"}, "PRE_QUEUE_OPEN", "ALREADY_OPENED")
        seed = secrets.token_hex(32)
        now = datetime.now(timezone.utc)
        event.server_seed, event.commitment, event.seed_revealed = seed, commitment_of(seed), False
        event.prequeue_seconds, event.prequeue_opens_at, event.prequeue_closes_at = seconds, now, now + timedelta(seconds=seconds)
        emit(self.db, "DROP_PREQUEUE_OPENED", event_id=event_id, payload={"commitment": event.commitment, "seconds": seconds}, commit=False)
        self.db.commit()
        return event

    def close(self, event_id: str, _auto: bool = False) -> Event:
        self._locked(event_id)
        event = self._cas(event_id, {"PRE_QUEUE_OPEN"}, "PRE_QUEUE_CLOSED", "NOT_OPEN")
        emit(self.db, "DROP_PREQUEUE_CLOSED", event_id=event_id, payload={"auto": _auto}, commit=False)
        self.db.commit()
        return event

    def randomize(self, event_id: str, _auto: bool = False) -> Event:
        self._locked(event_id)
        event = self._cas(event_id, {"PRE_QUEUE_CLOSED"}, "RANDOMIZED", "NOT_CLOSED")
        ids = sorted(self.db.execute(select(UserSession.id).where(UserSession.event_id == event_id, UserSession.state == "PREQUEUE")).scalars().all())
        root = root_of(ids)
        sseed = shuffle_seed(event.server_seed, root)
        order = deterministic_shuffle(ids, sseed)
        rank = {sid: i + 1 for i, sid in enumerate(order)}
        for s in self.db.execute(select(UserSession).where(UserSession.event_id == event_id, UserSession.state == "PREQUEUE")).scalars():
            s.state, s.queue_sequence = "QUEUED", rank[s.id]
        event.eligible_root, event.eligible_count, event.shuffle_seed = root, len(ids), sseed
        event.seed_revealed, event.randomized_at = True, datetime.now(timezone.utc)
        emit(self.db, "DROP_RANDOMIZED", event_id=event_id, payload={"commitment": event.commitment, "eligible_root": root, "eligible_count": len(ids), "shuffle_seed": sseed, "auto": _auto}, commit=False)
        self.db.commit()
        # DB is authoritative; mirror ranks into the hot queue (PolicyService.reconcile_queue parks policy-blocked sessions out of it).
        self._seed_queue(event_id)
        return event

    def _seed_queue(self, event_id: str) -> None:
        from app.policy.service import PolicyService
        policy = PolicyService(self.db, self.queue)
        rows = self.db.execute(select(UserSession.event_id, UserSession.id, UserSession.state, UserSession.queue_sequence).where(UserSession.event_id == event_id, UserSession.state == "QUEUED")).all()
        blocked = {sid for _, sid, _, _ in rows if policy.effective(sid)[0] in {"CHALLENGE", "QUARANTINE", "REJECT"}}  # parked until policy clears
        self.queue.rebuild_from_sessions([tuple(r) for r in rows if r[1] not in blocked])

    def start_admission(self, event_id: str, _auto: bool = False) -> Event:
        self._locked(event_id)
        event = self._cas(event_id, {"RANDOMIZED", "PAUSED"}, "ADMITTING", "RANDOMIZE_FIRST")
        emit(self.db, "DROP_ADMISSION_STARTED", event_id=event_id, payload={"auto": _auto}, commit=False)
        self.db.commit()
        return event

    def pause(self, event_id: str) -> Event:
        self._locked(event_id)
        event = self._cas(event_id, {"ADMITTING"}, "PAUSED", "NOT_ADMITTING")
        emit(self.db, "DROP_ADMISSION_PAUSED", event_id=event_id, commit=False)
        self.db.commit()
        return event

    def end(self, event_id: str) -> Event:
        self._locked(event_id)
        event = self._cas(event_id, {"PRE_QUEUE_OPEN", "PRE_QUEUE_CLOSED", "RANDOMIZED", "ADMITTING", "PAUSED"}, "ENDED", "NOTHING_TO_END")
        emit(self.db, "DROP_ENDED", event_id=event_id, commit=False)
        self.db.commit()
        return event

    # ------------------------------------------------------------------ read models
    def inventory_summary(self, event_id: str) -> dict:
        rows = self.db.execute(select(Inventory.ticket_type, Inventory.status, func.count(Inventory.id)).where(Inventory.event_id == event_id).group_by(Inventory.ticket_type, Inventory.status)).all()
        by_type: dict[str, dict[str, int]] = {}
        total = {"total": 0, "available": 0, "held": 0, "confirmed": 0}
        for ttype, status, n in rows:
            key = ttype or "default"
            bt = by_type.setdefault(key, {"total": 0, "available": 0, "held": 0, "confirmed": 0})
            bt["total"] += n; total["total"] += n
            bt[status.lower()] = bt.get(status.lower(), 0) + n
            total[status.lower()] = total.get(status.lower(), 0) + n
        return {**total, "by_type": by_type, "invariant_ok": total["available"] + total["held"] + total["confirmed"] == total["total"]}

    def info(self, event: Event) -> dict:
        now = datetime.now(timezone.utc)
        closes = _utc(event.prequeue_closes_at)
        left = max(0, int((closes - now).total_seconds())) if event.phase == "PRE_QUEUE_OPEN" and closes else 0
        joined = self.db.execute(select(func.count(UserSession.id)).where(UserSession.event_id == event.id)).scalar_one()
        return {
            "event_id": event.id, "name": event.name, "mode": event.mode, "phase": event.phase, "server_time": now.timestamp(),
            "prequeue_seconds": event.prequeue_seconds, "seconds_left": left, "joined": joined, "eligible_count": event.eligible_count,
            "queue_depth": self.queue.depth(event.id), "admission_limit": event.admission_limit, "commitment": event.commitment,
            "proof_revealed": event.seed_revealed, "inventory": self.inventory_summary(event.id),
        }

    def proof(self, event: Event) -> dict:
        if not event.seed_revealed:
            raise DropError("PROOF_NOT_REVEALED")
        ids = sorted(self.db.execute(select(UserSession.id).where(UserSession.event_id == event.id, UserSession.queue_sequence.is_not(None))).scalars().all())
        return {"event_id": event.id, "commitment": event.commitment, "serverSeed": event.server_seed, "eligibleRoot": event.eligible_root, "eligibleCount": event.eligible_count,
                "algorithm": ALGORITHM, "shuffleSeed": event.shuffle_seed, "guidedLane": [], "eligible": ids}
