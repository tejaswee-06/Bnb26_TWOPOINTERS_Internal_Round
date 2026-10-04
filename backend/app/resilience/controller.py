from __future__ import annotations
import threading
import time
from enum import StrEnum
from app.core.config import settings


class ResilienceState(StrEnum):
    NORMAL = "NORMAL"
    ELEVATED = "ELEVATED"
    DEGRADED = "DEGRADED"
    PROTECTIVE = "PROTECTIVE"
    RECOVERING = "RECOVERING"


class ResilienceController:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.state = ResilienceState.NORMAL
        self.last_change = time.time()
        self.rps = 0.0
        self.queue_depth = 0
        self.error_rate = 0.0
        self.redis_available = True
        self.transitions: list[dict] = []

    def observe(self, *, rps: float, queue_depth: int, error_rate: float, redis_available: bool = True) -> ResilienceState:
        with self._lock:
            self.rps, self.queue_depth, self.error_rate, self.redis_available = rps, queue_depth, error_rate, redis_available
            elevated = queue_depth >= int(settings.resilience_queue_depth_threshold * 0.5) or rps >= settings.resilience_rate_threshold * 0.7 or error_rate >= settings.resilience_error_elevated
            overloaded = queue_depth >= settings.resilience_queue_depth_threshold or rps >= settings.resilience_rate_threshold or error_rate >= settings.resilience_error_degraded or not redis_available
            severe = error_rate >= settings.resilience_error_protective or queue_depth >= settings.resilience_queue_depth_threshold * 2
            if severe:
                target = ResilienceState.PROTECTIVE
            elif overloaded:
                target = ResilienceState.DEGRADED
            elif elevated:
                target = ResilienceState.ELEVATED
            elif self.state in {ResilienceState.DEGRADED, ResilienceState.PROTECTIVE}:
                target = ResilienceState.RECOVERING
            elif self.state == ResilienceState.RECOVERING:
                target = ResilienceState.NORMAL
            else:
                target = ResilienceState.NORMAL
            if target != self.state:
                previous = self.state
                self.state = target
                self.last_change = time.time()
                self.transitions.append({"from": previous.value, "to": target.value, "at": self.last_change, "rps": rps, "queue_depth": queue_depth, "error_rate": error_rate, "redis_available": redis_available})
                self.transitions = self.transitions[-100:]
            return self.state

    def allow(self, endpoint: str) -> bool:
        if self.state == ResilienceState.PROTECTIVE:
            return endpoint in {"allocation", "confirm", "release", "queue"}
        if self.state == ResilienceState.DEGRADED:
            return endpoint not in {"metrics_heavy", "analytics"}
        return True

    def snapshot(self) -> dict:
        with self._lock:
            return {"state": self.state.value, "rps": self.rps, "queue_depth": self.queue_depth, "error_rate": self.error_rate, "redis_available": self.redis_available, "changed_at": self.last_change, "transitions": list(self.transitions)}


resilience = ResilienceController()
