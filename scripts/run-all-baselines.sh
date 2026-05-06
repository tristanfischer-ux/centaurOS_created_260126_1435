#!/usr/bin/env bash
#
# run-all-baselines.sh — run baseline-0 for bess, heatpump, farm sequentially,
# each detached so that bash-tool timeouts don't kill them. Writes a status
# file after each completes so we can tell progress.
#
# Usage:
#   nohup bash scripts/run-all-baselines.sh >> /tmp/baselines.log 2>&1 &
#   disown
#
# Then poll ~/Downloads/engine-evidence/baseline-3/STATUS.txt

set -uo pipefail

REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
cd "$REPO_ROOT"

STATUS_FILE="$HOME/Downloads/engine-evidence/baseline-3/STATUS.txt"
mkdir -p "$(dirname "$STATUS_FILE")"

echo "=== baselines started at $(date -u +%FT%TZ) ===" > "$STATUS_FILE"

run_one() {
  local label="$1"
  local brief="$2"
  echo "--- $(date -u +%FT%TZ) starting $label" >> "$STATUS_FILE"
  "$REPO_ROOT/scripts/engine-evidence-bg.sh" "$label" "$brief"
  # Wait for .done marker, timeout at 30 min
  local done_file="$HOME/Downloads/engine-evidence/$label/.done"
  local waited=0
  while [ ! -f "$done_file" ] && [ $waited -lt 1800 ]; do
    sleep 15
    waited=$((waited + 15))
  done
  if [ -f "$done_file" ]; then
    local pdf="$HOME/Downloads/engine-evidence/$label/report.pdf"
    local size=0
    [ -f "$pdf" ] && size=$(stat -f%z "$pdf" 2>/dev/null || stat -c%s "$pdf")
    echo "--- $(date -u +%FT%TZ) DONE $label (pdf=$size bytes)" >> "$STATUS_FILE"
  else
    echo "--- $(date -u +%FT%TZ) TIMEOUT $label (after ${waited}s)" >> "$STATUS_FILE"
  fi
}

run_one "baseline-3/bess"     "src/lib/pdf-engine-v2/briefs/bess.md"
run_one "baseline-3/heatpump" "src/lib/pdf-engine-v2/briefs/heatpump.md"
run_one "baseline-3/farm"     "src/lib/pdf-engine-v2/briefs/farm.md"

echo "=== baselines finished at $(date -u +%FT%TZ) ===" >> "$STATUS_FILE"
