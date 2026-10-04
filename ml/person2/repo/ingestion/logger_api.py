from pathlib import Path
from typing import Dict, Iterable, Optional
import json

from ingestion.event_schema import build_unified_event
from ingestion.validators import validate_event_payload

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_EVENT_LOG = PROJECT_ROOT / "storage" / "raw_events" / "events.jsonl"


def append_event(payload: Dict, platform: str = "web", raw_log_path: Optional[Path] = None) -> Dict:
    errors = validate_event_payload(payload)
    if errors:
        return {"status": "error", "errors": errors}

    event = build_unified_event(payload, platform=platform)
    destination = raw_log_path or RAW_EVENT_LOG
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event.to_dict()) + "\n")

    return {"status": "ok", "event": event.to_dict()}


def append_events(payloads: Iterable[Dict], platform: str = "web") -> Dict:
    results = [append_event(payload, platform=platform) for payload in payloads]
    return {"status": "ok", "count": len(results), "results": results}
