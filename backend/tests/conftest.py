"""
Shared fixtures. Environment is pinned *before* any app module is imported: every app module
calls load_dotenv(), which never overrides variables that are already set, so a developer's
real backend/.env (PostgreSQL, Redis, S3, Gemini) can never leak into the test run.
"""
import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="sentinelfi-tests-")
os.environ.update({
    "DATABASE_URL": f"sqlite:///{os.path.join(_TMP, 'test.db')}".replace("\\", "/"),
    "GEMINI_API_KEY": "test-key",
    "REDIS_URL": "",                       # in-process BackgroundTasks + local notifier
    "S3_BUCKET": "",                       # local storage unless a test opts into S3
    "S3_ENDPOINT_URL": "",
    "S3_PUBLIC_ENDPOINT_URL": "",
    "S3_KMS_KEY_ID": "",
    "LOCAL_STORAGE_DIR": os.path.join(_TMP, "storage"),
    "LOCAL_STORAGE_SIGNING_KEY": "test-signing-key",
    "AML_ENGINE": "",
    "CORS_ORIGINS": "http://localhost:3000",
    "AWS_ACCESS_KEY_ID": "testing",
    "AWS_SECRET_ACCESS_KEY": "testing",
    "AWS_REGION": "us-east-1",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import database  # noqa: E402
import main  # noqa: E402
import models  # noqa: E402
import storage  # noqa: E402
import tasks  # noqa: E402

from .pdf_factory import make_pdf  # noqa: E402

FAKE_ANALYSIS = {
    "company_name": "Acme Holdings Ltd",
    "registration_number": "ACME-001",
    "country_of_incorporation": "United Kingdom",
    "esg_risks": ["Supply-chain labour practices"],
    "financial_liabilities": ["Undisclosed related-party loan"],
    "overall_risk_score": 72,
}


@pytest.fixture
def client():
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture
def db():
    session = database.SessionLocal()
    yield session
    session.close()


@pytest.fixture(autouse=True)
def clean_state(monkeypatch):
    """Empty every table and reset the storage backend between tests."""
    monkeypatch.setattr(storage, "_storage", None)
    yield
    with database.engine.begin() as conn:
        for table in reversed(models.Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture(autouse=True)
def fake_gemini(monkeypatch):
    """Never call the real Gemini API. Records what the model would have been sent."""
    calls = {"analyze": [], "chat": []}

    def analyze_risk(text, bank_name):
        calls["analyze"].append({"text": text, "bank_name": bank_name})
        return dict(FAKE_ANALYSIS)

    def answer_question(text, query):
        calls["chat"].append({"text": text, "query": query})
        return f"Answer to: {query}"

    monkeypatch.setattr(tasks, "analyze_risk", analyze_risk)
    monkeypatch.setattr(main, "answer_question", answer_question)
    return calls


@pytest.fixture
def sample_pdf():
    return make_pdf("Acme Holdings Ltd annual report. Registration ACME-001.")
