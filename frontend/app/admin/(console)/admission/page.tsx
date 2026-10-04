'use client'
import { useOps, PageHead, Kpi, Panel, Lines, PhaseStepper, Sim, Wait, NoTelemetry, n0 } from '@/components/admin/kit'
import { sidOf } from '@/lib/engine/drop'
export default function Admission() {
  const { sim, f, ready } = useOps(); const fr = sim?.frames.slice(-120) ?? [], from = sim ? Math.max(0, sim.ap - 6) : 0
  return <>
    <PageHead title="Admission" q="Who is being let in right now, and at what rate?"><Sim /></PageHead>
    <Wait ready={ready}>{sim && <>
      <PhaseStepper phase={sim.phase} />
      {!f ? <NoTelemetry phase={sim.phase} /> : <>
        <div className="adm-kpis"><Kpi label="Admitted" value={n0(f.admitted)} sub={`of ${n0(sim.order.length)} ordered`} /><Kpi label="Admission rate" value={`${f.admitRate.toFixed(0)}/s`} sub={`cap ${sim.cfg.admitRate}/s · gated by inventory`} /><Kpi label="Queue state" value={n0(f.queue)} sub="still waiting" /><Kpi label="Outstanding holds" value={n0(f.outstanding)} /><Kpi label="Seats available" value={n0(f.seats.avail)} tone="acc" /><Kpi label="Admission pointer" value={`#${n0(sim.ap)}`} /></div>
        <div className="adm-grid"><Panel title="Admission rate and outstanding" tag={<Sim />}><Lines series={[{ name: 'admitted / s', data: fr.map(x => x.admitRate), color: 'var(--acc2)' }, { name: 'outstanding holds', data: fr.map(x => x.outstanding), color: 'var(--warn)' }]} /></Panel>
          <Panel title="Cohort at the admission pointer">{!sim.order.length ? <p className="mut2">Randomize first.</p> : <div className="tscroll"><table className="t"><thead><tr><th>#</th><th>Session</th><th>State</th><th>Seats</th><th>Outcome</th></tr></thead><tbody>{sim.order.slice(from, from + 14).map(s => <tr key={s.id} style={s.pos === sim.ap ? { background: 'var(--s2)' } : undefined}><td className="num">{s.pos}</td><td className="mono">{sidOf(s.id)}</td><td>{s.st}</td><td className="num">{s.seats}</td><td>{s.outcome ?? '—'}</td></tr>)}</tbody></table></div>}</Panel></div></>}
      <p className="adm-note2">Admission walks the fixed randomized order at a controlled rate and stops when inventory is exhausted; speed of requests inside the admitted cohort does not change who gets a seat.</p></>}</Wait></>
}
