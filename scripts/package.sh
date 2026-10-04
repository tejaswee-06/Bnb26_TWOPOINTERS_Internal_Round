#!/usr/bin/env bash
# Usage: scripts/package.sh <zip-name-without-ext>   -> $OUT_DIR/<name>.zip (default /mnt/user-data/outputs if present). Source only: no node_modules/.next/*.db/caches/.env.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; NAME="${1:?zip name}"; DIR="${OUT_DIR:-$([ -d /mnt/user-data/outputs ] && echo /mnt/user-data/outputs || echo "$ROOT/../outputs")}"; mkdir -p "$DIR"; OUT="$DIR/$NAME.zip"; rm -f "$OUT"
cd "$ROOT/.." && zip -qr "$OUT" "$(basename "$ROOT")" -x "*/node_modules/*" "*/.next/*" "*/.next-sim/*" "*/.e2e/*" "*/__pycache__/*" "*.pyc" "*.db" "*/.env" "*/.venv/*" "*/tsconfig.tsbuildinfo" "*/.pytest_cache/*" "*/shots/*"
echo "$OUT"; unzip -l "$OUT" | tail -1
