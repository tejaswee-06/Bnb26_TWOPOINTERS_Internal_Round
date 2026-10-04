from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional

SUPPORTED_EVENT_TYPES = {
    "click": "tap_click",
    "tap": "tap_click",
    "mousemove": "move_drag",
    "drag": "move_drag",
    "scroll": "scroll_swipe",
    "swipe": "scroll_swipe",
    "keydown": "keydown_input",
    "input": "keydown_input",
    "focus": "focus_change",
    "blur": "focus_change",
    "pageview": "page_screen_change",
    "navigation": "page_screen_change",
    "idle_start": "idle_start",
    "idle_end": "idle_end",
}


@dataclass
class UnifiedEvent:
    session_id: str
    platform: str
    event_type: str
    timestamp_ms: int
    target_id: str = ""
    x_norm: Optional[float] = None
    y_norm: Optional[float] = None
    actor_type: str = "human"
    bot_type: str = "none"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def normalize_event_type(event_type: str) -> str:
    return SUPPORTED_EVENT_TYPES.get(event_type, event_type)


def normalize_coordinate(value: Any, viewport_extent: Optional[float]) -> Optional[float]:
    if value is None or viewport_extent in (None, 0):
        return None

    try:
        numeric_value = float(value)
        return max(0.0, min(1.0, numeric_value / float(viewport_extent)))
    except (TypeError, ValueError):
        return None


def build_unified_event(payload: Dict[str, Any], platform: str = "web") -> UnifiedEvent:
    return UnifiedEvent(
        session_id=str(payload.get("session_id", "")),
        platform=platform,
        event_type=normalize_event_type(str(payload.get("event_type", ""))),
        timestamp_ms=int(payload.get("timestamp", 0)),
        target_id=str(payload.get("target_id", "")),
        x_norm=normalize_coordinate(payload.get("x"), payload.get("viewport_width")),
        y_norm=normalize_coordinate(payload.get("y"), payload.get("viewport_height")),
        actor_type=str(payload.get("actor_type", "human")),
        bot_type=str(payload.get("bot_type", "none")),
    )
