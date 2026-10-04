import hmac

from fastapi import Header, HTTPException

from app.core.config import settings


def require_admin_key(x_admin_key: str | None = Header(default=None)) -> None:
    """Operator auth. Open when ADMIN_API_KEY is unset (dev/test); production refuses to start without it."""
    if settings.admin_api_key and not (x_admin_key and hmac.compare_digest(x_admin_key, settings.admin_api_key)):
        raise HTTPException(status_code=401, detail="Valid X-Admin-Key required")
