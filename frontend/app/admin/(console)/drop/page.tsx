'use client'
import { LiveDropControl } from '@/components/admin/live'
import { useState } from 'react'
import { useOps, PageHead, Panel, Kpi, PhaseStepper, Sim, Wait, n0, tstamp } from '@/components/admin/kit'
import { service } from '@/services/fairdrop'
import { toast } from '@/lib/toast'
type A = Parameters<typeof service.operate>[1]
export default function DropControl() {
  const { rt, sim, ev, ready } = useOps()
  const [target, setTarget] = useState<number | null>(null), [rate, setRate] = useState<number | null>(null), [pre, setPre] = useState<number | null>(null), [err, setErr] = useState('')
  const act = (a: A, label: string) => { if (!rt || !sim) return; const e = service.operate(rt.currentDrop, a); setErr(e || ''); toast(e ? e : label + ' — done', e ? 'bad' : 'ok') }
  const ph = sim?.phase
  const can: Record<string, boolean> = { prepare: ph === 'PREPARED', open: ph === 'PREPARED', close: ph === 'PRE_QUEUE_OPEN', randomize: ph === 'PRE_QUEUE_CLOSED', admit: ph === 'RANDOMIZED' || ph === 'PAUSED', pause: ph === 'ADMITTING', end: !!ph && ph !== 'ENDED' && ph !== 'PREPARED' }
  const st = sim?.inv.stats()
  const apply = () => { if (!rt || !sim) return; rt.resetDrop(rt.currentDrop, { legit: target ?? sim.cfg.legit, admitRate: rate ?? sim.cfg.admitRate, preQueueSec: pre ?? sim.cfg.preQueueSec }); setTarget(null); setRate(null); setPre(null); toast('Drop reset with new configuration', 'ok') }
  const reset = () => { if (rt) { rt.resetDrop(rt.currentDrop); toast('Drop reset to PREPARED', 'ok') } }
  return <>
    <PageHead title="Drop control" q="What state is the drop in, and what is the next operator action?"><Sim>SHARED DROP STATE</Sim></PageHead>
    <LiveDropControl />
    <Wait ready={ready}>{sim && st && ev && <>
      <PhaseStepper phase={sim.phase} />
      <div className="adm-kpis">
        <Kpi label="Event" value={<span style={{ fontSize: '1rem' }}>{sim.cfg.title}</span>} sub={`${ev.venue}`} />
        <Kpi label="Inventory (types)" value={sim.cfg.types.length} sub={sim.cfg.types.map(t => `${t.id} ${t.cap}`).join(' · ')} />
        <Kpi label="Seat capacity" value={n0(st.total)} sub={`${n0(st.available)} available`} />
        <Kpi label="Participant target" value={n0(sim.cfg.legit)} sub={`+ ${Math.round(sim.cfg.autoPct * 100)}% attack share when a scenario runs`} />
        <Kpi label="Verification" value="Signed tokens" sub="HMAC entry/admit tokens + identity de-duplication" tone="ok" />
        <Kpi label="Pre-queue" value={sim.phase === 'PRE_QUEUE_OPEN' ? 'OPEN' : sim.tClose >= 0 ? 'CLOSED' : 'NOT OPEN'} sub={`window ${sim.cfg.preQueueSec}s (demo-compressed)`} tone={sim.phase === 'PRE_QUEUE_OPEN' ? 'ok' : undefined} />
        <Kpi label="Randomization" value={sim.revealed ? 'DONE' : 'PENDING'} sub={sim.revealed ? 'seed revealed' : 'seed committed ' + (sim.commitment ? '✓' : '—')} tone={sim.revealed ? 'ok' : undefined} />
        <Kpi label="Admission rate" value={`${sim.cfg.admitRate}/s`} sub="gated by remaining inventory" />
        <Kpi label="Drop state" value={sim.phase.replace(/_/g, ' ')} sub={`t=${tstamp(sim.t)} · ${sim.cfg.autopilot ? 'autopilot' : 'manual'}`} tone="acc" />
      </div>
      <div className="adm-grid">
        <Panel title="Lifecycle actions">
          <div className="adm-actions">
            <button className="btn" disabled={!can.prepare} onClick={() => act('prepare', 'Prepare')}>Prepare</button>
            <button className="btn" disabled={!can.open} onClick={() => act('open', 'Pre-queue opened')}>Open Pre-Queue</button>
            <button className="btn" disabled={!can.close} onClick={() => act('close', 'Pre-queue closed')}>Close Pre-Queue</button>
            <button className="btn" disabled={!can.randomize} onClick={() => act('randomize', 'Randomized')}>Randomize</button>
            <button className="btn pri" disabled={!can.admit} onClick={() => act('admit', 'Admission started')}>{ph === 'PAUSED' ? 'Resume' : 'Start'} Admission</button>
            <button className="btn" disabled={!can.pause} onClick={() => act('pause', 'Admission paused')}>Pause Admission</button>
            <button className="btn bad" disabled={!can.end} onClick={() => act('end', 'Drop ended')}>End Drop</button>
          </div>
          {err && <p className="bad" role="alert">{err}</p>}
          <label className="row"><input type="checkbox" checked={sim.cfg.autopilot} onChange={e => rt?.setAutopilot(rt.currentDrop, e.target.checked)} /> Autopilot (engine advances phases itself; manual actions switch it off)</label>
          <p className="mut2" style={{ fontSize: '.8rem' }}>Actions call <code>service.operate()</code> → <code>Runtime</code> → <code>DropSim</code>: the customer pre-queue, admission and ticket pages react to these state changes immediately.</p>
        </Panel>
        <Panel title="Configuration (applies on reset)" tag={sim.phase !== 'PREPARED' && <span className="pill warn">drop in progress — apply resets it</span>}>
          <div className="adm-ctl">
            <label className="f">Participant target<input type="number" min={1000} max={100000} step={1000} value={target ?? sim.cfg.legit} onChange={e => setTarget(+e.target.value)} /></label>
            <label className="f">Admission rate (/s)<input type="number" min={1} max={500} value={rate ?? sim.cfg.admitRate} onChange={e => setRate(+e.target.value)} /></label>
            <label className="f">Pre-queue window (s)<input type="number" min={10} max={600} value={pre ?? sim.cfg.preQueueSec} onChange={e => setPre(+e.target.value)} /></label>
          </div>
          <div className="adm-actions"><button className="btn pri" onClick={apply} disabled={target === null && rate === null && pre === null}>Apply &amp; reset drop</button><button className="btn" onClick={reset}>Reset drop</button></div>
          <p className="mut2" style={{ fontSize: '.8rem' }}>Seat capacity comes from the event's ticket types and is not editable here. Reset discards the current simulated run and any customer participation in it.</p>
        </Panel>
        <Panel title="Ticket types" wide><div className="tscroll"><table className="t"><thead><tr><th>Type</th><th>Price</th><th>Total</th><th>Available</th><th>Held</th><th>Confirmed</th></tr></thead><tbody>{st.byType.map(t => <tr key={t.id}><td>{t.name}</td><td className="num">₹{n0(t.price)}</td><td className="num">{t.total}</td><td className="num">{t.available}</td><td className="num">{t.held}</td><td className="num">{t.confirmed}</td></tr>)}</tbody></table></div></Panel>
      </div></>}</Wait></>
}
