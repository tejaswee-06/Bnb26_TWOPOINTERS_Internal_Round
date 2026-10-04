// Service layer: the ONLY surface the UI uses for state-changing operations.
// Today every method is backed by the in-browser simulation Runtime (lib/runtime.ts → lib/engine/*).
// Each method documents the REST/WS endpoint it maps to, so the Runtime can be swapped for a FastAPI + Postgres + Redis
// backend without touching components. (Reference PDF §14 API baseline.)
import { getRT, Booking } from '@/lib/runtime'
import type { Scenario } from '@/lib/engine/types'
import { LIVE } from '@/lib/live/config'
import { eventById } from '@/lib/data/events'

export const API_CONTRACT = [
  ['POST', '/events/{id}/join', 'join — verified entry session, duplicate-session protection, signed entry token'],
  ['GET', '/queue/{session}', 'status — pre-queue / randomized position / admission token'],
  ['POST', '/admission/{session}/validate', 'validateAdmit — server-side HMAC token check (client queue position is never trusted)'],
  ['POST', '/reservations', 'hold — AVAILABLE→HELD with idempotency key + TTL'],
  ['POST', '/reservations/{id}/confirm', 'confirm — HELD→CONFIRMED, idempotent'],
  ['DELETE', '/reservations/{id}', 'release — HELD→AVAILABLE'],
  ['GET', '/verify/{allocation}', 'verifyBooking — commit-reveal proof check'],
  ['POST', '/admin/drops/{id}/{action}', 'operate — prepare/open/close/randomize/admit/pause/end'],
  ['POST', '/admin/attacks', 'startAttack — adversarial simulation scenario'],
  ['POST', '/admin/experiments', 'runExperiment — World A / World B / naive baseline'],
  ['WS', '/ws/telemetry', 'runtime tick (1 Hz frames: traffic, risk, queue, inventory)'],
] as const

const rt = () => { const r = getRT(); if (!r) throw new Error('service used on the server'); return r }
const live = (eventId: string) => LIVE && !!eventById(eventId)?.drop
type JoinResult = { ok: true; replay: boolean } | { ok: false; reason: string; detail?: string }
type HoldResult = { ok: true; hold: { id: string } } | { ok: false; reason: string; message?: string }
// In live mode these hit the Person-1 backend via /api/fd/* (join → /events/{id}/join, hold → /allocation/hold, confirm → /allocation/confirm, release → /allocation/release);
// otherwise the in-browser simulation. Always async so pages are written once.
export const service = {
  join: async (eventId: string, guided: boolean): Promise<JoinResult> => live(eventId) ? rt().joinLive(eventId) : (rt().join(eventId, guided) as JoinResult),
  status: (eventId: string) => rt().status(eventId),
  hold: async (eventId: string, typeIdx: number, qty: number): Promise<HoldResult> => live(eventId) ? rt().holdLive(eventId, typeIdx) : (rt().hold(eventId, typeIdx, qty) as HoldResult),
  confirm: async (eventId: string, holdId: string, method: string): Promise<{ ok: true; booking: Booking } | { ok: false; reason: string }> => live(eventId) ? rt().confirmLive(eventId, holdId, method) : rt().confirmDrop(eventId, holdId, method),
  release: async (eventId: string, holdId: string) => live(eventId) ? rt().releaseLive(eventId, holdId) : rt().release(eventId, holdId),
  operate: (eventId: string, a: Parameters<ReturnType<typeof rt>['operate']>[1]) => rt().operate(eventId, a),
  startAttack: (eventId: string, sc: Scenario) => rt().startAttack(eventId, sc),
  verify: (b: Booking, tamper?: 'seed' | 'list') => rt().verifyBooking(b, tamper),
}

/** Optional real-backend probe. If NEXT_PUBLIC_FAIRDROP_API is set and /health answers, the System Health page shows it next to the simulated state. */
export interface BackendProbe { configured: boolean; reachable: boolean; detail: string }
export async function probeBackend(): Promise<BackendProbe> {
  const base = process.env.NEXT_PUBLIC_FAIRDROP_API
  if (!base) return { configured: false, reachable: false, detail: 'NEXT_PUBLIC_FAIRDROP_API not set — running on the in-browser simulation (SIMULATED).' }
  try { const r = await fetch(base.replace(/\/$/, '') + '/health', { cache: 'no-store' }); return { configured: true, reachable: r.ok, detail: `GET /health → ${r.status}` } }
  catch (e) { return { configured: true, reachable: false, detail: 'Backend unreachable: ' + (e as Error).message } }
}
