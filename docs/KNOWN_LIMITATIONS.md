# Known limitations (honest status)

**Not verified / not claimed**
1. Docker / `docker-compose.yml` were not run (no Docker in the build sandbox).
2. No throughput, latency or capacity figure was measured. "10M users" is a design target, not a result. `backend/benchmarks/load_test.py` exists but no published number comes from it.
3. Multi-worker deployments must use `REDIS_REQUIRED=true` with managed Redis; with Redis down each worker falls back to its own in-process queue (correct for a single process only).
4. Policy thresholds are explicit versioned defaults, not tuned on measured data.

**Integration limits**
5. Person 2 cannot score live telemetry: it serves an exported file whose RiskEvents reference simulator sessions. The pull-sync therefore applies nothing to live customers; the production path is exercised with the labelled replay script and the `/integration/risk-events` contract. A real-time scorer would plug in via `GET /integration/sessions` + `POST /integration/risk-events`.
6. Customer identity is demo-grade: sign-in is name + e-mail stored in the browser (no password/OTP). The backend session credential is shown once and kept in localStorage — losing it locks that account out of that drop (by design: one entry per person).
7. Organizer login is the original fixed demo credential (override with env). The proxy now requires a signed httpOnly cookie for organizer routes and injects the backend keys server-side, but this is still not production authentication (no per-user accounts, MFA, rate limiting on the login route).
8. Live mode sells one ticket per hold (`maxQty = 1`); payment is a demo (no money, no payment provider).
9. Live mode uses the pseudonymous id `u_<sha256(email)[:24]>`; it is not an anti-sybil identity check.
10. Live mode runs one provisioned event per catalogue drop (seats = catalogue capacity minus pre-sold). The simulator and the live backend never share state; the attack lab is simulator-only.
