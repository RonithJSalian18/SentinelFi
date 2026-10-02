"""Zero-Trust Security Shield (WAF middleware): blocks SQLi/XSS before any route runs."""
import pytest

import models

BLOCKED_DETAIL = "Access Denied: Suspicious activity blocked by SentinelFi Shield."


@pytest.mark.parametrize("url", [
    "/?q=DROP TABLE users",
    "/?q=drop table corporate_entities",                 # case-insensitive
    "/?q=DROP%20TABLE%20transaction_ledgers",            # URL-encoded
    "/?id=1;DELETE FROM corporate_entities",
    "/?name=' OR '1'='1",
    "/?name=%27%20OR%201%3D1",                           # encoded quote
    "/?user=admin'--",
    "/?q=UNION SELECT password FROM users",
    "/?q=1 /* comment */",
    "/?q=<script>alert(1)</script>",
    "/?img=<img src=x onerror=alert(1)>",
    "/jobs/1;DROP TABLE document_jobs",                  # attack in the path
])
def test_blocks_injection_payloads(client, url):
    response = client.get(url)
    assert response.status_code == 403
    assert response.json() == {"detail": BLOCKED_DETAIL}


def test_blocked_request_never_reaches_the_route(client, db):
    response = client.post("/aml/seed-dummy-data?note=DROP TABLE corporate_entities")
    assert response.status_code == 403
    assert db.query(models.CorporateEntity).count() == 0


@pytest.mark.parametrize("url", [
    "/",
    "/aml/engine",
    "/aml/detect-circular-trading?max_hops=3&min_amount=5000&chronological=true",
    "/documents?limit=5",
])
def test_allows_legitimate_requests(client, url):
    assert client.get(url).status_code == 200


def test_sets_security_headers(client):
    response = client.get("/")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Strict-Transport-Security"] == "max-age=31536000; includeSubDomains"


def test_security_headers_are_added_to_error_responses(client):
    response = client.get("/jobs/does-not-exist")
    assert response.status_code == 404
    assert response.headers["X-Frame-Options"] == "DENY"
