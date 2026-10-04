'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useRT } from '@/lib/store'
import { Waiting } from '@/components/DropFrame'
import Ic from '@/components/Icon'
const short = (h: string, n = 18) => h.slice(0, n) + '…' + h.slice(-6)
export default function VerifyAllocation() {
  const { id } = useParams<{ id: string }>(), rt = useRT(), [tamper, setTamper] = useState<undefined | 'seed' | 'list'>(), [shown, setShown] = useState(true)
  const b = rt?.booking(id)
  const out = useMemo(() => (rt && b ? rt.verifyBooking(b, tamper) : null), [rt, b, tamper])
  if (!rt) return <Waiting />
  if (!b) return <div className="cx-w cx-sec"><div className="card cx-empty"><h1 style={{ fontSize: '1.5rem' }}>Nothing to verify</h1><p className="mut">We couldn’t find that booking in this browser.</p><Link className="btn pri" href="/tickets">My Tickets</Link></div></div>
  if (b.mode !== 'DROP' || !b.proof) return <div className="cx-w cx-sec" style={{ maxWidth: 760 }}><div className="card"><h1 style={{ fontSize: '1.5rem' }}>Direct booking — no draw to verify</h1><p className="mut" style={{ marginTop: '.5rem' }}>This event sold tickets directly, so there is no randomized allocation. The only guarantee is inventory integrity (sold + held + available always equals total).</p><div className="row" style={{ marginTop: '1rem' }}><Link className="btn pri" href={`/confirmation/${b.id}`}>Back to ticket</Link></div></div></div>
  const p = b.proof, passed = out && !out.missing && out.res.ok
  const steps: [string, string, string][] = [
    ['1', 'Commitment published before entry opened', `SHA-256 commitment ${short(p.commitment)} — published when the pre-queue opened, before anyone could know the outcome.`],
    ['2', 'Seed revealed after the window closed', `Server seed ${short(p.serverSeed)}. Anyone can hash it and compare with the commitment in step 1.`],
    ['3', 'Eligible set frozen', `${p.eligibleCount.toLocaleString('en-IN')} de-duplicated entries hashed to root ${short(p.eligibleRoot)} — so the list can’t change after the seed is known.`],
    ['4', 'Deterministic shuffle', `Algorithm: ${p.algorithm}. Shuffle seed ${short(p.shuffleSeed)} derived from seed + root. The same inputs always produce the same order.`],
    ['5', 'Your allocation', `Entry ${b.claimId} landed at position #${b.position.toLocaleString('en-IN')} of ${b.pool.toLocaleString('en-IN')}; ${p.seats} seats were available.`],
  ]
  return <div className="cx-w cx-sec" style={{ maxWidth: 880 }}>
    <span className="pill acc"><Ic n="shield" s={13} /> Verification proof</span>
    <h1 style={{ fontSize: 'clamp(1.6rem,4vw,2.2rem)', margin: '.4rem 0' }}>Check that the draw was fair</h1>
    <p className="mut">Everything below is recomputed live in your browser from the published proof bundle — you don’t have to trust us.</p>
    <ol className="cx-proof">{steps.map(([n, t, d]) => <li key={n}><span className="cx-n">{n}</span><div><b>{t}</b><p className="mut" style={{ fontSize: '.88rem', wordBreak: 'break-word' }}>{d}</p></div></li>)}</ol>
    <section className="card" aria-live="polite">
      <div className="row sb"><h2 style={{ fontSize: '1.15rem' }}>6 · Independent re-verification</h2>
        {out && !out.missing ? <span className={'pill ' + (passed ? 'ok' : 'bad')} style={{ fontSize: '.9rem' }}>{passed ? '✓ VERIFIED' : '✕ VERIFICATION FAILED'}</span> : <span className="pill warn">Not available</span>}</div>
      {out?.missing && <p className="mut" style={{ marginTop: '.6rem' }}>The eligible-entry list for this draw is no longer stored in this browser (the demo keeps only the most recent two draws), so it can’t be recomputed here.</p>}
      {out && !out.missing && <ul className="cx-checks" style={{ marginTop: '.8rem' }}>{out.res.checks.map(c => <li key={c.name} className={c.ok ? 'ok' : 'badc'}><span>{c.ok ? '✓' : '✕'}</span><span><b>{c.name}</b><br /><span className="mut2" style={{ fontSize: '.78rem' }}>{c.detail}</span></span></li>)}</ul>}
      <div className="row" style={{ marginTop: '1rem' }}><span className="eyebrow">Tamper test</span>
        <button className={'btn sm' + (tamper === 'seed' ? ' pri' : '')} onClick={() => setTamper(tamper === 'seed' ? undefined : 'seed')}>Alter the seed</button>
        <button className={'btn sm' + (tamper === 'list' ? ' pri' : '')} onClick={() => setTamper(tamper === 'list' ? undefined : 'list')}>Remove an entry from the list</button>
        {tamper && <button className="btn sm ghost" onClick={() => setTamper(undefined)}>Reset</button>}</div>
      {tamper && <p className="mut2" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>Changing even one character of the seed or one entry makes verification fail — that is what makes the proof meaningful.</p>}
    </section>
    {p.guidedLane.length > 0 && <div className="cx-note warn" style={{ marginTop: '1rem' }}><Ic n="info" s={16} /> <span><b>Disclosure:</b> this demo drop included a Guided Walkthrough lane — {p.guidedLane.length} demo attendee(s) were inserted at fixed, declared positions (yours: {b.guided ? 'yes' : 'no'}). A production drop would have no such lane.</span></div>}
    <details className="cx-demo-opt" style={{ marginTop: '1rem' }}><summary>What this proves — and what it doesn’t</summary><ul className="cx-list" style={{ listStyle: 'disc' }}>
      <li><b>Does prove:</b> the published order is exactly what the revealed seed and the frozen entry list produce; the seed matches the commitment made before entry.</li>
      <li><b>Does not prove:</b> that the operator chose the seed fairly before committing (no external randomness beacon is used), or that every real person was admitted as a distinct entry.</li>
      <li>The commitment uses SHA-256; no zero-knowledge or signature scheme is claimed.</li></ul></details>
    <div className="row" style={{ marginTop: '1.2rem' }}><Link className="btn pri" href={`/confirmation/${b.id}`}>Back to my ticket</Link><Link className="btn" href="/tickets">My Tickets</Link><Link className="btn ghost" href="/how-it-works">How Fair Drop works</Link></div>
  </div>
}
