'use client'
import { useOps, PageHead, Kpi, Panel, Sim, Wait, n0, short } from '@/components/admin/kit'
import { verifyBundle } from '@/lib/engine/shuffle'
import { sidOf } from '@/lib/engine/drop'
export default function Randomization() {
  const { sim, ready } = useOps(), p = sim?.proof, v = sim && p ? verifyBundle(p, sim.eligibleIds) : null
  const order = sim?.order ?? []
  return <>
    <PageHead title="Randomization" q="How was the admission order fixed, and can anyone recompute it?"><Sim /></PageHead>
    <Wait ready={ready}>{sim && (!p ? <div className="adm-empty"><b>Not randomized yet.</b><p className="mut">Commitment {sim.commitment ? <span className="mono">{short(sim.commitment, 20)}</span> : 'not yet published'}. Close the pre-queue, then randomize from Drop Control. The seed stays hidden until then.</p></div> : <>
      <div className="adm-kpis"><Kpi label="Eligible pool" value={n0(p.eligibleCount)} /><Kpi label="Seats" value={n0(p.seats)} /><Kpi label="Order fixed for" value={n0(order.length)} sub="participants" /><Kpi label="Guided-lane insertions" value={p.guidedLane.length} sub="declared in the proof bundle" /><Kpi label="Recompute check" value={v?.ok ? 'PASS' : 'FAIL'} tone={v?.ok ? 'ok' : 'bad'} /></div>
      <div className="adm-grid"><Panel title="Seed chain">
        <div><div className="eyebrow">1 · commitment (published before entries)</div><div className="adm-code">{p.commitment}</div></div>
        <div><div className="eyebrow">2 · eligible-list root</div><div className="adm-code">{p.eligibleRoot}</div></div>
        <div><div className="eyebrow">3 · server seed (revealed at randomization)</div><div className="adm-code">{p.serverSeed}</div></div>
        <div><div className="eyebrow">4 · shuffle seed = SHA-256(“shuffle:”+seed+”:”+root)</div><div className="adm-code">{p.shuffleSeed}</div></div>
        <p className="mut2" style={{ fontSize: '.78rem' }}>{p.algorithm}</p></Panel>
        <Panel title="Randomized ordering (first 15)"><div className="tscroll"><table className="t"><thead><tr><th>#</th><th>Session</th><th>Account</th><th>Status</th><th>Truth*</th></tr></thead><tbody>{order.slice(0, 15).map(s => <tr key={s.id}><td className="num">{s.pos}</td><td className="mono">{sidOf(s.id)}</td><td className="mono">A{s.acct}</td><td>{s.st}</td><td>{s.bot ? 'automated' : s.ext ? 'customer' : 'human'}</td></tr>)}</tbody></table></div><p className="mut2" style={{ fontSize: '.72rem' }}>* ground truth is known only to the simulator.</p></Panel>
        <Panel title="Independent re-verification" wide>{v?.checks.map(c => <div key={c.name} className="adm-check"><b className={c.ok ? 'ok' : 'bad'}>{c.ok ? '✓' : '✗'}</b><div><b>{c.name}</b><div className="mut2">{c.detail}</div></div></div>)}</Panel></div></>)}</Wait></>
}
