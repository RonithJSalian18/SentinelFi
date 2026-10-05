"""Real-time job notifications over /ws/jobs/{job_id}."""
import asyncio

import pytest
from starlette.websockets import WebSocketDisconnect

import models
import notifier

from .conftest import bearer


def auth_message(user):
    return {"token": bearer(user)["Authorization"].removeprefix("Bearer ")}


def create_job(db, status="queued", **fields):
    job = models.DocumentJob(filename="report.pdf", bank_name="Test Bank", status=status, **fields)
    db.add(job)
    db.commit()
    return job


def test_pushes_live_updates_until_complete(client, db):
    job = create_job(db)

    with client.websocket_connect(f"/ws/jobs/{job.id}") as ws:
        ws.send_json(auth_message(client.user))
        assert ws.receive_json()["status"] == "queued"

        # A worker (here: this test thread) broadcasts progress while the socket is open
        notifier.publish(job.id, {**job.to_payload(), "status": "processing"})
        assert ws.receive_json()["status"] == "processing"

        job.status, job.result = "completed", {"overall_risk_score": 12}
        db.commit()
        notifier.publish(job.id, job.to_payload())
        final = ws.receive_json()
        assert final["status"] == "completed"
        assert final["analysis"] == {"overall_risk_score": 12}


def test_analysts_can_follow_jobs(analyst_client, db):
    job = create_job(db, status="completed")
    with analyst_client.websocket_connect(f"/ws/jobs/{job.id}") as ws:
        ws.send_json(auth_message(analyst_client.user))
        assert ws.receive_json()["status"] == "completed"


def test_finished_job_sends_snapshot_and_closes(client, db):
    job = create_job(db, status="failed", error="bad scan")
    with client.websocket_connect(f"/ws/jobs/{job.id}") as ws:
        ws.send_json(auth_message(client.user))
        message = ws.receive_json()
        assert message["status"] == "failed"
        assert message["error"] == "bad scan"


def test_unknown_job_reports_not_found(client):
    with client.websocket_connect("/ws/jobs/missing") as ws:
        ws.send_json(auth_message(client.user))
        assert ws.receive_json() == {"job_id": "missing", "status": "not_found"}


def test_events_for_other_jobs_are_not_delivered(client, db):
    job, other = create_job(db), create_job(db)
    with client.websocket_connect(f"/ws/jobs/{job.id}") as ws:
        ws.send_json(auth_message(client.user))
        ws.receive_json()
        notifier.publish(other.id, {**other.to_payload(), "status": "completed"})
        notifier.publish(job.id, {**job.to_payload(), "status": "processing"})
        assert ws.receive_json()["job_id"] == job.id


@pytest.mark.parametrize("first_message", [
    {"token": "not-a-jwt"},
    {"token": ""},
    {"nothing": "here"},
    ["not", "an", "object"],
])
def test_rejects_unauthenticated_sockets(anon_client, db, first_message):
    job = create_job(db, status="completed", result={"overall_risk_score": 99})
    with anon_client.websocket_connect(f"/ws/jobs/{job.id}") as ws:
        ws.send_json(first_message)
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4401


def test_rejects_deactivated_users(anon_client, db, make_user):
    user = make_user("analyst", is_active=False)
    job = create_job(db, status="completed")
    with anon_client.websocket_connect(f"/ws/jobs/{job.id}") as ws:
        ws.send_json(auth_message(user))
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4401


def test_closes_silent_sockets(anon_client, db, monkeypatch):
    real_wait_for = asyncio.wait_for
    monkeypatch.setattr(asyncio, "wait_for", lambda aw, timeout: real_wait_for(aw, timeout=0.05))
    job = create_job(db)
    with anon_client.websocket_connect(f"/ws/jobs/{job.id}") as ws:
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4401
