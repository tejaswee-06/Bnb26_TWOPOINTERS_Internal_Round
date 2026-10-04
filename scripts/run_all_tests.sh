#!/usr/bin/env bash
# Runs every automated check in the repository and prints a PASS/FAIL line per suite. Needs: python deps, node deps, playwright+chromium,
# (optional) PostgreSQL 16 binaries for the multi-worker test and redis-server for the failover test — those two are skipped with a notice if absent.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; WORK="$ROOT/.e2e"; mkdir -p "$WORK"; fail=0
run() { local name="$1"; shift; if "$@" >"$WORK/$(echo "$name" | tr ' /' '__').log" 2>&1; then echo "PASS  $name"; else echo "FAIL  $name  (see $WORK/$(echo "$name" | tr ' /' '__').log)"; fail=1; fi; }
run "backend pytest" bash -c "cd '$ROOT/backend' && python -m pytest -q"
if command -v redis-server >/dev/null; then run "backend redis failover" bash -c "cd '$ROOT/backend' && python tests/integration/redis_failover.py"; else echo "SKIP  redis failover (redis-server not installed)"; fi
if ls /usr/lib/postgresql/*/bin/initdb >/dev/null 2>&1; then run "backend postgres multi-worker concurrency" bash -c "cd '$ROOT/backend' && python tests/integration/pg_concurrency.py"; else echo "SKIP  postgres concurrency (PostgreSQL binaries not installed)"; fi
run "frontend typecheck" bash -c "cd '$ROOT/frontend' && npx tsc --noEmit"
# simulation-mode regression (original customer / admin / ML suites on a build WITHOUT live mode)
run "frontend build (simulation)" bash -c "cd '$ROOT/frontend' && NEXT_DIST_DIR=.next-sim npx next build"
( cd "$ROOT/ml_api" && uvicorn main:app --port 8001 >"$WORK/ml.log" 2>&1 & echo $! >"$WORK/ml.pid" )
( cd "$ROOT/frontend" && NEXT_DIST_DIR=.next-sim npx next start -p 3100 >"$WORK/fe-sim.log" 2>&1 & echo $! >"$WORK/fe.pid" ); sleep 6
for t in customer admin ml; do run "e2e simulation: $t" bash -c "cd '$ROOT/frontend' && BASE=http://localhost:3100 SHOTS='$WORK/shots-sim' python3 tests/e2e/$t.py"; done
kill "$(cat "$WORK/ml.pid")" "$(cat "$WORK/fe.pid")" 2>/dev/null; pkill -f "next start -p 3100" 2>/dev/null; pkill -f "uvicorn main:app --port 8001" 2>/dev/null; sleep 1
run "e2e LIVE (frontend -> proxy -> backend -> policy -> allocation, outages)" "$ROOT/scripts/run_live_e2e.sh"
exit $fail
