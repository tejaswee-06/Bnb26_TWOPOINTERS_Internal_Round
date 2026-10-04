# Deterministic policy `policy-v1`

Pure function `evaluate_risk_event(event, history, config)` in `app/policy/engine.py`: no I/O, no clock, no randomness. Highest severity among matched rules wins (NORMAL < CHALLENGE < THROTTLE < QUARANTINE < REJECT). Every rule threshold is a setting (`POLICY_*` in `.env.example`).

| Rule | Condition | Action |
|---|---|---|
| R1 | evidence contains any tag in `POLICY_HARD_EVIDENCE` | REJECT |
| R2 | risk ≥ 0.99 **and** (anomaly ≥ 0.80 or coordination ≥ 0.90) | REJECT |
| R3 | risk ≥ 0.90 / 0.75 / 0.50 | QUARANTINE / THROTTLE / CHALLENGE |
| R4 | anomaly ≥ 0.80 (alone) | CHALLENGE (anomaly alone is capped) |
| R5 | coordination ≥ 0.90, alone | THROTTLE (capped: Person 2's data contains human+human pairs) |
| R5 | …corroborated (risk ≥ 0.5 or anomaly ≥ 0.8, now or earlier) or repeated (≥ 2 events for the session) | QUARANTINE |
| R6 | campaign has ≥ 5 flagged sessions | at least THROTTLE |

Null scores are skipped, not defaulted. Decisions are stored in `policy_decisions` (session, ticket event, RiskEvent id, action, reason, rules fired, evidence, scores, campaign, attack type, model version, policy version, timestamps, expiry) and mirrored into the hash-chained audit log as `POLICY_DECISION`.
Effective action = highest-severity unexpired decision; a solved challenge clears earlier CHALLENGE decisions only; a later weaker event never downgrades a stronger one; decay is by TTL.
Enforcement reads the stored decision (never ML) at admit, hold and confirm. A policy block on confirm leaves the hold to expire normally — policy never rewrites inventory rows.
Thresholds are defensible defaults, **not tuned on measured data**; tune against Person 2's evaluation before claiming accuracy.
