"""
Original-document retention for KYC audits.

S3_BUCKET set -> AWS S3 (or any S3-compatible store via S3_ENDPOINT_URL: MinIO, Cloudflare R2,
                 LocalStack). Objects are encrypted at rest (SSE-S3, or SSE-KMS when
                 S3_KMS_KEY_ID is set) and integrity-checked with SHA-256 on upload.
Otherwise    -> local filesystem under LOCAL_STORAGE_DIR, for development only. Downloads use
                 HMAC-signed, expiring URLs so both backends behave like S3 pre-signed URLs.
"""
import hashlib
import hmac
import io
import os
import re
import secrets
import time
import urllib.parse
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

S3_BUCKET = os.getenv("S3_BUCKET")
PRESIGNED_URL_TTL = int(os.getenv("S3_PRESIGNED_URL_TTL", "900"))
LOCAL_STORAGE_DIR = os.getenv("LOCAL_STORAGE_DIR", str(Path(__file__).parent / "storage"))
# Without a configured key, signed local URLs stop working after a restart (fine for dev)
_LOCAL_SIGNING_KEY = (os.getenv("LOCAL_STORAGE_SIGNING_KEY") or secrets.token_hex(32)).encode()


@dataclass
class StoredDocument:
    key: str
    sha256: str
    size: int


def safe_filename(filename: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", os.path.basename(filename or "")).strip("._")
    return name[-120:] or "document.pdf"


def build_key(job_id: str, filename: str) -> str:
    now = datetime.now(timezone.utc)
    return f"kyc-documents/{now:%Y/%m}/{job_id}/{safe_filename(filename)}"


class S3Storage:
    name = "s3"

    def __init__(self, bucket: str):
        import boto3
        from botocore.config import Config

        self.bucket = bucket
        self.kms_key_id = os.getenv("S3_KMS_KEY_ID")
        endpoint = os.getenv("S3_ENDPOINT_URL") or None

        def make_client(endpoint_url):
            return boto3.client(
                "s3",
                region_name=os.getenv("AWS_REGION"),
                endpoint_url=endpoint_url,
                config=Config(signature_version="s3v4"),
            )

        self.client = make_client(endpoint)
        # Signatures cover the host, so browser-facing URLs must be signed for the public
        # address (e.g. http://localhost:9000 rather than Docker's internal http://minio:9000)
        public_endpoint = os.getenv("S3_PUBLIC_ENDPOINT_URL")
        self.presign_client = make_client(public_endpoint) if public_endpoint else self.client

    def put(self, key: str, content: bytes, metadata: dict) -> None:
        extra_args = {
            "ContentType": "application/pdf",
            "Metadata": metadata,
            "ChecksumAlgorithm": "SHA256",
        }
        if self.kms_key_id:
            extra_args.update(ServerSideEncryption="aws:kms", SSEKMSKeyId=self.kms_key_id)
        else:
            extra_args["ServerSideEncryption"] = "AES256"
        # upload_fileobj streams in parts (multipart above 8 MB) rather than one big PUT
        self.client.upload_fileobj(io.BytesIO(content), self.bucket, key, ExtraArgs=extra_args)

    def get(self, key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def presigned_url(self, key: str, filename: str, expires_in: int) -> str:
        return self.presign_client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ResponseContentType": "application/pdf",
                "ResponseContentDisposition": f'inline; filename="{safe_filename(filename)}"',
            },
            ExpiresIn=expires_in,
        )


class LocalStorage:
    name = "local"

    def __init__(self, root: str):
        self.root = Path(root).resolve()

    def path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise ValueError("Invalid storage key.")
        return path

    def put(self, key: str, content: bytes, metadata: dict) -> None:
        path = self.path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def get(self, key: str) -> bytes:
        return self.path(key).read_bytes()


def sign_local_url(job_id: str, expires: int) -> str:
    return hmac.new(_LOCAL_SIGNING_KEY, f"{job_id}:{expires}".encode(), hashlib.sha256).hexdigest()


def verify_local_signature(job_id: str, expires: int, signature: str) -> bool:
    return expires >= time.time() and hmac.compare_digest(sign_local_url(job_id, expires), signature)


_storage = None


def get_storage():
    global _storage
    if _storage is None:
        _storage = S3Storage(S3_BUCKET) if S3_BUCKET else LocalStorage(LOCAL_STORAGE_DIR)
    return _storage


def store_document(job_id: str, filename: str, content: bytes, tenant: str) -> StoredDocument:
    stored = StoredDocument(
        key=build_key(job_id, filename),
        sha256=hashlib.sha256(content).hexdigest(),
        size=len(content),
    )
    get_storage().put(stored.key, content, metadata={
        "job-id": job_id,
        "sha256": stored.sha256,
        "tenant": urllib.parse.quote(tenant),  # S3 metadata must be ASCII
        "original-filename": urllib.parse.quote(filename),
    })
    return stored


def load_document(key: str) -> bytes:
    return get_storage().get(key)


def document_url(job_id: str, key: str, filename: str, local_file_url: str) -> str:
    """A short-lived URL the browser can load directly (e.g. in an <iframe>)."""
    storage = get_storage()
    if isinstance(storage, S3Storage):
        return storage.presigned_url(key, filename, PRESIGNED_URL_TTL)
    expires = int(time.time()) + PRESIGNED_URL_TTL
    query = urllib.parse.urlencode({"expires": expires, "signature": sign_local_url(job_id, expires)})
    return f"{local_file_url}?{query}"
