"""Real Redis failure/recovery test. Starts a real redis-server and a real uvicorn process, kills Redis mid-flight and restarts it.

Run:  python tests/integration/redis_failover.py      (needs `redis-server` on PATH)
Exit code 0 = all checks passed.
"""
import os, shutil, signal, subprocess, sys, tempfile, time
import httpx

API, RPORT, APORT = None, 6391, 8111
checks: list[tuple[str, bool, str]] = []


def check(name, ok, detail=""):
    checks.append((name, bool(ok), str(detail)))
    print(("PASS" if ok else "FAIL"), name, detail, flush=True)


def wait_http(url, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if httpx.get(url, timeout=1).status_code < 500:
                return True
        except Exception:
            time.sleep(0.2)
    return False


def start_redis(tmp):
    return subprocess.Popen(["redis-server", "--port", str(RPORT), "--save", "", "--appendonly", "no", "--dir", tmp], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    if not shutil.which("redis-server"):
        print("SKIP: redis-server not installed"); return 2
    tmp = tempfile.mkdtemp()
    redis_p = start_redis(tmp)
    env = {**os.environ, "REDIS_URL": f"redis://127.0.0.1:{RPORT}/0", "DATABASE_URL": f"sqlite:///{tmp}/t.db", "ENABLE_EXPIRY_WORKER": "false",
           "REDIS_RECONNECT_INTERVAL_SECONDS": "1", "ADMISSION_WINDOW": "2", "PYTHONPATH": os.getcwd()}
    subprocess.run([sys.executable, "-c", "from app.db.database import Base, engine; import app.models; Base.metadata.create_all(engine)"], env=env, check=True)
    api = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(APORT), "--log-level", "warning"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{APORT}"
    try:
        assert wait_http(base + "/health"), "api did not start"
        c = httpx.Client(base_url=base, timeout=5)
        c.post("/events", json={"event_id": "rf", "name": "rf", "admission_limit": 2})
        c.post("/inventory/seed", params={"event_id": "rf", "count": 5})
        sess = [c.post("/events/rf/join", json={"user_id": f"u{i}"}).json() for i in range(5)]
        pos = lambda s: c.get(f"/queue/{s['session_id']}", headers={"X-Session-Credential": s["credential"]}).json()["position"]
        check("redis backend active", c.get("/resilience").json()["queue_backend"] == "redis")
        check("positions 1..5 under redis", [pos(s) for s in sess] == [1, 2, 3, 4, 5], [pos(s) for s in sess])

        redis_p.kill(); redis_p.wait()
        time.sleep(0.3)
        # ---- Redis is DOWN
        r = c.post("/events/rf/join", json={"user_id": "u-new"})
        check("join still works with Redis down", r.status_code == 200, r.status_code)
        new = r.json()
        res = c.get("/resilience").json()
        check("backend reports memory fallback", res["queue_backend"] == "memory-fallback", res["queue_backend"])
        check("positions preserved from DB after Redis loss", [pos(s) for s in sess] == [1, 2, 3, 4, 5], [pos(s) for s in sess])
        check("new session queued behind existing", pos(new) == 6, pos(new))
        a = c.post(f"/queue/{sess[0]['session_id']}/admit", headers={"X-Session-Credential": sess[0]["credential"]}).json()
        check("admission works with Redis down", a["status"] == "ADMITTED", a["status"])
        h = c.get("/health").json()
        check("health stays serviceable (not required)", h["database"] is True and h["redis"] is True or h["status"] in {"healthy", "degraded"}, h)
        hold = c.post("/allocation/hold", json={"event_id": "rf", "user_id": "u0", "session_id": sess[0]["session_id"], "session_credential": sess[0]["credential"], "admission_token": a["token"], "idempotency_key": "rf-hold"}).json()
        check("hold works with Redis down", hold["status"] == "HELD", hold["status"])

        redis_p = start_redis(tmp)
        time.sleep(1.5)
        for _ in range(5):
            c.get("/health"); time.sleep(0.6)
        res = c.get("/resilience").json()
        check("Redis recovered and reconnected", res["queue_backend"] == "redis", res["queue_events"][-3:])
        check("positions consistent after recovery", [pos(s) for s in sess[1:]] + [pos(new)] == [1, 2, 3, 4, 5], [pos(s) for s in sess[1:]] + [pos(new)])
        later = c.post("/events/rf/join", json={"user_id": "u-later"}).json()
        check("new joins ordered after pre-outage sessions (sequence counter restored)", pos(later) == 6, pos(later))
        st = c.get("/inventory/stats/rf").json()
        check("inventory invariant intact", st["invariant_ok"] and st["held"] == 1, st)
    except AssertionError as e:
        check("setup", False, e)
    finally:
        api.send_signal(signal.SIGTERM); redis_p.kill()
        try: api.wait(5)
        except Exception: api.kill()
        shutil.rmtree(tmp, ignore_errors=True)
    failed = [n for n, ok, _ in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
