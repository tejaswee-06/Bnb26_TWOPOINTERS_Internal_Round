# FAIR DROP — Person 1 Integration Contracts (final)

Architecture: Telemetry → **Person 2 ML** → RiskEvent → **Person 1 deterministic policy** → NORMAL / CHALLENGE / THROTTLE / QUARANTINE / REJECT → queue → controlled admission → atomic allocation → PostgreSQL inventory.
ML only supplies evidence. It never allocates, mutates inventory, confirms reservations, sets queue position, or decides admission.

## Person 2 → Person 1: `POST /integration/risk-events`

Auth: header `X-Integration-Key: <INTEGRATION_API_KEY>` (enforced when the env var is set; mandatory in production).

```json
{
  "session_id": "<Person 1 session id; dashed UUID form is normalised to the 32-hex form>",
  "event_id": "<RiskEvent id, e.g. risk_0001>",
  "risk_score": 0.82 | null, "anomaly_score": 0.77 | null, "coordination_score": 0.91 | null,
  "campaign_id": "campaign_001" | null, "attack_type": "possible_coordinated_campaign" | null,
  "evidence": ["very_similar_behaviour", "..."],
  "model_version": "coordination_v1",
  "timestamp": "2026-10-03T21:49:49+00:00"
}
```
* Each score is nullable; **null means "not measured"** and is stored as null — never replaced by 0 or any invented value. At least one of the three scores must be non-null (otherwise `422`).
* `RiskEvent.event_id` identifies the *risk event*, not the ticket event. The ticket event is derived from the session.
* Idempotent on `(session_id, event_id)`: re-delivery returns `{"duplicate": true}` and the original decision.
* The `session_id` **must be a live Person 1 session id** (returned by `POST /events/{id}/join`). Unknown ids are recorded (`session_known:false`) but cannot be enforced.

Response `200`:
```json
{"accepted": true, "duplicate": false, "session_known": true, "applied": ["admission_token_revoked","removed_from_admission_queue"],
 "decision": {"decision_id": 7, "session_id": "...", "ticket_event_id": "...", "risk_event_id": "risk_0001", "action": "THROTTLE",
   "reason": "...", "rules_fired": ["R5_COORDINATION_ONLY"], "evidence": ["..."], "risk_score": null, "anomaly_score": null,
   "coordination_score": 1.0, "campaign_id": "campaign_001", "attack_type": "...", "model_version": "coordination_v1",
   "policy_version": "policy-v1", "created_at": "...", "expires_at": "..."}}
```
Also: `POST /integration/risk-events/batch` (≤500), `GET /integration/decisions?session_id=&campaign_id=&action=`, `GET /integration/policy/session/{session_id}` (effective action), `GET /integration/ml/status`, `POST /integration/ml/sync` (pull `GET {ML_API_URL}/ml/risk-events`; if ML is down: `ml_available:false, ingested:0`, nothing invented).

## Policy → behaviour (all thresholds in `.env`, version `policy-v1`; see `docs/POLICY.md`)

| Action | Admission (`POST /queue/{sid}/admit`) | Hold / confirm |
|---|---|---|
| NORMAL | normal | normal |
| CHALLENGE | `status:"CHALLENGE_REQUIRED"`, `challenge_url` | hold: `CHALLENGE_REQUIRED` |
| THROTTLE | one attempt per `POLICY_THROTTLE_ADMIT_INTERVAL_SECONDS`, else `THROTTLED` + `retry_after_seconds` | allowed |
| QUARANTINE | `QUARANTINED`; token revoked; removed from queue | hold & confirm: `POLICY_BLOCKED` |
| REJECT | `REJECTED`; same as quarantine | `POLICY_BLOCKED` |

Decisions expire (decay) per action TTL; after expiry the session recovers (QUARANTINE/REJECT sessions re-enter at the queue tail).

Challenge (client-facing, needs `X-Session-Credential`): `POST /policy/challenge/{sid}` → `{challenge, difficulty_bits}`; `POST /policy/challenge/{sid}/solve {challenge, solution}` where `sha256(challenge + ":" + solution)` has ≥ `difficulty_bits` leading zero bits. Clears CHALLENGE-level decisions only; single use. This is a speed bump, not a CAPTCHA.

## Person 1 → Person 3 (frontend)

* `POST /events/{event_id}/join` `{user_id}` → `{session_id, credential, position, ...}` (credential shown once).
* `GET /queue/{session_id}` (header `X-Session-Credential`) → state, position, depth, admitted.
* `POST /queue/{session_id}/admit` → `{success, status, token, policy_action?, policy_reason?, retry_after_seconds?, challenge_url?}`. Statuses: `ADMITTED, QUEUED, ADMISSION_CAPACITY_FULL, CHALLENGE_REQUIRED, THROTTLED, QUARANTINED, REJECTED, EVENT_CLOSED`.
* `POST /allocation/hold` / `/allocation/confirm` / `/allocation/release` (body carries `session_id`, `session_credential`, `admission_token`, `idempotency_key`). Hold statuses add `POLICY_BLOCKED`, `CHALLENGE_REQUIRED`, `ADMISSION_REQUIRED`, `SOLD_OUT`, `IDEMPOTENCY_CONFLICT`.
* `GET /inventory/stats/{event_id}`, `GET /verify/{allocation_id}`, `GET /audit/{event_id}`, `GET /metrics`, `GET /resilience`, `GET /health` (`queue_backend: redis|memory-fallback`).
* Overload: `503` + `Retry-After` for shed joins (PROTECTIVE) and for database outage; `429` for rate limits. Retry allocation with the **same idempotency key**.

## Person 1 → GenAI / Person 3 (read-only boundary)
`POST /integration/allocation-events` records an allocation event; GenAI/incident tooling should read `GET /audit/{event_id}`, `GET /integration/decisions`, `GET /metrics`. GenAI has no write path to inventory, queue or policy.

## Fairness boundary (G7)
Person 1 exposes the server-side queue (`queue_sequence`, FIFO by arrival) and the admission window. The verifiable randomised pre-queue lottery belongs to the fairness layer (Person 3); it must feed ordering into `POST /events/{id}/join` ordering or an equivalent server-side sequence — client-supplied position is ignored by design.

---
## Merge addendum — Fair pre-queue, typed inventory, operator API (added in the P1+P2+P3 merge)

**Phases** (`events.mode = FAIR`): `PREPARED → PRE_QUEUE_OPEN → PRE_QUEUE_CLOSED → RANDOMIZED → ADMITTING ⇄ PAUSED → ENDED`. All transitions are atomic compare-and-set (a concurrent double "randomize" yields exactly one draw). With `auto_advance` the server advances phases lazily when timers elapse; operators can also drive them.

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /events/{id}/drop` | public | phase, `seconds_left`, joined / eligible counts, queue depth, commitment, `proof_revealed`, inventory by ticket type + `invariant_ok` |
| `GET /events/{id}/proof` | public | `409` until revealed, then `{commitment, serverSeed, eligibleRoot, eligibleCount, algorithm, shuffleSeed, guidedLane:[], eligible:[session ids sorted]}` — anyone can recompute the draw (algorithm byte-identical to `frontend/lib/engine/shuffle.ts`) |
| `POST /events/{id}/join` | public | `{user_id, session_id?, credential?}` → one session per (event, user); a second join without the credential → `409 DUPLICATE_SESSION`; during PREPARED/closed → `409 PRE_QUEUE_NOT_OPEN / PRE_QUEUE_CLOSED` |
| `GET /queue/{sid}` | session credential | adds `queue_sequence` (drawn rank), `policy_action`, `reservation{reservation_id,status,held_until,ticket_type,item_code}` |
| `POST /queue/{sid}/admit` | session credential | adds `ADMISSION_NOT_OPEN(+phase)` to the earlier statuses; policy gate runs before capacity |
| `POST /allocation/hold` | session cred + admission token | `ticket_type` selects the typed pool (part of the idempotency fingerprint) |
| `POST /admin/events/provision` | `X-Admin-Key` | idempotent create of a FAIR event with typed inventory |
| `POST /admin/events/{id}/{open\|close\|randomize\|admit\|pause\|end}` | `X-Admin-Key` | operator phase control |
| `GET /admin/events/{id}/overview` | `X-Admin-Key` | phase + inventory + sessions by state + policy decisions by action + resilience + queue backend |
| `GET /integration/sessions?event_id=` | `X-Integration-Key` | **real live session ids** (telemetry roster for Person 2) |
| `POST /integration/ml/sync` | `X-Integration-Key` | pull P2 RiskEvents; events whose `session_id` is not a live session are **skipped** (`skipped_no_live_session`), never applied |

Policy parking: CHALLENGE / QUARANTINE / REJECT remove the session from the admission queue (original draw rank is remembered and restored on recovery); THROTTLE keeps its place and is rate-limited per `POLICY_THROTTLE_ADMIT_INTERVAL_SECONDS`. The draw itself (`eligible` list, `shuffleSeed`) is never altered by policy.

Optional background sync: `ML_SYNC_INTERVAL_SECONDS > 0` with `ML_API_URL` set starts `app/workers/ml_sync.py`, which calls the same `sync_from_ml` path on a timer (failures are logged and the loop continues).
