from pydantic import BaseModel, Field


class JoinRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=100)
    session_id: str | None = Field(default=None, min_length=1, max_length=100)
    credential: str | None = Field(default=None, min_length=16, max_length=256)


class SessionResponse(BaseModel):
    session_id: str
    event_id: str
    user_id: str
    state: str
    position: int | None = None
    queue_depth: int = 0
    admitted: bool = False
    credential: str | None = None
    admission_expires_at: str | None = None
    queue_sequence: int | None = None
    policy_action: str | None = None
    reservation: dict | None = None


class AdmitResponse(BaseModel):
    success: bool
    status: str
    token: str | None = None
    position: int | None = None
    admission_limit: int | None = None
    admission_expires_at: str | None = None
    policy_action: str | None = None
    policy_reason: str | None = None
    retry_after_seconds: int | None = None
    challenge_url: str | None = None
    phase: str | None = None
