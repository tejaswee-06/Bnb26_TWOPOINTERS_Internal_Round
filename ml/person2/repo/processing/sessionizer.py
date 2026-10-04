from typing import Dict

import pandas as pd

IDLE_TIMEOUT_SECONDS = 30.0


def sort_events(df: pd.DataFrame) -> pd.DataFrame:
    return df.sort_values(["session_id", "timestamp"]).reset_index(drop=True)


def session_bounds(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["session_id", "start_time", "end_time", "event_count"])

    grouped = df.groupby("session_id")["timestamp"]
    bounds = grouped.agg(start_time="min", end_time="max", event_count="count").reset_index()
    bounds["duration_seconds"] = (bounds["end_time"] - bounds["start_time"]) / 1000.0
    return bounds


def split_on_idle(df: pd.DataFrame, idle_timeout_seconds: float = IDLE_TIMEOUT_SECONDS) -> pd.DataFrame:
    if df.empty:
        return df.copy()

    ordered = sort_events(df).copy()
    ordered["event_gap_seconds"] = ordered.groupby("session_id")["timestamp"].diff().fillna(0) / 1000.0
    ordered["window_index"] = ordered.groupby("session_id")["event_gap_seconds"].transform(
        lambda gaps: (gaps > idle_timeout_seconds).cumsum()
    )
    ordered["window_session_id"] = ordered["session_id"] + "_w" + ordered["window_index"].astype(str)
    return ordered
