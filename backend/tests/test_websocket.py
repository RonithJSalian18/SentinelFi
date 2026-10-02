"""Real-time job notifications over /ws/jobs/{job_id}."""
import models
import notifier


def create_job(db, status="queued", **fields):
    job = models.DocumentJob(filename="report.pdf", bank_name="Test Bank", status=status, **fields)
    db.add(job)
    db.commit()
    return job


def test_pushes_live_updates_until_complete(client, db):
    job = create_job(db)

    with client.websocket_connect(f"/ws/jobs/{job.id}") as ws:
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


def test_finished_job_sends_snapshot_and_closes(client, db):
    job = create_job(db, status="failed", error="bad scan")
    with client.websocket_connect(f"/ws/jobs/{job.id}") as ws:
        message = ws.receive_json()
        assert message["status"] == "failed"
        assert message["error"] == "bad scan"


def test_unknown_job_reports_not_found(client):
    with client.websocket_connect("/ws/jobs/missing") as ws:
        assert ws.receive_json() == {"job_id": "missing", "status": "not_found"}


def test_events_for_other_jobs_are_not_delivered(client, db):
    job, other = create_job(db), create_job(db)
    with client.websocket_connect(f"/ws/jobs/{job.id}") as ws:
        ws.receive_json()
        notifier.publish(other.id, {**other.to_payload(), "status": "completed"})
        notifier.publish(job.id, {**job.to_payload(), "status": "processing"})
        assert ws.receive_json()["job_id"] == job.id
