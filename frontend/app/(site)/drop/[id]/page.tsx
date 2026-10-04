'use client'
import Link from 'next/link'
import { useDrop } from '@/hooks/useDrop'
import DropFrame, { Waiting, NotFound } from '@/components/DropFrame'
import { inr } from '@/lib/data/events'
import { toast } from '@/lib/toast'
import Ic from '@/components/Icon'
export default function DropLanding() {
  const { e, rt, sim, st, id, ready } = useDrop()
  if (!e || !e.drop) return ready || !e ? <NotFound /> : <Waiting />
  if (!ready) return <Waiting />
  const phase = sim?.phase ?? 'PREPARED', part = rt!.participation(id), live = e.dropStatus === 'LIVE'
  const open = phase === 'PRE_QUEUE_OPEN', canOpen = live && phase === 'PREPARED', ended = phase === 'ENDED', closed = !open && !canOpen && !ended && phase !== 'PREPARED'
  const secs = sim && open ? Math.max(0, sim.cfg.preQueueSec - sim.el) : 0, s = sim?.inv.stats()
  return <DropFrame e={e} at={0}>
    <span className="pill acc"><Ic n="shield" s={13} /> Fair Drop</span>
    <h1 style={{ fontSize: 'clamp(1.6rem,4vw,2.3rem)', margin: '.5rem 0' }}>{e.title}</h1>
    <p className="mut" style={{ fontSize: '1.02rem' }}>{e.totalTickets.toLocaleString('en-IN')} seats, up to {e.drop.participants.toLocaleString('en-IN')} people. Tickets from {inr(e.startingPrice)}. Allocation is by a verifiable random draw — not by who clicks fastest.</p>
    <div className="card" style={{ margin: '1.2rem 0' }}>
      {canOpen && <><h3>The pre-queue is ready to open</h3><p className="mut">Join now — the entry window opens the moment the first person arrives.</p></>}
      {open && <><h3 className="ok">Pre-queue is open</h3><p className="mut">Window closes in <b className="num">{secs}s</b>. Joining at the last second is exactly as good as joining first.</p></>}
      {phase === 'PREPARED' && !live && <><h3>Opens {e.drop.opensIn ?? 'soon'}</h3><p className="mut">The pre-queue hasn’t opened. Set a reminder on the event page.</p></>}
      {closed && !part && <><h3>The entry window has closed</h3><p className="mut">This drop is now in randomization and admission. New entries can’t be added — that’s what keeps the draw fair.</p></>}
      {closed && part && <><h3 className="ok">You’re in this drop</h3><p className="mut">Continue to see your place in the queue.</p></>}
      {ended && <><h3>This drop has ended</h3><p className="mut">{s ? `${s.confirmed} of ${s.total} seats were allocated.` : ''} {part ? 'You can still review your result.' : ''}</p></>}
      <div className="row" style={{ marginTop: '.8rem' }}>
        {(canOpen || open) && !part && <Link className="btn pri lg" href={`/drop/${id}/verify`}>Join Fair Drop</Link>}
        {part && <Link className="btn pri lg" href={st && ['RANDOMIZED', 'ADMITTING', 'PAUSED', 'ENDED'].includes(phase) ? `/drop/${id}/admission` : `/drop/${id}/queue`}>Continue to my queue</Link>}
        <Link className="btn lg" href={`/events/${id}`}>Event details</Link>
        {ended && !rt!.isLive && <button className="btn lg ghost" onClick={() => { rt!.resetDrop(id); toast('Demo drop reset — a fresh drop is ready.', 'ok') }}>Replay this drop (demo)</button>}
      </div>
    </div>
    <h2 style={{ fontSize: '1.2rem', marginBottom: '.7rem' }}>What happens next</h2>
    <ol className="cx-list">
      <li><b>Verify</b> — your session is bound to your account and this browser; duplicate sessions are merged into one entry.</li>
      <li><b>Pre-queue</b> — wait safely. Your arrival time inside the window does <u>not</u> affect your chances.</li>
      <li><b>Randomized admission</b> — a published, verifiable shuffle assigns every entry a place.</li>
      <li><b>Choose &amp; pay</b> — when admitted you hold tickets for a few minutes. Limit per person applies.</li>
      <li><b>Verify</b> — check the draw yourself from the confirmation page.</li>
    </ol>
  </DropFrame>
}
