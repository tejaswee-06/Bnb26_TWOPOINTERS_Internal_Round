"""Persistence + enforcement helpers around the pure policy engine.

Flow: RiskEvent -> evaluate (pure) -> PolicyDecision row (explainable) -> enforcement reads the latest *stored*
decision at admit / hold / confirm time. ML (Person 2) only supplies evidence; it never reaches inventory or queue.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.policy_decision import PolicyDecision
from app.models.session import UserSession
from app.policy.engine import SEVERITY, History, PolicyConfig, evaluate_risk_event
from app.queue.store import QueueStore
from app.telemetry import emit

_DASHED_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def normalize_session_id(session_id: str) -> str:
    """Person 2 emits dashed UUIDs; Person 1 stores the 32-char hex form. Same identifier, canonical hex form."""
    s = session_id.strip()
    return s.replace("-", "").lower() if _DASHED_UUID.match(s) else s


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def decision_to_dict(d: PolicyDecision) -> dict[str, Any]:
    return {
        "decision_id": d.id, "session_id": d.session_id, "ticket_event_id": d.ticket_event_id, "session_known": d.session_known,
        "risk_event_id": d.risk_event_id, "source": d.source, "action": d.action, "reason": d.reason, "rules_fired": d.rules_fired,
        "evidence": d.evidence, "risk_score": d.risk_score, "anomaly_score": d.anomaly_score, "coordination_score": d.coordination_score,
        "campaign_id": d.campaign_id, "attack_type": d.attack_type, "model_version": d.model_version, "policy_version": d.policy_version,
        "risk_event_timestamp": d.risk_event_timestamp.isoformat() if d.risk_event_timestamp else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "expires_at": d.expires_at.isoformat() if d.expires_at else None,
    }


class PolicyService:
    def __init__(self, db: Session, queue: QueueStore | None = None, config: PolicyConfig | None = None):
        self.db = db
        self.queue = queue
        self.cfg = config or PolicyConfig.from_settings()

    # ---------------------------------------------------------------- ingestion
    def _history(self, session_id: str, campaign_id: str | None, current_risk_event_id: str) -> History:
        prior = self.db.execute(select(PolicyDecision).where(PolicyDecision.session_id == session_id, PolicyDecision.source == "ml", PolicyDecision.risk_event_id != current_risk_event_id)).scalars().all()
        risks = [d.risk_score for d in prior if d.risk_score is not None]
        anoms = [d.anomaly_score for d in prior if d.anomaly_score is not None]
        coord_events = sum(1 for d in prior if d.coordination_score is not None and d.coordination_score >= self.cfg.coordination_threshold)
        campaign_sessions = 0
        if campaign_id:
            rows = self.db.execute(select(PolicyDecision.session_id).where(PolicyDecision.campaign_id == campaign_id, PolicyDecision.source == "ml", PolicyDecision.severity > 0, PolicyDecision.session_id != session_id).distinct()).all()
            campaign_sessions = len(rows)
        return History(max(risks) if risks else None, max(anoms) if anoms else None, coord_events, campaign_sessions)

    def ingest(self, event) -> dict[str, Any]:
        """Evaluate one RiskEvent and persist the decision. Idempotent on (session_id, event.event_id)."""
        sid = normalize_session_id(event.session_id)
        existing = self.db.execute(select(PolicyDecision).where(PolicyDecision.session_id == sid, PolicyDecision.risk_event_id == event.event_id, PolicyDecision.source == "ml")).scalar_one_or_none()
        if existing:
            return {"accepted": True, "duplicate": True, "decision": decision_to_dict(existing)}
        session = self.db.get(UserSession, sid)
        history = self._history(sid, event.campaign_id, event.event_id)
        payload = event.model_dump(mode="json")
        outcome = evaluate_risk_event(payload, history, self.cfg)
        ttl = self.cfg.ttl_seconds(outcome.action)
        now = datetime.now(timezone.utc)
        row = PolicyDecision(
            session_id=sid, ticket_event_id=session.event_id if session else None, session_known=session is not None,
            risk_event_id=event.event_id, source="ml", action=outcome.action, severity=SEVERITY[outcome.action], reason=outcome.reason[:500],
            rules_fired=outcome.rules_fired, evidence=list(event.evidence), risk_score=event.risk_score, anomaly_score=event.anomaly_score,
            coordination_score=event.coordination_score, campaign_id=event.campaign_id, attack_type=event.attack_type,
            model_version=event.model_version, policy_version=self.cfg.version, risk_event_timestamp=event.timestamp,
            expires_at=(now + timedelta(seconds=ttl)) if ttl else None,
        )
        self.db.add(row)
        try:
            self.db.flush()
        except IntegrityError:
            self.db.rollback()
            dup = self.db.execute(select(PolicyDecision).where(PolicyDecision.session_id == sid, PolicyDecision.risk_event_id == event.event_id, PolicyDecision.source == "ml")).scalar_one()
            return {"accepted": True, "duplicate": True, "decision": decision_to_dict(dup)}
        emit(self.db, "POLICY_DECISION", event_id=session.event_id if session else None, session_id=sid,
             payload={"decision_id": row.id, "risk_event_id": event.event_id, "action": row.action, "reason": row.reason, "rules_fired": row.rules_fired,
                      "evidence": row.evidence, "policy_version": row.policy_version, "model_version": event.model_version, "campaign_id": event.campaign_id},
             commit=False)
        applied = self._apply(session, row) if session else []
        self.db.commit()
        return {"accepted": True, "duplicate": False, "session_known": session is not None, "applied": applied, "decision": decision_to_dict(row)}

    def _apply(self, session: UserSession, decision: PolicyDecision) -> list[str]:
        """Side effects of a severe decision. Only policy (never ML) changes admission state."""
        applied: list[str] = []
        if decision.action not in {"CHALLENGE", "QUARANTINE", "REJECT"}:  # THROTTLE only slows admission attempts; it never moves the session
            return applied
        if decision.severity >= SEVERITY["QUARANTINE"] and session.state == "ADMITTED":
            session.token_version += 1  # outstanding admission token is no longer current
            session.admission_expires_at = datetime.now(timezone.utc)
            session.state = "QUEUED"
            applied.append("admission_token_revoked")
        if session.state == "QUEUED" and self.queue is not None:
            try:
                self.queue.remove(session.event_id, session.id)  # parked: frees window slots for others; original rank is restored on recovery
                applied.append("removed_from_admission_queue")
            except Exception:
                pass  # DB stays authoritative; admit() is policy-gated regardless of queue membership
        return applied

    # ---------------------------------------------------------------- reading effective state
    def effective(self, session_id: str) -> tuple[str, PolicyDecision | None]:
        now = datetime.now(timezone.utc)
        rows = self.db.execute(select(PolicyDecision).where(PolicyDecision.session_id == session_id).order_by(PolicyDecision.id)).scalars().all()
        live = [d for d in rows if d.expires_at is None or _utc(d.expires_at) > now]
        last_pass = max((d.id for d in live if d.source == "challenge"), default=0)
        active = [d for d in live if d.source == "ml" and d.severity > 0 and not (d.action == "CHALLENGE" and d.id < last_pass)]
        if not active:
            return "NORMAL", None
        top = max(active, key=lambda d: (d.severity, d.id))
        return top.action, top

    def reconcile_queue(self, session: UserSession) -> None:
        """After a CHALLENGE/QUARANTINE/REJECT decision cleared or decayed, put the (still QUEUED) session back at its ORIGINAL rank."""
        if session.state != "QUEUED" or self.queue is None or self.queue.position(session.event_id, session.id) is not None:
            return
        was_removed = self.db.execute(select(PolicyDecision.id).where(PolicyDecision.session_id == session.id, PolicyDecision.action.in_(["CHALLENGE", "QUARANTINE", "REJECT"])).limit(1)).first()
        if was_removed:
            if session.queue_sequence is not None:
                self.queue.rebuild_from_sessions([(session.event_id, session.id, "QUEUED", session.queue_sequence)])  # same rank: policy delays, it does not demote
            else:
                session.queue_sequence = self.queue.join(session.event_id, session.id, settings.session_ttl_seconds)
                self.db.commit()

    def admit_gate(self, session: UserSession) -> dict[str, Any] | None:
        """Return an admit-response dict when policy blocks/defers admission, else None."""
        action, d = self.effective(session.id)
        if action == "NORMAL":
            self.reconcile_queue(session)
            return None
        info = {"policy_action": action, "policy_reason": d.reason if d else None}
        if action == "REJECT":
            return {"success": False, "status": "REJECTED", **info}
        if action == "QUARANTINE":
            return {"success": False, "status": "QUARANTINED", **info}
        if action == "CHALLENGE":
            return {"success": False, "status": "CHALLENGE_REQUIRED", "challenge_url": f"/policy/challenge/{session.id}", **info}
        if action == "THROTTLE" and self.queue is not None:
            interval = max(1, settings.policy_throttle_admit_interval_seconds)
            allowed, _ = self.queue.rate_limit(f"policy-throttle:{session.id}", 1, interval)
            if not allowed:
                return {"success": False, "status": "THROTTLED", "retry_after_seconds": interval, **info}
        return None

    def allocation_block(self, session_id: str, *, stage: str) -> tuple[str, str] | None:
        """(status, message) if policy forbids this allocation step. stage: hold | confirm."""
        action, d = self.effective(session_id)
        reason = d.reason if d else ""
        if action in {"QUARANTINE", "REJECT"}:
            return "POLICY_BLOCKED", f"Blocked by policy ({action}): {reason}"
        if action == "CHALLENGE" and stage == "hold":
            return "CHALLENGE_REQUIRED", f"Challenge required before allocation: {reason}"
        return None

    # ---------------------------------------------------------------- challenge (proof-of-work speed bump)
    @staticmethod
    def _sign(body: str) -> str:
        return base64.urlsafe_b64encode(hmac.new(settings.hmac_secret.encode(), body.encode(), hashlib.sha256).digest()).decode().rstrip("=")

    def issue_challenge(self, session_id: str) -> dict[str, Any]:
        payload = {"sid": session_id, "nonce": hashlib.sha256(f"{session_id}{time.time_ns()}".encode()).hexdigest()[:24], "bits": settings.policy_challenge_difficulty_bits, "exp": int(time.time()) + settings.policy_challenge_ttl_seconds}
        body = base64.urlsafe_b64encode(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).decode().rstrip("=")
        return {"challenge": f"{body}.{self._sign(body)}", "algorithm": "sha256(challenge + ':' + solution) has >= difficulty_bits leading zero bits", "difficulty_bits": payload["bits"], "expires_at": payload["exp"]}

    @staticmethod
    def _leading_zero_bits(digest: bytes) -> int:
        n = int.from_bytes(digest, "big")
        return len(digest) * 8 - n.bit_length()

    def solve_challenge(self, session_id: str, challenge: str, solution: str) -> dict[str, Any]:
        try:
            body, sig = challenge.split(".", 1)
            if not hmac.compare_digest(sig, self._sign(body)):
                return {"success": False, "status": "INVALID_CHALLENGE"}
            payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        except Exception:
            return {"success": False, "status": "INVALID_CHALLENGE"}
        if payload.get("sid") != session_id:
            return {"success": False, "status": "INVALID_CHALLENGE"}
        if int(payload.get("exp", 0)) < time.time():
            return {"success": False, "status": "CHALLENGE_EXPIRED"}
        if self._leading_zero_bits(hashlib.sha256(f"{challenge}:{solution}".encode()).digest()) < int(payload["bits"]):
            return {"success": False, "status": "WRONG_SOLUTION"}
        action, _ = self.effective(session_id)
        if action in {"THROTTLE", "QUARANTINE", "REJECT"}:
            return {"success": False, "status": "CHALLENGE_NOT_APPLICABLE", "policy_action": action}
        session = self.db.get(UserSession, session_id)
        row = PolicyDecision(session_id=session_id, ticket_event_id=session.event_id if session else None, session_known=session is not None,
                             risk_event_id=payload["nonce"], source="challenge", action="NORMAL", severity=0, reason="challenge solved; CHALLENGE-level decisions cleared",
                             rules_fired=["CHALLENGE_PASSED"], evidence=[], policy_version=self.cfg.version,
                             expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.policy_ttl_challenge_seconds))
        self.db.add(row)
        try:
            self.db.flush()
        except IntegrityError:
            self.db.rollback()
            return {"success": False, "status": "CHALLENGE_ALREADY_USED"}
        emit(self.db, "POLICY_CHALLENGE_PASSED", event_id=row.ticket_event_id, session_id=session_id, payload={"decision_id": row.id, "policy_version": self.cfg.version}, commit=False)
        self.db.commit()
        return {"success": True, "status": "CHALLENGE_PASSED", "decision_id": row.id}

    # ---------------------------------------------------------------- Person 2 ML service (optional, pull)
    @staticmethod
    def ml_status() -> dict[str, Any]:
        if not settings.ml_api_url:
            return {"ml_configured": False, "ml_available": False, "detail": "ML_API_URL not set; backend runs on deterministic rules only"}
        try:
            with urllib.request.urlopen(settings.ml_api_url.rstrip("/") + "/", timeout=settings.ml_api_timeout_seconds) as r:  # noqa: S310
                return {"ml_configured": True, "ml_available": 200 <= r.status < 300}
        except Exception as exc:
            return {"ml_configured": True, "ml_available": False, "detail": f"{type(exc).__name__}"}

    def sync_from_ml(self) -> dict[str, Any]:
        """Pull P2 RiskEvents and ingest them. If ML is down: report it, ingest nothing, invent nothing."""
        from app.schemas.integration import RiskEvent

        status = self.ml_status()
        if not status.get("ml_available"):
            return {**status, "ingested": 0, "duplicates": 0, "rejected": 0, "skipped_no_live_session": 0}
        try:
            with urllib.request.urlopen(settings.ml_api_url.rstrip("/") + "/ml/risk-events", timeout=settings.ml_api_timeout_seconds) as r:  # noqa: S310
                data = json.loads(r.read())
        except Exception as exc:
            return {**status, "ml_available": False, "detail": f"{type(exc).__name__}", "ingested": 0, "duplicates": 0, "rejected": 0, "skipped_no_live_session": 0}
        ingested = dup = bad = skipped = 0
        for raw in data.get("risk_events", []):
            try:
                event = RiskEvent(**raw)
                if self.db.get(UserSession, normalize_session_id(event.session_id)) is None:
                    skipped += 1  # simulator / unknown id: never applied to a live customer session
                    continue
                result = self.ingest(event)
            except Exception:
                self.db.rollback()
                bad += 1
                continue
            dup += 1 if result["duplicate"] else 0
            ingested += 0 if result["duplicate"] else 1
        return {**status, "ingested": ingested, "duplicates": dup, "rejected": bad, "skipped_no_live_session": skipped}
