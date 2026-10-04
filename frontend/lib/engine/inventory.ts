// Authoritative inventory: AVAILABLE → HELD → CONFIRMED (+ expiry/release back to AVAILABLE).
// Invariant per ticket type and in total: CONFIRMED + HELD + AVAILABLE = TOTAL.
// Operations are atomic (single check-and-set), idempotent (idempotency keys) and server-validated.
// Mirrors the backend contract: POST /allocation/hold · /allocation/confirm · /allocation/release · GET /inventory/stats/{event_id}.
export interface TicketType { id: string; name: string; price: number; cap: number; perks: string }
export type HoldState = 'HELD' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED'
export interface Hold { id: string; sid: number; typeIdx: number; qty: number; state: HoldState; created: number; expires: number; idem: string; allocationId?: string; confirmedAt?: number; confirmIdem?: string }
export type HoldResult = { ok: true; hold: Hold; replay: boolean } | { ok: false; reason: 'SOLD_OUT' | 'INSUFFICIENT' | 'BAD_REQUEST' }
export type ConfirmResult = { ok: true; hold: Hold; replay: boolean } | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'RELEASED' }
export interface InvStats { total: number; available: number; held: number; confirmed: number; integrity: boolean; byType: { id: string; name: string; price: number; total: number; available: number; held: number; confirmed: number }[]; oversell: number }
export class Inventory {
  avail: number[]; held: number[]; conf: number[]
  holds = new Map<string, Hold>(); private idem = new Map<string, string>()
  private activeQ: Hold[] = []; private qHead = 0
  private seq = 0; private allocSeq = 0
  counters = { holdAttempts: 0, holdGranted: 0, replays: 0, rejected: 0, expired: 0, released: 0, confirmed: 0 }
  constructor(public types: TicketType[], preConfirmed: number[] = []) { this.conf = types.map((_, i) => Math.min(types[i].cap, preConfirmed[i] || 0)); this.avail = types.map((t, i) => t.cap - this.conf[i]); this.held = types.map(() => 0) }
  get total() { return this.types.reduce((a, t) => a + t.cap, 0) }
  stats(): InvStats {
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0), T = this.total
    const byType = this.types.map((t, i) => ({ id: t.id, name: t.name, price: t.price, total: t.cap, available: this.avail[i], held: this.held[i], confirmed: this.conf[i] }))
    const ok = this.types.every((t, i) => this.avail[i] + this.held[i] + this.conf[i] === t.cap && this.avail[i] >= 0 && this.held[i] >= 0)
    return { total: T, available: sum(this.avail), held: sum(this.held), confirmed: sum(this.conf), integrity: ok && sum(this.avail) + sum(this.held) + sum(this.conf) === T, byType, oversell: Math.max(0, sum(this.conf) + sum(this.held) - T) }
  }
  availableTotal() { return this.avail.reduce((a, b) => a + b, 0) }
  hold(sid: number, typeIdx: number, qty: number, idem: string, t: number, ttl: number): HoldResult {
    this.counters.holdAttempts++
    const prior = this.idem.get('h:' + idem); if (prior) { this.counters.replays++; return { ok: true, hold: this.holds.get(prior)!, replay: true } }
    if (typeIdx < 0 || typeIdx >= this.types.length || !(qty >= 1)) { this.counters.rejected++; return { ok: false, reason: 'BAD_REQUEST' } }
    if (this.avail[typeIdx] === 0) { this.counters.rejected++; return { ok: false, reason: 'SOLD_OUT' } }
    if (this.avail[typeIdx] < qty) { this.counters.rejected++; return { ok: false, reason: 'INSUFFICIENT' } }
    // atomic check-and-set
    this.avail[typeIdx] -= qty; this.held[typeIdx] += qty
    const h: Hold = { id: 'H-' + String(++this.seq).padStart(5, '0'), sid, typeIdx, qty, state: 'HELD', created: t, expires: t + ttl, idem }
    this.holds.set(h.id, h); this.idem.set('h:' + idem, h.id); this.activeQ.push(h); this.counters.holdGranted++
    return { ok: true, hold: h, replay: false }
  }
  confirm(holdId: string, idem: string, t: number): ConfirmResult {
    const h = this.holds.get(holdId); if (!h) return { ok: false, reason: 'NOT_FOUND' }
    if (h.state === 'CONFIRMED') { this.counters.replays++; return { ok: true, hold: h, replay: true } } // idempotent re-confirm
    if (h.state === 'RELEASED') return { ok: false, reason: 'RELEASED' }
    if (h.state === 'EXPIRED' || h.expires < t) { this.expireOne(h); return { ok: false, reason: 'EXPIRED' } }
    this.held[h.typeIdx] -= h.qty; this.conf[h.typeIdx] += h.qty
    h.state = 'CONFIRMED'; h.confirmedAt = t; h.confirmIdem = idem; h.allocationId = 'AL-' + String(++this.allocSeq).padStart(5, '0'); this.counters.confirmed++
    return { ok: true, hold: h, replay: false }
  }
  release(holdId: string): boolean {
    const h = this.holds.get(holdId); if (!h || h.state !== 'HELD') return false
    this.held[h.typeIdx] -= h.qty; this.avail[h.typeIdx] += h.qty; h.state = 'RELEASED'; this.counters.released++; return true
  }
  private expireOne(h: Hold) { if (h.state !== 'HELD') return; this.held[h.typeIdx] -= h.qty; this.avail[h.typeIdx] += h.qty; h.state = 'EXPIRED'; this.counters.expired++ }
  /** HELD → AVAILABLE for every hold whose TTL elapsed. Returns the holds that expired. */
  expireDue(t: number): Hold[] {
    const out: Hold[] = []
    while (this.qHead < this.activeQ.length) {
      const h = this.activeQ[this.qHead]
      if (h.state !== 'HELD') { this.qHead++; continue }
      if (h.expires > t) break
      this.expireOne(h); out.push(h); this.qHead++
    }
    if (this.qHead > 4096 && this.qHead * 2 > this.activeQ.length) { this.activeQ = this.activeQ.slice(this.qHead); this.qHead = 0 }
    return out
  }
  allocations(): Hold[] { const a: Hold[] = []; this.holds.forEach(h => { if (h.state === 'CONFIRMED') a.push(h) }); return a }
}
