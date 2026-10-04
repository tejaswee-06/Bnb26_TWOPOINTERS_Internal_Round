'use client'
import { useOps, PageHead, Kpi, Panel, StackBar, PhaseStepper, EventLog, Sim, Wait, n0, pc, short } from '@/components/admin/kit'
export default function PreQueue() {
  const { sim, f, ready } = useOps(); const r = sim && f ? sim.result() : null
  return <>
    <PageHead title="Pre-queue" q="Who has entered, and who is eligible for the lottery?"><Sim /></PageHead>
    <Wait ready={ready}>{sim && <>
      <PhaseStepper phase={sim.phase} />
      <div className="adm-kpis">
        <Kpi label="Window" value={sim.phase === 'PRE_QUEUE_OPEN' ? Math.max(0, sim.cfg.preQueueSec - sim.el) + ' s left' : sim.tClose >= 0 ? 'CLOSED' : 'NOT OPEN'} sub={`${sim.cfg.preQueueSec}s demo-compressed window`} tone={sim.phase === 'PRE_QUEUE_OPEN' ? 'ok' : undefined} />
        <Kpi label="Joined (entries)" value={n0(f?.joined ?? 0)} sub={`${n0(f?.buffered ?? 0)} buffered during surge`} />
        <Kpi label="Eligible pool" value={sim.tClose >= 0 ? n0(sim.eligibleIds.length) : 'after close'} sub="one entry per identity cluster" tone="ok" />
        <Kpi label="Duplicates removed" value={n0(sim.counters.dup)} sub="same identity cluster, extra sessions" />
        <Kpi label="Blocked by policy" value={f ? n0(f.quarantined + f.rejected) : 0} sub="quarantined / rejected" tone="warn" />
        <Kpi label="Commitment" value={<span className="mono" style={{ fontSize: '.9rem' }}>{short(sim.commitment, 18)}</span>} sub="published before the first entry" />
      </div>
      {r && sim.tClose >= 0 && <Panel title="Eligible pool composition (ground truth, admin-only)"><StackBar parts={[{ name: 'legitimate eligible', v: r.eligibleLegit, color: 'var(--ok)' }, { name: 'automated eligible', v: r.eligibleBot, color: 'var(--bad)' }]} /><p className="mut2">Automated share of eligible pool {pc(r.botEligibleShare)} vs {pc(r.botIdentityShare)} of identities. Eligible-list root: <span className="mono">{short(sim.eligibleRoot, 22)}</span></p></Panel>}
      <Panel title="Pre-queue events"><EventLog events={sim.events.filter(e => e.kind === 'admission' || e.kind === 'info')} limit={8} /></Panel>
      <p className="adm-note2">Arrival time and request volume are <b>not</b> inputs to allocation: everyone who enters the window and passes verification is equally placed in the pool.</p></>}</Wait></>
}
