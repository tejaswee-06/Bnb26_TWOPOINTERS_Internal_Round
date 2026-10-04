from __future__ import annotations
import asyncio
import logging
from app.db.database import SessionLocal
from app.models.event import Event
from app.repositories.inventory_repository import InventoryRepository
from app.services.session_service import SessionService
from app.api.sessions import queue_store
from app.core.config import settings


async def expiry_loop(stop_event: asyncio.Event):
    while not stop_event.is_set():
        try:
            with SessionLocal() as db:
                events = db.query(Event.id).all()
                for (event_id,) in events:
                    InventoryRepository(db).expire_due_holds(event_id)
                    SessionService(db, queue_store)._expire_admissions(event_id)
                db.commit()
        except Exception:
            logging.getLogger("fairdrop.expiry").exception("expiry_worker_iteration_failed")  # keep looping; recovers when the DB returns
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=settings.expiry_worker_interval_seconds)
        except asyncio.TimeoutError:
            continue
