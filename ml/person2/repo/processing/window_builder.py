from typing import List

import pandas as pd

WINDOW_SIZES_SECONDS = [5, 10]


def build_fixed_windows(df: pd.DataFrame, window_sizes: List[int] = WINDOW_SIZES_SECONDS) -> pd.DataFrame:
    if df.empty:
        return df.copy()

    windows = []
    for session_id, group in df.groupby("session_id"):
        ordered = group.sort_values("timestamp").copy()
        session_start = ordered["timestamp"].min()

        for window_size in window_sizes:
            window_ms = window_size * 1000
            temp = ordered.copy()
            temp["window_size_seconds"] = window_size
            temp["window_index"] = ((temp["timestamp"] - session_start) // window_ms).astype(int)
            temp["analysis_unit_id"] = (
                temp["session_id"]
                + f"_win{window_size}_"
                + temp["window_index"].astype(str)
            )
            windows.append(temp)

        full_window = ordered.copy()
        full_window["window_size_seconds"] = -1
        full_window["window_index"] = 0
        full_window["analysis_unit_id"] = full_window["session_id"] + "_full"
        windows.append(full_window)

    return pd.concat(windows, ignore_index=True)
