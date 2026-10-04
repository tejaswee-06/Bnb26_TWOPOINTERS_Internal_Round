import type { TicketType } from './inventory'
export type Scenario = 'NORMAL' | 'SPEED' | 'FLOOD' | 'MULTI_SESSION' | 'QUEUE_JUMP' | 'DISTRIBUTED' | 'LOW_SLOW' | 'RECONNECT' | 'ADAPTIVE'
export type Strategy = Exclude<Scenario, 'NORMAL' | 'ADAPTIVE'>
export type Phase = 'PREPARED' | 'PRE_QUEUE_OPEN' | 'PRE_QUEUE_CLOSED' | 'RANDOMIZED' | 'ADMITTING' | 'PAUSED' | 'ENDED'
export type Action = 'NORMAL' | 'CHALLENGE' | 'THROTTLE' | 'QUARANTINE' | 'REJECT'
export const ACTIONS: Action[] = ['NORMAL', 'CHALLENGE', 'THROTTLE', 'QUARANTINE', 'REJECT']
export type RiskLevel = 'LOW' | 'ELEVATED' | 'HIGH' | 'QUARANTINED'
export type Outcome = 'WON' | 'ABANDONED' | 'EXPIRED' | 'SOLD_OUT' | 'BLOCKED' | 'NOT_ADMITTED' | 'PAYMENT_FAILED'
export type Mode = 'FAIR' | 'NAIVE'
export const SCENARIOS: Record<Scenario, { label: string; blurb: string; strategy?: Strategy }> = {
  NORMAL: { label: 'Normal traffic', blurb: 'Legitimate users only — the flash crowd itself.' },
  SPEED: { label: 'Speed bots', blurb: 'Pre-positioned scripts firing tens of requests/second to win a first-come race.' },
  FLOOD: { label: 'Request flood', blurb: 'A few sources hammering endpoints to saturate the platform.' },
  MULTI_SESSION: { label: 'Multi-session bots', blurb: 'One account opening many sessions to multiply its chances.' },
  QUEUE_JUMP: { label: 'Queue jump', blurb: 'Forged / replayed / tampered admission tokens against protected endpoints.' },
  DISTRIBUTED: { label: 'Distributed bots', blurb: 'Many low-rate sources moving in lockstep as one campaign.' },
  LOW_SLOW: { label: 'Low-and-slow', blurb: 'Human-like timing from many accounts to evade rate rules.' },
  RECONNECT: { label: 'Reconnect attack', blurb: 'Dropping and re-creating sessions to reshuffle queue luck.' },
  ADAPTIVE: { label: 'Adaptive attacker', blurb: 'Changes strategy after defenses activate: speed → low-and-slow → distributed.' },
}
export const STRATEGY_ORDER: Strategy[] = ['SPEED', 'LOW_SLOW', 'DISTRIBUTED']
export interface DropConfig {
  eventId: string; title: string; seed: string; types: TicketType[]
  legit: number; autoPct: number; mult: number; scenario: Scenario; surge: number; botRate: number; capacity: number
  preQueueSec: number; admitRate: number; holdTtl: number; maxQty: number; attackSec: number
  mode: Mode; detect: boolean; autopilot: boolean
}
export interface Sess {
  id: number; acct: number; fp: number; tok: number; ip: number
  bot: boolean; strat: Strategy | 'HUMAN'; wave: number
  arrive: number; rate: number; cv: number; refresh: number; reg: number; crit: number
  sig: number; pass: number; bypassAt: number; hoard: boolean
  think: number; abandon: boolean; payT: number; payFail: boolean
  ext: boolean; guided: boolean; label: string
  st: 'FUTURE' | 'BUFFERED' | 'ACTIVE' | 'QUEUED' | 'ADMITTED' | 'ALLOCATING' | 'COMPLETED' | 'REJECTED' | 'QUARANTINED'
  joinT: number; key: number
  rounds: number; risk: number; anom: number; coord: number; comp: number; level: number; act: Action
  flagT: number; chal: boolean; chOk: boolean; bypass: number; simG: number; idRoot: number; idSize: number
  eligible: boolean; pos: number; admitT: number; token: string; hold: string; seats: number; outcome?: Outcome; evidence: string[]; reconnects: number
}
export interface Ev {
  id: string; t: number; kind: 'attack' | 'risk' | 'mitigation' | 'alloc' | 'resilience' | 'admission' | 'policy' | 'info' | 'inventory'
  text: string; sev: 'info' | 'warn' | 'bad' | 'ok'
}
export interface Incident {
  id: string; t: number; kind: string; title: string; sev: 'info' | 'warn' | 'bad' | 'ok'; evidence: string[]; action: string; result: string; status: 'OPEN' | 'MITIGATED' | 'RESOLVED'
}
export interface CampaignInfo {
  id: string; key: number; size: number; firstT: number; lastT: number; coord: number; kind: 'BEHAVIORAL' | 'IDENTITY'; mitigated: number
  truthBot: number; truthTotal: number; dominant: string; evidence: string[]; members: number[]
}
export type Health = 'HEALTHY' | 'ELEVATED' | 'SATURATED' | 'DEGRADED' | 'RECOVERING'
export interface Frame {
  t: number; phase: Phase
  rps: number; rpsEff: number; legit: number; susp: number; bot: number; truthLegit: number; truthBot: number
  active: number; joined: number; buffered: number; quarantined: number; rejected: number; unscored: number
  queue: number; p50: number; p95: number; p99: number; load: number; shed: number; throttle: boolean; breaker: 'CLOSED' | 'HALF-OPEN' | 'OPEN'; state: Health
  risk: number[]; seats: { total: number; avail: number; held: number; confirmed: number }
  seatsLegit: number; seatsBot: number; dup: number; limitBlocks: number; raced: number; expired: number; oversell: number; integrity: boolean
  admitted: number; admitRate: number; outstanding: number; eligible: number
  campaigns: number; identityClusters: number; strategyIdx: number; strategy: string; escalation: number
  mitigationMs: number | null; bypassBlocked: number; recovered: number
  tp: number; fp: number; fn: number; tn: number
}
export interface SimResult {
  mode: Mode; scenario: Scenario; seats: number; ticks: number
  legitAccounts: number; botAccounts: number; botSessions: number; sessions: number
  joinedLegit: number; joinedBot: number; eligible: number; eligibleLegit: number; eligibleBot: number; quarantinedBot: number; blockedLegit: number
  seatsLegit: number; seatsBot: number; winnersLegit: number; winnersBot: number; sold: number
  botSeatShare: number; botIdentityShare: number; botEligibleShare: number; aaaRatio: number; aaaPP: number
  legitAllocationRate: number; legitRankShift: number
  peakLoad: number; peakP99: number; peakRps: number; shedPeak: number; dupBlocked: number; limitBlocks: number; bypassBlocked: number; raced: number
  oversell: number; integrity: boolean; mitigationMs: number | null; precision: number; recall: number; fpr: number; tp: number; fp: number; fn: number; tn: number
  escalations: number; strategyChanges: number; totalRequests: number; dbMutations: number; lateRejected: number; legitJoinedFrac: number; legitFriction: number; legitDeniedByDetection: number
}
