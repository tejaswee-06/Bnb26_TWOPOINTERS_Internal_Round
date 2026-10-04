// Counterfactual fairness experiments. World A = legitimate crowd only (Fair Drop). World B = the *identical* legitimate
// crowd + adversarial traffic (Fair Drop). World N = same crowd + same attack against a naive first-come-first-served baseline.
// Every number is computed by running the engine — nothing is hard-coded.
import { DropConfig, Frame, Scenario, SimResult } from './types'
import { DropSim, defaultConfig } from './drop'
export interface World { key: 'A' | 'B' | 'N'; label: string; result: SimResult; frames: Frame[]; posHist: { legit: number[]; bot: number[] }; waves: DropSim['waveLog']; ms: number }
export interface Experiment { cfg: DropConfig; worlds: Record<'A' | 'B' | 'N', World>; ranAt: number; seedNote: string }
function posHist(sim: DropSim) {
  const n = Math.max(1, sim.order.length), h = { legit: new Array(10).fill(0), bot: new Array(10).fill(0) }
  for (const a of sim.allocs) { const b = Math.min(9, Math.floor(((a.pos - 1) / n) * 10)); (a.bot ? h.bot : h.legit)[b] += a.qty }
  return h
}
function runOne(cfg: DropConfig, key: World['key'], label: string): World {
  const t0 = performance.now(), sim = new DropSim(cfg); sim.openPreQueue()
  let g = 0; while (sim.phase !== 'ENDED' && g++ < 700) sim.step()
  if (sim.phase !== 'ENDED') sim.endDrop()
  return { key, label, result: sim.result(), frames: sim.frames.slice(), posHist: posHist(sim), waves: sim.waveLog.slice(), ms: Math.round(performance.now() - t0) }
}
const tick = () => new Promise<void>(r => setTimeout(r, 0))
export async function runCounterfactual(base: Partial<DropConfig> & { scenario: Scenario }, onProgress?: (p: number, msg: string) => void): Promise<Experiment> {
  const cfg = defaultConfig({ ...base, autopilot: true }), attack = cfg.scenario === 'NORMAL' ? 'SPEED' : cfg.scenario
  onProgress?.(0.02, 'World A — legitimate crowd only (Fair Drop)'); await tick()
  const A = runOne({ ...cfg, scenario: 'NORMAL', mode: 'FAIR' }, 'A', 'World A · legitimate only · Fair Drop')
  onProgress?.(0.36, 'World B — same crowd + attack (Fair Drop)'); await tick()
  const B = runOne({ ...cfg, scenario: attack, mode: 'FAIR' }, 'B', 'World B · + attack · Fair Drop')
  onProgress?.(0.7, 'Naive baseline — same crowd + same attack, first-come-first-served'); await tick()
  const N = runOne({ ...cfg, scenario: attack, mode: 'NAIVE' }, 'N', 'Naive baseline · + attack · FCFS')
  onProgress?.(1, 'done')
  return { cfg: { ...cfg, scenario: attack }, worlds: { A, B, N }, ranAt: Date.now(), seedNote: `seed "${cfg.seed}" — legitimate crowd identical in all three worlds` }
}
