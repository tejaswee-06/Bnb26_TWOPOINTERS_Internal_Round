'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useRT } from '@/lib/store'
import { EVENTS } from '@/lib/data/events'
import { LOGO } from '@/components/SiteNav'
import Ic from '@/components/Icon'
import { PHASE_LABEL } from './phase'

export const NAV: { label: string; items: [string, string, string][] }[] = [
  { label: 'Overview', items: [['Overview', '/admin', 'Is the drop healthy right now?'], ['Drop Control', '/admin/drop', 'Operate the drop lifecycle'], ['Simulation', '/admin/simulation', 'Integration slot for the simulation page']] },
  { label: 'Traffic', items: [['Live Traffic', '/admin/traffic', 'Who is hitting the platform?'], ['Queue', '/admin/traffic/queue', 'How deep is the queue?'], ['Load Lab', '/admin/traffic/load', 'Does the platform hold under load?']] },
  { label: 'Intelligence', items: [['Detection', '/admin/intelligence', 'What does the detector see?'], ['Campaigns', '/admin/campaigns', 'Who is moving together?'], ['Attack Lab', '/admin/attacks', 'What happens under attack?'], ['Risk Signals', '/admin/intelligence/signals', 'Which signals drive risk?']] },
  { label: 'Admission', items: [['Pre-Queue', '/admin/admission/prequeue', 'Who is eligible?'], ['Randomization', '/admin/admission/randomization', 'How was the order fixed?'], ['Admission', '/admin/admission', 'Who is being let in?'], ['Allocations', '/admin/allocations', 'Where did every seat go?']] },
  { label: 'Fairness', items: [['Fairness Lab', '/admin/fairness', 'Is the outcome fair under attack?'], ['Allocation Advantage', '/admin/fairness/advantage', 'How much did attackers gain?'], ['Verification', '/admin/verification', 'Can anyone re-check the result?']] },
  { label: 'Operations', items: [['Incidents', '/admin/incidents', 'What went wrong and what was done?'], ['System Health', '/admin/system', 'Is the platform itself healthy?'], ['Reports', '/admin/reports', 'What happened, in writing?']] },
]
const active = (path: string, h: string) => (h === '/admin' ? path === '/admin' : path === h || path.startsWith(h + '/'))

export default function AdminNav() {
  const rt = useRT(), path = usePathname(), router = useRouter(), [open, setOpen] = useState<string | null>(null), [mob, setMob] = useState(false), ref = useRef<HTMLElement>(null)
  useEffect(() => { setOpen(null); setMob(false) }, [path])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null), c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null) }
    addEventListener('keydown', k); addEventListener('mousedown', c); return () => { removeEventListener('keydown', k); removeEventListener('mousedown', c) }
  }, [])
  const sim = rt?.drops.get(rt.currentDrop), phase = sim?.phase ?? 'PREPARED', live = !!sim && phase !== 'PREPARED' && phase !== 'ENDED' && !rt?.paused
  const logout = () => { void rt?.liveAdminLogout(); rt?.setAdmin(false); router.push('/admin/login') }
  const drops = EVENTS.filter(e => e.drop)
  return <header className="adm-top" ref={ref}>
    <div className="adm-bar1">
      <Link href="/admin" className="adm-brand" aria-label="Fair Drop Operations home">{LOGO}<span className="eyebrow">Operations</span></Link>
      <button className="ib adm-burger" aria-label="Toggle navigation" aria-expanded={mob} onClick={() => setMob(!mob)}><Ic n={mob ? 'x' : 'menu'} s={18} /></button>
      <nav className={'adm-nav' + (mob ? ' open' : '')} aria-label="Admin navigation">
        {NAV.map(g => { const on = g.items.some(i => active(path, i[1])); return <div key={g.label} className="adm-dd">
          <button aria-haspopup="true" aria-expanded={open === g.label} className={on ? 'on' : ''} onClick={() => setOpen(open === g.label ? null : g.label)}>{g.label} <Ic n="down" s={12} /></button>
          {open === g.label && <div className="adm-menu" role="menu">{g.items.map(([l, h, d]) => <Link key={h} href={h} role="menuitem" aria-current={active(path, h) && (h !== '/admin' || path === '/admin') ? 'page' : undefined}><b>{l}</b><span className="mut2">{d}</span></Link>)}</div>}
        </div> })}
      </nav>
    </div>
    <div className="adm-bar2">
      <div className="adm-ctx">
        <label className="sr" htmlFor="adm-drop">Current drop</label>
        <select id="adm-drop" value={rt?.currentDrop ?? ''} onChange={e => rt?.setCurrent(e.target.value)} title="Current drop">{drops.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select>
        {rt?.isLive && <span className="pill ok" title="Customer journey, admission, inventory and policy decisions run against the Person-1 backend" data-testid="mode-live">LIVE BACKEND MODE</span>}
        <span className={'pill ' + (live ? 'ok' : 'warn')} title={rt?.paused ? 'Simulator clock paused' : 'Simulator state'}><i className={'dot' + (live ? ' live' : '')} /> {rt?.paused ? 'CLOCK PAUSED' : live ? (rt?.isLive ? 'LIVE · SIMULATOR (sandbox)' : 'LIVE · SIMULATION') : (rt?.isLive ? 'SIMULATOR (sandbox)' : 'SIMULATION')} · {PHASE_LABEL[phase] ?? phase}</span>
        <span className="adm-id mut2" title="Signed in (demo session)"><Ic n="user" s={14} /> admin@fairdrop.demo</span>
        <button className="btn sm" onClick={logout}><Ic n="logout" s={14} /> Log out</button>
      </div>
    </div>
  </header>
}
