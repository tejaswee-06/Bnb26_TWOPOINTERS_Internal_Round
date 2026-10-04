'use client'
import { useState } from 'react'
import { useOps, PageHead, Kpi, Panel, Sim, Wait, n0, short } from '@/components/admin/kit'
import { verifyBundle, ProofBundle } from '@/lib/engine/shuffle'
import { sidOf } from '@/lib/engine/drop'
export default function Verification() {
  const { sim, ready } = useOps(), [sidIn, setSidIn] = useState('')
  const p = sim?.proof, el = sim?.eligibleIds ?? []
  const sample = sim?.order.find(s => s.st === 'COMPLETED' || s.seats > 0) ?? sim?.order[0]
  const target = sim?.sessionById(sidIn.trim().toUpperCase()) ?? sample
  const claim = target && target.pos ? { id: target.id, position: target.pos } : undefined
  const run = (b: ProofBundle, list: number[]) => verifyBundle(b, list, claim)
  const cases = !p ? [] : [
    { name: 'Untouched proof bundle', hint: 'expected PASS', res: run(p, el) },
    { name: 'Tamper: server seed altered (1 hex char)', hint: 'expected FAIL', res: run({ ...p, serverSeed: p.serverSeed.slice(0, -1) + (p.serverSeed.endsWith('0') ? '1' : '0') }, el) },
    { name: 'Tamper: one eligible entry removed', hint: 'expected FAIL', res: run(p, el.slice(1)) },
    { name: 'Tamper: claimed position falsified', hint: 'expected FAIL', res: claim ? verifyBundle(p, el, { id: claim.id, position: claim.position + 1 }) : null },
  ]
  return <>
    <PageHead title="Verification" q="Can anyone independently re-derive the order and detect tampering?"><Sim>RE-COMPUTED FROM THE ENGINE'S PROOF BUNDLE</Sim></PageHead>
    <Wait ready={ready}>{sim && (!p ? <div className="adm-empty"><b>No proof yet.</b><p className="mut">The proof bundle exists after randomization. Commitment {sim.commitment ? <span className="mono">{short(sim.commitment, 20)}</span> : 'not yet published'}.</p></div> : <>
      <div className="adm-kpis"><Kpi label="Commitment" value={<span className="mono" style={{ fontSize: '.85rem' }}>{short(p.commitment, 16)}</span>} sub="SHA-256(“commit:”+seed)" /><Kpi label="Seed" value={<span className="mono" style={{ fontSize: '.85rem' }}>{short(p.serverSeed, 16)}</span>} sub="revealed" /><Kpi label="Eligible root" value={<span className="mono" style={{ fontSize: '.85rem' }}>{short(p.eligibleRoot, 16)}</span>} sub={n0(p.eligibleCount) + ' entries'} /><Kpi label="Algorithm" value={<span style={{ fontSize: '.85rem' }}>Fisher–Yates / SHA-256 stream</span>} /></div>
      <Panel title="Allocation to verify"><label className="f" style={{ maxWidth: 360 }}>Session ID (blank = first winner)<input value={sidIn} placeholder={sample ? sidOf(sample.id) : 'S-00000'} onChange={e => setSidIn(e.target.value)} /></label>
        <p className="mut2">{target && claim ? <>Session <b className="mono">{sidOf(target.id)}</b> · admission position #{n0(claim.position)} · seats won {target.seats}</> : 'No such session in the eligible order.'}</p></Panel>
      <div className="adm-grid">{cases.map(c => <Panel key={c.name} title={c.name} tag={c.res && <span className={'pill ' + ((c.hint === 'expected PASS') === c.res.ok ? 'ok' : 'bad')}>{c.res.ok ? 'VERIFIED' : 'TAMPER DETECTED'}</span>}>
        {c.res ? c.res.checks.map(k => <div key={k.name} className="adm-check"><b className={k.ok ? 'ok' : 'bad'}>{k.ok ? '✓' : '✗'}</b><div>{k.name}<div className="mut2" style={{ fontSize: '.75rem' }}>{k.detail}</div></div></div>) : <p className="mut2">Needs a session with a position.</p>}<p className="mut2" style={{ fontSize: '.72rem' }}>{c.hint}</p></Panel>)}</div></>)}
      <p className="adm-note2 warn"><b>What this proves:</b> given the published commitment and the revealed seed, anyone can recompute the shuffle and confirm positions. <b>What it does not:</b> there is no external randomness beacon, and an operator who chose the seed before committing is not detectable. This is a hash-commitment scheme, not a zero-knowledge or on-chain proof.</p></Wait></>
}
