'use client'
import { useMemo } from 'react'
import { useOps, PageHead, Panel, Sim, Wait, downloadText } from '@/components/admin/kit'
import { structuredReport } from '@/lib/genai/report'
export default function Reports() {
  const { rt, sim, f, ready } = useOps()
  const rep = useMemo(() => (sim ? structuredReport(sim, rt?.experiment) : null), [sim, rt?.experiment, f?.t, sim?.phase]) // eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <PageHead title="Reports" q="What happened in this drop, in writing, using only recorded telemetry?"><Sim>FROM LIVE TELEMETRY</Sim>
      <button className="btn sm" disabled={!rep} onClick={() => rep && downloadText(`fairdrop-report-${sim!.cfg.eventId}.md`, rep.markdown, 'text/markdown')}>Download .md</button><button className="btn sm" onClick={() => window.print()}>Print / PDF</button></PageHead>
    <Wait ready={ready}>{rep && <>
      <p className="adm-note2">Generator: <b>{rep.generator}</b> · language model: <b>{rep.llm}</b>. This build ships the deterministic fallback only — no LLM key or API call exists in the frontend. The report re-renders as telemetry changes; numbers are copied from the engine, never invented. Snapshot: phase {rep.phase}, t={rep.tick}s.</p>
      <div className="adm-report">{rep.sections.map(s => <Panel key={s.title} title={s.title}><ul>{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul></Panel>)}</div></>}</Wait></>
}
