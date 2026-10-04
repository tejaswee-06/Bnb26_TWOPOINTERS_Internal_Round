'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useDrop } from '@/hooks/useDrop'
import DropFrame, { Waiting, NotFound } from '@/components/DropFrame'
import Ic from '@/components/Icon'
export default function QueuePage() {
  const { e, rt, sim, st, id, ready } = useDrop(), router = useRouter()
  const phase = sim?.phase
  useEffect(() => { if (phase && ['RANDOMIZED', 'ADMITTING', 'PAUSED', 'ENDED'].includes(phase) && st) router.replace(`/drop/${id}/admission`) }, [phase, st, id, router])
  if (!e || !e.drop) return ready || !e ? <NotFound /> : <Waiting />
  if (!ready) return <Waiting />
  if (!st || !sim) return <DropFrame e={e} at={1}><div className="card cx-empty"><h2>You haven’t joined this drop</h2><p className="mut">Verify your session to enter the pre-queue.</p><Link className="btn pri" href={`/drop/${id}/verify`}>Join Fair Drop</Link></div></DropFrame>
  const open = st.q.phase === 'PRE_QUEUE_OPEN', total = sim.cfg.preQueueSec, left = st.q.secondsLeft, pct = open ? Math.round(((total - left) / total) * 100) : 100
  return <DropFrame e={e} at={1}>
    <div className="cx-safe"><span className="cx-safe-i"><Ic n="check" s={34} /></span>
      <h1>{open ? 'You’re safely in' : 'Entry closed — drawing now'}</h1>
      <p className="mut" style={{ maxWidth: 520, margin: '0 auto' }}>{open ? 'Your place is secured. When the window closes, a verifiable random draw decides the order. Arriving earlier or refreshing doesn’t change anything — you can relax.' : 'The entry window has closed. We’re publishing the random seed and fixing the admission order…'}</p>
    </div>
    <div className="grid g3" style={{ margin: '1.4rem 0' }}>
      <div className="card cx-stat"><span className="eyebrow">Window closes in</span><b className="num">{open ? left + 's' : '—'}</b></div>
      <div className="card cx-stat"><span className="eyebrow">People in the pre-queue</span><b className="num">{st.q.joined.toLocaleString('en-IN')}</b></div>
      <div className="card cx-stat"><span className="eyebrow">Seats available</span><b className="num">{sim.inv.total}</b></div>
    </div>
    <div className="bar" role="progressbar" aria-label="Pre-queue window progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: pct + '%' }} /></div>
    <p className="mut2" style={{ marginTop: '.6rem', fontSize: '.82rem' }}>Entry window is demo-compressed. Position is assigned only after the window closes, so it can’t be gamed.</p>
    <div className="row" style={{ marginTop: '1rem' }}><Link className="btn" href={`/events/${id}`}>Event details</Link><Link className="btn ghost" href="/how-it-works">How the draw works</Link></div>
  </DropFrame>
}
