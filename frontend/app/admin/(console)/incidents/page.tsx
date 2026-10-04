'use client'
import { useOps, PageHead, Kpi, Panel, Sim, Wait, n0, tstamp, toneOf } from '@/components/admin/kit'
export default function Incidents() {
  const { sim, ready } = useOps(), inc = sim?.incidents ?? []
  return <>
    <PageHead title="Incidents" q="What went wrong, what evidence did we have, what did we do, and did it work?"><Sim>RAISED BY THE SIMULATION RUNTIME</Sim></PageHead>
    <Wait ready={ready}>{sim && <>
      <div className="adm-kpis"><Kpi label="Total" value={inc.length} /><Kpi label="Open" value={inc.filter(i => i.status === 'OPEN').length} tone="bad" /><Kpi label="Mitigated" value={inc.filter(i => i.status === 'MITIGATED').length} tone="warn" /><Kpi label="Resolved" value={inc.filter(i => i.status === 'RESOLVED').length} tone="ok" /></div>
      <Panel title="Incident log (latest first)" wide>{!inc.length ? <p className="mut2">No incidents so far. Traffic surges, bot campaigns, bypass attempts, throttling and recovery appear here as the drop runs — try the Attack Lab.</p> :
        <div className="tscroll"><table className="t"><thead><tr><th>Time</th><th>Severity</th><th>Incident</th><th>Evidence</th><th>Action</th><th>Result</th><th>Status</th></tr></thead><tbody>
          {inc.map(i => <tr key={i.id}><td className="mono">{tstamp(i.t)}</td><td><span className={'pill ' + (toneOf(i.sev) || '')}>{i.sev.toUpperCase()}</span></td><td><b>{i.title}</b><div className="mut2 mono" style={{ fontSize: '.7rem' }}>{i.id} · {i.kind}</div></td><td><ul style={{ margin: 0, paddingLeft: '1rem' }}>{i.evidence.slice(0, 4).map((e, k) => <li key={k}>{e}</li>)}</ul></td><td>{i.action}</td><td>{i.result}</td><td><span className={'pill ' + (i.status === 'OPEN' ? 'bad' : i.status === 'MITIGATED' ? 'warn' : 'ok')}>{i.status}</span></td></tr>)}</tbody></table></div>}
        <p className="mut2" style={{ fontSize: '.75rem' }}>{n0(sim.events.length)} raw runtime events retained; incidents are derived by the engine from them.</p></Panel></>}</Wait></>
}
