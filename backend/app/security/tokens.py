import base64
import hashlib
import hmac
import json
import time
import uuid

from app.core.config import settings


class TokenError(ValueError):
    pass


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def issue_admission_token(*, event_id: str, session_id: str, user_id: str, version: int = 1) -> str:
    now = int(time.time())
    payload = {
        "typ": "admission",
        "event_id": event_id,
        "session_id": session_id,
        "user_id": user_id,
        "iat": now,
        "exp": now + settings.queue_token_ttl_seconds,
        "ver": version,
        "jti": uuid.uuid4().hex,
    }
    body = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    signature = hmac.new(settings.hmac_secret.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64(signature)}"


def verify_admission_token(token: str, *, event_id: str, session_id: str, user_id: str | None = None) -> dict:
    try:
        parts = token.split(".")
        if len(parts) != 2:
            raise TokenError("malformed token")
        body, signature = parts
        if _b64(_unb64(signature)) != signature:  # reject non-canonical base64 (trailing padding bits) so one signature has exactly one valid spelling
            raise TokenError("invalid signature")
        expected = hmac.new(settings.hmac_secret.encode(), body.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_unb64(signature), expected):
            raise TokenError("invalid signature")
        payload = json.loads(_unb64(body))
    except TokenError:
        raise
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError, base64.binascii.Error) as exc:
        raise TokenError("malformed token") from exc

    now = int(time.time())
    if payload.get("typ") != "admission":
        raise TokenError("wrong token type")
    if payload.get("event_id") != event_id or payload.get("session_id") != session_id:
        raise TokenError("token subject mismatch")
    if user_id is not None and payload.get("user_id") != user_id:
        raise TokenError("token user mismatch")
    if not isinstance(payload.get("exp"), int) or payload["exp"] <= now:
        raise TokenError("token expired")
    if not isinstance(payload.get("iat"), int) or payload["iat"] > now + 30:
        raise TokenError("invalid issued-at")
    if not isinstance(payload.get("ver"), int) or not payload.get("jti"):
        raise TokenError("invalid token claims")
    return payload


def credential_hash(credential: str) -> str:
    return hashlib.sha256(credential.encode()).hexdigest()


def verify_credential(credential: str | None, expected_hash: str) -> bool:
    if not credential:
        return False
    return hmac.compare_digest(credential_hash(credential), expected_hash)
