// Guided demo controller: 15 steps that drive the REAL runtime (same drop state the customer and admin pages read).
// Nothing here fabricates numbers — each step only issues operator/customer actions and navigates; every figure shown comes from the simulator.
import type { Runtime } from './runtime'
export const DEMO_EVENT = 'ai-frontier-mumbai-2026'
export interface DemoStep { id: string; title: string; say: string; route: (rt: Runtime) => string; enter?: (rt: Runtime) => void; ready: (rt: Runtime, sim: { t: number; el: number }) => boolean }
const simOf = (rt: Runtime) => rt.drops.get(DEMO_EVENT)
const real = (rt: Runtime) => rt.clock - rt.demo.sinceReal
const simDwell = (rt: Runtime) => (simOf(rt)?.t ?? 0) - rt.demo.sinceSim
function tryBuy(rt: Runtime) {
  if (rt.demo.bookingId) return
  const st = rt.status(DEMO_EVENT); if (!st) return
  if (st.sess.st === 'ADMITTED' || st.sess.st === 'ALLOCATING') {
    const h = st.sess.hold ? rt.holdInfo(DEMO_EVENT, st.sess.hold) : null
    let holdId = h?.id
    if (!holdId) { const r = rt.hold(DEMO_EVENT, 0, 1); if (r.ok) holdId = r.hold.id }
    if (holdId) { const c = rt.confirmDrop(DEMO_EVENT, holdId, 'Demo payment'); if (c.ok) rt.demo.bookingId = c.booking.id }
  }
}
export const STEPS: DemoStep[] = [
  { id: 'discover', title: 'Discover the event', say: 'A customer finds a high-demand event: 500 seats, tens of thousands of people.', route: () => `/events/${DEMO_EVENT}`, ready: rt => real(rt) >= 5 },
  { id: 'open', title: 'Open the drop', say: 'Operator opens the pre-queue. A commitment to the random seed is published BEFORE anyone joins. The demo attendee joins through the Guided Walkthrough lane.', route: () => '/admin/drop', enter: rt => { rt.operate(DEMO_EVENT, 'open'); rt.join(DEMO_EVENT, true) }, ready: rt => real(rt) >= 4 },
  { id: 'normal', title: 'Normal traffic', say: 'Legitimate users arrive. Everyone who joins the window is equal — arrival time is not an input.', route: () => '/admin/traffic', ready: (rt, s) => s.el >= 12 },
  { id: 'flash', title: 'Flash crowd', say: 'The crowd peaks. Load rises, but the platform stays healthy: requests are shed and joins buffered, never dropped silently.', route: () => '/admin/traffic', ready: (rt, s) => s.el >= 24 },
  { id: 'attack', title: 'Attack begins', say: 'A distributed botnet launches: many low-rate sources moving in lockstep, trying to win seats.', route: () => '/admin/attacks', enter: rt => rt.startAttack(DEMO_EVENT, 'DISTRIBUTED'), ready: rt => simDwell(rt) >= 8 },
  { id: 'detect', title: 'Behavioral detection', say: 'Advisory ML scores sessions on behaviour, not IP. Deterministic policy decides: challenge, throttle or quarantine.', route: () => '/admin/intelligence', ready: (rt) => (simOf(rt)?.frame?.campaigns ?? 0) > 0 || simDwell(rt) >= 24 },
  { id: 'campaign', title: 'Campaign correlation', say: 'Individually quiet sessions are linked into campaigns by shared device and behavioural fingerprints.', route: () => '/admin/campaigns', ready: rt => simDwell(rt) >= 8 },
  { id: 'mitigate', title: 'Mitigation', say: 'The incident log shows evidence → action → result for each mitigation. Legitimate users keep flowing.', route: () => '/admin/incidents', ready: (rt, s) => simDwell(rt) >= 8 && s.el >= 58 },
  { id: 'close', title: 'Pre-queue closes', say: 'Entry window closes. Identity clusters are de-duplicated and the eligible set is hashed into a Merkle-style root.', route: () => '/admin/admission/prequeue', enter: rt => { rt.operate(DEMO_EVENT, 'close') }, ready: rt => real(rt) >= 5 },
  { id: 'randomize', title: 'Randomization', say: 'The committed seed is revealed and a deterministic shuffle fixes the admission order. Anyone can recompute it.', route: () => '/admin/admission/randomization', enter: rt => { rt.operate(DEMO_EVENT, 'randomize') }, ready: rt => real(rt) >= 5 },
  { id: 'admit', title: 'Controlled admission', say: 'Participants are admitted in shuffled order at a controlled rate, gated by remaining inventory — no speed race inside the admitted cohort.', route: () => '/admin/admission', enter: rt => { rt.operate(DEMO_EVENT, 'admit') }, ready: rt => simDwell(rt) >= 12 },
  { id: 'allocate', title: 'Ticket allocation', say: 'Admitted users hold and confirm seats. The demo attendee completes a purchase automatically.', route: () => '/admin/allocations', ready: rt => { tryBuy(rt); return !!rt.demo.bookingId && simDwell(rt) >= 8 } },
  { id: 'integrity', title: 'Inventory integrity', say: 'AVAILABLE + HELD + CONFIRMED always equals TOTAL. Idempotent retries never double-allocate. Oversell is 0.', route: () => '/admin/allocations?focus=integrity', ready: rt => { const s = simOf(rt); if (s && s.phase !== 'ENDED' && simDwell(rt) >= 40) s.endDrop(); return !!s && (s.phase === 'ENDED' || s.inv.stats().confirmed >= s.inv.total) && real(rt) >= 5 } },
  { id: 'fairness', title: 'Fairness comparison', say: 'The simulator replays the SAME crowd three ways: legitimate only, legitimate + attack, and a naive first-come baseline. The advantage is computed, not asserted.', route: () => '/admin/fairness', enter: rt => { if (!rt.experiment) void rt.runExperiment({ ...rt.labCfg, scenario: 'DISTRIBUTED' } as never) }, ready: rt => !rt.experimentRunning && !!rt.experiment && real(rt) >= 6 },
  { id: 'verify', title: 'Verification proof', say: 'The attendee verifies the allocation: commitment → seed → shuffle → position. Tamper with the seed and verification fails.', route: rt => rt.demo.bookingId ? `/verify/${rt.demo.bookingId}` : '/tickets', ready: () => false },
]
export function startDemo(rt: Runtime) {
  const d = rt.demo; d.prevSpeed = rt.speed; d.bookingId = ''; d.done = false
  if (!rt.user) rt.signIn({ name: 'Demo Attendee', email: 'demo.attendee@fairdrop.demo' })
  if (!rt.adminAuthed) { rt.setAdmin(true); d.adminByDemo = true }
  rt.experiment = null
  rt.resetDrop(DEMO_EVENT, { scenario: 'NORMAL', autopilot: false, mode: 'FAIR', detect: true, legit: 40000, autoPct: 0.25 }); rt.manual.add(DEMO_EVENT)
  rt.currentDrop = DEMO_EVENT; rt.setSpeed(4); rt.setPaused(false)
  d.active = true; d.idx = 0; goStep(rt, 0)
}
export function goStep(rt: Runtime, i: number) {
  const d = rt.demo; d.idx = Math.max(0, Math.min(STEPS.length - 1, i)); d.sinceReal = rt.clock; d.sinceSim = simOf(rt)?.t ?? 0
  try { STEPS[d.idx].enter?.(rt) } catch { /* a step action failing must never break the tour */ }
  rt.emit()
}
export function stopDemo(rt: Runtime) { const d = rt.demo; d.active = false; rt.setSpeed(d.prevSpeed || 1); if (d.adminByDemo) { rt.setAdmin(false); d.adminByDemo = false } rt.emit() }
/** called once per runtime tick by the HUD; advances automatically when the step's readiness condition holds */
export function tickDemo(rt: Runtime) {
  const d = rt.demo; if (!d.active || rt.paused) return; const sim = simOf(rt); if (!sim) return
  const step = STEPS[d.idx]; if (d.idx < STEPS.length - 1 && step.ready(rt, { t: sim.t, el: sim.el })) goStep(rt, d.idx + 1)
  else if (d.idx === STEPS.length - 1) step.ready(rt, { t: sim.t, el: sim.el })
}
