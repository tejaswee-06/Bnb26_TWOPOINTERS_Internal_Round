// Agent population: legitimate humans (incl. realistic false-positive bait) and adversarial strategies.
// Legitimate population generation uses its own seeded stream so World A / B / Naive see the *identical* legit crowd.
import { Rand, U, logn, clamp, weighted } from './rng'
import { Sess, Strategy } from './types'

export class IdGen { sid = 0; acct = 1; fp = 1; tok = 1; ip = 1; sig = 1; wave = 0 }

function base(g: IdGen, bot: boolean, strat: Sess['strat'], wave: number): Sess {
  return {
    id: g.sid++, acct: 0, fp: 0, tok: 0, ip: 0, bot, strat, wave, arrive: 0, rate: 0.3, cv: 1, refresh: 2, reg: 0.3, crit: 0.25, sig: 0, pass: 0.97, bypassAt: -1, hoard: false,
    think: 8, abandon: false, payT: 16, payFail: false, ext: false, guided: false, label: '', st: 'FUTURE', joinT: -1, key: 0,
    rounds: 0, risk: 0, anom: 0.5, coord: 0, comp: 0, level: 0, act: 'NORMAL', flagT: -1, chal: false, chOk: true, bypass: 0, simG: 0,
    idRoot: -1, idSize: 1, eligible: false, pos: 0, admitT: -1, token: '', hold: '', seats: 0, outcome: undefined, evidence: [], reconnects: 0,
  }
}
const QTY = [1, 2, 3, 4], QTYW = [0.5, 0.35, 0.1, 0.05]
export function humanQty(r: Rand, maxQty: number) { const w = QTYW.map((x, i) => (QTY[i] <= maxQty ? x : 0)); return weighted(r, QTY, w) }

/** Legitimate crowd. `window` = pre-queue length in seconds; arrivals follow a flash-crowd shape. */
export function makeLegit(n: number, window: number, r: Rand, g: IdGen): Sess[] {
  const out: Sess[] = []
  let natLeft = 0, natIp = 0
  for (let i = 0; i < n; i++) {
    const s = base(g, false, 'HUMAN', 0)
    s.acct = g.acct++; s.fp = g.fp++; s.tok = g.tok++
    if (natLeft <= 0 && r() < 0.012) { natLeft = 5 + Math.floor(r() * 36); natIp = g.ip++ }
    if (natLeft > 0) { s.ip = natIp; natLeft-- } else s.ip = g.ip++
    s.arrive = r() < 0.55 ? Math.min(window * 0.95, -Math.log(1 - r() * 0.999) * window * 0.07) : r() * window * 0.95
    const masher = r() < 0.03
    if (masher) { s.rate = U(r, 2, 6); s.cv = U(r, 0.5, 1.0); s.refresh = U(r, 20, 60); s.reg = U(r, 0.2, 0.55) } // humans frantically refreshing: classifier false-positive bait
    else { s.rate = clamp(logn(r, 0.35, 0.6), 0.05, 2); s.cv = U(r, 0.75, 1.5); s.refresh = clamp(logn(r, 2, 0.7), 0, 12); s.reg = U(r, 0.15, 0.6) }
    s.crit = 0.25; s.sig = 1e7 + Math.floor(r() * 1e9); s.pass = 0.97
    s.think = clamp(logn(r, 6, 0.6), 2, 45); s.abandon = r() < 0.12; s.payT = clamp(logn(r, 16, 0.5), 4, 100); s.payFail = r() < 0.05
    out.push(s)
    if (r() < 0.02) { // second browser tab of the same person: same account + token family
      const t2 = base(g, false, 'HUMAN', 0); Object.assign(t2, { acct: s.acct, tok: s.tok, fp: g.fp++, ip: s.ip, arrive: s.arrive + U(r, 1, 6), rate: s.rate * 0.7, cv: s.cv, refresh: s.refresh, reg: s.reg, sig: 1e7 + Math.floor(r() * 1e9), think: s.think, abandon: true })
      out.push(t2)
    }
  }
  return out
}

export interface WaveSpec { strategy: Strategy; accounts: number; start: number; span: number; mult: number; evade: number; wave: number }
export const PASS: Record<Strategy, number> = { SPEED: 0.03, FLOOD: 0.01, MULTI_SESSION: 0.1, QUEUE_JUMP: 0.05, DISTRIBUTED: 0.15, LOW_SLOW: 0.45, RECONNECT: 0.1 }

/** Adversarial wave. `start` = seconds since drop open when the wave begins arriving. evade ∈ [0,1] widens signature diversity (adaptive attacker). */
export function makeWave(w: WaveSpec, r: Rand, g: IdGen, botIpPool = 4000): Sess[] {
  const out: Sess[] = [], st = w.strategy, sigBase = (g.sig += 100000) * 10
  const sigK = (st === 'SPEED' ? 3 : st === 'FLOOD' ? 2 : st === 'MULTI_SESSION' ? 40 : st === 'QUEUE_JUMP' ? 12 : st === 'DISTRIBUTED' ? 3 : st === 'LOW_SLOW' ? 60 : 10) * (st === 'DISTRIBUTED' ? 1 + w.evade * 60 : 1 + w.evade * 4)
  const fpPool = st === 'SPEED' ? Math.max(8, Math.floor(w.accounts / 40)) : st === 'FLOOD' ? 10 : 0
  const fpBase = g.fp; if (fpPool) g.fp += fpPool
  const mkSess = (acct: number, tok: number, fp: number, arrive: number, ord: number): Sess => {
    const s = base(g, true, st, w.wave)
    s.acct = acct; s.tok = tok; s.fp = fp; s.ip = 5e6 + Math.floor(r() * botIpPool); s.sig = sigBase + Math.floor(r() * sigK); s.pass = PASS[st] + (st === 'LOW_SLOW' || st === 'DISTRIBUTED' ? w.evade * 0.1 : 0)
    s.arrive = w.start + arrive; s.abandon = false; s.think = U(r, 0.1, 1.2); s.payT = U(r, 0.5, 2); s.payFail = false; s.crit = 0.4
    switch (st) {
      case 'SPEED': s.rate = clamp(logn(r, 12, 0.5), 4, 40); s.cv = U(r, 0.03, 0.15); s.refresh = r() < 0.5 ? 0 : U(r, 60, 300); s.reg = U(r, 0.88, 0.99); s.hoard = r() < 0.3; break
      case 'FLOOD': s.rate = U(r, 80, 250); s.cv = U(r, 0.02, 0.08); s.refresh = U(r, 200, 600); s.reg = U(r, 0.9, 0.99); s.crit = 0.05; s.hoard = false; break
      case 'MULTI_SESSION': s.rate = U(r, 0.8, 3); s.cv = U(r, 0.3, 0.6); s.refresh = U(r, 5, 20); s.reg = U(r, 0.75, 0.95); s.hoard = r() < 0.1; break
      case 'QUEUE_JUMP': s.rate = U(r, 2, 6); s.cv = U(r, 0.2, 0.4); s.refresh = U(r, 0, 10); s.reg = U(r, 0.8, 0.95); s.bypassAt = 1 + Math.floor(r() * 4); break
      case 'DISTRIBUTED': s.rate = U(r, 2, 6); s.cv = U(r, 0.15, 0.35); s.refresh = U(r, 0, 6); s.reg = U(r, 0.85, 0.95); break
      case 'LOW_SLOW': s.rate = U(r, 0.15, 0.6); s.cv = U(r, 0.6, 1.1); s.refresh = U(r, 1, 4); s.reg = U(r, 0.6, 0.85); break
      case 'RECONNECT': s.rate = U(r, 1, 4); s.cv = U(r, 0.25, 0.5); s.refresh = U(r, 2, 10); s.reg = U(r, 0.75, 0.95); s.hoard = r() < 0.1; break
    }
    void ord; return s
  }
  for (let a = 0; a < w.accounts; a++) {
    const acct = g.acct++, tok = g.tok++
    let arriveBase: number
    switch (st) {
      case 'SPEED': case 'FLOOD': arriveBase = U(r, 0, 3); break
      case 'DISTRIBUTED': arriveBase = U(r, 0, 3 + w.evade * w.span * 0.8); break
      case 'LOW_SLOW': arriveBase = U(r, 0, w.span * 1.2); break
      default: arriveBase = U(r, 0, w.span * 0.6)
    }
    const nSess = st === 'MULTI_SESSION' ? Math.max(2, Math.round(w.mult * U(r, 0.7, 1.4))) : st === 'RECONNECT' ? 3 + Math.floor(r() * 5) : 1
    const sharedFp = st === 'MULTI_SESSION' || st === 'RECONNECT' ? g.fp++ : 0
    for (let k = 0; k < nSess; k++) {
      let fp: number, t: number
      if (st === 'SPEED' || st === 'FLOOD') fp = fpBase + Math.floor(r() * fpPool)
      else if (st === 'MULTI_SESSION') fp = r() < 0.7 ? sharedFp : g.fp++
      else if (st === 'RECONNECT') fp = sharedFp
      else fp = g.fp++
      const tk = st === 'SPEED' ? tok - (tok % 4) + 1_000_000_000 : st === 'MULTI_SESSION' || st === 'RECONNECT' ? tok : g.tok++
      t = st === 'RECONNECT' ? arriveBase + k * U(r, 3, 6) : arriveBase + (st === 'MULTI_SESSION' ? U(r, 0, 2) : 0)
      out.push(mkSess(acct, tk === tok ? tok : tk, fp, t, k))
    }
  }
  return out
}
