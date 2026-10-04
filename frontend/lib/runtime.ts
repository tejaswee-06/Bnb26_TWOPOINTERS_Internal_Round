'use client'
// Client runtime: owns every DropSim, the shared clock, the signed-in customer, bookings and experiments.
// UI never reaches into engine internals directly for *mutations* — it calls the service methods below (mirrors the API contract in service.ts).
import { DropSim, defaultConfig, sidOf } from './engine/drop'
import { Inventory } from './engine/inventory'
import { EVENTS, FDEvent, eventById } from './data/events'
import { DropConfig, Scenario } from './engine/types'
import { ProofBundle, verifyBundle } from './engine/shuffle'
import type { Experiment } from './engine/experiment'
import { LIVE } from './live/config'
import { LiveDrop, userIdFor } from './live/liveDrop'
import { api } from './live/api'

export interface User { name: string; email: string }
export interface Booking {
  id: string; allocationId: string; eventId: string; eventTitle: string; typeId: string; typeName: string; qty: number; unitPrice: number; fees: number; gst: number; total: number
  method: string; name: string; email: string; sid: string; at: string; mode: 'DROP' | 'DIRECT'; position: number; pool: number; guided: boolean; holdId: string
  proof?: ProofBundle; claimId?: number | string; hasEligible?: boolean; live?: boolean
}
export interface Participation { eventId: string; sid: string; label: string; guided: boolean; joinedAtT: number }
const LS = { user: 'fd-user', bookings: 'fd-bookings', elig: 'fd-elig', admin: 'fd-admin-session' }
function lsGet<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d } catch { return d } }
function lsSet(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* quota / private mode: runtime keeps working in-memory */ } }
export const fees = (sub: number) => { const fee = Math.round(sub * 0.04), gst = Math.round(fee * 0.18); return { fee, gst, total: sub + fee + gst } }

export class Runtime {
  drops = new Map<string, DropSim>(); manual = new Set<string>(); invs = new Map<string, Inventory>(); private directHolds = new Map<string, { eventId: string; holdId: string }>()
  speed = 1; paused = false; clock = 0; currentDrop = 'ai-frontier-mumbai-2026'
  version = 0; private listeners = new Set<() => void>()
  user: User | null = null; bookings: Booking[] = []; parts = new Map<string, Participation>()
  experiment: Experiment | null = null; experimentRunning = false; experimentProgress = { p: 0, msg: '' }
  demo: { active: boolean; idx: number; sinceSim: number; sinceReal: number; bookingId: string; prevSpeed: number; adminByDemo: boolean; done: boolean } = { active: false, idx: 0, sinceSim: 0, sinceReal: 0, bookingId: '', prevSpeed: 1, adminByDemo: false, done: false }
  adminAuthed = false; labCfg: Partial<DropConfig> = { scenario: 'SPEED', legit: 40000, autoPct: 0.25, mult: 3, surge: 1, botRate: 1 }
  private timer: ReturnType<typeof setInterval> | null = null
  constructor() { this.user = lsGet<User | null>(LS.user, null); this.bookings = lsGet<Booking[]>(LS.bookings, []); this.adminAuthed = lsGet<boolean>(LS.admin, false) }
  // ---- external-store plumbing ----
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  getVersion = () => this.version
  emit() { this.version++; this.listeners.forEach(l => l()) }
  start() { if (this.timer) return; this.timer = setInterval(() => this.tick(), 1000) }
  tick() {
    if (LIVE) this.pollLive()
    if (this.paused) return
    this.clock++
    let changed = false
    this.drops.forEach(sim => { if (sim.phase !== 'PREPARED' && sim.phase !== 'ENDED') { for (let i = 0; i < this.speed; i++) { sim.step(); if ((sim.phase as string) === 'ENDED') break } changed = true } })
    this.invs.forEach(inv => inv.expireDue(this.clock))
    this.emit(); void changed
  }
  setSpeed(x: number) { this.speed = x; this.emit() }
  setPaused(p: boolean) { this.paused = p; this.emit() }

  // ---- drops ----
  cfgFor(e: FDEvent, patch: Partial<DropConfig> = {}): DropConfig {
    return defaultConfig({ eventId: e.id, title: e.title, types: e.ticketTypes, legit: e.drop?.participants ?? 10000, seed: 'fd-' + e.id, ...patch })
  }
  ensureDrop(eventId: string, o: { autoOpen?: boolean } = {}): DropSim | null {
    const e = eventById(eventId); if (!e || !e.drop) return null
    let sim = this.drops.get(eventId)
    if (!sim) { sim = new DropSim(this.cfgFor(e)); this.drops.set(eventId, sim); this.pruneDrops(eventId) }
    if (o.autoOpen && e.dropStatus === 'LIVE' && sim.phase === 'PREPARED' && !this.manual.has(eventId)) { sim.openPreQueue(); this.emit() }
    return sim
  }
  private pruneDrops(keep: string) { if (this.drops.size > 3) for (const [k] of this.drops) { if (k !== keep && k !== this.currentDrop && !this.parts.has(k)) { this.drops.delete(k); break } } }
  resetDrop(eventId: string, patch: Partial<DropConfig> = {}) {
    const e = eventById(eventId); if (!e || !e.drop) return null
    const old = this.drops.get(eventId); const keep = old ? { ...old.cfg } : {}
    const sim = new DropSim(this.cfgFor(e, { ...keep, ...patch, eventId, title: e.title, types: e.ticketTypes })); this.drops.set(eventId, sim)
    this.parts.delete(eventId); this.emit(); return sim
  }
  setCurrent(eventId: string) { if (eventById(eventId)?.drop) { this.currentDrop = eventId; this.ensureDrop(eventId); this.emit() } }
  get current(): DropSim | null { return this.drops.get(this.currentDrop) ?? null }
  /** operator action on a drop (manual control disables autopilot) */
  operate(eventId: string, action: 'open' | 'close' | 'randomize' | 'admit' | 'pause' | 'end' | 'prepare'): string | null {
    const sim = this.ensureDrop(eventId); if (!sim) return 'No such drop'
    if (action !== 'prepare') { this.manual.add(eventId); sim.cfg.autopilot = false }
    let err: string | null = null
    switch (action) {
      case 'prepare': err = sim.phase === 'PREPARED' ? null : 'Already prepared — use Reset to prepare a fresh drop'; break
      case 'open': err = sim.openPreQueue(); break
      case 'close': err = sim.closePreQueue(); break
      case 'randomize': err = sim.randomize(); break
      case 'admit': err = sim.phase === 'PAUSED' || sim.phase === 'RANDOMIZED' ? sim.startAdmission() : 'Randomize first'; break
      case 'pause': err = sim.pauseAdmission(); break
      case 'end': err = sim.endDrop(); break
    }
    this.emit(); return err
  }
  setAutopilot(eventId: string, on: boolean) { const s = this.ensureDrop(eventId); if (!s) return; s.cfg.autopilot = on; if (on) this.manual.delete(eventId); else this.manual.add(eventId); this.emit() }
  startAttack(eventId: string, sc: Scenario, patch: Partial<DropConfig> = {}) {
    const s = this.ensureDrop(eventId); if (!s) return
    if (s.phase === 'PREPARED') { Object.assign(s.cfg, patch, { scenario: sc }) } else s.startAttack(sc, patch)
    this.emit()
  }

  // ---- live mode (Person-1 backend through the Next.js proxy) ----
  live = new Map<string, LiveDrop>(); liveTick = 0
  get isLive() { return LIVE }
  get liveUserId() { return this.user ? userIdFor(this.user.email) : 'u_anonymous' }
  /** LiveDrop for an event (created lazily; re-created when the signed-in user changes). Anonymous visitors get a read-only view. */
  liveFor(eventId: string): LiveDrop | null {
    const e = eventById(eventId); if (!LIVE || !e || !e.drop) return null
    let ld = this.live.get(eventId)
    if (!ld || ld.userId !== this.liveUserId) { ld = new LiveDrop(eventId, this.liveUserId, e); this.live.set(eventId, ld); void ld.ensure(false).then(() => ld!.refresh()).then(() => this.emit()) }
    return ld
  }
  private pollLive() { if (++this.liveTick % 2) return; this.live.forEach(ld => { void ld.refresh().then(ch => { if (ch) this.emit() }) }) }
  async joinLive(eventId: string): Promise<{ ok: true; replay: boolean } | { ok: false; reason: string; detail?: string }> {
    const ld = this.liveFor(eventId); if (!ld) return { ok: false, reason: 'NO_DROP' }
    await ld.ensure(true); const r = await ld.join(); this.emit(); return r
  }
  async holdLive(eventId: string, typeIdx: number) { const ld = this.liveFor(eventId); if (!ld) return { ok: false as const, reason: 'NO_SESSION' }; const r = await ld.hold(typeIdx); this.emit(); return r }
  async releaseLive(eventId: string, holdId: string) { const ld = this.liveFor(eventId); const ok = ld ? await ld.release(holdId) : false; this.emit(); return ok }
  async confirmLive(eventId: string, holdId: string, method: string): Promise<{ ok: true; booking: Booking } | { ok: false; reason: string }> {
    const ld = this.liveFor(eventId), e = eventById(eventId); if (!ld || !e || !ld.hasSession) return { ok: false, reason: 'NO_SESSION' }
    const r = await ld.confirm(holdId); if (!r.ok) { this.emit(); return { ok: false, reason: r.reason } }
    const allocId = 'RS-' + holdId, ex = this.bookings.find(b => b.allocationId === allocId); if (ex) return { ok: true, booking: ex }
    const ty = e.ticketTypes[r.hold.typeIdx], f = fees(ty.price * r.hold.qty), sess = ld.sessionById()!
    const b: Booking = { id: 'BK-' + (1000000 + this.bookings.length * 7919 + sess.id).toString(36).toUpperCase(), allocationId: allocId, eventId, eventTitle: e.title, typeId: ty.id, typeName: ty.name, qty: r.hold.qty, unitPrice: ty.price, fees: f.fee, gst: f.gst, total: f.total, method, name: this.user?.name || 'Guest', email: this.user?.email || 'guest@fairdrop.demo', sid: ld.sid, at: new Date().toISOString(), mode: 'DROP', position: sess.pos, pool: ld.eligibleCount, guided: false, holdId, proof: ld.proof ? { ...ld.proof } : undefined, claimId: ld.sid, hasEligible: true, live: true }
    this.saveBooking(b, ld.eligibleIds); this.emit(); return { ok: true, booking: b }
  }
  async liveAdminLogin(email: string, pw: string) { const r = await api('POST', 'adminauth/login', { email, password: pw }); return r.ok }
  async liveAdminLogout() { await api('POST', 'adminauth/logout') }

  // ---- identity ----
  signIn(u: User) { this.user = u; lsSet(LS.user, u); this.emit() }
  signOut() { this.user = null; try { localStorage.removeItem(LS.user) } catch { /* ignore */ } this.emit() }
  adminLogin(email: string, pw: string) { const ok = email.trim().toLowerCase() === 'admin@fairdrop.demo' && pw === 'FairDrop@2026'; if (ok) this.setAdmin(true); return ok }
  setAdmin(v: boolean) { this.adminAuthed = v; lsSet(LS.admin, v); document.cookie = `fd_admin=${v ? '1' : ''}; path=/; max-age=${v ? 86400 : 0}; samesite=lax`; this.emit() }

  // ---- customer service (server-authoritative; mirrors POST /events/{id}/join, GET /queue/{session}, POST /reservations …) ----
  private label() { return 'u:' + (this.user?.email || 'guest@fairdrop.demo') }
  join(eventId: string, guided: boolean) {
    const sim = this.ensureDrop(eventId, { autoOpen: true }); if (!sim) return { ok: false as const, reason: 'NO_DROP' as const }
    const r = sim.join(this.label(), { guided }); if (!r.ok) { this.emit(); return r }
    this.parts.set(eventId, { eventId, sid: r.sid, label: this.label(), guided: r.sess.guided, joinedAtT: sim.t }); this.emit(); return r
  }
  participation(eventId: string): Participation | undefined {
    if (LIVE && eventById(eventId)?.drop) { const ld = this.liveFor(eventId); return ld?.hasSession ? { eventId, sid: ld.sid, label: this.label(), guided: false, joinedAtT: 0 } : undefined }
    return this.parts.get(eventId)
  }
  status(eventId: string) {
    if (LIVE && eventById(eventId)?.drop) {
      const ld = this.liveFor(eventId); if (!ld || !ld.hasSession) return null; const s = ld.sessionById(); if (!s) return null
      return { sim: ld as unknown as DropSim, sess: s as unknown as import('./engine/types').Sess, q: ld.queueStatus(s), part: this.participation(eventId)! }
    }
    const sim = this.drops.get(eventId), p = this.parts.get(eventId); if (!sim || !p) return null
    const s = sim.sessionById(p.sid); if (!s) return null
    return { sim, sess: s, q: sim.queueStatus(s), part: p }
  }
  hold(eventId: string, typeIdx: number, qty: number) {
    const st = this.status(eventId); if (!st) return { ok: false as const, reason: 'NO_SESSION' }
    const r = st.sim.holdFor(st.sess, st.q.token, typeIdx, qty, 'ui'); this.emit(); return r
  }
  release(eventId: string, holdId: string) { const st = this.status(eventId); if (!st) return false; const ok = st.sim.releaseFor(st.sess, holdId); this.emit(); return ok }
  holdInfo(eventId: string, holdId: string) { if (LIVE && eventById(eventId)?.drop) return this.live.get(eventId)?.holds.get(holdId) ?? null; const sim = this.drops.get(eventId); return sim?.inv.holds.get(holdId) ?? null }
  confirmDrop(eventId: string, holdId: string, method: string): { ok: true; booking: Booking } | { ok: false; reason: string } {
    const st = this.status(eventId), e = eventById(eventId); if (!st || !e) return { ok: false, reason: 'NO_SESSION' }
    const r = st.sim.confirmFor(st.sess, holdId, 'pay'); if (!r.ok) { this.emit(); return { ok: false, reason: r.reason } }
    const ex = this.bookings.find(b => b.allocationId === r.hold.allocationId); if (ex) return { ok: true, booking: ex }
    const ty = e.ticketTypes[r.hold.typeIdx], f = fees(ty.price * r.hold.qty)
    const b: Booking = { id: 'BK-' + (1000000 + this.bookings.length * 7919 + st.sess.id).toString(36).toUpperCase(), allocationId: r.hold.allocationId!, eventId, eventTitle: e.title, typeId: ty.id, typeName: ty.name, qty: r.hold.qty, unitPrice: ty.price, fees: f.fee, gst: f.gst, total: f.total, method, name: this.user?.name || 'Guest', email: this.user?.email || 'guest@fairdrop.demo', sid: st.part.sid, at: new Date().toISOString(), mode: 'DROP', position: st.sess.pos, pool: st.sim.eligibleIds.length, guided: st.sess.guided, holdId, proof: st.sim.proof ? { ...st.sim.proof } : undefined, claimId: st.sess.id, hasEligible: true }
    this.saveBooking(b, st.sim.eligibleIds); this.emit(); return { ok: true, booking: b }
  }
  private saveBooking(b: Booking, eligible?: (number | string)[]) {
    this.bookings = [b, ...this.bookings.filter(x => x.id !== b.id)]; lsSet(LS.bookings, this.bookings)
    if (eligible) { const m = lsGet<Record<string, (number | string)[]>>(LS.elig, {}); m[b.allocationId] = eligible; const keys = Object.keys(m); while (keys.length > 2) delete m[keys.shift()!]; lsSet(LS.elig, m); this.bookings.forEach(x => { if (x.mode === 'DROP') x.hasEligible = !!m[x.allocationId] }); lsSet(LS.bookings, this.bookings) }
  }
  eligibleFor(b: Booking): (number | string)[] | null { const m = lsGet<Record<string, (number | string)[]>>(LS.elig, {}); return m[b.allocationId] ?? null }
  booking(id: string) { return this.bookings.find(b => b.id === id || b.allocationId === id) ?? null }
  // direct sale (non-drop events): plain atomic inventory, no queue
  directInv(eventId: string) { let inv = this.invs.get(eventId); const e = eventById(eventId); if (!inv && e) { inv = new Inventory(e.ticketTypes, e.presold); this.invs.set(eventId, inv) } return inv ?? null }
  directHold(eventId: string, typeIdx: number, qty: number) { const inv = this.directInv(eventId); if (!inv) return { ok: false as const, reason: 'NO_EVENT' }; const k = `${this.label()}:${eventId}:${typeIdx}:${qty}:${this.clock}`; const r = inv.hold(0, typeIdx, qty, k, this.clock, 180); if (r.ok) this.directHolds.set(r.hold.id, { eventId, holdId: r.hold.id }); this.emit(); return r }
  directConfirm(eventId: string, holdId: string, method: string): { ok: true; booking: Booking } | { ok: false; reason: string } {
    const inv = this.directInv(eventId), e = eventById(eventId); if (!inv || !e) return { ok: false, reason: 'NO_EVENT' }
    const r = inv.confirm(holdId, 'pay:' + holdId, this.clock); if (!r.ok) { this.emit(); return { ok: false, reason: r.reason } }
    const ex = this.bookings.find(b => b.holdId === holdId); if (ex) return { ok: true, booking: ex }
    const ty = e.ticketTypes[r.hold.typeIdx], f = fees(ty.price * r.hold.qty)
    const b: Booking = { id: 'BK-' + (2000000 + this.bookings.length * 7919).toString(36).toUpperCase(), allocationId: r.hold.allocationId!, eventId, eventTitle: e.title, typeId: ty.id, typeName: ty.name, qty: r.hold.qty, unitPrice: ty.price, fees: f.fee, gst: f.gst, total: f.total, method, name: this.user?.name || 'Guest', email: this.user?.email || 'guest@fairdrop.demo', sid: '—', at: new Date().toISOString(), mode: 'DIRECT', position: 0, pool: 0, guided: false, holdId }
    this.saveBooking(b); this.emit(); return { ok: true, booking: b }
  }
  availability(e: FDEvent): { available: number; total: number } {
    if (LIVE && e.drop) { const ld = this.liveFor(e.id); const i = ld?.info?.inventory; if (i) return { available: i.available + i.held, total: i.total } }
    const sim = this.drops.get(e.id); if (sim) { const s = sim.inv.stats(); return { available: s.available + s.held, total: s.total } }
    const inv = this.invs.get(e.id); if (inv) { const s = inv.stats(); return { available: s.available + s.held, total: s.total } }
    return { available: e.availableTickets, total: e.totalTickets }
  }
  /** per-ticket-type live stock (drop inventory if a drop exists, else direct inventory) */
  stock(e: FDEvent) {
    if (LIVE && e.drop) { const ld = this.liveFor(e.id); if (ld?.info) return ld.inv.stats().byType.map((t, i) => ({ ...e.ticketTypes[i], available: t.available, held: t.held, confirmed: t.confirmed })) }
    const sim = this.drops.get(e.id); const inv = sim?.inv ?? (e.dropStatus === 'ON_SALE' ? this.directInv(e.id) : null)
    if (inv) return inv.stats().byType.map((t, i) => ({ ...e.ticketTypes[i], available: t.available, held: t.held, confirmed: t.confirmed }))
    return e.ticketTypes.map((t, i) => ({ ...t, available: Math.max(0, t.cap - (e.presold[i] || 0)), held: 0, confirmed: 0 }))
  }
  verifyBooking(b: Booking, tamper?: 'seed' | 'list') {
    if (!b.proof) return null; const elig = this.eligibleFor(b); if (!elig) return { missing: true as const }
    const bundle: ProofBundle = { ...b.proof }; let list = elig
    if (tamper === 'seed') bundle.serverSeed = bundle.serverSeed.slice(0, -1) + (bundle.serverSeed.endsWith('0') ? '1' : '0')
    if (tamper === 'list') list = elig.slice(1)
    return { missing: false as const, res: verifyBundle(bundle, list, b.claimId ? { id: b.claimId, position: b.position } : undefined) }
  }

  // ---- experiments ----
  async runExperiment(cfg: Partial<DropConfig> & { scenario: Scenario }) {
    if (this.experimentRunning) return; this.experimentRunning = true; this.experimentProgress = { p: 0, msg: 'starting' }; this.emit()
    const { runCounterfactual } = await import('./engine/experiment')
    try { this.experiment = await runCounterfactual(cfg, (p, msg) => { this.experimentProgress = { p, msg }; this.emit() }) } finally { this.experimentRunning = false; this.emit() }
  }
}
declare global { var __fdrt: Runtime | undefined }
export function getRT(): Runtime | null { if (typeof window === 'undefined') return null; if (!globalThis.__fdrt) { globalThis.__fdrt = new Runtime(); globalThis.__fdrt.start() } return globalThis.__fdrt }
export { sidOf, EVENTS }
