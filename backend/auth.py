"""
Authentication & role-based access control (RBAC).

OAuth2 password flow issuing short-lived JWT bearer tokens, with two roles:
  analyst  Compliance Analyst: submit documents, view risk scores, chat with documents
  admin    System Admin: everything an analyst can do, plus AML scans, ledger seeding
           and user management

The role is always re-read from the database, never trusted from the token, so a demoted
or deactivated user loses access on their very next request.
"""
import logging
import os
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pwdlib import PasswordHash
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

import models
from database import SessionLocal, get_db

load_dotenv()
logger = logging.getLogger("sentinelfi.auth")


class Role(str, Enum):
    ANALYST = "analyst"
    ADMIN = "admin"


JWT_ALGORITHM = "HS256"
JWT_ISSUER = "sentinelfi"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    logger.warning("JWT_SECRET_KEY is not set; using a random key. Tokens will not survive a restart.")
    JWT_SECRET_KEY = secrets.token_urlsafe(64)

LOGIN_MAX_FAILURES = int(os.getenv("LOGIN_MAX_FAILURES", "5"))
LOGIN_LOCKOUT_SECONDS = int(os.getenv("LOGIN_LOCKOUT_SECONDS", "900"))

password_hash = PasswordHash.recommended()  # Argon2id
# Verified against when the email is unknown, so response time doesn't reveal which accounts exist
_DUMMY_HASH = password_hash.hash("sentinelfi-timing-equaliser")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")
router = APIRouter(prefix="/auth", tags=["auth"])

_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def create_access_token(user: models.User) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    expires_in = ACCESS_TOKEN_EXPIRE_MINUTES * 60
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "name": user.full_name,
        "role": user.role,  # informational for clients; the API re-checks the database
        "iss": JWT_ISSUER,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM), expires_in


_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials.",
    headers={"WWW-Authenticate": "Bearer"},
)


def user_from_token(db: Session, token: Optional[str]) -> models.User:
    if not token:
        raise _credentials_error
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],  # pinned: rejects "none" and algorithm-confusion tokens
            issuer=JWT_ISSUER,
            options={"require": ["exp", "iat", "sub", "iss"]},
        )
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, ValueError):
        raise _credentials_error
    user = db.get(models.User, user_id)
    if user is None or not user.is_active:
        raise _credentials_error
    return user


def authenticate_websocket_token(token: Optional[str]) -> models.User:
    db = SessionLocal()
    try:
        return user_from_token(db, token)
    finally:
        db.close()


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    return user_from_token(db, token)


def require_role(*roles: Role):
    allowed = {r.value for r in roles}

    def dependency(user: models.User = Depends(get_current_user)) -> models.User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires the {' or '.join(sorted(allowed))} role.",
            )
        return user

    return dependency


require_analyst = require_role(Role.ANALYST, Role.ADMIN)
require_admin = require_role(Role.ADMIN)


class LoginThrottle:
    """Locks an (IP, email) pair out after repeated failed logins. In-memory, per process."""

    def __init__(self, max_failures: int, lockout_seconds: int):
        self.max_failures = max_failures
        self.lockout_seconds = lockout_seconds
        self._failures: dict[tuple[str, str], list[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key, now):
        attempts = [t for t in self._failures.get(key, []) if now - t < self.lockout_seconds]
        self._failures[key] = attempts
        return attempts

    def retry_after(self, key) -> int:
        with self._lock:
            now = time.monotonic()
            attempts = self._recent(key, now)
            if len(attempts) < self.max_failures:
                return 0
            return int(self.lockout_seconds - (now - attempts[0])) + 1

    def record_failure(self, key) -> None:
        with self._lock:
            self._recent(key, time.monotonic()).append(time.monotonic())

    def reset(self, key) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def reset_all(self) -> None:
        with self._lock:
            self._failures.clear()


login_throttle = LoginThrottle(LOGIN_MAX_FAILURES, LOGIN_LOCKOUT_SECONDS)


# --- Schemas ---

class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: Role
    is_active: bool

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class UserCreate(BaseModel):
    email: str = Field(max_length=254)
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=12, max_length=128)
    role: Role = Role.ANALYST

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not _EMAIL_PATTERN.match(value):
            raise ValueError("Invalid email address.")
        return value


class UserUpdate(BaseModel):
    role: Optional[Role] = None
    is_active: Optional[bool] = None


# --- Routes ---

@router.post("/token", response_model=TokenResponse)
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """OAuth2 password flow: exchange email (as `username`) + password for a JWT bearer token."""
    email = form.username.strip().lower()
    throttle_key = (request.client.host if request.client else "unknown", email)

    retry_after = login_throttle.retry_after(throttle_key)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    user = db.query(models.User).filter(models.User.email == email).first()
    valid = password_hash.verify(form.password, user.hashed_password if user else _DUMMY_HASH)
    if not (user and valid and user.is_active):
        login_throttle.record_failure(throttle_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    login_throttle.reset(throttle_key)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    token, expires_in = create_access_token(user)
    return TokenResponse(access_token=token, expires_in=expires_in, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def read_current_user(user: models.User = Depends(get_current_user)):
    return user


@router.get("/users", response_model=list[UserOut])
def list_users(_: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.created_at, models.User.id).all()


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, _: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists.")
    user = models.User(
        email=body.email,
        full_name=body.full_name.strip(),
        hashed_password=hash_password(body.password),
        role=body.role.value,
    )
    db.add(user)
    db.commit()
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if user.id == admin.id and (body.role == Role.ANALYST or body.is_active is False):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot demote or deactivate your own account.")
    if body.role is not None:
        user.role = body.role.value
    if body.is_active is not None:
        user.is_active = body.is_active
    db.commit()
    return user


# --- Provisioning ---

def create_user_record(db: Session, email: str, full_name: str, password: str, role: Role) -> models.User:
    data = UserCreate(email=email, full_name=full_name, password=password, role=role)
    user = models.User(email=data.email, full_name=data.full_name, hashed_password=hash_password(data.password), role=data.role.value)
    db.add(user)
    db.commit()
    return user


def bootstrap_admin() -> None:
    """Create the first System Admin from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD if no admin exists."""
    email, password = os.getenv("BOOTSTRAP_ADMIN_EMAIL"), os.getenv("BOOTSTRAP_ADMIN_PASSWORD")
    if not (email and password):
        return
    db = SessionLocal()
    try:
        if db.query(models.User).filter(models.User.role == Role.ADMIN.value).first():
            return
        create_user_record(db, email, os.getenv("BOOTSTRAP_ADMIN_NAME", "System Admin"), password, Role.ADMIN)
        logger.warning("Bootstrapped System Admin account %s", email.lower())
    finally:
        db.close()
