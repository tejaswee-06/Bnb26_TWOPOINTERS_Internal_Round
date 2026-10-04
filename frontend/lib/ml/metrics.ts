// Metrics are COMPUTED from the actual session rows returned by the service — nothing is hard-coded or rebalanced.
import type { MLSession } from './types'
export interface Model1Metrics { n: number; trueHuman: number; trueBot: number; predHuman: number; predBot: number; tp: number; fp: number; fn: number; tn: number; accuracy: number; precision: number; recall: number; f1: number }
export function model1Metrics(s: MLSession[]): Model1Metrics {
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (const x of s) { const t = x.TRUE_LABEL === 1, p = x.MODEL1_PREDICTION === 1; if (t && p) tp++; else if (!t && p) fp++; else if (t && !p) fn++; else tn++ }
  const n = s.length, precision = tp + fp ? tp / (tp + fp) : 0, recall = tp + fn ? tp / (tp + fn) : 0
  return { n, trueHuman: tn + fp, trueBot: tp + fn, predHuman: tn + fn, predBot: tp + fp, tp, fp, fn, tn, accuracy: n ? (tp + tn) / n : 0, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 }
}
export function model2Summary(s: MLSession[]) {
  const unusual = s.filter(x => x.MODEL2_ANOMALY === 1), mean = (a: MLSession[]) => (a.length ? a.reduce((t, x) => t + x.MODEL2_ANOMALY_SCORE, 0) / a.length : 0)
  return { unusual: unusual.length, normal: s.length - unusual.length, unusualTrueBot: unusual.filter(x => x.TRUE_LABEL === 1).length, unusualTrueHuman: unusual.filter(x => x.TRUE_LABEL === 0).length, meanScoreBot: mean(s.filter(x => x.TRUE_LABEL === 1)), meanScoreHuman: mean(s.filter(x => x.TRUE_LABEL === 0)) }
}
