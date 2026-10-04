'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useDrop } from '@/hooks/useDrop'
import DropFrame, { Waiting, NotFound } from '@/components/DropFrame'
import { openSignIn } from '@/lib/ui'
import { toast } from '@/lib/toast'
import { service } from '@/services/fairdrop'
import Ic from '@/components/Icon'
const CHECKS = ['Browser & device check', 'Binding session to your account', 'Duplicate-session protection']
export default function VerifyPage() {
  const { e, rt, sim, id, ready } = useDrop(), router = useRouter()
  const [done, setDone] = useState(0), [ack, setAck] = useState(false), [guided, setGuided] = useState(true), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const signed = !!rt?.user
  useEffect(() => { if (!signed) { setDone(0); return } if (done >= CHECKS.length) return; const t = setTimeout(() => setDone(d => d + 1), 550); return () => clearTimeout(t) }, [signed, done])
  if (!e || !e.drop) return ready || !e ? <NotFound /> : <Waiting />
  if (!ready) return <Waiting />
  const existing = rt!.participation(id)
  const join = async () => {
    setBusy(true); setErr('')
    if (!rt!.isLive) rt!.ensureDrop(id, { autoOpen: true })
    const r = await service.join(id, guided); setBusy(false)
    if (!r.ok) return setErr(r.reason === 'CLOSED' ? 'The pre-queue window has closed, so new entries can’t be accepted.' : r.reason === 'BACKEND_UNREACHABLE' ? 'We can’t reach the Fair Drop service right now. Nothing was lost — please try again in a moment.' : r.reason === 'BUSY' ? 'The queue is very busy and is briefly pausing new arrivals. Please retry in a few seconds.' : r.reason === 'CREDENTIAL_LOST' ? 'You already have an entry for this drop, but this browser no longer holds its session key. Use the browser you first joined from.' : r.reason === 'NOT_OPEN' ? 'This drop hasn’t opened yet. Please try again shortly.' : 'We couldn’t add you to this drop (' + String(r.reason).toLowerCase().replace(/_/g, ' ') + '). Please try again.')
    if (r.replay) toast('You already have a session for this drop — resuming it.', 'ok')
    router.push(`/drop/${id}/queue`)
  }
  return <DropFrame e={e} at={0}>
    <h1 style={{ fontSize: '1.8rem' }}>Verify your session</h1>
    <p className="mut" style={{ margin: '.4rem 0 1rem' }}>A one-time check so every person gets one fair entry. We don’t show or use a “score” on you here — we only make sure the session is genuine and unique.</p>
    {!signed ? <div className="card"><h3>Sign in to continue</h3><p className="mut">Your entry is tied to your account so duplicate sessions can’t multiply anyone’s chances.</p><div className="row" style={{ marginTop: '.7rem' }}><button className="btn pri" onClick={() => openSignIn(`/drop/${id}/verify`)}>Sign in</button><Link className="btn" href={`/drop/${id}`}>Back</Link></div></div> : <>
      <ul className="cx-checks" aria-live="polite">{CHECKS.map((c, i) => <li key={c} className={i < done ? 'ok' : ''}><span>{i < done ? <Ic n="check" s={16} /> : <span className="dot live" />}</span>{c}{i < done && <span className="mut2" style={{ marginLeft: 'auto', fontSize: '.78rem' }}>passed</span>}</li>)}</ul>
      {existing && <div className="cx-note ok"><Ic n="info" s={16} /> You already have session <b className="mono">{existing.sid}</b> for this drop. Continuing will resume it — one session per account.</div>}
      <label className="cx-ack"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /> I understand allocation is by a randomized draw: joining earlier in the window doesn’t improve my chances, and opening extra tabs or sessions won’t either.</label>
      {!rt!.isLive && <details className="cx-demo-opt"><summary>Demo options</summary>
        <label className="cx-ack"><input type="checkbox" checked={guided} onChange={e => setGuided(e.target.checked)} /> <span><b>Guided walkthrough lane</b> (default) — places this demo attendee early in the admission order so the full journey can be shown quickly. It is declared in the public proof bundle. Untick for a <b>real draw</b> position among all entries.</span></label></details>}
      {err && <div className="cx-note bad" role="alert">{err}</div>}
      <div className="row" style={{ marginTop: '1rem' }}><button className="btn pri lg" disabled={!ack || done < CHECKS.length || busy} onClick={join}>{existing ? 'Resume my session' : 'Enter the pre-queue'}</button><Link className="btn lg" href={`/drop/${id}`}>Cancel</Link></div>
      {sim && sim.phase === 'PRE_QUEUE_CLOSED' && <p className="mut2" style={{ marginTop: '.6rem' }}>Entry window is closed.</p>}
    </>}
  </DropFrame>
}
