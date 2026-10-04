'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRT } from '@/lib/store'
import { toast } from '@/lib/toast'
export default function SignInModal() {
  const rt = useRT(), router = useRouter(), [open, setOpen] = useState(false), [then, setThen] = useState<string | undefined>(), [name, setName] = useState(''), [email, setEmail] = useState(''), [err, setErr] = useState('')
  useEffect(() => { const h = (e: Event) => { setThen((e as CustomEvent).detail); setOpen(true); setErr('') }; addEventListener('fd-signin', h); const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false); addEventListener('keydown', k); return () => { removeEventListener('fd-signin', h); removeEventListener('keydown', k) } }, [])
  if (!open) return null
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return setErr('Please enter your name.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr('Please enter a valid email address.')
    rt?.signIn({ name: name.trim(), email: email.trim().toLowerCase() }); setOpen(false); toast(`Signed in as ${name.trim()}`, 'ok'); if (then) router.push(then)
  }
  return <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}>
    <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="si-t" noValidate>
      <div><h2 id="si-t" style={{ fontSize: '1.3rem' }}>Sign in to FAIR DROP</h2><p className="mut" style={{ fontSize: '.85rem', marginTop: '.3rem' }}>Demo sign-in: no password. Your name and email stay in this browser only. One account = one fair chance.</p></div>
      <label className="f">Full name<input autoFocus value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
      <label className="f">Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
      {err && <div className="bad" role="alert" style={{ fontSize: '.85rem' }}>{err}</div>}
      <div className="row"><button className="btn pri grow" type="submit">Continue</button><button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
    </form></div>
}
