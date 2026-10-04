'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CITIES } from '@/lib/data/events'
import { useCity, ALL_CITIES } from '@/hooks/useCity'
import { useRT } from '@/lib/store'
import { openSignIn } from '@/lib/ui'
import { setPref } from '@/lib/prefs'
import SearchBox from './SearchBox'
import SignInModal from './SignIn'
import { StartDemoButton } from './DemoHUD'
import Ic from './Icon'
export const LOGO = <span className="logo"><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b7bff" /><stop offset="1" stopColor="#2fd3ff" /></linearGradient></defs><path d="M12 2.5s6.5 7 6.5 12a6.5 6.5 0 0 1-13 0c0-5 6.5-12 6.5-12z" fill="url(#lg)" /><path d="M9 14.5l2.2 2.2L15.2 12" stroke="#0a0b12" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg><b>FAIR DROP</b></span>
const CATS: [string, string][] = [['Movies', '/events?category=Movies'], ['Events', '/events'], ['Concerts', '/events?category=Concerts'], ['Sports', '/events?category=Sports'], ['Stand-up Comedy', '/events?category=Stand-up%20Comedy'], ['Seminars', '/events?category=Seminars'], ['Theatre', '/events?category=Theatre'], ['Activities', '/events?category=Activities'], ['Offers', '/offers'], ['My Tickets', '/tickets']]
export default function SiteNav() {
  const rt = useRT(), path = usePathname(), [city, setCity] = useCity(), [menu, setMenu] = useState(false), [um, setUm] = useState(false), [theme, setTheme] = useState('dark')
  useEffect(() => { setTheme(document.documentElement.dataset.theme || 'dark') }, [])
  useEffect(() => { setMenu(false); setUm(false) }, [path])
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false); addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [])
  const toggleTheme = () => { const n = theme === 'dark' ? 'light' : 'dark'; setPref('theme', n); setTheme(n) }
  const isOn = (h: string) => { const [p, qs] = h.split('?'); if (qs) return false; return p === '/' ? path === '/' : p === '/events' ? path === '/events' || path.startsWith('/events/') : path.startsWith(p) }
  const user = rt?.user
  return <header className="cx-nav">
    <div className="cx-nav1">
      <Link href="/" className="cx-logo" aria-label="FAIR DROP home">{LOGO}</Link>
      <div className="cx-search"><SearchBox /></div>
      <label className="sr" htmlFor="city">City</label>
      <div className="cx-city"><Ic n="pin" s={15} /><select id="city" value={city} onChange={e => setCity(e.target.value)}><option>{ALL_CITIES}</option>{CITIES.map(c => <option key={c}>{c}</option>)}</select></div>
      <StartDemoButton className="btn sm cx-demo" />
      {user ? <div className="cx-um"><button className="btn sm" aria-haspopup="menu" aria-expanded={um} onClick={() => setUm(!um)}><Ic n="user" s={15} /> <span className="cx-hide">{user.name.split(' ')[0]}</span></button>
        {um && <div className="cx-pop" role="menu"><div className="mut2" style={{ fontSize: '.75rem', padding: '.3rem .6rem' }}>{user.email}</div><Link href="/tickets" role="menuitem">My Tickets</Link><button role="menuitem" onClick={() => { rt?.signOut(); setUm(false) }}>Sign out</button></div>}</div>
        : <button className="btn sm pri" onClick={() => openSignIn()}>Sign in</button>}
      <button className="ib" aria-label="Toggle light / dark theme" onClick={toggleTheme}><Ic n={theme === 'dark' ? 'sun' : 'moon'} s={17} /></button>
      <button className="ib" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}><Ic n="menu" s={18} /></button>
    </div>
    <nav className="cx-nav2" aria-label="Categories"><div className="cx-nav2i">{CATS.map(([l, h]) => <Link key={l} href={h} aria-current={isOn(h) ? 'page' : undefined}>{l}</Link>)}</div></nav>
    {menu && <div className="scrim cx-drawer-s" onMouseDown={e => { if (e.target === e.currentTarget) setMenu(false) }}>
      <aside className="cx-drawer" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="row sb"><b>Menu</b><button className="ib" aria-label="Close menu" onClick={() => setMenu(false)}><Ic n="x" s={16} /></button></div>
        <Link href="/">Home</Link><Link href="/events">All events</Link><Link href="/events?status=LIVE">Live Fair Drops</Link><Link href="/offers">Offers</Link><Link href="/tickets">My Tickets</Link><Link href="/how-it-works">How Fair Drop works</Link>
        <Link href="/admin/login" className="cx-admin-access"><Ic n="lock" s={15} /> ADMIN ACCESS</Link>
        <hr style={{ border: 0, borderTop: '1px solid var(--bd)', width: '100%' }} />
        <StartDemoButton className="btn pri" label="START DEMO (15-step tour)" />
        <p className="mut2" style={{ fontSize: '.75rem' }}>All events, prices and traffic are fictional / SIMULATED demo data.</p>
      </aside></div>}
    <SignInModal />
  </header>
}
