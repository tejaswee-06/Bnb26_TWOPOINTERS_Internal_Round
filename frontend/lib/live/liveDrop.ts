'use client'
// LiveDrop: the live-mode counterpart of the in-browser DropSim, for ONE catalogue event, backed by the Person-1 backend.
// It exposes the same read surface the customer pages already use (phase, cfg, el, t, inv, eligibleIds, proof, sessionById, queueStatus)
// from a cache refreshed by polling, plus async mutations (join / hold / confirm / release / solveChallenge).
// Nothing here decides anything: queue order, admission, policy actions and inventory are all server-side. The browser only relays.
import { api, errText } from './api'
import { sha256Bytes, utf8, sha256 } from '../engine/crypto'
import type { FDEvent } from '../data/events'
import type { Hold, InvStats } from '../engine/inventory'
import type { Phase, Outcome, Action } from '../engine/types'
import type { ProofBundle } from '../engine/shuffle'

export interface DropInfo { event_id: string; name: string; mode: string; phase: Phase; server_time: number; prequeue_seconds: number; seconds_left: number; joined: number; eligible_count: number; queue_depth: number; admission_limit: number; commitment: string | null; proof_revealed: boolean; inventory: { total: number; available: number; held: number; confirmed: number; invariant_ok: boolean; by_type: Record<string, { total: number; available: number; held: number; confirmed: number }> } }
interface Stored { sid: string; credential: string; token?: string; holdN: number }
export interface LiveSess {
  id: number; sid: string; st: 'QUEUED' | 'ADMITTED' | 'ALLOCATING' | 'COMPLETED' | 'REJECTED' | 'QUARANTINED'; pos: number; hold: string; outcome?: Outcome; guided: false; eligible: boolean
  policyAction: Action; admitStatus: string; retryAfter: number; challenge: boolean
}
const LSK = 'fd-live-sessions'
const lsRead = (): Record<string, Stored> => { try { return JSON.parse(localStorage.getItem(LSK) || '{}') } catch { return {} } }
const lsWrite = (m: Record<string, Stored>) => { try { localStorage.setItem(LSK, JSON.stringify(m)) } catch { /* private mode: session lives in memory only */ } }
/** Backend timestamps may come back as naive ISO strings (SQLite) — they are always UTC. */
export const parseUtc = (s: string) => Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : s + 'Z')
const hashInt = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }
/** Pseudonymous account id: the backend never sees the e-mail address. */
export const userIdFor = (email: string) => 'u_' + sha256('fairdrop-user:' + email.trim().toLowerCase()).slice(0, 24)

export class LiveDrop {
  info: DropInfo | null = null; proofRaw: any = null; offline = false; lastError = ''; skew = 0; fetchedAt = 0
  sid = ''; private credential = ''; token = ''; private holdN = 0
  sess: any = null; admit = { status: '', policy: 'NORMAL' as Action, retry: 0, reason: '' }
  holds = new Map<string, Hold>(); private busy = false; private lastAdmit = 0; private nextAdmitAt = 0
  readonly key: string
  constructor(public eventId: string, public userId: string, public ev: FDEvent) {
    this.key = eventId + ':' + userId
    const s = lsRead()[this.key]; if (s) { this.sid = s.sid; this.credential = s.credential; this.token = s.token || ''; this.holdN = s.holdN || 0 }
  }
  private persist() { const m = lsRead(); if (this.sid) m[this.key] = { sid: this.sid, credential: this.credential, token: this.token, holdN: this.holdN }; else delete m[this.key]; lsWrite(m) }
  get hasSession() { return !!this.sid }
  /** first server response received (or backend known-unreachable) — pages show a skeleton until then instead of flashing zeros */
  get settled() { return this.offline || !!this.lastError || (!!this.info && (!this.sid || !!this.sess)) }

  // ---- read surface mirrored from DropSim ----
  get phase(): Phase { return this.info?.phase ?? 'PREPARED' }
  get cfg() { return { eventId: this.eventId, preQueueSec: this.info?.prequeue_seconds ?? 45, maxQty: 1, holdTtl: 600, admitRate: 1, autopilot: true } }
  get el() { return this.phase === 'PRE_QUEUE_OPEN' ? Math.max(0, this.cfg.preQueueSec - this.secondsLeft) : 0 }
  get secondsLeft() { if (!this.info || this.info.phase !== 'PRE_QUEUE_OPEN') return 0; return Math.max(0, Math.ceil(this.info.seconds_left - (Date.now() - this.fetchedAt) / 1000)) }
  /** server-adjusted wall clock in whole seconds (hold expiry is compared against this) */
  get t() { return Math.floor(Date.now() / 1000 + this.skew) }
  get eligibleIds(): string[] { return this.proofRaw?.eligible ?? [] }
  get eligibleCount() { return this.info?.eligible_count ?? 0 }
  get proof(): ProofBundle | null {
    const p = this.proofRaw; if (!p) return null
    return { eventId: this.eventId, commitment: p.commitment, serverSeed: p.serverSeed, eligibleRoot: p.eligibleRoot, eligibleCount: p.eligibleCount, seats: this.info?.inventory.total ?? 0, algorithm: p.algorithm, shuffleSeed: p.shuffleSeed, guidedLane: [] }
  }
  get inv() {
    const info = this.info, types = this.ev.ticketTypes, holds = this.holds
    const stats = (): InvStats => {
      const bt = info?.inventory.by_type ?? {}
      const byType = types.map(t => { const x = bt[t.id] ?? { total: 0, available: 0, held: 0, confirmed: 0 }; return { id: t.id, name: t.name, price: t.price, total: x.total, available: x.available, held: x.held, confirmed: x.confirmed } })
      const i = info?.inventory
      return { total: i?.total ?? 0, available: i?.available ?? 0, held: i?.held ?? 0, confirmed: i?.confirmed ?? 0, integrity: i?.invariant_ok ?? true, byType, oversell: 0 }
    }
    return { total: info?.inventory.total ?? 0, stats, holds, types: this.ev.ticketTypes }
  }
  sessionById(_sid?: string): LiveSess | undefined {
    if (!this.sid) return undefined
    const d = this.sess, state: string = d?.state ?? 'QUEUED', pa: Action = (d?.policy_action as Action) || 'NORMAL'
    let st: LiveSess['st'] = state === 'ADMITTED' ? 'ADMITTED' : state === 'ALLOCATING' ? 'ALLOCATING' : state === 'COMPLETED' ? 'COMPLETED' : 'QUEUED'
    if (pa === 'REJECT') st = 'REJECTED'; else if (pa === 'QUARANTINE') st = 'QUARANTINED'
    const done = this.phase === 'ENDED' && st !== 'COMPLETED'
    let outcome: Outcome | undefined
    if (st === 'REJECTED' || st === 'QUARANTINED') outcome = 'BLOCKED'
    else if (done) outcome = (this.info?.inventory.available ?? 0) + (this.info?.inventory.held ?? 0) === 0 ? 'SOLD_OUT' : 'NOT_ADMITTED'
    const res = d?.reservation
    return { id: hashInt(this.sid), sid: this.sid, st, pos: d?.queue_sequence ?? 0, hold: res && res.status === 'HELD' ? String(res.reservation_id) : '', outcome, guided: false,
      eligible: d?.queue_sequence != null || this.phase === 'PRE_QUEUE_OPEN' || this.phase === 'PRE_QUEUE_CLOSED', policyAction: pa, admitStatus: this.admit.status, retryAfter: this.admit.retry, challenge: this.admit.status === 'CHALLENGE_REQUIRED' }
  }
  queueStatus(s: LiveSess) {
    const i = this.info, admitted = s.st === 'ADMITTED' || s.st === 'ALLOCATING', cur = this.sess?.position ?? 0
    return { phase: this.phase, state: s.st, outcome: s.outcome, position: s.pos, eligible: this.eligibleCount || i?.joined || 0, joined: i?.joined ?? 0,
      admittedUpTo: Math.max(0, (this.eligibleCount || 0) - (i?.queue_depth ?? 0)), ahead: cur > 0 ? Math.max(0, cur - 1) : 0, isEligible: s.eligible, token: admitted ? this.token : '', holdId: s.hold, seats: 0, admitRate: Math.max(1, i?.admission_limit ?? 1),
      secondsLeft: this.secondsLeft, soldOut: !!i && i.inventory.confirmed >= i.inventory.total, remaining: (i?.inventory.available ?? 0) + (i?.inventory.held ?? 0),
      admitDeadline: this.sess?.admission_expires_at ? Math.floor(parseUtc(this.sess.admission_expires_at) / 1000) : 0, now: this.t }
  }

  // ---- network ----
  async ensure(open: boolean) {
    const r = await api('POST', `ensure/${this.eventId}${open ? '?open=1' : ''}`); this.offline = !!r.offline
    if (r.ok && r.data?.drop) this.applyInfo(r.data.drop); else if (!r.ok) this.lastError = errText(r)
    return r.ok
  }
  private applyInfo(d: DropInfo) { this.info = d; this.fetchedAt = Date.now(); this.skew = d.server_time - Date.now() / 1000; this.offline = false; this.lastError = '' }
  /** One poll cycle: drop info → session status → (when it is our turn to be admitted) an admit attempt → proof once revealed. */
  async refresh(): Promise<boolean> {
    if (this.busy) return false; this.busy = true
    try {
      const r = await api<DropInfo>('GET', `events/${this.eventId}/drop`)
      if (!r.ok) { this.offline = !!r.offline; this.lastError = r.status === 404 ? 'NOT_PROVISIONED' : errText(r); return true }
      this.applyInfo(r.data)
      if (r.data.proof_revealed && !this.proofRaw) { const p = await api('GET', `events/${this.eventId}/proof`); if (p.ok) this.proofRaw = p.data }
      if (this.sid) {
        const q = await api('GET', `queue/${this.sid}`, undefined, { 'x-session-credential': this.credential })
        if (q.ok) { this.sess = q.data; this.syncHold(q.data.reservation) }
        else if (q.status === 403) { this.lastError = 'SESSION_CREDENTIAL_REJECTED' }
        const st = this.sess?.state, now = Date.now()
        if (r.data.phase === 'ADMITTING' && st === 'QUEUED' && now >= this.nextAdmitAt) await this.tryAdmit()
        else if (st === 'ADMITTED' && !this.token) await this.tryAdmit()
      }
      return true
    } finally { this.busy = false }
  }
  private async tryAdmit() {
    const a = await api('POST', `queue/${this.sid}/admit`, undefined, { 'x-session-credential': this.credential }), d = a.data || {}
    this.admit = { status: d.status || (a.ok ? '' : 'ERROR'), policy: (d.policy_action as Action) || 'NORMAL', retry: d.retry_after_seconds || 0, reason: d.policy_reason || '' }
    this.nextAdmitAt = Date.now() + Math.max(1, d.retry_after_seconds || 2) * 1000
    if (d.success && d.token) { this.token = d.token; this.persist(); const q = await api('GET', `queue/${this.sid}`, undefined, { 'x-session-credential': this.credential }); if (q.ok) this.sess = q.data }
  }
  private syncHold(res: any) {
    if (!res) return
    const id = String(res.reservation_id), ti = Math.max(0, this.ev.ticketTypes.findIndex(t => t.id === res.ticket_type))
    const expires = res.held_until ? Math.floor(parseUtc(res.held_until) / 1000) : this.t + 600
    const prev = this.holds.get(id)
    this.holds.set(id, { id, sid: 0, typeIdx: ti, qty: 1, state: res.status === 'CONFIRMED' ? 'CONFIRMED' : prev?.state === 'RELEASED' ? 'RELEASED' : (expires < this.t ? 'EXPIRED' : 'HELD'), created: prev?.created ?? this.t, expires, idem: prev?.idem ?? '', allocationId: res.status === 'CONFIRMED' ? 'AL-' + id : undefined })
  }
  async join(): Promise<{ ok: true; replay: boolean } | { ok: false; reason: string; detail?: string }> {
    const body: any = { user_id: this.userId }; if (this.sid) { body.session_id = this.sid; body.credential = this.credential }
    const r = await api('POST', `events/${this.eventId}/join`, body); this.offline = !!r.offline
    if (r.offline) return { ok: false, reason: 'BACKEND_UNREACHABLE' }
    if (!r.ok) { const d = String(r.data?.detail?.message || r.data?.detail || ''); if (r.status === 503) return { ok: false, reason: 'BUSY' }; return { ok: false, reason: /DUPLICATE_SESSION/.test(d) ? 'CREDENTIAL_LOST' : /NOT_OPEN/.test(d) ? 'NOT_OPEN' : /CLOSED/.test(d) ? 'CLOSED' : d || 'JOIN_FAILED', detail: d } }
    const replay = !!this.sid && r.data.session_id === this.sid
    this.sid = r.data.session_id; if (r.data.credential) this.credential = r.data.credential
    if (!this.credential) return { ok: false, reason: 'CREDENTIAL_LOST', detail: 'This account already has a session for this drop but this browser no longer holds its credential.' }
    this.sess = r.data; this.persist(); await this.refresh(); return { ok: true, replay }
  }
  private creds() { return { event_id: this.eventId, user_id: this.userId, session_id: this.sid, session_credential: this.credential } }
  async hold(typeIdx: number) {
    const ty = this.ev.ticketTypes[typeIdx]; if (!ty) return { ok: false as const, reason: 'BAD_REQUEST' }
    if (!this.token) await this.tryAdmit()
    const key = `hold:${this.sid}:${this.holdN}`
    const r = await api('POST', 'allocation/hold', { ...this.creds(), idempotency_key: key, admission_token: this.token, ticket_type: ty.id }), d = r.data || {}
    if (r.offline) return { ok: false as const, reason: 'BACKEND_UNREACHABLE' }
    if (!d.success) return { ok: false as const, reason: d.status === 'ADMISSION_REQUIRED' ? (/token/i.test(d.message || '') ? 'TOKEN_' + String(d.message).replace(/\W+/g, '_').toUpperCase() : 'NOT_ADMITTED') : (d.status || errText(r)), message: d.message as string | undefined }
    this.syncHold({ reservation_id: d.reservation_id, status: 'HELD', held_until: d.held_until, ticket_type: d.ticket_type }); void this.refresh()
    return { ok: true as const, hold: this.holds.get(String(d.reservation_id))!, replay: false }
  }
  async confirm(holdId: string) {
    const r = await api('POST', 'allocation/confirm', { ...this.creds(), reservation_id: Number(holdId), idempotency_key: `confirm:${holdId}` }), d = r.data || {}
    if (!d.success) return { ok: false as const, reason: d.status || errText(r) }
    const h = this.holds.get(holdId); if (h) { h.state = 'CONFIRMED'; h.allocationId = 'AL-' + holdId }; void this.refresh()
    return { ok: true as const, hold: h!, itemCode: d.item_code as string }
  }
  async release(holdId: string) {
    const r = await api('POST', 'allocation/release', { ...this.creds(), reservation_id: Number(holdId), idempotency_key: `release:${holdId}` }); const ok = !!r.data?.success
    if (ok) { const h = this.holds.get(holdId); if (h) h.state = 'RELEASED'; this.holdN++; this.token = ''; this.persist(); void this.refresh() }
    return ok
  }
  /** CHALLENGE policy: solve the backend's proof-of-work in the browser (no personal data, no CAPTCHA vendor). */
  async solveChallenge(onProgress?: (n: number) => void): Promise<{ ok: boolean; status: string }> {
    const c = await api('POST', `policy/challenge/${this.sid}`, undefined, { 'x-session-credential': this.credential }); if (!c.ok) return { ok: false, status: errText(c) }
    const { challenge, difficulty_bits: bits } = c.data as { challenge: string; difficulty_bits: number }
    const lz = (d: Uint8Array) => { let n = 0; for (const b of d) { if (b === 0) { n += 8; continue } n += Math.clz32(b) - 24; break } return n }
    let i = 0
    for (;;) {
      for (let k = 0; k < 4000; k++, i++) { if (lz(sha256Bytes(utf8(`${challenge}:${i}`))) >= bits) { const s = await api('POST', `policy/challenge/${this.sid}/solve`, { challenge, solution: String(i) }, { 'x-session-credential': this.credential }); this.nextAdmitAt = 0; await this.refresh(); return { ok: !!s.data?.success, status: s.data?.status || errText(s) } } }
      onProgress?.(i); await new Promise(r => setTimeout(r, 0))
    }
  }
}
