from pathlib import Path

import pandas as pd

from artifact_store import resolve_artifact_path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_FILE = PROJECT_ROOT / "data" / "features.csv"
DROP_COLUMNS = ["session_id", "actor_type", "bot_type", "label", "start_time"]


def load_training_dataset(data_file: Path = DEFAULT_DATA_FILE):
    data_file = resolve_artifact_path(data_file)
    if not data_file.exists():
        print(f"Feature file not found: {data_file}")
        return None

    df = pd.read_csv(data_file)
    if df.empty:
        print("Feature file is empty. Generate sessions and rerun feature extraction first.")
        return None

    missing_columns = set(DROP_COLUMNS) - set(df.columns)
    if missing_columns:
        print(f"Missing required columns in features.csv: {sorted(missing_columns)}")
        return None

    label_counts = df["label"].value_counts()
    if len(label_counts) < 2:
        print("Training requires both human and bot sessions.")
        print("Current label counts:")
        print(label_counts.to_string())
        return None

    if label_counts.min() < 2:
        print("Each class needs at least 2 sessions for a train/test split.")
        print("Current label counts:")
        print(label_counts.to_string())
        return None

    return df


def split_features_and_labels(df: pd.DataFrame):
    X = df.drop(columns=DROP_COLUMNS)
    y = df["label"]
    return X, y

