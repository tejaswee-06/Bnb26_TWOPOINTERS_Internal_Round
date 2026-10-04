from __future__ import annotations

import hashlib
import json
import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent


def emit(
    db: Session,
    event_type: str,
    *,
    event_id: str | None = None,
    session_id: str | None = None,
    reservation_id: int | None = None,
    allocation_id: int | None = None,
    user_id: str | None = None,
    idempotency_key: str | None = None,
    correlation_id: str | None = None,
    payload: dict | None = None,
    commit: bool = True,
) -> str:
    cid = correlation_id or uuid.uuid4().hex
    previous = db.execute(select(AuditEvent.event_hash).order_by(AuditEvent.id.desc()).limit(1)).scalar_one_or_none()
    safe_payload = payload or {}
    material = json.dumps({
        "event_type": event_type,
        "event_id": event_id,
        "session_id": session_id,
        "reservation_id": reservation_id,
        "allocation_id": allocation_id,
        "user_id": user_id,
        "idempotency_key": idempotency_key,
        "correlation_id": cid,
        "previous_hash": previous,
        "payload": safe_payload,
    }, sort_keys=True, separators=(",", ":"), default=str).encode()
    event_hash = hashlib.sha256(material).hexdigest()
    db.add(AuditEvent(
        event_type=event_type,
        event_id=event_id,
        session_id=session_id,
        reservation_id=reservation_id,
        allocation_id=allocation_id,
        user_id=user_id,
        idempotency_key=idempotency_key,
        correlation_id=cid,
        previous_hash=previous,
        event_hash=event_hash,
        payload=safe_payload,
    ))
    if commit:
        db.commit()
    return cid
