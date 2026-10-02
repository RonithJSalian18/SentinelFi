"""AML endpoints: seeding and circular-trading scans against the database."""
from datetime import datetime, timedelta, timezone

import pytest

import models

SCAN = "/aml/detect-circular-trading"


@pytest.fixture
def seeded(client):
    assert client.post("/aml/seed-dummy-data").status_code == 200


def paths(response):
    return sorted(tuple(loop["path"]) for loop in response.json().get("evidence", []))


def test_clean_ledger(client):
    body = client.get(SCAN).json()
    assert body["status"] == "clean"
    assert body["stats"]["transactions_scanned"] == 0


def test_seeding_is_idempotent(client, db, seeded):
    assert client.post("/aml/seed-dummy-data").json()["message"] == "Dummy ledger already seeded. Ready to scan."
    assert db.query(models.CorporateEntity).count() == 7
    assert db.query(models.TransactionLedger).count() == 7


def test_detects_both_seeded_loops(client, seeded):
    response = client.get(SCAN)
    body = response.json()
    assert body["status"] == "threat_detected"
    assert body["alert"] == "2 Circular Trading Loops Identified"
    assert paths(response) == [
        ("Alpha Holdings", "Beta Logistics", "Gamma Consulting"),
        ("Delta Capital", "Epsilon Trading", "Zeta Imports", "Eta Ventures"),
    ]
    assert body["stats"]["engine"] in ("cpp", "python")


def test_each_loop_is_reported_once(client, seeded):
    # The legacy SQL self-join returned every loop once per starting company
    assert client.get(SCAN).json()["stats"]["cycles_found"] == 2


def test_evidence_trail(client, seeded):
    loop = next(l for l in client.get(SCAN).json()["evidence"] if l["hops"] == 3)
    assert loop["initial_amount"] == 500000
    assert loop["return_amount"] == 490000
    assert loop["retention_pct"] == 98.0
    assert loop["total_volume"] == 1485000
    assert [(t["sender"], t["receiver"]) for t in loop["transactions"]] == [
        ("Alpha Holdings", "Beta Logistics"),
        ("Beta Logistics", "Gamma Consulting"),
        ("Gamma Consulting", "Alpha Holdings"),
    ]


def test_max_hops_limits_loop_length(client, seeded):
    assert paths(client.get(SCAN, params={"max_hops": 3})) == [("Alpha Holdings", "Beta Logistics", "Gamma Consulting")]


def test_min_amount_filters_small_transfers(client, seeded):
    response = client.get(SCAN, params={"min_amount": 1_000_000})
    assert paths(response) == [("Delta Capital", "Epsilon Trading", "Zeta Imports", "Eta Ventures")]


def test_window_days(client, seeded):
    # Seeded hops are one day apart: the 3-hop loop spans 2 days, the 4-hop loop 3 days
    response = client.get(SCAN, params={"window_days": 2, "chronological": True})
    assert paths(response) == [("Alpha Holdings", "Beta Logistics", "Gamma Consulting")]


def test_chronological_rejects_out_of_order_loops(client, db):
    a, b = (models.CorporateEntity(company_name=n, registration_number=n) for n in ("A Corp", "B Corp"))
    db.add_all([a, b])
    db.flush()
    now = datetime.now(timezone.utc)
    db.add_all([
        models.TransactionLedger(sender_id=a.id, receiver_id=b.id, amount=50_000, transaction_date=now),
        models.TransactionLedger(sender_id=b.id, receiver_id=a.id, amount=49_000, transaction_date=now - timedelta(days=30)),
    ])
    db.commit()
    # Loops are reported from their earliest transfer (B->A, 30 days ago) in both modes
    assert client.get(SCAN).json()["evidence"][0]["path"] == ["B Corp", "A Corp"]
    assert client.get(SCAN, params={"chronological": True}).json()["evidence"][0]["path"] == ["B Corp", "A Corp"]
    # ...but a 1-day window rules the loop out, since its hops are 30 days apart
    assert client.get(SCAN, params={"chronological": True, "window_days": 1}).json()["status"] == "clean"


@pytest.mark.parametrize("params", [{"max_hops": 1}, {"max_hops": 9}, {"min_amount": -1}, {"max_results": 0}])
def test_validates_parameters(client, params):
    assert client.get(SCAN, params=params).status_code == 422


def test_engine_endpoint(client):
    body = client.get("/aml/engine").json()
    assert body["engine"] in ("cpp", "python")
    assert body["native"] == (body["engine"] == "cpp")
