'use client'
import { useOps, PageHead, Kpi, Panel, Lines, Sim, Wait, NoTelemetry, n0, pc } from '@/components/admin/kit'
export default function LoadLab() {
  const { rt, sim, f, ready } = useOps(); const fr = sim?.frames.slice(-120) ?? []
  return <>
    <PageHead title="Load lab" q="Does the platform hold under a flash crowd, and when does it shed?"><Sim>SIMULATED LOAD MODEL</Sim></PageHead>
    <Wait ready={ready}>{rt && sim && <>
      <Panel title="Controls">
        <div className="adm-ctl">
          <label className="f">Traffic surge multiplier ×{sim.cfg.surge.toFixed(1)}<input type="range" min={0.5} max={4} step={0.5} value={sim.cfg.surge} onChange={e => { sim.setSurge(+e.target.value); rt.emit() }} aria-label="Surge multiplier" /></label>
          <div className="col"><span className="eyebrow">Simulator clock</span><div className="seg">{[1, 2, 4, 8].map(x => <button key={x} className={rt.speed === x ? 'on' : ''} onClick={() => rt.setSpeed(x)}>×{x}</button>)}</div></div>
          <div className="col"><span className="eyebrow">Clock</span><button className="btn sm" onClick={() => rt.setPaused(!rt.paused)}>{rt.paused ? 'Resume' : 'Pause'} clock</button></div>
          <div className="col"><span className="eyebrow">ML scoring service</span><button className="btn sm" onClick={() => { sim.setMl(!sim.mlOnline); rt.emit() }}>{sim.mlOnline ? 'Fail ML service (resilience test)' : 'Restore ML service'}</button></div>
        </div>
      </Panel>
      {!f ? <NoTelemetry phase={sim.phase} /> : <>
        <div className="adm-kpis"><Kpi label="Load" value={pc(f.load, 0)} tone={f.load > 0.85 ? 'bad' : f.load > 0.6 ? 'warn' : 'ok'} /><Kpi label="Shed fraction" value={pc(f.shed, 0)} sub="low-priority requests dropped" /><Kpi label="Circuit breaker" value={f.breaker} tone={f.breaker === 'CLOSED' ? 'ok' : 'bad'} /><Kpi label="Health state" value={f.state} /><Kpi label="Peak load / p99" value={`${pc(sim.result().peakLoad, 0)} / ${n0(sim.result().peakP99)} ms`} /><Kpi label="Peak req/s" value={n0(sim.result().peakRps)} /></div>
        <Panel title="Load, shedding and latency" tag={<Sim />}><Lines series={[{ name: 'load', data: fr.map(x => x.load), color: 'var(--acc)' }, { name: 'shed', data: fr.map(x => x.shed), color: 'var(--bad)' }]} /><Lines h={110} series={[{ name: 'p99 ms', data: fr.map(x => x.p99), color: 'var(--warn)' }, { name: 'p50 ms', data: fr.map(x => x.p50), color: 'var(--ok)' }]} /></Panel></>}
      <p className="adm-note2 warn">Load, shedding and latency are outputs of the simulator's capacity model, not measurements of a real server fleet.</p></>}</Wait></>
}
