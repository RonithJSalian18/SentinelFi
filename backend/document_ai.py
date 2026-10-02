import io
import json
import os

from google import genai
from google.genai import types
from pypdf import PdfReader

GEMINI_MODEL = "gemini-2.5-flash"

RISK_SCHEMA = {
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

_ai_client = None


def get_ai_client() -> genai.Client:
    """Lazily create the Gemini client so importing this module never needs an API key."""
    global _ai_client
    if _ai_client is None:
        _ai_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    return _ai_client


def extract_pdf_text(content: bytes) -> str:
    pdf_reader = PdfReader(io.BytesIO(content))
    return "".join(page.extract_text() or "" for page in pdf_reader.pages)


def analyze_risk(extracted_text: str, bank_name: str) -> dict:
    prompt = f"""
    You are an expert Chief Compliance Officer operating on behalf of {bank_name}.
    Your objective is to protect {bank_name} from regulatory fines and corporate fraud.

    Analyze the following corporate document text and extract the key risks, along with the company's legal identity.

    Document Text:
    {extracted_text}
    """

    response = get_ai_client().models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=RISK_SCHEMA,
        )
    )
    return json.loads(response.text)


def answer_question(extracted_text: str, query: str) -> str:
    prompt = f"""
    You are an expert financial compliance AI.
    Read the following corporate document and answer the user's question accurately.
    If the answer is not in the text, clearly state "Information not found in document."

    Document Text:
    {extracted_text}

    User Question: {query}
    """

    response = get_ai_client().models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt
    )
    return response.text
