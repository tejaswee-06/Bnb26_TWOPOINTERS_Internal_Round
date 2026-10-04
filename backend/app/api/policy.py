from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.sessions import queue_store
from app.core.config import settings
from app.db.database import get_db
from app.models.session import UserSession
from app.policy.service import PolicyService
from app.security.tokens import verify_credential

router = APIRouter(prefix="/policy", tags=["Policy"])


class SolveRequest(BaseModel):
    challenge: str = Field(min_length=10, max_length=2000)
    solution: str = Field(min_length=1, max_length=100)


def _session(db: Session, session_id: str, credential: str | None) -> UserSession:
    s = db.get(UserSession, session_id)
    if not s or not verify_credential(credential, s.credential_hash):
        raise HTTPException(status_code=403, detail="Invalid session credential")
    return s


@router.get("/config")
def policy_config():
    return {"policy_version": settings.policy_version, "actions": ["NORMAL", "CHALLENGE", "THROTTLE", "QUARANTINE", "REJECT"],
            "thresholds": {k[len("policy_"):]: getattr(settings, k) for k in settings.model_fields if k.startswith("policy_") and k != "policy_version" and not k.startswith("policy_hard")}}


@router.post("/challenge/{session_id}")
def issue_challenge(session_id: str, x_session_credential: str | None = Header(default=None), db: Session = Depends(get_db)):
    ok, _ = queue_store.rate_limit(f"challenge-issue:{session_id}", 10, 60)
    if not ok:
        raise HTTPException(status_code=429, detail="Too many challenge requests")
    _session(db, session_id, x_session_credential)
    return PolicyService(db, queue_store).issue_challenge(session_id)


@router.post("/challenge/{session_id}/solve")
def solve_challenge(session_id: str, body: SolveRequest, x_session_credential: str | None = Header(default=None), db: Session = Depends(get_db)):
    ok, _ = queue_store.rate_limit(f"challenge-solve:{session_id}", 20, 60)
    if not ok:
        raise HTTPException(status_code=429, detail="Too many attempts")
    _session(db, session_id, x_session_credential)
    return PolicyService(db, queue_store).solve_challenge(session_id, body.challenge, body.solution)
