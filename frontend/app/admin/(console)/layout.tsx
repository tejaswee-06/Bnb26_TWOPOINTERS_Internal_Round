'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRT } from '@/lib/store'
import AdminNav from '@/components/admin/AdminNav'
// Console shell. middleware.ts gates the cookie; this adds a client-side check so a stale/cleared session never renders the console.
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const rt = useRT(), router = useRouter()
  useEffect(() => { if (rt && !rt.adminAuthed) router.replace('/admin/login') }, [rt, rt?.adminAuthed, router])
  return <div className="adm"><AdminNav /><main id="main" className="adm-main" tabIndex={-1}>{rt && !rt.adminAuthed ? <p className="mut">Redirecting to sign in…</p> : children}</main>
    <footer className="adm-foot mut2">FAIR DROP OPERATIONS · demo console · all traffic, users and inventory are SIMULATED by the in-browser engine (no external database or realtime service)</footer></div>
}
