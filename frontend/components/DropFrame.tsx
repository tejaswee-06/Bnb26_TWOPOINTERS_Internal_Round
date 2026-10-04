import Link from 'next/link'
import type { FDEvent } from '@/lib/data/events'
import { fmtDate, fmtTime } from '@/lib/data/events'
import Poster from './Poster'
import { useRT } from '@/lib/store'
/** Live mode only: shown when the Fair Drop service can’t be reached. The customer flow keeps its state and resumes automatically. */
function LiveBanner({ id }: { id: string }) {
  const rt = useRT(); if (!rt?.isLive) return null
  const ld = rt.liveFor(id); if (!ld?.offline && ld?.lastError !== 'NOT_PROVISIONED') return null
  return <div className="cx-note bad" role="alert" data-testid="live-offline">{ld?.offline ? 'We can’t reach the Fair Drop service right now. Your place is not affected — this page will reconnect automatically.' : 'This drop has not been set up on the server yet.'}</div>
}
const STEPS = ['Verify', 'Pre-queue', 'Admission', 'Tickets', 'Payment']
export function Stepper({ at }: { at: number }) {
  return <ol className="cx-steps" aria-label="Fair Drop progress">{STEPS.map((s, i) => <li key={s} className={i < at ? 'done' : i === at ? 'cur' : ''} aria-current={i === at ? 'step' : undefined}><span>{i < at ? '✓' : i + 1}</span>{s}</li>)}</ol>
}
export default function DropFrame({ e, at, children }: { e: FDEvent; at: number; children: React.ReactNode }) {
  return <div className="cx-w cx-sec"><Stepper at={at} /><LiveBanner id={e.id} /><div className="cx-drop">
    <div className="cx-drop-m">{children}</div>
    <aside className="cx-drop-s"><Link href={`/events/${e.id}`} aria-label={`Back to ${e.title}`}><Poster e={e} size="sm" /></Link><div><b>{e.title}</b><p className="mut" style={{ fontSize: '.82rem' }}>{fmtDate(e.date, true)} · {fmtTime(e.time)}<br />{e.venue}</p></div></aside>
  </div></div>
}
export function Waiting({ title = 'Loading…' }: { title?: string }) { return <div className="cx-w cx-sec" aria-busy="true"><div className="skel" style={{ height: 24, width: 260, marginBottom: 16 }} /><div className="skel" style={{ height: 260 }} /><span className="sr">{title}</span></div> }
export function NotFound() { return <div className="cx-w cx-sec"><div className="card cx-empty"><h1 style={{ fontSize: '1.5rem' }}>Drop not found</h1><p className="mut">We couldn’t find a Fair Drop for this event.</p><Link className="btn pri" href="/events">Browse events</Link></div></div> }
