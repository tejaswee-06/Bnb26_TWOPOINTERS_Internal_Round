'use client'
import { useOps, PageHead, Kpi, Panel, Lines, EventLog, Sim, Wait, NoTelemetry, Bars, n0, pc } from '@/components/admin/kit'
export default function Traffic() {
  const { sim, f, ready } = useOps(); const fr = sim?.frames.slice(-120) ?? [], st = sim?.inv.stats()
  const mit = sim?.events.filter(e => ['mitigation', 'risk', 'policy', 'resilience', 'attack'].includes(e.kind)) ?? []
  return <>
    <PageHead title="Live traffic" q="Who is hitting the platform, and is it human?"><Sim>SIMULATED TRAFFIC · modelled latency</Sim></PageHead>
    <Wait ready={ready}>{sim && st && (!f ? <NoTelemetry phase={sim.phase} /> : <>
      <div className="adm-kpis">
        <Kpi label="Requests / sec" value={n0(f.rps)} sub={`effective ${n0(f.rpsEff)} (after shedding)`} />
        <Kpi label="Active sessions" value={n0(f.active)} sub={`${n0(f.buffered)} buffered`} />
        <Kpi label="Queue depth" value={n0(f.queue)} />
        <Kpi label="p50 / p95 / p99" value={`${n0(f.p50)}/${n0(f.p95)}/${n0(f.p99)}`} sub="ms (modelled)" />
        <Kpi label="Load" value={pc(f.load, 0)} sub={`shed ${pc(f.shed, 0)} · ${f.state}`} tone={f.load > 0.85 ? 'bad' : f.load > 0.6 ? 'warn' : 'ok'} />
        <Kpi label="Admission rate" value={`${f.admitRate.toFixed(0)}/s`} sub={`${n0(f.admitted)} admitted`} />
        <Kpi label="Inventory" value={`${n0(st.available)} / ${n0(st.total)}`} sub={`${st.held} held · ${st.confirmed} confirmed`} />
        <Kpi label="WAF limit blocks" value={n0(f.limitBlocks)} sub={`${n0(f.bypassBlocked)} bypass attempts blocked`} />
      </div>
      <div className="adm-grid">
        <Panel title="Human vs suspicious vs bot (req/s, detector classification)" tag={<Sim />}><Lines stacked series={[{ name: 'human', data: fr.map(x => x.legit), color: 'var(--ok)' }, { name: 'suspicious', data: fr.map(x => x.susp), color: 'var(--warn)' }, { name: 'bot', data: fr.map(x => x.bot), color: 'var(--bad)' }]} /></Panel>
        <Panel title="Latency percentiles (ms)" tag={<Sim>MODELLED</Sim>}><Lines series={[{ name: 'p50', data: fr.map(x => x.p50), color: 'var(--ok)' }, { name: 'p95', data: fr.map(x => x.p95), color: 'var(--warn)' }, { name: 'p99', data: fr.map(x => x.p99), color: 'var(--bad)' }]} unit=" ms" /></Panel>
        <Panel title="Load and admission"><Lines h={120} series={[{ name: 'load (0–1)', data: fr.map(x => x.load), color: 'var(--acc)' }, { name: 'shed fraction', data: fr.map(x => x.shed), color: 'var(--bad)' }]} />
          <Lines h={100} series={[{ name: 'admission rate /s', data: fr.map(x => x.admitRate), color: 'var(--acc2)' }, { name: 'queue depth', data: fr.map(x => x.queue / 50), color: 'var(--mut2)' }]} labels={['queue ÷ 50', 'for scale']} /></Panel>
        <Panel title="Action mix (sessions)"><Bars rows={[{ label: 'Normal', v: f.risk[0], color: 'var(--ok)' }, { label: 'Challenge', v: f.risk[1], color: 'var(--acc2)' }, { label: 'Throttle', v: f.risk[2], color: 'var(--warn)' }, { label: 'Quarantine / reject', v: f.risk[3], color: 'var(--bad)' }, { label: 'Unscored', v: f.unscored, color: 'var(--mut2)' }]} /><p className="mut2" style={{ fontSize: '.78rem' }}>Counts come from the deterministic policy's current action per session.</p></Panel>
        <Panel title="Mitigation events" wide><EventLog events={mit} limit={10} /></Panel>
      </div></>)}</Wait></>
}
