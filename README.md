# 🛡️ SentinelFi

> **Autonomous KYB Intelligence & AML Graph Surveillance Engine**  
> An enterprise-grade, zero-trust compliance automation platform designed for Tier-1 financial institutions, fintechs, and corporate compliance teams.

---

[![CI/CD](https://github.com/RonithJSalian18/SentinelFi/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/RonithJSalian18/SentinelFi/actions/workflows/ci-cd.yml)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-black.svg?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/UI-React%2019-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS%20v4-38B2AC.svg?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791.svg?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Google Gemini](https://img.shields.io/badge/AI%20Engine-Gemini%202.5%20Flash-4285F4.svg?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![Celery](https://img.shields.io/badge/Task%20Queue-Celery%20%2B%20Redis-37814A.svg?style=flat-square&logo=celery&logoColor=white)](https://docs.celeryq.dev/)
[![C++](https://img.shields.io/badge/AML%20Engine-C%2B%2B17%20%2B%20pybind11-00599C.svg?style=flat-square&logo=cplusplus&logoColor=white)](https://pybind11.readthedocs.io/)
[![AWS S3](https://img.shields.io/badge/Storage-AWS%20S3-FF9900.svg?style=flat-square&logo=amazons3&logoColor=white)](https://aws.amazon.com/s3/)
[![Security](https://img.shields.io/badge/Security-Zero--Trust%20Shield-critical.svg?style=flat-square&logo=shield)](https://github.com/RonithJSalian18/SentinelFi)

---

## 📌 Overview

Corporate onboarding (Know Your Business - KYB) and continuous Anti-Money Laundering (AML) monitoring in modern banking are plagued by manual document review, fragmented corporate registries, and sophisticated money laundering schemes such as round-tripping and circular trading.

**SentinelFi** delivers an autonomous compliance suite that:
1. **Parses & Evaluates Corporate Filings**: Automatically extracts entity details, ESG vulnerabilities, and hidden legal liabilities from PDFs using Gemini 2.5 Flash with deterministic JSON schema validation — processed asynchronously by Celery workers with real-time WebSocket notifications.
2. **Surveils Transaction Ledgers for Circular AML Loops**: Detects multi-party round-trip transactions ($A \to B \to \dots \to A$, up to 8 entities) with a multi-threaded C++ graph engine bound to Python via pybind11.
3. **Retains Original Filings for Audit**: Streams every uploaded PDF into encrypted AWS S3 storage with a SHA-256 fingerprint, and renders it in an embedded viewer through short-lived pre-signed URLs.
4. **Interactively Interrogates Documents**: Empowers analysts to perform conversational due diligence on corporate PDFs with verified document grounding.
5. **Protects Enterprise Infrastructure**: Enforces an active **Zero-Trust Security Shield** directly in the ASGI middleware pipeline, blocking SQL Injection and XSS attacks while applying strict HSTS and security headers.

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
        WS["WebSocket Job Notifier\n(/ws/jobs/{id})"]
    end

    subgraph Async ["Asynchronous Processing Layer"]
        Redis[("Redis\n(Broker + Pub/Sub)")]
        Worker["Celery Worker"]
        PDFParser["PDF Document Extractor\n(PyPDF Stream Reader)"]
        AIEngine["Compliance AI Reasoner\n(Google Gemini 2.5 Flash)"]
    end

    subgraph Engines ["Detection Engines"]
        AMLEngine["AML Graph Engine\n(C++17 + pybind11, SCC-pruned parallel DFS)"]
    end

    subgraph Data ["Data & Storage Layer"]
        Postgres[(PostgreSQL Database)]
        Entities["corporate_entities"]
        Owners["beneficial_owners"]
        Ledgers["transaction_ledgers"]
        Jobs["document_jobs"]
    end

    subgraph Storage ["Document Retention Layer"]
        S3[("AWS S3\n(SSE encrypted, versioned)")]
    end

    UI -->|"HTTP / REST (CORS restricted)"| Shield
    UI <-->|"WebSocket: live job status"| WS
    Shield -->|"Sanitized Payloads"| Router
    Router -->|"Stream PDF + SHA-256"| S3
    Router -->|"202 Accepted + job_id"| Jobs
    Router -->|"Enqueue"| Redis
    Redis --> Worker
    S3 -->|"Fetch original"| Worker
    Worker --> PDFParser
    PDFParser --> AIEngine
    AIEngine -->|"Structured Risk Scores & Registry Data"| Entities
    Worker -->|"Status events"| Redis
    Redis -->|"Pub/Sub"| WS
    Router --> AMLEngine
    AMLEngine -->|"Loop Queries & Verification"| Ledgers
    Postgres --- Entities
    Postgres --- Owners
    Postgres --- Ledgers
    Postgres --- Jobs
    UI -.->|"Pre-signed URL (embedded viewer)"| S3
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

### ⚡ Asynchronous Processing Pipeline
- **Non-blocking uploads**: `POST /analyze-document` returns `202 Accepted` with a `job_id` in milliseconds, no matter how large the filing.
- **Celery workers**: A background worker pulls the PDF from the Redis queue, runs the GenAI extraction, and persists results to PostgreSQL (`document_jobs` + `corporate_entities`). Jobs are acknowledged late, so a crashed worker's job is re-delivered.
- **Real-time push**: Workers publish status changes (`queued → processing → completed | failed`) over Redis pub/sub; the API relays them to the dashboard through a WebSocket (`/ws/jobs/{job_id}`), which raises an **"Analysis Complete"** notification.
- **Resilient client**: If the WebSocket drops, the dashboard falls back to polling `GET /jobs/{job_id}`.
- **Zero-infra dev mode**: With `REDIS_URL` unset, jobs run in-process through FastAPI `BackgroundTasks` using the same pipeline.

### 2. 🕸️ High-Frequency AML Graph Engine
A 3-way SQL self-join only finds loops of exactly three entities, and its cost explodes on large ledgers. SentinelFi instead streams the ledger into an in-memory graph and runs a dedicated C++ algorithm:

- **Native C++17 core** ([`aml_engine/cpp/cycle_detector.hpp`](backend/aml_engine/cpp/cycle_detector.hpp)), exposed to FastAPI through **pybind11** with zero-copy NumPy buffers and the GIL released during the scan.
- **Algorithm**:
  1. **CSR adjacency** built by counting sort in $O(V + E)$.
  2. **Tarjan SCC decomposition** (iterative): a loop can never leave its strongly connected component, so every inter-component transfer is discarded up front.
  3. **Depth-bounded DFS** enumerating every simple loop of 2..8 hops, reporting each loop exactly once.
  4. **Meet-in-the-middle pruning**: a reverse BFS of radius ⌊hops/2⌋ marks which entities can still route money back to the start, so dead-end branches are cut early.
  5. **Multi-threaded**: start nodes are processed in chunks across all CPU cores; results are merged deterministically.
- **Forensic options**: `max_hops`, `min_amount`, `chronological` (each hop must follow the previous one in time), and `window_days` (whole loop must complete within N days).
- **Evidence trail**: every loop returns the ordered entity path, each underlying transaction, total volume and the **retention %** (how much of the original sum came back).
- **Pure-Python fallback** with identical semantics, used automatically when the extension isn't compiled; randomized parity testing (12,000 graph/option combinations) confirms both engines return identical results.
- **Simulation Sandbox**: One-click test seeding (`/aml/seed-dummy-data`) creates a 3-hop and a 4-hop shell-company loop.

**Benchmark** (`python -m aml_engine.benchmark`, laptop Intel i5-13420H, 12 threads):

| Ledger | Loop length | C++ engine | Python engine |
| :--- | :--- | ---: | ---: |
| 20k entities / 100k transactions | 2–4 hops | **9.5 ms** | 2,717 ms (287× slower) |
| 5M entities / 10M transactions | 2–6 hops | **~14 s** | impractical |

### 3. 🗄️ Document Retention & Embedded Viewer (AWS S3)
- **Secure ingestion**: Each upload is validated (PDF magic bytes, size limit), fingerprinted with SHA-256, and streamed to S3 under `kyc-documents/YYYY/MM/<job_id>/<filename>` with **server-side encryption** (SSE-S3 by default, SSE-KMS via `S3_KMS_KEY_ID`) and an S3-verified SHA-256 checksum.
- **Queue carries ids, not files**: Celery workers fetch the original from S3 by key, so PDFs never pass through Redis.
- **Audit linkage**: The object key and fingerprint are stored on `document_jobs` and the latest filing's key on `corporate_entities.document_key`.
- **Pre-signed URLs on demand**: The database stores object *keys*, not URLs. Pre-signed URLs expire (default 15 min), so a fresh one is generated every time an analyst opens a document (`GET /documents/{job_id}/url`).
- **Embedded PDF viewer**: The dashboard renders the original filing in-page, alongside its fingerprint, plus a **Document Archive** table listing every retained filing.
- **Archive-backed Q&A**: Document chat reads the archived copy (`job_id`) instead of re-uploading the PDF.
- **S3-compatible**: Works with MinIO, Cloudflare R2 or LocalStack via `S3_ENDPOINT_URL`.
- **Zero-infra dev mode**: Without `S3_BUCKET`, files are kept under `backend/storage/` and served through HMAC-signed, expiring links that behave like S3 pre-signed URLs.

### 4. 💬 Interactive Due Diligence Assistant (Document Q&A)
- Compliance officers can ask direct natural language questions against the uploaded PDF document (e.g., *"Who is the ultimate beneficial owner?", "Are there offshore subsidiaries mentioned?"*).
- Grounded contextual answers generated with strict compliance-focused system prompts.

### 5. 🛡️ Zero-Trust Security Shield
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
| **Backend API** | [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+), [Uvicorn](https://www.uvicorn.org/), Starlette Middleware, WebSockets |
| **Task Queue** | [Celery](https://docs.celeryq.dev/), [Redis](https://redis.io/) (broker + pub/sub) |
| **AI / LLM** | [Google Gemini 2.5 Flash](https://ai.google.dev/) via `google-genai` SDK (Structured JSON output schema) |
| **Document Processing** | [PyPDF](https://pypdf.readthedocs.io/) |
| **AML Graph Engine** | C++17, [pybind11](https://pybind11.readthedocs.io/), [NumPy](https://numpy.org/) |
| **Object Storage** | [AWS S3](https://aws.amazon.com/s3/) via [boto3](https://boto3.amazonaws.com/) (MinIO for local Docker) |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/), [SQLAlchemy 2.0](https://www.sqlalchemy.org/), [psycopg2-binary](https://pypi.org/project/psycopg2-binary/) |
| **DevOps & Containers** | [Docker](https://www.docker.com/), Docker Compose, [GitHub Actions](https://github.com/features/actions), [Docker Hub](https://hub.docker.com/), [Render](https://render.com/) |
| **Testing & Quality** | [pytest](https://pytest.org/), pytest-cov, [moto](https://github.com/getmoto/moto) (AWS mocks), [Ruff](https://docs.astral.sh/ruff/), ESLint, Dependabot |

---

## 📂 Project Structure

```text
sentinelfi/
├── .github/
│   ├── workflows/ci-cd.yml     # Test → build → push → deploy pipeline
│   └── dependabot.yml          # Weekly dependency update PRs
├── backend/
│   ├── database.py             # Database engine & session dependency (pool_pre_ping)
│   ├── models.py               # SQLAlchemy models (Entities, Owners, Ledgers)
│   ├── main.py                 # FastAPI application, routes, WebSocket & Zero-Trust Shield
│   ├── tasks.py                # Celery app & async document analysis pipeline
│   ├── notifier.py             # Job status fan-out (Redis pub/sub or in-process)
│   ├── document_ai.py          # PDF text extraction & Gemini prompts
│   ├── storage.py              # S3 / local document retention & pre-signed URLs
│   ├── setup.py                # Builds the native C++ AML engine (pybind11)
│   ├── aml_engine/
│   │   ├── cpp/cycle_detector.hpp  # C++ cycle detection core (SCC + pruned parallel DFS)
│   │   ├── cpp/bindings.cpp        # pybind11 bridge
│   │   ├── python_engine.py        # Pure-Python fallback (identical semantics)
│   │   ├── scanner.py              # Ledger loading & evidence hydration
│   │   └── benchmark.py            # C++ vs Python benchmark
│   ├── requirements.txt        # Backend dependencies
│   ├── requirements-dev.txt    # Test, lint & build tooling
│   ├── pyproject.toml          # pytest, coverage & ruff configuration
│   ├── tests/                  # pytest suite (WAF, async pipeline, S3, WebSocket, AML engine)
│   ├── Dockerfile              # Docker container configuration
│   └── .env.example            # Backend environment variables template
├── frontend/
│   ├── lib/api.ts              # API/WebSocket base URLs & error helpers
│   ├── app/
│   │   ├── layout.tsx          # Root Next.js layout
│   │   ├── page.tsx            # SentinelFi compliance dashboard & AML visualizer
│   │   └── globals.css         # Global stylesheet & Tailwind CSS imports
│   ├── package.json            # Frontend package scripts & dependencies
│   ├── tsconfig.json           # TypeScript configuration
│   └── next.config.ts          # Next.js configuration
├── docker-compose.yml          # Redis + MinIO + API + Celery worker stack
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
   # Optional: enable the Celery task queue
   # REDIS_URL=redis://localhost:6379/0
   # Optional: archive documents in S3 (otherwise stored in backend/storage/)
   # S3_BUCKET=sentinelfi-kyc-documents
   # AWS_REGION=us-east-1
   # AWS_ACCESS_KEY_ID=...
   # AWS_SECRET_ACCESS_KEY=...
   ```

5. **Start the FastAPI backend server**:
   ```bash
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```
   The API will be live at `http://127.0.0.1:8000` with interactive Swagger docs at `http://127.0.0.1:8000/docs`.

6. **(Recommended) Build the native C++ AML engine**:
   ```bash
   pip install pybind11 setuptools
   python setup.py build_ext --inplace
   ```
   Requires a C++17 compiler (g++/clang on Linux/macOS; [MSVC Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) on Windows, run from the *x64 Native Tools Command Prompt*). Skip it and the pure-Python engine is used automatically; `GET /aml/engine` reports which one is active.

7. **(Optional) Start a Celery worker** — only when `REDIS_URL` is set. Without it, documents are processed in-process by FastAPI `BackgroundTasks`.
   ```bash
   # Linux / macOS
   celery -A tasks worker --loglevel=info
   # Windows (prefork is unsupported)
   celery -A tasks worker --loglevel=info --pool=solo
   ```
   Need a Redis instance? Run `docker run -p 6379:6379 redis:7-alpine`, use [Memurai](https://www.memurai.com/) on Windows, or a free cloud Redis such as [Upstash](https://upstash.com/).

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

3. **(Optional) Point at a non-local API** by creating `frontend/.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=https://your-api.example.com
   ```

4. **Run the Next.js development server**:
   ```bash
   npm run dev
   ```

5. **Access the Dashboard**:
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 API Reference

| Method | Endpoint | Description | Payload / Parameters |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Health Check | None |
| `GET` | `/db-health` | PostgreSQL connectivity probe | None |
| `POST` | `/analyze-document` | Queues a PDF for async KYB risk analysis; returns `202` + `job_id` | `file`: PDF binary, `bank_name`: string |
| `GET` | `/jobs/{job_id}` | Job status & analysis result | `job_id`: path |
| `WS` | `/ws/jobs/{job_id}` | Live push of job status until `completed` / `failed` | `job_id`: path |
| `GET` | `/documents` | Audit archive of retained filings | `limit` (1-100) |
| `GET` | `/documents/{job_id}/url` | Short-lived pre-signed URL for the original PDF | `job_id`: path |
| `GET` | `/documents/{job_id}/file` | Serves a locally archived PDF (local mode only) | `expires`, `signature` |
| `POST` | `/chat-document` | Grounded conversational Q&A on PDF | `query` + either `job_id` (archived document) or `file` |
| `POST` | `/aml/seed-dummy-data` | Seeds a test circular trading loop | None |
| `GET` | `/aml/detect-circular-trading`| Detects round-tripping loops with the graph engine | `max_hops` (2-8), `min_amount`, `chronological`, `window_days`, `max_results` |
| `GET` | `/aml/engine` | Reports the active engine (`cpp` or `python`) | None |

---

## ✅ Automated Tests

The backend ships with a pytest suite of ~95 tests (≈90% line coverage) that runs without any external services: SQLite replaces PostgreSQL, Gemini is stubbed, S3 and KMS are emulated with moto, and the test config blanks out any Redis/S3/database settings from your local `.env` so tests can never touch real infrastructure.

| Suite | What it proves |
| :--- | :--- |
| `test_security_shield.py` | The WAF returns `403` for `DROP TABLE`, `UNION SELECT`, `' OR '1'='1`, `<script>` and encoded variants (in the query *and* the path), blocked requests never reach the database, and security headers are always present |
| `test_documents.py` | Async upload → archive → analysis → persistence; PDF validation; failure handling; signed/expiring links; S3 encryption (SSE-S3 & KMS), checksums and pre-signed URLs; archive-backed Q&A |
| `test_websocket.py` | Live `queued → processing → completed` push and per-job isolation |
| `test_aml_engine.py` | Known-answer graphs for both engines + randomized C++ ⇄ Python parity (multi-threaded, multi-chunk) |
| `test_aml_api.py` | Seeding, loop detection, `max_hops` / `min_amount` / `chronological` / `window_days`, parameter validation |
| `test_schema.py` | Upgrading a legacy database adds new columns without losing data |

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
ruff check .
pytest --cov=.
```

---

## 🔁 CI/CD Pipeline

Every push and pull request runs [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml):

```mermaid
flowchart LR
    Push["git push"] --> Backend["Backend\nruff · build C++ engine · pytest + coverage"]
    Push --> Frontend["Frontend\neslint · tsc · next build"]
    Backend --> Docker["Docker\nbuild image · smoke-test container"]
    Frontend --> Docker
    Docker -->|"main only"| Hub["Push to Docker Hub\n:latest + :commit-sha"]
    Hub --> Deploy["Render deploy hook\n(exact image digest)"]
    Deploy --> Verify["Poll GET / until\nversion == commit sha"]
```

- **Quality gates**: the native C++ engine must compile (`REQUIRE_NATIVE_ENGINE=1`) and every test must pass before an image is built.
- **Container smoke test**: the freshly built image is started and probed: health check, baked-in commit version, native `cpp` engine present, WAF blocking `DROP TABLE`, and an end-to-end AML seed + scan.
- **Immutable deploys**: Render is told to deploy the exact image digest that passed the pipeline; the job then waits until production reports the new commit SHA.
- **Safe by default**: the push and deploy stages skip themselves until credentials are configured, so pull requests and forks still get full test feedback.

### Enabling Docker Hub publishing and Render deployment

1. **Docker Hub**: create an access token (*Account Settings → Personal access tokens*, read & write). In GitHub, go to *Settings → Secrets and variables → Actions* and add:
   - Variable `DOCKERHUB_USERNAME`: your Docker Hub username (a variable, not a secret, so the image name can be passed between jobs)
   - Secret `DOCKERHUB_TOKEN`: the access token
2. **Render**: push once so the image exists, then create a *Web Service → Deploy an existing image* from `docker.io/<username>/sentinelfi-backend:latest`. Add the backend environment variables (`DATABASE_URL`, `GEMINI_API_KEY`, `CORS_ORIGINS`, and optionally `REDIS_URL`, `S3_*`). Render's `$PORT` is respected automatically.
3. Copy the service's **Deploy Hook** URL (*Settings → Deploy Hook*) into a GitHub secret `RENDER_DEPLOY_HOOK_URL`.
4. Optionally add a variable `PRODUCTION_URL` (e.g. `https://sentinelfi-api.onrender.com`) so the pipeline verifies the new version is live.
5. Deploy the frontend to Vercel (or similar) with `NEXT_PUBLIC_API_URL` pointing at the Render URL, and add the frontend's origin to the backend's `CORS_ORIGINS`.

---

## 🧪 Testing the AML Detection Engine

1. In the SentinelFi Dashboard, locate the **AML Graph Surveillance** banner.
2. Click **"Seed Test Loops"** (or make a `POST /aml/seed-dummy-data` request). This seeds two closed shell-company loops:
   $$\text{Alpha Holdings } \xrightarrow{\$500,000} \text{Beta Logistics } \xrightarrow{\$495,000} \text{Gamma Consulting } \xrightarrow{\$490,000} \text{Alpha Holdings}$$
   $$\text{Delta Capital } \xrightarrow{\$1.2M} \text{Epsilon Trading } \xrightarrow{} \text{Zeta Imports } \xrightarrow{} \text{Eta Ventures } \xrightarrow{\$1.15M} \text{Delta Capital}$$
3. Choose **Max hops** (set it to 3 and the 4-hop loop disappears) and optionally **Chronological**, then click **"Run AML Scan"**.
4. The system renders each loop's evidence chain with transfer amounts, retention %, and engine statistics.
5. Benchmark the engines yourself: `python -m aml_engine.benchmark` (from `backend/`).

---

## ☁️ Configuring AWS S3

1. **Create a private bucket** with *Block all public access* enabled, and turn on **Versioning** so an overwritten or deleted filing can always be recovered:
   ```bash
   aws s3api create-bucket --bucket sentinelfi-kyc-documents --region us-east-1
   aws s3api put-public-access-block --bucket sentinelfi-kyc-documents \
     --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
   aws s3api put-bucket-versioning --bucket sentinelfi-kyc-documents --versioning-configuration Status=Enabled
   ```
   For regulated retention (for example, 5-year AML record keeping), create the bucket with **S3 Object Lock** in compliance mode instead.

2. **Grant the API least-privilege access**. It only needs to write and read document objects:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:GetObject"],
       "Resource": "arn:aws:s3:::sentinelfi-kyc-documents/kyc-documents/*"
     }]
   }
   ```
   Add `kms:GenerateDataKey` and `kms:Decrypt` on your key if you set `S3_KMS_KEY_ID`.

3. **Set the variables** in `backend/.env`: `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (or use an IAM role when deployed on AWS).

---

## 🐳 Running with Docker

Run the full stack (API + Celery worker + Redis + MinIO as a local S3) with Docker Compose. PostgreSQL and the Gemini key are read from `backend/.env`; the MinIO console is at `http://localhost:9001`:

```bash
docker compose up --build
```

Or containerize the SentinelFi backend using the included Dockerfile:

```bash
# Build the Docker image
docker build -t sentinelfi-backend ./backend

# Run the container with environment variables (runs as a non-root user; honours $PORT)
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
- **Data Isolation**: CORS policies configured specifically for permitted frontend origins (`CORS_ORIGINS`, default `http://localhost:3000`).
- **Document Confidentiality**: Filings are encrypted at rest in a private bucket and only reachable through pre-signed URLs that expire after 15 minutes; only the PDF route may be framed, and only by the dashboard origin (`frame-ancestors`).

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
