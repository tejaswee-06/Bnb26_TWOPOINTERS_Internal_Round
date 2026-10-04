'use client'
import { useOps, PageHead, Kpi, Panel, Bars, Sim, Wait, n0, pc } from '@/components/admin/kit'
import Link from 'next/link'
import type { SimResult } from '@/lib/engine/types'
const Row = ({ label, r }: { label: string; r: SimResult }) => <tr><td>{label}</td><td className="num">{pc(r.botIdentityShare)}</td><td className="num">{pc(r.botSeatShare)}</td><td className="num">{r.botAccounts ? (r.aaaPP >= 0 ? '+' : '') + r.aaaPP.toFixed(2) + ' pp' : 'n/a'}</td><td className={'num ' + (r.aaaRatio > 1.05 ? 'bad' : 'ok')}>{r.botAccounts ? r.aaaRatio.toFixed(2) + '×' : 'n/a'}</td></tr>
export default function Advantage() {
  const { rt, sim, f, ready } = useOps(), W = rt?.experiment?.worlds, live = sim && f ? sim.result() : null
  return <>
    <PageHead title="Attack allocation advantage" q="How many more seats did adversarial traffic win than its share of participants?"><Sim /></PageHead>
    <p className="adm-note2"><b>AAA = (adversarial share of seats) ÷ (adversarial share of identities).</b> 1.00× means attackers won exactly what their population share would predict; above 1× they gained an advantage, below 1× they were disadvantaged. “pp” is the same gap in percentage points.</p>
    <Wait ready={ready}><div className="adm-grid">
      <Panel title="Current live drop" tag={<span className="pill">{sim?.cfg.scenario}</span>}>{!live || !live.sold ? <p className="mut2">No seats allocated yet in the current drop.</p> : <>
        <div className="adm-kpis"><Kpi label="AAA" value={live.botAccounts ? live.aaaRatio.toFixed(2) + '×' : 'n/a'} tone={live.aaaRatio > 1.05 ? 'bad' : 'ok'} /><Kpi label="Identity share" value={pc(live.botIdentityShare)} /><Kpi label="Seat share" value={pc(live.botSeatShare)} /></div>
        <Bars max={1} fmt={v => pc(v)} rows={[{ label: 'Bot share of identities', v: live.botIdentityShare, color: 'var(--acc)' }, { label: 'Bot share of seats', v: live.botSeatShare, color: 'var(--bad)' }]} /></>}</Panel>
      <Panel title="Experiment worlds">{!W ? <p className="mut2">Run the experiment in <Link href="/admin/fairness">Fairness Lab</Link> to compare Fair Drop with the naive baseline.</p> : <>
        <div className="tscroll"><table className="t"><thead><tr><th>World</th><th>Bot identity share</th><th>Bot seat share</th><th>Gap</th><th>AAA</th></tr></thead><tbody><Row label="World B · Fair Drop" r={W.B.result} /><Row label="Naive · first-come" r={W.N.result} /></tbody></table></div>
        <Bars max={Math.max(1.5, W.N.result.aaaRatio)} fmt={v => v.toFixed(2) + '×'} rows={[{ label: 'Fair Drop', v: W.B.result.aaaRatio, color: 'var(--ok)' }, { label: 'Naive FCFS', v: W.N.result.aaaRatio, color: 'var(--bad)' }, { label: 'Parity (1.00×)', v: 1, color: 'var(--mut2)' }]} />
        <p className="mut2" style={{ fontSize: '.8rem' }}>Legit seats lost to attackers vs World A: Fair Drop {n0(W.A.result.seatsLegit - W.B.result.seatsLegit)}, naive {n0(W.A.result.seatsLegit - W.N.result.seatsLegit)}.</p></>}</Panel>
    </div></Wait></>
}
