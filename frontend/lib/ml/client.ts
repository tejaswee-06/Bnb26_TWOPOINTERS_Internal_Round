// The ONLY place that talks to the Person 2 ML service. Components never call fetch() for ML directly.
// The service is advisory: nothing here (or anywhere) lets ML output change queue, inventory or allocation.
import type { MLDemo, MLHealth, MLResult, MLRiskEvent, MLSession, MLSummary } from './types'
export const ML_API_URL = (process.env.NEXT_PUBLIC_ML_API_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
async function get<T>(path: string, timeoutMs = 4000): Promise<MLResult<T>> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(ML_API_URL + path, { cache: 'no-store', signal: ctl.signal })
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` }
    return { ok: true, data: (await r.json()) as T }
  } catch (e) { return { ok: false, error: (e as Error).name === 'AbortError' ? 'timeout' : 'unreachable' } } finally { clearTimeout(t) }
}
export const getMLHealth = () => get<MLHealth>('/')
export const getMLSummary = () => get<MLSummary>('/ml/summary')
export async function getSimulationSessions(): Promise<MLResult<MLSession[]>> { const r = await get<{ count: number; sessions: MLSession[] }>('/ml/simulation'); return r.ok ? { ok: true, data: r.data.sessions } : r }
export async function getRiskEvents(): Promise<MLResult<MLRiskEvent[]>> { const r = await get<{ count: number; risk_events: MLRiskEvent[] }>('/ml/risk-events'); return r.ok ? { ok: true, data: r.data.risk_events } : r }
export const getSession = (id: string) => get<MLSession>('/ml/session/' + encodeURIComponent(id))
export const getRiskEvent = (id: string) => get<MLRiskEvent>('/ml/risk-event/' + encodeURIComponent(id))
export const getLiveSession = () => get<{ status: string; sequence?: number; session: MLSession | null }>('/ml/live')
export const getLiveRiskEvent = () => get<{ status: string; sequence?: number; risk_event: MLRiskEvent | null }>('/ml/live-risk-event')
/** NOTE: /ml/live, /ml/live-risk-event and /ml/demo are stateful on the server (each call advances a cursor). */
export const getMLDemo = () => get<MLDemo>('/ml/demo')
