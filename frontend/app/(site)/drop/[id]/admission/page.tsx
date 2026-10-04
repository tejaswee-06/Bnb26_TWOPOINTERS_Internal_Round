'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useDrop } from '@/hooks/useDrop'
import DropFrame, { Waiting, NotFound } from '@/components/DropFrame'
import Ic from '@/components/Icon'
export default function AdmissionPage() {
  const { e, rt, sim, st, id, ready } = useDrop(), router = useRouter(), [solving, setSolving] = useState(''), [chErr, setChErr] = useState('')
  const phase = sim?.phase
  useEffect(() => { if (st && (phase === 'PRE_QUEUE_OPEN' || phase === 'PRE_QUEUE_CLOSED')) router.replace(`/drop/${id}/queue`) }, [phase, st, id, router])
  if (!e || !e.drop) return ready || !e ? <NotFound /> : <Waiting />
  if (!ready) return <Waiting />
  if (!st || !sim) return <DropFrame e={e} at={2}><div className="card cx-empty"><h2>You haven’t joined this drop</h2><p className="mut">Entry closed once the pre-queue window ended. You can still follow the event.</p><div className="row" style={{ justifyContent: 'center' }}><Link className="btn pri" href={`/drop/${id}`}>Drop overview</Link><Link className="btn" href="/events">Browse events</Link></div></div></DropFrame>
  const q = st.q, s = st.sess, ls = rt!.isLive ? (s as unknown as { policyAction: string; admitStatus: string; retryAfter: number; challenge: boolean }) : null, booking = rt!.bookings.find(b => b.eventId === id && b.sid === st.part.sid)
  const pool = q.eligible, pct = pool ? Math.min(100, Math.round((q.admittedUpTo / pool) * 100)) : 0, wait = Math.ceil(q.ahead / Math.max(1, q.admitRate))
  const outcomeMsg: Record<string, string> = { SOLD_OUT: 'All seats were allocated before your turn. This is the luck of a fair draw — everyone in the pool had exactly the same odds.', EXPIRED: 'Your admission window expired before you chose tickets.', ABANDONED: 'This entry was released.', NOT_ADMITTED: 'Admission ended before your turn.', PAYMENT_FAILED: 'Your hold was released.', BLOCKED: 'This entry could not be accepted for this drop. Nothing was charged. If you believe this is a mistake, please contact support.' }
  return <DropFrame e={e} at={2}>
    {booking ? <div className="cx-safe"><span className="cx-safe-i ok"><Ic n="ticket" s={32} /></span><h1>You got tickets!</h1><p className="mut">Booking {booking.id} is confirmed.</p><div className="row" style={{ justifyContent: 'center', marginTop: '1rem' }}><Link className="btn pri lg" href={`/confirmation/${booking.id}`}>View my ticket</Link></div></div>
    : !q.isEligible && ['RANDOMIZED', 'ADMITTING', 'PAUSED', 'ENDED'].includes(q.phase) ? <div className="card cx-empty"><h2>Your entry wasn’t added to the draw</h2><p className="mut">Only one entry per person is allowed. Your session was merged with another entry from the same identity, or couldn’t be verified. Nothing was charged.</p><Link className="btn pri" href="/events">Browse other events</Link></div>
    : s.st === 'ADMITTED' ? <div className="cx-safe"><span className="cx-safe-i ok"><Ic n="check" s={34} /></span><h1>It’s your turn — you’re in!</h1><p className="mut" style={{ maxWidth: 520, margin: '0 auto' }}>You’ve been admitted from position <b className="num">#{s.pos.toLocaleString('en-IN')}</b>. Choose your tickets — you’ll hold them for a few minutes while you pay.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: '1.2rem' }}><Link className="btn pri lg" href={`/drop/${id}/tickets`}>Choose tickets</Link></div>
        <p className="mut2" style={{ fontSize: '.8rem', marginTop: '.8rem' }}>Admission window: {Math.max(0, q.admitDeadline - q.now)}s remaining (simulated clock)</p></div>
    : s.st === 'ALLOCATING' && s.hold ? <div className="cx-safe"><h1>You have seats on hold</h1><p className="mut">Complete payment before the hold expires.</p><div className="row" style={{ justifyContent: 'center', marginTop: '1rem' }}><Link className="btn pri lg" href={`/drop/${id}/payment?hold=${s.hold}`}>Continue to payment</Link></div></div>
    : s.outcome ? <div className="card cx-empty"><h2>{s.outcome === 'SOLD_OUT' ? 'Sold out before your turn' : s.outcome === 'BLOCKED' ? 'Entry could not be accepted' : 'Drop result'}</h2><p className="mut">{outcomeMsg[s.outcome] || 'This drop has finished for your session.'}</p><div className="row" style={{ justifyContent: 'center' }}><Link className="btn pri" href="/events">Browse other events</Link><Link className="btn" href="/how-it-works">How the draw works</Link></div></div>
    : <>
      <div className="cx-safe"><h1>Admission in progress</h1><p className="mut" style={{ maxWidth: 520, margin: '0 auto' }}>The draw is done. Your place was fixed by a verifiable random shuffle — not by when you arrived.</p></div>
      <div className="cx-pos" aria-live="polite"><span className="eyebrow">Your position</span><b className="num">#{s.pos.toLocaleString('en-IN')}</b><span className="mut">of {pool.toLocaleString('en-IN')} entries</span></div>
      <div className="bar" role="progressbar" aria-label="Admission progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: pct + '%' }} /></div>
      <div className="grid g3" style={{ margin: '1rem 0' }}>
        <div className="card cx-stat"><span className="eyebrow">Ahead of you</span><b className="num">{q.ahead.toLocaleString('en-IN')}</b></div>
        <div className="card cx-stat"><span className="eyebrow">Est. wait (demo-compressed)</span><b className="num">{q.phase === 'PAUSED' ? 'paused' : wait + 's'}</b></div>
        <div className="card cx-stat"><span className="eyebrow">Seats remaining</span><b className="num">{q.remaining}</b></div>
      </div>
      {ls?.challenge && <div className="cx-note warn" role="status" data-testid="policy-challenge"><Ic n="shield" s={16} /> <span><b>Quick check needed.</b> Before your turn we need a short automatic check from your browser (it runs a small computation — no personal data, no puzzle). Your place in the queue is kept.
        <span className="row" style={{ marginTop: '.5rem' }}><button className="btn pri" disabled={!!solving} onClick={async () => { setChErr(''); setSolving('Running check…'); const r = await rt!.liveFor(id)!.solveChallenge(); setSolving(''); if (!r.ok) setChErr('The check did not pass (' + r.status.toLowerCase().replace(/_/g, ' ') + '). Please try again.') }}>{solving || 'Run the check'}</button></span>{chErr && <span className="bad" style={{ display: 'block', marginTop: '.4rem' }}>{chErr}</span>}</span></div>}
      {ls && ls.admitStatus === 'THROTTLED' && <div className="cx-note" role="status" data-testid="policy-throttle"><Ic n="info" s={16} /> Admission for this session is being paced. We’ll retry automatically{ls.retryAfter ? ` every ${ls.retryAfter}s` : ''} — your place is safe.</div>}
      {ls && ls.admitStatus === 'ADMISSION_CAPACITY_FULL' && <div className="cx-note" role="status"><Ic n="info" s={16} /> Admission is at capacity right now. You’ll be admitted automatically as soon as a slot frees up.</div>}
      {q.phase === 'PAUSED' && <div className="cx-note warn"><Ic n="pause" s={16} /> Admission is paused by the organizer. Your place is safe.</div>}
      {q.phase === 'RANDOMIZED' && <div className="cx-note"><Ic n="info" s={16} /> The order is fixed. Admission starts in a moment.</div>}
    </>}
    {rt!.isLive && <p className="mut2" style={{ fontSize: '.74rem', marginTop: '1rem' }} data-testid="live-badge">Live mode · order, admission and inventory are decided by the server.</p>}
    {st.sess.guided && !booking && <p className="mut2" style={{ fontSize: '.78rem', marginTop: '1rem' }}>Demo note: this attendee joined through the <b>Guided walkthrough lane</b>, which places them early. The lane is declared in the public proof bundle.</p>}
  </DropFrame>
}
