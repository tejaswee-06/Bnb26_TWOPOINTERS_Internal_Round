
# Fair Drop — Person 2 ML Integration Package

This folder contains the ML outputs required by the Fair Drop backend
and frontend.

## Files

### fairdrop_ml_output.json
Main API-ready file.

Contains:
- simulated sessions
- RiskEvents
- campaign detection summary

### simulator_sessions.csv
Session-level simulator output.

### risk_events.csv
Detected suspicious/campaign RiskEvents.

## Backend Integration

Backend can load:

    fairdrop_ml_output.json

and expose the data through an API such as:

    GET /ml/simulation
    GET /ml/risk-events

The backend should NOT allow the ML output to directly modify
ticket inventory or seat allocation.

ML only provides intelligence/evidence.

## Frontend Integration

Frontend can display:

- total simulated users
- human/bot results
- risk score
- anomaly score
- coordination score
- campaign ID
- attack type
- evidence
- model version

Example RiskEvent fields:

    session_id
    event_id
    risk_score
    anomaly_score
    coordination_score
    campaign_id
    attack_type
    evidence
    model_version
    timestamp

## Important

ML does NOT:
- allocate seats
- change inventory
- decide final admission
- trust client queue position

The deterministic backend policy remains responsible
for the final action.
