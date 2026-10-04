import hashlib
import itertools
import json
import pathlib
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.audit_event import AuditEvent
from app.models.policy_decision import PolicyDecision
from app.policy.engine import History, PolicyConfig, evaluate_risk_event

Base.metadata.create_all(bind=engine)
client = TestClient(app)
ML = json.loads((pathlib.Path(__file__).resolve().parents[2] / "fairdrop_ml_output.json").read_text())  # canonical Person 2 output at the repo root
CFG = PolicyConfig(hard_evidence=frozenset({"replayed_admission_token"}))
_n = itertools.count()


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    monkeypatch.setattr(settings, "allow_direct_allocation", False)
    monkeypatch.setattr(settings, "integration_api_key", "")
    monkeypatch.setattr(settings, "policy_challenge_difficulty_bits", 8)
    monkeypatch.setattr(settings, "ml_api_url", "")


def ev(**kw):
    base = dict(risk_score=None, anomaly_score=None, coordination_score=None, evidence=[], campaign_id=None)
    base.update(kw)
    return base


def risk_event(sid, event_id, **kw):
    body = dict(session_id=sid, event_id=event_id, risk_score=None, anomaly_score=None, coordination_score=None, campaign_id=None,
                attack_type=None, evidence=[], model_version="test_v1", timestamp=datetime.now(timezone.utc).isoformat())
    body.update(kw)
    return body


def new_flow(limit=5, seats=3):
    eid = f"pol-{next(_n)}-{datetime.now().timestamp()}"
    client.post("/events", json={"event_id": eid, "name": eid, "admission_limit": limit})
    client.post("/inventory/seed", params={"event_id": eid, "count": seats})
    j = client.post(f"/events/{eid}/join", json={"user_id": f"u-{eid}"}).json()
    return eid, j["session_id"], j["credential"], f"u-{eid}"


def hdr(cred):
    return {"X-Session-Credential": cred}


def admit(sid, cred):
    return client.post(f"/queue/{sid}/admit", headers=hdr(cred)).json()


def hold(eid, uid, sid, cred, token, key):
    return client.post("/allocation/hold", json={"event_id": eid, "user_id": uid, "session_id": sid, "session_credential": cred, "admission_token": token, "idempotency_key": key}).json()


# ------------------------------------------------------------------ pure engine
def test_engine_is_deterministic_and_explicit():
    e = ev(risk_score=0.8, evidence=["x"])
    assert evaluate_risk_event(e, History(), CFG) == evaluate_risk_event(e, History(), CFG)
    assert evaluate_risk_event(ev(risk_score=0.1), History(), CFG).action == "NORMAL"
    assert evaluate_risk_event(ev(risk_score=0.55), History(), CFG).action == "CHALLENGE"
    assert evaluate_risk_event(ev(risk_score=0.8), History(), CFG).action == "THROTTLE"
    assert evaluate_risk_event(ev(risk_score=0.93), History(), CFG).action == "QUARANTINE"
    assert evaluate_risk_event(ev(risk_score=0.995, anomaly_score=0.9), History(), CFG).action == "REJECT"
    assert evaluate_risk_event(ev(risk_score=0.995), History(), CFG).action == "QUARANTINE"  # extreme risk needs corroboration for REJECT
    assert evaluate_risk_event(ev(evidence=["replayed_admission_token"], anomaly_score=0.1), History(), CFG).action == "REJECT"


def test_engine_anomaly_alone_capped_at_challenge():
    assert evaluate_risk_event(ev(anomaly_score=0.99), History(), CFG).action == "CHALLENGE"
    assert evaluate_risk_event(ev(anomaly_score=0.5), History(), CFG).action == "NORMAL"


def test_engine_coordination_only_is_capped_unless_corroborated_or_repeated():
    only = evaluate_risk_event(ev(coordination_score=0.998), History(), CFG)
    assert only.action == "THROTTLE" and "R5_COORDINATION_ONLY" in only.rules_fired
    assert evaluate_risk_event(ev(coordination_score=0.998), History(coordination_events=1), CFG).action == "QUARANTINE"
    assert evaluate_risk_event(ev(coordination_score=0.998), History(max_risk=0.6), CFG).action == "QUARANTINE"
    assert evaluate_risk_event(ev(coordination_score=0.998, risk_score=0.6), History(), CFG).action == "QUARANTINE"
    assert evaluate_risk_event(ev(coordination_score=0.5), History(), CFG).action == "NORMAL"


def test_null_scores_never_invented():
    out = evaluate_risk_event(ev(coordination_score=0.998), History(), CFG)
    assert "risk_score" not in out.reason and "anomaly_score" not in out.reason


# ------------------------------------------------------------------ contract / ingestion
def test_contract_requires_some_signal_and_accepts_nulls():
    r = client.post("/integration/risk-events", json=risk_event("abc", "r-none"))
    assert r.status_code == 422
    r = client.post("/integration/risk-events", json=risk_event("abc", "r-null-ok", coordination_score=0.998, campaign_id="c1"))
    assert r.status_code == 200


def test_all_real_person2_risk_events_are_accepted_and_nulls_preserved():
    events = ML["risk_events"]
    assert len(events) == 20 and all(e["risk_score"] is None for e in events)
    for e in events:
        r = client.post("/integration/risk-events", json=e)
        assert r.status_code == 200, r.text
        d = r.json()["decision"]
        assert d["risk_score"] is None and d["anomaly_score"] is None and d["coordination_score"] is not None
        assert d["session_id"] == e["session_id"].replace("-", "")  # dashed UUID normalized to P1 form
        assert d["session_known"] is False  # P2 ids do not belong to a live P1 session
        assert d["model_version"] == e["model_version"] and d["policy_version"] == settings.policy_version
        assert d["campaign_id"] == e["campaign_id"] and d["evidence"] == e["evidence"]


def test_ingest_is_idempotent_and_audited():
    eid, sid, cred, uid = new_flow()
    body = risk_event(sid, f"idem-{sid}", risk_score=0.8)
    a = client.post("/integration/risk-events", json=body).json()
    b = client.post("/integration/risk-events", json=body).json()
    assert a["duplicate"] is False and b["duplicate"] is True and a["decision"]["decision_id"] == b["decision"]["decision_id"]
    with SessionLocal() as db:
        assert len(db.execute(select(PolicyDecision).where(PolicyDecision.session_id == sid)).scalars().all()) == 1
        audits = db.execute(select(AuditEvent).where(AuditEvent.session_id == sid, AuditEvent.event_type == "POLICY_DECISION")).scalars().all()
        assert len(audits) == 1 and audits[0].payload["action"] == "THROTTLE" and audits[0].payload["rules_fired"]


def test_decision_is_explainable():
    eid, sid, cred, uid = new_flow()
    r = client.post("/integration/risk-events", json=risk_event(sid, f"x-{sid}", risk_score=0.55, anomaly_score=0.4, evidence=["fast_clicks"], campaign_id="cx", attack_type="scripted", model_version="m9")).json()["decision"]
    for k in ("session_id", "ticket_event_id", "risk_event_id", "action", "reason", "rules_fired", "evidence", "policy_version", "created_at", "model_version", "campaign_id", "attack_type"):
        assert r[k] not in (None, ""), k
    assert r["ticket_event_id"] == eid and r["action"] == "CHALLENGE"
    listed = client.get("/integration/decisions", params={"session_id": sid}).json()["decisions"]
    assert listed and listed[0]["decision_id"] == r["decision_id"]


def test_integration_key_enforced_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "integration_api_key", "s3cret-key")
    body = risk_event("zzz", "key-1", risk_score=0.9)
    assert client.post("/integration/risk-events", json=body).status_code == 401
    assert client.post("/integration/risk-events", json=body, headers={"X-Integration-Key": "wrong"}).status_code == 401
    assert client.post("/integration/risk-events", json=body, headers={"X-Integration-Key": "s3cret-key"}).status_code == 200


# ------------------------------------------------------------------ enforcement
def test_normal_session_unaffected_without_any_ml_evidence():
    eid, sid, cred, uid = new_flow()
    a = admit(sid, cred)
    assert a["status"] == "ADMITTED"
    h = hold(eid, uid, sid, cred, a["token"], "k-normal")
    assert h["success"] and h["status"] == "HELD"


def test_throttle_defers_repeat_admission_attempts():
    eid, sid, cred, uid = new_flow()
    client.post("/integration/risk-events", json=risk_event(sid, "t1", coordination_score=0.998, campaign_id="c-t", attack_type="possible_coordinated_campaign", evidence=["very_similar_behaviour"]))
    first = admit(sid, cred)
    second = admit(sid, cred)
    assert first["status"] == "ADMITTED"
    assert second["status"] == "THROTTLED" and second["retry_after_seconds"] == settings.policy_throttle_admit_interval_seconds and second["policy_action"] == "THROTTLE"


def test_quarantine_revokes_token_blocks_hold_and_frees_queue_slot():
    eid, sid, cred, uid = new_flow(limit=1)
    a = admit(sid, cred)
    token = a["token"]
    d = client.post("/integration/risk-events", json=risk_event(sid, "q1", risk_score=0.95)).json()
    assert d["decision"]["action"] == "QUARANTINE" and "admission_token_revoked" in d["applied"]
    assert admit(sid, cred)["status"] == "QUARANTINED"
    blocked = hold(eid, uid, sid, cred, token, "k-q")
    assert blocked["success"] is False and blocked["status"] in {"POLICY_BLOCKED"}
    stats = client.get(f"/inventory/stats/{eid}").json()
    assert stats["held"] == 0 and stats["confirmed"] == 0 and stats["invariant_ok"]


def test_quarantined_session_does_not_hold_a_queue_window_slot_and_recovers_after_expiry():
    eid = f"pol-win-{next(_n)}-{datetime.now().timestamp()}"
    client.post("/events", json={"event_id": eid, "name": eid, "admission_limit": 1})
    client.post("/inventory/seed", params={"event_id": eid, "count": 2})
    bot = client.post(f"/events/{eid}/join", json={"user_id": "bot"}).json()
    human = client.post(f"/events/{eid}/join", json={"user_id": "human"}).json()
    assert client.get(f"/queue/{human['session_id']}", headers=hdr(human["credential"])).json()["position"] == 2
    client.post("/integration/risk-events", json=risk_event(bot["session_id"], "w1", risk_score=0.96))
    assert client.get(f"/queue/{human['session_id']}", headers=hdr(human["credential"])).json()["position"] == 1
    assert admit(human["session_id"], human["credential"])["status"] == "ADMITTED"
    # decay: expire the decision -> bot may rejoin the tail of the queue
    with SessionLocal() as db:
        for d in db.execute(select(PolicyDecision).where(PolicyDecision.session_id == bot["session_id"])).scalars():
            d.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    res = admit(bot["session_id"], bot["credential"])
    assert res["status"] in {"QUEUED", "ADMISSION_CAPACITY_FULL"}, res
    assert client.get(f"/queue/{bot['session_id']}", headers=hdr(bot["credential"])).json()["position"] is not None


def test_reject_is_terminal_until_expiry():
    eid, sid, cred, uid = new_flow()
    client.post("/integration/risk-events", json=risk_event(sid, "r1", evidence=["replayed_admission_token"], anomaly_score=0.2))
    assert admit(sid, cred)["status"] == "REJECTED"
    eff = client.get(f"/integration/policy/session/{sid}").json()
    assert eff["effective_action"] == "REJECT"


def test_lower_severity_later_event_does_not_downgrade_quarantine():
    eid, sid, cred, uid = new_flow()
    client.post("/integration/risk-events", json=risk_event(sid, "d1", risk_score=0.95))
    client.post("/integration/risk-events", json=risk_event(sid, "d2", risk_score=0.1))
    assert client.get(f"/integration/policy/session/{sid}").json()["effective_action"] == "QUARANTINE"


def test_campaign_repetition_escalates_coordination_only_to_quarantine():
    eid, sid, cred, uid = new_flow()
    a = client.post("/integration/risk-events", json=risk_event(sid, "cr1", coordination_score=0.998, campaign_id="camp-x")).json()["decision"]
    b = client.post("/integration/risk-events", json=risk_event(sid, "cr2", coordination_score=0.998, campaign_id="camp-x")).json()["decision"]
    assert a["action"] == "THROTTLE" and b["action"] == "QUARANTINE" and "R5_COORDINATION_REPEATED" in b["rules_fired"]


def test_campaign_size_rule_fires_after_enough_sessions():
    cid = f"camp-size-{next(_n)}"
    for i in range(settings.policy_campaign_min_sessions):
        last = client.post("/integration/risk-events", json=risk_event(f"cs-{cid}-{i}", f"e-{cid}-{i}", coordination_score=0.99, campaign_id=cid)).json()["decision"]
    assert "R6_CAMPAIGN_SIZE" in last["rules_fired"]


# ------------------------------------------------------------------ challenge
def solve(challenge, bits):
    i = 0
    while True:
        if int.from_bytes(hashlib.sha256(f"{challenge}:{i}".encode()).digest(), "big").bit_length() <= 256 - bits:
            return str(i)
        i += 1


def test_challenge_flow_clears_challenge_and_keeps_token_usable():
    eid, sid, cred, uid = new_flow()
    client.post("/integration/risk-events", json=risk_event(sid, "c1", risk_score=0.6))
    blocked = admit(sid, cred)
    assert blocked["status"] == "CHALLENGE_REQUIRED" and blocked["challenge_url"].endswith(sid)
    assert client.post(f"/policy/challenge/{sid}").status_code == 403  # needs the session credential
    ch = client.post(f"/policy/challenge/{sid}", headers=hdr(cred)).json()
    assert client.post(f"/policy/challenge/{sid}/solve", headers=hdr(cred), json={"challenge": ch["challenge"], "solution": "definitely-wrong"}).json()["status"] == "WRONG_SOLUTION"
    sol = solve(ch["challenge"], ch["difficulty_bits"])
    ok = client.post(f"/policy/challenge/{sid}/solve", headers=hdr(cred), json={"challenge": ch["challenge"], "solution": sol}).json()
    assert ok["success"] is True
    again = client.post(f"/policy/challenge/{sid}/solve", headers=hdr(cred), json={"challenge": ch["challenge"], "solution": sol}).json()
    assert again["success"] is False  # challenge single-use
    a = admit(sid, cred)
    assert a["status"] == "ADMITTED"
    assert hold(eid, uid, sid, cred, a["token"], "k-chal")["status"] == "HELD"


def test_challenge_cannot_clear_stronger_actions_or_cross_sessions():
    eid, sid, cred, uid = new_flow()
    eid2, sid2, cred2, _ = new_flow()
    client.post("/integration/risk-events", json=risk_event(sid, "cc1", risk_score=0.95))
    ch = client.post(f"/policy/challenge/{sid}", headers=hdr(cred)).json()
    sol = solve(ch["challenge"], ch["difficulty_bits"])
    r = client.post(f"/policy/challenge/{sid}/solve", headers=hdr(cred), json={"challenge": ch["challenge"], "solution": sol}).json()
    assert r["success"] is False and r["status"] == "CHALLENGE_NOT_APPLICABLE"
    # challenge minted for session 1 is useless for session 2
    r2 = client.post(f"/policy/challenge/{sid2}/solve", headers=hdr(cred2), json={"challenge": ch["challenge"], "solution": sol}).json()
    assert r2["status"] == "INVALID_CHALLENGE"
    forged = ch["challenge"][:-2] + ("AA" if not ch["challenge"].endswith("AA") else "BB")
    assert client.post(f"/policy/challenge/{sid}/solve", headers=hdr(cred), json={"challenge": forged, "solution": sol}).json()["status"] == "INVALID_CHALLENGE"


# ------------------------------------------------------------------ ML failure safety
def test_ml_unavailable_backend_stays_correct_and_invents_nothing(monkeypatch):
    monkeypatch.setattr(settings, "ml_api_url", "http://127.0.0.1:9")  # nothing listens here
    monkeypatch.setattr(settings, "ml_api_timeout_seconds", 0.5)
    with SessionLocal() as db:
        before = db.query(PolicyDecision).count()
    status = client.get("/integration/ml/status").json()
    assert status["ml_configured"] is True and status["ml_available"] is False
    sync = client.post("/integration/ml/sync").json()
    assert sync["ml_available"] is False and sync["ingested"] == 0
    with SessionLocal() as db:
        assert db.query(PolicyDecision).count() == before  # no fabricated decisions
    eid, sid, cred, uid = new_flow(seats=1)
    a = admit(sid, cred)
    h = hold(eid, uid, sid, cred, a["token"], "k-mlfail")
    assert h["status"] == "HELD"
    c = client.post("/allocation/confirm", json={"reservation_id": h["reservation_id"], "user_id": uid, "session_id": sid, "session_credential": cred}).json()
    assert c["status"] == "CONFIRMED"
    stats = client.get(f"/inventory/stats/{eid}").json()
    assert stats["confirmed"] == 1 and stats["invariant_ok"]
    assert client.get("/health").json()["database"] is True


def test_confirm_blocked_after_quarantine_and_hold_expires_back_to_available():
    eid, sid, cred, uid = new_flow(seats=1)
    a = admit(sid, cred)
    h = hold(eid, uid, sid, cred, a["token"], "k-cq")
    assert h["status"] == "HELD"
    client.post("/integration/risk-events", json=risk_event(sid, "cq1", risk_score=0.97))
    c = client.post("/allocation/confirm", json={"reservation_id": h["reservation_id"], "user_id": uid, "session_id": sid, "session_credential": cred}).json()
    assert c["status"] == "POLICY_BLOCKED"
    from app.models.reservation import Reservation
    with SessionLocal() as db:
        r = db.get(Reservation, h["reservation_id"])
        r.held_until = datetime.now(timezone.utc) - timedelta(seconds=1)
        from app.models.inventory import Inventory
        db.query(Inventory).filter(Inventory.reservation_id == r.id).update({"held_until": r.held_until})
        db.commit()
    from app.repositories.inventory_repository import InventoryRepository
    with SessionLocal() as db:
        InventoryRepository(db).expire_due_holds(eid)
        db.commit()
    stats = client.get(f"/inventory/stats/{eid}").json()
    assert stats["available"] == 1 and stats["confirmed"] == 0 and stats["invariant_ok"]
