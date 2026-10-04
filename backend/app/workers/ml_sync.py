"""Optional background pull of Person-2 RiskEvents into the deterministic policy boundary (ML_SYNC_INTERVAL_SECONDS > 0 and ML_API_URL set).

Advisory only: each pulled RiskEvent goes through PolicyService.ingest (explainable decision recorded + enforced by policy);
RiskEvents that reference unknown / simulator sessions are skipped, ML-down is reported and nothing is invented.
"""
from __future__ import annotations
import asyncio
import logging
from app.api.sessions import queue_store
from app.core.config import settings
from app.db.database import SessionLocal
from app.policy.service import PolicyService

log = logging.getLogger("fairdrop.ml_sync")
last_result: dict = {}


def sync_once() -> dict:
    global last_result
    with SessionLocal() as db:
        last_result = PolicyService(db, queue_store).sync_from_ml()
    return last_result


async def ml_sync_loop(stop_event: asyncio.Event):
    while not stop_event.is_set():
        try:
            await asyncio.to_thread(sync_once)
        except Exception:
            log.exception("ml_sync_iteration_failed")  # keep looping; ML or DB may come back
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=max(1, settings.ml_sync_interval_seconds))
        except asyncio.TimeoutError:
            continue
