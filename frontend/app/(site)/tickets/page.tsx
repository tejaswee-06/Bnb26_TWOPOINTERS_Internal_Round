'use client'
import Link from 'next/link'
import { useRT } from '@/lib/store'
import { eventById, fmtDate, fmtTime, inr } from '@/lib/data/events'
import { openSignIn } from '@/lib/ui'
import Poster from '@/components/Poster'
import { Waiting } from '@/components/DropFrame'
export default function MyTickets() {
  const rt = useRT()
  if (!rt) return <Waiting />
  const live = [...rt.parts.values()].filter(p => { const s = rt.status(p.eventId); return s && !s.sess.outcome && s.sim.phase !== 'ENDED' })
  return <div className="cx-w cx-sec">
    <h1 style={{ fontSize: '1.9rem' }}>My Tickets</h1>
    {!rt.user && <div className="cx-note"><span>You’re browsing as a guest. <button className="btn sm" onClick={() => openSignIn()}>Sign in</button> to keep bookings tied to your name.</span></div>}
    {live.length > 0 && <section style={{ margin: '1.2rem 0' }}><h2 style={{ fontSize: '1.15rem', marginBottom: '.6rem' }}>In progress</h2>{live.map(p => { const e = eventById(p.eventId)!; return <div key={p.eventId} className="card row sb"><span><b>{e.title}</b><br /><span className="mut2" style={{ fontSize: '.82rem' }}>Fair Drop session {p.sid}</span></span><Link className="btn pri sm" href={`/drop/${p.eventId}/queue`}>Continue</Link></div> })}</section>}
    <section style={{ marginTop: '1.2rem' }}><h2 style={{ fontSize: '1.15rem', marginBottom: '.6rem' }}>Bookings</h2>
      {rt.bookings.length === 0 ? <div className="card cx-empty"><h3>No tickets yet</h3><p className="mut">When you book an event or win a Fair Drop, your tickets show up here.</p><div className="row" style={{ justifyContent: 'center' }}><Link className="btn pri" href="/events">Browse events</Link><Link className="btn" href="/events?status=LIVE">Live Fair Drops</Link></div></div>
        : <div className="col">{rt.bookings.map(b => { const e = eventById(b.eventId); return <div key={b.id} className="card cx-bk">{e && <Poster e={e} size="sm" showTitle={false} />}<div className="grow"><b>{b.eventTitle}</b><br /><span className="mut" style={{ fontSize: '.85rem' }}>{e ? fmtDate(e.date, true) + ' · ' + fmtTime(e.time) : ''}</span><br /><span className="mut2" style={{ fontSize: '.8rem' }}>{b.typeName} × {b.qty} · {inr(b.total)} · {b.id}</span></div>
          <div className="col" style={{ gap: '.4rem' }}><Link className="btn sm pri" href={`/confirmation/${b.id}`}>View ticket</Link>{b.mode === 'DROP' && <Link className="btn sm" href={`/verify/${b.id}`}>Verify allocation</Link>}</div></div> })}</div>}
    </section>
  </div>
}
