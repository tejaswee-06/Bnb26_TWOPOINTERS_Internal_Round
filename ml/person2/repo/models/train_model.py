from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split

from artifact_store import remove_artifact_variants, resolve_artifact_path, write_joblib_artifact, write_json_artifact, write_matplotlib_figure
from detection.individual_model import load_training_dataset, split_features_and_labels

MODEL_FILE = PROJECT_ROOT / "models" / "bot_model.pkl"
LOGISTIC_MODEL_FILE = PROJECT_ROOT / "models" / "logistic_model.pkl"
IMPORTANCE_PLOT = PROJECT_ROOT / "models" / "feature_importance.png"
METRICS_FILE = PROJECT_ROOT / "models" / "session_metrics.json"
ARTIFACTS = [MODEL_FILE, LOGISTIC_MODEL_FILE, IMPORTANCE_PLOT]


def reset_artifacts(message, extra=None):
    METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    remove_artifact_variants(ARTIFACTS + [METRICS_FILE])

    payload = {
        "status": "unavailable",
        "message": message,
        "dataset_rows": 0,
        "train_rows": 0,
        "test_rows": 0,
        "label_counts": {},
        "logistic_accuracy": None,
        "random_forest_accuracy": None,
        "xgboost_accuracy": None,
    }
    if extra:
        payload.update(extra)
    write_json_artifact(payload, METRICS_FILE)


def evaluate_model(name, model, X_test, y_test):
    y_pred = model.predict(X_test)
    accuracy = (y_pred == y_test).mean()
    print(f"=== {name} Accuracy ===")
    print(f"{accuracy:.4f}")
    print(f"Predictions: {list(y_pred)}")
    print(f"Actual: {list(y_test)}")
    return accuracy


def save_feature_importance(model, feature_names):
    IMPORTANCE_PLOT.parent.mkdir(parents=True, exist_ok=True)
    importances = pd.Series(model.feature_importances_, index=feature_names).sort_values()
    figure, axis = plt.subplots(figsize=(8, 5))
    axis.barh(importances.index, importances.values)
    axis.set_xlabel("Importance")
    axis.set_title("Random Forest Feature Importance")
    figure.tight_layout()
    saved_to = write_matplotlib_figure(figure, IMPORTANCE_PLOT, dpi=150)
    plt.close(figure)
    print(f"Saved feature importance plot to {saved_to}")
    print("=== Feature Importance ===")
    print(importances.sort_values(ascending=False).to_string())


def train_xgboost_if_available(X_train, X_test, y_train, y_test):
    try:
        from xgboost import XGBClassifier
    except ImportError:
        print("XGBoost not installed, so comparison was skipped.")
        return None

    label_map = {"human": 0, "bot": 1}
    model = XGBClassifier(use_label_encoder=False, eval_metric="logloss", random_state=42)
    model.fit(X_train, y_train.map(label_map))
    y_pred = pd.Series(model.predict(X_test), index=y_test.index).map({0: "human", 1: "bot"})
    accuracy = (y_pred == y_test).mean()
    print("=== XGBoost Accuracy ===")
    print(f"{accuracy:.4f}")
    return accuracy


def main():
    df = load_training_dataset()
    if df is None:
        reset_artifacts("Training data is unavailable or incomplete.")
        return

    X, y = split_features_and_labels(df)
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    logistic_model = LogisticRegression(max_iter=1000, random_state=42)
    logistic_model.fit(X_train, y_train)
    logistic_accuracy = evaluate_model("Logistic Regression", logistic_model, X_test, y_test)
    LOGISTIC_MODEL_FILE.parent.mkdir(parents=True, exist_ok=True)
    write_joblib_artifact(logistic_model, LOGISTIC_MODEL_FILE)

    rf_model = RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42)
    rf_model.fit(X_train, y_train)
    rf_accuracy = evaluate_model("Random Forest", rf_model, X_test, y_test)
    write_joblib_artifact(rf_model, MODEL_FILE)
    save_feature_importance(rf_model, X.columns)

    xgb_accuracy = train_xgboost_if_available(X_train, X_test, y_train, y_test)

    print("=== Model Comparison ===")
    print(f"Logistic Regression: {logistic_accuracy:.4f}")
    print(f"Random Forest: {rf_accuracy:.4f}")
    if xgb_accuracy is not None:
        print(f"XGBoost: {xgb_accuracy:.4f}")

    write_json_artifact(
        {
            "status": "ready",
            "message": "Session model trained successfully.",
            "dataset_rows": int(len(df)),
            "train_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "label_counts": {str(label): int(count) for label, count in y.value_counts().to_dict().items()},
            "logistic_accuracy": round(float(logistic_accuracy), 4),
            "random_forest_accuracy": round(float(rf_accuracy), 4),
            "xgboost_accuracy": round(float(xgb_accuracy), 4) if xgb_accuracy is not None else None,
            "feature_columns": list(X.columns),
        },
        METRICS_FILE,
    )
    print(f"Saved session metrics to {resolve_artifact_path(METRICS_FILE)}")


if __name__ == "__main__":
    main()
