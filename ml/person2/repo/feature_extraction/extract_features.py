from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from artifact_store import resolve_artifact_path
from processing.feature_engine import FEATURE_COLUMNS, extract_features_to_csv, extract_window_features_to_csv, save_feature_dataframe

INPUT_FILE = PROJECT_ROOT / "data" / "events.csv"
OUTPUT_FILE = PROJECT_ROOT / "data" / "features.csv"
WINDOW_OUTPUT_FILE = PROJECT_ROOT / "data" / "window_features.csv"


def main():
    try:
        features_df = extract_features_to_csv(INPUT_FILE, OUTPUT_FILE)
        window_features_df = extract_window_features_to_csv(INPUT_FILE, WINDOW_OUTPUT_FILE)
    except FileNotFoundError:
        print(f"Input file not found: {INPUT_FILE}")
        return

    if features_df.empty:
        empty_df = features_df.reindex(columns=FEATURE_COLUMNS)
        saved_to = save_feature_dataframe(empty_df, OUTPUT_FILE)
        print(f"No valid events found. Created empty feature file at {saved_to}")
        return

    print(f"Feature extraction complete. Saved session features to {resolve_artifact_path(OUTPUT_FILE)}")
    print(features_df)
    print(f"Window feature extraction complete. Saved to {resolve_artifact_path(WINDOW_OUTPUT_FILE)}")
    print(window_features_df.head())


if __name__ == "__main__":
    main()
