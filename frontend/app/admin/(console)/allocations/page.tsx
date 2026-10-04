'use client'
import { LiveAllocations } from '@/components/admin/live'
import { useOps, PageHead, Kpi, Panel, StackBar, Sim, Wait, n0, tstamp } from '@/components/admin/kit'
export default function Allocations() {
  const { sim, f, ev, ready } = useOps(), st = sim?.inv.stats()
  const held = sim ? [...sim.inv.holds.values()].filter(h => h.state === 'HELD').slice(0, 10) : []
  const conf = sim ? sim.allocs.slice(-40).reverse() : []
  return <>
    <PageHead title="Allocations" q="Where did every seat go, and does the inventory add up?"><Sim /></PageHead>
    <LiveAllocations />
    <Wait ready={ready}>{sim && st && <>
      <Panel title="Inventory invariant" tag={<span className={'pill ' + (st.integrity ? 'ok' : 'bad')}>{st.integrity ? 'INTEGRITY OK' : 'VIOLATED'} · oversell {st.oversell}</span>}>
        <div className="adm-big mono"><span className="ok">{n0(st.confirmed)}</span> + <span className="warn">{n0(st.held)}</span> + <span className="acc">{n0(st.available)}</span> = {n0(st.confirmed + st.held + st.available)} <span className="mut2" style={{ fontSize: '1rem' }}>/ total {n0(st.total)}</span></div>
        <div className="mut2">CONFIRMED + HELD + AVAILABLE = TOTAL — computed from the live Inventory object that customer purchases also mutate.</div>
        <StackBar total={st.total} parts={[{ name: 'confirmed', v: st.confirmed, color: 'var(--ok)' }, { name: 'held', v: st.held, color: 'var(--warn)' }, { name: 'available', v: st.available, color: 'var(--acc)' }]} />
        <div className="tscroll"><table className="t"><thead><tr><th>Type</th><th>Total</th><th>Available</th><th>Held</th><th>Confirmed</th><th>Sum</th></tr></thead><tbody>{st.byType.map(t => <tr key={t.id}><td>{t.name}</td><td className="num">{t.total}</td><td className="num">{t.available}</td><td className="num">{t.held}</td><td className="num">{t.confirmed}</td><td className="num">{t.available + t.held + t.confirmed}</td></tr>)}</tbody></table></div></Panel>
      <div className="adm-kpis"><Kpi label="Hold attempts" value={n0(sim.inv.counters.holdAttempts)} /><Kpi label="Holds granted" value={n0(sim.inv.counters.holdGranted)} /><Kpi label="Idempotent replays" value={n0(sim.inv.counters.replays)} sub="same key → same result, no double allocation" /><Kpi label="Rejected (sold out)" value={n0(sim.inv.counters.rejected)} /><Kpi label="Released / expired" value={`${sim.inv.counters.released} / ${sim.inv.counters.expired}`} /><Kpi label="Lost races" value={n0(f?.raced ?? 0)} /></div>
      <Panel title="Allocation stream (latest first)" wide>
        <div className="tscroll"><table className="t"><thead><tr><th>Allocation / hold</th><th>Event</th><th>Session</th><th>Ticket</th><th>State</th><th>Time</th><th>Idempotency key</th><th>Truth*</th></tr></thead><tbody>
          {held.map(h => <tr key={h.id}><td className="mono">{h.id}</td><td>{ev?.title}</td><td className="mono">S-{h.sid.toString(36).toUpperCase().padStart(5, '0')}</td><td>{h.qty}× {sim.cfg.types[h.typeIdx].name}</td><td><span className="pill warn">HELD</span></td><td className="mono">{tstamp(h.created)}</td><td className="mono">{h.idem}</td><td>—</td></tr>)}
          {conf.map(a => <tr key={a.id}><td className="mono">{a.allocationId}</td><td>{ev?.title}</td><td className="mono">{a.session}</td><td>{a.qty}× {a.type}</td><td><span className="pill ok">CONFIRMED</span></td><td className="mono">{tstamp(a.t)}</td><td className="mono">{a.idem}</td><td>{a.bot ? 'automated' : 'human'}</td></tr>)}
          <tr><td className="mono">—</td><td colSpan={3} className="mut2">{n0(st.available)} seats still AVAILABLE (not individually listed)</td><td><span className="pill acc">AVAILABLE</span></td><td colSpan={3} /></tr>
          {!held.length && !conf.length && <tr><td colSpan={8} className="mut2">No allocations yet.</td></tr>}</tbody></table></div>
        <p className="mut2" style={{ fontSize: '.72rem' }}>* ground truth known only to the simulator. Stream shows the latest {conf.length} of {n0(sim.allocs.length)} retained confirmations; times are simulator seconds.</p></Panel></>}</Wait></>
}
