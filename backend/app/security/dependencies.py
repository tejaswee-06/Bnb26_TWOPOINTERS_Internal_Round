from fastapi import HTTPException, status

from app.security.tokens import TokenError, verify_admission_token


def require_admission_token(token: str | None, *, event_id: str, session_id: str) -> dict:
    if not token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Valid admission token required")
    try:
        return verify_admission_token(token, event_id=event_id, session_id=session_id)
    except TokenError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Admission denied: {exc}") from exc
