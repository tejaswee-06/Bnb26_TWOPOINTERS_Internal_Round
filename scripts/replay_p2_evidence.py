#!/usr/bin/env python3
"""EVALUATION / DEMO ONLY — replay a real Person-2 model output onto a REAL live session id.

Why this exists: Person 2's exported JSON describes simulator sessions (sim_* / dashed UUID ids), which are not live customers, so the backend's pull-sync
(POST /integration/ml/sync) correctly refuses to apply them. To exercise the production path RiskEvent -> deterministic policy -> recorded decision
-> enforcement end to end, this script takes the *actual* scores Person 2's models produced for a simulator session and posts them to
/integration/risk-events with the live session id. The event is explicitly tagged in its evidence list (`demo_replay_source=<sim id>`,
`evaluation_replay`) so every recorded PolicyDecision shows where the evidence came from. Nothing is fabricated: scores are copied verbatim.
Never wired into the product UI.
"""
import argparse, json, os, sys, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ML_JSON = os.path.join(ROOT, "fairdrop_ml_output.json")


def load_p2_sessions():
    with open(ML_JSON) as f:
        return {s["SIM_SESSION_ID"]: s for s in json.load(f)["sessions"]}


def p2_coordination_event() -> dict:
    with open(ML_JSON) as f:
        return json.load(f)["risk_events"][0]


def build_event(live_session_id: str, p2_session: dict, event_id: str | None = None, extra_evidence: list[str] | None = None, with_coordination: bool = False) -> dict:
    sim = p2_session["SIM_SESSION_ID"]
    co = p2_coordination_event() if with_coordination else None  # a real P2 coordination output, copied verbatim
    return {
        "session_id": live_session_id,
        "event_id": event_id or f"replay_{sim}_{live_session_id[:8]}",
        "risk_score": p2_session["MODEL1_BOT_PROBABILITY"],
        "anomaly_score": p2_session["MODEL2_ANOMALY_SCORE"],
        "coordination_score": co["coordination_score"] if co else None,
        "campaign_id": co["campaign_id"] if co else None,
        "attack_type": co["attack_type"] if co else None,
        "evidence": [f"demo_replay_source={sim}", "evaluation_replay", *((co["evidence"] + [f"demo_replay_coordination_source={co['event_id']}"]) if co else []), *(extra_evidence or [])],
        "model_version": "p2_model1+model2_replay",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def post(base: str, key: str, event: dict) -> dict:
    req = urllib.request.Request(base.rstrip("/") + "/integration/risk-events", data=json.dumps(event).encode(), method="POST",
                                 headers={"content-type": "application/json", **({"x-integration-key": key} if key else {})})
    with urllib.request.urlopen(req, timeout=10) as r:  # noqa: S310
        return json.loads(r.read())


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--live-session-id", required=True)
    ap.add_argument("--p2-session", required=True, help="simulator session id from fairdrop_ml_output.json, e.g. sim_1_0005")
    ap.add_argument("--with-coordination", action="store_true", help="also attach the first real P2 coordination output (needed for REJECT: extreme risk must be corroborated)")
    ap.add_argument("--backend", default=os.environ.get("FAIRDROP_API_URL", "http://127.0.0.1:8000"))
    ap.add_argument("--integration-key", default=os.environ.get("FAIRDROP_INTEGRATION_KEY", ""))
    a = ap.parse_args()
    s = load_p2_sessions().get(a.p2_session)
    if not s:
        sys.exit(f"unknown P2 session {a.p2_session}")
    print(json.dumps(post(a.backend, a.integration_key, build_event(a.live_session_id, s, with_coordination=a.with_coordination)), indent=2))
