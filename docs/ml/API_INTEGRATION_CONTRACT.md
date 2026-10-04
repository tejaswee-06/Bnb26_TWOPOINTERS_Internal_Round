
# Fair Drop — Person 2 ML API Integration Contract

## Base URL

Local development:

http://127.0.0.1:8001

---

## 1. Health Check

GET /

Purpose:
Check whether the ML service is running.

Example response:

{
  "service": "Fair Drop ML",
  "status": "running",
  "version": "1.0.0"
}

---

## 2. ML Summary

GET /ml/summary

Returns:

{
  "simulated_sessions": 200,
  "risk_events": 20,
  "campaign_strong_pairs": 20,
  "bot_bot_pairs": 16,
  "human_human_pairs": 4,
  "bot_human_pairs": 0
}

Frontend can use this for dashboard cards.

---

## 3. All Simulated Sessions

GET /ml/simulation

Returns:

{
  "count": 200,
  "sessions": [...]
}

Frontend can use this to display:

- total sessions
- human/bot simulation results
- Model 1 output
- Model 2 output
- session-level information

---

## 4. RiskEvents

GET /ml/risk-events

Returns:

{
  "count": 20,
  "risk_events": [...]
}

Each RiskEvent contains:

- session_id
- event_id
- risk_score
- anomaly_score
- coordination_score
- campaign_id
- attack_type
- evidence
- model_version
- timestamp

Frontend can use these for:

- suspicious activity table
- campaign detection panel
- risk monitoring
- evidence/details popup

---

## 5. Single Session

GET /ml/session/{session_id}

Example:

GET /ml/session/sim_1_0001

Returns the session information.

If the session does not exist:

HTTP 404

---

## 6. Single RiskEvent

GET /ml/risk-event/{event_id}

Example:

GET /ml/risk-event/risk_0001

Returns one RiskEvent.

If the event does not exist:

HTTP 404

---

# IMPORTANT ARCHITECTURE RULE

Person 2 ML provides intelligence/evidence.

ML must NOT directly:

- allocate seats
- change ticket inventory
- decide final admission
- trust a client-provided queue position

The backend policy layer decides the final action.

Example:

ML:
"Suspicious coordinated behaviour detected."

Backend policy:
"Require additional verification."

Not:

ML:
"Delete/deny the ticket."

---

# FRONTEND EXAMPLE

JavaScript:

const response = await fetch(
    "http://127.0.0.1:8001/ml/summary"
);

const data = await response.json();

console.log(data);

For RiskEvents:

const response = await fetch(
    "http://127.0.0.1:8001/ml/risk-events"
);

const data = await response.json();

console.log(data.risk_events);

---

# BACKEND INTEGRATION

The backend person can either:

1. Keep this ML API as a separate service, OR
2. Import the ML outputs directly into the main backend.

For the hackathon demo, keeping the ML service separate is recommended.

Flow:

Frontend
   |
   v
Main Backend
   |
   v
Person 2 ML API
   |
   +--> Model 1
   |
   +--> Model 2
   |
   +--> Campaign Detection
   |
   v
RiskEvents
   |
   v
Backend Policy
   |
   v
Admission / Verification / Allocation

---

# CURRENT DEMO RESULTS

Simulation:

200 sessions

Campaign detection:

20 strong suspicious pairs
16 bot + bot
4 human + human
0 bot + human

Bot-pair precision for this specific test:

80%

This is NOT a general production accuracy claim.

---

# LOCAL DEVELOPMENT

Start Person 2 ML API:

python -m uvicorn main:app --reload --port 8001

API:

http://127.0.0.1:8001

---

# HANDOFF FILE

Main data file:

fairdrop_ml_output.json

Other files:

simulator_sessions.csv
risk_events.csv
README_INTEGRATION.md

