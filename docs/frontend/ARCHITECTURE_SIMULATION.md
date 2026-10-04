# ARCHITECTURE

```
CUSTOMER (app/(site)/*)  ─┐
                          ├─►  services/fairdrop.ts  ─►  lib/runtime.ts (Runtime, globalThis singleton)  ─►  lib/engine/* (DropSim, Inventory, ml, shuffle…)
ADMIN (app/admin/*)      ─┘                                       ▲
                                                                  └─ same DropSim per event, same clock, same Inventory
```
- **One drop state.** `Runtime.drops` holds one `DropSim` per event; customer pages join/hold/confirm against it, admin pages operate and observe it (`useOps()` in `components/admin/kit.tsx`). Client-side navigation between `/` and `/admin` keeps the same instance; a hard reload creates a fresh simulated drop (no server persistence).
- **Mutations** go through `service.operate`/`Runtime` methods; admin pages never edit engine internals except documented simulator controls (`setSurge`, `setMl`, `stopAttack`).
- **Engine.** `DropSim.step()` runs once per runtime tick (1 Hz × speed). Frames (`Frame`) feed every chart. `SimResult` (`sim.result()`) provides outcome metrics. Ground truth (which sessions are bots) exists only inside the simulator and is shown on admin pages explicitly labelled admin-only.
- **Policy vs ML.** `ml.ts` outputs advisory risk/anomaly scores + evidence; `drop.ts` applies deterministic thresholds (challenge/throttle/quarantine/reject). ML never touches inventory; an ML outage falls back to rules.
- **Inventory.** AVAILABLE→HELD→CONFIRMED with idempotency keys and TTL expiry; invariant checked on every `stats()`.
- **Verification.** `commitment = SHA-256("commit:"+seed)`; `root` over the sorted eligible list; `shuffleSeed = SHA-256("shuffle:"+seed+":"+root)`; Fisher–Yates over a SHA-256 counter stream. *Verification limits:* no external randomness beacon, no protection against an operator picking the seed before committing, no zero-knowledge properties; the guided-walkthrough lane insertions are declared in the bundle.
- **Auth.** `middleware.ts` gates `/admin/*` on cookie `fd_admin`; `(console)/layout.tsx` re-checks client side. Demo only.
- **Reports.** `lib/genai/report.ts` — `buildContext`/`renderReport` (observed/interpretation) and `structuredReport` (9 sections). Deterministic; an LLM renderer could replace the renderer without changing the context object.
- **Backend swap.** `API_CONTRACT` in `services/fairdrop.ts` lists REST/WS endpoints the Runtime mirrors; `probeBackend()` is shown on System Health.

## Simulation integration slot
`/admin/simulation` renders `components/simulation/SimulationPage.tsx` inside the admin shell. The teammate replaces that component (header comment documents the contract: `useRT()`, `rt.drops.get(rt.currentDrop)`, `service.*`, `rt.runExperiment`, `sim.frame/frames/result()`). Navigation entry already exists (Overview ▾ → Simulation). No competing simulation UI is built.
