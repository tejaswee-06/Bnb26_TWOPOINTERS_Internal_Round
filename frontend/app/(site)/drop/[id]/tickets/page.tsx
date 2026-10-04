'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useDrop } from '@/hooks/useDrop'
import DropFrame, { Waiting, NotFound } from '@/components/DropFrame'
import { inr } from '@/lib/data/events'
import { fees } from '@/lib/runtime'
import { service } from '@/services/fairdrop'
import { toast } from '@/lib/toast'
const ERR: Record<string, string> = { SOLD_OUT: 'That ticket type just sold out. Please choose another.', INSUFFICIENT: 'Not enough of that type left for your quantity.', LIMIT: 'You’ve reached the per-person limit for this drop.', NOT_ADMITTED: 'You’re not currently admitted. Return to the queue.', POLICY_BLOCKED: 'This entry can’t continue to purchase.', CHALLENGE_REQUIRED: 'A quick verification step is needed first — return to the queue page to complete it.', NO_SESSION: 'We couldn’t find your session. Rejoin from the drop page.' }
export default function TicketsPage() {
  const { e, rt, sim, st, id, ready } = useDrop(), router = useRouter(), [ti, setTi] = useState(0), [qty, setQty] = useState(1), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  if (!e || !e.drop) return ready || !e ? <NotFound /> : <Waiting />
  if (!ready) return <Waiting />
  const blocked = (msg: string, cta: [string, string]) => <DropFrame e={e} at={3}><div className="card cx-empty"><h2>{msg}</h2><Link className="btn pri" href={cta[1]}>{cta[0]}</Link></div></DropFrame>
  if (!st || !sim) return blocked('You haven’t joined this drop', ['Join Fair Drop', `/drop/${id}/verify`])
  const s = st.sess
  if (s.hold && s.st === 'ALLOCATING') return blocked('You already have seats on hold', ['Continue to payment', `/drop/${id}/payment?hold=${s.hold}`])
  if (s.st !== 'ADMITTED') return blocked(s.st === 'COMPLETED' ? 'You’ve already completed your purchase' : 'You’re not admitted yet', [s.st === 'COMPLETED' ? 'My tickets' : 'Back to my queue', s.st === 'COMPLETED' ? '/tickets' : `/drop/${id}/admission`])
  const stock = rt!.stock(e), sel = stock[ti], max = Math.max(0, Math.min(sim.cfg.maxQty, sel?.available ?? 0)), f = fees((sel?.price ?? 0) * qty)
  const hold = async () => {
    setBusy(true); setErr(''); const r = await service.hold(id, ti, qty); setBusy(false)
    if (!r.ok) { setErr(r.reason.startsWith('TOKEN_') ? 'Your admission link is no longer valid (' + r.reason.slice(6).toLowerCase().replace(/_/g, ' ') + '). Return to the queue.' : ERR[r.reason] || (r.reason === 'BACKEND_UNREACHABLE' ? 'We can’t reach the Fair Drop service right now. Please retry.' : 'Could not hold those tickets.')); return toast('Hold failed', 'bad') }
    router.push(`/drop/${id}/payment?hold=${r.hold.id}`)
  }
  return <DropFrame e={e} at={3}>
    <h1 style={{ fontSize: '1.8rem' }}>Choose your tickets</h1>
    <p className="mut" style={{ margin: '.4rem 0 1rem' }}>Limit {sim.cfg.maxQty} per person. Your seats are held for {Math.round(sim.cfg.holdTtl / 60)} minutes once you continue.</p>
    <div role="radiogroup" aria-label="Ticket type" className="col">{stock.map((t, i) => <label key={t.id} className={'cx-opt' + (ti === i ? ' on' : '') + (t.available === 0 ? ' dis' : '')}><input type="radio" name="tt" checked={ti === i} disabled={t.available === 0} onChange={() => { setTi(i); setQty(1) }} />
      <span className="grow"><b>{t.name}</b> {t.available === 0 ? <span className="pill bad">Sold out</span> : t.available < 25 ? <span className="pill warn">Only {t.available} left</span> : null}<br /><span className="mut2" style={{ fontSize: '.8rem' }}>{t.perks}</span></span><b>{inr(t.price)}</b></label>)}</div>
    <div className="card" style={{ margin: '1rem 0' }}>
      <div className="row sb"><span>Quantity</span><div className="row"><button className="ib" aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1}>−</button><b className="num" aria-live="polite">{qty}</b><button className="ib" aria-label="Increase quantity" onClick={() => setQty(Math.min(max, qty + 1))} disabled={qty >= max}>+</button></div></div>
      <hr style={{ border: 0, borderTop: '1px solid var(--bd)', margin: '.8rem 0' }} />
      <div className="row sb mut"><span>Subtotal</span><span>{inr((sel?.price ?? 0) * qty)}</span></div><div className="row sb mut"><span>Convenience fee + GST</span><span>{inr(f.fee + f.gst - 0)}</span></div><div className="row sb"><b>Total</b><b>{inr(f.total)}</b></div>
    </div>
    {err && <div className="cx-note bad" role="alert">{err} <Link href={`/drop/${id}/admission`} className="acc">Back to queue</Link></div>}
    <div className="row"><button className="btn pri lg" onClick={hold} disabled={busy || !sel || sel.available === 0}>{busy ? 'Holding…' : 'Hold tickets & continue'}</button><Link className="btn lg" href={`/drop/${id}/admission`}>Back</Link></div>
  </DropFrame>
}
