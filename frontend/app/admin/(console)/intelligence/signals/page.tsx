'use client'
import { useMemo } from 'react'
import { useOps, PageHead, Panel, Bars, Sim, Wait, n0 } from '@/components/admin/kit'
import { FEATURE_KEYS, FEATURE_LABELS, EVIDENCE_TAG, RISK_WEIGHTS, MODEL_VERSION } from '@/lib/engine/ml'
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
export default function Signals() {
  const { sim, f, ready } = useOps()
  const fs = useMemo(() => (sim && f ? sim.featureSummary() : null), [sim, f?.t]) // eslint-disable-line react-hooks/exhaustive-deps
  const tags: Record<string, number> = {}; sim?.riskStream.forEach(r => r.evidence.forEach(e => { tags[e] = (tags[e] || 0) + 1 }))
  const rows: [string, string][] = [['rate', 'Request rate (req/s)'], ['cv', 'Interval variability (CV)'], ['simG', 'Look-alike group size'], ['idSize', 'Linked-identity cluster size'], ['reg', 'Endpoint regularity']]
  return <>
    <PageHead title="Risk signals" q="Which behavioural signals separate bots from people?"><Sim /><span className="pill">{MODEL_VERSION}</span></PageHead>
    <Wait ready={ready}><div className="adm-grid">
      <Panel title="Model feature weights (logistic, hand-calibrated)"><Bars rows={FEATURE_KEYS.map((k, i) => ({ label: FEATURE_LABELS[k], v: RISK_WEIGHTS[i], note: 'evidence tag: ' + EVIDENCE_TAG[k] }))} fmt={v => v.toFixed(2)} /><p className="mut2" style={{ fontSize: '.78rem' }}>Weights are a documented stand-in for an offline-trained model with the same feature schema.</p></Panel>
      <Panel title="Observed feature means: human vs automated" tag={<Sim>GROUND TRUTH · ADMIN ONLY</Sim>}>
        {!fs || !f ? <p className="mut2">No scored sessions yet.</p> : <table className="t"><thead><tr><th>Signal</th><th>Human</th><th>Automated</th></tr></thead><tbody>{rows.map(([k, l]) => <tr key={k}><td>{l}</td><td className="num">{mean(fs[k].human).toFixed(2)}</td><td className="num">{fs[k].bot.length ? mean(fs[k].bot).toFixed(2) : '—'}</td></tr>)}</tbody></table>}</Panel>
      <Panel title="Evidence tags in recent flags" wide>{Object.keys(tags).length ? <Bars rows={Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, v }))} fmt={n0} /> : <p className="mut2">No flagged sessions yet — start an attack in the Attack Lab.</p>}</Panel>
    </div></Wait></>
}
