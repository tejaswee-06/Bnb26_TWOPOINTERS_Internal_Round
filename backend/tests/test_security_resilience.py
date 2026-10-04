import base64, hashlib, hmac, itertools, json, time
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.inventory import Inventory
from app.models.reservation import Reservation
from app.models.session import UserSession
from app.repositories.inventory_repository import InventoryRepository
from app.resilience import ResilienceState, resilience
from app.security.tokens import issue_admission_token, verify_admission_token, TokenError

Base.metadata.create_all(bind=engine)
client = TestClient(app)
_n = itertools.count()


@pytest.fixture(autouse=True)
def _s(monkeypatch):
    monkeypatch.setattr(settings, "allow_direct_allocation", False)


def flow(limit=5, seats=3, user=None):
    eid = f"sec-{next(_n)}-{time.time_ns()}"
    uid = user or f"u-{eid}"
    client.post("/events", json={"event_id": eid, "name": eid, "admission_limit": limit})
    client.post("/inventory/seed", params={"event_id": eid, "count": seats})
    j = client.post(f"/events/{eid}/join", json={"user_id": uid}).json()
    return eid, uid, j["session_id"], j["credential"]


H = lambda c: {"X-Session-Credential": c}


def hold_payload(eid, uid, sid, cred, token, key):
    return {"event_id": eid, "user_id": uid, "session_id": sid, "session_credential": cred, "admission_token": token, "idempotency_key": key}


def resign(payload: dict) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()).decode().rstrip("=")
    sig = base64.urlsafe_b64encode(hmac.new(settings.hmac_secret.encode(), body.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return f"{body}.{sig}"


# ------------------------------------------------------------------ token security
def test_expired_token_rejected():
    eid, uid, sid, cred = flow()
    tok = client.post(f"/queue/{sid}/admit", headers=H(cred)).json()["token"]
    p = json.loads(base64.urlsafe_b64decode(tok.split(".")[0] + "=="))
    p["exp"] = int(time.time()) - 5
    r = client.post("/allocation/hold", json=hold_payload(eid, uid, sid, cred, resign(p), "k-exp")).json()
    assert r["status"] == "ADMISSION_REQUIRED" and "expired" in r["message"]


def test_unsigned_or_wrongly_signed_token_rejected():
    eid, uid, sid, cred = flow()
    tok = client.post(f"/queue/{sid}/admit", headers=H(cred)).json()["token"]
    body = tok.split(".")[0]
    forged = body + "." + base64.urlsafe_b64encode(b"x" * 32).decode().rstrip("=")
    for bad in (forged, "garbage", body, ""):
        r = client.post("/allocation/hold", json=hold_payload(eid, uid, sid, cred, bad or None, f"k-{hash(bad)}")).json()
        assert r["status"] == "ADMISSION_REQUIRED" and r["success"] is False


def test_token_bound_to_event_session_and_user():
    eid, uid, sid, cred = flow()
    eid2, uid2, sid2, cred2 = flow()
    tok = client.post(f"/queue/{sid}/admit", headers=H(cred)).json()["token"]
    tok2 = client.post(f"/queue/{sid2}/admit", headers=H(cred2)).json()["token"]
    # token of session 1 presented for session 2 (even with session 2's valid credential)
    assert client.post("/allocation/hold", json=hold_payload(eid2, uid2, sid2, cred2, tok, "k-x1")).json()["status"] == "ADMISSION_REQUIRED"
    # token for event 1 presented against event 2's inventory
    assert client.post("/allocation/hold", json=hold_payload(eid2, uid, sid, cred, tok, "k-x2")).json()["status"] == "ADMISSION_REQUIRED"
    # right token, wrong user_id
    assert client.post("/allocation/hold", json=hold_payload(eid, "someone-else", sid, cred, tok, "k-x3")).json()["status"] == "ADMISSION_REQUIRED"
    # right token, wrong credential
    assert client.post("/allocation/hold", json=hold_payload(eid, uid, sid, "wrong-credential-123456", tok, "k-x4")).json()["status"] == "ADMISSION_REQUIRED"
    # sanity: the genuine token still works afterwards (failed attempts never consumed it)
    assert client.post("/allocation/hold", json=hold_payload(eid, uid, sid, cred, tok, "k-x5")).json()["status"] == "HELD"
    with pytest.raises(TokenError):
        verify_admission_token(tok2, event_id=eid, session_id=sid2, user_id="not-the-user")


def test_stale_token_after_readmission_is_rejected():
    eid, uid, sid, cred = flow()
    old = client.post(f"/queue/{sid}/admit", headers=H(cred)).json()["token"]
    with SessionLocal() as db:  # simulate admission expiry -> session re-queued with bumped token_version
        s = db.get(UserSession, sid); s.token_version += 1; db.commit()
    assert client.post("/allocation/hold", json=hold_payload(eid, uid, sid, cred, old, "k-stale")).json()["status"] == "ADMISSION_REQUIRED"


def test_session_credential_required_for_queue_and_admit():
    eid, uid, sid, cred = flow()
    assert client.get(f"/queue/{sid}").status_code == 403
    assert client.get(f"/queue/{sid}", headers=H("nope")).status_code == 403
    assert client.post(f"/queue/{sid}/admit").status_code == 403
    assert client.post(f"/queue/{sid}/admit", headers=H("nope")).status_code == 403


def test_cannot_confirm_or_release_someone_elses_reservation():
    eid, uid, sid, cred = flow()
    tok = client.post(f"/queue/{sid}/admit", headers=H(cred)).json()["token"]
    held = client.post("/allocation/hold", json=hold_payload(eid, uid, sid, cred, tok, "k-own")).json()
    eid2, uid2, sid2, cred2 = flow()
    evil = {"reservation_id": held["reservation_id"], "user_id": uid2, "session_id": sid2, "session_credential": cred2}
    assert client.post("/allocation/confirm", json=evil).json()["status"] == "FORBIDDEN"
    assert client.post("/allocation/release", json=evil).json()["status"] == "FORBIDDEN"
    ok = client.post("/allocation/confirm", json={"reservation_id": held["reservation_id"], "user_id": uid, "session_id": sid, "session_credential": cred}).json()
    assert ok["status"] == "CONFIRMED"


def test_queue_bypass_with_no_session_and_with_session_but_no_token():
    eid, uid, sid, cred = flow()
    assert client.post("/allocation", json={"event_id": eid, "user_id": uid, "idempotency_key": "k-nb1"}).json()["status"] == "ADMISSION_REQUIRED"
    assert client.post("/allocation", json={"event_id": eid, "user_id": uid, "session_id": sid, "session_credential": cred, "idempotency_key": "k-nb2"}).json()["status"] == "ADMISSION_REQUIRED"
    # never admitted -> never allocates, inventory untouched
    assert client.get(f"/inventory/stats/{eid}").json()["available"] == 3


def test_client_cannot_skip_ahead_by_claiming_position():
    eid, uid, sid, cred = flow(limit=1)
    j2 = client.post(f"/events/{eid}/join", json={"user_id": "second"}).json()
    r = client.post(f"/queue/{j2['session_id']}/admit", headers=H(j2["credential"]), json={"position": 1}).json()
    assert r["status"] == "QUEUED" and r["position"] == 2  # position is server state; request body is ignored


def test_same_idempotency_key_different_session_is_conflict():
    eid, uid, sid, cred = flow(seats=3)
    tok = client.post(f"/queue/{sid}/admit", headers=H(cred)).json()["token"]
    first = client.post("/allocation/hold", json=hold_payload(eid, uid, sid, cred, tok, "shared-key")).json()
    eid2, uid2, sid2, cred2 = flow()
    tok2 = client.post(f"/queue/{sid2}/admit", headers=H(cred2)).json()["token"]
    second = client.post("/allocation/hold", json=hold_payload(eid2, uid2, sid2, cred2, tok2, "shared-key")).json()
    assert first["status"] == "HELD" and second["status"] == "IDEMPOTENCY_CONFLICT"


def test_idempotent_hold_replay_does_not_need_second_token():
    eid, uid, sid, cred = flow()
    tok = client.post(f"/queue/{sid}/admit", headers=H(cred)).json()["token"]
    a = client.post("/allocation/hold", json=hold_payload(eid, uid, sid, cred, tok, "k-replay")).json()
    b = client.post("/allocation/hold", json=hold_payload(eid, uid, sid, cred, tok, "k-replay")).json()
    assert a["reservation_id"] == b["reservation_id"] and b["success"]


# ------------------------------------------------------------------ inventory lifecycle / expiry
def test_expired_hold_returns_to_available_and_cannot_be_confirmed():
    eid, uid, sid, cred = flow(seats=1)
    tok = client.post(f"/queue/{sid}/admit", headers=H(cred)).json()["token"]
    h = client.post("/allocation/hold", json=hold_payload(eid, uid, sid, cred, tok, "k-hexp")).json()
    stats = client.get(f"/inventory/stats/{eid}").json()
    assert stats["held"] == 1 and stats["available"] == 0
    past = datetime.now(timezone.utc) - timedelta(seconds=2)
    with SessionLocal() as db:
        db.query(Reservation).filter(Reservation.id == h["reservation_id"]).update({"held_until": past})
        db.query(Inventory).filter(Inventory.reservation_id == h["reservation_id"]).update({"held_until": past})
        db.commit()
    late = client.post("/allocation/confirm", json={"reservation_id": h["reservation_id"], "user_id": uid, "session_id": sid, "session_credential": cred}).json()
    assert late["status"] == "EXPIRED"
    stats = client.get(f"/inventory/stats/{eid}").json()
    assert stats["available"] == 1 and stats["held"] == 0 and stats["confirmed"] == 0 and stats["invariant_ok"]
    # seat is reusable by a different user
    eid_user = "latecomer"
    client.post("/events", json={"event_id": eid, "name": eid})
    j = client.post(f"/events/{eid}/join", json={"user_id": eid_user}).json()
    t = client.post(f"/queue/{j['session_id']}/admit", headers=H(j["credential"])).json()["token"]
    assert client.post("/allocation/hold", json=hold_payload(eid, eid_user, j["session_id"], j["credential"], t, "k-reuse")).json()["status"] == "HELD"


def test_expiry_worker_logic_recovers_holds_in_bulk():
    eid, uid, sid, cred = flow(seats=3)
    for i in range(3):
        j = client.post(f"/events/{eid}/join", json={"user_id": f"bulk{i}"}).json()
        t = client.post(f"/queue/{j['session_id']}/admit", headers=H(j["credential"])).json()["token"]
        assert client.post("/allocation/hold", json=hold_payload(eid, f"bulk{i}", j["session_id"], j["credential"], t, f"bulk-{eid}-{i}")).json()["status"] == "HELD"
    past = datetime.now(timezone.utc) - timedelta(seconds=2)
    with SessionLocal() as db:
        db.query(Reservation).filter(Reservation.event_id == eid).update({"held_until": past})
        db.query(Inventory).filter(Inventory.event_id == eid, Inventory.status == "HELD").update({"held_until": past})
        db.commit()
        assert InventoryRepository(db).expire_due_holds(eid) == 3
        db.commit()
    assert client.get(f"/inventory/stats/{eid}").json()["available"] == 3


def test_retry_after_failed_confirm_is_safe():
    eid, uid, sid, cred = flow(seats=1)
    tok = client.post(f"/queue/{sid}/admit", headers=H(cred)).json()["token"]
    h = client.post("/allocation/hold", json=hold_payload(eid, uid, sid, cred, tok, "k-rc")).json()
    body = {"reservation_id": h["reservation_id"], "user_id": uid, "session_id": sid, "session_credential": cred}
    with ThreadPoolExecutor(8) as ex:
        rs = list(ex.map(lambda _: client.post("/allocation/confirm", json=body).json(), range(8)))
    assert all(r["status"] == "CONFIRMED" for r in rs)
    assert client.get(f"/inventory/stats/{eid}").json()["confirmed"] == 1


# ------------------------------------------------------------------ rate limiting / backpressure / resilience
def test_rate_limit_returns_429(monkeypatch):
    monkeypatch.setattr(settings, "mutation_rate_limit_requests", 3)
    eid, uid, sid, cred = flow(user="ratelimited-user")
    codes = [client.post("/allocation/hold", json={"event_id": eid, "user_id": "ratelimited-user", "idempotency_key": f"rl-{eid}-{i}"}).status_code for i in range(8)]
    assert 429 in codes and codes[:3] == [200, 200, 200]


def test_queue_poll_rate_limit(monkeypatch):
    monkeypatch.setattr(settings, "queue_poll_rate_limit", 4)
    eid, uid, sid, cred = flow()
    codes = [client.get(f"/queue/{sid}", headers=H(cred)).status_code for _ in range(8)]
    assert codes[:4] == [200] * 4 and 429 in codes


def test_resilience_state_machine_and_recovery():
    r = resilience
    r.observe(rps=0, queue_depth=0, error_rate=0, redis_available=True)
    assert r.state == ResilienceState.NORMAL or r.state == ResilienceState.RECOVERING
    r.observe(rps=0, queue_depth=settings.resilience_queue_depth_threshold + 1, error_rate=0)
    assert r.state == ResilienceState.DEGRADED
    r.observe(rps=0, queue_depth=0, error_rate=settings.resilience_error_protective + 0.01)
    assert r.state == ResilienceState.PROTECTIVE
    assert r.allow("allocation") and r.allow("confirm") and not r.allow("join") and not r.allow("analytics")
    r.observe(rps=0, queue_depth=0, error_rate=0)
    assert r.state == ResilienceState.RECOVERING
    r.observe(rps=0, queue_depth=0, error_rate=0)
    assert r.state == ResilienceState.NORMAL


def test_protective_state_sheds_new_joins_but_keeps_allocation_path():
    eid, uid, sid, cred = flow()
    tok = client.post(f"/queue/{sid}/admit", headers=H(cred)).json()["token"]
    resilience.observe(rps=0, queue_depth=0, error_rate=0.9)
    try:
        assert resilience.state == ResilienceState.PROTECTIVE
        # a new arrival is shed ...
        shed = client.post(f"/events/{eid}/join", json={"user_id": "latecomer-1"})
        assert shed.status_code == 503 and shed.headers["retry-after"] == "5"
        # ... but an already admitted user can still allocate
        assert client.post("/allocation/hold", json=hold_payload(eid, uid, sid, cred, tok, "k-prot")).json()["status"] == "HELD"
    finally:
        for _ in range(3):
            resilience.observe(rps=0, queue_depth=0, error_rate=0)


def test_noncanonical_signature_spelling_rejected():
    eid, uid, sid, cred = flow()
    tok = client.post(f"/queue/{sid}/admit", headers=H(cred)).json()["token"]
    body, sig = tok.split(".")
    alt_last = {"A": "B"}.get(sig[-1], "A")
    # the final char of a 43-char base64url(32 bytes) only carries padding bits: variants decode to identical bytes
    if base64.urlsafe_b64decode(sig + "=") == base64.urlsafe_b64decode(sig[:-1] + alt_last + "="):
        with pytest.raises(TokenError):
            verify_admission_token(body + "." + sig[:-1] + alt_last, event_id=eid, session_id=sid, user_id=uid)
    verify_admission_token(tok, event_id=eid, session_id=sid, user_id=uid)
