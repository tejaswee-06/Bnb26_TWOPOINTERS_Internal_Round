# Person 1 Architecture

Clients → API Gateway/edge → FastAPI → resilience/rate limits → session credential + signed admission → server-authoritative queue → atomic allocation → PostgreSQL source of truth + Redis hot state → telemetry/audit → Person 2 risk contract / Person 3 control-center APIs.

**Authoritative:** PostgreSQL for events, sessions, inventory, reservations and audit records.

**Hot coordination:** Redis for queue state, rate limits and session hot state. It is never the source of truth for inventory.

**Invariant:** `available + held + confirmed = total`, and `confirmed <= total`.

**Security:** session credentials are hashed; admission tokens are HMAC signed, user/session/event bound, versioned, expiring and replay-protected.
