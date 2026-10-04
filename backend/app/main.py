from contextlib import asynccontextmanager
from collections import deque
from time import monotonic
from uuid import uuid4
import asyncio
import json
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import DBAPIError
from starlette.responses import JSONResponse

from app.api.allocation import router as allocation_router
from app.api.events import router as events_router
from app.api.health import router as health_router
from app.api.integration import router as integration_router
from app.api.admin import router as admin_router
from app.api.policy import router as policy_router
from app.api.inventory import router as inventory_router
from app.api.resilience import router as resilience_router
from app.api.sessions import router as sessions_router, queue_store
from app.api.verification import router as verification_router
from app.core.config import settings
from app.db.database import SessionLocal
from app.models import UserSession
from app.resilience import resilience
from app.workers.expiry import expiry_loop
from app.workers.ml_sync import ml_sync_loop


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {"level": record.levelname, "logger": record.name, "message": record.getMessage(), "timestamp": self.formatTime(record, self.datefmt)}
        if hasattr(record, "extra_data"):
            payload.update(record.extra_data)
        return json.dumps(payload, default=str)


handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logging.getLogger().handlers[:] = [handler]
logging.getLogger().setLevel(settings.log_level.upper())


def _sessions_from_db():
    with SessionLocal() as db:
        return [tuple(r) for r in db.query(UserSession.event_id, UserSession.id, UserSession.state, UserSession.queue_sequence).filter(UserSession.state.in_(["QUEUED", "ADMITTED", "ALLOCATING"])).all()]


queue_store.sessions_provider = _sessions_from_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop_event = asyncio.Event()
    app.state.expiry_stop = stop_event
    app.state.expiry_task = None
    if settings.enable_expiry_worker:
        app.state.expiry_task = asyncio.create_task(expiry_loop(stop_event))
    app.state.ml_sync_task = asyncio.create_task(ml_sync_loop(stop_event)) if settings.ml_sync_interval_seconds > 0 and settings.ml_api_url else None
    # Rebuild hot queue state from PostgreSQL authoritative sessions after restart.
    try:
        queue_store.rebuild_from_sessions(_sessions_from_db())
    except Exception:
        logging.getLogger(__name__).exception("queue_rebuild_failed")
    yield
    stop_event.set()
    if app.state.expiry_task:
        await app.state.expiry_task
    if app.state.ml_sync_task:
        await app.state.ml_sync_task


app = FastAPI(title="Fair Drop API", description="Distributed, adversarially resilient allocation backend", version="3.0.0", lifespan=lifespan)
origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["GET", "POST", "PATCH"], allow_headers=["*"])


@app.exception_handler(DBAPIError)
async def database_unavailable(request: Request, exc: DBAPIError):
    """Database outage / connection loss: fail closed with a retryable 503. No allocation happens without the DB."""
    logging.getLogger("fairdrop.request").error("database_unavailable", extra={"extra_data": {"path": request.url.path, "error": type(exc).__name__}})
    return JSONResponse(status_code=503, headers={"Retry-After": "2"}, content={"detail": "Database temporarily unavailable; no state was changed. Retry with the same idempotency key.", "retry_after_seconds": 2})


@app.middleware("http")
async def correlation_middleware(request: Request, call_next):
    correlation_id = request.headers.get("X-Correlation-ID") or uuid4().hex
    started = monotonic()
    try:
        response = await call_next(request)
    except Exception:
        logging.getLogger("fairdrop.request").exception("request_failed", extra={"extra_data": {"correlation_id": correlation_id, "path": request.url.path, "method": request.method}})
        response = JSONResponse(status_code=500, content={"detail": "Internal server error", "correlation_id": correlation_id})
    samples = getattr(app.state, "request_samples", None)
    if samples is None:
        samples = app.state.request_samples = deque(maxlen=5000)
    now = monotonic()
    samples.append((now, response.status_code >= 500))
    cutoff = now - 10.0
    while samples and samples[0][0] < cutoff:
        samples.popleft()
    rps = len(samples) / 10.0
    errors = sum(1 for _, failed in samples if failed)
    qdepth = queue_store.total_depth()
    resilience.observe(rps=rps, queue_depth=qdepth, error_rate=(errors / len(samples)) if samples else 0.0, redis_available=queue_store.ping())
    response.headers["X-Correlation-ID"] = correlation_id
    response.headers["X-Resilience-State"] = resilience.state.value
    response.headers["X-Request-Duration-Ms"] = f"{(monotonic() - started) * 1000:.2f}"
    logging.getLogger("fairdrop.request").info("request_complete", extra={"extra_data": {"correlation_id": correlation_id, "method": request.method, "path": request.url.path, "status": response.status_code, "duration_ms": round((monotonic() - started) * 1000, 2)}})
    return response


if settings.environment.lower() == "production" and settings.hmac_secret in {"CHANGE-ME-IN-PRODUCTION", "replace-with-a-long-random-secret"}:
    raise RuntimeError("HMAC_SECRET must be changed in production")
if settings.environment.lower() == "production" and not (settings.integration_api_key and settings.admin_api_key):
    raise RuntimeError("INTEGRATION_API_KEY and ADMIN_API_KEY must be set in production")

app.include_router(health_router)
app.include_router(events_router)
app.include_router(inventory_router)
app.include_router(sessions_router)
app.include_router(allocation_router)
app.include_router(verification_router)
app.include_router(integration_router)
app.include_router(policy_router)
app.include_router(admin_router)
app.include_router(resilience_router)


@app.get("/")
def root():
    return {"service": "Fair Drop", "status": "running", "version": app.version, "architecture": "distributed (Redis queue + PostgreSQL inventory); capacity not benchmarked at 10M"}
