'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { useDrop } from '@/hooks/useDrop'
import DropFrame, { Waiting, NotFound } from '@/components/DropFrame'
import { inr } from '@/lib/data/events'
import { fees } from '@/lib/runtime'
import { service } from '@/services/fairdrop'
import { toast } from '@/lib/toast'
const METHODS = ['UPI (demo)', 'Card (demo)', 'Net banking (demo)']
function Pay() {
  const { e, rt, sim, id, ready } = useDrop(), router = useRouter(), sp = useSearchParams(), holdId = sp.get('hold') || ''
  const [method, setMethod] = useState(METHODS[0]), [fail, setFail] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  if (!e) return <NotFound />
  if (!ready) return <Waiting />
  const direct = e.dropStatus === 'ON_SALE', inv = direct ? rt!.directInv(id) : sim?.inv, h = inv?.holds.get(holdId), now = direct ? rt!.clock : sim?.t ?? 0
  const back = direct ? `/events/${id}` : `/drop/${id}/tickets`
  const frame = (c: React.ReactNode) => <DropFrame e={e} at={4}>{c}</DropFrame>
  if (!h) return frame(<div className="card cx-empty"><h2>We can’t find that reservation</h2><p className="mut">It may have expired or never existed. Nothing was charged.</p><Link className="btn pri" href={back}>Choose tickets again</Link></div>)
  if (h.state === 'CONFIRMED') { const b = rt!.bookings.find(x => x.holdId === holdId); return frame(<div className="card cx-empty"><h2>Already paid ✓</h2><p className="mut">This reservation is confirmed.</p><Link className="btn pri" href={b ? `/confirmation/${b.id}` : '/tickets'}>View ticket</Link></div>) }
  const left = Math.max(0, h.expires - now), expired = h.state !== 'HELD' || left <= 0, ty = e.ticketTypes[h.typeIdx], f = fees(ty.price * h.qty)
  if (expired) return frame(<div className="card cx-empty"><h2>Your hold expired</h2><p className="mut">The seats were released so others can buy them. Nothing was charged.</p><Link className="btn pri" href={back}>{direct ? 'Choose tickets again' : 'Back'}</Link></div>)
  const pay = () => {
    if (busy) return; setBusy(true); setErr('')
    setTimeout(async () => {
      if (fail) { setBusy(false); setErr('Demo: payment was declined by your bank. Your seats are still held — try again before the timer ends.'); return toast('Payment declined (simulated)', 'bad') }
      const r = direct ? rt!.directConfirm(id, holdId, method) : await service.confirm(id, holdId, method)
      setBusy(false)
      if (!r.ok) { setErr(r.reason === 'EXPIRED' ? 'Your hold expired just before payment completed. You were not charged.' : 'Could not confirm: ' + r.reason); return }
      router.push(`/confirmation/${r.booking.id}`)
    }, 700)
  }
  const cancel = async () => { if (direct) rt!.directInv(id)?.release(holdId); else await service.release(id, holdId); toast('Hold released', 'info'); router.push(back) }
  return frame(<>
    <div className="row sb"><h1 style={{ fontSize: '1.8rem' }}>Payment</h1><span className={'pill ' + (left < 30 ? 'bad' : 'warn')} role="timer" aria-live="off">Hold expires in <b className="num">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</b></span></div>
    <div className="card" style={{ margin: '1rem 0' }}><div className="row sb"><div><b>{ty.name}</b> × {h.qty}<br /><span className="mut2" style={{ fontSize: '.8rem' }}>{e.title}</span></div><b>{inr(ty.price * h.qty)}</b></div>
      <hr style={{ border: 0, borderTop: '1px solid var(--bd)', margin: '.8rem 0' }} /><div className="row sb mut"><span>Convenience fee (4%)</span><span>{inr(f.fee)}</span></div><div className="row sb mut"><span>GST on fee (18%)</span><span>{inr(f.gst)}</span></div><div className="row sb"><b>Total payable</b><b>{inr(f.total)}</b></div></div>
    <fieldset className="cx-fs"><legend className="eyebrow">Payment method — demo only, no money moves and no details are collected</legend>
      {METHODS.map(m => <label key={m} className={'cx-opt' + (method === m ? ' on' : '')}><input type="radio" name="pm" checked={method === m} onChange={() => setMethod(m)} /><span className="grow"><b>{m}</b></span></label>)}</fieldset>
    <label className="cx-ack"><input type="checkbox" checked={fail} onChange={e => setFail(e.target.checked)} /> Demo: simulate a declined payment (shows the retry path)</label>
    {err && <div className="cx-note bad" role="alert">{err}</div>}
    <div className="row" style={{ marginTop: '1rem' }}><button className="btn pri lg" onClick={pay} disabled={busy}>{busy ? 'Processing…' : `Pay ${inr(f.total)}`}</button><button className="btn lg" onClick={cancel} disabled={busy}>Cancel &amp; release seats</button></div>
    <p className="mut2" style={{ fontSize: '.78rem', marginTop: '.8rem' }}>Retrying is safe: confirmation is idempotent, so a double-click or reload can never charge or allocate twice.</p>
  </>)
}
export default function PaymentPage() { return <Suspense fallback={<Waiting />}><Pay /></Suspense> }
