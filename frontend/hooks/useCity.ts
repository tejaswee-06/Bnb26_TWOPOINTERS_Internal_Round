'use client'
import { useEffect, useState } from 'react'
export const ALL_CITIES = 'All cities'
/** Selected city, persisted in localStorage and synced between components. Server + first render use 'Mumbai' so hydration matches. */
export function useCity(): [string, (c: string) => void] {
  const [city, setC] = useState('Mumbai')
  useEffect(() => {
    try { const v = localStorage.getItem('fd-city'); if (v) setC(v) } catch { /* ignore */ }
    const h = (e: Event) => setC((e as CustomEvent).detail); addEventListener('fd-city', h); return () => removeEventListener('fd-city', h)
  }, [])
  const set = (c: string) => { try { localStorage.setItem('fd-city', c) } catch { /* ignore */ } setC(c); dispatchEvent(new CustomEvent('fd-city', { detail: c })) }
  return [city, set]
}
