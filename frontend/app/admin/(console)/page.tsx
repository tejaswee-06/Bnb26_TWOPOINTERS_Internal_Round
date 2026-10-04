'use client'
import Link from 'next/link'
import { useOps, PageHead, Kpi, Panel, Lines, StackBar, PhaseStepper, EventLog, Sim, NoTelemetry, Wait, n0, pc } from '@/components/admin/kit'
export default function Overview() {
  const { rt, sim, f, ev, ready } = useOps()
  const frames = sim?.frames.slice(-120) ?? [], st = sim?.inv.stats()
  const healthTone = f?.state === 'HEALTHY' ? 'ok' : f?.state === 'ELEVATED' || f?.state === 'RECOVERING' ? 'warn' : f ? 'bad' : undefined
  return <>
    <PageHead title="Operations overview" q="Is the active drop healthy, fair and on track right now?"><Sim /><Link className="btn sm pri" href="/admin/drop">Drop control</Link></PageHead>
    <Wait ready={ready}>{sim && st && <>
      <div className="row"><b>{sim.cfg.title}</b><span className="pill">{ev?.city}</span><span className="pill">mode {sim.cfg.mode}</span><span className="pill">scenario {sim.cfg.scenario}</span><span className="mut2 mono">seed {sim.cfg.seed}</span></div>
      <PhaseStepper phase={sim.phase} />
      <div className="adm-kpis">
        <Kpi label="Participants (joined)" value={n0(f?.joined ?? 0)} sub={`target ${n0(sim.cfg.legit)} legit + attackers`} />
        <Kpi label="Requests / sec" value={n0(f?.rps ?? 0)} sub={`effective ${n0(f?.rpsEff ?? 0)}`} />
        <Kpi label="Queue depth" value={n0(f?.queue ?? 0)} sub={sim.phase === 'PRE_QUEUE_OPEN' ? 'pre-queue entries' : 'waiting for admission'} />
        <Kpi label="Human traffic" value={n0(f?.legit ?? 0)} sub="req/s classified normal" tone="ok" />
        <Kpi label="Suspicious" value={n0(f?.susp ?? 0)} sub="challenged / throttled" tone="warn" />
        <Kpi label="Bot traffic" value={n0(f?.bot ?? 0)} sub="quarantined / rejected" tone="bad" />
        <Kpi label="Seats remaining" value={n0(st.available)} sub={`of ${n0(st.total)}`} tone="acc" />
        <Kpi label="Admitted users" value={n0(f?.admitted ?? 0)} sub={`rate ${f?.admitRate?.toFixed?.(0) ?? 0}/s (cap ${sim.cfg.admitRate})`} />
        <Kpi label="Held seats" value={n0(st.held)} sub={`TTL ${sim.cfg.holdTtl}s`} tone="warn" />
        <Kpi label="Confirmed seats" value={n0(st.confirmed)} tone="ok" />
        <Kpi label="Latency p50 / p99" value={f ? `${n0(f.p50)} / ${n0(f.p99)} ms` : '—'} sub="modelled" />
        <Kpi label="System health" value={f?.state ?? 'IDLE'} sub={f ? `load ${pc(f.load, 0)} · breaker ${f.breaker}` : 'no frames yet'} tone={healthTone} />
      </div>
      {!f ? <NoTelemetry phase={sim.phase} /> : <div className="adm-grid">
        <Panel title="Traffic by class (req/s)" tag={<Sim />}><Lines stacked series={[{ name: 'human', data: frames.map(x => x.legit), color: 'var(--ok)' }, { name: 'suspicious', data: frames.map(x => x.susp), color: 'var(--warn)' }, { name: 'bot', data: frames.map(x => x.bot), color: 'var(--bad)' }]} /></Panel>
        <Panel title="Inventory — CONFIRMED + HELD + AVAILABLE = TOTAL" tag={<span className={'pill ' + (st.integrity ? 'ok' : 'bad')}>{st.integrity ? 'INTEGRITY OK' : 'VIOLATED'} · oversell {st.oversell}</span>}>
          <StackBar total={st.total} parts={[{ name: 'confirmed', v: st.confirmed, color: 'var(--ok)' }, { name: 'held', v: st.held, color: 'var(--warn)' }, { name: 'available', v: st.available, color: 'var(--acc)' }]} />
          <p className="mono mut">{n0(st.confirmed)} + {n0(st.held)} + {n0(st.available)} = {n0(st.confirmed + st.held + st.available)} (total {n0(st.total)})</p>
          <Lines h={90} series={[{ name: 'seats available', data: frames.map(x => x.seats.avail), color: 'var(--acc)' }, { name: 'confirmed', data: frames.map(x => x.seats.confirmed), color: 'var(--ok)' }]} />
        </Panel>
        <Panel title="Latest operator-relevant events" wide><EventLog events={sim.events} limit={8} /></Panel>
      </div>}
      <p className="mut2" style={{ fontSize: '.78rem' }}>Shared state: this console reads the same DropSim instance the customer journey writes to ({rt?.user ? `signed-in customer ${rt.user.email}` : 'no customer signed in'}; {rt?.parts.size ?? 0} customer participation(s)). Classification columns are detector output; ground-truth bot counts appear only on Intelligence/Fairness pages.</p>
    </>}</Wait></>
}
