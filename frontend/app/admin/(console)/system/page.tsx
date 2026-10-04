'use client'
import { LiveSystem } from '@/components/admin/live'
import { useEffect, useRef, useState } from 'react'
import { useOps, PageHead, Kpi, Panel, Sim, Wait, n0, pc } from '@/components/admin/kit'
import { probeBackend, BackendProbe, API_CONTRACT } from '@/services/fairdrop'
export default function System() {
  const { rt, sim, f, ready } = useOps(), [probe, setProbe] = useState<BackendProbe | null>(null), errs = useRef<string[]>([]), [, bump] = useState(0)
  useEffect(() => { void probeBackend().then(setProbe); const h = (e: ErrorEvent) => { errs.current = [e.message, ...errs.current].slice(0, 5); bump(x => x + 1) }; addEventListener('error', h); return () => removeEventListener('error', h) }, [])
  const st = sim?.inv.stats(), row = (k: string, v: string, tone: string, note: string) => <tr key={k}><td><b>{k}</b></td><td><span className={'pill ' + tone}>{v}</span></td><td className="mut2">{note}</td></tr>
  return <>
    <PageHead title="System health" q="Is the platform itself healthy — and which parts are real versus simulated?"><Sim>LOCAL SIMULATION</Sim></PageHead>
    <LiveSystem />
    <Wait ready={ready}>{rt && sim && st && <>
      <div className="adm-kpis"><Kpi label="Runtime clock" value={rt.paused ? 'PAUSED' : 'RUNNING'} sub={`t=${rt.clock}s · ×${rt.speed}`} tone={rt.paused ? 'warn' : 'ok'} /><Kpi label="Health state" value={f?.state ?? 'IDLE'} sub={f ? `load ${pc(f.load, 0)}` : 'no frames'} /><Kpi label="Latency p50/p99" value={f ? `${n0(f.p50)}/${n0(f.p99)} ms` : '—'} sub="modelled" /><Kpi label="Inventory integrity" value={st.integrity ? 'OK' : 'VIOLATED'} tone={st.integrity ? 'ok' : 'bad'} sub={`oversell ${st.oversell}`} /><Kpi label="Loaded drops" value={rt.drops.size} sub={`${n0(sim.sessions.length)} sessions in current`} /><Kpi label="Runtime errors (this page)" value={errs.current.length} tone={errs.current.length ? 'bad' : 'ok'} /></div>
      <Panel title="Components — what is real and what is simulated" wide><div className="tscroll"><table className="t"><thead><tr><th>Component</th><th>State</th><th>Detail</th></tr></thead><tbody>
        {row('API / runtime', 'SIMULATED · UP', 'ok', 'In-browser Runtime + service layer (services/fairdrop.ts). No HTTP API server is running; the endpoint contract is documented below.')}
        {row('Queue', f ? 'SIMULATED · ' + sim.phase : 'IDLE', f ? 'ok' : 'warn', `Engine queue model, depth ${n0(f?.queue ?? 0)}.`)}
        {row('Inventory', st.integrity ? 'SIMULATED · CONSISTENT' : 'VIOLATED', st.integrity ? 'ok' : 'bad', 'Atomic in-memory Inventory with idempotency keys — not a database transaction.')}
        {row('Database', 'NOT CONNECTED', 'warn', 'No Postgres/SQL database. Bookings and session live in the browser (localStorage).')}
        {row('Redis / cache', 'NOT CONNECTED', 'warn', 'None configured.')}
        {row('Realtime channel', 'IN-PROCESS 1 Hz TICK', 'acc', 'setInterval inside the page; no WebSocket/SSE server.')}
        {row('Simulation engine', sim.attackActive ? 'ATTACK RUNNING' : 'ACTIVE', 'ok', `${sim.frames.length} frames retained; ML scoring ${sim.mlOnline ? 'online' : 'FAILED (deterministic fallback)'}.`)}
        {row('External backend probe', !probe ? 'CHECKING' : !probe.configured ? 'NOT CONFIGURED' : probe.reachable ? 'REACHABLE' : 'UNREACHABLE', probe?.reachable ? 'ok' : 'warn', probe?.detail ?? '…')}</tbody></table></div></Panel>
      <div className="adm-grid"><Panel title="Engine counters"><table className="t"><tbody><tr><td>Hold races lost</td><td className="num">{n0(f?.raced ?? 0)}</td></tr><tr><td>Expired holds</td><td className="num">{n0(sim.counters.expiredHolds)}</td></tr><tr><td>Late joins rejected</td><td className="num">{n0(sim.counters.lateRejected)}</td></tr><tr><td>Breaker</td><td className="num">{f?.breaker ?? '—'}</td></tr><tr><td>Recovered sessions</td><td className="num">{n0(sim.counters.recovered)}</td></tr></tbody></table></Panel>
        <Panel title="Captured errors">{errs.current.length ? <ul>{errs.current.map((e, i) => <li key={i} className="bad mono">{e}</li>)}</ul> : <p className="ok">No uncaught errors since this page opened.</p>}</Panel>
        <Panel title="Service contract (backend-swappable)" wide><div className="tscroll"><table className="t"><tbody>{API_CONTRACT.map(([m, p, d]) => <tr key={m + p}><td className="mono">{m}</td><td className="mono">{p}</td><td className="mut2">{d}</td></tr>)}</tbody></table></div></Panel></div></>}</Wait></>
}
