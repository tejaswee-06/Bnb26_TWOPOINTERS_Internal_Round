"""Pure, deterministic policy evaluation. No I/O, no clock, no randomness.

Same (event, history, config) always yields the same decision. The engine only *classifies*; it never touches
inventory, queue position or reservations. Enforcement lives in the services that read the stored decision.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.core.config import settings

ACTIONS = ("NORMAL", "CHALLENGE", "THROTTLE", "QUARANTINE", "REJECT")
SEVERITY = {name: i for i, name in enumerate(ACTIONS)}


@dataclass(frozen=True)
class PolicyConfig:
    version: str = "policy-v1"
    challenge_risk: float = 0.50
    throttle_risk: float = 0.75
    quarantine_risk: float = 0.90
    reject_risk: float = 0.99
    anomaly_challenge: float = 0.80
    coordination_threshold: float = 0.90
    corroboration_risk: float = 0.50
    corroboration_anomaly: float = 0.80
    coordination_repeat_count: int = 2
    campaign_min_sessions: int = 5
    hard_evidence: frozenset[str] = frozenset()

    @classmethod
    def from_settings(cls) -> "PolicyConfig":
        return cls(
            version=settings.policy_version,
            challenge_risk=settings.policy_challenge_risk,
            throttle_risk=settings.policy_throttle_risk,
            quarantine_risk=settings.policy_quarantine_risk,
            reject_risk=settings.policy_reject_risk,
            anomaly_challenge=settings.policy_anomaly_challenge,
            coordination_threshold=settings.policy_coordination_threshold,
            corroboration_risk=settings.policy_corroboration_risk,
            corroboration_anomaly=settings.policy_corroboration_anomaly,
            coordination_repeat_count=settings.policy_coordination_repeat_count,
            campaign_min_sessions=settings.policy_campaign_min_sessions,
            hard_evidence=frozenset(x.strip() for x in settings.policy_hard_evidence.split(",") if x.strip()),
        )

    def ttl_seconds(self, action: str) -> int | None:
        return {
            "CHALLENGE": settings.policy_ttl_challenge_seconds,
            "THROTTLE": settings.policy_ttl_throttle_seconds,
            "QUARANTINE": settings.policy_ttl_quarantine_seconds,
            "REJECT": settings.policy_ttl_reject_seconds,
        }.get(action)


@dataclass(frozen=True)
class History:
    """Prior signals for the same session (from stored decisions) plus campaign size, supplied by the caller."""
    max_risk: float | None = None
    max_anomaly: float | None = None
    coordination_events: int = 0  # prior high-coordination events for this session
    campaign_sessions: int = 0  # distinct sessions already flagged in this campaign (excluding this one)


@dataclass
class Outcome:
    action: str
    reason: str
    rules_fired: list[str] = field(default_factory=list)

    @property
    def severity(self) -> int:
        return SEVERITY[self.action]


def _ge(value: float | None, threshold: float) -> bool:
    return value is not None and value >= threshold


def evaluate_risk_event(event: dict, history: History, cfg: PolicyConfig) -> Outcome:
    """event: dict with risk_score/anomaly_score/coordination_score (nullable), evidence list, campaign_id."""
    risk, anom, coord = event.get("risk_score"), event.get("anomaly_score"), event.get("coordination_score")
    evidence = list(event.get("evidence") or [])
    candidates: list[tuple[str, str, str]] = []  # (action, rule, reason)

    hard = sorted(cfg.hard_evidence.intersection(evidence))
    if hard:
        candidates.append(("REJECT", "R1_HARD_EVIDENCE", f"hard evidence present: {', '.join(hard)}"))

    corroborated_now = _ge(risk, cfg.corroboration_risk) or _ge(anom, cfg.corroboration_anomaly)
    corroborated_hist = _ge(history.max_risk, cfg.corroboration_risk) or _ge(history.max_anomaly, cfg.corroboration_anomaly)
    if _ge(risk, cfg.reject_risk) and (_ge(anom, cfg.anomaly_challenge) or _ge(coord, cfg.coordination_threshold)):
        candidates.append(("REJECT", "R2_EXTREME_RISK_CORROBORATED", f"risk_score={risk} >= {cfg.reject_risk} corroborated by anomaly/coordination"))
    if _ge(risk, cfg.quarantine_risk):
        candidates.append(("QUARANTINE", "R3_RISK_QUARANTINE", f"risk_score={risk} >= {cfg.quarantine_risk}"))
    elif _ge(risk, cfg.throttle_risk):
        candidates.append(("THROTTLE", "R3_RISK_THROTTLE", f"risk_score={risk} >= {cfg.throttle_risk}"))
    elif _ge(risk, cfg.challenge_risk):
        candidates.append(("CHALLENGE", "R3_RISK_CHALLENGE", f"risk_score={risk} >= {cfg.challenge_risk}"))

    # Anomaly alone is weak evidence (unusual != malicious): capped at CHALLENGE.
    if _ge(anom, cfg.anomaly_challenge):
        candidates.append(("CHALLENGE", "R4_ANOMALY_CHALLENGE", f"anomaly_score={anom} >= {cfg.anomaly_challenge} (anomaly alone capped at CHALLENGE)"))

    # Coordination alone is NOT reliable enough to quarantine (P2 data contains human+human pairs): capped at THROTTLE
    # unless corroborated by risk/anomaly (now or earlier) or repeated across events.
    if _ge(coord, cfg.coordination_threshold):
        repeated = history.coordination_events + 1 >= cfg.coordination_repeat_count
        if corroborated_now or corroborated_hist:
            candidates.append(("QUARANTINE", "R5_COORDINATION_CORROBORATED", f"coordination_score={coord} >= {cfg.coordination_threshold} corroborated by risk/anomaly"))
        elif repeated:
            candidates.append(("QUARANTINE", "R5_COORDINATION_REPEATED", f"coordination_score={coord} >= {cfg.coordination_threshold} seen {history.coordination_events + 1} times (>= {cfg.coordination_repeat_count})"))
        else:
            candidates.append(("THROTTLE", "R5_COORDINATION_ONLY", f"coordination_score={coord} >= {cfg.coordination_threshold}; coordination-only evidence capped at THROTTLE"))
        if event.get("campaign_id") and history.campaign_sessions + 1 >= cfg.campaign_min_sessions:
            candidates.append(("THROTTLE", "R6_CAMPAIGN_SIZE", f"campaign {event.get('campaign_id')} has >= {cfg.campaign_min_sessions} flagged sessions"))

    if not candidates:
        return Outcome("NORMAL", "no policy rule matched the supplied evidence", [])
    best = max(candidates, key=lambda c: (SEVERITY[c[0]], c[1]))
    fired = [c[1] for c in sorted(candidates, key=lambda c: (-SEVERITY[c[0]], c[1]))]
    return Outcome(best[0], best[2], fired)
