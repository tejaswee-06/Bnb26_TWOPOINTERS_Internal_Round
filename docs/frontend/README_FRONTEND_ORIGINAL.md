# FAIR DROP

Fair, verifiable allocation of scarce tickets: **500 seats, 50,000 people, bots don't win.**
Two products share one drop state: a **customer marketplace** and a separate **Fair Drop Operations** console.
All traffic, users, inventory and latency are **SIMULATED** by an in-browser engine (no external database, Redis or realtime service).

## Setup & run
```bash
npm ci
npm run dev            # http://localhost:3000
# or production
npm run build && npm start -- -p 3100
```
Node 18+. `.env.example` documents the single optional variable (`NEXT_PUBLIC_FAIRDROP_API`, a backend `/health` probe shown on System Health).

## Customer product (`app/(site)/*`)
Homepage, search/autocomplete, city selector, categories, event catalogue and details, then the full Fair Drop journey:
join → verification → pre-queue → randomized admission → ticket selection → hold → payment → confirmation → allocation verification; plus My Tickets, Offers, How It Works, accessibility panel (theme, text size, contrast, motion, dyslexia font, read-aloud).
The ☰ menu contains a distinct **ADMIN ACCESS** item that goes straight to `/admin/login` (it is deliberately not in the main navbar).

## Admin product — Fair Drop Operations (`app/admin/*`)
Login: `/admin/login` → protected console `/admin`. Logout returns to `/admin/login`.

| | |
|---|---|
| **Email** | `admin@fairdrop.demo` |
| **Password** | `FairDrop@2026` |

Demo-grade auth only (cookie `fd_admin` checked by `middleware.ts` + client guard). **Not production authentication.**

Horizontal command navigation (no sidebar): Overview ▾ · Traffic ▾ · Intelligence ▾ · Admission ▾ · Fairness ▾ · Operations ▾, plus current-drop selector, LIVE/SIMULATION state, admin identity and logout.

| Group | Pages (route) — the question each answers |
|---|---|
| Overview | Overview `/admin` (is it healthy?) · Drop Control `/admin/drop` (operate lifecycle) · Simulation `/admin/simulation` (**integration slot**) |
| Traffic | Live Traffic `/admin/traffic` · Queue `/admin/traffic/queue` · Load Lab `/admin/traffic/load` |
| Intelligence | Detection `/admin/intelligence` · Campaigns `/admin/campaigns` · Attack Lab `/admin/attacks` · Risk Signals `/admin/intelligence/signals` |
| Admission | Pre-Queue `/admin/admission/prequeue` · Randomization `/admin/admission/randomization` · Admission `/admin/admission` · Allocations `/admin/allocations` |
| Fairness | Fairness Lab `/admin/fairness` · Allocation Advantage `/admin/fairness/advantage` · Verification `/admin/verification` |
| Operations | Incidents `/admin/incidents` · System Health `/admin/system` · Reports `/admin/reports` |

## Engine (`lib/engine/*`)
SHA-256 + HMAC signed tokens, deterministic seeded RNG, commit-reveal Fisher–Yates shuffle, atomic idempotent inventory
(`CONFIRMED + HELD + AVAILABLE = TOTAL`), drop state machine, population generator (humans and nine attack scenarios),
advisory ML (logistic risk model + Isolation Forest) with **deterministic policy enforcement**, counterfactual fairness experiments.

## Fairness
`runCounterfactual` runs the engine three times on an identical legitimate crowd: **World A** (legit only), **World B** (legit + attack, Fair Drop) and a **naive first-come baseline** (same attack).
**Attack Allocation Advantage (AAA)** = bot share of seats ÷ bot share of identities (1.00× = no advantage). Nothing is hard-coded; the admin pages show nothing until an experiment has been computed.

## Attacks
Normal, speed bots, request flood, multi-session, queue jump, distributed, low-and-slow, reconnect, adaptive. The Attack Lab shows attack → detection → mitigation → queue effect → admission effect → allocation effect from live engine results.

## Allocation & verification
Allocations page shows the live allocation stream (allocation ID, session, ticket, state, time, idempotency key) and the inventory invariant. Verification re-derives commitment → seed → shuffle → position and demonstrates tamper detection.
**Limits:** hash commitment only — no external randomness beacon, no ZK/on-chain proof; a malicious operator choosing the seed before committing is out of scope.

## Reports
`/admin/reports` builds a structured drop report (what happened, traffic, abuse, mitigation, admission, allocations, fairness, integrity, outcome) from telemetry via `lib/genai/report.ts`. It is a **deterministic template** — no LLM is called in this build; download as Markdown or print.

## Tests
```bash
npm run build && npm start -- -p 3100 &
BASE=http://localhost:3100 python3 tests/e2e/customer.py   # customer journey, 30 checks (regression gate)
BASE=http://localhost:3100 python3 tests/e2e/admin.py      # admin portal, 50 checks
npx tsc --noEmit
```
Needs Python Playwright + Chromium.

## Packaging
`scripts/package.sh NAME` → source-only ZIP (no node_modules/.next/.env).

## Known limitations
Demo auth; state lives in the browser (a hard reload resets the simulated drop; the admin session and customer bookings persist in localStorage); no real database/Redis/WebSocket; latency/load are modelled; the simulation page is an integration slot.
