'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getMLDemo, getMLHealth, getMLSummary, getRiskEvents, getSimulationSessions } from '@/lib/ml/client'
import type { MLDemo, MLRiskEvent, MLSession, MLSummary } from '@/lib/ml/types'
export type MLStatus = 'loading' | 'connected' | 'offline'
export interface MLState { status: MLStatus; error?: string; summary?: MLSummary; sessions?: MLSession[]; events?: MLRiskEvent[]; version?: string; loadedAt?: number }
/** Loads Person 2 data once per mount (and on refresh). Any failure → status 'offline'; never substitutes data. */
export function useML() {
  const [st, setSt] = useState<MLState>({ status: 'loading' }), alive = useRef(true)
  const load = useCallback(async () => {
    setSt(s => ({ ...s, status: s.status === 'connected' ? 'connected' : 'loading' }))
    const h = await getMLHealth()
    if (!h.ok) { if (alive.current) setSt({ status: 'offline', error: h.error }); return }
    const [sum, ses, ev] = await Promise.all([getMLSummary(), getSimulationSessions(), getRiskEvents()])
    if (!alive.current) return
    if (!sum.ok || !ses.ok || !ev.ok) { setSt({ status: 'offline', error: (!sum.ok && sum.error) || (!ses.ok && ses.error) || (!ev.ok && ev.error) || 'error' }); return }
    setSt({ status: 'connected', summary: sum.data, sessions: ses.data, events: ev.data, version: h.data.version, loadedAt: Date.now() })
  }, [])
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false } }, [load])
  return { ...st, reload: load }
}
/** Polls the stateful /ml/demo feed (each call returns the next simulated session + next campaign alert). */
export function useMLDemo(enabled: boolean, ms = 4000) {
  const [d, setD] = useState<MLDemo | null>(null), [err, setErr] = useState(false)
  useEffect(() => {
    if (!enabled) return; let on = true
    const tick = async () => { const r = await getMLDemo(); if (!on) return; if (r.ok) { setD(r.data); setErr(false) } else setErr(true) }
    tick(); const i = setInterval(tick, ms); return () => { on = false; clearInterval(i) }
  }, [enabled, ms])
  return { demo: d, error: err }
}
