# FAIR DROP — Person 1 Backend

Person 1 owns deterministic distributed backend state: authoritative inventory, transactional allocation, queue/session primitives, signed admission, rate limiting, resilience, telemetry and allocation verification.

## Architecture

- PostgreSQL: authoritative events, sessions, inventory, reservations and audit records.
- Redis: hot queue/session state and rate limits; never inventory truth.
- FastAPI: API/orchestration.
- HMAC admission tokens: event/session/user bound, expiring, versioned and replay protected.
- Session credentials: issued at join and stored only as hashes.
- Allocation: `AVAILABLE → HELD → CONFIRMED` with conditional transactional transitions.
- Resilience: `NORMAL → ELEVATED → DEGRADED → PROTECTIVE → RECOVERING`.
- Audit: hash-linked allocation events.

## Main flow

1. `POST /events`
2. `POST /inventory/seed?event_id=...&count=500`
3. `POST /events/{event_id}/join` — returns a session credential once.
4. `GET /queue/{session_id}` with `X-Session-Credential`.
5. `POST /queue/{session_id}/admit` with the credential.
6. `POST /reservations` or `/allocation` with session credential + signed admission token.
7. `POST /reservations/{id}/confirm` or use `/allocation` for hold+confirm.
8. `GET /verify/{allocation_id}` to inspect the proof chain.
9. `GET /inventory/stats/{event_id}` to verify the inventory invariant.

## Local setup

```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
```

For a fresh local SQLite database:

```bash
DATABASE_URL=sqlite:///./fair_drop.db alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Windows CMD equivalent:

```cmd
set DATABASE_URL=sqlite:///./fair_drop.db
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

## Docker production-style stack

Create `.env` with at least:

```text
POSTGRES_PASSWORD=<strong-random-password>
HMAC_SECRET=<long-random-secret>
```

Then:

```bash
docker compose up --build
```

Compose runs Alembic migrations before starting the API. PostgreSQL and Redis are internal services; only port 8000 is published.

## Tests

```bash
pytest -q
```

The included local suite verifies inventory invariants, idempotency, session credentials, queue bypass, admission-token tampering/replay, allocation verification and concurrency behavior under SQLite. A real PostgreSQL deployment is still required to validate multi-process `FOR UPDATE SKIP LOCKED` behavior.

## Judge demo

```bash
python demo/person1_demo.py --url http://127.0.0.1:8000 --seats 20
```

The script exercises queue → admission → signed allocation → idempotent replay → verification → metrics using real backend responses.

## Benchmarks

See `benchmarks/README.md`. Never fabricate metrics and never claim 10M real concurrent users without actual evidence. This repository describes a 10M-target architecture, not a measured 10M-connection result.

## Team boundaries

Person 2 owns ML / identity / adversarial intelligence. Person 3 owns fairness / frontend / GenAI / control center. Integration contracts are documented in `../docs/backend/INTEGRATION_CONTRACTS.md`.


## Policy, tests and demo (final Person 1)
* Policy: `../docs/backend/POLICY.md`, contracts: `../docs/backend/INTEGRATION_CONTRACTS.md`.
* Tests: `python -m pytest -q tests` (add `-m "not infra"` to skip the slow real-Redis/real-PostgreSQL scripts).
* Real infrastructure scripts: `python tests/integration/redis_failover.py`, `python tests/integration/pg_concurrency.py`.
* End-to-end demo: `python demo/e2e_backend_demo.py`.
