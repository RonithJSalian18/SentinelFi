# --- Stage 1: compile the native C++ AML graph engine ---
FROM python:3.11-slim AS engine-builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN pip install --no-cache-dir pybind11 setuptools
COPY setup.py .
COPY aml_engine/ aml_engine/
RUN python setup.py build_ext --inplace

# --- Stage 2: lightweight runtime image ---
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Set the working directory
WORKDIR /app

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Drop in the compiled engine (no compiler needed at runtime)
COPY --from=engine-builder /build/aml_engine/_graph_engine*.so aml_engine/

# Run as an unprivileged user; it owns only the local document archive directory
RUN useradd --create-home --uid 10001 sentinel \
    && mkdir -p /app/storage \
    && chown sentinel:sentinel /app/storage
USER sentinel

# Git commit baked in by CI, reported by GET / so deployments can be verified
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

# Expose the port the app runs on (platforms like Render override $PORT)
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/', timeout=4)"

# Command to run the application using Uvicorn (production mode)
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
