"""Async document pipeline: upload -> archive -> background analysis -> persistence -> retrieval."""
import hashlib
from unittest import mock
from urllib.parse import urlparse

import boto3
import pytest
import requests
from moto import mock_aws

import main
import models
import storage
import tasks

from .conftest import FAKE_ANALYSIS
from .pdf_factory import make_pdf


def upload(client, pdf, filename="annual-report.pdf", bank="Tier-1 Test Bank"):
    return client.post(
        "/analyze-document",
        files={"file": (filename, pdf, "application/pdf")},
        data={"bank_name": bank},
    )


# --- Upload validation ---

def test_rejects_non_pdf_extension(client, sample_pdf):
    assert upload(client, sample_pdf, filename="report.docx").status_code == 400


def test_rejects_files_that_are_not_really_pdfs(client):
    response = upload(client, b"MZ\x90\x00 definitely an executable")
    assert response.status_code == 400
    assert "not a valid PDF" in response.json()["detail"]


def test_rejects_oversized_uploads(client, sample_pdf, monkeypatch):
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", len(sample_pdf) - 1)
    assert upload(client, sample_pdf).status_code == 413


# --- Async analysis ---

def test_upload_returns_202_immediately_with_job_id(client, sample_pdf):
    response = upload(client, sample_pdf)
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "queued"
    assert body["websocket"] == f"/ws/jobs/{body['job_id']}"
    assert body["document_sha256"] == hashlib.sha256(sample_pdf).hexdigest()


def test_background_job_analyzes_and_persists(client, db, sample_pdf, fake_gemini):
    job_id = upload(client, sample_pdf, bank="BNP Test").json()["job_id"]

    job = client.get(f"/jobs/{job_id}").json()
    assert job["status"] == "completed"
    assert job["analysis"] == FAKE_ANALYSIS

    # The worker read the archived PDF and sent its real text to the model
    assert "Registration ACME-001" in fake_gemini["analyze"][0]["text"]
    assert fake_gemini["analyze"][0]["bank_name"] == "BNP Test"

    entity = db.query(models.CorporateEntity).filter_by(registration_number="ACME-001").one()
    assert entity.ai_risk_score == 72
    assert entity.document_key == db.get(models.DocumentJob, job_id).document_key


def test_reanalysis_updates_existing_entity(client, db, sample_pdf):
    upload(client, sample_pdf)
    upload(client, sample_pdf)
    assert db.query(models.CorporateEntity).filter_by(registration_number="ACME-001").count() == 1


def test_unidentified_filings_are_kept_apart(client, db, monkeypatch):
    monkeypatch.setattr(tasks, "analyze_risk", lambda text, bank: {**FAKE_ANALYSIS, "registration_number": "UNKNOWN"})
    upload(client, make_pdf("first"), filename="a.pdf")
    upload(client, make_pdf("second"), filename="b.pdf")
    numbers = {e.registration_number for e in db.query(models.CorporateEntity)}
    assert numbers == {"UNKNOWN-a.pdf", "UNKNOWN-b.pdf"}


def test_failed_analysis_marks_job_failed(client, monkeypatch, sample_pdf):
    def boom(text, bank):
        raise RuntimeError("Gemini quota exceeded")
    monkeypatch.setattr(tasks, "analyze_risk", boom)

    job = client.get(f"/jobs/{upload(client, sample_pdf).json()['job_id']}").json()
    assert job["status"] == "failed"
    assert job["error"] == "Gemini quota exceeded"


def test_pdf_without_text_fails_cleanly(client):
    blank = make_pdf("")
    job = client.get(f"/jobs/{upload(client, blank).json()['job_id']}").json()
    assert job["status"] == "failed"
    assert "Could not extract text" in job["error"]


def test_unknown_job_returns_404(client):
    assert client.get("/jobs/00000000-0000-0000-0000-000000000000").status_code == 404


def test_celery_dispatch_sends_only_the_job_id(monkeypatch):
    task = mock.Mock()
    monkeypatch.setattr(tasks, "celery_app", object())
    monkeypatch.setattr(tasks, "analyze_document_task", task, raising=False)
    background = mock.Mock()

    tasks.enqueue_analysis("job-123", background)

    task.delay.assert_called_once_with("job-123")
    background.add_task.assert_not_called()


# --- Archive & retrieval ---

def test_archive_lists_recent_documents(client, sample_pdf):
    upload(client, sample_pdf, filename="first.pdf")
    archive = client.get("/documents").json()
    assert len(archive) == 1
    assert archive[0]["filename"] == "first.pdf"
    assert archive[0]["company_name"] == "Acme Holdings Ltd"
    assert archive[0]["risk_score"] == 72
    assert archive[0]["size_bytes"] == len(sample_pdf)


def test_local_signed_url_serves_the_original(client, sample_pdf):
    job_id = upload(client, sample_pdf).json()["job_id"]
    link = client.get(f"/documents/{job_id}/url").json()
    assert link["storage"] == "local"

    url = urlparse(link["url"])
    response = client.get(f"{url.path}?{url.query}")
    assert response.status_code == 200
    assert response.content == sample_pdf
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"].startswith("inline")
    # Embeddable by the dashboard only
    assert "X-Frame-Options" not in response.headers
    assert response.headers["Content-Security-Policy"] == "frame-ancestors 'self' http://localhost:3000"


@pytest.mark.parametrize("query", [
    "expires=9999999999&signature=" + "0" * 64,   # forged signature
    "expires=1&signature=" + "0" * 64,            # expired
])
def test_local_document_links_reject_bad_signatures(client, sample_pdf, query):
    job_id = upload(client, sample_pdf).json()["job_id"]
    assert client.get(f"/documents/{job_id}/file?{query}").status_code == 403


def test_signature_is_bound_to_one_document(client):
    first = upload(client, make_pdf("one")).json()["job_id"]
    second = upload(client, make_pdf("two")).json()["job_id"]
    url = urlparse(client.get(f"/documents/{first}/url").json()["url"])
    assert client.get(f"/documents/{second}/file?{url.query}").status_code == 403


def test_document_url_for_unknown_job_is_404(client):
    assert client.get("/documents/missing/url").status_code == 404


def test_storage_keys_cannot_escape_the_archive(tmp_path):
    with pytest.raises(ValueError):
        storage.LocalStorage(str(tmp_path)).path("../../etc/passwd")


def test_filenames_are_sanitised_for_storage_keys():
    assert storage.safe_filename("../../Annual Report (FINAL).pdf") == "Annual_Report_FINAL_.pdf"
    assert storage.safe_filename("") == "document.pdf"


# --- AWS S3 backend ---

@pytest.fixture
def s3_bucket(monkeypatch):
    with mock_aws():
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="sentinelfi-test")
        monkeypatch.setattr(storage, "_storage", storage.S3Storage("sentinelfi-test"))
        yield boto3.client("s3", region_name="us-east-1")


def test_s3_upload_is_encrypted_and_checksummed(client, s3_bucket, sample_pdf):
    job_id = upload(client, sample_pdf, bank="Bänk Ünïcode").json()["job_id"]

    [obj] = s3_bucket.list_objects_v2(Bucket="sentinelfi-test")["Contents"]
    assert obj["Key"].startswith("kyc-documents/") and job_id in obj["Key"]

    head = s3_bucket.head_object(Bucket="sentinelfi-test", Key=obj["Key"], ChecksumMode="ENABLED")
    assert head["ServerSideEncryption"] == "AES256"
    assert head["ContentType"] == "application/pdf"
    assert head["Metadata"]["sha256"] == hashlib.sha256(sample_pdf).hexdigest()
    assert head["Metadata"]["tenant"] == "B%C3%A4nk%20%C3%9Cn%C3%AFcode"
    assert head.get("ChecksumSHA256")


def test_s3_worker_reads_document_back(client, s3_bucket, sample_pdf, fake_gemini):
    job_id = upload(client, sample_pdf).json()["job_id"]
    assert client.get(f"/jobs/{job_id}").json()["status"] == "completed"
    assert "Registration ACME-001" in fake_gemini["analyze"][0]["text"]


def test_s3_presigned_url_serves_inline_pdf(client, s3_bucket, sample_pdf):
    job_id = upload(client, sample_pdf, filename="Annual Report.pdf").json()["job_id"]
    link = client.get(f"/documents/{job_id}/url").json()
    assert link["storage"] == "s3"
    assert "X-Amz-Signature" in link["url"]

    response = requests.get(link["url"])
    assert response.status_code == 200
    assert response.content == sample_pdf
    assert response.headers["Content-Disposition"] == 'inline; filename="Annual_Report.pdf"'


def test_kms_encryption_when_key_configured(client, s3_bucket, sample_pdf, monkeypatch):
    kms = boto3.client("kms", region_name="us-east-1")
    key_id = kms.create_key()["KeyMetadata"]["KeyId"]
    monkeypatch.setenv("S3_KMS_KEY_ID", key_id)
    monkeypatch.setattr(storage, "_storage", storage.S3Storage("sentinelfi-test"))

    upload(client, sample_pdf)
    [obj] = s3_bucket.list_objects_v2(Bucket="sentinelfi-test")["Contents"]
    head = s3_bucket.head_object(Bucket="sentinelfi-test", Key=obj["Key"])
    assert head["ServerSideEncryption"] == "aws:kms"


# --- Document Q&A ---

def test_chat_uses_archived_document(client, sample_pdf, fake_gemini):
    job_id = upload(client, sample_pdf).json()["job_id"]
    response = client.post("/chat-document", data={"query": "Who owns Acme?", "job_id": job_id})
    assert response.json() == {"status": "success", "answer": "Answer to: Who owns Acme?"}
    assert "Registration ACME-001" in fake_gemini["chat"][0]["text"]


def test_chat_accepts_direct_upload(client, fake_gemini):
    response = client.post(
        "/chat-document",
        data={"query": "Any lawsuits?"},
        files={"file": ("q.pdf", make_pdf("Pending lawsuit in Delaware"), "application/pdf")},
    )
    assert response.status_code == 200
    assert fake_gemini["chat"][0]["text"] == "Pending lawsuit in Delaware"


def test_chat_requires_a_document(client):
    assert client.post("/chat-document", data={"query": "hello"}).status_code == 400


def test_chat_with_unknown_job_is_404(client):
    assert client.post("/chat-document", data={"query": "q", "job_id": "nope"}).status_code == 404
