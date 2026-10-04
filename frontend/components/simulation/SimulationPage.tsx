'use client'
// ============================================================================================
// SIMULATION PAGE — INTEGRATION SLOT (reserved for the teammate's simulation UI)
// Replace the body of this component (or this whole file) with the real simulation page.
// /admin/simulation already renders <SimulationPage /> inside the admin shell + navigation,
// so nothing else needs to change. DO NOT build a second simulation route.
//
// Shared state contract (same objects the customer + admin use):
//   const rt  = useRT()                          // lib/store → Runtime (null until hydrated)
//   const sim = rt?.drops.get(rt.currentDrop)    // DropSim: phase, frames[], inv, allocs, events, incidents, campaigns, proof…
//   service.operate / service.startAttack        // services/fairdrop.ts  (state-changing operations)
//   rt.runExperiment(cfg) / rt.experiment        // counterfactual worlds A/B/Naive (lib/engine/experiment.ts)
//   sim.frame / sim.frames / sim.result()        // telemetry + outcome metrics
// ============================================================================================
import { useOps } from '@/components/admin/kit'
export interface SimulationPageProps { /* reserved: add props here if the page needs them */ }
export default function SimulationPage(_: SimulationPageProps) {
  const { sim, ready } = useOps()
  return <div className="adm-empty" data-testid="simulation-slot">
    <div className="eyebrow">Integration slot</div><b>Simulation page — not included in this build</b>
    <p className="mut">The simulation UI is being built separately and plugs in here. It will read and drive the same drop state as every other admin page{ready && sim ? <> (currently <span className="mono">{sim.cfg.eventId}</span>, phase <span className="mono">{sim.phase}</span>, {sim.frames.length} frames)</> : null}.</p>
    <p className="mut2" style={{ fontSize: '.8rem' }}>Edit <code>components/simulation/SimulationPage.tsx</code>; contract notes are in the file header and ARCHITECTURE.md.</p>
  </div>
}
