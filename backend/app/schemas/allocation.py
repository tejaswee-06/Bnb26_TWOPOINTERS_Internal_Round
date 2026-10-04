from datetime import datetime
from pydantic import BaseModel, Field


class AllocationRequest(BaseModel):
    event_id: str = Field(min_length=1, max_length=100)
    user_id: str = Field(min_length=1, max_length=100)
    idempotency_key: str = Field(min_length=1, max_length=200)
    session_id: str | None = Field(default=None, min_length=1, max_length=100)
    session_credential: str | None = Field(default=None, min_length=16, max_length=256)
    admission_token: str | None = None
    ticket_type: str | None = Field(default=None, min_length=1, max_length=60)


class AllocationResponse(BaseModel):
    success: bool
    status: str
    allocation_id: int | None = None
    item_code: str | None = None
    message: str


class HoldRequest(AllocationRequest):
    pass


class HoldResponse(BaseModel):
    success: bool
    status: str
    reservation_id: int | None = None
    item_code: str | None = None
    held_until: datetime | None = None
    ticket_type: str | None = None
    message: str


class ConfirmRequest(BaseModel):
    reservation_id: int = Field(gt=0)
    user_id: str = Field(min_length=1, max_length=100)
    session_id: str | None = Field(default=None, min_length=1, max_length=100)
    session_credential: str | None = Field(default=None, min_length=16, max_length=256)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=200)


class ReleaseRequest(BaseModel):
    reservation_id: int = Field(gt=0)
    user_id: str = Field(min_length=1, max_length=100)
    session_id: str | None = Field(default=None, min_length=1, max_length=100)
    session_credential: str | None = Field(default=None, min_length=16, max_length=256)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=200)


class ReservationResponse(BaseModel):
    success: bool
    status: str
    reservation_id: int
    item_code: str
    message: str
