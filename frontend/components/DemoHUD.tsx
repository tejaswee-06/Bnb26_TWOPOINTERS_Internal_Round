'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useRT } from '@/lib/store'
import { STEPS, goStep, stopDemo, tickDemo, startDemo } from '@/lib/demo'
import Ic from './Icon'

export function StartDemoButton({ className = 'btn sm', label = 'START DEMO' }: { className?: string; label?: string }) {
  const rt = useRT()
  if (rt?.demo.active || rt?.isLive) return null // the guided tour drives the simulator; live mode talks to the real backend
  return <button className={className} onClick={() => rt && startDemo(rt)} disabled={!rt} title="Runs a guided 15-step tour of the full product on the live simulator"><Ic n="play" s={14} /> {label}</button>
}

/** Floating tour controller. Drives navigation + operator actions through lib/demo.ts; all numbers on screen still come from the simulator. */
export default function DemoHUD() {
  const rt = useRT(), router = useRouter(), last = useRef(-1)
  const active = !!rt?.demo.active, idx = rt?.demo.idx ?? 0, clock = rt?.clock ?? 0
  useEffect(() => { if (rt && active) tickDemo(rt) }, [rt, active, clock])
  useEffect(() => {
    if (!rt || !active) { last.current = -1; return }
    if (last.current !== idx) { last.current = idx; router.push(STEPS[idx].route(rt)) }
  }, [rt, active, idx, router])
  if (!rt || !active) return null
  const step = STEPS[idx], isLast = idx === STEPS.length - 1
  return <aside className="demo-hud" role="region" aria-label="Guided demo controls">
    <div className="row sb"><span className="eyebrow">Demo · step {idx + 1} of {STEPS.length} · simulator ×{rt.speed}</span>
      <button className="ib" style={{ width: 30, height: 30 }} aria-label="Exit demo" onClick={() => stopDemo(rt)}><Ic n="x" s={14} /></button></div>
    <div className="demo-bar" aria-hidden="true"><i style={{ width: ((idx + 1) / STEPS.length) * 100 + '%' }} /></div>
    <h3>{step.title}</h3><p className="mut">{step.say}</p>
    <div className="row">
      <button className="btn sm" onClick={() => goStep(rt, idx - 1)} disabled={idx === 0}>Back</button>
      <button className="btn sm" onClick={() => rt.setPaused(!rt.paused)}><Ic n={rt.paused ? 'play' : 'pause'} s={13} /> {rt.paused ? 'Resume' : 'Pause'}</button>
      {!isLast ? <button className="btn sm pri" onClick={() => goStep(rt, idx + 1)}>Next step</button> : <button className="btn sm pri" onClick={() => stopDemo(rt)}>Finish demo</button>}
      <span className="mut2" style={{ fontSize: '.7rem' }}>Auto-advances</span>
    </div>
  </aside>
}
