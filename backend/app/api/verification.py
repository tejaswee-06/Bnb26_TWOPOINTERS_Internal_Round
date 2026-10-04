from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import Depends

from app.db.database import get_db
from app.models.audit_event import AuditEvent
from app.models.inventory import Inventory
from app.models.reservation import Reservation
from app.models.session import UserSession

router = APIRouter(tags=["Verification"])


@router.get("/verify/{allocation_id}")
def verify_allocation(allocation_id: int, db: Session = Depends(get_db)):
    reservation = db.get(Reservation, allocation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Allocation not found")
    inventory = db.get(Inventory, reservation.inventory_id) if reservation.inventory_id else None
    session = db.get(UserSession, reservation.session_id) if reservation.session_id else None
    audits = db.execute(select(AuditEvent).where(AuditEvent.allocation_id == allocation_id).order_by(AuditEvent.id)).scalars().all()
    proof = {
        "allocation_id": allocation_id,
        "state": reservation.status,
        "event_id": reservation.event_id,
        "user_id": reservation.user_id,
        "session": {"session_id": session.id, "state": session.state} if session else None,
        "admission": {"session_id": session.id, "token_version": session.token_version} if session else None,
        "reservation": {"id": reservation.id, "status": reservation.status, "idempotency_key": reservation.idempotency_key},
        "inventory": {"id": inventory.id, "item_code": inventory.item_code, "status": inventory.status} if inventory else None,
        "audit_chain": [
            {"id": a.id, "type": a.event_type, "hash": a.event_hash, "previous_hash": a.previous_hash, "created_at": a.created_at.isoformat() if a.created_at else None}
            for a in audits
        ],
        "verifiable": reservation.status == "CONFIRMED" and bool(inventory and inventory.status == "CONFIRMED") and bool(audits),
    }
    return proof


@router.get("/audit/{event_id}")
def audit(event_id: str, db: Session = Depends(get_db)):
    rows = db.execute(select(AuditEvent).where(AuditEvent.event_id == event_id).order_by(AuditEvent.id)).scalars().all()
    return {"event_id": event_id, "count": len(rows), "events": [{"id": a.id, "event_type": a.event_type, "session_id": a.session_id, "reservation_id": a.reservation_id, "allocation_id": a.allocation_id, "user_id": a.user_id, "correlation_id": a.correlation_id, "event_hash": a.event_hash, "previous_hash": a.previous_hash, "payload": a.payload, "created_at": a.created_at.isoformat() if a.created_at else None} for a in rows]}
