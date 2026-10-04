'use client'
// Admin UI kit: tiny, dependency-free primitives (SVG charts, KPI tiles, panels). Every number shown comes from the shared Runtime/DropSim.
import Link from 'next/link'
import { ReactNode } from 'react'
import { useRT } from '@/lib/store'
import type { DropSim } from '@/lib/engine/drop'
import type { Frame } from '@/lib/engine/types'
import { eventById } from '@/lib/data/events'

export const n0 = (x: number) => Math.round(x).toLocaleString('en-US')
export const pc = (x: number, d = 1) => (x * 100).toFixed(d) + '%'
export const short = (h: string, k = 14) => (h ? h.slice(0, k) + '…' : '—')
export const tstamp = (t: number) => `T+${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`

/** Shared drop state for every admin page: the SAME DropSim the customer journey reads/writes. */
export function useOps() {
  const rt = useRT()
  const sim: DropSim | null = rt ? rt.ensureDrop(rt.currentDrop) : null
  const f: Frame | undefined = sim?.frame
  const ev = rt ? eventById(rt.currentDrop) : undefined
  return { rt, sim, f, ev, ready: !!rt && !!sim }
}

export function PageHead({ q, title, children }: { q: string; title: string; children?: ReactNode }) {
  return <div className="adm-head"><div><div className="eyebrow">Operational question</div><h1>{title}</h1><p className="mut">{q}</p></div>{children && <div className="row">{children}</div>}</div>
}
export function Sim({ children = 'SIMULATED' }: { children?: ReactNode }) { return <span className="pill acc" title="Produced by the in-browser simulation engine, not a production system">{children}</span> }
export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'acc' }) {
  return <div className="adm-kpi"><div className="eyebrow">{label}</div><div className={'adm-kv num ' + (tone || '')}>{value}</div>{sub && <div className="mut2 adm-ks">{sub}</div>}</div>
}
export function Panel({ title, tag, children, wide }: { title: string; tag?: ReactNode; children: ReactNode; wide?: boolean }) {
  return <section className={'adm-panel' + (wide ? ' wide' : '')}><div className="row sb adm-ph"><h2>{title}</h2>{tag}</div>{children}</section>
}
export function Wait({ ready, children }: { ready: boolean; children: ReactNode }) {
  if (!ready) return <div className="skel" style={{ height: 220 }} aria-busy="true" aria-label="Loading runtime" />
  return <>{children}</>
}
export function NoTelemetry({ phase }: { phase?: string }) {
  return <div className="adm-empty"><b>No telemetry yet.</b><p className="mut">The drop is {phase || 'PREPARED'}; the simulator starts producing frames when the pre-queue opens.</p><Link className="btn sm pri" href="/admin/drop">Go to Drop Control</Link></div>
}
export const PHASES = ['PREPARED', 'PRE_QUEUE_OPEN', 'PRE_QUEUE_CLOSED', 'RANDOMIZED', 'ADMITTING', 'ENDED'] as const
export function PhaseStepper({ phase }: { phase: string }) {
  const cur = phase === 'PAUSED' ? 4 : PHASES.indexOf(phase as never)
  return <ol className="adm-steps" aria-label="Drop phase">{PHASES.map((p, i) => <li key={p} className={i < cur ? 'done' : i === cur ? 'cur' : ''} aria-current={i === cur ? 'step' : undefined}><i />{p.replace(/_/g, ' ').toLowerCase()}{i === cur && phase === 'PAUSED' ? ' (paused)' : ''}</li>)}</ol>
}
export const toneOf = (s: string) => s === 'bad' ? 'bad' : s === 'warn' ? 'warn' : s === 'ok' ? 'ok' : ''

export interface Series { name: string; data: number[]; color: string }
/** multi-line chart; optional stacked area */
export function Lines({ series, h = 150, stacked, unit = '', labels }: { series: Series[]; h?: number; stacked?: boolean; unit?: string; labels?: [string, string] }) {
  const W = 600, len = Math.max(2, ...series.map(s => s.data.length))
  if (!series.some(s => s.data.length > 1)) return <div className="adm-chartempty mut2" style={{ height: h }}>Waiting for ≥2 frames…</div>
  const tot = stacked ? Array.from({ length: len }, (_, i) => series.reduce((a, s) => a + (s.data[i] || 0), 0)) : []
  const max = Math.max(1e-9, ...(stacked ? tot : series.flatMap(s => s.data)))
  const x = (i: number) => (i / (len - 1)) * W, y = (v: number) => h - 14 - (v / max) * (h - 22)
  let acc = new Array(len).fill(0)
  const paths = series.map(s => {
    if (!stacked) return { s, d: s.data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''), area: '' }
    const lo = acc.slice(), hi = acc.map((a, i) => a + (s.data[i] || 0)); acc = hi
    const top = hi.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''), bot = lo.map((v, i) => `L${x(len - 1 - i).toFixed(1)},${y(lo[len - 1 - i]).toFixed(1)}`).join('')
    return { s, d: top, area: top + bot + 'Z' }
  })
  return <figure className="adm-chart"><svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" role="img" aria-label={series.map(s => s.name).join(', ') + ' over time'} style={{ height: h }}>
    {[0, 0.5, 1].map(g => <line key={g} x1="0" x2={W} y1={y(max * g)} y2={y(max * g)} stroke="var(--bd)" strokeDasharray="3 4" />)}
    {paths.map(p => <g key={p.s.name}>{p.area && <path d={p.area} fill={p.s.color} opacity=".35" />}<path d={p.d} fill="none" stroke={p.s.color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" /></g>)}
  </svg>
    <figcaption className="legend"><span className="mono">max {n0(max)}{unit}</span>{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}{labels && <span className="mut2">{labels[0]} → {labels[1]}</span>}</figcaption></figure>
}
export function StackBar({ parts, total }: { parts: { name: string; v: number; color: string }[]; total?: number }) {
  const T = (total ?? parts.reduce((a, p) => a + p.v, 0)) || 1
  return <div><div className="stack" role="img" aria-label={parts.map(p => `${p.name} ${n0(p.v)}`).join(', ')}>{parts.map(p => <span key={p.name} style={{ width: (p.v / T) * 100 + '%', background: p.color }} />)}</div>
    <div className="legend">{parts.map(p => <span key={p.name}><i style={{ background: p.color }} />{p.name} <b className="num">{n0(p.v)}</b></span>)}</div></div>
}
export function Bars({ rows, fmt = n0, max }: { rows: { label: string; v: number; color?: string; note?: string }[]; fmt?: (v: number) => string; max?: number }) {
  const m = max ?? Math.max(1e-9, ...rows.map(r => r.v))
  return <div className="adm-bars">{rows.map(r => <div key={r.label} className="adm-bar"><span className="mut">{r.label}</span><div className="bar"><i style={{ width: Math.min(100, (r.v / m) * 100) + '%', background: r.color }} /></div><b className="num">{fmt(r.v)}</b>{r.note && <span className="mut2 adm-note">{r.note}</span>}</div>)}</div>
}
export function Flow({ steps }: { steps: { k: string; v: ReactNode; tone?: string }[] }) {
  return <ol className="adm-flow">{steps.map((s, i) => <li key={s.k}><div className="eyebrow">{s.k}</div><div className={'adm-fv ' + (s.tone || '')}>{s.v}</div>{i < steps.length - 1 && <span className="adm-arr" aria-hidden="true">→</span>}</li>)}</ol>
}
export function EventLog({ events, limit = 12 }: { events: { id: string; t: number; kind: string; text: string; sev: string }[]; limit?: number }) {
  if (!events.length) return <p className="mut2">No events recorded yet.</p>
  return <ul className="adm-log">{events.slice(0, limit).map(e => <li key={e.id} className={toneOf(e.sev)}><span className="mono mut2">{tstamp(e.t)}</span><span className="pill">{e.kind}</span><span>{e.text}</span></li>)}</ul>
}
export function downloadText(name: string, text: string, mime = 'text/plain') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500) }
