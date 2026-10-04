from typing import Any, Dict, List

REQUIRED_EVENT_FIELDS = ["session_id", "event_type", "timestamp"]


def validate_event_payload(payload: Dict[str, Any]) -> List[str]:
    errors = []
    for field in REQUIRED_EVENT_FIELDS:
        if payload.get(field) in (None, ""):
            errors.append(f"Missing required field: {field}")

    timestamp = payload.get("timestamp")
    if timestamp not in (None, ""):
        try:
            int(timestamp)
        except (TypeError, ValueError):
            errors.append("timestamp must be numeric")

    return errors
