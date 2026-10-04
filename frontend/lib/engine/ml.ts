// Advisory ML: (1) logistic risk model with explainable per-feature contributions, (2) a real Isolation Forest
// for unsupervised anomaly scoring. ML output is ADVISORY — deterministic policy (drop.ts) enforces. ML never touches inventory.
// Model versions are reported in every RiskEvent. The logistic weights are hand-calibrated on simulator telemetry
// (documented stand-in for an offline-trained XGBoost model with the same feature schema).
import { Rand } from './rng'
export const MODEL_VERSION = 'fd-risk-logit-0.3+iforest-0.1'
export interface Features { rate: number; cv: number; refresh: number; conc: number; tokReuse: number; bypass: number; simGroup: number; regularity: number }
export const FEATURE_KEYS: (keyof Features)[] = ['rate', 'cv', 'refresh', 'conc', 'tokReuse', 'bypass', 'simGroup', 'regularity']
export const FEATURE_LABELS: Record<keyof Features, string> = {
  rate: 'Request frequency', cv: 'Interval variance (low = machine-like)', refresh: 'Refresh frequency', conc: 'Concurrent sessions / account',
  tokReuse: 'Token reuse across sessions', bypass: 'Queue-bypass attempts', simGroup: 'Behavioral-signature group size', regularity: 'Endpoint traversal regularity',
}
export const EVIDENCE_TAG: Record<keyof Features, string> = {
  rate: 'burst_structure', cv: 'low_timing_variance', refresh: 'refresh_pattern', conc: 'multi_session_account', tokReuse: 'token_reuse',
  bypass: 'queue_bypass_attempt', simGroup: 'shared_behavior_fingerprint', regularity: 'regular_endpoint_traversal',
}
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))
const BIAS = -4.0
export function transform(f: Features): number[] {
  return [Math.log1p(f.rate), Math.max(0, 1 - f.cv), Math.log1p(f.refresh), Math.min(6, f.conc - 1), Math.min(5, f.tokReuse), Math.min(1, f.bypass), Math.log1p(f.simGroup), Math.max(0, f.regularity - 0.55)]
}
const W = [0.55, 2.0, 0.25, 0.7, 0.5, 4.0, 0.45, 1.6]
export function riskModel(f: Features): { risk: number; contrib: { key: keyof Features; value: number; c: number }[] } {
  const x = transform(f); let z = BIAS; const contrib = FEATURE_KEYS.map((key, i) => { const c = W[i] * x[i]; z += c; return { key, value: f[key], c } })
  return { risk: sigmoid(z), contrib }
}
export function evidenceFor(contrib: { key: keyof Features; c: number }[], min = 0.45): string[] { return contrib.filter(c => c.c >= min).sort((a, b) => b.c - a.c).map(c => EVIDENCE_TAG[c.key]) }

// ---- Isolation Forest (Liu, Ting, Zhou 2008) ----
const harmonic = (n: number) => Math.log(n) + 0.5772156649
const cFn = (n: number) => (n <= 1 ? 0 : n === 2 ? 1 : 2 * harmonic(n - 1) - (2 * (n - 1)) / n)
interface Tree { feat: Int8Array; thr: Float32Array; left: Int32Array; right: Int32Array; size: Int32Array }
export class IsolationForest {
  trees: Tree[] = []; psi = 0
  constructor(private nTrees = 40, private sub = 256) {}
  fit(X: number[][], r: Rand) {
    this.psi = Math.min(this.sub, X.length); const maxH = Math.ceil(Math.log2(Math.max(2, this.psi))); this.trees = []
    for (let t = 0; t < this.nTrees; t++) {
      const idx: number[] = []; for (let i = 0; i < this.psi; i++) idx.push(Math.floor(r() * X.length))
      const feat: number[] = [], thr: number[] = [], left: number[] = [], right: number[] = [], size: number[] = []
      const build = (rows: number[], depth: number): number => {
        const id = feat.length; feat.push(-1); thr.push(0); left.push(-1); right.push(-1); size.push(rows.length)
        if (depth >= maxH || rows.length <= 1) return id
        const d = X[0].length, cand: number[] = []
        for (let k = 0; k < d; k++) { let lo = Infinity, hi = -Infinity; for (const ri of rows) { const v = X[ri][k]; if (v < lo) lo = v; if (v > hi) hi = v } if (hi > lo) cand.push(k) }
        if (!cand.length) return id
        const k = cand[Math.floor(r() * cand.length)]; let lo = Infinity, hi = -Infinity; for (const ri of rows) { const v = X[ri][k]; if (v < lo) lo = v; if (v > hi) hi = v }
        const s = lo + r() * (hi - lo); feat[id] = k; thr[id] = s
        const L: number[] = [], R: number[] = []; for (const ri of rows) (X[ri][k] < s ? L : R).push(ri)
        left[id] = build(L, depth + 1); right[id] = build(R, depth + 1); return id
      }
      build(idx, 0)
      this.trees.push({ feat: Int8Array.from(feat), thr: Float32Array.from(thr), left: Int32Array.from(left), right: Int32Array.from(right), size: Int32Array.from(size) })
    }
  }
  /** anomaly score in (0,1); ~0.5 normal, →1 anomalous */
  score(x: number[]): number {
    if (!this.trees.length) return 0.5
    let sum = 0
    for (const t of this.trees) { let n = 0, depth = 0; while (t.feat[n] >= 0) { n = x[t.feat[n]] < t.thr[n] ? t.left[n] : t.right[n]; depth++ } sum += depth + cFn(t.size[n]) }
    return Math.pow(2, -(sum / this.trees.length) / Math.max(1e-9, cFn(this.psi)))
  }
}
export const RISK_WEIGHTS = W
