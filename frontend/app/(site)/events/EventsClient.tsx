'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { searchEvents, CATEGORIES, CITIES } from '@/lib/data/events'
import { useCity, ALL_CITIES } from '@/hooks/useCity'
import EventCard from '@/components/EventCard'
export default function EventsClient() {
  const sp = useSearchParams(), router = useRouter(), [city, setCity] = useCity(), q = sp.get('q') || '', cat = sp.get('category') || 'All', status = sp.get('status') || 'All'
  const [sort, setSort] = useState('relevance'), [maxP, setMaxP] = useState(0)
  const set = (k: string, v: string) => { const p = new URLSearchParams(sp.toString()); if (!v || v === 'All') p.delete(k); else p.set(k, v); router.replace('/events' + (p.toString() ? '?' + p : '')) }
  const hits = useMemo(() => {
    const r = searchEvents(q, { city: city === ALL_CITIES ? undefined : city, category: cat, maxPrice: maxP || undefined, status })
    if (sort === 'date') r.sort((a, b) => a.event.date.localeCompare(b.event.date)); if (sort === 'price') r.sort((a, b) => a.event.startingPrice - b.event.startingPrice)
    return r
  }, [q, city, cat, maxP, status, sort])
  const filtered = q || cat !== 'All' || status !== 'All' || maxP > 0
  return <div className="cx-w cx-sec">
    <h1 style={{ fontSize: '1.9rem' }}>{q ? <>Results for “{q}”</> : cat !== 'All' ? cat : 'All events'}{city !== ALL_CITIES && <span className="mut"> in {city}</span>}</h1>
    <div className="cx-filters" role="group" aria-label="Filters">
      <div className="cx-chips" role="group" aria-label="Category">{['All', ...CATEGORIES].map(c => <button key={c} className={'chip' + (cat === c ? ' on' : '')} aria-pressed={cat === c} onClick={() => set('category', c)}>{c}</button>)}</div>
      <div className="row">
        <label className="f">City<select value={city} onChange={e => setCity(e.target.value)}><option>{ALL_CITIES}</option>{CITIES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="f">Availability<select value={status} onChange={e => set('status', e.target.value)}><option value="All">All events</option><option value="LIVE">Fair Drop live</option><option value="UPCOMING">Fair Drop upcoming</option><option value="ON_SALE">On sale</option></select></label>
        <label className="f">Max price<select value={maxP} onChange={e => setMaxP(+e.target.value)}><option value={0}>Any</option><option value={500}>Up to ₹500</option><option value={1500}>Up to ₹1,500</option><option value={5000}>Up to ₹5,000</option></select></label>
        <label className="f">Sort<select value={sort} onChange={e => setSort(e.target.value)}><option value="relevance">Relevance</option><option value="date">Date</option><option value="price">Price</option></select></label>
        {filtered && <button className="btn sm ghost" style={{ alignSelf: 'end' }} onClick={() => { setMaxP(0); router.replace('/events') }}>Clear filters</button>}
      </div>
    </div>
    <p className="mut" aria-live="polite" style={{ margin: '.8rem 0' }}>{hits.length} event{hits.length === 1 ? '' : 's'} found</p>
    {hits.length === 0 ? <div className="card cx-empty"><h3>Nothing matches yet</h3><p className="mut">Try a broader search, another city, or clear the filters.</p><div className="row" style={{ justifyContent: 'center' }}><button className="btn pri" onClick={() => { setCity(ALL_CITIES); setMaxP(0); router.replace('/events') }}>Show all events</button><Link className="btn" href="/">Back to home</Link></div></div>
      : <div className="cx-grid">{hits.map(h => <EventCard key={h.event.id} e={h.event} />)}</div>}
  </div>
}
