"""
Asynchronous document analysis pipeline.

Production:   REDIS_URL is set -> jobs are queued in Redis and processed by Celery workers:
                  celery -A tasks worker --loglevel=info            (Linux / Docker)
                  celery -A tasks worker --loglevel=info --pool=solo (Windows)
Local dev:    REDIS_URL unset  -> jobs run in FastAPI BackgroundTasks inside the API process.
"""
import base64
import logging
from datetime import datetime, timezone

from celery import Celery
from fastapi import BackgroundTasks
from sqlalchemy.exc import IntegrityError

import models
import notifier
from database import SessionLocal
from document_ai import analyze_risk, extract_pdf_text

logger = logging.getLogger("sentinelfi.tasks")

TERMINAL_STATUSES = {"completed", "failed"}


def _upsert_entity(db, analysis: dict, filename: str) -> models.CorporateEntity:
    reg_num = analysis.get("registration_number") or "UNKNOWN"
    if reg_num.upper() == "UNKNOWN":
        # Keep unidentified filings apart instead of collapsing them into one "UNKNOWN" record
        reg_num = f"UNKNOWN-{filename}"

    entity = db.query(models.CorporateEntity).filter(
        models.CorporateEntity.registration_number == reg_num
    ).first()

    if entity:
        entity.ai_risk_score = analysis.get("overall_risk_score", 0.0)
    else:
        entity = models.CorporateEntity(
            company_name=analysis.get("company_name", "Unknown Company"),
            registration_number=reg_num,
            country_of_incorporation=analysis.get("country_of_incorporation", "Unknown"),
            ai_risk_score=analysis.get("overall_risk_score", 0.0)
        )
        db.add(entity)
    db.flush()
    return entity


def _set_status(db, job: models.DocumentJob, status: str, **fields) -> None:
    job.status = status
    for key, value in fields.items():
        setattr(job, key, value)
    if status in TERMINAL_STATUSES:
        job.completed_at = datetime.now(timezone.utc)
    db.commit()
    notifier.publish(job.id, job.to_payload())


def run_analysis_job(job_id: str, pdf_bytes: bytes) -> None:
    """Extract, analyze and persist one uploaded PDF, broadcasting each status change."""
    db = SessionLocal()
    try:
        job = db.get(models.DocumentJob, job_id)
        if job is None:
            logger.error("Analysis job %s not found", job_id)
            return

        _set_status(db, job, "processing")

        try:
            extracted_text = extract_pdf_text(pdf_bytes)
            if not extracted_text.strip():
                raise ValueError("Could not extract text from the PDF.")

            analysis = analyze_risk(extracted_text, job.bank_name)

            try:
                entity = _upsert_entity(db, analysis, job.filename)
                entity_id = entity.id
            except IntegrityError:
                db.rollback()
                logger.warning("Database integrity error while saving %s", job.filename)
                entity_id = None

            _set_status(db, job, "completed", result=analysis, entity_id=entity_id)
        except Exception as e:
            logger.exception("Analysis job %s failed", job_id)
            db.rollback()
            _set_status(db, job, "failed", error=str(e))
    finally:
        db.close()


celery_app = Celery("sentinelfi", broker=notifier.REDIS_URL) if notifier.REDIS_URL else None

if celery_app is not None:
    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        task_acks_late=True,           # re-deliver if a worker dies mid-analysis
        worker_prefetch_multiplier=1,  # Gemini calls are slow; don't hoard jobs
        task_ignore_result=True,       # results live in PostgreSQL, not the broker
    )

    @celery_app.task(name="sentinelfi.analyze_document")
    def analyze_document_task(job_id: str, pdf_b64: str) -> None:
        run_analysis_job(job_id, base64.b64decode(pdf_b64))


def enqueue_analysis(job_id: str, pdf_bytes: bytes, background_tasks: BackgroundTasks) -> None:
    if celery_app is not None:
        analyze_document_task.delay(job_id, base64.b64encode(pdf_bytes).decode("ascii"))
    else:
        background_tasks.add_task(run_analysis_job, job_id, pdf_bytes)
