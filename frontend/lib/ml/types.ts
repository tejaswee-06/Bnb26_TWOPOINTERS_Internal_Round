// Types for the Person 2 ML service (see docs/ml/API_INTEGRATION_CONTRACT.md). Field names mirror the API exactly.
export interface MLSession {
  SIM_SESSION_ID: string; TRUE_LABEL: 0 | 1; MODEL1_PREDICTION: 0 | 1; MODEL1_BOT_PROBABILITY: number
  TRUE_TYPE: 'HUMAN' | 'BOT'; MODEL1_TYPE: 'HUMAN' | 'BOT'; MODEL2_ANOMALY_SCORE: number; MODEL2_ANOMALY: 0 | 1; MODEL2_TYPE: 'NORMAL' | 'ANOMALOUS'
}
export interface MLRiskEvent {
  session_id: string; event_id: string; risk_score: number | null; anomaly_score: number | null; coordination_score: number | null
  campaign_id: string | null; attack_type: string | null; evidence: string[]; model_version: string; timestamp: string
}
export interface MLSummary { simulated_sessions: number; risk_events: number; campaign_strong_pairs: number; bot_bot_pairs: number; human_human_pairs: number; bot_human_pairs: number }
export interface MLHealth { service: string; status: string; version: string }
export interface MLDemo { status: string; session: { source: string; data: MLSession | null }; campaign_alert: { source: string; data: MLRiskEvent | null }; summary: MLSummary }
export type MLResult<T> = { ok: true; data: T } | { ok: false; error: string }
