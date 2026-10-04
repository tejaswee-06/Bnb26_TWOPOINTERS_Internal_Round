"""Real PostgreSQL + real multi-process (4 uvicorn workers) concurrency / failure test.

Run:  python tests/integration/pg_concurrency.py     (needs PostgreSQL 16 binaries; run as root it drops to the `postgres` user)
Exit code 0 = all checks passed.   Nothing here is a throughput benchmark; it verifies correctness under concurrency.
"""
import glob, os, shutil, signal, subprocess, sys, tempfile, time
from concurrent.futures import ThreadPoolExecutor
import httpx

PGPORT, APORT = 55432, 8112
checks: list[tuple[str, bool, str]] = []


def check(name, ok, detail=""):
    checks.append((name, bool(ok), str(detail)))
    print(("PASS" if ok else "FAIL"), name, detail, flush=True)


def pg_bin():
    found = glob.glob("/usr/lib/postgresql/*/bin/initdb")
    return os.path.dirname(sorted(found)[-1]) if found else None


def as_pg(cmd):
    return ["runuser", "-u", "postgres", "--"] + cmd if os.geteuid() == 0 else cmd


def wait_http(url, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if httpx.get(url, timeout=1).status_code < 500:
                return True
        except Exception:
            time.sleep(0.3)
    return False


def start_api(env, workers=4):
    p = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(APORT), "--workers", str(workers), "--log-level", "warning"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    assert wait_http(f"http://127.0.0.1:{APORT}/health"), "api did not start"
    return p


def stop(p):
    p.send_signal(signal.SIGTERM)
    try: p.wait(10)
    except Exception: p.kill()


def main():
    b = pg_bin()
    if not b:
        print("SKIP: PostgreSQL binaries not found"); return 2
    tmp = tempfile.mkdtemp(); os.chmod(tmp, 0o755)
    data = f"{tmp}/pgdata"; os.makedirs(data)
    if os.geteuid() == 0: shutil.chown(data, "postgres", "postgres")
    subprocess.run(as_pg([f"{b}/initdb", "-D", data, "-A", "trust", "-U", "postgres"]), check=True, stdout=subprocess.DEVNULL)
    pg_start = lambda: subprocess.run(as_pg([f"{b}/pg_ctl", "-D", data, "-o", f"-p {PGPORT} -c max_connections=400 -c unix_socket_directories={data}", "-l", f"{data}/pg.log", "-w", "start"]), check=True, stdout=subprocess.DEVNULL)
    pg_stop = lambda mode="fast": subprocess.run(as_pg([f"{b}/pg_ctl", "-D", data, "-m", mode, "-w", "stop"]), stdout=subprocess.DEVNULL)
    redis_p = None
    if shutil.which("redis-server"):
        redis_p = subprocess.Popen(["redis-server", "--port", "6392", "--save", "", "--appendonly", "no", "--dir", tmp], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.5)
    pg_start()
    subprocess.run([f"{b}/createdb", "-h", "127.0.0.1", "-p", str(PGPORT), "-U", "postgres", "fairdrop"], check=True)
    url = f"postgresql+psycopg2://postgres@127.0.0.1:{PGPORT}/fairdrop"
    env = {**os.environ, "DATABASE_URL": url, "REDIS_URL": "redis://127.0.0.1:6392/0" if redis_p else "redis://127.0.0.1:1/0", "REDIS_REQUIRED": "true" if redis_p else "false", "ENABLE_EXPIRY_WORKER": "false", "PYTHONPATH": os.getcwd(),
           "ALLOW_DIRECT_ALLOCATION": "true", "MUTATION_RATE_LIMIT_REQUESTS": "100000", "RATE_LIMIT_REQUESTS": "100000", "RESILIENCE_RATE_THRESHOLD": "100000"}
    api = None
    base = f"http://127.0.0.1:{APORT}"
    try:
        r = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], env=env, capture_output=True, text=True)
        check("alembic upgrade head (0001->0003) on real PostgreSQL", r.returncode == 0, r.stderr[-300:])
        api = start_api(env)
        c = httpx.Client(base_url=base, timeout=30, limits=httpx.Limits(max_connections=200))
        check("health on PostgreSQL", c.get("/health").json()["database"] is True)
        check("shared Redis queue backend across 4 workers", c.get("/health").json()["queue_backend"] == "redis" if redis_p else True, "redis" if redis_p else "redis-server missing: memory fallback is per-process, NOT valid for multi-worker")

        # 1) 600 concurrent direct allocations for 50 seats across 4 worker processes
        c.post("/events", json={"event_id": "pg1", "name": "pg1", "admission_limit": 50}); c.post("/inventory/seed", params={"event_id": "pg1", "count": 50})
        def alloc(i):
            try:
                return httpx.post(f"{base}/allocation", json={"event_id": "pg1", "user_id": f"user{i}", "idempotency_key": f"pg1-{i}"}, timeout=60).json()
            except Exception as e:
                return {"success": False, "status": f"CLIENT_ERROR:{type(e).__name__}"}
        with ThreadPoolExecutor(64) as ex: res = list(ex.map(alloc, range(600)))
        ok = [x for x in res if x.get("success")]; st = c.get("/inventory/stats/pg1").json()
        check("600 concurrent requests / 50 seats: exactly 50 confirmed", len(ok) == 50 and st["confirmed"] == 50 and st["available"] == 0, {"success": len(ok), **{k: st[k] for k in ("available", "held", "confirmed")}})
        check("no oversell, invariant holds", st["invariant_ok"] and not st["oversold"], st)
        check("no duplicate allocation ids", len({x["allocation_id"] for x in ok}) == 50)
        other = {x["status"] for x in res if not x.get("success")}
        check("losers got clean SOLD_OUT (no 5xx / client errors)", other <= {"SOLD_OUT"}, other)

        # 2) final-seat race
        c.post("/events", json={"event_id": "pg2", "name": "pg2", "admission_limit": 5}); c.post("/inventory/seed", params={"event_id": "pg2", "count": 1})
        def alloc2(i): return httpx.post(f"{base}/allocation", json={"event_id": "pg2", "user_id": f"racer{i}", "idempotency_key": f"pg2-{i}"}, timeout=60).json()
        with ThreadPoolExecutor(100) as ex: res = list(ex.map(alloc2, range(100)))
        check("final-seat race: exactly one winner", sum(1 for x in res if x.get("success")) == 1 and c.get("/inventory/stats/pg2").json()["confirmed"] == 1)

        # 3) same idempotency key hammered concurrently
        c.post("/events", json={"event_id": "pg3", "name": "pg3", "admission_limit": 5}); c.post("/inventory/seed", params={"event_id": "pg3", "count": 5})
        def same(i): return httpx.post(f"{base}/allocation", json={"event_id": "pg3", "user_id": "same-user", "idempotency_key": "one-key"}, timeout=60).json()
        with ThreadPoolExecutor(40) as ex: res = list(ex.map(same, range(40)))
        ids = {x.get("allocation_id") for x in res if x.get("success")}
        st = c.get("/inventory/stats/pg3").json()
        check("40 concurrent retries of one idempotency key -> one allocation", len(ids) == 1 and st["confirmed"] == 1 and st["available"] == 4, {"ids": ids, **{k: st[k] for k in ("available", "held", "confirmed")}})

        # 4) token flow (direct allocation OFF): admission-token double spend across processes
        stop(api); env2 = {**env, "ALLOW_DIRECT_ALLOCATION": "false"}; api = start_api(env2)
        c.post("/events", json={"event_id": "pg4", "name": "pg4", "admission_limit": 30}); c.post("/inventory/seed", params={"event_id": "pg4", "count": 10})
        sessions = [c.post("/events/pg4/join", json={"user_id": f"t{i}"}).json() for i in range(30)]
        hd = lambda s: {"X-Session-Credential": s["credential"]}
        tokens = [c.post(f"/queue/{s['session_id']}/admit", headers=hd(s)).json() for s in sessions]
        check("30 sessions admitted within window", all(t["status"] == "ADMITTED" for t in tokens), {t["status"] for t in tokens})
        def spend(args):
            i, k = args; s, t = sessions[i], tokens[i]
            return httpx.post(f"{base}/allocation/hold", json={"event_id": "pg4", "user_id": f"t{i}", "session_id": s["session_id"], "session_credential": s["credential"], "admission_token": t["token"], "idempotency_key": f"pg4-{i}-{k}"}, timeout=60).json()
        jobs = [(i, k) for i in range(30) for k in range(3)]  # each token used 3x concurrently with 3 different idempotency keys
        with ThreadPoolExecutor(90) as ex: res = list(ex.map(spend, jobs))
        held = [x for x in res if x.get("status") == "HELD" and x.get("success")]
        st = c.get("/inventory/stats/pg4").json()
        check("token replay across workers: no session holds twice, <=10 seats held", st["held"] == 10 and st["invariant_ok"] and len({x["reservation_id"] for x in held}) == len(set(x["reservation_id"] for x in held)), {k: st[k] for k in ("available", "held", "confirmed")})
        from_sessions = {}
        for (i, k), x in zip(jobs, res):
            if x.get("success"): from_sessions.setdefault(i, set()).add(x["reservation_id"])
        check("each admitted session got at most one reservation id", all(len(v) == 1 for v in from_sessions.values()), len(from_sessions))

        # 4b) policy on PostgreSQL: real Person 2 RiskEvents + concurrent duplicate ingestion across workers
        import json
        ml = json.load(open(os.path.join(os.path.dirname(__file__), "..", "..", "..", "fairdrop_ml_output.json")))
        codes = [httpx.post(f"{base}/integration/risk-events", json=e, timeout=30).status_code for e in ml["risk_events"]]
        check("all 20 real Person 2 RiskEvents (null risk/anomaly) accepted on PostgreSQL", codes == [200] * 20, set(codes))
        target = {"session_id": sessions[0]["session_id"], "event_id": "dup-race", "risk_score": 0.8, "anomaly_score": None, "coordination_score": None, "campaign_id": None, "attack_type": None, "evidence": [], "model_version": "t", "timestamp": "2026-10-04T00:00:00+00:00"}
        def ingest(_): return httpx.post(f"{base}/integration/risk-events", json=target, timeout=30).json()
        with ThreadPoolExecutor(40) as ex: res = list(ex.map(ingest, range(40)))
        rows = c.get("/integration/decisions", params={"session_id": sessions[0]["session_id"]}).json()["decisions"]
        check("40 concurrent duplicate RiskEvents -> exactly one decision row, no errors", len(rows) == 1 and sum(1 for r in res if not r["duplicate"]) == 1, (len(rows), sum(1 for r in res if not r["duplicate"])))
        eff = c.get(f"/integration/policy/session/{sessions[0]['session_id']}").json()
        check("effective policy action readable from any worker", eff["effective_action"] == "THROTTLE", eff["effective_action"])

        # 4c) FAIR pre-queue on PostgreSQL across 4 worker processes
        c.post("/admin/events/provision", json={"event_id": "pgfair", "name": "pgfair", "admission_limit": 20, "prequeue_seconds": 300, "auto_advance": False, "ticket_types": [{"ticket_type": "general", "count": 15}, {"ticket_type": "vip", "count": 5}]})
        c.post("/admin/events/pgfair/open")
        def join(i): return httpx.post(f"{base}/events/pgfair/join", json={"user_id": f"fu{i}"}, timeout=60)
        with ThreadPoolExecutor(64) as ex: rs = list(ex.map(join, range(200)))
        check("200 concurrent pre-queue joins all accepted without positions", all(r.status_code == 200 and r.json()["state"] == "PREQUEUE" for r in rs), {r.status_code for r in rs})
        def dupjoin(_): return httpx.post(f"{base}/events/pgfair/join", json={"user_id": "same-person"}, timeout=60).status_code
        with ThreadPoolExecutor(30) as ex: codes = list(ex.map(dupjoin, range(30)))
        check("30 concurrent joins by one account -> exactly one session (rest 409)", sorted(codes) == [200] + [409] * 29, sorted(codes)[:3])
        fsess = [r.json() for r in rs]
        c.post("/admin/events/pgfair/close")
        def rnd(_): return httpx.post(f"{base}/admin/events/pgfair/randomize", timeout=60).status_code
        with ThreadPoolExecutor(8) as ex: codes = list(ex.map(rnd, range(8)))
        check("8 concurrent randomize calls across workers -> exactly one draw", sorted(codes) == [200] + [409] * 7, sorted(codes))
        c.post("/admin/events/pgfair/admit")
        proof = c.get("/events/pgfair/proof").json()
        import hashlib as _h
        sha = lambda x: _h.sha256(x.encode()).hexdigest()
        check("published commitment/root/seed recompute on PostgreSQL data", proof["eligibleCount"] == 201 and sha("commit:" + proof["serverSeed"]) == proof["commitment"] and sha("root:" + ",".join(proof["eligible"])) == proof["eligibleRoot"])
        def adm(sess): return httpx.post(f"{base}/queue/{sess['session_id']}/admit", headers={"X-Session-Credential": sess["credential"]}, timeout=60).json()
        with ThreadPoolExecutor(64) as ex: res = list(ex.map(adm, fsess))
        n_ok = sum(1 for r in res if r["status"] == "ADMITTED")
        check("controlled admission under concurrency: exactly admission_limit (20) admitted", n_ok == 20, n_ok)
        admitted = [(s_, r) for s_, r in zip(fsess, res) if r["status"] == "ADMITTED"]
        def fhold(a):
            s_, r = a; return httpx.post(f"{base}/allocation/hold", json={"event_id": "pgfair", "user_id": f"fu{fsess.index(s_)}", "session_id": s_["session_id"], "session_credential": s_["credential"], "admission_token": r["token"], "idempotency_key": f"pgfair-{s_['session_id']}", "ticket_type": "vip"}, timeout=60).json()
        with ThreadPoolExecutor(20) as ex: hres = list(ex.map(fhold, admitted))
        st = c.get("/inventory/stats/pgfair").json()
        check("20 admitted racing for 5 VIP seats -> exactly 5 held, general untouched", st["by_type"]["vip"]["held"] == 5 and st["by_type"]["general"]["available"] == 15 and st["invariant_ok"], {"vip": st["by_type"]["vip"], "general": st["by_type"]["general"]})

        # 5) DB failure and recovery
        pg_stop("immediate")
        time.sleep(0.5)
        r = httpx.post(f"{base}/allocation/hold", json={"event_id": "pg4", "user_id": "x", "idempotency_key": "db-down"}, timeout=30)
        check("DB down -> retryable 503 (fail closed)", r.status_code == 503 and r.headers.get("retry-after") == "2", (r.status_code, r.text[:120]))
        h = httpx.get(f"{base}/health", timeout=30).json()
        check("health reports database=false / degraded while DB is down", h["database"] is False and h["status"] == "degraded", h)
        pg_start()
        time.sleep(1)
        for _ in range(10):
            try:
                if httpx.get(f"{base}/health", timeout=10).json()["database"]: break
            except Exception: pass
            time.sleep(0.5)
        st = c.get("/inventory/stats/pg4").json()
        check("service recovered automatically after DB restart; state intact", st["held"] == 10 and st["invariant_ok"], {k: st[k] for k in ("available", "held", "confirmed")})
        r = httpx.get(f"{base}/resilience", timeout=10).json()
        print("INFO resilience state after outage:", r["state"], "| transitions seen by this worker:", [t["to"] for t in r["transitions"]])
    except Exception as e:
        import traceback; traceback.print_exc(); check("harness", False, e)
    finally:
        if api: stop(api)
        if redis_p: redis_p.kill()
        pg_stop("immediate")
        shutil.rmtree(tmp, ignore_errors=True)
    failed = [n for n, ok, _ in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
