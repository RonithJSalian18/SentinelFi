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

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application using Uvicorn (production mode)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
