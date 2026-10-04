// DropSim — one drop (event) as an agent-based discrete-time simulation (1 tick = 1 simulated second).
// The same engine powers: the live drop (customer journey + admin), the Attack Lab / Load Lab, and the headless
// counterfactual experiments (World A / World B / Naive baseline). Nothing here is hard-coded output:
// every number reported by the UI is computed from agent state.
//
// Performance design: per-tick work is O(joins + scored sessions + 14 aggregate buckets) — never O(all sessions).
import { sha256 } from './crypto'
import { Rand, rng, clamp, normal } from './rng'
import { Inventory, Hold } from './inventory'
import { IdGen, makeLegit, makeWave, humanQty, WaveSpec } from './population'
import { riskModel, evidenceFor, transform, IsolationForest, Features, MODEL_VERSION } from './ml'
import { signToken, verifyToken } from './tokens'
import { commitmentOf, rootOf, shuffleSeed, deterministicShuffle, ProofBundle, ALGORITHM } from './shuffle'
import { Action, CampaignInfo, DropConfig, Ev, Frame, Health, Incident, Phase, Scenario, Sess, SimResult, Strategy, STRATEGY_ORDER, SCENARIOS, Outcome } from './types'

export interface Policy { tChallenge: number; tThrottle: number; tQuarantine: number; minGroup: number; syncWin: number; level: number }
const BASE_POLICY: Policy = { tChallenge: 0.38, tThrottle: 0.55, tQuarantine: 0.75, minGroup: 12, syncWin: 10, level: 0 }
const ROUNDS = [3, 12, 30] // scoring rounds at session age (seconds since join)
const SRC_LIMIT = 8 // per-source rate limit (req/s) at the WAF; the excess is dropped cheaply
const limOf = (d: number) => Math.min(d, SRC_LIMIT) + Math.max(0, d - SRC_LIMIT) * 0.05
const COST = [1, 1, 1, 1, 0.3, 0.05, 0.05] // by bucket: BUF, UNSCORED, NORMAL, CHALLENGE, THROTTLE, QUARANTINE, REJECT
const ACT_RANK: Record<Action, number> = { NORMAL: 0, CHALLENGE: 1, THROTTLE: 2, QUARANTINE: 3, REJECT: 4 }
const NB = 7
interface Bucket { n: number; rate: number; rateCrit: number; lim: number; limCrit: number; limHalf: number; limHalfCrit: number; minRate: number }
const mkBucket = (): Bucket => ({ n: 0, rate: 0, rateCrit: 0, lim: 0, limCrit: 0, limHalf: 0, limHalfCrit: 0, minRate: 0 })
export const sidOf = (id: number) => 'S-' + id.toString(36).toUpperCase().padStart(5, '0')
export interface AllocRec { id: string; allocationId: string; sid: number; session: string; inventoryId: string; type: string; qty: number; price: number; state: 'CONFIRMED'; idem: string; t: number; bot: boolean; pos: number }
export interface RiskRec { session_id: string; event_id: string; risk_score: number; anomaly_score: number; coordination_score: number; campaign_id: string | null; attack_type: string | null; evidence: string[]; model_version: string; timestamp: string; action: Action }
interface Acc { crit: number; non: number; off: number; legit: number; susp: number; bot: number; tLegit: number; tBot: number; unscored: number; risk: number[]; quar: number; rej: number; tp: number; fp: number; fn: number; tn: number }

export class DropSim {
  cfg: DropConfig; phase: Phase = 'PREPARED'
  t = 0; tOpen = -1; tClose = -1; tRandom = -1; tAdmit = -1
  inv: Inventory; readonly secret: string; readonly serverSeed: string; commitment = ''; revealed = false
  g = new IdGen(); sessions: Sess[] = []
  private future: Sess[] = []; private fi = 0
  private backlog: Sess[] = []; private bi = 0
  private joined: Sess[] = []
  private rLegit: Rand; private r: Rand
  policy: Policy = { ...BASE_POLICY }
  mlOnline = true
  ifor = new IsolationForest(25, 128); ifReady = false; private ifPool: number[][] = []
  blockedFp = new Set<number>(); blockedTok = new Set<number>(); blockedAcct = new Set<number>()
  // incremental coordination graph
  private parent = new Int32Array(0); private usize = new Int32Array(0)
  private acctFirst = new Map<number, number>(); private tokFirst = new Map<number, number>(); private fpFirst = new Map<number, number>()
  private acctCount = new Map<number, number>(); private tokCount = new Map<number, number>()
  private simCount = new Map<number, number>(); private simMembers = new Map<number, number[]>()
  campaigns = new Map<number, CampaignInfo>(); private campSeq = 0; identity = new Map<number, CampaignInfo>(); private icSeq = 183
  eligibleIds: number[] = []; eligibleRoot = ''; order: Sess[] = []; ap = 0; proof: ProofBundle | null = null
  guided: { id: number; position: number }[] = []
  events: Ev[] = []; incidents: Incident[] = []; private incKey = new Map<string, Incident>(); riskStream: RiskRec[] = []; allocs: AllocRec[] = []
  frames: Frame[] = []; private evSeq = 0
  attackActive = false; private waveSeq = 0; strategyIdx = 0; private strategyChanges = 0; private waveSessions: Sess[][] = []; private waveStart: number[] = []; waveLog: { t: number; strategy: Strategy; reason: string }[] = []
  private dueHold = new Map<number, Sess[]>(); private duePay = new Map<number, Sess[]>(); private dueScore = new Map<number, Sess[]>(); private dueBypass = new Map<number, Sess[]>(); private holdOwner = new Map<string, Sess>()
  outstanding = 0; unplaced = 0; admitted = 0; private bought = new Map<number, number>()
  counters = { dup: 0, limitBlocks: 0, raced: 0, bypassBlocked: 0, recovered: 0, lateRejected: 0, totalRequests: 0, expiredHolds: 0 }
  private state: Health = 'HEALTHY'; private prevBad = false; private badSince = -1; breaker: 'CLOSED' | 'HALF-OPEN' | 'OPEN' = 'CLOSED'; private breakerHot = 0
  private peak = { load: 0, p99: 0, rps: 0, shed: 0 }; private firstBotJoin = -1; private firstBotFlag = -1
  private flagWindow: number[] = []; private flaggedNew = 0; private lastEscT = -99; escalations = 0; private lastCampT = -99
  private admissionThrottled = false; private tick = { granted: 0, rejected: 0 }; joinedAll = 0; admitRateNow = 0
  private agg: Bucket[][] = [Array.from({ length: NB }, mkBucket), Array.from({ length: NB }, mkBucket)]
  private mashers: Sess[] = []; private cumSurge: number[] = [0]
  private lastAcc: Acc | null = null
  prof: Record<string, number> = { join: 0, acc: 0, score: 0, res: 0, life: 0, frame: 0 }
  constructor(cfg: DropConfig) {
    this.cfg = { ...cfg }
    this.secret = sha256('secret:' + cfg.seed + ':' + cfg.eventId); this.serverSeed = sha256('seed:' + cfg.seed + ':' + cfg.eventId)
    this.inv = new Inventory(cfg.types)
    this.rLegit = rng(cfg.seed + ':legit'); this.r = rng(cfg.seed + ':sim')
    this.install(makeLegit(cfg.legit, cfg.preQueueSec, this.rLegit, this.g))
  }
  private install(list: Sess[]) {
    for (const s of list) this.sessions.push(s)
    const need = this.sessions.length + 1024
    if (this.parent.length < need) { const np = new Int32Array(need * 2), ns = new Int32Array(need * 2); np.set(this.parent); ns.set(this.usize); for (let i = this.parent.length; i < np.length; i++) { np[i] = i; ns[i] = 1 } this.parent = np; this.usize = ns }
    const rest = this.future.slice(this.fi).concat(list); rest.sort((a, b) => a.arrive - b.arrive || a.id - b.id); this.future = rest; this.fi = 0
  }
  get el() { return this.tOpen < 0 ? 0 : this.t - this.tOpen }
  private ev(kind: Ev['kind'], text: string, sev: Ev['sev'] = 'info') { this.events.unshift({ id: `E${++this.evSeq}`, t: this.t, kind, text, sev }); if (this.events.length > 200) this.events.length = 200 }
  private inc(key: string, kind: string, title: string, sev: Incident['sev'], evidence: string[], action: string, result: string, status: Incident['status'] = 'OPEN') {
    const ex = this.incKey.get(key)
    if (ex) { ex.evidence = evidence; ex.action = action; ex.result = result; ex.status = status; ex.sev = sev; return ex }
    const i: Incident = { id: 'INC-' + String(this.incidents.length + 1).padStart(3, '0'), t: this.t, kind, title, sev, evidence, action, result, status }
    this.incKey.set(key, i); this.incidents.unshift(i); return i
  }
  private resolve(key: string, result: string) { const i = this.incKey.get(key); if (i && i.status !== 'RESOLVED') { i.status = 'RESOLVED'; i.result = result } }

  // ---------------- aggregates (incremental) ----------------
  private bIdx(s: Sess, buffered = false) { return buffered ? 0 : s.rounds === 0 && s.act === 'NORMAL' ? 1 : 2 + ACT_RANK[s.act] }
  private isMasher(s: Sess) { return !s.bot && s.rate > 1.5 }
  private aggAdd(s: Sess, b: number, sign: 1 | -1) {
    const B = this.agg[s.bot ? 1 : 0][b]; B.n += sign
    if (this.isMasher(s)) return
    const d = s.rate
    B.rate += sign * d; B.rateCrit += sign * d * s.crit; B.minRate += sign * Math.min(d, 0.08)
    if (s.bot) { const l = limOf(d), h = limOf(d * 0.5); B.lim += sign * l; B.limCrit += sign * l * s.crit; B.limHalf += sign * h; B.limHalfCrit += sign * h * s.crit }
  }
  private aggMove(s: Sess, from: number, to: number) { if (from !== to) { this.aggAdd(s, from, -1); this.aggAdd(s, to, 1) } }
  private rebuildAgg() {
    this.agg = [Array.from({ length: NB }, mkBucket), Array.from({ length: NB }, mkBucket)]
    for (let i = this.bi; i < this.backlog.length; i++) { const s = this.backlog[i]; if (s.st === 'BUFFERED') this.aggAdd(s, 0, 1) }
    for (const s of this.joined) if (!(s.st === 'COMPLETED' && !s.bot)) this.aggAdd(s, this.bIdx(s), 1)
  }
  private readAgg(): Acc {
    const surge = this.cfg.surge, closed = this.cfg.mode === 'FAIR' && this.phase !== 'PRE_QUEUE_OPEN'
    const A: Acc = { crit: 0, non: 0, off: 0, legit: 0, susp: 0, bot: 0, tLegit: 0, tBot: 0, unscored: 0, risk: [0, 0, 0, 0], quar: 0, rej: 0, tp: 0, fp: 0, fn: 0, tn: 0 }
    for (let truth = 0; truth < 2; truth++) for (let b = 0; b < NB; b++) {
      const B = this.agg[truth][b]; if (B.n === 0 && B.rate === 0) continue
      let d: number, lim: number, limCrit: number
      if (truth === 1) { d = closed ? B.rate * 0.5 : B.rate; lim = closed ? B.limHalf : B.lim; limCrit = closed ? B.limHalfCrit : B.limCrit }
      else if (closed && b !== 0) { d = B.minRate * surge; lim = d; limCrit = d * 0.25 }
      else { d = B.rate * surge; lim = d; limCrit = B.rateCrit * surge }
      const cost = COST[b]; A.crit += limCrit * cost; A.non += (lim - limCrit) * cost; A.off += d
      if (truth) A.tBot += d; else A.tLegit += d
      if (b <= 2) A.legit += d; else if (b <= 4) A.susp += d; else A.bot += d
      if (b <= 1) A.unscored += B.n; else A.risk[Math.min(3, b - 2)] += B.n
      if (b === 5) A.quar += B.n; if (b === 6) A.rej += B.n
      if (b >= 2) { const flagged = b >= 4; if (truth) { if (flagged) A.tp += B.n; else A.fn += B.n } else { if (flagged) A.fp += B.n; else A.tn += B.n } }
    }
    for (const s of this.mashers) { if (s.st === 'COMPLETED' || s.joinT < 0) continue; const b = this.bIdx(s), d0 = s.rate * surge, d = closed ? Math.min(d0, 0.08 * surge) : d0, l = limOf(d), cost = COST[b]
      A.crit += l * s.crit * cost; A.non += l * (1 - s.crit) * cost; A.off += d; A.tLegit += d; if (b <= 2) A.legit += d; else if (b <= 4) A.susp += d; else A.bot += d }
    this.counters.totalRequests += A.off
    return A
  }

  // ---------------- lifecycle (server state machine) ----------------
  openPreQueue(): string | null {
    if (this.phase !== 'PREPARED') return 'Drop is not in PREPARED state'
    this.tOpen = this.t; this.commitment = commitmentOf(this.serverSeed)
    if (this.cfg.mode === 'NAIVE') { this.phase = 'ADMITTING'; this.tAdmit = this.t; this.ev('admission', 'NAIVE baseline: sale opened — first-come-first-served, no pre-queue, no detection', 'warn') }
    else { this.phase = 'PRE_QUEUE_OPEN'; this.ev('admission', `Pre-queue OPEN · commitment published ${this.commitment.slice(0, 16)}… · window ${this.cfg.preQueueSec}s (demo-compressed)`, 'ok') }
    if (this.cfg.scenario !== 'NORMAL' && !this.attackActive) this.startAttack(this.cfg.scenario)
    return null
  }
  closePreQueue(): string | null {
    if (this.phase !== 'PRE_QUEUE_OPEN') return 'Pre-queue is not open'
    this.tClose = this.t; this.finalize(); this.phase = 'PRE_QUEUE_CLOSED'
    this.ev('admission', `Pre-queue CLOSED · ${this.eligibleIds.length.toLocaleString()} eligible entries (arrival time and request volume are not inputs to allocation)`, 'ok'); return null
  }
  randomize(): string | null {
    if (this.phase !== 'PRE_QUEUE_CLOSED') return 'Pre-queue must be closed first'
    this.tRandom = this.t
    const seed = shuffleSeed(this.serverSeed, this.eligibleRoot), guidedSess = this.sessions.filter(s => s.guided && s.eligible)
    const gset = new Set(guidedSess.map(s => s.id))
    const ids = deterministicShuffle(this.eligibleIds.filter(i => !gset.has(i)), seed)
    this.guided = []
    guidedSess.forEach((s, k) => { const pos = Math.min(ids.length + 1, 30 + ((s.id * 7) % 40) + k); this.guided.push({ id: s.id, position: pos }) })
    for (const gd of [...this.guided].sort((a, b) => a.position - b.position)) ids.splice(Math.min(ids.length, gd.position - 1), 0, gd.id)
    this.order = ids.map(i => this.sessions[i]); this.order.forEach((s, k) => { s.pos = k + 1 })
    this.ap = 0; this.revealed = true
    this.proof = { eventId: this.cfg.eventId, commitment: this.commitment, serverSeed: this.serverSeed, eligibleRoot: this.eligibleRoot, eligibleCount: this.eligibleIds.length, seats: this.inv.total, algorithm: ALGORITHM, shuffleSeed: seed, guidedLane: this.guided }
    this.phase = 'RANDOMIZED'
    this.ev('admission', `Randomized · seed revealed · root ${this.eligibleRoot.slice(0, 12)}… · admission order fixed for ${this.order.length.toLocaleString()} participants`, 'ok'); return null
  }
  startAdmission(): string | null {
    if (this.phase !== 'RANDOMIZED' && this.phase !== 'PAUSED') return 'Randomization must run first'
    const resumed = this.tAdmit >= 0; this.phase = 'ADMITTING'; if (!resumed) this.tAdmit = this.t
    this.ev('admission', `Controlled admission ${resumed ? 'resumed' : 'started'} · up to ${this.cfg.admitRate}/s, gated by remaining inventory`, 'ok'); return null
  }
  pauseAdmission(): string | null { if (this.phase !== 'ADMITTING') return 'Admission is not running'; this.phase = 'PAUSED'; this.ev('admission', 'Admission PAUSED by operator', 'warn'); return null }
  endDrop(): string | null { if (this.phase === 'ENDED') return 'Already ended'; this.phase = 'ENDED'; this.ev('admission', 'Drop ENDED', 'info'); this.stampOutcomes(); return null }
  private stampOutcomes() { for (const s of this.sessions) if (!s.outcome && s.joinT >= 0) s.outcome = s.eligible ? 'NOT_ADMITTED' : 'BLOCKED' }
  setMl(on: boolean) { if (this.mlOnline === on) return; this.mlOnline = on; this.ev('resilience', on ? 'ML scoring service restored' : 'ML scoring service FAILED — policy falls back to deterministic rules (identity dedupe, rate limits, signed tokens); inventory path unaffected', on ? 'ok' : 'bad'); if (!on) this.inc('mlfail', 'ML service failure', 'Risk scoring unavailable', 'bad', ['scoring RPC failing'], 'Deterministic fallback: rate limiting + identity multiplicity dedupe + HMAC admission', 'Inventory correctness independent of ML', 'MITIGATED'); else this.resolve('mlfail', 'ML scoring restored') }
  setSurge(x: number) { this.cfg.surge = x }

  // ---------------- attacks ----------------
  startAttack(sc: Scenario, patch?: Partial<DropConfig>) {
    if (sc === 'NORMAL') return
    if (patch) Object.assign(this.cfg, patch)
    this.cfg.scenario = sc; this.attackActive = true; this.strategyIdx = 0
    const B = Math.round((this.cfg.legit * this.cfg.autoPct) / Math.max(0.01, 1 - this.cfg.autoPct))
    const first: Strategy = sc === 'ADAPTIVE' ? 'SPEED' : (sc as Strategy)
    const acc = sc === 'ADAPTIVE' ? Math.round(B * 0.35) : first === 'FLOOD' ? Math.round(B * 0.12) : B
    this.spawnWave(first, acc, 0)
    this.ev('attack', `Attack launched: ${SCENARIOS[sc].label} · ${acc.toLocaleString()} automated accounts`, 'bad')
  }
  private spawnWave(st: Strategy, accounts: number, evade: number) {
    const w: WaveSpec = { strategy: st, accounts, start: Math.max(this.el, 0), span: this.cfg.attackSec, mult: this.cfg.mult, evade, wave: this.waveSeq++ }
    const list = makeWave(w, rng(this.cfg.seed + ':bot:' + w.wave), this.g)
    list.forEach(s => { s.rate *= this.cfg.botRate }); this.install(list); this.waveSessions[w.wave] = list; this.waveStart[w.wave] = this.t
    this.waveLog.push({ t: this.t, strategy: st, reason: w.wave === 0 ? 'initial strategy' : 'adapted after defenses activated' })
  }
  stopAttack() {
    if (!this.attackActive) return; this.attackActive = false
    this.future = this.future.slice(this.fi).filter(s => !s.bot); this.fi = 0
    this.backlog = this.backlog.slice(this.bi).filter(s => !s.bot); this.bi = 0
    for (const s of this.joined) if (s.bot) s.rate = 0
    this.rebuildAgg(); this.ev('attack', 'Attack stopped: automated sources ceased sending requests', 'ok')
  }
  /** attacker feedback controller: observes how much of its latest wave was challenged/blocked and changes strategy. */
  private attackerStep() {
    if (this.cfg.scenario !== 'ADAPTIVE' || !this.attackActive || this.strategyIdx >= STRATEGY_ORDER.length - 1) return
    const w = this.waveSessions[this.waveSeq - 1]; if (!w || this.t - this.waveStart[this.waveSeq - 1] < 9) return
    let scored = 0, hit = 0; for (const s of w) if (s.rounds > 0) { scored++; if (s.act !== 'NORMAL' && !(s.act === 'CHALLENGE' && s.chOk)) hit++ }
    if (scored >= 50 && hit / scored >= 0.3) {
      const from = STRATEGY_ORDER[this.strategyIdx]; this.strategyIdx++; this.strategyChanges++
      const to = STRATEGY_ORDER[this.strategyIdx], B = Math.round((this.cfg.legit * this.cfg.autoPct) / (1 - this.cfg.autoPct))
      this.spawnWave(to, Math.round(B * (this.strategyIdx === 1 ? 0.35 : 0.3)), this.strategyIdx === 1 ? 0.5 : 1)
      this.waveLog[this.waveLog.length - 1].reason = `${Math.round((hit / scored) * 100)}% of ${from} wave challenged/blocked → switching tactics`
      this.ev('attack', `Attacker strategy changed ${from} → ${to} (observed ${Math.round((hit / scored) * 100)}% of its sessions blocked)`, 'warn')
    }
  }

  // ---------------- customer-facing (server-authoritative) API ----------------
  private ext = new Map<string, Sess>()
  join(label: string, opts: { guided?: boolean } = {}): { ok: true; sess: Sess; sid: string; token: string; replay: boolean } | { ok: false; reason: 'NOT_OPEN' | 'CLOSED' } {
    const ex = this.ext.get(label); if (ex) return { ok: true, sess: ex, sid: sidOf(ex.id), token: ex.token, replay: true } // duplicate-session protection
    if (this.phase === 'PREPARED') return { ok: false, reason: 'NOT_OPEN' }
    if (this.cfg.mode === 'FAIR' && this.phase !== 'PRE_QUEUE_OPEN') return { ok: false, reason: 'CLOSED' }
    const s = makeLegit(1, 1, rng(this.cfg.seed + ':ext:' + label), this.g)[0]
    s.ext = true; s.guided = !!opts.guided; s.label = label; s.arrive = this.el; s.rate = 0.4; s.cv = 1.1; s.reg = 0.3; s.refresh = 2; s.abandon = false; s.payFail = false; s.pass = 1
    this.sessions.push(s); this.install([]); this.ext.set(label, s); this.admitJoin(s)
    s.token = signToken(this.secret, { kind: 'entry', sid: sidOf(s.id), eid: this.cfg.eventId, pos: 0, exp: this.t + 3600 })
    this.ev('info', `Participant joined (verified session ${sidOf(s.id)})`, 'ok')
    return { ok: true, sess: s, sid: sidOf(s.id), token: s.token, replay: false }
  }
  sessionById(sid: string): Sess | undefined { const id = parseInt(sid.replace('S-', ''), 36); return Number.isFinite(id) ? this.sessions[id] : undefined }
  queueStatus(s: Sess) {
    const st = this.inv.stats()
    return { phase: this.phase, state: s.st, outcome: s.outcome, position: s.pos, eligible: this.eligibleIds.length || this.joinedAll, joined: this.joinedAll, admittedUpTo: this.ap, ahead: s.pos > 0 ? Math.max(0, s.pos - this.ap) : 0, isEligible: s.eligible, token: s.st === 'ADMITTED' || s.st === 'ALLOCATING' ? s.token : '', holdId: s.hold, seats: s.seats, admitRate: this.cfg.admitRate, secondsLeft: this.phase === 'PRE_QUEUE_OPEN' ? Math.max(0, this.cfg.preQueueSec - this.el) : 0, soldOut: st.confirmed >= st.total, remaining: st.available + st.held, admitDeadline: s.admitT >= 0 ? s.admitT + 900 : 0, now: this.t }
  }
  /** Server-side validation of a client-presented admission token (never trusts client queue position). */
  validateAdmit(s: Sess, token: string) { return verifyToken(this.secret, token, { sid: sidOf(s.id), eid: this.cfg.eventId, kind: 'admit', now: this.t }) }
  holdFor(s: Sess, token: string, typeIdx: number, qty: number, idem: string): { ok: true; hold: Hold; replay: boolean } | { ok: false; reason: string } {
    const v = this.validateAdmit(s, token); if (!v.ok) { this.counters.bypassBlocked++; return { ok: false, reason: 'TOKEN_' + v.reason } }
    if (s.st !== 'ADMITTED' && s.st !== 'ALLOCATING') return { ok: false, reason: 'NOT_ADMITTED' }
    const key = this.identKey(s), used = this.bought.get(key) || 0, q = Math.min(qty, this.cfg.maxQty - used)
    if (q < 1) { this.counters.limitBlocks++; return { ok: false, reason: 'LIMIT' } }
    const res = this.inv.hold(s.id, typeIdx, q, `${sidOf(s.id)}:${idem}`, this.t, this.cfg.holdTtl)
    if (!res.ok) return { ok: false, reason: res.reason }
    if (!res.replay) { this.bought.set(key, used + q); this.holdOwner.set(res.hold.id, s); s.hold = res.hold.id; if (s.st === 'ADMITTED') this.unplaced = Math.max(0, this.unplaced - 1); s.st = 'ALLOCATING' }
    return { ok: true, hold: res.hold, replay: res.replay }
  }
  confirmFor(s: Sess, holdId: string, idem: string): { ok: true; hold: Hold; replay: boolean } | { ok: false; reason: string } {
    const res = this.inv.confirm(holdId, `${sidOf(s.id)}:${idem}`, this.t); if (!res.ok) return res
    if (!res.replay) this.recordAlloc(s, res.hold)
    return { ok: true, hold: res.hold, replay: res.replay }
  }
  releaseFor(s: Sess, holdId: string) { const h = this.inv.holds.get(holdId); if (!h || h.sid !== s.id) return false; const ok = this.inv.release(holdId); if (ok) { this.bought.set(this.identKey(s), Math.max(0, (this.bought.get(this.identKey(s)) || 0) - h.qty)); this.finish(s, 'PAYMENT_FAILED') } return ok }
  private identKey(s: Sess) { return this.cfg.mode === 'FAIR' && s.idRoot >= 0 ? 1e9 + s.idRoot : s.acct }
  private recordAlloc(s: Sess, h: Hold) {
    s.seats += h.qty; const ty = this.cfg.types[h.typeIdx]
    this.finish(s, 'WON')
    const rec: AllocRec = { id: 'AE-' + this.allocs.length, allocationId: h.allocationId!, sid: s.id, session: sidOf(s.id), inventoryId: `INV-${this.cfg.eventId.slice(0, 6).toUpperCase()}-${ty.id}`, type: ty.name, qty: h.qty, price: ty.price, state: 'CONFIRMED', idem: h.confirmIdem || '', t: this.t, bot: s.bot, pos: s.pos }
    this.allocs.push(rec); this.seatTally[s.bot ? 1 : 0] += h.qty; if (this.allocs.length > 5000) this.allocs.shift()
    if (this.allocs.length <= 30 || this.allocs.length % 25 === 0) this.ev('alloc', `${h.qty}× ${ty.name} CONFIRMED · ${h.allocationId} · session ${sidOf(s.id)}`, 'ok')
  }
  private seatTally = [0, 0]
  private meanQty() { const w = [0.5, 0.35, 0.1, 0.05]; let a = 0, b = 0; for (let q = 1; q <= Math.min(4, this.cfg.maxQty); q++) { a += q * w[q - 1]; b += w[q - 1] } return a / b }
  private finish(s: Sess, o: Outcome) {
    if (s.outcome) return; s.outcome = o
    if (s.st === 'ADMITTED') this.unplaced = Math.max(0, this.unplaced - 1)
    if (s.st === 'ADMITTED' || s.st === 'ALLOCATING') this.outstanding = Math.max(0, this.outstanding - 1)
    if (!s.bot && s.joinT >= 0 && s.st !== 'COMPLETED') this.aggAdd(s, this.bIdx(s), -1)
    s.st = 'COMPLETED'
  }

  // ---------------- join / graph / detection / policy ----------------
  private admitJoin(s: Sess) {
    if (s.st === 'BUFFERED') this.aggAdd(s, 0, -1)
    s.st = 'ACTIVE'; s.joinT = this.t; this.joined.push(s); this.joinedAll++
    this.aggAdd(s, this.bIdx(s), 1); if (this.isMasher(s)) this.mashers.push(s)
    if (s.bot && this.firstBotJoin < 0) this.firstBotJoin = this.t
    if (this.cfg.mode === 'FAIR') { this.ingest(s); const at = this.t + ROUNDS[0], l = this.dueScore.get(at) || []; l.push(s); this.dueScore.set(at, l) }
    if (s.bypassAt >= 0 && this.cfg.mode === 'FAIR') { const at = this.t + s.bypassAt, l = this.dueBypass.get(at) || []; l.push(s); this.dueBypass.set(at, l) }
  }
  private find(x: number) { const p = this.parent; while (p[x] !== x) { p[x] = p[p[x]]; x = p[x] } return x }
  private union(a: number, b: number) { let ra = this.find(a), rb = this.find(b); if (ra === rb) return; if (this.usize[ra] < this.usize[rb]) { const t = ra; ra = rb; rb = t } this.parent[rb] = ra; this.usize[ra] += this.usize[rb]; this.touch(ra) }
  private icTouched = new Set<number>(); private touch(r: number) { if (this.usize[r] >= 3) this.icTouched.add(r) }
  private simKey(s: Sess) { return s.sig * 64 + Math.floor(Math.max(0, s.joinT - this.tOpen) / this.policy.syncWin) }
  /** incremental coordination graph: identity edges (account / token family / device fingerprint) + behavioral-signature groups. IP is deliberately NOT an edge. */
  private ingest(s: Sess) {
    const link = (m: Map<number, number>, k: number) => { const o = m.get(k); if (o === undefined) m.set(k, s.id); else this.union(s.id, o) }
    link(this.acctFirst, s.acct); link(this.tokFirst, s.tok); link(this.fpFirst, s.fp)
    this.acctCount.set(s.acct, (this.acctCount.get(s.acct) || 0) + 1); this.tokCount.set(s.tok, (this.tokCount.get(s.tok) || 0) + 1)
    const key = this.simKey(s), c = (this.simCount.get(key) || 0) + 1; this.simCount.set(key, c)
    const m = this.simMembers.get(key); if (m) m.push(s.id); else this.simMembers.set(key, [s.id])
    if (c >= this.policy.minGroup) this.registerCampaign(key, c, s)
  }
  private registerCampaign(key: number, g: number, s: Sess) {
    let c = this.campaigns.get(key)
    if (!c) {
      c = { id: 'C-' + (++this.campSeq + 180), key, size: g, firstT: this.t, lastT: this.t, coord: 0.7, kind: 'BEHAVIORAL', mitigated: 0, truthBot: 0, truthTotal: 0, dominant: s.strat, evidence: ['shared_behavior_fingerprint', 'synchronized_join_window'], members: [] }
      this.campaigns.set(key, c); this.lastCampT = this.t
      const nC = this.campaigns.size
      if (nC <= 4) this.ev('mitigation', `Campaign ${c.id}: ${g} sessions exhibit coordinated behavior (shared behavioral signature, synchronized join window)`, 'warn')
      else if (nC % 25 === 0) this.ev('mitigation', `${nC} coordinated campaigns tracked (latest ${c.id}: ${g} sessions)`, 'warn')
      if (nC <= 3 || nC % 50 === 0) this.inc('camp:' + c.id, 'Bot campaign detected', `Campaign ${c.id} — coordinated sessions`, 'bad', [`${g}+ sessions share a behavioral signature`, 'joins fall inside one synchronization window', 'IP address not used as an identity edge'], 'Campaign rule: challenge + throttle; quarantine on high composite risk; identity clusters deduplicated', 'Mitigation in progress', 'MITIGATED')
    }
    c.size = g; c.lastT = this.t
  }
  private flushIdentity() {
    this.icTouched.forEach(r => {
      const rt = this.find(r), n = this.usize[rt]; if (n < 3) return
      let c = this.identity.get(rt)
      if (!c) { c = { id: 'IC-' + ++this.icSeq, key: rt, size: n, firstT: this.t, lastT: this.t, coord: 0.85, kind: 'IDENTITY', mitigated: 0, truthBot: 0, truthTotal: 0, dominant: this.sessions[rt].strat, evidence: ['shared_account_or_token_or_device'], members: [] }; this.identity.set(rt, c)
        if (this.identity.size === 1 || this.identity.size % 100 === 0) this.inc('ic:' + c.id, 'High-risk session cluster', `Identity cluster ${c.id} — ${n} sessions, one eligibility context`, 'warn', [`${n} sessions linked by shared account / token family / device`, 'IP address is not used as an identity edge'], 'One eligibility entry per identity cluster', `${this.identity.size} identity clusters so far`, 'MITIGATED') }
      c.size = Math.max(c.size, n); c.lastT = this.t
    }); this.icTouched.clear()
  }
  private rebuildSim() { this.simCount = new Map(); this.simMembers = new Map(); for (const s of this.joined) if (s.st !== 'REJECTED' || s.evidence[0] !== 'known_blocked_identity') { const k = this.simKey(s), c = (this.simCount.get(k) || 0) + 1; this.simCount.set(k, c); const m = this.simMembers.get(k); if (m) m.push(s.id); else this.simMembers.set(k, [s.id]); if (c >= this.policy.minGroup) this.registerCampaign(k, c, s) } }
  private obsOf(s: Sess) { const a = this.t - s.joinT; return s.bot ? s.rate * a : s.rate * (this.cumSurge[this.t] - this.cumSurge[Math.max(0, s.joinT)]) }
  private feat(s: Sess): Features {
    const age = Math.max(1, this.t - s.joinT), obs = this.obsOf(s), n = Math.max(1, obs), r = this.r, sz = this.usize[this.find(s.id)]
    return { rate: obs / age, cv: Math.max(0.01, s.cv + (normal(r) * 0.6) / Math.sqrt(n)), refresh: Math.max(0, s.refresh * (1 + normal(r) * 0.15)), conc: sz > 1 ? this.acctCount.get(s.acct) || 1 : 1, tokReuse: Math.max(0, (this.tokCount.get(s.tok) || 1) - 1), bypass: s.bypass, simGroup: (this.simCount.get(this.simKey(s)) || 1) - 1, regularity: clamp(s.reg + (normal(r) * 0.1) / Math.sqrt(n), 0, 1) }
  }
  private score(batch: Sess[]) {
    if (!batch.length) return
    const feats = batch.map(s => this.feat(s)), X = feats.map(transform)
    if (!this.ifReady) { for (const x of X) if (this.ifPool.length < 4000) this.ifPool.push(x); if (this.ifPool.length >= 400 || this.el >= 8) { const step = Math.max(1, Math.ceil(this.ifPool.length / 1500)); this.ifor.fit(this.ifPool.filter((_, i) => i % step === 0), rng(this.cfg.seed + ':iforest')); this.ifReady = true; this.ifPool = [] } }
    const P = this.policy
    batch.forEach((s, i) => {
      const f = feats[i], rt = this.find(s.id), sz = this.usize[rt], g = f.simGroup + 1
      const idScore = sz > 1 ? Math.min(1, (sz - 1) / 3) * 0.85 : 0, half = Math.max(4, P.minGroup / 2)
      const simScore = g < half ? 0 : Math.min(1, 0.45 + 0.15 * Math.log2(g / half + 1)); s.coord = Math.max(idScore, simScore)
      const m = riskModel(f); s.risk = m.risk; s.anom = this.ifReady ? this.ifor.score(X[i]) : 0.5
      const an = Math.max(0, (s.anom - 0.5) * 2)
      s.comp = clamp(0.6 * s.risk + 0.15 * an + 0.25 * s.coord, 0, 1)
      s.evidence = evidenceFor(m.contrib); if (s.coord >= 0.45 && !s.evidence.includes('shared_behavior_fingerprint')) s.evidence.push('coordination_graph')
      let act: Action = 'NORMAL'
      if (s.bypass > 0) act = 'REJECT'
      else if (s.comp >= P.tQuarantine) act = 'QUARANTINE'
      else if (s.comp >= P.tThrottle) act = 'THROTTLE'
      else if (s.comp >= P.tChallenge) act = 'CHALLENGE'
      if (g >= P.minGroup && s.coord >= 0.6 && ACT_RANK[act] < 1) { act = 'CHALLENGE'; s.evidence.push('campaign_rule') }
      if (P.level >= 2 && act === 'NORMAL') { act = 'CHALLENGE'; s.evidence.push('universal_challenge') } // last-resort: step-up challenge for every new session (friction cost is measured)
      if ((act === 'CHALLENGE' || act === 'THROTTLE') && !s.chal) { s.chal = true; s.chOk = this.r() < s.pass }
      if (act !== 'NORMAL' && act !== 'QUARANTINE' && act !== 'REJECT' && !s.chOk) act = 'REJECT'
      const prevAct = s.act, from = this.bIdx(s)
      if (ACT_RANK[act] >= 3) { this.blockedFp.add(s.fp); this.blockedTok.add(s.tok); this.blockedAcct.add(s.acct); s.st = 'QUARANTINED' }
      else if (s.st === 'QUARANTINED') s.st = 'ACTIVE' // RISK state machine: recovery
      s.act = act; s.level = act === 'NORMAL' ? 0 : act === 'CHALLENGE' ? 1 : act === 'THROTTLE' ? 2 : 3; s.rounds++
      if (s.st !== 'COMPLETED') this.aggMove(s, from, this.bIdx(s))
      if (act !== 'NORMAL' && s.flagT < 0) { s.flagT = this.t; if (s.bot && this.firstBotFlag < 0) this.firstBotFlag = this.t }
      if (ACT_RANK[act] > ACT_RANK[prevAct] && ACT_RANK[act] >= 1) this.flaggedNew++
      if (s.rounds < ROUNDS.length) { const at = s.joinT + ROUNDS[s.rounds], l = this.dueScore.get(at) || []; l.push(s); this.dueScore.set(at, l) }
      if (act !== 'NORMAL' && (this.riskStream.length < 60 || this.r() < 0.02)) {
        const c = this.campaigns.get(this.simKey(s))
        this.riskStream.unshift({ session_id: sidOf(s.id), event_id: this.cfg.eventId, risk_score: +s.risk.toFixed(3), anomaly_score: +s.anom.toFixed(3), coordination_score: +s.coord.toFixed(3), campaign_id: c ? c.id : null, attack_type: c ? c.dominant : null, evidence: s.evidence.slice(0, 5), model_version: MODEL_VERSION, timestamp: new Date(1760000000000 + this.t * 1000).toISOString(), action: act })
        if (this.riskStream.length > 300) this.riskStream.length = 300 }
    })
  }
  /** deterministic policy escalation: evidence-driven, logged. */
  private policyStep() {
    const w = this.flagWindow; w.push(this.flaggedNew); this.flaggedNew = 0; if (w.length > 6) w.shift()
    const sum = w.reduce((a, b) => a + b, 0)
    if (this.t - this.lastEscT >= 12 && this.policy.level < 3 && this.attackActive && sum >= 80 && this.el > 10 && this.t - this.lastCampT <= 12) {
      const P = this.policy; P.level++; this.escalations++; this.lastEscT = this.t
      const old = { tc: P.tChallenge, mg: P.minGroup, sw: P.syncWin }
      P.tChallenge = Math.max(0.26, P.tChallenge - 0.04); P.minGroup = Math.max(6, P.minGroup - 3); P.syncWin = Math.min(40, Math.round(P.syncWin * 1.5))
      this.rebuildSim()
      this.ev('policy', `Policy escalated to level ${P.level}: challenge threshold ${old.tc.toFixed(2)}→${P.tChallenge.toFixed(2)}, campaign min-group ${old.mg}→${P.minGroup}, sync window ${old.sw}s→${P.syncWin}s (${sum} new sessions flagged in 6s)`, 'warn')
      this.inc('esc:' + P.level, 'Policy adapted', `Defense escalated to level ${P.level}`, 'warn', [`${sum} new flagged sessions in last 6 s`, 'new cohort observed after earlier mitigation'], P.level >= 2 ? 'Tightened thresholds + step-up challenge for all new sessions (friction cost measured)' : 'Tightened challenge threshold, widened correlation window', 'Deterministic policy applied; ML remains advisory', 'MITIGATED')
    }
  }
  private finalize() {
    if (this.mlOnline && this.cfg.detect) { const b = this.joined.filter(s => s.rounds === 0 && s.st !== 'REJECTED'); this.score(b) }
    this.flushIdentity()
    const seen = new Set<number>(), elig: number[] = []
    const cand = this.joined.slice().sort((a, b) => a.joinT - b.joinT || a.id - b.id)
    for (const s of cand) {
      s.idRoot = this.find(s.id); s.idSize = this.usize[s.idRoot]
      const ok = s.act === 'NORMAL' || ((s.act === 'CHALLENGE' || s.act === 'THROTTLE') && s.chOk)
      if (!ok || s.st === 'REJECTED' || s.st === 'QUARANTINED') { s.eligible = false; s.outcome = 'BLOCKED'; continue }
      if (seen.has(s.idRoot)) { s.eligible = false; s.outcome = 'BLOCKED'; this.counters.dup++; continue }
      seen.add(s.idRoot); s.eligible = true; s.st = 'QUEUED'; elig.push(s.id)
    }
    for (let i = this.bi; i < this.backlog.length; i++) { const s = this.backlog[i]; if (s.st === 'BUFFERED') { this.aggAdd(s, 0, -1); s.st = 'REJECTED'; s.outcome = 'BLOCKED'; this.counters.lateRejected++ } }
    this.backlog = []; this.bi = 0
    this.eligibleIds = elig.sort((a, b) => a - b); this.eligibleRoot = rootOf(this.eligibleIds)
  }

  // ---------------- main step ----------------
  step(): Frame | null {
    if (this.phase === 'PREPARED' || this.phase === 'ENDED') return null
    this.t++; this.cumSurge[this.t] = this.cumSurge[this.t - 1] + this.cfg.surge
    const el = this.el, fair = this.cfg.mode === 'FAIR', r = this.r
    let _t = performance.now(); const lap = (k: string) => { const n = performance.now(); this.prof[k] += n - _t; _t = n }
    // 1. arrivals → backlog
    const fresh: Sess[] = []
    while (this.fi < this.future.length && this.future[this.fi].arrive <= el) { const s = this.future[this.fi++]; if (s.st === 'FUTURE') { s.st = 'BUFFERED'; fresh.push(s) } }
    if (fresh.length) {
      if (!fair) { for (const s of fresh) s.key = s.arrive + r() / (1 + s.rate * (s.strat === 'MULTI_SESSION' ? 2 : 1)); fresh.sort((a, b) => a.key - b.key) }
      for (const s of fresh) { this.backlog.push(s); this.aggAdd(s, 0, 1) }
    }
    // 2. joins (bounded by critical-endpoint capacity; buffered otherwise)
    const open = (fair && this.phase === 'PRE_QUEUE_OPEN') || (!fair && el <= this.cfg.preQueueSec)
    this.joinStep(open, fair); lap('join')
    // 3. attacker bypass attempts + scoring rounds due now
    const byp = this.dueBypass.get(this.t); if (byp) { this.dueBypass.delete(this.t); for (const s of byp) this.bypassAttempt(s) }
    if (fair && this.phase === 'PRE_QUEUE_OPEN') {
      this.flushIdentity()
      const due = this.dueScore.get(this.t); if (due) { this.dueScore.delete(this.t); if (this.mlOnline && this.cfg.detect) this.score(due.filter(s => s.st !== 'REJECTED' && s.st !== 'COMPLETED')) }
      this.policyStep(); this.attackerStep()
    } else if (!fair) this.attackerStep()
    lap('score')
    // 4. demand / resilience
    const acc = this.readAgg(); lap('acc'); this.lastAcc = acc
    const res = this.resilience(acc); lap('res')
    // 5. lifecycle
    this.lifecycle(fair); lap('life')
    const fr = this.makeFrame(acc, res); lap('frame'); return fr
  }
  private joinStep(open: boolean, fair: boolean) {
    const lastLoad = this.frames.length ? this.frames[this.frames.length - 1].load : 0
    const cap = Math.ceil(this.cfg.capacity * 0.03 * (lastLoad > 1 ? 1 / lastLoad : 1)); let n = 0
    if (!open) return
    while (this.bi < this.backlog.length && n < cap) {
      const s = this.backlog[this.bi++]; if (s.st !== 'BUFFERED') continue
      if (fair && (this.blockedFp.has(s.fp) || this.blockedTok.has(s.tok) || this.blockedAcct.has(s.acct))) {
        this.aggAdd(s, 0, -1); s.st = 'REJECTED'; s.joinT = this.t; s.act = 'REJECT'; s.outcome = 'BLOCKED'; s.evidence = ['known_blocked_identity']; this.joined.push(s); this.joinedAll++; this.aggAdd(s, this.bIdx(s), 1); this.flaggedNew++
        if (s.bot && this.firstBotFlag < 0) this.firstBotFlag = this.t; continue }
      this.admitJoin(s); n++
      if (!fair) { s.eligible = true; this.order.push(s); s.pos = this.order.length }
    }
    if (this.bi > 8192 && this.bi * 2 > this.backlog.length) { this.backlog = this.backlog.slice(this.bi); this.bi = 0 }
  }
  private bypassAttempt(s: Sess) {
    if (s.bypass > 0) return
    // attacker presents a forged / replayed / tampered token against a protected endpoint; the server verifies the HMAC.
    const sid = sidOf(s.id), eid = this.cfg.eventId, mode = s.id % 20, other = sidOf((s.id + 1) % Math.max(1, this.sessions.length))
    let tok: string
    if (mode < 12) tok = signToken('attacker-guess-' + s.id, { kind: 'admit', sid, eid, pos: 1, exp: this.t + 600 }) // forged signature
    else if (mode < 17) tok = signToken(this.secret, { kind: 'admit', sid: other, eid, pos: 5, exp: this.t + 600 }) // replay of someone else's valid token
    else tok = signToken(this.secret, { kind: 'entry', sid, eid, pos: 0, exp: this.t + 600 }) // entry token presented as an admission token
    const v = verifyToken(this.secret, tok, { sid, eid, kind: 'admit', now: this.t })
    if (!v.ok) {
      s.bypass++; this.counters.bypassBlocked++
      if (this.counters.bypassBlocked === 1) this.ev('mitigation', `Queue bypass attempt blocked: token rejected (${v.reason}) — server never trusts client queue position`, 'bad')
      if (this.counters.bypassBlocked === 1 || this.counters.bypassBlocked % 250 === 0) this.inc('bypass', 'Queue bypass attempt', 'Forged / replayed admission tokens against protected endpoints', 'bad', [`${this.counters.bypassBlocked} token validations failed (HMAC / session binding)`, 'client-supplied queue position is ignored'], 'REJECT + identity reputation block', `${this.counters.bypassBlocked} attempts rejected; inventory untouched`, 'MITIGATED')
      if (this.mlOnline && this.cfg.detect) { const b = this.joined.length; void b; this.score([s]) }
    }
  }
  private resilience(A: Acc) {
    const cap = this.cfg.capacity, load0 = (A.crit + A.non) / cap
    const shed = load0 > 0.75 ? Math.min(0.92, (load0 - 0.75) / load0) : 0
    const load = (A.crit + A.non * (1 - shed)) / cap
    const rho = Math.min(0.97, load * 0.85), jit = 1 + (this.r() - 0.5) * 0.08
    let p50 = (32 / (1 - rho)) * jit; if (this.breaker === 'OPEN') p50 += 90
    const p95 = p50 * (1.8 + 2.2 * Math.min(load, 1.6)), p99 = p95 * (1.3 + 0.6 * Math.min(load, 1.6))
    if (load > 1.0) this.breakerHot++; else this.breakerHot = Math.max(0, this.breakerHot - 1)
    const prevB = this.breaker
    if (this.breaker === 'CLOSED' && this.breakerHot >= 3) this.breaker = 'OPEN'
    else if (this.breaker === 'OPEN' && load < 0.9) this.breaker = 'HALF-OPEN'
    else if (this.breaker === 'HALF-OPEN') this.breaker = load < 0.7 ? 'CLOSED' : load > 1 ? 'OPEN' : 'HALF-OPEN'
    if (prevB !== this.breaker) this.ev('resilience', `Circuit breaker ${prevB} → ${this.breaker} (load ${(load * 100).toFixed(0)}%)`, this.breaker === 'OPEN' ? 'bad' : 'ok')
    const prev = this.state; let st: Health = load < 0.45 ? 'HEALTHY' : load < 0.7 ? 'ELEVATED' : load < 1 ? 'SATURATED' : 'DEGRADED'
    const bad = st === 'SATURATED' || st === 'DEGRADED'
    if (bad) { this.prevBad = true; this.badSince = this.t }
    else if (this.prevBad && this.t - this.badSince <= 15 && load < 0.7) st = 'RECOVERING'
    if (!bad && this.prevBad && this.t - this.badSince > 15) this.prevBad = false
    if (load > 1) this.counters.recovered += Math.round(this.joinedAll * 0.004 * (load - 1)) // modelled dropped connections recovered through signed-token session continuity
    if (st !== prev) {
      if (bad && (prev === 'HEALTHY' || prev === 'ELEVATED')) { this.ev('resilience', `Saturation detected (${(load0 * 100).toFixed(0)}% raw load) → backpressure: shedding ${(shed * 100).toFixed(0)}% of non-critical requests, critical endpoints prioritized`, 'warn'); this.inc('sat', 'Flash crowd saturation', 'Gateway saturation during arrival surge', st === 'DEGRADED' ? 'bad' : 'warn', [`raw load ${(load0 * 100).toFixed(0)}% of capacity`, `p99 ${Math.round(p99)} ms (modelled)`], `Load shedding ${(shed * 100).toFixed(0)}% non-critical · per-source rate limit ${SRC_LIMIT} rps · join buffering`, 'Sessions buffered, not dropped; inventory path protected', 'OPEN') }
      if (st === 'RECOVERING') { this.ev('resilience', 'Recovery: load back under control, backlog draining', 'ok'); this.resolve('sat', `Recovered at t=${this.el}s; peak load ${(this.peak.load * 100).toFixed(0)}%`); this.inc('recov', 'Recovery completed', 'System returned to nominal load', 'ok', [`load ${(load * 100).toFixed(0)}%`], 'Throttling relaxed, shed fraction → 0', 'Recovered without inventory violations', 'RESOLVED') }
    }
    if (A.off > 18000 && !this.incKey.has('surge')) this.inc('surge', 'Traffic surge', 'Request rate surge detected', 'warn', [`${Math.round(A.off).toLocaleString()} offered req/s`, `${this.joinedAll.toLocaleString()} sessions joined`], 'Edge rate limiting + queue buffering engaged', 'Surge absorbed by pre-queue', 'MITIGATED')
    this.state = st; this.peak.load = Math.max(this.peak.load, load); this.peak.p99 = Math.max(this.peak.p99, p99); this.peak.rps = Math.max(this.peak.rps, A.off); this.peak.shed = Math.max(this.peak.shed, shed)
    return { load, load0, shed, p50: Math.round(p50), p95: Math.round(p95), p99: Math.round(p99), st }
  }

  // ---------------- admission / inventory lifecycle ----------------
  private lifecycle(fair: boolean) {
    const cfg = this.cfg
    if (fair && cfg.autopilot) {
      if (this.phase === 'PRE_QUEUE_OPEN' && this.el >= cfg.preQueueSec) this.closePreQueue()
      else if (this.phase === 'PRE_QUEUE_CLOSED' && this.t - this.tClose >= 2) this.randomize()
      else if (this.phase === 'RANDOMIZED' && this.t - this.tRandom >= 2) this.startAdmission()
    }
    this.tick = { granted: 0, rejected: 0 }
    if (this.phase === 'ADMITTING' || this.phase === 'PAUSED') {
      const dh = this.dueHold.get(this.t); if (dh) { this.dueHold.delete(this.t); for (const s of dh) this.doHold(s) }
      const dp = this.duePay.get(this.t); if (dp) { this.duePay.delete(this.t); for (const s of dp) this.doPay(s) }
    }
    const exp = this.inv.expireDue(this.t)
    for (const h of exp) { this.counters.expiredHolds++; const s = this.holdOwner.get(h.id); if (s) { this.bought.set(this.identKey(s), Math.max(0, (this.bought.get(this.identKey(s)) || 0) - h.qty)); if (!s.outcome) this.finish(s, 'EXPIRED') } }
    if (exp.length && (this.counters.expiredHolds <= 3 || this.counters.expiredHolds % 20 === 0)) this.ev('inventory', `${exp.length} hold(s) expired: HELD → AVAILABLE (TTL ${cfg.holdTtl}s)`, 'info')
    if (this.tick.granted > 0 && this.tick.rejected > 0) {
      const first = this.counters.raced === 0; this.counters.raced += this.tick.rejected
      if (first) this.ev('inventory', `Contention on final inventory: ${this.tick.rejected} concurrent hold request(s) rejected atomically — no oversell`, 'ok')
      const st = this.inv.stats(); this.inc('race', 'Inventory race prevented', 'Concurrent holds raced for the last seats', 'ok', [`${this.counters.raced} contended hold attempts rejected`, 'atomic check-and-set under one writer'], 'Atomic hold: one winner per seat, rest rejected', `CONFIRMED+HELD+AVAILABLE=TOTAL held (oversell ${st.oversell})`, 'RESOLVED')
    }
    if (this.phase === 'ADMITTING') this.admitStep(fair)
    if (this.phase === 'ADMITTING' || this.phase === 'PAUSED') {
      const st = this.inv.stats()
      if (this.outstanding === 0 && (st.confirmed + st.held >= st.total || this.ap >= this.order.length)) {
        if (fair || this.el > cfg.preQueueSec) { this.phase = 'ENDED'; this.ev('admission', st.confirmed >= st.total ? 'SOLD OUT · all inventory CONFIRMED · drop ended' : 'Admission pool exhausted · drop ended', 'ok'); this.stampOutcomes() }
      }
    }
  }
  private admitStep(fair: boolean) {
    const cfg = this.cfg, st = this.inv.stats(), remaining = st.available + st.held
    let k: number
    if (fair) {
      // inventory-aware pacing: admit only as many purchase windows as the *unclaimed* inventory can plausibly convert,
      // so being admitted is never a race inside the admitted cohort (speed inside the cohort would re-introduce a bot advantage).
      const meanQty = this.meanQty(), desired = Math.ceil((st.available / meanQty) * 1.15), budget = Math.max(0, desired - this.unplaced)
      k = Math.min(cfg.admitRate, budget); if (remaining === 0) k = 0
      const thr = budget < cfg.admitRate && this.ap < this.order.length && remaining > 0
      if (thr && !this.admissionThrottled) { this.admissionThrottled = true; this.ev('admission', `Admission throttled: ${this.unplaced} participants already hold open purchase windows for ${st.available} unclaimed seats`, 'warn'); this.inc('athr', 'Admission throttled', 'Admission rate reduced to inventory-aware budget', 'info', [`${st.available} unclaimed seats`, `${this.unplaced} open purchase windows`], 'Admit only as many as inventory can plausibly convert', 'No oversubscription of the checkout path', 'MITIGATED') }
      if (!thr) this.admissionThrottled = false
    } else k = Math.min(300, this.order.length - this.ap)
    this.admitRateNow = 0
    while (k-- > 0 && this.ap < this.order.length) {
      const s = this.order[this.ap++]; if (fair && s.st !== 'QUEUED') continue
      s.st = 'ADMITTED'; s.admitT = this.t; this.outstanding++; this.unplaced++; this.admitted++; this.admitRateNow++
      s.token = signToken(this.secret, { kind: 'admit', sid: sidOf(s.id), eid: cfg.eventId, pos: s.pos, exp: this.t + (s.ext ? 900 : 300) })
      if (!s.ext) { const at = this.t + Math.max(1, Math.ceil(s.think)), l = this.dueHold.get(at) || []; l.push(s); this.dueHold.set(at, l) }
    }
    // external (customer) purchase windows time out if unused
    if (this.ext.size) this.ext.forEach(s => { if ((s.st === 'ADMITTED') && s.admitT >= 0 && this.t - s.admitT > 900) this.finish(s, 'EXPIRED') })
  }
  private doHold(s: Sess) {
    if (s.outcome) return
    if (s.abandon) { this.finish(s, 'ABANDONED'); return }
    const cfg = this.cfg, r = this.r, pw = [0.65, 0.25, 0.1]
    let ti = -1
    if (s.bot) { for (const p of [2, 1, 0]) if (p < cfg.types.length && this.inv.avail[p] > 0) { ti = p; break } }
    else { const ws = cfg.types.map((_, i) => (this.inv.avail[i] > 0 ? pw[i] ?? 0.1 : 0)), tot = ws.reduce((a, b) => a + b, 0); if (tot > 0) { let x = r() * tot; for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) { ti = i; break } } } }
    if (ti < 0) { this.tick.rejected++; this.finish(s, 'SOLD_OUT'); return }
    const qty = s.bot ? cfg.maxQty : humanQty(r, cfg.maxQty), retries = s.bot ? 2 + Math.floor(r() * 3) : r() < 0.04 ? 1 : 0
    const res = this.holdFor(s, s.token, ti, qty, 'h1')
    for (let k = 0; k < retries; k++) { const rp = this.holdFor(s, s.token, ti, qty, 'h1'); if (rp.ok && rp.replay) this.counters.dup++ }
    if (!res.ok) { this.tick.rejected++; this.finish(s, res.reason === 'LIMIT' ? 'BLOCKED' : 'SOLD_OUT'); return }
    this.tick.granted++
    if (!s.hoard) { const at = this.t + Math.max(1, Math.ceil(s.payT)), l = this.duePay.get(at) || []; l.push(s); this.duePay.set(at, l) }
  }
  private doPay(s: Sess) {
    if (s.outcome || !s.hold) return
    if (s.payFail) { this.releaseFor(s, s.hold); return }
    const res = this.confirmFor(s, s.hold, 'pay'); if (!res.ok) this.finish(s, 'EXPIRED')
  }

  // ---------------- views ----------------
  private makeFrame(A: Acc, R: ReturnType<DropSim['resilience']>): Frame {
    const st = this.inv.stats()
    const mit = this.firstBotJoin >= 0 && this.firstBotFlag >= 0 ? (this.firstBotFlag - this.firstBotJoin) * 1000 : null
    const f: Frame = {
      t: this.el, phase: this.phase, rps: Math.round(A.off), rpsEff: Math.round(A.crit + A.non * (1 - R.shed)), legit: Math.round(A.legit), susp: Math.round(A.susp), bot: Math.round(A.bot), truthLegit: Math.round(A.tLegit), truthBot: Math.round(A.tBot),
      active: this.joined.length, joined: this.joinedAll, buffered: this.backlog.length - this.bi, quarantined: A.quar, rejected: A.rej, unscored: A.unscored,
      queue: this.phase === 'PRE_QUEUE_OPEN' ? this.joinedAll : Math.max(0, this.order.length - this.ap), p50: R.p50, p95: R.p95, p99: R.p99, load: R.load, shed: R.shed, throttle: R.load > 0.6 || A.quar + A.rej > 0, breaker: this.breaker, state: R.st,
      risk: A.risk, seats: { total: st.total, avail: st.available, held: st.held, confirmed: st.confirmed }, seatsLegit: this.seatTally[0], seatsBot: this.seatTally[1], dup: this.counters.dup, limitBlocks: this.counters.limitBlocks, raced: this.counters.raced, expired: this.counters.expiredHolds, oversell: st.oversell, integrity: st.integrity,
      admitted: this.admitted, admitRate: this.admitRateNow, outstanding: this.outstanding, eligible: this.eligibleIds.length, campaigns: this.campaigns.size, identityClusters: this.identity.size, strategyIdx: this.strategyIdx, strategy: this.attackActive ? (this.cfg.scenario === 'ADAPTIVE' ? STRATEGY_ORDER[this.strategyIdx] : this.cfg.scenario) : 'NONE', escalation: this.policy.level,
      mitigationMs: mit, bypassBlocked: this.counters.bypassBlocked, recovered: this.counters.recovered, tp: A.tp, fp: A.fp, fn: A.fn, tn: A.tn,
    }
    this.frames.push(f); if (this.frames.length > 240) this.frames.shift(); return f
  }
  get frame(): Frame | undefined { return this.frames[this.frames.length - 1] }
  /** campaigns with ground-truth purity (admin-only; the simulator knows the truth). */
  campaignList(limit = 60): CampaignInfo[] {
    const list = [...this.campaigns.values()].sort((a, b) => b.size - a.size).slice(0, limit)
    for (const c of list) { const m = this.simMembers.get(c.key) || []; c.truthTotal = m.length; let b = 0, mit = 0; for (const i of m) { const s = this.sessions[i]; if (s.bot) b++; if (s.act !== 'NORMAL') mit++ } c.truthBot = b; c.mitigated = mit; c.members = m.slice(0, 24); c.size = Math.max(c.size, m.length)
      const strat: Record<string, number> = {}; for (const i of m.slice(0, 400)) { const k = this.sessions[i].strat; strat[k] = (strat[k] || 0) + 1 } c.dominant = Object.entries(strat).sort((a, b) => b[1] - a[1])[0]?.[0] || c.dominant }
    return list
  }
  identityList(limit = 40): CampaignInfo[] {
    const list = [...this.identity.values()].sort((a, b) => b.size - a.size).slice(0, limit)
    for (const c of list) { c.size = Math.max(c.size, this.usize[this.find(c.key)]); c.dominant = this.sessions[c.key].strat; c.truthBot = this.sessions[c.key].bot ? c.size : 0; c.truthTotal = c.size }
    return list
  }
  /** feature distributions by ground-truth class (admin-only). */
  featureSummary() {
    const keys = ['rate', 'cv', 'simG', 'idSize', 'reg'] as const, out: Record<string, { human: number[]; bot: number[] }> = {}
    for (const k of keys) out[k] = { human: [], bot: [] }
    let hN = 0, bN = 0
    for (const s of this.joined) { if (s.rounds === 0) continue; if (s.bot) { if (bN++ > 3000) continue } else if (hN++ > 3000) continue; const tgt = s.bot ? 'bot' : 'human'
      out.rate[tgt].push(s.rate); out.cv[tgt].push(s.cv); out.simG[tgt].push((this.simCount.get(this.simKey(s)) || 1) - 1); out.idSize[tgt].push(this.usize[this.find(s.id)]); out.reg[tgt].push(s.reg) }
    return out
  }
  confusionNow() { const A = this.lastAcc; return A ? { tp: A.tp, fp: A.fp, fn: A.fn, tn: A.tn } : { tp: 0, fp: 0, fn: 0, tn: 0 } }
  /** ground-truth session-level confusion over every session the detector has scored (flagged = throttled / quarantined / rejected). */
  confusionFinal() { let tp = 0, fp = 0, fn = 0, tn = 0; for (const s of this.joined) { if (s.rounds === 0 && s.act === 'NORMAL') continue; const flagged = s.act === 'THROTTLE' || s.act === 'QUARANTINE' || s.act === 'REJECT'; if (s.bot) flagged ? tp++ : fn++; else flagged ? fp++ : tn++ } return { tp, fp, fn, tn } }
  result(): SimResult {
    const ss = this.sessions, bots = ss.filter(s => s.bot), humans = ss.filter(s => !s.bot && !s.ext)
    const joinedLegit = humans.filter(s => s.joinT >= 0 && s.act !== 'REJECT').length, joinedBot = bots.filter(s => s.joinT >= 0).length
    const accts = new Set<number>(); bots.forEach(s => accts.add(s.acct)); const botAcc = accts.size
    let seatsLegit = 0, seatsBot = 0, wL = 0, wB = 0
    for (const a of this.allocs) if (a.bot) { seatsBot += a.qty; wB++ } else { seatsLegit += a.qty; wL++ }
    const sold = seatsLegit + seatsBot, legitAcc = new Set(humans.map(s => s.acct)).size
    const ident = botAcc / Math.max(1, botAcc + legitAcc), share = sold ? seatsBot / sold : 0
    const fair = this.cfg.mode === 'FAIR'
    const eligible = fair ? this.eligibleIds.length : this.order.length
    const eb = fair ? this.eligibleIds.filter(i => ss[i].bot).length : this.order.filter(s => s.bot).length
    let rs = 0, rn = 0; this.order.forEach((s, i) => { if (!s.bot) { rs += i / Math.max(1, this.order.length - 1); rn++ } })
    const c = fair && this.cfg.detect ? this.confusionFinal() : { tp: 0, fp: 0, fn: 0, tn: 0 }
    const inv = this.inv.counters
    return {
      mode: this.cfg.mode, scenario: this.cfg.scenario, seats: this.inv.total, ticks: this.t, legitAccounts: legitAcc, botAccounts: botAcc, botSessions: bots.length, sessions: ss.length,
      joinedLegit, joinedBot, eligible, eligibleLegit: eligible - eb, eligibleBot: eb, quarantinedBot: bots.filter(s => s.act === 'QUARANTINE' || s.act === 'REJECT').length, blockedLegit: humans.filter(s => s.joinT >= 0 && !s.eligible && fair).length,
      seatsLegit, seatsBot, winnersLegit: wL, winnersBot: wB, sold, botSeatShare: share, botIdentityShare: ident, botEligibleShare: eligible ? eb / eligible : 0,
      aaaRatio: ident > 0 ? share / ident : 0, aaaPP: (share - ident) * 100, legitAllocationRate: legitAcc ? wL / legitAcc : 0, legitRankShift: rn ? rs / rn - 0.5 : 0,
      peakLoad: this.peak.load, peakP99: this.peak.p99, peakRps: this.peak.rps, shedPeak: this.peak.shed, dupBlocked: this.counters.dup, limitBlocks: this.counters.limitBlocks, bypassBlocked: this.counters.bypassBlocked, raced: this.counters.raced,
      oversell: this.inv.stats().oversell, integrity: this.inv.stats().integrity, mitigationMs: this.firstBotJoin >= 0 && this.firstBotFlag >= 0 ? (this.firstBotFlag - this.firstBotJoin) * 1000 : null,
      precision: c.tp + c.fp ? c.tp / (c.tp + c.fp) : 0, recall: c.tp + c.fn ? c.tp / (c.tp + c.fn) : 0, fpr: c.fp + c.tn ? c.fp / (c.fp + c.tn) : 0, tp: c.tp, fp: c.fp, fn: c.fn, tn: c.tn,
      escalations: this.escalations, strategyChanges: this.strategyChanges, totalRequests: Math.round(this.counters.totalRequests), dbMutations: inv.holdGranted + inv.confirmed + inv.released + inv.expired,
      lateRejected: this.counters.lateRejected, legitJoinedFrac: humans.length ? joinedLegit / humans.length : 0,
      legitFriction: humans.filter(s => s.chal || s.act !== 'NORMAL').length, legitDeniedByDetection: humans.filter(s => s.joinT >= 0 && fair && (s.act === 'QUARANTINE' || s.act === 'REJECT')).length,
    }
  }
}
export function defaultConfig(over: Partial<DropConfig> = {}): DropConfig {
  return {
    eventId: 'ai-frontier-mumbai-2026', title: 'AI Frontier Mumbai 2026', seed: 'fairdrop-2026', legit: 40000, autoPct: 0.25, mult: 3, scenario: 'NORMAL', surge: 1, botRate: 1, capacity: 100000,
    preQueueSec: 60, admitRate: 40, holdTtl: 120, maxQty: 2, attackSec: 30, mode: 'FAIR', detect: true, autopilot: true,
    types: [{ id: 'GA', name: 'General', price: 2499, cap: 350, perks: 'Main hall · all keynotes' }, { id: 'PR', name: 'Premium', price: 4999, cap: 100, perks: 'Front sections · workshop access' }, { id: 'VIP', name: 'VIP', price: 9999, cap: 50, perks: 'Speaker lounge · recordings' }], ...over,
  }
}
export function runWorld(cfg: DropConfig, maxTicks = 700): { sim: DropSim; result: SimResult } {
  const sim = new DropSim(cfg); sim.openPreQueue()
  let guard = 0; while (sim.phase !== 'ENDED' && guard++ < maxTicks) sim.step()
  if (sim.phase !== 'ENDED') sim.endDrop()
  return { sim, result: sim.result() }
}
