
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import json

# ---------------------------------------------------------
# Fair Drop Person 2 — ML API
# ---------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "fairdrop_ml_output.json"

with open(DATA_FILE, "r", encoding="utf-8") as f:
    ML_DATA = json.load(f)

app = FastAPI(
    title="Fair Drop ML API",
    version="1.0.0"
)

# Allow the frontend to call this API during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "service": "Fair Drop ML",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/ml/summary")
def get_summary():
    return ML_DATA["summary"]


@app.get("/ml/simulation")
def get_simulation():
    return {
        "count": len(ML_DATA["sessions"]),
        "sessions": ML_DATA["sessions"]
    }


@app.get("/ml/risk-events")
def get_risk_events():
    return {
        "count": len(ML_DATA["risk_events"]),
        "risk_events": ML_DATA["risk_events"]
    }


@app.get("/ml/session/{session_id}")
def get_session(session_id: str):

    for session in ML_DATA["sessions"]:
        if str(session.get("SIM_SESSION_ID")) == session_id:
            return session

    raise HTTPException(
        status_code=404,
        detail="Session not found"
    )


@app.get("/ml/risk-event/{event_id}")
def get_risk_event(event_id: str):

    for event in ML_DATA["risk_events"]:
        if str(event.get("event_id")) == event_id:
            return event

    raise HTTPException(
        status_code=404,
        detail="RiskEvent not found"
    )


# ---------------------------------------------------------
# LIVE SIMULATOR
# ---------------------------------------------------------

LIVE_INDEX = 0


@app.get("/ml/live")
def get_live_session():

    global LIVE_INDEX

    sessions = ML_DATA["sessions"]

    if not sessions:
        return {
            "status": "empty",
            "session": None
        }

    # Send one session at a time
    session = sessions[LIVE_INDEX]

    # Move to the next session
    LIVE_INDEX = (LIVE_INDEX + 1) % len(sessions)

    return {
        "status": "ok",
        "sequence": LIVE_INDEX,
        "session": session
    }


@app.post("/ml/live/reset")
def reset_live_simulator():

    global LIVE_INDEX

    LIVE_INDEX = 0

    return {
        "status": "reset",
        "message": "Live simulator restarted",
        "next_session": 1
    }



# ---------------------------------------------------------
# LIVE RISK EVENT STREAM
# ---------------------------------------------------------

RISK_EVENT_INDEX = 0


@app.get("/ml/live-risk-event")
def get_live_risk_event():

    global RISK_EVENT_INDEX

    risk_events = ML_DATA["risk_events"]

    if not risk_events:
        return {
            "status": "empty",
            "risk_event": None
        }

    event = risk_events[RISK_EVENT_INDEX]

    RISK_EVENT_INDEX = (
        RISK_EVENT_INDEX + 1
    ) % len(risk_events)

    return {
        "status": "ok",
        "sequence": RISK_EVENT_INDEX,
        "risk_event": event
    }


@app.post("/ml/live-risk-event/reset")
def reset_live_risk_events():

    global RISK_EVENT_INDEX

    RISK_EVENT_INDEX = 0

    return {
        "status": "reset",
        "message": "RiskEvent stream restarted",
        "next_event": 1
    }



# ---------------------------------------------------------
# FRONTEND DEMO ENDPOINT
# ---------------------------------------------------------

@app.get("/ml/demo")
def get_demo():

    global LIVE_INDEX
    global RISK_EVENT_INDEX

    sessions = ML_DATA["sessions"]
    risk_events = ML_DATA["risk_events"]

    # Next simulated session
    if sessions:
        session = sessions[LIVE_INDEX]
        LIVE_INDEX = (LIVE_INDEX + 1) % len(sessions)
    else:
        session = None

    # Next campaign RiskEvent
    if risk_events:
        risk_event = risk_events[RISK_EVENT_INDEX]
        RISK_EVENT_INDEX = (
            RISK_EVENT_INDEX + 1
        ) % len(risk_events)
    else:
        risk_event = None

    return {
        "status": "ok",

        "session": {
            "source": "200_session_simulator",
            "data": session
        },

        "campaign_alert": {
            "source": "campaign_detector",
            "data": risk_event
        },

        "summary": ML_DATA["summary"]
    }

