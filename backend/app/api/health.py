from fastapi import APIRouter
from sqlalchemy import text
from app.api.sessions import queue_store
from app.db.database import SessionLocal
from app.resilience import resilience

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("")
def health_check():
    db_ok = True
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    redis_ok = queue_store.ping()
    healthy = db_ok and (redis_ok or not queue_store.using_redis and not __import__('app.core.config', fromlist=['settings']).settings.redis_required)
    return {"status": "healthy" if healthy else "degraded", "service": "fair-drop-backend", "database": db_ok, "redis": redis_ok, "queue_backend": "redis" if queue_store.using_redis else "memory-fallback", "resilience": resilience.state.value}
