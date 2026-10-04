# Build context = repository root:  docker build -f ml_api/Dockerfile .
FROM python:3.12-slim
WORKDIR /srv/ml_api
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY ml_api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ml_api/main.py .
COPY fairdrop_ml_output.json /srv/fairdrop_ml_output.json
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
