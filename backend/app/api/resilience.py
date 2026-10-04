from fastapi import APIRouter

from app.api.sessions import queue_store
from app.resilience import resilience

router = APIRouter(tags=["Resilience"])


@router.get("/resilience")
def get_resilience():
    snapshot = resilience.snapshot()
    snapshot["redis_available"] = queue_store.using_redis
    snapshot["queue_backend"] = "redis" if queue_store.using_redis else "memory-fallback"
    snapshot["queue_events"] = queue_store.degraded_events
    return snapshot


@router.get("/metrics")
def metrics():
    snapshot = resilience.snapshot()
    return {"resilience": snapshot, "redis_available": queue_store.using_redis, "queue_depth": queue_store.total_depth()}
