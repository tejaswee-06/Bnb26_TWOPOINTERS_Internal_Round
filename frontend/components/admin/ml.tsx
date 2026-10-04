'use client'
// Person 2 ML panels for the organizer console. Display-only: no mutation of Fair Drop engine state anywhere in this file.
import { useMemo, useState } from 'react'
import { useML, useMLDemo, MLState } from '@/hooks/useML'
import { ML_API_URL } from '@/lib/ml/client'
import { model1Metrics, model2Summary } from '@/lib/ml/metrics'
import { Kpi, Panel, Bars, pc, n0 } from './kit'
import type { MLSession } from '@/lib/ml/types'

const START_CMD = 'cd ml_api && python -m uvicorn main:app --port 8001'
const na = (v: number | null | undefined, d = 3) => (v === null || v === undefined ? <span className="mut2" title="Not produced by this detector — not manufactured">n/a</span> : v.toFixed(d))
export function MLStatusPill({ status }: { status: MLState['status'] }) {
  return <span className={'pill ' + (status === 'connected' ? 'ok' : status === 'offline' ? 'bad' : '')}>{status === 'connected' ? '✓ ML SERVICE CONNECTED' : status === 'offline' ? '■ ML SERVICE OFFLINE' : '… CONNECTING'}</span>
}
export function MLOffline({ error, reload }: { error?: string; reload: () => void }) {
  return <div className="adm-empty" role="status"><b>ML SERVICE OFFLINE</b><p className="mut">Person 2’s ML service at <span className="mono">{ML_API_URL}</span> did not respond ({error || 'unreachable'}). No ML data is shown or invented. The rest of Fair Drop — including the built-in engine below — keeps working.</p>
    <p className="mut2 mono" style={{ fontSize: '.78rem' }}>{START_CMD}</p><button className="btn sm" onClick={reload}>Retry connection</button></div>
}
const Tag = <span className="pill acc" title="Person 2 200-session simulator">SIMULATOR RESULTS</span>

export function MLIntelligencePanel() {
  const ml = useML(), { demo, error: demoErr } = useMLDemo(ml.status === 'connected')
  const [filter, setFilter] = useState<'all' | 'bot' | 'unusual'>('all'), [limit, setLimit] = useState(12)
  const m1 = useMemo(() => (ml.sessions ? model1Metrics(ml.sessions) : null), [ml.sessions]), m2 = useMemo(() => (ml.sessions ? model2Summary(ml.sessions) : null), [ml.sessions])
  const rows = useMemo(() => (ml.sessions ?? []).filter(s => filter === 'all' || (filter === 'bot' ? s.MODEL1_PREDICTION === 1 : s.MODEL2_ANOMALY === 1)), [ml.sessions, filter])
  const live: MLSession | null | undefined = demo?.session.data, alert = demo?.campaign_alert.data
  return <Panel title="Person 2 ML · external intelligence service (advisory)" wide tag={<div className="row"><MLStatusPill status={ml.status} />{ml.status === 'connected' && Tag}</div>}>
    {ml.status === 'loading' && <div className="skel" style={{ height: 120 }} aria-busy="true" />}
    {ml.status === 'offline' && <MLOffline error={ml.error} reload={ml.reload} />}
    {ml.status === 'connected' && m1 && m2 && ml.summary && <>
      <p className="adm-note2">Scores below come from Person 2’s service running on its own <b>simulated</b> traffic ({n0(m1.n)} sessions). They are simulator results, not production accuracy, and they are <b>advisory</b>: they never change queue, inventory or allocation. Service {ml.version} · <span className="mono">{ML_API_URL}</span></p>
      <div className="adm-kpis">
        <Kpi label="Simulated sessions" value={n0(m1.n)} sub={`${n0(m1.trueHuman)} human · ${n0(m1.trueBot)} bot (ground truth)`} />
        <Kpi label="Model 1 predicted" value={`${n0(m1.predHuman)} H / ${n0(m1.predBot)} B`} sub="human / bot predictions" />
        <Kpi label="Model 1 accuracy" value={pc(m1.accuracy)} sub={`computed from ${n0(m1.n)} rows`} />
        <Kpi label="Precision / recall" value={`${pc(m1.precision, 2)} / ${pc(m1.recall, 1)}`} sub={`F1 ${pc(m1.f1, 2)}`} />
        <Kpi label="Model 2 unusual" value={n0(m2.unusual)} sub={`of ${n0(m1.n)} · evidence only`} tone={m2.unusual ? 'warn' : undefined} />
        <Kpi label="Campaign pairs" value={n0(ml.summary.campaign_strong_pairs)} sub={`${ml.summary.bot_bot_pairs} bot+bot · ${ml.summary.human_human_pairs} human+human · ${ml.summary.bot_human_pairs} mixed`} />
      </div>
      <div className="adm-grid">
        <Panel title="Live demo feed (next session + next campaign alert)">
          {demoErr && <p className="bad">Demo feed unavailable.</p>}
          {!demo && !demoErr && <div className="skel" style={{ height: 90 }} />}
          {live && <table className="t"><tbody>
            <tr><td className="mut">Session</td><td className="mono">{live.SIM_SESSION_ID}</td></tr>
            <tr><td className="mut">Model 1</td><td><span className={'pill ' + (live.MODEL1_TYPE === 'BOT' ? 'bad' : 'ok')}>{live.MODEL1_TYPE === 'BOT' ? '■ BOT' : '✓ HUMAN'}</span> bot probability <b className="num">{live.MODEL1_BOT_PROBABILITY.toFixed(3)}</b></td></tr>
            <tr><td className="mut">Model 2</td><td><span className={'pill ' + (live.MODEL2_TYPE === 'ANOMALOUS' ? 'warn' : 'ok')}>{live.MODEL2_TYPE === 'ANOMALOUS' ? '▲ UNUSUAL' : '✓ NORMAL'}</span> anomaly score <b className="num">{live.MODEL2_ANOMALY_SCORE.toFixed(3)}</b></td></tr>
            <tr><td className="mut">Simulator truth</td><td>{live.TRUE_TYPE}</td></tr></tbody></table>}
          {alert && <p className="mut" style={{ fontSize: '.84rem' }}>Campaign alert <span className="mono">{alert.campaign_id}</span> · coordination <b className="num">{na(alert.coordination_score, 2)}</b> · {alert.attack_type}. (Campaign alerts and simulator sessions are separate datasets and are not joined.)</p>}
          <p className="mut2" style={{ fontSize: '.75rem' }}>The feed advances one record per poll (service-side cursor).</p></Panel>
        <Panel title="Model 2 — anomaly evidence (not a bot probability)">
          <Bars rows={[{ label: 'Normal', v: m2.normal, color: 'var(--ok)' }, { label: 'Unusual', v: m2.unusual, color: 'var(--warn)' }]} max={m1.n} />
          <p className="mut2" style={{ fontSize: '.8rem' }}>Of the {n0(m2.unusual)} unusual sessions, {n0(m2.unusualTrueBot)} were bots and {n0(m2.unusualTrueHuman)} humans in the simulator. Mean anomaly score: bots {m2.meanScoreBot.toFixed(3)}, humans {m2.meanScoreHuman.toFixed(3)}. It is shown as additional evidence only.</p></Panel>
        <Panel title="Session results (Model 1 + Model 2)" wide tag={<div className="seg" role="group" aria-label="Filter">{([['all', 'All'], ['bot', 'Predicted bot'], ['unusual', 'Unusual']] as const).map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => { setFilter(k); setLimit(12) }}>{l}</button>)}</div>}>
          <div className="tscroll"><table className="t"><thead><tr><th>Session</th><th>Model 1</th><th>Bot probability</th><th>Model 2</th><th>Anomaly score</th><th>Simulator truth</th></tr></thead><tbody>
            {rows.slice(0, limit).map(s => <tr key={s.SIM_SESSION_ID}><td className="mono">{s.SIM_SESSION_ID}</td><td><span className={'pill ' + (s.MODEL1_TYPE === 'BOT' ? 'bad' : 'ok')}>{s.MODEL1_TYPE === 'BOT' ? '■ Bot' : '✓ Human'}</span></td><td className="num">{s.MODEL1_BOT_PROBABILITY.toFixed(3)}</td><td><span className={'pill ' + (s.MODEL2_TYPE === 'ANOMALOUS' ? 'warn' : 'ok')}>{s.MODEL2_TYPE === 'ANOMALOUS' ? '▲ Unusual' : '✓ Normal'}</span></td><td className="num">{s.MODEL2_ANOMALY_SCORE.toFixed(3)}</td><td>{s.TRUE_TYPE === 'BOT' ? 'bot' : 'human'}</td></tr>)}
            {!rows.length && <tr><td colSpan={6} className="mut2">No sessions match.</td></tr>}</tbody></table></div>
          <div className="adm-actions">{rows.length > limit && <button className="btn sm" onClick={() => setLimit(limit + 25)}>Show more ({rows.length - limit} left)</button>}<button className="btn sm ghost" onClick={ml.reload}>Refresh</button></div></Panel>
      </div></>}
  </Panel>
}

export function MLCampaignsPanel() {
  const ml = useML(), ev = ml.events ?? [], sum = ml.summary
  const camps = new Set(ev.map(e => e.campaign_id)).size, sess = new Set(ev.map(e => e.session_id)).size
  return <Panel title="Person 2 campaign RiskEvents (external detector)" wide tag={<div className="row"><MLStatusPill status={ml.status} /><span className="pill acc">SIMULATED SESSIONS</span></div>}>
    {ml.status === 'loading' && <div className="skel" style={{ height: 120 }} aria-busy="true" />}
    {ml.status === 'offline' && <MLOffline error={ml.error} reload={ml.reload} />}
    {ml.status === 'connected' && sum && <>
      <p className="adm-note2">Real RiskEvents from Person 2’s campaign detector (<span className="mono">{ev[0]?.model_version ?? 'coordination_v1'}</span>). The detector scores pairs of sessions started close together with near-identical behaviour. It does not produce Model 1/Model 2 scores for these events, so risk and anomaly scores show <b>n/a</b>. These events are a separate dataset from the 200-session simulator and are not joined to it.</p>
      <div className="adm-kpis"><Kpi label="RiskEvents" value={n0(ev.length)} /><Kpi label="Distinct campaign IDs" value={n0(camps)} /><Kpi label="Distinct sessions" value={n0(sess)} sub="sessions appear in several pairs" />
        <Kpi label="Pair composition (test)" value={`${sum.bot_bot_pairs} / ${sum.human_human_pairs} / ${sum.bot_human_pairs}`} sub="bot+bot / human+human / mixed" />
        <Kpi label="Bot-pair precision (this test)" value={pc(sum.campaign_strong_pairs ? sum.bot_bot_pairs / sum.campaign_strong_pairs : 0, 0)} sub="share of strong pairs that were bot+bot — not overall detection accuracy" tone="warn" /></div>
      <div className="tscroll"><table className="t"><thead><tr><th>Campaign</th><th>Session</th><th>Coordination</th><th>Attack type</th><th>Evidence</th><th>Risk</th><th>Anomaly</th><th>Model version</th></tr></thead><tbody>
        {ev.map(e => <tr key={e.event_id}><td className="mono">{e.campaign_id ?? '—'}</td><td className="mono" title={e.session_id}>{e.session_id.slice(0, 13)}…</td><td className="num">{na(e.coordination_score, 2)}</td><td>{e.attack_type?.replace(/_/g, ' ') ?? '—'}</td><td>{e.evidence.length ? e.evidence.join(', ') : '—'}</td><td className="num">{na(e.risk_score)}</td><td className="num">{na(e.anomaly_score)}</td><td className="mono">{e.model_version}</td></tr>)}
        {!ev.length && <tr><td colSpan={8} className="mut2">The service returned no RiskEvents.</td></tr>}</tbody></table></div>
      <div className="adm-actions"><button className="btn sm ghost" onClick={ml.reload}>Refresh</button></div></>}
  </Panel>
}

export function MLSimulatedPanel() {
  const ml = useML(), m = useMemo(() => (ml.sessions ? model1Metrics(ml.sessions) : null), [ml.sessions]), m2 = useMemo(() => (ml.sessions ? model2Summary(ml.sessions) : null), [ml.sessions])
  const hist = useMemo(() => { const h = { human: new Array(5).fill(0), bot: new Array(5).fill(0) }; for (const s of ml.sessions ?? []) (s.TRUE_LABEL ? h.bot : h.human)[Math.min(4, Math.floor(s.MODEL1_BOT_PROBABILITY * 5))]++; return h }, [ml.sessions])
  const lab = ['0.0–0.2', '0.2–0.4', '0.4–0.6', '0.6–0.8', '0.8–1.0']
  return <Panel title="Person 2 simulator — SIMULATED TRAFFIC" wide tag={<div className="row"><MLStatusPill status={ml.status} /><span className="pill bad">SIMULATED TRAFFIC</span></div>}>
    {ml.status === 'loading' && <div className="skel" style={{ height: 120 }} aria-busy="true" />}
    {ml.status === 'offline' && <MLOffline error={ml.error} reload={ml.reload} />}
    {ml.status === 'connected' && m && m2 && <>
      <p className="adm-note2 warn"><b>SIMULATED TRAFFIC.</b> These {n0(m.n)} sessions are generated by Person 2’s simulator, not real users. Counts and metrics are computed from the file the service serves, as-is.</p>
      <div className="adm-grid">
        <Panel title="Simulator population (ground truth)"><Bars rows={[{ label: 'Human sessions', v: m.trueHuman, color: 'var(--ok)' }, { label: 'Bot sessions', v: m.trueBot, color: 'var(--bad)' }]} max={m.n} />
          <p className="mut2" style={{ fontSize: '.8rem' }}>Model 1 predicted {n0(m.predHuman)} human / {n0(m.predBot)} bot. Model 2 marked {n0(m2.unusual)} unusual.</p></Panel>
        <Panel title="Model 1 confusion matrix (simulator)"><div className="adm-matrix"><div className="h" /><div className="h">predicted bot</div><div className="h">predicted human</div><div className="h">bot</div><div className="num ok">TP {m.tp}</div><div className="num bad">FN {m.fn}</div><div className="h">human</div><div className="num warn">FP {m.fp}</div><div className="num ok">TN {m.tn}</div></div>
          <p className="mut2" style={{ fontSize: '.8rem' }}>Accuracy {pc(m.accuracy)} · precision {pc(m.precision, 2)} · recall {pc(m.recall)} · F1 {pc(m.f1, 2)} — simulator results only.</p></Panel>
        <Panel title="Bot probability by true type" wide><div className="tscroll"><table className="t"><thead><tr><th>Model 1 bot probability</th>{lab.map(l => <th key={l}>{l}</th>)}</tr></thead><tbody>
          <tr><td>True human</td>{hist.human.map((v, i) => <td key={i} className="num">{v}</td>)}</tr><tr><td>True bot</td>{hist.bot.map((v, i) => <td key={i} className="num">{v}</td>)}</tr></tbody></table></div></Panel>
      </div><div className="adm-actions"><button className="btn sm ghost" onClick={ml.reload}>Refresh</button></div></>}
  </Panel>
}
