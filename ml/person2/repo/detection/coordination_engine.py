import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

METADATA_COLUMNS = ["analysis_unit_id", "session_id", "actor_type", "bot_type", "label", "window_size_seconds", "window_index"]
BEHAVIOR_EXCLUDE_COLUMNS = METADATA_COLUMNS + ["start_time"]
SIMILARITY_THRESHOLD = 0.9
TIME_THRESHOLD = 5.0


def select_candidate_sessions(df: pd.DataFrame) -> pd.DataFrame:
    if "label" in df.columns:
        return df[df["label"] == "bot"].reset_index(drop=True)
    return df[df["actor_type"] == "bot"].reset_index(drop=True)


def build_similarity_matrix(df: pd.DataFrame):
    numeric_features = (
        df.drop(columns=BEHAVIOR_EXCLUDE_COLUMNS, errors="ignore")
        .select_dtypes(include="number")
        .fillna(0.0)
    )
    if numeric_features.empty:
        return []
    return cosine_similarity(numeric_features)


def find_suspicious_pairs(df: pd.DataFrame, similarity_matrix, similarity_threshold: float = SIMILARITY_THRESHOLD, time_threshold: float = TIME_THRESHOLD):
    pairs = []
    for i in range(len(similarity_matrix)):
        for j in range(i + 1, len(similarity_matrix)):
            similarity = similarity_matrix[i][j]
            time_gap = abs(df.iloc[i]["start_time"] - df.iloc[j]["start_time"])
            if similarity > similarity_threshold and time_gap < time_threshold:
                pairs.append((i, j, similarity, time_gap))
    return pairs


def cluster_pairs(pairs):
    adjacency = {}
    for i, j, _, _ in pairs:
        adjacency.setdefault(i, set()).add(j)
        adjacency.setdefault(j, set()).add(i)

    groups = []
    visited = set()
    for node in adjacency:
        if node in visited:
            continue
        stack = [node]
        group = set()
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            group.add(current)
            stack.extend(adjacency.get(current, set()) - visited)
        if len(group) > 1:
            groups.append(group)
    return groups

