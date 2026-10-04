'use client'
import { LivePolicy } from '@/components/admin/live'
import { useOps, PageHead, Kpi, Panel, Bars, Sim, Wait, NoTelemetry, n0, pc, tstamp } from '@/components/admin/kit'
import { MLIntelligencePanel } from '@/components/admin/ml'
import { MODEL_VERSION } from '@/lib/engine/ml'
export default function Intelligence() {
  const { rt, sim, f, ready } = useOps(); const P = sim?.policy, c = sim?.confusionNow()
  const prec = c && c.tp + c.fp ? c.tp / (c.tp + c.fp) : 0, rec = c && c.tp + c.fn ? c.tp / (c.tp + c.fn) : 0, fpr = c && c.fp + c.tn ? c.fp / (c.fp + c.tn) : 0
  return <>
    <PageHead title="Detection" q="What does the detector see, and what did the policy do about it?"><Sim>SIMULATED TELEMETRY</Sim><span className="pill">Built-in engine advisory</span><span className="pill">{MODEL_VERSION}</span></PageHead>
    <LivePolicy />
    <p className="adm-note2"><b>ML is advisory; policy is deterministic.</b> The logistic risk model and Isolation Forest only produce scores and evidence. Thresholds below decide NORMAL / CHALLENGE / THROTTLE / QUARANTINE / REJECT, and nothing the model outputs can touch inventory.</p>
    <MLIntelligencePanel />
    <Wait ready={ready}>{sim && P && (!f ? <NoTelemetry phase={sim.phase} /> : <>
      <div className="adm-kpis">
        <Kpi label="Scoring service" value={sim.mlOnline ? 'ONLINE' : 'FAILED'} sub={sim.mlOnline ? 'advisory scores flowing' : 'deterministic fallback active'} tone={sim.mlOnline ? 'ok' : 'bad'} />
        <Kpi label="Campaigns detected" value={f.campaigns} sub={`${f.identityClusters} identity clusters`} />
        <Kpi label="Escalation level" value={f.escalation} sub="0 = baseline policy" tone={f.escalation ? 'warn' : 'ok'} />
        <Kpi label="Precision / recall" value={`${pc(prec, 0)} / ${pc(rec, 0)}`} sub="vs simulator ground truth" />
        <Kpi label="False-positive rate" value={pc(fpr, 2)} sub="humans flagged (throttle or worse)" tone={fpr > 0.01 ? 'warn' : 'ok'} />
        <Kpi label="Time to mitigate" value={f.mitigationMs === null ? '—' : (f.mitigationMs / 1000).toFixed(0) + ' s'} sub="first bot join → first flag" />
      </div>
      <div className="adm-grid">
        <Panel title="Policy actions (sessions)"><Bars rows={[{ label: 'Normal', v: f.risk[0], color: 'var(--ok)' }, { label: 'Challenge', v: f.risk[1], color: 'var(--acc2)' }, { label: 'Throttle', v: f.risk[2], color: 'var(--warn)' }, { label: 'Quarantine', v: f.quarantined, color: 'var(--bad)' }, { label: 'Reject', v: f.rejected, color: 'var(--bad)' }]} />
          <p className="mut2" style={{ fontSize: '.78rem' }}>Quarantine/reject are shown separately from the combined engine bucket.</p></Panel>
        <Panel title="Deterministic policy thresholds" tag={<span className="pill">level {P.level}</span>}>
          <table className="t"><tbody>
            <tr><td>Challenge at risk ≥</td><td className="num">{P.tChallenge.toFixed(2)}</td></tr><tr><td>Throttle at risk ≥</td><td className="num">{P.tThrottle.toFixed(2)}</td></tr><tr><td>Quarantine at risk ≥</td><td className="num">{P.tQuarantine.toFixed(2)}</td></tr>
            <tr><td>Campaign minimum group</td><td className="num">{P.minGroup} sessions</td></tr><tr><td>Behavioural sync window</td><td className="num">{P.syncWin} s</td></tr></tbody></table>
          <div className="adm-actions"><button className="btn sm" onClick={() => { sim.setMl(!sim.mlOnline); rt?.emit() }}>{sim.mlOnline ? 'Simulate ML outage' : 'Restore ML'}</button></div></Panel>
        <Panel title="Confusion matrix (ground truth known to simulator only)">
          <div className="adm-matrix"><div className="h" /><div className="h">flagged</div><div className="h">not flagged</div><div className="h">bot</div><div className="num ok">TP {n0(c!.tp)}</div><div className="num bad">FN {n0(c!.fn)}</div><div className="h">human</div><div className="num warn">FP {n0(c!.fp)}</div><div className="num ok">TN {n0(c!.tn)}</div></div></Panel>
        <Panel title="Recent risk records (model output → policy action)" wide>
          <div className="tscroll"><table className="t"><thead><tr><th>Time</th><th>Session</th><th>Risk</th><th>Anomaly</th><th>Coord.</th><th>Campaign</th><th>Evidence</th><th>Action</th></tr></thead><tbody>
            {sim.riskStream.slice(0, 12).map((r, i) => <tr key={i}><td className="mono">{tstamp(Math.max(0, Math.round((Date.parse(r.timestamp) - 1760000000000) / 1000)))}</td><td className="mono">{r.session_id}</td><td className="num">{r.risk_score.toFixed(2)}</td><td className="num">{r.anomaly_score.toFixed(2)}</td><td className="num">{r.coordination_score.toFixed(2)}</td><td className="mono">{r.campaign_id ?? '—'}</td><td>{r.evidence.join(', ') || '—'}</td><td><span className={'pill ' + (r.action === 'CHALLENGE' ? 'acc' : r.action === 'THROTTLE' ? 'warn' : 'bad')}>{r.action}</span></td></tr>)}
            {!sim.riskStream.length && <tr><td colSpan={8} className="mut2">No flagged sessions yet.</td></tr>}</tbody></table></div></Panel>
      </div></>)}</Wait></>
}
