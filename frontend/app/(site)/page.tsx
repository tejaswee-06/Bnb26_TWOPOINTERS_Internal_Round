'use client'
import Link from 'next/link'
import { useMemo } from 'react'
import { EVENTS, DROP_EVENTS, CATEGORIES, eventById, fmtDate, fmtTime, inr } from '@/lib/data/events'
import { useCity, ALL_CITIES } from '@/hooks/useCity'
import { useRT } from '@/lib/store'
import { openSignIn } from '@/lib/ui'
import EventCard, { StatusBadge } from '@/components/EventCard'
import Poster from '@/components/Poster'
import Rail from '@/components/Rail'
import SearchBox from '@/components/SearchBox'
import Ic from '@/components/Icon'
const CAT_ICON: Record<string, string> = { Movies: 'film', Concerts: 'spark', Sports: 'ball', 'Stand-up Comedy': 'mic', Seminars: 'book', Theatre: 'mask', Activities: 'target' }
export default function Home() {
  const rt = useRT(), [city] = useCity(), hero = eventById('ai-frontier-mumbai-2026')!
  const inCity = useMemo(() => EVENTS.filter(e => city === ALL_CITIES || e.city === city), [city])
  const trending = useMemo(() => [...inCity].sort((a, b) => (a.dropStatus === 'ON_SALE' ? 1 : 0) - (b.dropStatus === 'ON_SALE' ? 1 : 0) || a.availableTickets / a.totalTickets - b.availableTickets / b.totalTickets).slice(0, 8), [inCity])
  const upcoming = useMemo(() => [...inCity].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8), [inCity])
  const rec = useMemo(() => {
    const cats = new Set((rt?.bookings ?? []).map(b => eventById(b.eventId)?.category)); const base = inCity.filter(e => !(rt?.bookings ?? []).some(b => b.eventId === e.id))
    return [...base].sort((a, b) => Number(cats.has(b.category)) - Number(cats.has(a.category)) || a.date.localeCompare(b.date)).slice(0, 4)
  }, [inCity, rt?.bookings])
  const av = rt ? rt.availability(hero) : { available: hero.availableTickets, total: hero.totalTickets }
  const phase = rt?.drops.get(hero.id)?.phase
  return <>
    <section className="cx-hero"><div className="cx-w cx-hero-g">
      <div className="cx-hero-t">
        <span className="pill acc"><Ic n="shield" s={13} /> Fair access · verifiable draw</span>
        <h1>Real fans get real seats.</h1>
        <p className="mut" style={{ fontSize: '1.08rem', maxWidth: 560 }}>When 50,000 people want 500 seats, speed shouldn’t win. FAIR DROP admits people through a verified pre-queue and a randomized, provable draw — so scripts and scalpers don’t beat you.</p>
        <div style={{ maxWidth: 620, marginTop: '.4rem' }}><SearchBox big /></div>
        <div className="row" style={{ marginTop: '.3rem' }}>
          <Link className="btn pri lg" href={`/drop/${hero.id}`}>Join the Fair Drop</Link><Link className="btn lg" href="/how-it-works">How it works</Link>
          {!rt?.user && <button className="btn lg ghost" onClick={() => openSignIn()}>Sign in</button>}
        </div>
      </div>
      <Link href={`/events/${hero.id}`} className="cx-feat" aria-label={`Featured: ${hero.title}`}>
        <Poster e={hero} size="lg" />
        <div className="cx-feat-b"><StatusBadge e={hero} />
          <h3>{hero.title}</h3><p className="mut">{fmtDate(hero.date, true)} · {fmtTime(hero.time)} · {hero.venue.split(',')[0]}</p>
          <div className="row sb"><b>from {inr(hero.startingPrice)}</b><span className="mut2" style={{ fontSize: '.8rem' }}>{phase === 'ENDED' ? 'Drop ended' : `${av.total} seats · allocated fairly`}</span></div></div>
      </Link>
    </div></section>

    <Rail id="drops" title="High-demand Fair Drops" sub="Limited seats, huge demand. Join the pre-queue — arrival time doesn’t decide the winners." href="/events?status=LIVE">
      <div className="cx-rail">{DROP_EVENTS.filter(e => city === ALL_CITIES || e.city === city).map(e => <EventCard key={e.id} e={e} />)}{!DROP_EVENTS.some(e => city === ALL_CITIES || e.city === city) && <p className="mut">No Fair Drops in {city} right now. <Link href="/events" className="acc">Browse all events</Link></p>}</div>
    </Rail>
    <Rail id="trend" title={`Trending${city === ALL_CITIES ? '' : ' in ' + city}`} href="/events"><div className="cx-grid">{trending.map((e, i) => <EventCard key={e.id} e={e} rank={i < 3 ? i + 1 : undefined} />)}</div></Rail>
    <Rail id="cats" title="Browse by category">
      <div className="cx-tiles">{CATEGORIES.map(c => <Link key={c} className="cx-tile" href={`/events?category=${encodeURIComponent(c)}`}><Ic n={CAT_ICON[c] || 'star'} s={22} /><b>{c}</b><span className="mut2">{EVENTS.filter(e => e.category === c && (city === ALL_CITIES || e.city === city)).length} events</span></Link>)}</div>
    </Rail>
    <Rail id="up" title="Upcoming" sub="Soonest first" href="/events"><div className="cx-grid">{upcoming.map(e => <EventCard key={e.id} e={e} />)}</div></Rail>
    <section className="cx-w cx-sec"><div className="cx-how">
      {[['1', 'Join the pre-queue', 'Verify once. Everyone who joins during the window is treated equally.'], ['2', 'Randomized admission', 'A published, verifiable draw sets the order — not who clicks fastest.'], ['3', 'Choose & pay', 'When you’re admitted, you get a time-limited hold on your seats.'], ['4', 'Verify your result', 'Anyone can check the draw was fair. Including you.']].map(([n, t, d]) => <div key={n} className="cx-how-i"><span className="cx-n">{n}</span><b>{t}</b><span className="mut" style={{ fontSize: '.88rem' }}>{d}</span></div>)}
    </div></section>
    {rec.length > 0 && <Rail id="rec" title="Recommended for you" sub={rt?.bookings.length ? 'Based on your bookings' : 'Popular picks'}><div className="cx-grid">{rec.map(e => <EventCard key={e.id} e={e} />)}</div></Rail>}
  </>
}
