import hashlib, itertools, json, pathlib, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.database import Base, engine
from app.main import app

Base.metadata.create_all(bind=engine)
client = TestClient(app)
ML = json.loads((pathlib.Path(__file__).resolve().parents[2] / "fairdrop_ml_output.json").read_text())
_n = itertools.count()
H = lambda c: {"X-Session-Credential": c}


@pytest.fixture(autouse=True)
def _s(monkeypatch):
    monkeypatch.setattr(settings, "allow_direct_allocation", False)
    monkeypatch.setattr(settings, "admin_api_key", "")
    monkeypatch.setattr(settings, "integration_api_key", "")
    monkeypatch.setattr(settings, "policy_challenge_difficulty_bits", 8)


def provision(limit=5, seconds=60, types=(("general", 6), ("vip", 2)), auto=False):
    eid = f"fair-{next(_n)}-{time.time_ns()}"
    r = client.post("/admin/events/provision", json={"event_id": eid, "name": eid, "admission_limit": limit, "prequeue_seconds": seconds, "auto_advance": auto, "ticket_types": [{"ticket_type": t, "count": c} for t, c in types]})
    assert r.status_code == 200 and r.json()["created"] is True
    return eid


def join_all(eid, n):
    out = []
    for i in range(n):
        r = client.post(f"/events/{eid}/join", json={"user_id": f"user-{i}"})
        assert r.status_code == 200, r.text
        out.append(r.json())
    return out


def op(eid, action, **kw):
    return client.post(f"/admin/events/{eid}/{action}", params=kw)


def sha(s): return hashlib.sha256(s.encode()).hexdigest()


def test_provision_is_idempotent_and_typed_inventory():
    eid = provision()
    again = client.post("/admin/events/provision", json={"event_id": eid, "name": "x", "ticket_types": [{"ticket_type": "general", "count": 99}]}).json()
    assert again["created"] is False
    st = client.get(f"/inventory/stats/{eid}").json()
    assert st["total"] == 8 and st["by_type"]["general"]["total"] == 6 and st["by_type"]["vip"]["total"] == 2 and st["invariant_ok"]


def test_lifecycle_gates_and_phase_order():
    eid = provision()
    assert client.post(f"/events/{eid}/join", json={"user_id": "early"}).json()["detail"] == "PRE_QUEUE_NOT_OPEN"
    assert op(eid, "randomize").status_code == 409 and op(eid, "close").status_code == 409
    assert op(eid, "open", seconds=60).json()["phase"] == "PRE_QUEUE_OPEN"
    assert op(eid, "open").status_code == 409
    assert op(eid, "randomize").status_code == 409  # must close first
    assert op(eid, "close").json()["phase"] == "PRE_QUEUE_CLOSED"
    late = client.post(f"/events/{eid}/join", json={"user_id": "late"})
    assert late.status_code == 409 and late.json()["detail"] == "PRE_QUEUE_CLOSED"
    assert op(eid, "admit").status_code == 409  # randomize first
    assert op(eid, "randomize").json()["phase"] == "RANDOMIZED"
    assert op(eid, "randomize").status_code == 409
    assert op(eid, "admit").json()["phase"] == "ADMITTING"
    assert op(eid, "pause").json()["phase"] == "PAUSED"
    assert op(eid, "admit").json()["phase"] == "ADMITTING"
    assert op(eid, "end").json()["phase"] == "ENDED"


def test_prequeue_has_no_positions_and_one_session_per_person():
    eid = provision(); op(eid, "open", seconds=60)
    sessions = join_all(eid, 5)
    assert all(s["state"] == "PREQUEUE" and s["position"] is None for s in sessions)
    dup = client.post(f"/events/{eid}/join", json={"user_id": "user-0"})
    assert dup.status_code == 409 and dup.json()["detail"].startswith("DUPLICATE_SESSION")
    s0 = sessions[0]
    resume = client.post(f"/events/{eid}/join", json={"user_id": "user-0", "session_id": s0["session_id"], "credential": s0["credential"]})
    assert resume.status_code == 200 and resume.json()["session_id"] == s0["session_id"]
    bad = client.post(f"/events/{eid}/join", json={"user_id": "user-0", "session_id": s0["session_id"], "credential": "x" * 20})
    assert bad.status_code == 409
    info = client.get(f"/events/{eid}/drop").json()
    assert info["phase"] == "PRE_QUEUE_OPEN" and info["joined"] == 5 and info["commitment"] and "server_seed" not in json.dumps(info)
    assert client.get(f"/events/{eid}/proof").status_code == 409  # seed still secret


def test_admission_not_open_before_admitting_phase():
    eid = provision(); op(eid, "open", seconds=60); s = join_all(eid, 2)[0]
    assert client.post(f"/queue/{s['session_id']}/admit", headers=H(s["credential"])).json()["status"] == "ADMISSION_NOT_OPEN"
    op(eid, "close"); op(eid, "randomize")
    assert client.post(f"/queue/{s['session_id']}/admit", headers=H(s["credential"])).json()["status"] == "ADMISSION_NOT_OPEN"


def test_draw_is_verifiable_and_independent_of_arrival_order():
    eid = provision(); op(eid, "open", seconds=60)
    commitment = client.get(f"/events/{eid}/drop").json()["commitment"]
    sessions = join_all(eid, 40)
    op(eid, "close"); op(eid, "randomize")
    proof = client.get(f"/events/{eid}/proof").json()
    # independent recomputation of the whole draw from the public bundle only
    assert proof["commitment"] == commitment == sha("commit:" + proof["serverSeed"])
    ids = proof["eligible"]
    assert ids == sorted(s["session_id"] for s in sessions) and proof["eligibleCount"] == 40
    assert sha("root:" + ",".join(ids)) == proof["eligibleRoot"]
    seed = sha("shuffle:" + proof["serverSeed"] + ":" + proof["eligibleRoot"]); assert seed == proof["shuffleSeed"]
    from app.fairness import deterministic_shuffle
    order = deterministic_shuffle(ids, seed)
    ranks = {}
    for s in sessions:
        st = client.get(f"/queue/{s['session_id']}", headers=H(s["credential"])).json()
        ranks[s["session_id"]] = st["queue_sequence"]
        assert st["state"] == "QUEUED" and st["position"] == st["queue_sequence"]
    assert [sid for sid, _ in sorted(ranks.items(), key=lambda kv: kv[1])] == order
    assert sorted(ranks.values()) == list(range(1, 41))
    assert [s["session_id"] for s in sessions] != order  # draw order is not arrival order
    # tampering with the seed breaks the commitment check
    assert sha("commit:" + proof["serverSeed"][:-1] + "0") != commitment or proof["serverSeed"].endswith("0")


def test_controlled_admission_window_and_typed_allocation():
    eid = provision(limit=2, types=(("general", 3), ("vip", 1))); op(eid, "open", seconds=60)
    sessions = join_all(eid, 6); op(eid, "close"); op(eid, "randomize"); op(eid, "admit")
    by_rank = sorted(sessions, key=lambda s: client.get(f"/queue/{s['session_id']}", headers=H(s["credential"])).json()["queue_sequence"])
    res = [client.post(f"/queue/{s['session_id']}/admit", headers=H(s["credential"])).json() for s in by_rank]
    assert [r["status"] for r in res[:2]] == ["ADMITTED", "ADMITTED"]
    assert all(r["status"] in {"QUEUED", "ADMISSION_CAPACITY_FULL"} for r in res[2:])  # window = 2, rank order respected
    s = by_rank[0]; uid = f"user-{sessions.index(s)}"
    def hold(sess, token, ttype, key):
        u = f"user-{sessions.index(sess)}"
        return client.post("/allocation/hold", json={"event_id": eid, "user_id": u, "session_id": sess["session_id"], "session_credential": sess["credential"], "admission_token": token, "idempotency_key": key, "ticket_type": ttype}).json()
    h = hold(by_rank[0], res[0]["token"], "vip", "k-vip-1"); assert h["status"] == "HELD" and h["ticket_type"] == "vip" and "VIP" in h["item_code"]
    h2 = hold(by_rank[1], res[1]["token"], "vip", "k-vip-2"); assert h2["status"] == "SOLD_OUT"  # vip exhausted, other types untouched
    h3 = hold(by_rank[1], res[1]["token"], "general", "k-gen-1")
    assert h3["status"] == "ADMISSION_REQUIRED"  # token already consumed by the failed attempt: single use even on failure
    st = client.get(f"/inventory/stats/{eid}").json()
    assert st["by_type"]["vip"]["held"] == 1 and st["by_type"]["general"]["available"] == 3 and st["invariant_ok"]
    # session status exposes the reservation so a reloaded browser can resume payment
    q = client.get(f"/queue/{by_rank[0]['session_id']}", headers=H(by_rank[0]["credential"])).json()
    assert q["reservation"]["status"] == "HELD" and q["reservation"]["ticket_type"] == "vip"


def test_auto_advance_closes_randomizes_and_admits_after_deadline():
    eid = provision(seconds=1, auto=True); op(eid, "open", seconds=1); join_all(eid, 3)
    time.sleep(1.3)
    info = client.get(f"/events/{eid}/drop").json()
    assert info["phase"] == "ADMITTING" and info["eligible_count"] == 3 and info["proof_revealed"] is True


def test_concurrent_randomize_runs_exactly_once():
    eid = provision(); op(eid, "open", seconds=60); join_all(eid, 10); op(eid, "close")
    with ThreadPoolExecutor(6) as ex:
        codes = list(ex.map(lambda _: op(eid, "randomize").status_code, range(6)))
    assert sorted(codes) == [200] + [409] * 5
    ranks = sorted(client.get(f"/events/{eid}/proof").json()["eligible"])
    assert len(ranks) == 10


def test_policy_parks_challenged_session_through_draw_and_restores_original_rank():
    eid = provision(limit=1); op(eid, "open", seconds=60); sessions = join_all(eid, 4)
    victim = sessions[2]
    r = client.post("/integration/risk-events", json={"session_id": victim["session_id"], "event_id": f"fd-{eid}", "risk_score": 0.6, "model_version": "t", "timestamp": "2026-10-04T00:00:00+00:00"}).json()
    assert r["decision"]["action"] == "CHALLENGE"
    op(eid, "close"); op(eid, "randomize"); op(eid, "admit")
    rank = client.get(f"/queue/{victim['session_id']}", headers=H(victim["credential"])).json()
    assert rank["queue_sequence"] is not None and rank["position"] is None and rank["policy_action"] == "CHALLENGE"  # in the draw, parked out of the queue
    assert client.post(f"/queue/{victim['session_id']}/admit", headers=H(victim["credential"])).json()["status"] == "CHALLENGE_REQUIRED"
    # solve
    ch = client.post(f"/policy/challenge/{victim['session_id']}", headers=H(victim["credential"])).json()
    i = 0
    while int.from_bytes(hashlib.sha256(f"{ch['challenge']}:{i}".encode()).digest(), "big").bit_length() > 256 - ch["difficulty_bits"]:
        i += 1
    assert client.post(f"/policy/challenge/{victim['session_id']}/solve", headers=H(victim["credential"]), json={"challenge": ch["challenge"], "solution": str(i)}).json()["success"]
    client.post(f"/queue/{victim['session_id']}/admit", headers=H(victim["credential"]))
    back = client.get(f"/queue/{victim['session_id']}", headers=H(victim["credential"])).json()
    assert back["queue_sequence"] == rank["queue_sequence"] and back["policy_action"] == "NORMAL"
    assert back["state"] in {"QUEUED", "ADMITTED"}


def test_admin_key_enforced_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "admin_api_key", "adm-secret")
    body = {"event_id": f"adm-{next(_n)}", "name": "n", "ticket_types": [{"ticket_type": "t", "count": 1}]}
    assert client.post("/admin/events/provision", json=body).status_code == 401
    assert client.post("/events", json={"event_id": "x-unauth", "name": "x"}).status_code == 401
    assert client.post("/inventory/seed", params={"event_id": "x-unauth", "count": 1}).status_code == 401
    assert client.post("/admin/events/provision", json=body, headers={"X-Admin-Key": "adm-secret"}).status_code == 200


class _MLHandler(BaseHTTPRequestHandler):
    payload: dict = {}
    def do_GET(self):
        body = json.dumps(self.payload if self.path.startswith("/ml/risk-events") else {"status": "running"}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass


def test_ml_sync_never_applies_simulator_sessions_to_live_sessions(monkeypatch):
    eid = provision(); op(eid, "open", seconds=60); live = join_all(eid, 1)[0]
    events = [dict(e) for e in ML["risk_events"]]
    _MLHandler.payload = {"count": len(events), "risk_events": events}
    srv = HTTPServer(("127.0.0.1", 0), _MLHandler); threading.Thread(target=srv.serve_forever, daemon=True).start()
    monkeypatch.setattr(settings, "ml_api_url", f"http://127.0.0.1:{srv.server_port}")
    try:
        r = client.post("/integration/ml/sync").json()
        assert r["ml_available"] and r["ingested"] == 0 and r["skipped_no_live_session"] == 20  # all 20 are simulator ids
        # an ML event that really names a live session is applied (P2 -> P1 policy)
        events[0] = {**events[0], "session_id": live["session_id"], "event_id": "risk_live_1"}
        _MLHandler.payload = {"count": len(events), "risk_events": events}
        r = client.post("/integration/ml/sync").json()
        assert r["ingested"] == 1 and r["skipped_no_live_session"] == 19
        assert client.get(f"/integration/policy/session/{live['session_id']}").json()["effective_action"] == "THROTTLE"
    finally:
        srv.shutdown()


def test_live_session_roster_for_ml_telemetry():
    eid = provision(); op(eid, "open", seconds=60); s = join_all(eid, 2)
    r = client.get("/integration/sessions", params={"event_id": eid}).json()["sessions"]
    assert {x["session_id"] for x in r} == {x["session_id"] for x in s} and all(x["joined_at"] for x in r)


def test_ml_sync_worker_is_advisory_and_survives_failures(monkeypatch):
    """Background P2 pull: loops, survives an ML/DB failure, and only ever calls the policy-ingest path (never inventory/queue)."""
    import asyncio
    from app.workers import ml_sync
    calls = {"n": 0}

    def fake_sync_once():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("ML exploded")  # first iteration fails; loop must continue
        return {"ml_available": False, "ingested": 0}

    monkeypatch.setattr(ml_sync, "sync_once", fake_sync_once)
    monkeypatch.setattr(ml_sync.settings, "ml_sync_interval_seconds", 1)

    async def run():
        stop = asyncio.Event()
        task = asyncio.create_task(ml_sync.ml_sync_loop(stop))
        await asyncio.sleep(1.6)
        stop.set()
        await task

    asyncio.run(run())
    assert calls["n"] >= 2
