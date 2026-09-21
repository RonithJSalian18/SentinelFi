# 🛡️ SentinelFi

> **Autonomous KYB Intelligence & AML Graph Surveillance Engine**  
> An enterprise-grade, zero-trust compliance automation platform designed for Tier-1 financial institutions, fintechs, and corporate compliance teams.

---

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-black.svg?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/UI-React%2019-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS%20v4-38B2AC.svg?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791.svg?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Google Gemini](https://img.shields.io/badge/AI%20Engine-Gemini%202.5%20Flash-4285F4.svg?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![Security](https://img.shields.io/badge/Security-Zero--Trust%20Shield-critical.svg?style=flat-square&logo=shield)](https://github.com/RonithJSalian18/SentinelFi)

---

## 📌 Overview

Corporate onboarding (Know Your Business - KYB) and continuous Anti-Money Laundering (AML) monitoring in modern banking are plagued by manual document review, fragmented corporate registries, and sophisticated money laundering schemes such as round-tripping and circular trading.

**SentinelFi** delivers an autonomous compliance suite that:
1. **Parses & Evaluates Corporate Filings**: Automatically extracts entity details, ESG vulnerabilities, and hidden legal liabilities from PDFs using Gemini 2.5 Flash with deterministic JSON schema validation.
2. **Surveils Transaction Ledgers for Circular AML Loops**: Detects multi-party round-trip transactions ($A \to B \to C \to A$) using high-performance relational self-joins.
3. **Interactively Interrogates Documents**: Empowers analysts to perform conversational due diligence on corporate PDFs with verified document grounding.
4. **Protects Enterprise Infrastructure**: Enforces an active **Zero-Trust Security Shield** directly in the ASGI middleware pipeline, blocking SQL Injection and XSS attacks while applying strict HSTS and security headers.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph Client ["Client Layer"]
        UI["Next.js 16 Executive Dashboard\n(React 19 + Tailwind CSS)"]
    end

    subgraph Security ["Zero-Trust Defense Layer"]
        Shield["Zero-Trust Security Shield\n(ASGI Middleware: SQLi/XSS Filter + HSTS)"]
    end

    subgraph Backend ["SentinelFi Core Engine (FastAPI)"]
        Router["API Gateway / Routers"]
        PDFParser["PDF Document Extractor\n(PyPDF Stream Reader)"]
        AIEngine["Compliance AI Reasoner\n(Google Gemini 2.5 Flash)"]
        AMLEngine["Circular Trading Detection Engine\n(3-Way Relational Self-Join)"]
    end

    subgraph Data ["Data & Storage Layer"]
        Postgres[(PostgreSQL Database)]
        Entities["corporate_entities"]
        Owners["beneficial_owners"]
        Ledgers["transaction_ledgers"]
    end

    UI -->|"HTTP / REST (CORS restricted)"| Shield
    Shield -->|"Sanitized Payloads"| Router
    Router --> PDFParser
    PDFParser --> AIEngine
    AIEngine -->|"Structured Risk Scores & Registry Data"| Entities
    Router --> AMLEngine
    AMLEngine -->|"Loop Queries & Verification"| Ledgers
    Postgres --- Entities
    Postgres --- Owners
    Postgres --- Ledgers
```

---

## ✨ Key Features

### 1. 🔍 Autonomous KYB & Risk Scoring
- **Automated Ingestion**: Upload complex financial disclosures, annual reports, or registration certificates in PDF format.
- **Deep Risk Extraction**: Gemini 2.5 Flash extracts:
  - Corporate Registration Number & Jurisdiction of Incorporation
  - Legal Company Name
  - Top 3 ESG (Environmental, Social, Governance) Risk Factors
  - Financial liabilities, undisclosed debts, and litigation threats
  - Composite Risk Rating ($1 - 100$ scale: Low, Moderate, High)
- **Automatic Registry Sync**: Auto-creates or updates records in PostgreSQL (`corporate_entities`) with computed risk scores.

### 2. 🕸️ Graph AML Surveillance: Circular Trading Engine
- **Round-Tripping & Layering Detection**: Detects closed-loop money laundering flows where capital cycles through intermediary shell companies ($Entity_A \to Entity_B \to Entity_C \to Entity_A$).
- **SQL Self-Join Analysis**: Performs an optimized 3-way join on `transaction_ledgers` cross-referenced with `corporate_entities` for transactions exceeding configured thresholds.
- **Simulation Sandbox**: One-click test seeding (`/aml/seed-dummy-data`) to simulate and audit shell company loops.

### 3. 💬 Interactive Due Diligence Assistant (Document Q&A)
- Compliance officers can ask direct natural language questions against the uploaded PDF document (e.g., *"Who is the ultimate beneficial owner?", "Are there offshore subsidiaries mentioned?"*).
- Grounded contextual answers generated with strict compliance-focused system prompts.

### 4. 🛡️ Zero-Trust Security Shield
- Real-time ASGI middleware inspecting raw queries and URI paths for malicious attack vectors:
  - SQL Injection (`SELECT`, `DROP`, `INSERT`, comments `--`, etc.)
  - Cross-Site Scripting (`<script>`, `<img onerror=...`)
- Emits immediate `403 Forbidden` responses upon detection.
- Enforces enterprise HTTP headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | [Next.js 16](https://nextjs.org/) (App Router), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/), [Axios](https://axios-http.com/) |
| **Backend API** | [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+), [Uvicorn](https://www.uvicorn.org/), Starlette Middleware |
| **AI / LLM** | [Google Gemini 2.5 Flash](https://ai.google.dev/) via `google-genai` SDK (Structured JSON output schema) |
| **Document Processing** | [PyPDF](https://pypdf.readthedocs.io/) |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/), [SQLAlchemy 2.0](https://www.sqlalchemy.org/), [psycopg2-binary](https://pypi.org/project/psycopg2-binary/) |
| **DevOps & Containers** | [Docker](https://www.docker.com/) |

---

## 📂 Project Structure

```text
sentinelfi/
├── backend/
│   ├── database.py             # Database engine & session dependency (pool_pre_ping)
│   ├── models.py               # SQLAlchemy models (Entities, Owners, Ledgers)
│   ├── main.py                 # FastAPI application, routes & Zero-Trust Shield
│   ├── requirements.txt        # Backend dependencies
│   ├── Dockerfile              # Docker container configuration
│   └── .env.example            # Backend environment variables template
├── frontend/
│   ├── app/
│   │   ├── layout.tsx          # Root Next.js layout
│   │   ├── page.tsx            # SentinelFi compliance dashboard & AML visualizer
│   │   └── globals.css         # Global stylesheet & Tailwind CSS imports
│   ├── package.json            # Frontend package scripts & dependencies
│   ├── tsconfig.json           # TypeScript configuration
│   └── next.config.ts          # Next.js configuration
├── .gitignore
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:
- **Node.js**: `v18.17` or higher
- **Python**: `v3.10` or higher
- **PostgreSQL**: Local database or cloud instance (e.g., Supabase, Neon)
- **Google AI Studio API Key**: For Gemini 2.5 Flash ([Get Key](https://aistudio.google.com/))

---

### 1. Backend Setup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment**:
   - **Linux / macOS**:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```
   - **Windows (PowerShell)**:
     ```powershell
     python -m venv venv
     .\venv\Scripts\Activate.ps1
     ```

3. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**:
   Create a `.env` file in the `backend/` directory (you can copy `.env.example`):
   ```env
   DATABASE_URL=postgresql://postgres:password@localhost:5432/sentinelfi
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

5. **Start the FastAPI backend server**:
   ```bash
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```
   The API will be live at `http://127.0.0.1:8000` with interactive Swagger docs at `http://127.0.0.1:8000/docs`.

---

### 2. Frontend Setup

1. **Navigate to the frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install Node dependencies**:
   ```bash
   npm install
   ```

3. **Run the Next.js development server**:
   ```bash
   npm run dev
   ```

4. **Access the Dashboard**:
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 API Reference

| Method | Endpoint | Description | Payload / Parameters |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Health Check | None |
| `GET` | `/db-health` | PostgreSQL connectivity probe | None |
| `POST` | `/analyze-document` | PDF KYB Risk Analysis & database registration | `file`: PDF binary, `bank_name`: string |
| `POST` | `/chat-document` | Grounded conversational Q&A on PDF | `file`: PDF binary, `query`: string |
| `POST` | `/aml/seed-dummy-data` | Seeds a test circular trading loop | None |
| `GET` | `/aml/detect-circular-trading`| Detects round-tripping loops across ledgers | None |

---

## 🧪 Testing the AML Detection Engine

1. In the SentinelFi Dashboard, locate the **AML Graph Surveillance** banner.
2. Click **"Seed Test Loop"** (or make a `POST /aml/seed-dummy-data` request). This seeds three mock shell entities (`Alpha Holdings`, `Beta Logistics`, `Gamma Consulting`) with a closed transaction loop:
   $$\text{Alpha Holdings } \xrightarrow{\$500,000} \text{Beta Logistics } \xrightarrow{\$495,000} \text{Gamma Consulting } \xrightarrow{\$490,000} \text{Alpha Holdings}$$
3. Click **"Run AML Scan"**.
4. The system will detect the loop and render the evidence chain with transfer amounts and returning volumes.

---

## 🐳 Running with Docker

You can containerize the SentinelFi backend using the included Dockerfile:

```bash
# Build the Docker image
docker build -t sentinelfi-backend ./backend

# Run the container with environment variables
docker run -d -p 8000:8000 \
  -e DATABASE_URL="postgresql://user:password@host:5432/dbname" \
  -e GEMINI_API_KEY="your_api_key" \
  --name sentinelfi-api \
  sentinelfi-backend
```

---

## 🔒 Security Posture

- **Zero-Trust Request Inspection**: Every incoming query string is unquoted and matched against injection patterns prior to application processing.
- **Enterprise Headers**: Mitigates MIME-sniffing, framing (clickjacking), and insecure protocol downgrade via strict HSTS headers.
- **Data Isolation**: CORS policies configured specifically for permitted frontend origins (`http://localhost:3000`).

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
