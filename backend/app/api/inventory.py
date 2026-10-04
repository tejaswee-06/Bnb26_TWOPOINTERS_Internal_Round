from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.event import Event
from app.models.inventory import Inventory
from app.repositories.inventory_repository import InventoryRepository
from app.security.admin import require_admin_key

router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.post("/seed", dependencies=[Depends(require_admin_key)])
def seed_inventory(event_id: str = Query(min_length=1, max_length=100), count: int = Query(default=500, ge=1, le=100_000), ticket_type: str | None = Query(default=None, min_length=1, max_length=60, pattern="^[A-Za-z0-9_-]+$"), db: Session = Depends(get_db)):
    existing = db.query(Inventory).filter(Inventory.event_id == event_id, Inventory.ticket_type == ticket_type if ticket_type else Inventory.ticket_type.is_(None)).count()
    if existing:
        raise HTTPException(status_code=409, detail=f"Event already has {existing} inventory items" + (f" of type {ticket_type}." if ticket_type else "."))
    if not db.get(Event, event_id):
        db.add(Event(id=event_id, name=event_id, admission_limit=min(100, count)))
        db.flush()
    label = ticket_type.upper() if ticket_type else "SEAT"
    db.add_all([Inventory(event_id=event_id, item_code=f"{event_id}-{label}-{i:05d}", status="AVAILABLE", ticket_type=ticket_type) for i in range(1, count + 1)])
    db.commit()
    return {"success": True, "event_id": event_id, "created": count, "ticket_type": ticket_type, "status": "AVAILABLE"}


@router.get("/{event_id}")
def inventory(event_id: str, db: Session = Depends(get_db)):
    InventoryRepository(db).expire_due_holds(event_id)
    db.commit()
    rows = db.execute(select(Inventory.id, Inventory.item_code, Inventory.status, Inventory.held_until).where(Inventory.event_id == event_id).order_by(Inventory.id)).all()
    return {"event_id": event_id, "items": [dict(row._mapping) for row in rows]}


@router.get("/stats/{event_id}")
def inventory_stats(event_id: str, db: Session = Depends(get_db)):
    InventoryRepository(db).expire_due_holds(event_id)
    db.commit()
    rows = db.execute(select(Inventory.status, func.count(Inventory.id)).where(Inventory.event_id == event_id).group_by(Inventory.status)).all()
    counts = {status: count for status, count in rows}
    total = sum(counts.values())
    invariant = counts.get("AVAILABLE", 0) + counts.get("HELD", 0) + counts.get("CONFIRMED", 0) == total
    by_type = {}
    for ttype, status, n in db.execute(select(Inventory.ticket_type, Inventory.status, func.count(Inventory.id)).where(Inventory.event_id == event_id).group_by(Inventory.ticket_type, Inventory.status)).all():
        bt = by_type.setdefault(ttype or "default", {"total": 0, "available": 0, "held": 0, "confirmed": 0})
        bt["total"] += n
        bt[status.lower()] = bt.get(status.lower(), 0) + n
    return {"event_id": event_id, "total": total, "available": counts.get("AVAILABLE", 0), "held": counts.get("HELD", 0), "confirmed": counts.get("CONFIRMED", 0), "invariant_ok": invariant, "oversold": counts.get("CONFIRMED", 0) > total, "by_type": by_type}
