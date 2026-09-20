import os
import io
import json
import re
import urllib.parse
from dotenv import load_dotenv
from pypdf import PdfReader

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from google import genai
from sqlalchemy.exc import IntegrityError
from google.genai import types

from database import engine, Base, get_db
import models

load_dotenv()

# Initialize Gemini Client
ai_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

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

@app.post("/analyze-document")
async def analyze_document(
    file: UploadFile = File(...),
    bank_name: str = Form("a Tier-1 Global Bank"),
    db: Session = Depends(get_db) # 1. Inject the database session here
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        content = await file.read()
        pdf_reader = PdfReader(io.BytesIO(content))

        extracted_text = ""
        for page in pdf_reader.pages:
            extracted_text += page.extract_text() or ""

        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from the PDF.")

        prompt = f"""
        You are an expert Chief Compliance Officer operating on behalf of {bank_name}.
        Your objective is to protect {bank_name} from regulatory fines and corporate fraud.

        Analyze the following corporate document text and extract the key risks, along with the company's legal identity.

        Document Text:
        {extracted_text}
        """

        response = ai_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "company_name": {"type": "STRING", "description": "The legal name of the company."},
                        "registration_number": {"type": "STRING", "description": "The corporate registration number (or 'UNKNOWN' if missing)."},
                        "country_of_incorporation": {"type": "STRING", "description": "The country where the company is registered."},
                        "esg_risks": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                            "description": "Top 3 Environmental, Social, or Governance risks."
                        },
                        "financial_liabilities": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                            "description": "Any hidden debts, lawsuits, or financial red flags."
                        },
                        "overall_risk_score": {
                            "type": "INTEGER",
                            "description": "A risk score from 1 to 100 based on the findings."
                        }
                    }
                }
            )
        )

        analysis_data = json.loads(response.text)

        # 2. Save to PostgreSQL Database
        try:
            # Check if this company already exists in our database
            reg_num = analysis_data.get("registration_number", f"UNKNOWN-{file.filename}")
            existing_entity = db.query(models.CorporateEntity).filter(models.CorporateEntity.registration_number == reg_num).first()

            if existing_entity:
                # Update the existing record with the new risk score
                existing_entity.ai_risk_score = analysis_data.get("overall_risk_score", 0.0)
            else:
                # Create a brand new record
                new_entity = models.CorporateEntity(
                    company_name=analysis_data.get("company_name", "Unknown Company"),
                    registration_number=reg_num,
                    country_of_incorporation=analysis_data.get("country_of_incorporation", "Unknown"),
                    ai_risk_score=analysis_data.get("overall_risk_score", 0.0)
                )
                db.add(new_entity)
            
            db.commit()
            
        except IntegrityError:
            db.rollback()
            logger.warning(f"Database integrity error while saving {file.filename}")

        return {
            "status": "success",
            "tenant": bank_name,
            "filename": file.filename,
            "analysis": analysis_data
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))