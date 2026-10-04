from typing import Dict, Iterable


def fuse_risk(rule_score: float, model_score: float, coordination_score: float) -> float:
    bounded_rule = max(0.0, min(1.0, float(rule_score)))
    bounded_model = max(0.0, min(1.0, float(model_score)))
    bounded_coordination = max(0.0, min(1.0, float(coordination_score)))
    return min(1.0, 0.2 * bounded_rule + 0.4 * bounded_model + 0.4 * bounded_coordination)


def build_alert(
    session_id: str,
    individual_bot_score: float,
    coordination_score: float,
    reasons: Iterable[str],
    rule_score_value: float | None = None,
) -> Dict:
    reasons_list = list(reasons)
    normalized_rule_score = rule_score_value if rule_score_value is not None else (1.0 if reasons_list else 0.0)
    final_risk = fuse_risk(normalized_rule_score, individual_bot_score, coordination_score)
    return {
        "session_id": session_id,
        "individual_bot_score": individual_bot_score,
        "coordination_score": coordination_score,
        "final_risk": final_risk,
        "reasons": reasons_list,
    }
