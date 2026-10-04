'use client'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { eventById, fmtDate, fmtTime, inr, EVENTS } from '@/lib/data/events'
import { useRT } from '@/lib/store'
import { toast } from '@/lib/toast'
import { openSignIn } from '@/lib/ui'
import Poster from '@/components/Poster'
import EventCard, { StatusBadge } from '@/components/EventCard'
import Ic from '@/components/Icon'
export default function EventPage() {
  const { id } = useParams<{ id: string }>(), e = eventById(id), rt = useRT(), router = useRouter()
  const [typeIdx, setTypeIdx] = useState(0), [qty, setQty] = useState(1), [remind, setRemind] = useState(false), [busy, setBusy] = useState(false)
  useEffect(() => { try { setRemind(JSON.parse(localStorage.getItem('fd-remind') || '[]').includes(id)) } catch { /* ignore */ } }, [id])
  useEffect(() => { if (rt && e?.drop) rt.ensureDrop(e.id) }, [rt, e])
  if (!e) return <div className="cx-w cx-sec"><div className="card cx-empty"><h1 style={{ fontSize: '1.5rem' }}>Event not found</h1><p className="mut">This event doesn’t exist or has been removed.</p><Link className="btn pri" href="/events">Browse events</Link></div></div>
  const stock = rt ? rt.stock(e) : e.ticketTypes.map((t, i) => ({ ...t, available: t.cap - (e.presold[i] || 0), held: 0, confirmed: 0 }))
  const sim = rt?.drops.get(e.id), phase = sim?.phase, ended = phase === 'ENDED' || (rt ? stock.every(s => s.available === 0) : false)
  const isDrop = !!e.drop, part = rt?.participation(e.id), booked = rt?.bookings.find(b => b.eventId === e.id)
  const toggleRemind = () => { const next = !remind; setRemind(next); try { const l: string[] = JSON.parse(localStorage.getItem('fd-remind') || '[]'); localStorage.setItem('fd-remind', JSON.stringify(next ? [...new Set([...l, id])] : l.filter(x => x !== id))) } catch { /* ignore */ } toast(next ? 'We’ll remind you when this drop opens.' : 'Reminder removed.', 'ok') }
  const buy = () => {
    if (!rt) return; if (!rt.user) return openSignIn(`/events/${id}`)
    setBusy(true); const r = rt.directHold(e.id, typeIdx, qty); setBusy(false)
    if (!r.ok) return toast(r.reason === 'SOLD_OUT' ? 'Sorry — that ticket type just sold out.' : 'Not enough tickets left for that quantity.', 'bad')
    router.push(`/drop/${e.id}/payment?hold=${r.hold.id}`)
  }
  const sel = stock[typeIdx], max = Math.min(6, sel?.available ?? 0)
  const similar = EVENTS.filter(x => x.id !== e.id && (x.category === e.category || x.city === e.city)).slice(0, 4)
  return <div className="cx-w cx-sec">
    <nav aria-label="Breadcrumb" className="mut2" style={{ fontSize: '.8rem', marginBottom: '1rem' }}><Link href="/">Home</Link> / <Link href={`/events?category=${encodeURIComponent(e.category)}`}>{e.category}</Link> / {e.title}</nav>
    <div className="cx-det">
      <div className="cx-det-l">
        <div className="cx-det-hero"><Poster e={e} size="lg" /><div className="col">
          <div className="row"><StatusBadge e={e} /><span className="pill">{e.category}</span>{e.tags.slice(0, 2).map(t => <span key={t} className="pill">{t}</span>)}</div>
          <h1 style={{ fontSize: 'clamp(1.7rem,4vw,2.5rem)' }}>{e.title}</h1>
          <div className="col mut"><span className="row"><Ic n="cal" s={16} /> {fmtDate(e.date, true)} · {fmtTime(e.time)} · {e.duration}</span><span className="row"><Ic n="pin" s={16} /> {e.venue}, {e.city}</span><span className="row"><Ic n="info" s={16} /> {e.language} · {e.ageLimit} · by {e.organizer}</span></div>
        </div></div>
        <section className="cx-block"><h2>About</h2><p className="mut">{e.description}</p></section>
        {e.artists.length > 0 && <section className="cx-block"><h2>{e.category === 'Seminars' || e.category === 'Activities' ? 'Speakers & mentors' : e.category === 'Movies' || e.category === 'Theatre' ? 'Cast' : 'Line-up'}</h2><div className="row">{e.artists.map(a => <span key={a} className="pill" style={{ fontSize: '.85rem', padding: '.3rem .8rem' }}>{a}</span>)}</div></section>}
        <section className="cx-block"><h2>Ticket types</h2><div className="tscroll"><table className="t"><thead><tr><th>Type</th><th>Includes</th><th>Price</th><th>Status</th></tr></thead><tbody>
          {stock.map(s => <tr key={s.id}><td><b>{s.name}</b></td><td className="mut">{s.perks}</td><td>{inr(s.price)}</td><td>{isDrop ? <span className="pill">Allocated via Fair Drop</span> : s.available === 0 ? <span className="pill bad">Sold out</span> : s.available < 30 ? <span className="pill warn">Few left</span> : <span className="pill ok">Available</span>}</td></tr>)}</tbody></table></div></section>
        {isDrop && <section className="cx-block cx-fair"><h2><Ic n="shield" s={20} /> How this Fair Drop works</h2>
          <p className="mut">Only {e.totalTickets} seats and up to {e.drop!.participants.toLocaleString('en-IN')} people. Instead of a click-speed race, everyone who joins the pre-queue window is entered into a verifiable random draw. You can check the result afterwards — no trust required.</p>
          <Link href="/how-it-works" className="acc">Read the full explanation →</Link></section>}
      </div>
      <aside className="cx-det-r" aria-label="Booking">
        <div className="card cx-book">
          <div className="row sb"><span className="eyebrow">{isDrop ? 'Fair Drop' : 'Book tickets'}</span><b>from {inr(e.startingPrice)}</b></div>
          {booked && <div className="cx-note ok"><Ic n="check" s={16} /> You hold a ticket for this event. <Link href={`/confirmation/${booked.id}`} className="acc">View ticket</Link></div>}
          {isDrop ? <>
            {ended && <><p className="mut">This drop has ended{sim && sim.inv.stats().confirmed >= sim.inv.total ? ' — all seats were allocated.' : '.'}</p><Link className="btn lg" href={`/drop/${e.id}`}>See drop result</Link></>}
            {!ended && e.dropStatus === 'UPCOMING' && phase === 'PREPARED' && <><p className="mut">Opens {e.drop!.opensIn || 'soon'}. Set a reminder — joining early gives no advantage anyway.</p><button className="btn lg pri" onClick={toggleRemind}>{remind ? 'Reminder set ✓' : 'Remind me'}</button></>}
            {!ended && (e.dropStatus === 'LIVE' || (phase && phase !== 'PREPARED')) && <>
              <p className="mut">{part ? 'You’re in this drop.' : 'Join the pre-queue. Everyone who joins during the window has an equal chance.'}</p>
              <Link className="btn lg pri" href={part ? `/drop/${e.id}/queue` : `/drop/${e.id}`}>{part ? 'Continue to my queue' : 'Join Fair Drop'}</Link></>}
          </> : <>
            <div role="radiogroup" aria-label="Ticket type" className="col">{stock.map((s, i) => <label key={s.id} className={'cx-opt' + (typeIdx === i ? ' on' : '') + (s.available === 0 ? ' dis' : '')}><input type="radio" name="tt" checked={typeIdx === i} disabled={s.available === 0} onChange={() => { setTypeIdx(i); setQty(1) }} /><span className="grow"><b>{s.name}</b><br /><span className="mut2" style={{ fontSize: '.78rem' }}>{s.perks}</span></span><b>{inr(s.price)}</b></label>)}</div>
            <div className="row sb"><span>Quantity</span><div className="row"><button className="ib" aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1}>−</button><b className="num" aria-live="polite">{qty}</b><button className="ib" aria-label="Increase quantity" onClick={() => setQty(Math.min(max, qty + 1))} disabled={qty >= max}>+</button></div></div>
            <div className="row sb"><span className="mut">Subtotal</span><b>{inr((sel?.price ?? 0) * qty)}</b></div>
            <button className="btn lg pri" onClick={buy} disabled={busy || !sel || sel.available === 0}>{sel && sel.available === 0 ? 'Sold out' : rt?.user ? 'Book now' : 'Sign in to book'}</button>
            <p className="mut2" style={{ fontSize: '.75rem' }}>Tickets are held for 3 minutes while you pay. Demo payment — no money moves.</p></>}
        </div>
      </aside>
    </div>
    {similar.length > 0 && <section style={{ marginTop: '2.5rem' }}><h2 style={{ marginBottom: '.9rem' }}>You may also like</h2><div className="cx-grid">{similar.map(s => <EventCard key={s.id} e={s} />)}</div></section>}
  </div>
}
