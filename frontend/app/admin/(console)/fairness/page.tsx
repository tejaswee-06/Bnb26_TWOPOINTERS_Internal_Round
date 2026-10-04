'use client'
import { useState } from 'react'
import { useOps, PageHead, Kpi, Panel, Bars, Sim, Wait, n0, pc } from '@/components/admin/kit'
import { SCENARIOS, Scenario, SimResult } from '@/lib/engine/types'
const adv = (r: SimResult) => (r.botAccounts ? r.winnersBot / r.botAccounts : 0)
export default function FairnessLab() {
  const { rt, ready } = useOps(); const [sc, setSc] = useState<Scenario>('DISTRIBUTED'), [vol, setVol] = useState(20000), [bp, setBp] = useState(25), [mult, setMult] = useState(3)
  const x = rt?.experiment, run = () => { if (rt) { rt.labCfg = { scenario: sc, legit: vol, autoPct: bp / 100, mult, surge: 1, botRate: 1 }; void rt.runExperiment({ ...rt.labCfg, scenario: sc } as never) } }
  const W = x?.worlds
  const rows: [string, (r: SimResult) => string][] = [
    ['Legitimate allocation rate (winning accounts ÷ legit accounts)', r => pc(r.legitAllocationRate, 2)],
    ['Adversarial allocation rate (winning bot accounts ÷ bot accounts)', r => (r.botAccounts ? pc(adv(r), 2) : 'n/a')],
    ['Seats: legitimate / adversarial', r => `${n0(r.seatsLegit)} / ${n0(r.seatsBot)}`],
    ['Bot share of seats vs share of identities', r => r.sold ? `${pc(r.botSeatShare)} vs ${pc(r.botIdentityShare)}` : '—'],
    ['Queue distortion (legit mean rank shift; 0 = neutral)', r => (r.legitRankShift >= 0 ? '+' : '') + r.legitRankShift.toFixed(3)],
    ['Duplicate identity entries removed', r => n0(r.dupBlocked)],
    ['Overselling (seats over capacity)', r => String(r.oversell) + (r.integrity ? ' · integrity OK' : ' · VIOLATED')],
    ['Peak p99 latency (modelled)', r => n0(r.peakP99) + ' ms'],
    ['Peak system load', r => pc(r.peakLoad, 0)],
    ['Attack Allocation Advantage (bot seat share ÷ identity share)', r => (r.botAccounts ? r.aaaRatio.toFixed(2) + '×' : 'n/a')],
  ]
  return <>
    <PageHead title="Fairness lab" q="Does an attack change who gets seats — and how much worse is a first-come baseline?"><Sim>COMPUTED BY RUNNING THE ENGINE</Sim></PageHead>
    <Panel title="Experiment">
      <div className="adm-ctl"><label className="f">Attack scenario<select value={sc} onChange={e => setSc(e.target.value as Scenario)}>{(Object.keys(SCENARIOS) as Scenario[]).filter(k => k !== 'NORMAL').map(k => <option key={k} value={k}>{SCENARIOS[k].label}</option>)}</select></label>
        <label className="f">Legitimate crowd: {n0(vol)}<input type="range" min={2000} max={50000} step={2000} value={vol} onChange={e => setVol(+e.target.value)} /></label>
        <label className="f">Bot share: {bp}%<input type="range" min={5} max={60} step={5} value={bp} onChange={e => setBp(+e.target.value)} /></label>
        <label className="f">Session multiplicity ×{mult}<input type="range" min={1} max={8} value={mult} onChange={e => setMult(+e.target.value)} /></label></div>
      <div className="adm-actions"><button className="btn pri" disabled={!rt || rt.experimentRunning} onClick={run}>{rt?.experimentRunning ? 'Running…' : 'Run counterfactual experiment'}</button>{rt?.experimentRunning && <span className="mut" role="status">{rt.experimentProgress.msg}</span>}</div>
      <p className="mut2" style={{ fontSize: '.8rem' }}><b>World A</b> legitimate population only · <b>World B</b> the identical legitimate crowd + adversarial traffic (Fair Drop) · <b>Naive</b> same crowd + same attack, first-come-first-served. Larger crowds take a few seconds to simulate.</p></Panel>
    <Wait ready={ready}>{!x || !W ? <div className="adm-empty"><b>No experiment run yet.</b><p className="mut">Press “Run counterfactual experiment” — no numbers are shown until the engine has computed them.</p></div> : <>
      <p className="mut2 mono" style={{ fontSize: '.75rem' }}>{x.seedNote} · {SCENARIOS[x.cfg.scenario].label} · ran in {W.A.ms + W.B.ms + W.N.ms} ms</p>
      <div className="adm-kpis"><Kpi label="AAA — Fair Drop (World B)" value={W.B.result.botAccounts ? W.B.result.aaaRatio.toFixed(2) + '×' : 'n/a'} sub={`${n0(W.B.result.seatsBot)} bot seats`} tone={W.B.result.aaaRatio <= 1 ? 'ok' : 'warn'} />
        <Kpi label="AAA — naive baseline" value={W.N.result.aaaRatio.toFixed(2) + '×'} sub={`${n0(W.N.result.seatsBot)} bot seats`} tone={W.N.result.aaaRatio > 1 ? 'bad' : 'ok'} />
        <Kpi label="Legit seats A → B → Naive" value={`${n0(W.A.result.seatsLegit)} → ${n0(W.B.result.seatsLegit)} → ${n0(W.N.result.seatsLegit)}`} />
        <Kpi label="Oversell (all worlds)" value={W.A.result.oversell + W.B.result.oversell + W.N.result.oversell} tone="ok" /></div>
      <Panel title="World A vs World B vs naive baseline" wide><div className="tscroll"><table className="t"><thead><tr><th>Metric</th><th>World A · legit only</th><th>World B · + attack · FAIR DROP</th><th>Naive · + attack · FCFS</th></tr></thead><tbody>{rows.map(([l, fn]) => <tr key={l}><td>{l}</td><td className="num">{fn(W.A.result)}</td><td className="num">{fn(W.B.result)}</td><td className="num">{fn(W.N.result)}</td></tr>)}</tbody></table></div></Panel>
      <div className="adm-grid"><Panel title="Allocation distribution across the queue order (Fair Drop, World B)"><p className="mut2" style={{ fontSize: '.78rem' }}>Seats won by queue-position decile. Flat = position-independent allocation.</p><Bars rows={W.B.posHist.legit.map((v, i) => ({ label: `decile ${i + 1} · legit`, v, color: 'var(--ok)', note: undefined }))} /><Bars rows={W.B.posHist.bot.map((v, i) => ({ label: `decile ${i + 1} · bot`, v, color: 'var(--bad)' }))} /></Panel>
        <Panel title="Same, naive baseline"><p className="mut2" style={{ fontSize: '.78rem' }}>First-come-first-served concentrates seats at the very front of the order.</p><Bars rows={W.N.posHist.legit.map((v, i) => ({ label: `decile ${i + 1} · legit`, v, color: 'var(--ok)' }))} /><Bars rows={W.N.posHist.bot.map((v, i) => ({ label: `decile ${i + 1} · bot`, v, color: 'var(--bad)' }))} /></Panel></div></>}</Wait></>
}
