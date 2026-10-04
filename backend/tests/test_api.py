from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.database import Base, engine
from app.main import app

Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
client = TestClient(app)
settings.allow_direct_allocation = True


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["database"] is True


def test_seed_and_allocate_and_verify():
    client.post("/inventory/seed", params={"event_id": "basic", "count": 3})
    response = client.post("/allocation", json={"event_id": "basic", "user_id": "user-1", "idempotency_key": "idem-basic-1"})
    assert response.status_code == 200 and response.json()["status"] == "CONFIRMED"
    allocation_id = response.json()["allocation_id"]
    stats = client.get("/inventory/stats/basic").json()
    assert stats["confirmed"] == 1 and stats["invariant_ok"]
    proof = client.get(f"/verify/{allocation_id}").json()
    assert proof["verifiable"] is True
    assert proof["audit_chain"]


def test_idempotency_and_conflict():
    client.post("/inventory/seed", params={"event_id": "idem", "count": 2})
    payload = {"event_id": "idem", "user_id": "user-1", "idempotency_key": "same-key"}
    first = client.post("/allocation", json=payload).json()
    second = client.post("/allocation", json=payload).json()
    assert first["allocation_id"] == second["allocation_id"]
    conflict = client.post("/allocation", json={**payload, "user_id": "user-2"}).json()
    assert conflict["status"] == "IDEMPOTENCY_CONFLICT"


def test_sold_out():
    client.post("/inventory/seed", params={"event_id": "sold", "count": 1})
    ok = client.post("/allocation", json={"event_id": "sold", "user_id": "user-1", "idempotency_key": "sold-1"}).json()
    no = client.post("/allocation", json={"event_id": "sold", "user_id": "user-2", "idempotency_key": "sold-2"}).json()
    assert ok["success"] is True and no["status"] == "SOLD_OUT"


def test_concurrent_allocation_never_oversells_sqlite():
    event_id = "concurrency"
    client.post("/inventory/seed", params={"event_id": event_id, "count": 20})
    def request(i):
        r = client.post("/allocation", json={"event_id": event_id, "user_id": f"user-{i}", "idempotency_key": f"concurrent-{i}"})
        return r.json()
    with ThreadPoolExecutor(max_workers=30) as pool:
        results = list(pool.map(request, range(60)))
    successes = [x for x in results if x.get("success")]
    stats = client.get(f"/inventory/stats/{event_id}").json()
    assert len(successes) == 20
    assert stats["confirmed"] == 20 and stats["invariant_ok"]


def test_hold_release_reuses_inventory():
    client.post("/inventory/seed", params={"event_id": "release", "count": 1})
    held = client.post("/allocation/hold", json={"event_id": "release", "user_id": "u1", "idempotency_key": "release-hold"}).json()
    released = client.post("/allocation/release", json={"reservation_id": held["reservation_id"], "user_id": "u1"}).json()
    second = client.post("/allocation", json={"event_id": "release", "user_id": "u2", "idempotency_key": "release-second"}).json()
    assert held["status"] == "HELD" and released["status"] == "CANCELLED" and second["success"]


def test_queue_requires_credential_and_token():
    settings.allow_direct_allocation = False
    event_id = "queue-secure"
    client.post("/events", json={"event_id": event_id, "name": "Queue", "admission_limit": 1})
    client.post("/inventory/seed", params={"event_id": event_id, "count": 2})
    joined = client.post(f"/events/{event_id}/join", json={"user_id": "queue-user"})
    assert joined.status_code == 200
    sid = joined.json()["session_id"]
    credential = joined.json()["credential"]
    assert client.get(f"/queue/{sid}").status_code == 403
    status = client.get(f"/queue/{sid}", headers={"X-Session-Credential": credential}).json()
    assert status["state"] == "QUEUED"
    admitted = client.post(f"/queue/{sid}/admit", headers={"X-Session-Credential": credential}).json()
    assert admitted["status"] == "ADMITTED"
    token = admitted["token"]
    payload = {"event_id": event_id, "user_id": "queue-user", "session_id": sid, "session_credential": credential, "admission_token": token, "idempotency_key": "queue-allocation"}
    allocation = client.post("/allocation", json=payload)
    assert allocation.status_code == 200 and allocation.json()["success"]
    settings.allow_direct_allocation = True


def test_queue_bypass_rejected():
    settings.allow_direct_allocation = False
    client.post("/events", json={"event_id": "bypass", "name": "Bypass", "admission_limit": 1})
    client.post("/inventory/seed", params={"event_id": "bypass", "count": 1})
    response = client.post("/allocation", json={"event_id": "bypass", "user_id": "attacker", "idempotency_key": "bypass"})
    assert response.status_code == 200 and response.json()["status"] == "ADMISSION_REQUIRED"
    settings.allow_direct_allocation = True


def test_token_tamper_and_replay():
    settings.allow_direct_allocation = False
    event_id = "token-replay"
    client.post("/events", json={"event_id": event_id, "name": "Tokens", "admission_limit": 2})
    client.post("/inventory/seed", params={"event_id": event_id, "count": 2})
    joined = client.post(f"/events/{event_id}/join", json={"user_id": "u"}).json()
    sid, credential = joined["session_id"], joined["credential"]
    token = client.post(f"/queue/{sid}/admit", headers={"X-Session-Credential": credential}).json()["token"]
    body, sig = token.split(".")
    tampered = body + "." + ("A" if sig[0] != "A" else "B") + sig[1:]  # flip a significant signature character (the last char only holds padding bits)
    payload = {"event_id": event_id, "user_id": "u", "session_id": sid, "session_credential": credential, "admission_token": tampered, "idempotency_key": "bad-token"}
    assert client.post("/allocation", json=payload).json()["status"] == "ADMISSION_REQUIRED"
    good = {**payload, "admission_token": token, "idempotency_key": "good-token"}
    first = client.post("/allocation/hold", json=good).json()
    assert first["success"]
    replay = {**good, "idempotency_key": "different-key"}
    assert client.post("/allocation/hold", json=replay).json()["status"] == "ADMISSION_REQUIRED"
    settings.allow_direct_allocation = True


def test_confirm_release_race_preserves_single_state():
    client.post("/inventory/seed", params={"event_id": "race-state", "count": 1})
    held = client.post("/allocation/hold", json={"event_id": "race-state", "user_id": "race-user", "idempotency_key": "race-hold"}).json()
    rid = held["reservation_id"]
    def confirm():
        return client.post("/allocation/confirm", json={"reservation_id": rid, "user_id": "race-user"}).json()
    def release():
        return client.post("/allocation/release", json={"reservation_id": rid, "user_id": "race-user"}).json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [f.result() for f in [pool.submit(confirm), pool.submit(release)]]
    stats = client.get("/inventory/stats/race-state").json()
    assert stats["invariant_ok"]
    assert stats["confirmed"] in {0, 1}
    assert any(r.get("status") in {"CONFIRMED", "CANCELLED", "FORBIDDEN", "EXPIRED"} for r in results)
