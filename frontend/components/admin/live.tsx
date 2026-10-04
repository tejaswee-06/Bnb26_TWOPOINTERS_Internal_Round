'use client'
// Admin panels backed by the REAL Person-1 backend (via the server-side proxy; keys never reach the browser).
// Rendered only when NEXT_PUBLIC_FAIRDROP_LIVE=1. Every panel carries a LIVE pill; the simulator panels below keep their SIMULATED pill.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errText } from '@/lib/live/api'
import { LIVE } from '@/lib/live/config'
import { useRT } from '@/lib/store'
import { Kpi, Panel } from './kit'
import { toast } from '@/lib/toast'

export const LiveTag = ({ children = 'LIVE · BACKEND' }: { children?: React.ReactNode }) => <span className="pill ok" title="Read from / written to the Person-1 backend (authoritative)">{children}</span>

interface Poll<T> { data: T | null; error: string; loading: boolean; reload: () => void }
function usePoll<T>(path: string | null, ms = 3000): Poll<T> {
  const [s, setS] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: '', loading: true }), alive = useRef(true)
  const load = useCallback(async () => {
    if (!path) return; const r = await api<T>('GET', path); if (!alive.current) return
    setS(r.ok ? { data: r.data, error: '', loading: false } : { data: null, error: r.offline ? 'BACKEND_UNREACHABLE' : errText(r), loading: false })
  }, [path])
  useEffect(() => { alive.current = true; void load(); const i = setInterval(load, ms); return () => { alive.current = false; clearInterval(i) } }, [load, ms])
  return { ...s, reload: load }
}
const n = (x: unknown) => (typeof x === 'number' ? x.toLocaleString('en-US') : '—')
const Offline = ({ e }: { e: string }) => <div className="adm-empty" data-testid="live-backend-offline"><b>Backend unavailable.</b><p className="mut">{e === 'BACKEND_UNREACHABLE' ? 'The Fair Drop backend cannot be reached. Nothing is simulated in its place — customer and inventory state are unchanged on the server.' : e}</p></div>

type Overview = { event_id: string; name: string; phase: string; seconds_left: number; joined: number; eligible_count: number; queue_depth: number; admission_limit: number; commitment: string | null; proof_revealed: boolean
  inventory: { total: number; available: number; held: number; confirmed: number; invariant_ok: boolean; by_type: Record<string, { total: number; available: number; held: number; confirmed: number }> }
  sessions_by_state: Record<string, number>; policy_decisions_by_action: Record<string, number>; queue_backend: string }

/** Drop control + admission + inventory for the selected event, mapped 1:1 onto /admin/events/{id}/{action}. */
export function LiveDropControl() {
  const rt = useRT(); const id = rt?.currentDrop ?? ''
  const { data: o, error, reload } = usePoll<Overview>(LIVE && id ? `admin/events/${id}/overview` : null, 2000)
  const [busy, setBusy] = useState(''), [msg, setMsg] = useState('')
  if (!LIVE || !rt) return null
  const act = async (a: string) => {
    setBusy(a); setMsg('')
    const r = a === 'provision' ? await api('POST', `ensure/${id}`) : await api('POST', `admin/events/${id}/${a}`)
    setBusy(''); if (!r.ok) { const m = errText(r); setMsg(m); toast(`${a}: ${m}`, 'bad') } else toast(`${a} — done`, 'ok'); reload()
  }
  const ph = o?.phase, can: Record<string, boolean> = { open: ph === 'PREPARED', close: ph === 'PRE_QUEUE_OPEN', randomize: ph === 'PRE_QUEUE_CLOSED', admit: ph === 'RANDOMIZED' || ph === 'PAUSED', pause: ph === 'ADMITTING', end: !!ph && ph !== 'ENDED' && ph !== 'PREPARED' }
  return <Panel title="Live drop control (authoritative backend)" tag={<LiveTag />} wide>
    {error === 'NOT_PROVISIONED' || (error && error.includes('404')) ? <div className="adm-empty"><b>This event is not provisioned on the backend yet.</b><div className="adm-actions"><button className="btn sm pri" onClick={() => act('provision')} disabled={!!busy}>Provision event</button></div></div>
      : error ? <Offline e={error} /> : !o ? <div className="skel" style={{ height: 120 }} /> : <>
        <div className="adm-kpis" data-testid="live-drop-kpis">
          <Kpi label="Phase" value={o.phase.replace(/_/g, ' ')} sub={o.phase === 'PRE_QUEUE_OPEN' ? `${o.seconds_left}s left` : `queue: ${o.queue_backend}`} tone="acc" />
          <Kpi label="Joined / eligible" value={`${n(o.joined)} / ${n(o.eligible_count)}`} sub="one session per account" />
          <Kpi label="Queue depth" value={n(o.queue_depth)} sub={`admission window ${o.admission_limit}`} />
          <Kpi label="Seats avail / held / sold" value={`${o.inventory.available} / ${o.inventory.held} / ${o.inventory.confirmed}`} sub={`of ${o.inventory.total}`} tone={o.inventory.invariant_ok ? 'ok' : 'bad'} />
          <Kpi label="Inventory invariant" value={o.inventory.invariant_ok ? 'HOLDS' : 'VIOLATED'} sub="avail + held + confirmed = total" tone={o.inventory.invariant_ok ? 'ok' : 'bad'} />
          <Kpi label="Commitment" value={<span className="mono" style={{ fontSize: '.8rem' }}>{o.commitment ? o.commitment.slice(0, 16) + '…' : '—'}</span>} sub={o.proof_revealed ? 'seed revealed' : 'seed not revealed'} />
        </div>
        <div className="adm-actions">
          {(['open', 'close', 'randomize', 'admit', 'pause', 'end'] as const).map(a => <button key={a} className="btn sm" data-testid={`live-${a}`} disabled={!can[a] || !!busy} onClick={() => act(a)}>{a === 'admit' ? (ph === 'PAUSED' ? 'Resume admission' : 'Start admission') : a[0].toUpperCase() + a.slice(1)}</button>)}
          <span className="mut2" style={{ fontSize: '.78rem' }}>Autopilot on the server advances phases when their timers elapse; manual actions are atomic and idempotent.</span>
        </div>
        {msg && <p className="bad" role="alert">{msg}</p>}
        <div className="adm-grid">
          <Panel title="Inventory by ticket type"><table className="t"><thead><tr><th>Type</th><th>Total</th><th>Avail</th><th>Held</th><th>Sold</th></tr></thead><tbody>{Object.entries(o.inventory.by_type).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{v.total}</td><td className="num">{v.available}</td><td className="num">{v.held}</td><td className="num">{v.confirmed}</td></tr>)}</tbody></table></Panel>
          <Panel title="Sessions by state"><table className="t"><tbody>{Object.entries(o.sessions_by_state).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{v}</td></tr>)}{!Object.keys(o.sessions_by_state).length && <tr><td className="mut">No sessions yet</td><td /></tr>}</tbody></table></Panel>
          <Panel title="Policy decisions (recorded)"><table className="t"><tbody>{Object.entries(o.policy_decisions_by_action).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{v}</td></tr>)}{!Object.keys(o.policy_decisions_by_action).length && <tr><td className="mut">None recorded</td><td /></tr>}</tbody></table></Panel>
        </div></>}
  </Panel>
}

type Decision = { decision_id: number; session_id: string; ticket_event_id: string | null; session_known: boolean; source: string; action: string; reason: string; rules_fired: string[]; risk_score: number | null; anomaly_score: number | null; coordination_score: number | null; campaign_id: string | null; attack_type: string | null; policy_version: string; created_at: string }
type MlStatus = { ml_configured: boolean; ml_available: boolean; detail?: string }
type SyncRes = MlStatus & { ingested: number; duplicates: number; rejected: number; skipped_no_live_session: number }

/** P2 evidence → P1 policy boundary: ML service status as the BACKEND sees it, recorded policy decisions, and the admin-triggered sync. */
export function LivePolicy({ campaigns = false }: { campaigns?: boolean }) {
  const rt = useRT(); const id = rt?.currentDrop ?? ''
  const ml = usePoll<MlStatus>(LIVE ? 'integration/ml/status' : null, 5000)
  const dec = usePoll<{ decisions: Decision[] }>(LIVE ? `integration/decisions?limit=${campaigns ? 200 : 50}` : null, 4000)
  const [sync, setSync] = useState<SyncRes | null>(null), [busy, setBusy] = useState(false)
  if (!LIVE) return null
  const run = async () => { setBusy(true); const r = await api<SyncRes>('POST', 'integration/ml/sync'); setBusy(false); if (r.ok) { setSync(r.data); dec.reload() } else toast('Sync failed: ' + errText(r), 'bad') }
  const rows = (dec.data?.decisions ?? []).filter(d => !id || !d.ticket_event_id || d.ticket_event_id === id)
  const byCampaign = new Map<string, Decision[]>(); rows.forEach(d => { if (d.campaign_id) byCampaign.set(d.campaign_id, [...(byCampaign.get(d.campaign_id) ?? []), d]) })
  const mlOk = ml.data?.ml_available
  return <Panel title={campaigns ? 'Live campaign evidence → policy decisions' : 'Live policy decisions (ML evidence → deterministic policy)'} tag={<LiveTag />} wide>
    <p className="adm-note2"><b>ML is advisory.</b> The ML service only supplies RiskEvents. The backend policy engine records the decision (NORMAL / CHALLENGE / THROTTLE / QUARANTINE / REJECT) and enforces it; ML never touches inventory, queue order or admission.</p>
    {ml.error ? <Offline e={ml.error} /> : <div className="adm-kpis">
      <Kpi label="ML service (as backend sees it)" value={ml.data ? (mlOk ? 'ONLINE' : ml.data.ml_configured ? 'OFFLINE' : 'NOT CONFIGURED') : '…'} sub={ml.data?.detail || (mlOk ? 'advisory evidence available' : 'policy runs on deterministic rules only')} tone={mlOk ? 'ok' : 'warn'} />
      <Kpi label="Recorded decisions" value={n(rows.length)} sub="this event (newest 50–200)" />
      <Kpi label="Campaigns referenced" value={byCampaign.size} sub="distinct campaign ids in decisions" />
    </div>}
    <div className="adm-actions"><button className="btn sm pri" data-testid="live-ml-sync" onClick={run} disabled={busy || !!ml.error}>{busy ? 'Syncing…' : 'Sync ML evidence → policy'}</button>
      {sync && <span className="mut" data-testid="live-ml-sync-result" role="status">{sync.ml_available ? `Ingested ${sync.ingested}, duplicates ${sync.duplicates}, rejected ${sync.rejected}; ${sync.skipped_no_live_session} simulator RiskEvents skipped (they reference simulator sessions, not live customers).` : `ML unavailable — ${sync.detail || 'no evidence ingested'}. Nothing was invented.`}</span>}</div>
    {dec.error && !ml.error ? <Offline e={dec.error} /> : <div style={{ overflowX: 'auto' }}><table className="t" data-testid="live-decisions"><thead><tr><th>#</th><th>Session</th><th>Action</th><th>Source</th><th>Rules</th><th>Risk</th><th>Anomaly</th><th>Coord.</th><th>Campaign</th></tr></thead><tbody>
      {rows.slice(0, campaigns ? 100 : 25).map(d => <tr key={d.decision_id}><td className="num">{d.decision_id}</td><td className="mono">{d.session_id.slice(0, 14)}</td><td><span className={'pill ' + (d.action === 'NORMAL' ? 'ok' : d.action === 'CHALLENGE' || d.action === 'THROTTLE' ? 'warn' : 'bad')}>{d.action}</span></td><td>{d.source}</td><td style={{ fontSize: '.75rem' }}>{(d.rules_fired || []).join(', ')}</td>
        <td className="num">{d.risk_score ?? '—'}</td><td className="num">{d.anomaly_score ?? '—'}</td><td className="num">{d.coordination_score ?? '—'}</td><td className="mono">{d.campaign_id ? d.campaign_id.slice(0, 14) : '—'}</td></tr>)}
      {!rows.length && <tr><td colSpan={9} className="mut">No policy decisions recorded for this event yet. Null scores stay “—” (never fabricated).</td></tr>}</tbody></table></div>}
  </Panel>
}

/** Allocations & inventory integrity from the backend. */
export function LiveAllocations() {
  const rt = useRT(); const id = rt?.currentDrop ?? ''
  const { data: o, error } = usePoll<Overview>(LIVE && id ? `admin/events/${id}/overview` : null, 3000)
  const au = usePoll<{ count: number; events: { event_hash: string | null; previous_hash: string | null }[] }>(LIVE && id ? `audit/${id}` : null, 8000)
  if (!LIVE) return null
  const ev = au.data?.events ?? [], chainOk = ev.every((e, i) => i === 0 || !e.previous_hash || e.previous_hash === ev[i - 1].event_hash)
  return <Panel title="Live allocations & inventory integrity" tag={<LiveTag />} wide>
    {error ? <Offline e={error} /> : !o ? <div className="skel" style={{ height: 80 }} /> : <div className="adm-kpis" data-testid="live-alloc-kpis">
      <Kpi label="Confirmed allocations" value={n(o.inventory.confirmed)} sub={`of ${o.inventory.total} seats`} tone="ok" />
      <Kpi label="Held (TTL)" value={n(o.inventory.held)} sub="released automatically on expiry" />
      <Kpi label="Available" value={n(o.inventory.available)} />
      <Kpi label="No oversell" value={o.inventory.invariant_ok && o.inventory.confirmed <= o.inventory.total ? 'HOLDS' : 'VIOLATED'} sub="atomic claim + invariant check" tone={o.inventory.invariant_ok ? 'ok' : 'bad'} />
      <Kpi label="Audit chain" value={au.error ? '—' : !au.data ? '…' : chainOk ? 'LINKED' : 'BROKEN'} sub={`${ev.length} hash-chained audit events (previous-hash linkage checked here)`} tone={au.data && !chainOk ? 'bad' : 'ok'} />
    </div>}
  </Panel>
}

/** System health: backend /health, resilience state machine, queue backend, metrics. */
export function LiveSystem() {
  const h = usePoll<{ status?: string; database?: string; redis?: string }>(LIVE ? 'health' : null, 4000)
  const r = usePoll<Record<string, any>>(LIVE ? 'resilience' : null, 3000)
  const m = usePoll<Record<string, any>>(LIVE ? 'metrics' : null, 3000)
  if (!LIVE) return null
  return <Panel title="Live system health (backend)" tag={<LiveTag />} wide>
    {h.error ? <Offline e={h.error} /> : <div className="adm-kpis" data-testid="live-system-kpis">
      <Kpi label="Backend /health" value={h.data ? String(h.data.status ?? 'ok').toUpperCase() : '…'} sub={h.data ? JSON.stringify(h.data).slice(0, 80) : ''} tone="ok" />
      <Kpi label="Resilience state" value={r.data ? String(r.data.state ?? r.data.status ?? '—') : '…'} sub={r.data ? `queue: ${r.data.queue_backend}` : ''} tone={r.data?.state === 'NORMAL' || r.data?.state === 'HEALTHY' ? 'ok' : 'warn'} />
      <Kpi label="Redis" value={r.data ? (r.data.redis_available ? 'UP' : 'FALLBACK') : '…'} sub="in-memory fallback + recovery if Redis is down" tone={r.data?.redis_available ? 'ok' : 'warn'} />
      <Kpi label="Total queue depth" value={m.data ? n(m.data.queue_depth) : '…'} />
    </div>}
  </Panel>
}
