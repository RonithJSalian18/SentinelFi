import os
import re
import urllib.parse
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request, BackgroundTasks, WebSocket, WebSocketDisconnect, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import engine, Base, get_db, SessionLocal
from document_ai import extract_pdf_text, answer_question
from tasks import enqueue_analysis, TERMINAL_STATUSES
from aml_engine import ENGINE as AML_ENGINE
from aml_engine.scanner import scan_circular_trading, ScanOptions
import models
import notifier

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "25")) * 1024 * 1024

# Create PostgreSQL tables on startup
models.Base.metadata.create_all(bind=engine)

# Known malicious patterns (SQL Injection & XSS)
SUSPICIOUS_PATTERNS = [
    r"(?i)\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b",
    r"(?i)(--|;|\'|\"|/\*|\*/)",
    r"(?i)(<script>|<img.*onerror=)"
]

# 1. CREATE APPLICATION (Single instance only)
app = FastAPI(
    title="SentinelFi Core Engine",
    description="Enterprise KYB Automation and Risk Scoring API",
    version="1.0.0"
)

# 2. CORS MIDDLEWARE
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. ZERO-TRUST SECURITY SHIELD MIDDLEWARE
@app.middleware("http")
async def zero_trust_security_shield(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"
    
    # Extract the raw ASGI query string directly (bypasses URL decoding quirks)
    raw_query = request.scope.get("query_string", b"").decode("utf-8", errors="ignore")
    decoded_query = urllib.parse.unquote(raw_query)
    path = request.url.path
    
    payload_to_scan = f"{path}?{decoded_query}"

    # Scan the full payload
    for pattern in SUSPICIOUS_PATTERNS:
        if re.search(pattern, payload_to_scan):
            print(f"\n🚨 [BLOCKED] Malicious request from {client_ip}: matched '{pattern}' in '{payload_to_scan}'\n", flush=True)
            return JSONResponse(
                status_code=403,
                content={"detail": "Access Denied: Suspicious activity blocked by SentinelFi Shield."}
            )

    response = await call_next(request)

    # Inject enterprise security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response


# --- API ROUTES ---
SEED_LOOPS = [
    # (companies as (name, registration number), amounts per hop): each forms a closed loop
    ([("Alpha Holdings", "AH-001"), ("Beta Logistics", "BL-002"), ("Gamma Consulting", "GC-003")],
     [500000, 495000, 490000]),
    ([("Delta Capital", "DC-004"), ("Epsilon Trading", "ET-005"), ("Zeta Imports", "ZI-006"), ("Eta Ventures", "EV-007")],
     [1200000, 1180000, 1165000, 1150000]),
]

@app.post("/aml/seed-dummy-data")
def seed_aml_data(db: Session = Depends(get_db)):
    """Creates a 3-hop and a 4-hop circular trading loop for testing, ensuring no duplicates."""
    try:
        created = 0
        for companies, amounts in SEED_LOOPS:
            if db.query(models.CorporateEntity).filter(
                models.CorporateEntity.registration_number == companies[0][1]
            ).first():
                continue

            entities = [models.CorporateEntity(company_name=name, registration_number=reg) for name, reg in companies]
            db.add_all(entities)
            db.flush()

            # One hop per day, so the loop is also caught by chronological scans
            start = datetime.now(timezone.utc) - timedelta(days=len(entities))
            db.add_all([
                models.TransactionLedger(
                    sender_id=entities[i].id,
                    receiver_id=entities[(i + 1) % len(entities)].id,
                    amount=amount,
                    transaction_date=start + timedelta(days=i),
                )
                for i, amount in enumerate(amounts)
            ])
            created += 1

        db.commit()
        if not created:
            return {"status": "success", "message": "Dummy ledger already seeded. Ready to scan."}
        return {"status": "success", "message": f"{created} dummy money laundering loop(s) created."}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/aml/detect-circular-trading")
def detect_circular_trading(
    max_hops: int = Query(4, ge=2, le=8, description="Longest loop to search for"),
    min_amount: float = Query(10000, ge=0, description="Ignore transfers below this amount"),
    window_days: int = Query(0, ge=0, le=3650, description="Max days between first and last hop (0 = unlimited)"),
    chronological: bool = Query(False, description="Require every hop to follow the previous one in time"),
    max_results: int = Query(500, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    """
    Loads the ledger into the in-memory AML graph engine (C++ via pybind11, with a pure-Python
    fallback) and reports every closed money loop of 2..max_hops entities.
    """
    try:
        return scan_circular_trading(db, ScanOptions(
            max_hops=max_hops,
            min_amount=min_amount,
            window_days=window_days,
            chronological=chronological,
            max_results=max_results,
        ))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/aml/engine")
def aml_engine_info():
    return {"engine": AML_ENGINE, "native": AML_ENGINE == "cpp"}

@app.get("/")
def health_check():
    return {"status": "SentinelFi backend is secure and running."}

@app.get("/db-health")
def check_db_health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "success", "message": "Successfully connected to remote PostgreSQL!"}
    except Exception as e:
        return {"status": "error", "message": f"Database connection failed: {str(e)}"}

@app.post("/analyze-document", status_code=202)
async def analyze_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    bank_name: str = Form("a Tier-1 Global Bank"),
    db: Session = Depends(get_db)
):
    """Queues a PDF for background risk analysis and returns immediately with a job id."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"PDF exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit.")

    job = models.DocumentJob(filename=file.filename, bank_name=bank_name, status="queued")
    db.add(job)
    db.commit()

    enqueue_analysis(job.id, content, background_tasks)

    return {
        **job.to_payload(),
        "message": "Processing... connect to the WebSocket for live status.",
        "websocket": f"/ws/jobs/{job.id}",
    }

@app.get("/jobs/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.get(models.DocumentJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job.to_payload()

def _job_snapshot(job_id: str):
    db = SessionLocal()
    try:
        job = db.get(models.DocumentJob, job_id)
        return job.to_payload() if job else None
    finally:
        db.close()

@app.websocket("/ws/jobs/{job_id}")
async def job_updates(websocket: WebSocket, job_id: str):
    """Pushes live status for one analysis job until it completes or fails."""
    await websocket.accept()
    try:
        # Subscribe before reading the current state so no update can slip through the gap
        async with notifier.subscribe(job_id) as next_event:
            snapshot = await run_in_threadpool(_job_snapshot, job_id)
            if snapshot is None:
                await websocket.send_json({"job_id": job_id, "status": "not_found"})
                await websocket.close(code=4404)
                return
            await websocket.send_json(snapshot)

            while snapshot["status"] not in TERMINAL_STATUSES:
                event = await next_event(30)
                # On timeout, fall back to the database in case an event was missed
                latest = event or await run_in_threadpool(_job_snapshot, job_id)
                if latest and latest["status"] != snapshot["status"]:
                    snapshot = latest
                    await websocket.send_json(snapshot)
        await websocket.close()
    except WebSocketDisconnect:
        pass

@app.post("/chat-document")
async def chat_with_document(
    query: str = Form(...),
    file: UploadFile = File(...)
):
    """Allows users to ask specific questions about the uploaded compliance PDF."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        content = await file.read()
        extracted_text = extract_pdf_text(content)

        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text.")

        return {
            "status": "success",
            "answer": answer_question(extracted_text, query)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
