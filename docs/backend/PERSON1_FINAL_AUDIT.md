# FAIR DROP — Person 1 Final Audit

## Scope
This package hardens the deterministic backend: authoritative inventory, session credentials, queue/admission, idempotency, allocation, resilience, telemetry, verification and integration contracts.

## Implemented in this package
- PostgreSQL-aware atomic inventory claim using `FOR UPDATE SKIP LOCKED`.
- SQLite-compatible allocation path for local testing.
- Request fingerprints for reservation idempotency.
- Session credentials stored as SHA-256 hashes and required for session-bound operations.
- Admission tokens bind event, session and user; tokens include expiry/version/JTI.
- Admission-token replay protection through a durable database table.
- Atomic admission-capacity check using an event-row lock on PostgreSQL.
- Admission expiry and background expiry worker.
- Queue rebuild from authoritative database sessions at application startup.
- Redis remains hot coordination state, not inventory truth.
- Mutation rate limiting and resilience gating.
- Allocation/audit verification endpoint.
- Hash-linked audit events written in the same transaction as state changes.
- RiskEvent and AllocationEvent integration contracts.
- Structured JSON request logging with correlation IDs.
- Docker Compose migration startup and health checks.
- Reproducible load harness and Person 1 demo script.

## Verification status
Run `pytest -q` in the backend environment to verify the local SQLite correctness suite. A PostgreSQL/Redis deployment is required to validate real multi-process row-lock and networked Redis behavior.

## Important limitation
This archive does **not** claim 10M real concurrent-user capacity. The architecture is 10M-target; capacity claims require actual benchmark evidence on the deployment infrastructure.
