from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.inventory import Inventory
from app.models.reservation import Reservation


class InventoryRepository:
    def __init__(self, db: Session):
        self.db = db

    def count(self, event_id: str) -> int:
        return self.db.query(Inventory).filter(Inventory.event_id == event_id).count()

    def get_by_item_code(self, item_code: str) -> Inventory | None:
        return self.db.execute(select(Inventory).where(Inventory.item_code == item_code)).scalar_one_or_none()

    def get_by_id(self, inventory_id: int) -> Inventory | None:
        return self.db.get(Inventory, inventory_id)

    def expire_due_holds(self, event_id: str | None = None) -> int:
        now = datetime.now(timezone.utc)
        due = self.db.execute(select(Inventory.id, Inventory.reservation_id).where(Inventory.status == "HELD", Inventory.held_until.is_not(None), Inventory.held_until <= now, *([Inventory.event_id == event_id] if event_id else []))).all()
        reservation_ids = [reservation_id for _, reservation_id in due if reservation_id is not None]
        if reservation_ids:
            self.db.execute(update(Reservation).where(Reservation.id.in_(reservation_ids), Reservation.status == "HELD").values(status="EXPIRED", released_at=now))
        if not due:
            return 0
        inventory_ids = [inventory_id for inventory_id, _ in due]
        result = self.db.execute(update(Inventory).where(Inventory.id.in_(inventory_ids), Inventory.status == "HELD").values(status="AVAILABLE", holder_id=None, reservation_id=None, held_until=None))
        return result.rowcount or 0

    def claim_available(self, event_id: str, user_id: str, reservation_id: int, held_until: datetime, ticket_type: str | None = None) -> int:
        type_filter = [Inventory.ticket_type == ticket_type] if ticket_type else []
        dialect = self.db.bind.dialect.name if self.db.bind is not None else "sqlite"
        if dialect == "postgresql":
            candidate = self.db.execute(
                select(Inventory).where(Inventory.event_id == event_id, Inventory.status == "AVAILABLE", *type_filter).order_by(Inventory.id).with_for_update(skip_locked=True).limit(1)
            ).scalar_one_or_none()
            if candidate is None:
                return 0
            candidate.status = "HELD"
            candidate.holder_id = user_id
            candidate.reservation_id = reservation_id
            candidate.held_until = held_until
            self.db.flush()
            return 1

        candidate_id = select(Inventory.id).where(Inventory.event_id == event_id, Inventory.status == "AVAILABLE", *type_filter).order_by(Inventory.id).limit(1).scalar_subquery()
        result = self.db.execute(update(Inventory).where(Inventory.id == candidate_id, Inventory.status == "AVAILABLE").values(status="HELD", holder_id=user_id, reservation_id=reservation_id, held_until=held_until))
        return result.rowcount or 0
