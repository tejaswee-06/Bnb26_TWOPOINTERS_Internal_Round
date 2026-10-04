'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getRT } from '@/lib/runtime'
import { LOGO } from '@/components/SiteNav'
import Ic from '@/components/Icon'
export default function AdminLogin() {
  const router = useRouter(), [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState('')
  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault(); const rt = getRT(); if (!rt) return
    if (rt.isLive) { if (!(await rt.liveAdminLogin(email, pw))) { setErr('Incorrect email or password.'); return }; rt.setAdmin(true) } else if (!rt.adminLogin(email, pw)) { setErr('Incorrect email or password.'); return }
    const next = new URLSearchParams(location.search).get('next'); router.push(next && next.startsWith('/admin') && next !== '/admin/login' ? next : '/admin')
  }
  return <div className="adm adm-login"><main id="main" className="adm-lcard" tabIndex={-1}>
    <div className="row sb">{LOGO}<span className="pill acc">OPERATIONS</span></div>
    <div><div className="eyebrow">Restricted · demo console</div><h1>Operator sign in</h1><p className="mut">Fair Drop Operations is separate from the customer product.</p></div>
    <form onSubmit={submit} className="col" noValidate>
      <label className="f">Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!err} required /></label>
      <label className="f">Password<input type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} aria-invalid={!!err} required /></label>
      {err && <p className="bad" role="alert">{err}</p>}
      <button className="btn pri lg" type="submit"><Ic n="lock" s={16} /> Sign in to Operations</button>
    </form>
    <p className="mut2" style={{ fontSize: '.78rem' }}>Hackathon demo authentication (cookie + local session) — not production auth. Credentials are listed in the README.</p>
    <Link href="/" className="mut2" style={{ fontSize: '.85rem' }}>← Back to the customer site</Link>
  </main></div>
}
