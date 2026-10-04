'use client'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { suggest, DROP_EVENTS, Suggestion } from '@/lib/data/events'
import { useCity, ALL_CITIES } from '@/hooks/useCity'
import Ic from './Icon'
/** Search with autocomplete. Combobox pattern: arrow keys move, Enter opens the highlighted suggestion or runs a full search, Esc closes. */
export default function SearchBox({ big = false, autoFocus = false }: { big?: boolean; autoFocus?: boolean }) {
  const router = useRouter(), id = useId(), [q, setQ] = useState(''), [open, setOpen] = useState(false), [ai, setAi] = useState(-1), box = useRef<HTMLDivElement>(null), [city] = useCity()
  const cityArg = city === ALL_CITIES ? undefined : city
  const items: Suggestion[] = useMemo(() => q.trim() ? suggest(q, cityArg) : DROP_EVENTS.slice(0, 4).map(e => ({ kind: 'event' as const, label: e.title, sub: `Trending Fair Drop · ${e.city}`, href: `/events/${e.id}` })), [q, cityArg])
  useEffect(() => { const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  const go = (href: string) => { setOpen(false); setQ(''); router.push(href) }
  const submit = () => { if (ai >= 0 && items[ai]) go(items[ai].href); else if (q.trim()) go('/events?q=' + encodeURIComponent(q.trim())); else go('/events') }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAi(i => Math.min(items.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAi(i => Math.max(-1, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); submit() }
    else if (e.key === 'Escape') setOpen(false)
  }
  return <div className={'sbox' + (big ? ' big' : '')} ref={box} role="search">
    <label htmlFor={id} className="sr">Search events, artists, venues</label>
    <span className="sbox-i"><Ic n="search" s={18} /></span>
    <input id={id} type="search" role="combobox" aria-expanded={open} aria-controls={id + '-l'} aria-autocomplete="list" aria-activedescendant={ai >= 0 ? `${id}-o${ai}` : undefined} autoComplete="off" autoFocus={autoFocus}
      placeholder="Search for events, movies, comedy, concerts, venues…" value={q} onChange={e => { setQ(e.target.value); setAi(-1); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={onKey} />
    <button type="button" className="btn pri sm sbox-go" onClick={submit} aria-label="Search">Search</button>
    {open && <ul className="sbox-l" id={id + '-l'} role="listbox" aria-label="Suggestions">
      {!q.trim() && <li className="sbox-h" role="presentation">Trending now</li>}
      {items.length === 0 && <li className="sbox-e" role="presentation">No matches for “{q}”. Try a category such as “comedy”, or a venue.</li>}
      {items.map((s, i) => <li key={s.href + s.label} id={`${id}-o${i}`} role="option" aria-selected={i === ai} className={i === ai ? 'on' : ''} onMouseEnter={() => setAi(i)} onMouseDown={e => { e.preventDefault(); go(s.href) }}>
        <span className="pill">{s.kind}</span><span className="grow"><b>{s.label}</b><br /><span className="mut2" style={{ fontSize: '.76rem' }}>{s.sub}</span></span></li>)}
      {q.trim() && <li role="option" aria-selected="false" className="sbox-all" onMouseDown={e => { e.preventDefault(); go('/events?q=' + encodeURIComponent(q.trim())) }}>See all results for “{q.trim()}”</li>}
    </ul>}
  </div>
}
