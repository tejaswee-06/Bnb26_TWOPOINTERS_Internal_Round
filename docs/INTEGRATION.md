# Integration guide (P1 + P2 + P3)

## 1. Authority and priority
Master PDF architecture → P1 for every final decision → P2 for evidence only → P3 for presentation. The browser never decides queue order, admission, policy or inventory: `frontend/lib/live/liveDrop.ts` only relays and renders server state.

## 2. P1 ↔ P3 flow (live mode)
| Step | Browser (`lib/live`, services/fairdrop.ts) | Proxy `/api/fd/*` | Backend |
|---|---|---|---|
| provision/open | `LiveDrop.ensure` | `POST /api/fd/ensure/{event}` (admin key server-side; only catalogue drop events) | `POST /admin/events/provision`, `/open` |
| join | `service.join` | allow-listed | `POST /events/{id}/join` → `session_id` + one-time `credential` (kept in localStorage); user id is `u_<sha256(email)[:24]>` — the e-mail never leaves the browser |
| wait/draw | polling every 2 s | allow-listed | `GET /events/{id}/drop`, `GET /queue/{sid}`, `GET /events/{id}/proof` |
| admission | automatic `POST /queue/{sid}/admit` while ADMITTING | allow-listed | token issued; policy gate → `CHALLENGE_REQUIRED / THROTTLED / QUARANTINED / REJECTED` |
| challenge | proof-of-work solved in the browser | allow-listed | `POST /policy/challenge/{sid}` (+`/solve`) |
| hold / pay / release | `service.hold/confirm/release` | allow-listed | `POST /allocation/hold|confirm|release` (idempotency keys `hold:{sid}:{n}`, `confirm:{rid}`) |
| verify | commit-reveal recomputed client-side | — | proof bundle + eligible list from `/events/{id}/proof` |
| organizer | `components/admin/live.tsx` | needs signed httpOnly cookie from `POST /api/fd/adminauth/login`; keys injected | `/admin/events/*`, `/integration/decisions`, `/integration/ml/*`, `/resilience`, `/metrics`, `/audit/*` |

Customer-facing copy never shows scores, rule names or policy reasons. Blocked sessions see a neutral message.

## 3. P1 ↔ P2 flow
* **Contract**: `POST /integration/risk-events` (`X-Integration-Key`), idempotent on `(session_id, event_id)`, scores nullable (null = not measured, never invented). Unknown session ids are recorded but cannot be enforced.
* **Pull**: `POST /integration/ml/sync` (admin button on *Detection* / *Campaigns*, or `ML_SYNC_INTERVAL_SECONDS`) fetches `ml_api /ml/risk-events`. P2's exported RiskEvents reference **simulator** sessions, so the sync correctly reports `skipped_no_live_session` for all of them and applies nothing to live customers.
* **Evaluation replay**: `scripts/replay_p2_evidence.py` copies the real per-session P2 model outputs (Model 1 bot probability, Model 2 anomaly, optionally the real P2 coordination output) onto a *live* session id and tags the evidence `demo_replay_source=<sim id>` + `evaluation_replay`. It drives the identical production path (RiskEvent → policy → decision → enforcement). Not wired into the product UI.
* **ML down**: sync returns `ml_available:false, ingested:0`; the admin panel shows "ML SERVICE OFFLINE"; recorded decisions keep being enforced; customers are unaffected.
* A real-time scorer for live telemetry does not exist in P2 (it serves an exported file). The live telemetry roster (`GET /integration/sessions`) is the hook for it.

## 4. Admin visibility
| Page | Live (backend) | Simulator / P2 (labelled) |
|---|---|---|
| Drop control | phase, queue, inventory by type, policy decisions, phase actions | simulator controls |
| Allocations | confirmed/held/available, invariant, audit-chain linkage | simulated allocations |
| System | `/health`, resilience state, Redis/fallback, queue depth | simulated platform |
| Detection | recorded decisions (rules, scores or `—`), ML status, sync | P2 ML panel (Model 1, Model 2, metrics, live feed), simulator confusion matrix |
| Campaigns | decisions grouped by campaign | P2 coordination RiskEvents, simulated population |
| Attacks | note: attacks never touch the live backend | attack lab (SIMULATED), P2 simulator results |
Ground truth (bot/human labels) exists only in simulator/evaluation data and is labelled as such.

## 5. Environment variables
See `.env.example` (shared), `backend/.env.example` (backend; key ones: `DATABASE_URL`, `REDIS_URL`, `REDIS_REQUIRED`, `HMAC_SECRET`, `ADMIN_API_KEY`, `INTEGRATION_API_KEY`, `ML_API_URL`, `ML_SYNC_INTERVAL_SECONDS`, `POLICY_*`) and `frontend/.env.example` (frontend: `NEXT_PUBLIC_FAIRDROP_LIVE`, `NEXT_PUBLIC_ML_API_URL`, `FAIRDROP_API_URL`, `FAIRDROP_ADMIN_KEY`, `FAIRDROP_INTEGRATION_KEY`, `FAIRDROP_COOKIE_SECRET`, `LIVE_*`). `ENVIRONMENT=production` refuses to start without `ADMIN_API_KEY` and `INTEGRATION_API_KEY`.

Backend contracts: `docs/backend/INTEGRATION_CONTRACTS.md` (incl. the merge addendum) and `docs/backend/openapi.json`.
