'use client'
import Link from 'next/link'
import { FDEvent, fmtDate, fmtTime, inr } from '@/lib/data/events'
import { useRT } from '@/lib/store'
import Poster from './Poster'
export function StatusBadge({ e }: { e: FDEvent }) {
  const rt = useRT(); const sim = rt?.drops.get(e.id)
  if (e.dropStatus === 'ON_SALE') return <span className="pill">On sale</span>
  if (sim?.phase === 'ENDED') return <span className="pill">Drop ended</span>
  if (e.dropStatus === 'LIVE') return <span className="pill ok"><span className="dot live" /> Fair Drop live</span>
  return <span className="pill acc">Drop {e.drop?.opensIn ? 'opens ' + e.drop.opensIn : 'upcoming'}</span>
}
export default function EventCard({ e, rank }: { e: FDEvent; rank?: number }) {
  const rt = useRT(), av = rt ? rt.availability(e) : { available: e.availableTickets, total: e.totalTickets }
  const low = av.available / Math.max(1, av.total) < 0.15
  return <Link href={`/events/${e.id}`} className="ecard" aria-label={`${e.title}, ${e.category}, ${e.city}, from ${inr(e.startingPrice)}`}>
    <div className="ecard-p"><Poster e={e} size="md" showTitle={false} />{rank && <span className="rank">#{rank}</span>}<div className="ecard-b"><StatusBadge e={e} /></div></div>
    <div className="ecard-t"><h3>{e.title}</h3><p className="mut">{e.category} · {e.venue.split(',')[0]}, {e.city}</p>
      <p className="mut2">{fmtDate(e.date)} · {fmtTime(e.time)}</p>
      <div className="row sb"><b>from {inr(e.startingPrice)}</b>{e.dropStatus !== 'ON_SALE' ? <span className="pill">Limited · {av.total} seats</span> : <span className={low ? 'warn' : 'mut2'} style={{ fontSize: '.78rem' }}>{low ? 'Selling fast' : av.available.toLocaleString('en-IN') + ' left'}</span>}</div></div>
  </Link>
}
