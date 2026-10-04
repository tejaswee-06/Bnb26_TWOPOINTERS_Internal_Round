import csv
import json
import os
import secrets
import subprocess
import sys
import time
import uuid
from pathlib import Path

import joblib
import pandas as pd
from flask import Flask, jsonify, render_template, request, session

from artifact_store import resolve_artifact_path
from detection.coordination_engine import (
    build_similarity_matrix,
    cluster_pairs,
    find_suspicious_pairs,
    select_candidate_sessions,
)
from detection.risk_fusion import build_alert
from detection.rules import evaluate_rule_flags, rule_score
from ingestion.validators import validate_event_payload

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(16))

PROJECT_ROOT = Path(__file__).resolve().parent
CSV_PATH = PROJECT_ROOT / "data" / "events.csv"
FEATURES_PATH = PROJECT_ROOT / "data" / "features.csv"
WINDOW_FEATURES_PATH = PROJECT_ROOT / "data" / "window_features.csv"
SESSION_MODEL_PATH = PROJECT_ROOT / "models" / "bot_model.pkl"
WINDOW_MODEL_PATH = PROJECT_ROOT / "models" / "window_bot_model.pkl"
SESSION_METRICS_PATH = PROJECT_ROOT / "models" / "session_metrics.json"
WINDOW_METRICS_PATH = PROJECT_ROOT / "models" / "window_metrics.json"
PYTHON_EXECUTABLE = sys.executable
SELENIUM_CACHE = PROJECT_ROOT / ".selenium"

CSV_HEADER = ["session_id", "actor_type", "bot_type", "event_type", "x", "y", "timestamp"]
LEGACY_CSV_HEADER = ["session_id", "event_type", "x", "y", "timestamp"]

PAGE_DEFINITIONS = {
    "landing": {
        "title": "Coordinated Bot Detection Platform",
        "eyebrow": "Behavioural Fingerprinting Demo",
        "headline": "A web-based coordinated bot detection platform with live behavioural risk analysis.",
        "description": "Explore the user-facing product, generate behaviour across pages, and switch to the admin dashboard to review session scores and coordinated bot alerts.",
        "page_name": "landing",
    },
    "login": {
        "title": "Sign In",
        "eyebrow": "User App",
        "headline": "Sign in flow for behavioural capture.",
        "description": "Typing, focus shifts, clicks, and navigation all contribute to the behavioural fingerprint for this session.",
        "page_name": "login",
    },
    "search": {
        "title": "Search",
        "eyebrow": "User App",
        "headline": "Search and navigation behaviour under observation.",
        "description": "Search terms, result clicks, and scroll patterns are captured as lightweight behavioural signals.",
        "page_name": "search",
    },
    "browse": {
        "title": "Browse",
        "eyebrow": "User App",
        "headline": "Content browsing page for passive and active interaction patterns.",
        "description": "Scroll depth, card exploration, and reading pauses help distinguish human browsing from automation.",
        "page_name": "browse",
    },
    "form": {
        "title": "Application Form",
        "eyebrow": "User App",
        "headline": "Form completion flow with richer input behaviour.",
        "description": "Form completion highlights keydown bursts, pauses, and click balance across a realistic workflow.",
        "page_name": "form",
    },
}
LAST_DEMO_RUN = {
    "action": "idle",
    "status": "ready",
    "message": "Dashboard controls are ready.",
    "detail": "Choose a demo action to launch a live Chrome run or refresh analytics.",
    "updated_at": None,
    "output_preview": "",
    "failed_command": "",
}


def ensure_csv_schema():
    if not CSV_PATH.exists():
        CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
        with CSV_PATH.open("w", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(CSV_HEADER)
        return

    with CSV_PATH.open("r", newline="") as handle:
        rows = list(csv.reader(handle))

    if not rows:
        with CSV_PATH.open("w", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(CSV_HEADER)
        return

    if rows[0] != LEGACY_CSV_HEADER:
        return

    migrated_rows = [CSV_HEADER]
    for row in rows[1:]:
        if len(row) < 5:
            continue
        migrated_rows.append([row[0], "human", "none", row[1], row[2], row[3], row[4]])

    with CSV_PATH.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerows(migrated_rows)


def ensure_browser_session():
    actor_type = request.args.get("actor_type")
    bot_type = request.args.get("bot_type")
    reset = request.args.get("reset_session")

    if reset == "1" or "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())
        session["actor_type"] = actor_type or "human"
        session["bot_type"] = bot_type or "none"
    else:
        if actor_type:
            session["actor_type"] = actor_type
        if bot_type:
            session["bot_type"] = bot_type

    session.setdefault("actor_type", "human")
    session.setdefault("bot_type", "none")

    return {
        "session_id": session["session_id"],
        "actor_type": session["actor_type"],
        "bot_type": session["bot_type"],
    }


def render_user_page(page_key):
    page_context = PAGE_DEFINITIONS[page_key].copy()
    browser_context = ensure_browser_session()
    return render_template(
        "page.html",
        page_key=page_key,
        page=page_context,
        browser=browser_context,
    )


def read_feature_frame(prefer_windows=False):
    window_path = resolve_artifact_path(WINDOW_FEATURES_PATH)
    path = window_path if prefer_windows and window_path.exists() else resolve_artifact_path(FEATURES_PATH)
    if not path.exists():
        return pd.DataFrame()
    try:
        return pd.read_csv(path)
    except Exception:
        return pd.DataFrame()


def load_model(path):
    path = resolve_artifact_path(path)
    if not path.exists():
        return None
    try:
        return joblib.load(path)
    except Exception:
        return None


def load_json_payload(path):
    path = resolve_artifact_path(path)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def file_updated_at(path):
    path = resolve_artifact_path(path)
    if not path.exists():
        return None
    try:
        return round(path.stat().st_mtime, 3)
    except OSError:
        return None


def humanize_action_name(action_name):
    return action_name.replace("_", " ").title()


def format_command(command):
    return " ".join(command) if command else ""


def summarize_demo_failure(action_name, command, output, timed_out=False):
    summary = f"{humanize_action_name(action_name)} could not complete."
    detail = "Review the trace below for the exact command failure."
    normalized = output.lower()

    if timed_out:
        summary = f"{humanize_action_name(action_name)} timed out."
        detail = "The task took longer than five minutes. Try the smaller actions first or rerun once the app is idle."
    elif "devtoolsactiveport" in normalized or "sessionnotcreatedexception" in normalized:
        summary = "Chrome could not start for the automated browser run."
        detail = "The demo now launches a visible Chrome window by default. If this still fails, confirm Chrome is installed and available to Selenium on this machine."
    elif "nosuchdriverexception" in normalized or "unable to obtain driver" in normalized:
        summary = "Selenium could not prepare a working Chrome driver."
        detail = "Check the local Chrome install and verify the Selenium cache directory is writable."
    elif "permissionerror" in normalized:
        summary = "A generated analytics artifact is locked by another process."
        detail = "Close any spreadsheet or file viewer that has the generated CSV, model, or metrics files open, then run the action again."
    elif "training requires both human and bot sessions" in normalized:
        summary = "Analytics refresh needs both human and bot sessions."
        detail = "Collect at least one human session and one bot session before retraining."
    elif "each class needs at least 2 sessions" in normalized or "need at least 2 unique sessions per class" in normalized:
        summary = "Analytics refresh needs more example sessions."
        detail = "Collect at least two sessions per class so the training split can run safely."
    elif "feature file is empty" in normalized or "window feature file is empty" in normalized:
        summary = "Analytics refresh did not find enough captured events to build features."
        detail = "Generate fresh user or bot activity first, then rerun the analytics refresh."
    elif "feature file not found" in normalized or "input file not found" in normalized:
        summary = "The analytics pipeline could not find its input dataset."
        detail = "Verify that event collection has started and the expected data files exist."

    return {
        "status": "error",
        "action": action_name,
        "message": summary,
        "detail": detail,
        "failed_command": format_command(command),
        "output": output.strip(),
        "output_preview": output.strip()[:1200],
    }


def model_scores(frame, model):
    if frame.empty or model is None or not hasattr(model, "feature_names_in_"):
        return {}

    feature_names = list(model.feature_names_in_)
    missing = [column for column in feature_names if column not in frame.columns]
    if missing:
        return {}

    X = frame[feature_names]
    if hasattr(model, "predict_proba"):
        classes = list(model.classes_)
        bot_index = classes.index("bot") if "bot" in classes else 1
        scores = model.predict_proba(X)[:, bot_index]
    else:
        preds = model.predict(X)
        scores = [1.0 if pred == "bot" else 0.0 for pred in preds]

    key_field = "analysis_unit_id" if "analysis_unit_id" in frame.columns else "session_id"
    return dict(zip(frame[key_field], scores))


def coordination_summary():
    feature_df = read_feature_frame(prefer_windows=True)
    if feature_df.empty:
        return pd.DataFrame(), [], []

    candidate_df = select_candidate_sessions(feature_df)
    if candidate_df.empty:
        return pd.DataFrame(), [], []

    pairs = find_suspicious_pairs(candidate_df, build_similarity_matrix(candidate_df))
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

    unique_pairs = list(deduped.values())
    groups = cluster_pairs(unique_pairs)
    return candidate_df, unique_pairs, groups


def dashboard_payload():
    session_df = read_feature_frame(prefer_windows=False)
    window_df = read_feature_frame(prefer_windows=True)
    session_model = load_model(SESSION_MODEL_PATH)
    window_model = load_model(WINDOW_MODEL_PATH)
    session_metrics = load_json_payload(SESSION_METRICS_PATH)
    window_metrics = load_json_payload(WINDOW_METRICS_PATH)

    session_scores = model_scores(session_df, session_model)
    window_scores = model_scores(window_df, window_model)
    candidate_df, coordination_pairs, coordination_groups = coordination_summary()

    coordination_sessions = set()
    group_payload = []
    if len(coordination_groups) > 0:
        for group_index, group in enumerate(coordination_groups, start=1):
            members = []
            seen_sessions = set()
            best_similarity = 0.0
            for member in sorted(group):
                row = candidate_df.iloc[member]
                best_similarity = max(
                    best_similarity,
                    max(
                        (
                            similarity
                            for i, j, similarity, _ in coordination_pairs
                            if member in (i, j)
                        ),
                        default=0.0,
                    ),
                )
                if row["session_id"] in seen_sessions:
                    continue
                seen_sessions.add(row["session_id"])
                coordination_sessions.add(row["session_id"])
                members.append(
                    {
                        "session_id": row["session_id"],
                        "bot_type": row["bot_type"],
                        "start_time": round(float(row["start_time"]), 3),
                    }
                )
            group_payload.append(
                {
                    "group_id": group_index,
                    "pair_count": sum(1 for pair in coordination_pairs if pair[0] in group or pair[1] in group),
                    "similarity": round(best_similarity, 3),
                    "members": members,
                }
            )

    session_rows = []
    if not session_df.empty:
        for _, row in session_df.sort_values("start_time", ascending=False).iterrows():
            reasons = evaluate_rule_flags(row)
            rule_risk = round(float(rule_score(row)), 3)
            individual_score = round(float(session_scores.get(row["session_id"], 0.0)), 3)
            coordination_score = 0.95 if row["session_id"] in coordination_sessions else 0.0
            if row["session_id"] in coordination_sessions:
                reasons = reasons + ["matched coordinated group"]
            alert = build_alert(
                row["session_id"],
                individual_score,
                coordination_score,
                reasons,
                rule_score_value=rule_risk,
            )
            session_rows.append(
                {
                    "session_id": row["session_id"],
                    "actor_type": row["actor_type"],
                    "bot_type": row["bot_type"],
                    "label": row["label"],
                    "start_time": round(float(row.get("start_time", 0.0)), 3),
                    "total_events": int(row.get("total_events", 0)),
                    "session_duration": round(float(row.get("session_duration", 0.0)), 3),
                    "event_rate": round(float(row.get("event_rate", 0.0)), 3),
                    "entropy": round(float(row.get("sequence_entropy", 0.0)), 3),
                    "repetition_score": round(float(row.get("repetition_score", 0.0)), 3),
                    "rule_score": rule_risk,
                    "individual_bot_score": individual_score,
                    "coordination_score": round(coordination_score, 3),
                    "final_risk": round(float(alert["final_risk"]), 3),
                    "reasons": alert["reasons"],
                }
            )

    summary = {
        "total_sessions": int(len(session_df)),
        "human_sessions": int((session_df.get("label", pd.Series(dtype=str)) == "human").sum()) if not session_df.empty else 0,
        "bot_sessions": int((session_df.get("label", pd.Series(dtype=str)) == "bot").sum()) if not session_df.empty else 0,
        "coordinated_groups": len(group_payload),
        "window_rows": int(len(window_df)),
    }

    feature_summary = {}
    if not session_df.empty:
        feature_summary = {
            "mean_event_rate": round(float(session_df["event_rate"].mean()), 3),
            "mean_entropy": round(float(session_df["sequence_entropy"].mean()), 3),
            "mean_session_duration": round(float(session_df["session_duration"].mean()), 3),
            "mean_repetition_score": round(float(session_df["repetition_score"].mean()), 3),
            "bot_mean_event_rate": round(float(session_df[session_df["label"] == "bot"]["event_rate"].mean()), 3)
            if (session_df["label"] == "bot").any()
            else 0.0,
            "human_mean_event_rate": round(float(session_df[session_df["label"] == "human"]["event_rate"].mean()), 3)
            if (session_df["label"] == "human").any()
            else 0.0,
        }

    timeline = []
    if not session_df.empty:
        for _, row in session_df.sort_values("start_time").iterrows():
            timeline.append(
                {
                    "session_id": row["session_id"],
                    "label": row["label"],
                    "bot_type": row["bot_type"],
                    "start_time": round(float(row["start_time"]), 3),
                    "event_rate": round(float(row["event_rate"]), 3),
                }
            )

    critical_sessions = sum(1 for row in session_rows if row["final_risk"] >= 0.85)
    watch_sessions = sum(1 for row in session_rows if 0.5 <= row["final_risk"] < 0.85)
    posture_level = "Stable"
    posture_detail = "Most sessions are low risk and no major synchronized clusters are dominating the stream."
    if group_payload or critical_sessions >= 3:
        posture_level = "High Alert"
        posture_detail = "The system is observing coordinated or high-confidence bot behaviour that should be reviewed immediately."
    elif watch_sessions or summary["bot_sessions"] > 0:
        posture_level = "Elevated"
        posture_detail = "Bot-like activity is present, but the current pattern is still contained and reviewable."

    return {
        "summary": summary,
        "feature_summary": feature_summary,
        "sessions": session_rows,
        "groups": group_payload,
        "timeline": timeline,
        "window_model_scores": {key: round(float(value), 3) for key, value in window_scores.items()},
        "model_metrics": {
            "session": session_metrics,
            "window": window_metrics,
        },
        "data_status": {
            "events_updated_at": file_updated_at(CSV_PATH),
            "features_updated_at": file_updated_at(FEATURES_PATH),
            "window_features_updated_at": file_updated_at(WINDOW_FEATURES_PATH),
        },
        "posture": {
            "level": posture_level,
            "critical_sessions": critical_sessions,
            "watch_sessions": watch_sessions,
            "detail": posture_detail,
        },
        "demo_status": LAST_DEMO_RUN,
    }


def run_demo_commands(commands, action_name):
    env = os.environ.copy()
    env["SE_CACHE_PATH"] = str(SELENIUM_CACHE)
    env.setdefault("BOT_DEMO_HEADLESS", "0")
    env.setdefault("BOT_DEMO_DRIVER_MODE", "browser")
    env.setdefault("PYTHONUNBUFFERED", "1")
    SELENIUM_CACHE.mkdir(parents=True, exist_ok=True)

    outputs = []
    LAST_DEMO_RUN["action"] = action_name
    LAST_DEMO_RUN["status"] = "running"
    LAST_DEMO_RUN["message"] = f"Running {humanize_action_name(action_name)}..."
    LAST_DEMO_RUN["detail"] = f"Executing {len(commands)} step(s) in sequence."
    LAST_DEMO_RUN["updated_at"] = round(time.time(), 3)
    LAST_DEMO_RUN["output_preview"] = ""
    LAST_DEMO_RUN["failed_command"] = ""

    try:
        for command in commands:
            completed = subprocess.run(
                command,
                cwd=PROJECT_ROOT,
                env=env,
                capture_output=True,
                text=True,
                errors="replace",
                timeout=300,
                check=True,
            )
            text = (completed.stdout or completed.stderr or "").strip()
            if text:
                outputs.append(text)

        LAST_DEMO_RUN["status"] = "completed"
        LAST_DEMO_RUN["message"] = f"{humanize_action_name(action_name)} completed successfully."
        LAST_DEMO_RUN["detail"] = f"Executed {len(commands)} step(s) without errors."
        LAST_DEMO_RUN["updated_at"] = round(time.time(), 3)
        LAST_DEMO_RUN["output_preview"] = "\n\n".join(outputs[-2:])[:1200]
        LAST_DEMO_RUN["failed_command"] = ""
        return {
            "status": "ok",
            "action": action_name,
            "message": LAST_DEMO_RUN["message"],
            "detail": LAST_DEMO_RUN["detail"],
            "output": "\n\n".join(outputs[-4:]),
            "output_preview": LAST_DEMO_RUN["output_preview"],
        }
    except subprocess.CalledProcessError as exc:
        error_text = (exc.stdout or "") + ("\n" if exc.stdout and exc.stderr else "") + (exc.stderr or "")
        result = summarize_demo_failure(action_name, exc.cmd, error_text)
        LAST_DEMO_RUN["status"] = "failed"
        LAST_DEMO_RUN["message"] = result["message"]
        LAST_DEMO_RUN["detail"] = result["detail"]
        LAST_DEMO_RUN["updated_at"] = round(time.time(), 3)
        LAST_DEMO_RUN["output_preview"] = result["output_preview"]
        LAST_DEMO_RUN["failed_command"] = result["failed_command"]
        return result
    except subprocess.TimeoutExpired as exc:
        result = summarize_demo_failure(action_name, exc.cmd, "Command timed out.", timed_out=True)
        LAST_DEMO_RUN["status"] = "failed"
        LAST_DEMO_RUN["message"] = result["message"]
        LAST_DEMO_RUN["detail"] = result["detail"]
        LAST_DEMO_RUN["updated_at"] = round(time.time(), 3)
        LAST_DEMO_RUN["output_preview"] = result["output_preview"]
        LAST_DEMO_RUN["failed_command"] = result["failed_command"]
        return result


ensure_csv_schema()


@app.route("/")
def home():
    return render_user_page("landing")


@app.route("/login")
def login_page():
    return render_user_page("login")


@app.route("/search")
def search_page():
    return render_user_page("search")


@app.route("/browse")
def browse_page():
    return render_user_page("browse")


@app.route("/form")
def form_page():
    return render_user_page("form")


@app.route("/dashboard")
def dashboard():
    ensure_browser_session()
    return render_template("dashboard.html")


@app.route("/api/dashboard")
def api_dashboard():
    return jsonify(dashboard_payload())


@app.route("/api/demo-action", methods=["POST"])
def api_demo_action():
    payload = request.get_json(silent=True) or {}
    action = payload.get("action", "")

    command_map = {
        "fast_bot": [[PYTHON_EXECUTABLE, "bot_simulation/fast_bot.py"]],
        "human_like_bot": [[PYTHON_EXECUTABLE, "bot_simulation/human_like_bot.py"]],
        "coordinated_bots": [[PYTHON_EXECUTABLE, "bot_simulation/coordinated_bots.py"]],
        "refresh_analytics": [
            [PYTHON_EXECUTABLE, "feature_extraction/extract_features.py"],
            [PYTHON_EXECUTABLE, "models/train_model.py"],
            [PYTHON_EXECUTABLE, "models/train_window_model.py"],
            [PYTHON_EXECUTABLE, "coordination_analysis/detect_coordination.py"],
        ],
        "full_demo": [
            [PYTHON_EXECUTABLE, "bot_simulation/fast_bot.py"],
            [PYTHON_EXECUTABLE, "bot_simulation/human_like_bot.py"],
            [PYTHON_EXECUTABLE, "bot_simulation/coordinated_bots.py"],
            [PYTHON_EXECUTABLE, "feature_extraction/extract_features.py"],
            [PYTHON_EXECUTABLE, "models/train_model.py"],
            [PYTHON_EXECUTABLE, "models/train_window_model.py"],
            [PYTHON_EXECUTABLE, "coordination_analysis/detect_coordination.py"],
        ],
    }

    if action not in command_map:
        return jsonify({"status": "error", "message": "Unknown demo action."}), 400

    result = run_demo_commands(command_map[action], action)
    return jsonify(result)


@app.route("/log", methods=["POST"])
def log():
    data = request.get_json(silent=True) or {}
    errors = validate_event_payload(data)
    if errors:
        return jsonify({"status": "error", "errors": errors}), 400

    with CSV_PATH.open("a", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                data["session_id"],
                data.get("actor_type", "human"),
                data.get("bot_type", "none"),
                data["event_type"],
                data.get("x"),
                data.get("y"),
                int(data["timestamp"]),
            ]
        )
    return {"status": "ok"}


if __name__ == "__main__":
    app.run(debug=True)
