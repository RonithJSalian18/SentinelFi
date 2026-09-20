from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from google import genai
from google.genai import types
from sqlalchemy import text
import os
import io
import json
from dotenv import load_dotenv
from pypdf import PdfReader
from sqlalchemy.orm import Session

# Import your database configuration and models
from database import engine, Base, get_db
import models

# Load environment variables (API Keys and Database URLs)
load_dotenv()

# Initialize the Gemini 2.0 Client
ai_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Create PostgreSQL tables on startup (if they don't exist)
models.Base.metadata.create_all(bind=engine)

# Initialize the FastAPI App
app = FastAPI(
    title="SentinelFi Core Engine",
    description="Enterprise KYB Automation and Risk Scoring API",
    version="1.0.0"
)

@app.get("/")
def health_check():
    """Basic health check to verify the server is running."""
    return {"status": "SentinelFi backend is secure and running."}

@app.get("/db-health")
def check_db_health(db: Session = Depends(get_db)):
    """Verifies the connection to the remote PostgreSQL database."""
    try:
        # Ping the database safely using text()
        db.execute(text("SELECT 1"))
        return {"status": "success", "message": "Successfully connected to remote PostgreSQL!"}
    except Exception as e:
        return {"status": "error", "message": f"Database connection failed: {str(e)}"}

@app.post("/analyze-document")
async def analyze_document(
    file: UploadFile = File(...), 
    bank_name: str = Form("a Tier-1 Global Bank") # Enables Multi-Tenancy SaaS
):
    """
    Accepts a PDF document and a bank name, extracts all text, 
    and uses Gemini to generate a structured risk assessment.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        # 1. Read the file into memory and extract text
        content = await file.read()
        pdf_reader = PdfReader(io.BytesIO(content))
        
        extracted_text = ""
        # Process the entire document to ensure no hidden risks are missed
        for page in pdf_reader.pages: 
            extracted_text += page.extract_text()

        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from the PDF.")

        # 2. Construct the dynamic Enterprise Prompt
        prompt = f"""
        You are an expert Chief Compliance Officer operating on behalf of {bank_name}. 
        Your objective is to protect {bank_name} from regulatory fines and corporate fraud.
        
        Analyze the following corporate document text and extract the key risks.
        
        Document Text:
        {extracted_text}
        """

        # 3. Call Gemini and enforce the JSON Schema
        response = ai_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
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

        # 4. Return the structured data to the Next.js frontend
        return {
            "status": "success", 
            "tenant": bank_name,
            "filename": file.filename,
            "analysis": json.loads(response.text) 
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))