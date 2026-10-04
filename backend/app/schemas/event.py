from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    event_id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    admission_limit: int = Field(default=100, ge=1, le=1_000_000)
    mode: str = Field(default="FIFO", pattern="^(FIFO|FAIR)$")  # FAIR = verifiable randomised pre-queue before admission
    prequeue_seconds: int = Field(default=0, ge=0, le=86_400)
    auto_advance: bool = True


class EventResponse(BaseModel):
    event_id: str
    name: str
    status: str
    admission_limit: int
    mode: str = "FIFO"
    phase: str = "ADMITTING"


class TicketTypeSeed(BaseModel):
    ticket_type: str = Field(min_length=1, max_length=60, pattern="^[A-Za-z0-9_-]+$")
    count: int = Field(ge=1, le=100_000)


class ProvisionRequest(BaseModel):
    event_id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    admission_limit: int = Field(default=100, ge=1, le=1_000_000)
    prequeue_seconds: int = Field(default=60, ge=1, le=86_400)
    auto_advance: bool = True
    ticket_types: list[TicketTypeSeed] = Field(min_length=1, max_length=20)
