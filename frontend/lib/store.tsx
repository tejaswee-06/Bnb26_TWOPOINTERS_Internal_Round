'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { getRT, Runtime } from './runtime'
const noopSub = () => () => {}
/** Subscribes the component to the runtime (re-renders once per simulated tick). Returns null during SSR AND the first client render,
 *  so server HTML and hydration always match; components render a static/skeleton state until the runtime is live. */
export function useRT(): Runtime | null {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const rt = mounted ? getRT() : null
  useSyncExternalStore(rt ? rt.subscribe : noopSub, rt ? rt.getVersion : () => 0, () => 0)
  return rt
}
export function RuntimeHost() { useEffect(() => { getRT() }, []); return null }
