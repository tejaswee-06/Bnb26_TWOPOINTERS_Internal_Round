'use client'
import { LIVE } from '@/lib/live/config'
import { useState } from 'react'
import { MLSimulatedPanel } from '@/components/admin/ml'
import { useOps, PageHead, Panel, Flow, Lines, EventLog, Sim, Wait, n0, pc } from '@/components/admin/kit'
import { SCENARIOS, Scenario } from '@/lib/engine/types'
import { toast } from '@/lib/toast'
export default function AttackLab() {
  const { rt, sim, f, ready } = useOps()
  const [sc, setSc] = useState<Scenario>('DISTRIBUTED'), [vol, setVol] = useState(20000), [botPct, setBotPct] = useState(25), [mult, setMult] = useState(3), [rate, setRate] = useState(1)
  const patch = () => ({ legit: vol, autoPct: botPct / 100, mult, botRate: rate })
  const launchFresh = () => { if (!rt) return; rt.resetDrop(rt.currentDrop, { ...patch(), scenario: sc, mode: 'FAIR', autopilot: true }); rt.manual.delete(rt.currentDrop); const e = rt.operate(rt.currentDrop, 'open'); rt.setAutopilot(rt.currentDrop, true); toast(e || `${SCENARIOS[sc].label} launched on a fresh drop`, e ? 'bad' : 'ok') }
  const inject = () => { if (!rt || !sim) return; if (sc === 'NORMAL') { toast('Normal traffic has nothing to inject', 'info'); return } if (sim.phase === 'PREPARED' || sim.phase === 'ENDED') { toast('Open the pre-queue first, or use “Reset & launch”', 'bad'); return } rt.startAttack(rt.currentDrop, sc, patch()); toast(`${SCENARIOS[sc].label} injected into the running drop`, 'ok') }
  const stop = () => { sim?.stopAttack(); rt?.emit() }
  const reset = () => { if (rt) { rt.resetDrop(rt.currentDrop, { scenario: 'NORMAL' }); toast('Drop reset (no attack)', 'ok') } }
  const r = sim && f ? sim.result() : null, fr = sim?.frames.slice(-120) ?? []
  return <>
    <PageHead title="Attack lab" q="What does each attack do — and does the pipeline stop it from winning seats?"><Sim>SIMULATED ADVERSARIES</Sim></PageHead>
    {LIVE && <p className="adm-note2" data-testid="attacks-sim-note"><b>Live mode:</b> attack scenarios below run in the labelled <b>SIMULATOR</b> only — they never send traffic to the live backend. Ground-truth bot/human labels exist only here. Real RiskEvent → policy decisions are on <a href="/admin/intelligence">Detection</a> and <a href="/admin/campaigns">Campaigns</a>.</p>}
    <MLSimulatedPanel />
    <Wait ready={ready}>{rt && sim && <>
      <Panel title="Scenario & controls">
        <div className="adm-ctl">
          <label className="f">Scenario<select value={sc} onChange={e => setSc(e.target.value as Scenario)}>{(Object.keys(SCENARIOS) as Scenario[]).map(k => <option key={k} value={k}>{SCENARIOS[k].label}</option>)}</select></label>
          <label className="f">Legitimate traffic volume: {n0(vol)}<input type="range" min={2000} max={50000} step={1000} value={vol} onChange={e => setVol(+e.target.value)} /></label>
          <label className="f">Bot percentage: {botPct}%<input type="range" min={5} max={60} step={5} value={botPct} onChange={e => setBotPct(+e.target.value)} /></label>
          <label className="f">Session multiplicity: ×{mult}<input type="range" min={1} max={8} value={mult} onChange={e => setMult(+e.target.value)} /></label>
          <label className="f">Request rate multiplier: ×{rate.toFixed(1)}<input type="range" min={0.5} max={3} step={0.5} value={rate} onChange={e => setRate(+e.target.value)} /></label>
        </div>
        <p className="mut2">{SCENARIOS[sc].blurb}</p>
        <div className="adm-actions"><button className="btn pri" onClick={launchFresh}>Start — reset &amp; launch</button><button className="btn" onClick={inject} title="Adds the attack to the drop that is already running">Inject into running drop</button><button className="btn" onClick={stop} disabled={!sim.attackActive}>Stop attack</button><button className="btn bad" onClick={reset}>Reset</button></div>
        <p className="mut2" style={{ fontSize: '.78rem' }}>“Start” rebuilds the drop with these parameters (the customer pre-queue is shared and is reset too). The simulator then runs on its clock — raise speed in Load Lab to fast-forward.</p>
      </Panel>
      <Panel title="Attack → detection → mitigation → queue → admission → allocation" tag={<span className={'pill ' + (sim.attackActive ? 'bad' : '')}>{sim.attackActive ? 'ATTACK ACTIVE · ' + f?.strategy : 'no active attack'}</span>}>
        {!r || !f ? <p className="mut2">No telemetry yet — start a scenario.</p> : <Flow steps={[
          { k: 'Attack', v: `${n0(r.botSessions)} bot sessions · ${n0(r.botAccounts)} accounts · peak ${n0(r.peakRps)} req/s`, tone: r.botSessions ? 'bad' : '' },
          { k: 'Detection', v: `${f.campaigns} campaigns · precision ${pc(r.precision, 0)} · recall ${pc(r.recall, 0)}`, tone: f.campaigns ? 'warn' : '' },
          { k: 'Mitigation', v: `${n0(r.quarantinedBot)} quarantined/rejected · ${n0(r.limitBlocks)} WAF drops · level ${f.escalation}`, tone: 'ok' },
          { k: 'Queue effect', v: `bots ${pc(r.botEligibleShare, 1)} of eligible pool (${n0(r.eligibleBot)}/${n0(r.eligible)})`, tone: r.botEligibleShare > r.botIdentityShare ? 'bad' : 'ok' },
          { k: 'Admission effect', v: `${n0(f.admitted)} admitted · ${n0(r.lateRejected)} late joins rejected · ${n0(r.bypassBlocked)} bypass blocked` },
          { k: 'Allocation effect', v: `${n0(r.seatsBot)} seats to bots / ${n0(r.sold)} sold · AAA ${r.aaaRatio.toFixed(2)}×`, tone: r.seatsBot ? 'warn' : 'ok' },
        ]} />}
      </Panel>
      <div className="adm-grid"><Panel title="Traffic under attack" tag={<Sim />}><Lines stacked series={[{ name: 'human', data: fr.map(x => x.legit), color: 'var(--ok)' }, { name: 'suspicious', data: fr.map(x => x.susp), color: 'var(--warn)' }, { name: 'bot', data: fr.map(x => x.bot), color: 'var(--bad)' }]} /></Panel>
        <Panel title="Attack & defense events"><EventLog events={sim.events.filter(e => ['attack', 'mitigation', 'policy', 'risk', 'resilience'].includes(e.kind))} limit={9} /></Panel></div></>}</Wait></>
}
