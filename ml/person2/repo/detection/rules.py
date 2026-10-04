from typing import Dict, List

import pandas as pd


def evaluate_rule_flags(session_row: pd.Series) -> List[str]:
    reasons: List[str] = []

    if session_row.get("event_rate", 0) > 20:
        reasons.append("very high event rate")
    if session_row.get("std_interval", 0) < 0.05 and session_row.get("total_events", 0) >= 10:
        reasons.append("very low timing variance")
    if session_row.get("mousemove_count", 0) == 0 and session_row.get("click_count", 0) >= 5:
        reasons.append("many clicks without movement")
    if session_row.get("repetition_score", 0) > 0.8:
        reasons.append("high action repetition")

    return reasons


def rule_score(session_row: pd.Series) -> float:
    reasons = evaluate_rule_flags(session_row)
    if not reasons:
        return 0.0
    return min(1.0, 0.25 * len(reasons))


def score_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    scored = df.copy()
    scored["rule_reasons"] = scored.apply(evaluate_rule_flags, axis=1)
    scored["rule_score"] = scored.apply(rule_score, axis=1)
    return scored
