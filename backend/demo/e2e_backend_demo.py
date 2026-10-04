"""Repeatable end-to-end Person 1 backend demo (self-hosting).

    python demo/e2e_backend_demo.py                 # starts its own API on a temp SQLite DB, runs the story, exits 0/1
    python demo/e2e_backend_demo.py --url http://127.0.0.1:8000   # run against an already running API

Story: Telemetry -> (Person 2 RiskEvents) -> deterministic policy -> queue/admission -> atomic allocation -> proof.
RiskEvents that come from Person 2's real fairdrop_ml_output.json are sent unmodified EXCEPT session_id, which is
re-pointed at a live Person 1 session (P2's sample ids are not live sessions). Events labelled `demo-injected-*`
are hand-written policy test inputs, NOT ML output.
"""
import argparse, hashlib, json, os, pathlib, signal, subprocess, sys, tempfile, time
import httpx

ROOT = pathlib.Path(__file__).resolve().parents[1]
results = []


def step(name, ok, detail=""):
    results.append(bool(ok))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  -> {detail}" if detail else ""), flush=True)


def solve(challenge, bits):
    i = 0
    while int.from_bytes(hashlib.sha256(f"{challenge}:{i}".encode()).digest(), "big").bit_length() > 256 - bits:
        i += 1
    return str(i)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--url"); ap.add_argument("--port", type=int, default=8120); a = ap.parse_args()
    proc, tmp = None, None
    if not a.url:
        tmp = tempfile.mkdtemp()
        env = {**os.environ, "DATABASE_URL": f"sqlite:///{tmp}/demo.db", "ENABLE_EXPIRY_WORKER": "false", "ALLOW_DIRECT_ALLOCATION": "false", "PYTHONPATH": str(ROOT),
               "POLICY_CHALLENGE_DIFFICULTY_BITS": "10", "ML_API_URL": "http://127.0.0.1:9", "ML_API_TIMEOUT_SECONDS": "0.5", "POLICY_THROTTLE_ADMIT_INTERVAL_SECONDS": "30"}
        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=ROOT, env=env, check=True, capture_output=True)
        proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(a.port), "--log-level", "warning"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        a.url = f"http://127.0.0.1:{a.port}"
        for _ in range(60):
            try: httpx.get(a.url + "/health", timeout=1); break
            except Exception: time.sleep(0.3)
    base = a.url.rstrip("/")
    c = httpx.Client(base_url=base, timeout=15)
    ml = json.load(open(ROOT.parent / "fairdrop_ml_output.json"))
    p2_events = [e for e in ml["risk_events"] if e["coordination_score"] and e["coordination_score"] >= 0.9]
    ev = f"demo-{int(time.time())}"
    H = lambda s: {"X-Session-Credential": s["credential"]}
    try:
        print("1. Backend + database")
        h = c.get("/health").json(); step("health", h["database"] is True, h)
        c.post("/events", json={"event_id": ev, "name": "Fair Drop e2e demo", "admission_limit": 10})
        c.post("/inventory/seed", params={"event_id": ev, "count": 3})
        print("2. Six sessions join the queue (server-assigned positions)")
        names = ["alice", "bob", "carol-coordinated", "dave-coordinated", "eve-highrisk", "frank-challenged"]
        S = {n: {**c.post(f"/events/{ev}/join", json={"user_id": n}).json(), "user": n} for n in names}
        step("positions are server-side FIFO", [c.get(f"/queue/{S[n]['session_id']}", headers=H(S[n])).json()["position"] for n in names] == [1, 2, 3, 4, 5, 6])

        print("3. Person 2 ML evidence reaches the deterministic policy")
        for n, e in zip(("carol-coordinated", "dave-coordinated"), p2_events):
            r = c.post("/integration/risk-events", json={**e, "session_id": S[n]["session_id"]}).json()
            d = r["decision"]
            step(f"{n}: P2 campaign event {e['event_id']} (risk/anomaly null) -> {d['action']}", d["action"] == "THROTTLE" and d["risk_score"] is None, d["reason"])
        r = c.post("/integration/risk-events", json={"session_id": S["eve-highrisk"]["session_id"], "event_id": "demo-injected-1", "risk_score": 0.96, "anomaly_score": 0.9, "coordination_score": None, "campaign_id": None, "attack_type": "demo_injected_policy_test", "evidence": ["demo_injected"], "model_version": "demo-injected-NOT-ML", "timestamp": "2026-10-04T00:00:00+00:00"}).json()
        step("eve: injected high-risk test event -> QUARANTINE (+ removed from queue)", r["decision"]["action"] == "QUARANTINE" and "removed_from_admission_queue" in r["applied"], r["decision"]["reason"])
        r = c.post("/integration/risk-events", json={"session_id": S["frank-challenged"]["session_id"], "event_id": "demo-injected-2", "risk_score": 0.6, "anomaly_score": None, "coordination_score": None, "campaign_id": None, "attack_type": None, "evidence": [], "model_version": "demo-injected-NOT-ML", "timestamp": "2026-10-04T00:00:00+00:00"}).json()
        step("frank: injected medium-risk test event -> CHALLENGE", r["decision"]["action"] == "CHALLENGE")
        dup = c.post("/integration/risk-events", json={"session_id": S["frank-challenged"]["session_id"], "event_id": "demo-injected-2", "risk_score": 0.6, "model_version": "demo-injected-NOT-ML", "timestamp": "2026-10-04T00:00:00+00:00"}).json()
        step("re-delivery of the same RiskEvent is idempotent", dup["duplicate"] is True)

        print("4. Deterministic actions change queue/admission behaviour")
        al = c.post(f"/queue/{S['alice']['session_id']}/admit", headers=H(S["alice"])).json(); step("alice (no evidence) admitted", al["status"] == "ADMITTED")
        ca = c.post(f"/queue/{S['carol-coordinated']['session_id']}/admit", headers=H(S["carol-coordinated"])).json()
        ca2 = c.post(f"/queue/{S['carol-coordinated']['session_id']}/admit", headers=H(S["carol-coordinated"])).json()
        step("carol (THROTTLE): first attempt allowed, immediate repeat deferred", ca["status"] == "ADMITTED" and ca2["status"] == "THROTTLED", ca2.get("retry_after_seconds"))
        ev_ = c.post(f"/queue/{S['eve-highrisk']['session_id']}/admit", headers=H(S["eve-highrisk"])).json(); step("eve (QUARANTINE) cannot be admitted", ev_["status"] == "QUARANTINED")
        fr = c.post(f"/queue/{S['frank-challenged']['session_id']}/admit", headers=H(S["frank-challenged"])).json(); step("frank (CHALLENGE) must solve a challenge first", fr["status"] == "CHALLENGE_REQUIRED")
        ch = c.post(f"/policy/challenge/{S['frank-challenged']['session_id']}", headers=H(S["frank-challenged"])).json()
        ok = c.post(f"/policy/challenge/{S['frank-challenged']['session_id']}/solve", headers=H(S["frank-challenged"]), json={"challenge": ch["challenge"], "solution": solve(ch["challenge"], ch["difficulty_bits"])}).json()
        fr = c.post(f"/queue/{S['frank-challenged']['session_id']}/admit", headers=H(S["frank-challenged"])).json()
        step("frank solves the challenge and is admitted", ok["success"] and fr["status"] == "ADMITTED")

        print("5. Atomic allocation, security, idempotency")
        def hold(n, tok, key): s = S[n]; return c.post("/allocation/hold", json={"event_id": ev, "user_id": n, "session_id": s["session_id"], "session_credential": s["credential"], "admission_token": tok, "idempotency_key": key}).json()
        bypass = c.post("/allocation", json={"event_id": ev, "user_id": "mallory", "idempotency_key": "bypass"}).json(); step("queue bypass (no session/token) rejected", bypass["status"] == "ADMISSION_REQUIRED")
        forged = hold("alice", al["token"][:-3] + "AAA", "forged"); step("forged token rejected", forged["status"] == "ADMISSION_REQUIRED")
        h1 = hold("alice", al["token"], "alice-1"); step("alice holds a seat", h1["status"] == "HELD", h1.get("item_code"))
        step("replay of the same token with a new idempotency key rejected", hold("alice", al["token"], "alice-2")["status"] == "ADMISSION_REQUIRED")
        step("same idempotency key returns the same reservation", hold("alice", al["token"], "alice-1")["reservation_id"] == h1["reservation_id"])
        conf = c.post("/allocation/confirm", json={"reservation_id": h1["reservation_id"], "user_id": "alice", "session_id": S["alice"]["session_id"], "session_credential": S["alice"]["credential"]}).json()
        step("alice confirms", conf["status"] == "CONFIRMED")
        hc = hold("carol-coordinated", ca["token"], "carol-1"); step("carol (THROTTLE only slows admission) can still allocate with her valid token", hc["status"] == "HELD")
        c.post("/integration/risk-events", json={**p2_events[0], "event_id": "risk_followup_demo", "session_id": S["carol-coordinated"]["session_id"]})
        cc = c.post("/allocation/confirm", json={"reservation_id": hc["reservation_id"], "user_id": "carol-coordinated", "session_id": S["carol-coordinated"]["session_id"], "session_credential": S["carol-coordinated"]["credential"]}).json()
        step("repeated coordination evidence escalates carol to QUARANTINE; her confirm is blocked by policy", cc["status"] == "POLICY_BLOCKED", cc["message"])
        hf = hold("frank-challenged", fr["token"], "frank-1"); step("frank holds the last free seat", hf["status"] == "HELD")

        print("6. Person 2 ML outage does not affect correctness")
        ms = c.get("/integration/ml/status").json(); sync = c.post("/integration/ml/sync").json()
        step("ML unreachable is reported, nothing is invented", ms["ml_available"] is False and sync["ingested"] == 0, ms.get("detail"))
        st = c.get("/inventory/stats/" + ev).json()
        step("inventory invariant holds (no oversell)", st["invariant_ok"] and not st["oversold"], {k: st[k] for k in ("total", "available", "held", "confirmed")})

        print("7. Verification + audit trail")
        proof = c.get(f"/verify/{h1['reservation_id']}").json(); step("allocation proof verifiable (reservation+inventory+audit chain)", proof["verifiable"] is True, f"{len(proof['audit_chain'])} audit events")
        decs = c.get("/integration/decisions", params={"session_id": S["carol-coordinated"]["session_id"]}).json()["decisions"]
        step("policy decisions are explainable (action, reason, rules, evidence, policy+model version)", all(d["reason"] and d["rules_fired"] and d["policy_version"] and d["model_version"] for d in decs), [(d["action"], d["rules_fired"]) for d in decs])
        aud = c.get(f"/audit/{ev}").json(); step("audit trail includes POLICY_DECISION events", any(e["event_type"] == "POLICY_DECISION" for e in aud["events"]), aud["count"])
    finally:
        if proc:
            proc.send_signal(signal.SIGTERM)
            try: proc.wait(5)
            except Exception: proc.kill()
    print(f"\n{sum(results)}/{len(results)} demo checks passed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
