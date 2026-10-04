#!/usr/bin/env bash
# Builds the frontend in LIVE mode, starts the Next.js server, then runs the live e2e (which itself starts/stops the backend + ML to prove outage behaviour).
# Usage: scripts/run_live_e2e.sh   (needs: python deps for backend/ml_api, node deps, playwright + chromium)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; WORK="${WORK:-$ROOT/.e2e}"; mkdir -p "$WORK"; rm -f "$WORK/fd.db"
export ADMIN_API_KEY=adminkey-e2e INTEGRATION_API_KEY=intkey-e2e HMAC_SECRET=e2e-secret-e2e-secret-e2e-secret-e2e
export FAIRDROP_API_URL=http://127.0.0.1:8000 FAIRDROP_ADMIN_KEY=$ADMIN_API_KEY FAIRDROP_INTEGRATION_KEY=$INTEGRATION_API_KEY
export NEXT_PUBLIC_FAIRDROP_LIVE=1 NEXT_PUBLIC_ML_API_URL=http://127.0.0.1:8001 LIVE_PREQUEUE_SECONDS=${LIVE_PREQUEUE_SECONDS:-120} LIVE_AUTOPILOT=0
export DATABASE_URL="sqlite:///$WORK/fd.db" ML_API_URL=http://127.0.0.1:8001
(cd "$ROOT/backend" && alembic upgrade head >/dev/null)
(cd "$ROOT/frontend" && npx next build >"$WORK/build.log" 2>&1 && tail -3 "$WORK/build.log")
(cd "$ROOT/frontend" && npx next start -p 3000 >"$WORK/frontend.log" 2>&1 &) ; sleep 5
trap 'pkill -f "next start -p 3000" || true' EXIT
export BASE=http://localhost:3000 BACKEND=http://127.0.0.1:8000 ML=http://127.0.0.1:8001 INTEGRATION_KEY=$INTEGRATION_API_KEY SHOTS="$WORK/shots"
export BACKEND_CMD="uvicorn app.main:app --port 8000" BACKEND_CWD="$ROOT/backend" ML_CMD="uvicorn main:app --port 8001" ML_CWD="$ROOT/ml_api"
python3 "$ROOT/frontend/tests/e2e/live.py"
