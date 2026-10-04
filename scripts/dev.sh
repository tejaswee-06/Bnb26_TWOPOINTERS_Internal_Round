#!/usr/bin/env bash
# Starts the whole stack locally in LIVE mode: backend :8000 (SQLite + in-memory queue fallback unless REDIS_URL works), ML :8001, Next.js :3000.
# Ctrl-C stops everything. Requires: pip install -r backend/requirements.txt -r ml_api/requirements.txt ; (cd frontend && npm ci)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ADMIN_API_KEY=${ADMIN_API_KEY:-dev-admin-key} INTEGRATION_API_KEY=${INTEGRATION_API_KEY:-dev-integration-key} HMAC_SECRET=${HMAC_SECRET:-dev-hmac-secret-change-me-dev-hmac-secret}
export DATABASE_URL=${DATABASE_URL:-sqlite:///$ROOT/backend/fair_drop.db} ML_API_URL=${ML_API_URL:-http://127.0.0.1:8001}
export FAIRDROP_API_URL=http://127.0.0.1:8000 FAIRDROP_ADMIN_KEY=$ADMIN_API_KEY FAIRDROP_INTEGRATION_KEY=$INTEGRATION_API_KEY
export NEXT_PUBLIC_FAIRDROP_LIVE=${NEXT_PUBLIC_FAIRDROP_LIVE:-1} NEXT_PUBLIC_ML_API_URL=http://127.0.0.1:8001
pids=(); trap 'kill "${pids[@]}" 2>/dev/null || true' EXIT INT TERM
(cd "$ROOT/backend" && alembic upgrade head && exec uvicorn app.main:app --port 8000) & pids+=($!)
(cd "$ROOT/ml_api" && exec uvicorn main:app --port 8001) & pids+=($!)
(cd "$ROOT/frontend" && npx next build && exec npx next start -p 3000) & pids+=($!)
echo "Customer: http://localhost:3000   Admin: http://localhost:3000/admin (admin@fairdrop.demo / FairDrop@2026)   API docs: http://localhost:8000/docs"
wait
