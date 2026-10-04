'use client'
import { LivePolicy } from '@/components/admin/live'
import { useMemo } from 'react'
import { MLCampaignsPanel } from '@/components/admin/ml'
import { useOps, PageHead, Kpi, Panel, Sim, Wait, NoTelemetry, n0, tstamp } from '@/components/admin/kit'
export default function Campaigns() {
  const { sim, f, ready } = useOps()
  const data = useMemo(() => {
    if (!sim || !f) return null
    const camps = sim.campaignList(12), ids = sim.identityList(8)
    return { ids, rows: camps.map(c => { const m = c.members.map(i => sim.sessions[i]).filter(Boolean); return { c, accts: new Set(m.map(s => s.acct)).size, toks: new Set(m.map(s => s.tok)).size, fps: new Set(m.map(s => s.fp)).size, ips: new Set(m.map(s => s.ip)).size, n: m.length } }) }
  }, [sim, f?.t]) // eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <PageHead title="Campaigns" q="Which sessions are moving together as one coordinated effort?"><Sim>SIMULATED POPULATION</Sim></PageHead>
    <LivePolicy campaigns />
    <p className="adm-note2">Campaigns are groups of sessions linked by shared behavioural fingerprints and synchronized timing. Identity clusters link accounts through shared device/token signals. All IDs are pseudonymous simulator identifiers — nothing here claims to identify a real person.</p>
    <MLCampaignsPanel />
    <Wait ready={ready}>{sim && (!f || !data ? <NoTelemetry phase={sim.phase} /> : <>
      <div className="adm-kpis"><Kpi label="Behavioural campaigns" value={f.campaigns} tone={f.campaigns ? 'bad' : 'ok'} /><Kpi label="Identity clusters" value={f.identityClusters} /><Kpi label="Sync window" value={sim.policy.syncWin + ' s'} sub="sessions firing within this window correlate" /><Kpi label="Minimum group" value={sim.policy.minGroup} sub="sessions to call it a campaign" /></div>
      <Panel title="Detected campaigns" wide>
        {!data.rows.length ? <p className="mut2">No campaigns detected. Run a coordinated scenario (distributed / speed / multi-session) in the Attack Lab.</p> :
          <div className="tscroll"><table className="t"><thead><tr><th>Campaign</th><th>Kind</th><th>Sessions</th><th>Accounts*</th><th>Tokens*</th><th>Device FPs*</th><th>Window</th><th>Coordination</th><th>Dominant pattern</th><th>Mitigated</th><th>Evidence</th></tr></thead><tbody>
            {data.rows.map(({ c, accts, toks, fps }) => <tr key={c.id}><td className="mono">{c.id}</td><td><span className="pill">{c.kind}</span></td><td className="num">{n0(c.size)}</td><td className="num">{accts}</td><td className="num">{toks}</td><td className="num">{fps}</td><td className="mono">{tstamp(c.firstT)}–{tstamp(c.lastT)}</td><td className="num">{c.coord.toFixed(2)}</td><td>{c.dominant}</td><td className="num">{n0(c.mitigated)}</td><td>{c.evidence.slice(0, 3).join(', ')}</td></tr>)}</tbody></table></div>}
        <p className="mut2" style={{ fontSize: '.75rem' }}>* distinct values among a ≤24-session member sample of each campaign.</p></Panel>
      <Panel title="Identity clusters (accounts linked by shared device / token)" wide>
        {!data.ids.length ? <p className="mut2">No identity clusters yet.</p> : <div className="tscroll"><table className="t"><thead><tr><th>Cluster</th><th>Linked sessions</th><th>First seen</th><th>Evidence</th><th>Ground truth (admin-only)</th></tr></thead><tbody>{data.ids.map(c => <tr key={c.id}><td className="mono">{c.id}</td><td className="num">{n0(c.size)}</td><td className="mono">{tstamp(c.firstT)}</td><td>{c.evidence.slice(0, 3).join(', ') || '—'}</td><td>{c.truthBot ? 'automated' : 'human'}</td></tr>)}</tbody></table></div>}
        <p className="mut2" style={{ fontSize: '.78rem' }}>Only one entry per identity cluster survives into the eligible pool, which is why multi-session attacks do not multiply lottery tickets.</p></Panel></>)}</Wait></>
}
