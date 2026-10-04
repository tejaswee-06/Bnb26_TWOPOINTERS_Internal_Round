from pathlib import Path
from typing import Dict, List

import pandas as pd

from artifact_store import write_dataframe_artifact

from processing.fingerprint_engine import build_symbol_sequence, ngram_counts, repetition_score, sequence_entropy
from processing.window_builder import build_fixed_windows

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT_FILE = PROJECT_ROOT / "data" / "events.csv"
DEFAULT_OUTPUT_FILE = PROJECT_ROOT / "data" / "features.csv"
DEFAULT_WINDOW_OUTPUT_FILE = PROJECT_ROOT / "data" / "window_features.csv"
NGRAM_FEATURES = ["CC", "CK", "CS", "CM", "KC", "KK", "KS", "MC", "MS", "SC", "SK", "SS"]
IDLE_GAP_THRESHOLD_SECONDS = 1.5

FEATURE_COLUMNS = [
    "session_id",
    "actor_type",
    "bot_type",
    "total_events",
    "click_count",
    "scroll_count",
    "keydown_count",
    "mousemove_count",
    "mean_interval",
    "std_interval",
    "min_interval",
    "max_interval",
    "start_time",
    "session_duration",
    "event_rate",
    "click_ratio",
    "scroll_ratio",
    "keydown_ratio",
    "mousemove_ratio",
    "idle_ratio",
    "longest_idle_gap",
    "sequence_entropy",
    "repetition_score",
] + [f"bigram_{feature}" for feature in NGRAM_FEATURES] + [
    "label",
]

WINDOW_FEATURE_COLUMNS = [
    "analysis_unit_id",
    "window_size_seconds",
    "window_index",
] + FEATURE_COLUMNS


def load_events(input_file: Path = DEFAULT_INPUT_FILE) -> pd.DataFrame:
    if not input_file.exists():
        raise FileNotFoundError(f"Input file not found: {input_file}")

    df = pd.read_csv(input_file)
    if "actor_type" not in df.columns:
        df["actor_type"] = "human"
    if "bot_type" not in df.columns:
        df["bot_type"] = "none"

    df["actor_type"] = df["actor_type"].fillna("human")
    df["bot_type"] = df["bot_type"].fillna("none")
    df["timestamp"] = pd.to_numeric(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["session_id", "event_type", "timestamp"])
    return df


def _bigram_features(symbols: List[str]) -> Dict[str, float]:
    counts = ngram_counts(symbols, n=2)
    total = sum(counts.values())
    return {
        f"bigram_{feature}": (counts.get(feature, 0) / total if total else 0.0)
        for feature in NGRAM_FEATURES
    }


def extract_session_features(group: pd.DataFrame) -> Dict:
    group = group.sort_values("timestamp").copy()

    session_id = group["session_id"].iloc[0]
    actor_type = group["actor_type"].iloc[0]
    bot_type = group["bot_type"].iloc[0]

    total_events = len(group)
    click_count = int((group["event_type"] == "click").sum())
    scroll_count = int((group["event_type"] == "scroll").sum())
    keydown_count = int((group["event_type"] == "keydown").sum())
    mousemove_count = int((group["event_type"] == "mousemove").sum())

    group["time_diff"] = group["timestamp"].diff() / 1000.0
    valid_time_diffs = group["time_diff"].fillna(0).clip(lower=0)

    mean_interval = group["time_diff"].mean()
    std_interval = group["time_diff"].std()
    min_interval = group["time_diff"].min()
    max_interval = group["time_diff"].max()

    start_time = group["timestamp"].min() / 1000.0
    session_duration = (group["timestamp"].max() - group["timestamp"].min()) / 1000.0
    event_rate = total_events / session_duration if session_duration > 0 else 0.0

    click_ratio = click_count / total_events if total_events else 0.0
    scroll_ratio = scroll_count / total_events if total_events else 0.0
    keydown_ratio = keydown_count / total_events if total_events else 0.0
    mousemove_ratio = mousemove_count / total_events if total_events else 0.0

    total_idle_time = valid_time_diffs.where(valid_time_diffs >= IDLE_GAP_THRESHOLD_SECONDS, 0).sum()
    idle_ratio = total_idle_time / session_duration if session_duration > 0 else 0.0
    longest_idle_gap = valid_time_diffs.max()

    symbols = build_symbol_sequence(group["event_type"].tolist())
    entropy = sequence_entropy(symbols)
    repeat_score = repetition_score(symbols)
    bigrams = _bigram_features(symbols)

    label = "human" if actor_type == "human" else "bot"

    return {
        "session_id": session_id,
        "actor_type": actor_type,
        "bot_type": bot_type,
        "total_events": total_events,
        "click_count": click_count,
        "scroll_count": scroll_count,
        "keydown_count": keydown_count,
        "mousemove_count": mousemove_count,
        "mean_interval": float(mean_interval) if pd.notnull(mean_interval) else 0.0,
        "std_interval": float(std_interval) if pd.notnull(std_interval) else 0.0,
        "min_interval": float(min_interval) if pd.notnull(min_interval) else 0.0,
        "max_interval": float(max_interval) if pd.notnull(max_interval) else 0.0,
        "start_time": float(start_time),
        "session_duration": float(session_duration),
        "event_rate": float(event_rate),
        "click_ratio": float(click_ratio),
        "scroll_ratio": float(scroll_ratio),
        "keydown_ratio": float(keydown_ratio),
        "mousemove_ratio": float(mousemove_ratio),
        "idle_ratio": float(idle_ratio),
        "longest_idle_gap": float(longest_idle_gap) if pd.notnull(longest_idle_gap) else 0.0,
        "sequence_entropy": float(entropy),
        "repetition_score": float(repeat_score),
        **bigrams,
        "label": label,
    }


def build_feature_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=FEATURE_COLUMNS)

    session_features: List[Dict] = []
    for _, group in df.groupby("session_id"):
        session_features.append(extract_session_features(group))

    features_df = pd.DataFrame(session_features)
    return features_df.reindex(columns=FEATURE_COLUMNS)


def build_window_feature_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=WINDOW_FEATURE_COLUMNS)

    windows_df = build_fixed_windows(df)
    window_features: List[Dict] = []
    for analysis_unit_id, group in windows_df.groupby("analysis_unit_id"):
        features = extract_session_features(group)
        features["analysis_unit_id"] = analysis_unit_id
        features["window_size_seconds"] = int(group["window_size_seconds"].iloc[0])
        features["window_index"] = int(group["window_index"].iloc[0])
        window_features.append(features)

    result_df = pd.DataFrame(window_features)
    return result_df.reindex(columns=WINDOW_FEATURE_COLUMNS)


def save_feature_dataframe(features_df: pd.DataFrame, output_file: Path = DEFAULT_OUTPUT_FILE) -> Path:
    return write_dataframe_artifact(features_df, output_file, index=False)


def extract_features_to_csv(input_file: Path = DEFAULT_INPUT_FILE, output_file: Path = DEFAULT_OUTPUT_FILE) -> pd.DataFrame:
    events_df = load_events(input_file)
    features_df = build_feature_dataframe(events_df)
    save_feature_dataframe(features_df, output_file)
    return features_df


def extract_window_features_to_csv(input_file: Path = DEFAULT_INPUT_FILE, output_file: Path = DEFAULT_WINDOW_OUTPUT_FILE) -> pd.DataFrame:
    events_df = load_events(input_file)
    features_df = build_window_feature_dataframe(events_df)
    save_feature_dataframe(features_df, output_file)
    return features_df
