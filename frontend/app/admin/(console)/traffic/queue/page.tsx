'use client'
import { useOps, PageHead, Kpi, Panel, Lines, Sim, Wait, NoTelemetry, PhaseStepper, n0 } from '@/components/admin/kit'
export default function QueuePage() {
  const { sim, f, ready } = useOps(); const fr = sim?.frames.slice(-120) ?? []
  return <>
    <PageHead title="Queue" q="How deep is the queue and how fast is it draining?"><Sim /></PageHead>
    <Wait ready={ready}>{sim && <>
      <PhaseStepper phase={sim.phase} />
      {!f ? <NoTelemetry phase={sim.phase} /> : <>
        <div className="adm-kpis">
          <Kpi label="Queue depth" value={n0(f.queue)} sub={sim.phase === 'PRE_QUEUE_OPEN' ? 'entries in the pre-queue window' : 'randomized order not yet admitted'} />
          <Kpi label="Eligible pool" value={n0(f.eligible)} sub="after de-duplication & policy" />
          <Kpi label="Admitted so far" value={n0(f.admitted)} sub={`pointer ${n0(sim.ap)} / ${n0(sim.order.length)}`} />
          <Kpi label="Outstanding (active holds)" value={n0(f.outstanding)} sub="admitted but not yet resolved" />
          <Kpi label="Buffered joins" value={n0(f.buffered)} sub="absorbed during surge, never dropped" />
          <Kpi label="Quarantined / rejected" value={`${n0(f.quarantined)} / ${n0(f.rejected)}`} />
        </div>
        <Panel title="Queue depth over time" tag={<Sim />}><Lines series={[{ name: 'queue depth', data: fr.map(x => x.queue), color: 'var(--acc)' }, { name: 'buffered joins', data: fr.map(x => x.buffered), color: 'var(--warn)' }]} /></Panel>
        <p className="adm-note2">In FAIR mode the queue is not first-come-first-served: during the pre-queue window depth is just the number of entries; after randomization the order is fixed by the committed seed (see Admission → Randomization).</p></>}</>}</Wait></>
}
