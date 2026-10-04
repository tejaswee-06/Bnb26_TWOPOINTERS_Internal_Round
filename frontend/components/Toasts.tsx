'use client'
import { useEffect, useState } from 'react'
export default function Toasts() {
  const [list, setList] = useState<{ id: number; msg: string; kind: string }[]>([])
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; setList(l => [...l.slice(-2), d]); setTimeout(() => setList(l => l.filter(x => x.id !== d.id)), 4200) }
    addEventListener('fd-toast', h); return () => removeEventListener('fd-toast', h)
  }, [])
  return <div className="toasts" role="status" aria-live="polite">{list.map(t => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}</div>
}
