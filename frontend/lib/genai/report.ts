// GenAI-style incident report generator. IMPORTANT: this is a deterministic template engine — no LLM is called.
// The pipeline is the same one an LLM-backed version would use: (1) assemble a structured, telemetry-only context object,
// (2) render a report whose OBSERVED section is copied verbatim from that context and whose INTERPRETATION section is
// clearly separated and hedged. Swapping renderReport() for a model call changes nothing upstream.
import type { DropSim } from '../engine/drop'
import { SCENARIOS } from '../engine/types'
import { MODEL_VERSION } from '../engine/ml'

export interface ReportContext {
  eventId: string; title: string; generatedAtTick: number; phase: string; scenario: string; mode: string
  telemetry: { label: string; value: string }[]
  campaigns: { id: string; size: number; kind: string; coord: number; dominant: string; evidence: string[]; mitigated: number }[]
  incidents: { id: string; t: number; sev: string; title: string; action: string; result: string; evidence: string[] }[]
  outcome: { seatsLegit: number; seatsBot: number; aaaRatio: number; integrity: boolean; oversell: number; precision: number; recall: number; fpr: number; legitFriction: number; mitigationSec: number | null; strategyChanges: number; escalations: number }
}
export interface Report { observed: string[]; interpretation: string[]; actions: string[]; caveats: string[]; context: ReportContext }
const pct = (x: number, d = 1) => (x * 100).toFixed(d) + '%'
const n = (x: number) => Math.round(x).toLocaleString('en-US')

export function buildContext(sim: DropSim): ReportContext {
  const f = sim.frame, r = sim.result()
  return {
    eventId: sim.cfg.eventId, title: sim.cfg.title, generatedAtTick: sim.t, phase: sim.phase, scenario: SCENARIOS[sim.cfg.scenario].label, mode: sim.cfg.mode,
    telemetry: f ? [
      { label: 'Requests/sec (offered → effective)', value: `${n(f.rps)} → ${n(f.rpsEff)}` }, { label: 'Active sessions', value: n(f.active) }, { label: 'Joined', value: n(f.joined) },
      { label: 'Quarantined / rejected', value: `${n(f.quarantined)} / ${n(f.rejected)}` }, { label: 'p99 latency (modelled)', value: `${n(f.p99)} ms` }, { label: 'System state', value: f.state },
      { label: 'Circuit breaker', value: f.breaker }, { label: 'Detected campaigns', value: String(f.campaigns) }, { label: 'Escalation level', value: String(f.escalation) },
      { label: 'Inventory (avail/held/confirmed of total)', value: `${f.seats.avail}/${f.seats.held}/${f.seats.confirmed} of ${f.seats.total}` },
    ] : [],
    campaigns: sim.campaignList(5).map(c => ({ id: c.id, size: c.size, kind: c.kind, coord: c.coord, dominant: c.dominant, evidence: c.evidence.slice(0, 3), mitigated: c.mitigated })),
    incidents: sim.incidents.slice(0, 8).map(i => ({ id: i.id, t: i.t, sev: i.sev, title: i.title, action: i.action, result: i.result, evidence: i.evidence.slice(0, 3) })),
    outcome: { seatsLegit: r.seatsLegit, seatsBot: r.seatsBot, aaaRatio: r.aaaRatio, integrity: r.integrity, oversell: r.oversell, precision: r.precision, recall: r.recall, fpr: r.fpr, legitFriction: r.legitFriction, mitigationSec: r.mitigationMs === null ? null : r.mitigationMs / 1000, strategyChanges: r.strategyChanges, escalations: r.escalations },
  }
}

export function renderReport(ctx: ReportContext): Report {
  const o = ctx.outcome, observed: string[] = [], interp: string[] = [], actions: string[] = [], caveats: string[] = []
  observed.push(`Drop "${ctx.title}" is in phase ${ctx.phase} at t=${ctx.generatedAtTick}s, mode ${ctx.mode}, scenario "${ctx.scenario}".`)
  for (const t of ctx.telemetry) observed.push(`${t.label}: ${t.value}.`)
  for (const c of ctx.campaigns.slice(0, 3)) observed.push(`Campaign ${c.id}: ${n(c.size)} sessions (${c.kind.toLowerCase()} correlation, coordination ${c.coord.toFixed(2)}); evidence: ${c.evidence.join('; ') || 'n/a'}; ${n(c.mitigated)} mitigated.`)
  for (const i of ctx.incidents.slice(0, 4)) observed.push(`[t=${i.t}s ${i.sev.toUpperCase()}] ${i.title} → action: ${i.action}; result: ${i.result}.`)
  observed.push(`Allocations so far: ${n(o.seatsLegit)} seats to legitimate accounts, ${n(o.seatsBot)} to automated accounts (ground truth known only to the simulator). Inventory integrity ${o.integrity ? 'holds' : 'VIOLATED'}; oversell ${o.oversell}.`)

  if (ctx.scenario === 'Normal traffic') interp.push('No adversarial traffic is present; load is the legitimate flash crowd. Defensive controls should stay mostly idle.')
  else if (ctx.campaigns.length) interp.push(`The simulator reports coordinated automated activity. ${ctx.campaigns.length} correlated campaign(s) were detected; behavioural fingerprints and timing — not IP address alone — link the member sessions, which is consistent with a ${ctx.scenario.toLowerCase()} pattern.`)
  else interp.push('Risk scores are elevated but no campaign has crossed the correlation threshold yet; the activity may be below the minimum group size or still within the scoring window.')
  if (o.mitigationSec !== null) interp.push(`First malicious session was flagged ${o.mitigationSec.toFixed(0)} s after it joined (time-to-mitigate, simulated).`)
  if (o.seatsBot === 0 && o.seatsLegit > 0) interp.push('No seat was allocated to an automated identity. The randomized lottery makes arrival speed irrelevant, and detection removed attack identities from the eligible pool.')
  else if (o.seatsBot > 0) interp.push(`Automated identities obtained ${n(o.seatsBot)} seat(s) (advantage ratio ${o.aaaRatio.toFixed(2)}×; 1.0× means no advantage over their population share). Residual leakage is expected when attackers imitate human timing.`)
  if (o.strategyChanges > 0) interp.push(`The attacker changed tactics ${o.strategyChanges} time(s) after defenses engaged; policy escalated ${o.escalations} time(s). Escalation trades a measurable amount of legitimate-user friction (${n(o.legitFriction)} legitimate sessions challenged or slowed) for lower attacker advantage.`)
  if (o.precision > 0 || o.recall > 0) interp.push(`Detector quality against simulator ground truth: precision ${pct(o.precision)}, recall ${pct(o.recall)}, false-positive rate ${pct(o.fpr, 2)}.`)

  actions.push('Keep deterministic policy as the enforcement layer; ML output is advisory and never mutates inventory.')
  if (ctx.campaigns.length) actions.push('Review the campaign members in Intelligence → Campaigns and confirm the identity-cluster blocklist entries.')
  if (o.fpr > 0.01) actions.push('False-positive rate is above 1%: consider a softer challenge instead of throttling for borderline sessions.')
  if (ctx.phase === 'PRE_QUEUE_OPEN') actions.push('Close the pre-queue when the entry window ends, then randomize.')
  if (ctx.phase === 'PRE_QUEUE_CLOSED') actions.push('Randomize the eligible pool, publish the commitment, then start admission.')
  if (ctx.phase === 'ENDED') actions.push('Publish the proof bundle so allocations can be independently verified.')

  caveats.push('This report was generated by a deterministic template over simulator telemetry — no language model was called. All figures are SIMULATED / DEMO DATA.')
  caveats.push(`Risk model: ${MODEL_VERSION} (hand-calibrated logistic model + Isolation Forest). Quality metrics use simulator ground truth that a real deployment would not have.`)
  caveats.push('Interpretation statements are hypotheses derived from the observed telemetry above; they are not facts about real users.')
  return { observed, interpretation: interp, actions, caveats, context: ctx }
}
export const reportFor = (sim: DropSim) => renderReport(buildContext(sim))

// ---- Structured drop/incident summary (additive). Deterministic: every line is formatted from DropSim telemetry or an Experiment already computed by the engine. ----
import type { Experiment } from '../engine/experiment'
export interface ReportSection { title: string; lines: string[] }
export interface DropReport { generator: 'deterministic-template'; llm: 'not used'; title: string; tick: number; phase: string; sections: ReportSection[]; markdown: string }
export function structuredReport(sim: DropSim, exp?: Experiment | null): DropReport {
  const f = sim.frame, r = sim.result(), st = sim.inv.stats(), L = (s: string) => s
  const key = sim.events.filter(e => ['attack', 'admission', 'policy', 'resilience'].includes(e.kind)).slice().reverse().slice(0, 8).map(e => `[t=${e.t}s] ${e.text}`)
  const S: ReportSection[] = []
  S.push({ title: 'What happened', lines: [L(`"${sim.cfg.title}" is in phase ${sim.phase} at t=${sim.t}s (mode ${sim.cfg.mode}, scenario ${SCENARIOS[sim.cfg.scenario].label}).`), ...(key.length ? key : ['No lifecycle events recorded yet.'])] })
  S.push({ title: 'Traffic', lines: f ? [`Current ${n(f.rps)} req/s offered (${n(f.rpsEff)} effective); peak ${n(r.peakRps)} req/s.`, `Active sessions ${n(f.active)}, joined ${n(f.joined)}, buffered ${n(f.buffered)}.`, `Modelled p99 latency ${n(f.p99)} ms (peak ${n(r.peakP99)} ms); peak load ${pct(r.peakLoad, 0)}; system state ${f.state}.`, `Total requests handled by the model: ${n(r.totalRequests)}.`] : ['No telemetry frames yet (drop not opened).'] })
  S.push({ title: 'Detected abuse', lines: f ? [`${f.campaigns} behavioural campaign(s) and ${f.identityClusters} identity cluster(s) detected.`, `Detector vs simulator ground truth — precision ${pct(r.precision)}, recall ${pct(r.recall)}, false-positive rate ${pct(r.fpr, 2)}.`, ...sim.campaignList(3).map(c => `Campaign ${c.id}: ${n(c.size)} sessions, coordination ${c.coord.toFixed(2)}, dominant pattern ${c.dominant}.`)] : ['Nothing detected yet.'] })
  S.push({ title: 'Mitigation', lines: [`${n(r.quarantinedBot)} automated sessions quarantined/rejected; ${n(r.limitBlocks)} requests dropped by per-source limits; ${n(r.bypassBlocked)} queue-bypass attempts blocked.`, `Policy escalations: ${r.escalations}; attacker strategy changes observed: ${r.strategyChanges}.`, r.mitigationMs === null ? 'Time-to-mitigate: not measurable (no automated session flagged).' : `Time-to-mitigate: ${(r.mitigationMs / 1000).toFixed(0)} s.`, `Friction on legitimate sessions (challenged or slowed): ${n(r.legitFriction)}.`] })
  S.push({ title: 'Admission', lines: [sim.commitment ? `Commitment published: ${sim.commitment.slice(0, 20)}…` : 'No commitment published yet.', `Eligible pool ${n(sim.eligibleIds.length)}; ordered ${n(sim.order.length)}; admitted ${n(sim.admitted)}.`, sim.proof ? `Seed revealed; eligible-list root ${sim.proof.eligibleRoot.slice(0, 16)}…` : 'Randomization has not run.'] })
  S.push({ title: 'Allocations', lines: [`${n(r.sold)} seats confirmed: ${n(r.seatsLegit)} to legitimate accounts, ${n(r.seatsBot)} to automated accounts (ground truth known only to the simulator).`, r.botAccounts ? `Attack Allocation Advantage ${r.aaaRatio.toFixed(2)}× (bot seat share ${pct(r.botSeatShare)} vs identity share ${pct(r.botIdentityShare)}).` : 'No adversarial identities in this run.'] })
  S.push({ title: 'Fairness', lines: exp ? [`Counterfactual (${exp.seedNote}): AAA Fair Drop ${exp.worlds.B.result.aaaRatio.toFixed(2)}× vs naive ${exp.worlds.N.result.aaaRatio.toFixed(2)}×.`, `Legitimate seats: World A ${n(exp.worlds.A.result.seatsLegit)}, World B ${n(exp.worlds.B.result.seatsLegit)}, naive ${n(exp.worlds.N.result.seatsLegit)}.`] : ['No fairness experiment has been run in this session (Admin → Fairness → Fairness Lab).'] })
  S.push({ title: 'Inventory integrity', lines: [`CONFIRMED ${st.confirmed} + HELD ${st.held} + AVAILABLE ${st.available} = ${st.confirmed + st.held + st.available} (total ${st.total}). Integrity ${st.integrity ? 'holds' : 'VIOLATED'}; oversell ${st.oversell}.`, `Hold attempts ${n(sim.inv.counters.holdAttempts)}, idempotent replays ${n(sim.inv.counters.replays)}, expired ${sim.inv.counters.expired}, released ${sim.inv.counters.released}.`] })
  S.push({ title: 'Final outcome', lines: [sim.phase === 'ENDED' ? `Drop ENDED: ${st.confirmed} of ${st.total} seats sold; oversell ${st.oversell}; ${r.seatsBot} seats went to automated identities.` : `Drop is not finished (${sim.phase}) — figures above are interim.`] })
  const markdown = `# Drop report — ${sim.cfg.title}\n\n_Generated by a deterministic template over simulator telemetry (no LLM called). All data SIMULATED._\n\n` + S.map(s => `## ${s.title}\n${s.lines.map(l => '- ' + l).join('\n')}`).join('\n\n') + '\n'
  return { generator: 'deterministic-template', llm: 'not used', title: sim.cfg.title, tick: sim.t, phase: sim.phase, sections: S, markdown }
}
