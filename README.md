# FairDrop — selling 500 seats to 50,000 people without letting bots win

One repository, three parts that were built separately and are now merged:

| Directory | Owner | Role |
|---|---|---|
| `backend/` | Person 1 | **Authoritative** FastAPI service: auth/session credentials, fair pre-queue + verifiable draw, queue, controlled admission, HMAC admission tokens, atomic typed inventory, idempotent allocation, hash-chained audit, deterministic policy engine (`policy-v1`), resilience (Redis fallback, DB-outage fail-closed), operator API |
| `ml_api/` | Person 2 | Separate **advisory** FastAPI service that serves the exported ML evidence (`fairdrop_ml_output.json`: Model 1 bot probability, Model 2 anomaly, simulator metrics, coordination RiskEvents) |
| `frontend/` | Person 3 | Next.js 14 customer site + organizer console. Live mode talks to the backend through a server-side proxy; the original in-browser simulator stays for the labelled attack lab |

```
Customer → Next.js → /api/fd proxy → P1 backend → session/telemetry → P2 ML evidence → RiskEvent
        → P1 deterministic policy (NORMAL | CHALLENGE | THROTTLE | QUARANTINE | REJECT, recorded + explainable)
        → queue → controlled admission → atomic allocation → inventory
Admin    → Next.js admin → proxy (signed cookie, keys injected server-side) → P1 backend (+ P2 evidence panels)
```
**ML is advisory.** It never modifies inventory, allocates, confirms, sets queue position or decides admission. The only path from ML into the system is `RiskEvent → policy engine → recorded PolicyDecision → enforced backend action`.

## Run it

```bash
pip install -r backend/requirements.txt -r ml_api/requirements.txt
(cd frontend && npm ci)
scripts/dev.sh            # backend :8000, ML :8001, Next.js :3000 (live mode)
```
Customer: <http://localhost:3000> · Organizer: <http://localhost:3000/admin> (`admin@fairdrop.demo` / `FairDrop@2026`, demo credentials) · API docs: <http://localhost:8000/docs>

Exact commands (what `dev.sh` runs):
```bash
# backend
cd backend && export ADMIN_API_KEY=… INTEGRATION_API_KEY=… HMAC_SECRET=… ML_API_URL=http://127.0.0.1:8001
alembic upgrade head && uvicorn app.main:app --port 8000
# ML service
cd ml_api && uvicorn main:app --port 8001
# frontend (live mode)
cd frontend && export NEXT_PUBLIC_FAIRDROP_LIVE=1 FAIRDROP_API_URL=http://127.0.0.1:8000 FAIRDROP_ADMIN_KEY=<same ADMIN_API_KEY> FAIRDROP_INTEGRATION_KEY=<same INTEGRATION_API_KEY>
npx next build && npx next start -p 3000        # or: npx next dev
```
Without `NEXT_PUBLIC_FAIRDROP_LIVE=1` the frontend runs as the original self-contained simulation (no backend needed). Full stack in containers: `docker-compose.yml` (not run in the build sandbox).

### Try the live flow
1. Open the AI Frontier Mumbai event → **Join Fair Drop** → sign in → enter the pre-queue (the server opens the window on first join; `LIVE_PREQUEUE_SECONDS`).
2. Organizer: **Drop control** shows the live phase, queue, inventory by type and policy decisions; autopilot advances phases, or drive them manually.
3. After the draw, the customer page shows the drawn position, gets admitted by the backend, chooses a ticket (1 per person in live mode), holds, pays (demo) and verifies the draw from the confirmation page.
4. To see the policy path: `python scripts/replay_p2_evidence.py --live-session-id <sid> --p2-session sim_1_0005` (labelled evaluation replay of real P2 model output onto a live session; see `docs/INTEGRATION.md`).

## Tests
`scripts/run_all_tests.sh` runs everything: backend pytest, Redis-failover and PostgreSQL multi-worker checks (if the binaries exist), frontend typecheck, simulation-mode Playwright suites (customer / admin / ML), and the live end-to-end suite (`frontend/tests/e2e/live.py`, 70 checks including backend/ML outages). Individual pieces: `cd backend && python -m pytest -q`, `scripts/run_live_e2e.sh`.

## Documentation
`docs/INTEGRATION.md` (flows, endpoints, env vars, decisions) · `docs/KNOWN_LIMITATIONS.md` (what is and is not verified) · `docs/backend/` (P1 architecture/security/resilience/policy/contracts, OpenAPI) · `docs/ml/` (P2 contract + sample CSVs) · `docs/frontend/` (original simulation architecture/demo notes) · `docs/reference/` (Master Implementation Reference PDF).
