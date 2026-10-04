'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useRT } from '@/lib/store'
import { eventById, fmtDate, fmtTime, inr } from '@/lib/data/events'
import { Waiting } from '@/components/DropFrame'
import QrArt from '@/components/QrArt'
import Poster from '@/components/Poster'
import Ic from '@/components/Icon'
export default function Confirmation() {
  const { id } = useParams<{ id: string }>(), rt = useRT()
  if (!rt) return <Waiting />
  const b = rt.booking(id), e = b ? eventById(b.eventId) : null
  if (!b || !e) return <div className="cx-w cx-sec"><div className="card cx-empty"><h1 style={{ fontSize: '1.5rem' }}>Booking not found</h1><p className="mut">We couldn’t find this booking in this browser. Bookings are stored locally in this demo.</p><div className="row" style={{ justifyContent: 'center' }}><Link className="btn pri" href="/tickets">My Tickets</Link><Link className="btn" href="/events">Browse events</Link></div></div></div>
  const isDrop = b.mode === 'DROP'
  return <div className="cx-w cx-sec" style={{ maxWidth: 880 }}>
    <div className="cx-safe"><span className="cx-safe-i ok"><Ic n="check" s={34} /></span><h1>Booking confirmed</h1><p className="mut">A confirmation was “sent” to {b.email} (demo — no email is actually sent).</p></div>
    <div className="cx-ticket">
      <div className="cx-ticket-l"><Poster e={e} size="sm" showTitle={false} /><div className="col" style={{ gap: '.3rem' }}>
        <span className="eyebrow">{isDrop ? 'Allocated via Fair Drop' : 'Direct booking'}</span><h2>{e.title}</h2>
        <span className="mut">{fmtDate(e.date, true)} · {fmtTime(e.time)}</span><span className="mut">{e.venue}, {e.city}</span>
        <div className="row" style={{ marginTop: '.5rem' }}><span className="pill acc">{b.typeName} × {b.qty}</span><span className="pill ok">Total paid {inr(b.total)}</span></div></div></div>
      <div className="cx-ticket-r"><QrArt seed={b.allocationId} /><div className="mono" style={{ fontSize: '.7rem', textAlign: 'center' }}>{b.allocationId}</div></div>
    </div>
    <div className="grid g3" style={{ margin: '1rem 0' }}>
      <div className="card cx-stat"><span className="eyebrow">Booking ID</span><b className="mono" style={{ fontSize: '1.1rem' }}>{b.id}</b></div>
      <div className="card cx-stat"><span className="eyebrow">Allocation ID</span><b className="mono" style={{ fontSize: '1.1rem' }}>{b.allocationId}</b></div>
      <div className="card cx-stat"><span className="eyebrow">Payment</span><b style={{ fontSize: '1.1rem' }}>{b.method}</b></div>
    </div>
    <div className="row" style={{ justifyContent: 'center' }}>
      {isDrop && <Link className="btn pri lg" href={`/verify/${b.id}`}><Ic n="shield" s={16} /> VERIFY ALLOCATION</Link>}
      <button className="btn lg" onClick={() => window.print()}>Print ticket</button><Link className="btn lg" href="/tickets">My Tickets</Link><Link className="btn lg ghost" href="/events">Keep browsing</Link>
    </div>
    <p className="mut2" style={{ fontSize: '.78rem', textAlign: 'center', marginTop: '1rem' }}>{isDrop ? 'The code above is a decorative QR-style visual; verification uses the draw proof, not the image.' : 'Direct booking: no draw was needed for this event.'}</p>
  </div>
}
