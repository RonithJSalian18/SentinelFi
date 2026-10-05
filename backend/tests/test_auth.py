"""Authentication (OAuth2 + JWT) and role-based access control."""
from datetime import datetime, timedelta, timezone

import jwt
import pytest

import auth
import models

from .conftest import TEST_PASSWORD, bearer
from .pdf_factory import make_pdf


def login(client, email, password=TEST_PASSWORD):
    return client.post("/auth/token", data={"username": email, "password": password})


# --- Access-control matrix ---

ANALYST_ENDPOINTS = [
    ("get", "/documents"),
    ("get", "/jobs/some-job"),
    ("get", "/documents/some-job/url"),
    ("post", "/chat-document"),
    ("post", "/analyze-document"),
    ("get", "/auth/me"),
]
ADMIN_ONLY_ENDPOINTS = [
    ("post", "/aml/seed-dummy-data"),
    ("get", "/aml/detect-circular-trading"),
    ("get", "/aml/engine"),
    ("get", "/db-health"),
    ("get", "/auth/users"),
    ("post", "/auth/users"),
    ("patch", "/auth/users/1"),
]


@pytest.mark.parametrize("method,url", ANALYST_ENDPOINTS + ADMIN_ONLY_ENDPOINTS)
def test_anonymous_requests_are_rejected(anon_client, method, url):
    response = getattr(anon_client, method)(url)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize("method,url", ADMIN_ONLY_ENDPOINTS)
def test_analysts_cannot_reach_admin_endpoints(analyst_client, method, url):
    response = getattr(analyst_client, method)(url)
    assert response.status_code == 403
    assert "admin role" in response.json()["detail"]


def test_analysts_cannot_trigger_aml_side_effects(analyst_client, db):
    analyst_client.post("/aml/seed-dummy-data")
    assert db.query(models.CorporateEntity).count() == 0


def test_health_check_stays_public(anon_client):
    assert anon_client.get("/").status_code == 200


def test_analyst_workflow(analyst_client, db):
    """Compliance Analysts can submit documents, view scores and chat with documents."""
    job = analyst_client.post(
        "/analyze-document", files={"file": ("r.pdf", make_pdf("Acme filing"), "application/pdf")}
    ).json()
    assert analyst_client.get(f"/jobs/{job['job_id']}").json()["analysis"]["overall_risk_score"] == 72
    assert analyst_client.get("/documents").status_code == 200
    assert analyst_client.get(f"/documents/{job['job_id']}/url").status_code == 200
    chat = analyst_client.post("/chat-document", data={"query": "Who?", "job_id": job["job_id"]})
    assert chat.status_code == 200


def test_admins_can_run_aml(client):
    assert client.post("/aml/seed-dummy-data").status_code == 200
    assert client.get("/aml/detect-circular-trading").json()["status"] == "threat_detected"


def test_uploads_record_the_submitting_user(analyst_client, db):
    job_id = analyst_client.post(
        "/analyze-document", files={"file": ("r.pdf", make_pdf("x"), "application/pdf")}
    ).json()["job_id"]
    assert db.get(models.DocumentJob, job_id).submitted_by_id == analyst_client.user.id
    assert analyst_client.get("/documents").json()[0]["submitted_by"] == "analyst@sentinelfi.test"


def test_waf_still_runs_before_authentication(anon_client):
    assert anon_client.get("/aml/engine?x=DROP TABLE users").status_code == 403


# --- Login ---

def test_login_returns_bearer_token(anon_client, analyst_user):
    response = login(anon_client, "analyst@sentinelfi.test")
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == auth.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    user = {k: v for k, v in body["user"].items() if k not in ("created_at", "last_login_at")}
    assert user == {"id": analyst_user.id, "email": "analyst@sentinelfi.test",
                    "full_name": "Compliance Analyst", "role": "analyst", "is_active": True}
    assert body["user"]["last_login_at"] is not None

    me = anon_client.get("/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["email"] == "analyst@sentinelfi.test"


def test_login_is_case_insensitive_on_email(anon_client, analyst_user):
    assert login(anon_client, "  Analyst@SentinelFi.TEST ").status_code == 200


def test_login_records_last_login(anon_client, analyst_user, db):
    login(anon_client, analyst_user.email)
    db.refresh(analyst_user)
    assert analyst_user.last_login_at is not None


@pytest.mark.parametrize("email,password", [
    ("analyst@sentinelfi.test", "wrong-password"),
    ("nobody@sentinelfi.test", TEST_PASSWORD),
])
def test_bad_credentials_get_identical_errors(anon_client, analyst_user, email, password):
    response = login(anon_client, email, password)
    assert response.status_code == 401
    assert response.json() == {"detail": "Incorrect email or password."}


def test_deactivated_users_cannot_log_in(anon_client, make_user):
    make_user("analyst", email="gone@sentinelfi.test", is_active=False)
    assert login(anon_client, "gone@sentinelfi.test").status_code == 401


def test_repeated_failures_lock_the_account(anon_client, analyst_user):
    for _ in range(auth.LOGIN_MAX_FAILURES):
        assert login(anon_client, analyst_user.email, "wrong").status_code == 401
    locked = login(anon_client, analyst_user.email)  # even the right password
    assert locked.status_code == 429
    assert int(locked.headers["Retry-After"]) > 0


def test_successful_login_clears_failures(anon_client, analyst_user):
    for _ in range(auth.LOGIN_MAX_FAILURES - 1):
        login(anon_client, analyst_user.email, "wrong")
    assert login(anon_client, analyst_user.email).status_code == 200
    assert login(anon_client, analyst_user.email, "wrong").status_code == 401  # counter was reset


# --- Token validation ---

def forge(payload_overrides=None, key=auth.JWT_SECRET_KEY, algorithm="HS256", user_id=1):
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iss": "sentinelfi", "iat": now, "exp": now + timedelta(minutes=5)}
    payload.update(payload_overrides or {})
    return jwt.encode(payload, key, algorithm=algorithm)


@pytest.mark.parametrize("make_token", [
    lambda uid: forge(key="attacker-guessed-key-that-is-long-enough", user_id=uid),
    lambda uid: forge({"exp": datetime.now(timezone.utc) - timedelta(seconds=1)}, user_id=uid),
    lambda uid: forge({"iss": "someone-else"}, user_id=uid),
    lambda uid: forge({"sub": "not-a-number"}, user_id=uid),
    lambda uid: jwt.encode({"sub": str(uid), "iss": "sentinelfi"}, auth.JWT_SECRET_KEY, algorithm="HS256"),  # no exp/iat
    lambda uid: jwt.encode({"sub": str(uid), "iss": "sentinelfi"}, None, algorithm="none"),
    lambda uid: "garbage.token.value",
])
def test_rejects_invalid_tokens(anon_client, admin_user, make_token):
    response = anon_client.get("/auth/me", headers={"Authorization": f"Bearer {make_token(admin_user.id)}"})
    assert response.status_code == 401


def test_tokens_for_deleted_users_are_rejected(anon_client):
    assert anon_client.get("/auth/me", headers={"Authorization": f"Bearer {forge(user_id=999)}"}).status_code == 401


def test_role_comes_from_database_not_token(anon_client, analyst_user):
    # A token claiming "admin" does not grant admin rights to an analyst
    token = forge({"role": "admin"}, user_id=analyst_user.id)
    assert anon_client.get("/aml/engine", headers={"Authorization": f"Bearer {token}"}).status_code == 403


def test_demotion_takes_effect_immediately(anon_client, make_user, db):
    admin = make_user("admin", email="soon-demoted@sentinelfi.test")
    headers = bearer(admin)
    assert anon_client.get("/aml/engine", headers=headers).status_code == 200
    admin.role = "analyst"
    db.commit()
    assert anon_client.get("/aml/engine", headers=headers).status_code == 403


def test_deactivation_revokes_existing_tokens(anon_client, analyst_user, db):
    headers = bearer(analyst_user)
    analyst_user.is_active = False
    db.commit()
    assert anon_client.get("/documents", headers=headers).status_code == 401


# --- User management ---

def test_admin_creates_and_lists_users(client):
    created = client.post("/auth/users", json={
        "email": "New.Analyst@Bank.com", "full_name": "New Analyst", "password": "a-long-enough-password",
    })
    assert created.status_code == 201
    assert created.json()["email"] == "new.analyst@bank.com"
    assert created.json()["role"] == "analyst"
    assert "hashed_password" not in created.json()

    emails = [u["email"] for u in client.get("/auth/users").json()]
    assert emails == ["admin@sentinelfi.test", "new.analyst@bank.com"]

    assert login(client, "new.analyst@bank.com", "a-long-enough-password").status_code == 200


def test_passwords_are_hashed_with_argon2(client, db):
    client.post("/auth/users", json={"email": "h@bank.com", "full_name": "H", "password": "a-long-enough-password"})
    stored = db.query(models.User).filter_by(email="h@bank.com").one().hashed_password
    assert stored.startswith("$argon2id$")
    assert "a-long-enough-password" not in stored


@pytest.mark.parametrize("body", [
    {"email": "x@bank.com", "full_name": "X", "password": "short"},
    {"email": "not-an-email", "full_name": "X", "password": "a-long-enough-password"},
    {"email": "x@bank.com", "full_name": "X", "password": "a-long-enough-password", "role": "superuser"},
])
def test_user_creation_validates_input(client, body):
    assert client.post("/auth/users", json=body).status_code == 422


def test_duplicate_emails_are_rejected(client, analyst_user):
    response = client.post("/auth/users", json={
        "email": "ANALYST@sentinelfi.test", "full_name": "Dup", "password": "a-long-enough-password",
    })
    assert response.status_code == 409


def test_admin_promotes_and_deactivates_users(client, analyst_user):
    promoted = client.patch(f"/auth/users/{analyst_user.id}", json={"role": "admin"})
    assert promoted.json()["role"] == "admin"
    disabled = client.patch(f"/auth/users/{analyst_user.id}", json={"is_active": False})
    assert disabled.json()["is_active"] is False


@pytest.mark.parametrize("body", [{"role": "analyst"}, {"is_active": False}])
def test_admins_cannot_lock_themselves_out(client, body):
    assert client.patch(f"/auth/users/{client.user.id}", json=body).status_code == 400


def test_update_unknown_user_is_404(client):
    assert client.patch("/auth/users/9999", json={"role": "admin"}).status_code == 404


# --- Provisioning ---

def test_bootstrap_creates_first_admin(db, monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAIL", "Root@Bank.com")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "bootstrap-password-123")
    auth.bootstrap_admin()
    auth.bootstrap_admin()  # idempotent
    admins = db.query(models.User).filter_by(role="admin").all()
    assert [a.email for a in admins] == ["root@bank.com"]


def test_bootstrap_does_nothing_without_credentials(db):
    auth.bootstrap_admin()
    assert db.query(models.User).count() == 0
