from __future__ import annotations
import threading
import time
from dataclasses import dataclass
from typing import Any
from app.core.config import settings

try:
    import redis
except ImportError:  # pragma: no cover
    redis = None


@dataclass
class QueueSnapshot:
    position: int | None
    depth: int
    admitted: int


class QueueStore:
    """Redis-backed hot queue with a test/dev fallback. PostgreSQL remains authoritative."""
    _memory_lock = threading.RLock()
    _memory_queues: dict[str, dict[str, int]] = {}
    _memory_admitted: dict[str, set[str]] = {}
    _memory_sessions: dict[str, dict[str, Any]] = {}

    def __init__(self) -> None:
        self._client = None
        self._last_reconnect_attempt = 0.0
        self._recover_lock = threading.Lock()
        # Set by the app: callable returning [(event_id, session_id, state, queue_sequence)] from the authoritative DB.
        self.sessions_provider = None
        self.degraded_events: list[dict[str, Any]] = []
        self._connect()
        if settings.redis_required and self._client is None:
            raise RuntimeError("Redis is required but unavailable")

    def _connect(self) -> bool:
        if redis is None:
            return False
        try:
            client = redis.Redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=0.5, socket_timeout=0.75)
            client.ping()
        except Exception:
            self._client = None
            return False
        self._client = client
        return True

    def _note(self, kind: str) -> None:
        self.degraded_events.append({"event": kind, "at": time.time()})
        self.degraded_events = self.degraded_events[-50:]

    def _reload_memory_from_db(self) -> None:
        """Redis just failed: the in-process fallback must not start empty. Restore it from PostgreSQL (authoritative)."""
        if not self.sessions_provider:
            return
        try:
            rows = self.sessions_provider()
            with self._memory_lock:
                self._memory_queues.clear()
                self._memory_admitted.clear()
            self.rebuild_from_sessions(rows)
        except Exception:
            pass

    def try_recover(self) -> bool:
        """Called periodically (from ping). Re-connect to Redis and re-seed it from the DB; at most one attempt per interval."""
        if self._client is not None or redis is None:
            return self._client is not None
        now = time.time()
        if now - self._last_reconnect_attempt < settings.redis_reconnect_interval_seconds:
            return False
        if not self._recover_lock.acquire(blocking=False):
            return False
        try:
            self._last_reconnect_attempt = now
            if not self._connect():
                return False
            try:
                for pattern in ("fairdrop:queue:*", "fairdrop:admitted:*"):
                    for key in self._client.scan_iter(match=pattern):
                        self._client.delete(key)
                if self.sessions_provider:
                    self.rebuild_from_sessions(self.sessions_provider())
            except Exception as exc:
                self._client = None
                self._note(f"recovery_failed:{type(exc).__name__}")
                return False
            self._note("redis_recovered")
            return True
        finally:
            self._recover_lock.release()

    @property
    def using_redis(self) -> bool:
        return self._client is not None

    def _handle_redis_error(self, exc: Exception):
        if settings.redis_required:
            raise RuntimeError("Redis unavailable") from exc
        if self._client is not None:
            self._client = None
            self._last_reconnect_attempt = time.time()
            self._note(f"redis_lost:{type(exc).__name__}")
            self._reload_memory_from_db()

    def ping(self) -> bool:
        if self._client is not None:
            try:
                return bool(self._client.ping())
            except Exception as exc:
                self._handle_redis_error(exc)
                return False
        if self.try_recover():
            return True
        return not settings.redis_required

    def join(self, event_id: str, session_id: str, ttl: int) -> int:
        if self._client:
            try:
                key = f"fairdrop:queue:{event_id}"
                sequence = int(self._client.incr(f"fairdrop:queue-seq:{event_id}"))
                self._client.zadd(key, {session_id: sequence})
                return sequence
            except Exception as exc:
                self._handle_redis_error(exc)
                if settings.redis_required:
                    raise
        with self._memory_lock:
            q = self._memory_queues.setdefault(event_id, {})
            if session_id not in q:
                q[session_id] = max(q.values(), default=0) + 1
            return q[session_id]

    def remove(self, event_id: str, session_id: str) -> None:
        if self._client:
            try:
                self._client.zrem(f"fairdrop:queue:{event_id}", session_id)
                self._client.srem(f"fairdrop:admitted:{event_id}", session_id)
                return
            except Exception as exc:
                self._handle_redis_error(exc)
        with self._memory_lock:
            self._memory_queues.setdefault(event_id, {}).pop(session_id, None)
            self._memory_admitted.setdefault(event_id, set()).discard(session_id)

    def position(self, event_id: str, session_id: str) -> int | None:
        if self._client:
            try:
                rank = self._client.zrank(f"fairdrop:queue:{event_id}", session_id)
                return None if rank is None else int(rank) + 1
            except Exception as exc:
                self._handle_redis_error(exc)
        with self._memory_lock:
            q = self._memory_queues.get(event_id, {})
            if session_id not in q:
                return None
            ordered = sorted(q.items(), key=lambda x: (x[1], x[0]))
            return next(i + 1 for i, (sid, _) in enumerate(ordered) if sid == session_id)

    def depth(self, event_id: str) -> int:
        if self._client:
            try:
                return int(self._client.zcard(f"fairdrop:queue:{event_id}"))
            except Exception as exc:
                self._handle_redis_error(exc)
        with self._memory_lock:
            return len(self._memory_queues.get(event_id, {}))

    def total_depth(self) -> int:
        if self._client:
            try:
                total = 0
                for key in self._client.scan_iter(match="fairdrop:queue:*"):
                    total += int(self._client.zcard(key))
                return total
            except Exception as exc:
                self._handle_redis_error(exc)
        with self._memory_lock:
            return sum(len(v) for v in self._memory_queues.values())

    def mark_admitted(self, event_id: str, session_id: str, ttl: int) -> None:
        if self._client:
            try:
                pipe = self._client.pipeline()
                pipe.sadd(f"fairdrop:admitted:{event_id}", session_id)
                pipe.expire(f"fairdrop:admitted:{event_id}", ttl)
                pipe.zrem(f"fairdrop:queue:{event_id}", session_id)
                pipe.execute()
                return
            except Exception as exc:
                self._handle_redis_error(exc)
        with self._memory_lock:
            self._memory_admitted.setdefault(event_id, set()).add(session_id)
            self._memory_queues.setdefault(event_id, {}).pop(session_id, None)

    def admitted_count(self, event_id: str) -> int:
        if self._client:
            try:
                return int(self._client.scard(f"fairdrop:admitted:{event_id}"))
            except Exception as exc:
                self._handle_redis_error(exc)
        with self._memory_lock:
            return len(self._memory_admitted.get(event_id, set()))

    def is_admitted(self, event_id: str, session_id: str) -> bool:
        if self._client:
            try:
                return bool(self._client.sismember(f"fairdrop:admitted:{event_id}", session_id))
            except Exception as exc:
                self._handle_redis_error(exc)
        with self._memory_lock:
            return session_id in self._memory_admitted.get(event_id, set())

    def set_session_hot(self, session_id: str, data: dict[str, Any], ttl: int) -> None:
        if self._client:
            try:
                self._client.hset(f"fairdrop:session:{session_id}", mapping={k: str(v) for k, v in data.items()})
                self._client.expire(f"fairdrop:session:{session_id}", ttl)
                return
            except Exception as exc:
                self._handle_redis_error(exc)
        with self._memory_lock:
            self._memory_sessions[session_id] = {**data, "expires_at": time.time() + ttl}

    def get_session_hot(self, session_id: str) -> dict[str, Any] | None:
        if self._client:
            try:
                data = self._client.hgetall(f"fairdrop:session:{session_id}")
                return data or None
            except Exception as exc:
                self._handle_redis_error(exc)
        with self._memory_lock:
            data = self._memory_sessions.get(session_id)
            if not data:
                return None
            if data.get("expires_at", 0) < time.time():
                self._memory_sessions.pop(session_id, None)
                return None
            return dict(data)

    def rate_limit(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        if self._client:
            try:
                bucket = f"fairdrop:rl:{key}:{int(time.time()) // window_seconds}"
                count = int(self._client.incr(bucket))
                if count == 1:
                    self._client.expire(bucket, window_seconds + 1)
                return count <= limit, max(0, limit - count)
            except Exception as exc:
                self._handle_redis_error(exc)
        with self._memory_lock:
            now_bucket = int(time.time()) // window_seconds
            if len(self._memory_sessions) > 20000:  # bound the fallback's memory: drop expired rate-limit buckets
                cutoff = time.time()
                for k in [k for k, v in self._memory_sessions.items() if isinstance(v, dict) and v.get("expires_at", cutoff + 1) < cutoff]:
                    self._memory_sessions.pop(k, None)
            mem_key = f"{key}:{now_bucket}"
            current = self._memory_sessions.get(mem_key, {"count": 0, "expires_at": time.time() + window_seconds})
            current["count"] = int(current.get("count", 0)) + 1
            self._memory_sessions[mem_key] = current
            return current["count"] <= limit, max(0, limit - current["count"])

    def rebuild_from_sessions(self, sessions: list[tuple[str, str, str, int | None]]) -> None:
        for event_id, session_id, state, sequence in sessions:
            if state == "QUEUED":
                if sequence is None:
                    self.join(event_id, session_id, settings.session_ttl_seconds)
                elif self._client:
                    try:
                        self._client.zadd(f"fairdrop:queue:{event_id}", {session_id: sequence})
                        seq_key = f"fairdrop:queue-seq:{event_id}"
                        if int(self._client.get(seq_key) or 0) < sequence:  # Redis may have restarted empty: never reissue old sequence numbers
                            self._client.set(seq_key, sequence)
                    except Exception as exc:
                        self._handle_redis_error(exc)
                else:
                    with self._memory_lock:
                        self._memory_queues.setdefault(event_id, {})[session_id] = sequence
            elif state in {"ADMITTED", "ALLOCATING"}:
                self.mark_admitted(event_id, session_id, settings.session_ttl_seconds)
