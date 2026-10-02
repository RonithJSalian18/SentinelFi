import os
import re
import urllib.parse
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import engine, Base, get_db, SessionLocal
from document_ai import extract_pdf_text, answer_question
from tasks import enqueue_analysis, TERMINAL_STATUSES
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
@app.post("/aml/seed-dummy-data")
def seed_aml_data(db: Session = Depends(get_db)):
    """Creates a circular trading loop for testing, ensuring no duplicates."""
    try:
        # 1. Check if the dummy data is already in the database
        existing_company = db.query(models.CorporateEntity).filter(
            models.CorporateEntity.registration_number == "AH-001"
        ).first()
        
        if existing_company:
            return {"status": "success", "message": "Dummy ledger already seeded. Ready to scan."}

        # 2. Create 3 Shell Companies
        co_a = models.CorporateEntity(company_name="Alpha Holdings", registration_number="AH-001")
        co_b = models.CorporateEntity(company_name="Beta Logistics", registration_number="BL-002")
        co_c = models.CorporateEntity(company_name="Gamma Consulting", registration_number="GC-003")
        
        db.add_all([co_a, co_b, co_c])
        db.commit()

        # 3. Create the Money Laundering Loop (A -> B -> C -> A)
        t1 = models.TransactionLedger(sender_id=co_a.id, receiver_id=co_b.id, amount=500000)
        t2 = models.TransactionLedger(sender_id=co_b.id, receiver_id=co_c.id, amount=495000)
        t3 = models.TransactionLedger(sender_id=co_c.id, receiver_id=co_a.id, amount=490000)
        
        db.add_all([t1, t2, t3])
        db.commit()
        
        return {"status": "success", "message": "Dummy money laundering loop created."}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/aml/detect-circular-trading")
def detect_circular_trading(db: Session = Depends(get_db)):
    """
    Executes a 3-way Self-Join combined with entity lookups to detect closed-loop transactions.
    """
    sql_query = text("""
        SELECT 
            c1.company_name AS entity_a,
            c2.company_name AS entity_b,
            c3.company_name AS entity_c,
            t1.amount AS initial_amount,
            t3.amount AS return_amount
        FROM transaction_ledgers t1
        JOIN transaction_ledgers t2 ON t1.receiver_id = t2.sender_id
        JOIN transaction_ledgers t3 ON t2.receiver_id = t3.sender_id
        JOIN corporate_entities c1 ON t1.sender_id = c1.id
        JOIN corporate_entities c2 ON t1.receiver_id = c2.id
        JOIN corporate_entities c3 ON t2.receiver_id = c3.id
        WHERE t3.receiver_id = t1.sender_id
        AND t1.amount > 10000;
    """)

    try:
        result = db.execute(sql_query).mappings().all()
        
        if not result:
            return {"status": "clean", "message": "No circular trading detected."}
            
        return {
            "status": "threat_detected", 
            "alert": "Circular Trading Loop Identified",
            "evidence": [dict(row) for row in result]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/aml/detect-circular-trading")
def detect_circular_trading(db: Session = Depends(get_db)):
    """
    Executes a 3-way Self-Join combined with entity lookups to detect closed-loop transactions.
    """
    sql_query = text("""
        SELECT 
            c1.company_name AS entity_a,
            c2.company_name AS entity_b,
            c3.company_name AS entity_c,
            t1.amount AS initial_amount,
            t3.amount AS return_amount
        FROM transaction_ledgers t1
        JOIN transaction_ledgers t2 ON t1.receiver_id = t2.sender_id
        JOIN transaction_ledgers t3 ON t2.receiver_id = t3.sender_id
        JOIN corporate_entities c1 ON t1.sender_id = c1.id
        JOIN corporate_entities c2 ON t1.receiver_id = c2.id
        JOIN corporate_entities c3 ON t2.receiver_id = c3.id
        WHERE t3.receiver_id = t1.sender_id
        AND t1.amount > 10000;
    """)

    try:
        result = db.execute(sql_query).mappings().all()
        
        if not result:
            return {"status": "clean", "message": "No circular trading detected across transaction ledgers."}
            
        return {
            "status": "threat_detected", 
            "alert": "Circular Trading Loop Identified",
            "evidence": [dict(row) for row in result]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
