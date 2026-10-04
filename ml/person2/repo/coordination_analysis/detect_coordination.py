from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from artifact_store import resolve_artifact_path, write_matplotlib_figure
from detection.coordination_engine import build_similarity_matrix, cluster_pairs, find_suspicious_pairs, select_candidate_sessions

WINDOW_FEATURES_FILE = PROJECT_ROOT / "data" / "window_features.csv"
SESSION_FEATURES_FILE = PROJECT_ROOT / "data" / "features.csv"
HEATMAP_FILE = PROJECT_ROOT / "coordination_analysis" / "similarity_matrix.png"


def preferred_features_file():
    window_file = resolve_artifact_path(WINDOW_FEATURES_FILE)
    if window_file.exists():
        return window_file
    return resolve_artifact_path(SESSION_FEATURES_FILE)


def load_features():
    features_file = preferred_features_file()
    if not features_file.exists():
        print(f"Feature file not found: {features_file}")
        return None

    df = pd.read_csv(features_file)
    if df.empty:
        print("Feature file is empty. Run feature extraction after collecting sessions.")
        return None

    required_columns = {"session_id", "actor_type", "bot_type", "label", "start_time"}
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        print(f"Missing required columns in features.csv: {sorted(missing_columns)}")
        print("Rerun feature extraction so coordination analysis has start times.")
        return None

    return df


def save_heatmap(similarity_matrix):
    figure, axis = plt.subplots(figsize=(6, 5))
    image = axis.imshow(similarity_matrix, cmap="hot", interpolation="nearest")
    figure.colorbar(image, ax=axis, label="Cosine similarity")
    axis.set_title("Bot Window Similarity Matrix")
    figure.tight_layout()
    saved_to = write_matplotlib_figure(figure, HEATMAP_FILE, dpi=150)
    plt.close(figure)
    print(f"Saved similarity heatmap to {saved_to}")


def unique_session_pairs(candidate_df, pairs):
    deduped = {}
    for i, j, similarity, time_gap in pairs:
        left = candidate_df.iloc[i]
        right = candidate_df.iloc[j]
        if left["session_id"] == right["session_id"]:
            continue
        key = tuple(sorted([left["session_id"], right["session_id"]]))
        current = deduped.get(key)
        if current is None or similarity > current[2] or (similarity == current[2] and time_gap < current[3]):
            deduped[key] = (i, j, similarity, time_gap)
    return list(deduped.values())


def main():
    df = load_features()
    if df is None:
        return

    candidate_df = select_candidate_sessions(df)
    if candidate_df.empty:
        print("No bot windows found in the selected feature file.")
        print("Run the Selenium bot scripts, regenerate features.csv, and rerun coordination analysis.")
        return

    similarity_matrix = build_similarity_matrix(candidate_df)
    save_heatmap(similarity_matrix)

    raw_pairs = find_suspicious_pairs(candidate_df, similarity_matrix)
    pairs = unique_session_pairs(candidate_df, raw_pairs)
    if not pairs:
        print("No coordinated bot pairs found with the current thresholds.")
        return

    print("=== Suspicious Bot Pairs ===")
    for i, j, similarity, time_gap in pairs:
        left = candidate_df.iloc[i]
        right = candidate_df.iloc[j]
        print(
            f"{left['session_id']} ({left['bot_type']}) <-> {right['session_id']} ({right['bot_type']}) | "
            f"similarity={similarity:.3f}, start_gap={time_gap:.3f}s"
        )

    print("=== Coordinated Bot Groups ===")
    for index, group in enumerate(cluster_pairs(pairs), start=1):
        print(f"Group {index}:")
        seen_sessions = set()
        for member in sorted(group):
            row = candidate_df.iloc[member]
            if row["session_id"] in seen_sessions:
                continue
            seen_sessions.add(row["session_id"])
            print(
                f"  Session: {row['session_id']} | actor={row['actor_type']} | "
                f"bot_type={row['bot_type']} | start_time={row['start_time']:.3f}"
            )


if __name__ == "__main__":
    main()
