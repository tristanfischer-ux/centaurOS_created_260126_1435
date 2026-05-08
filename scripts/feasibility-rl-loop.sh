#!/usr/bin/env bash
# feasibility-rl-loop.sh — Fast RL loop for Feasibility section
# Starts with 3 projects, expands to 10 once 8/10+ achieved.
# Usage: ./scripts/feasibility-rl-loop.sh

set -eo pipefail
REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
EVIDENCE_ROOT="$HOME/Downloads/engine-evidence/feas-rl"

# Start with 3 diverse projects
BRIEFS=(
  "baseline-10/02-drone-prosumer.md"
  "baseline-10/08-auv-coastal.md"
  "baseline-10/09-bess-container.md"
)
SLUGS=("drone" "auv" "bess")

mkdir -p "$EVIDENCE_ROOT"
echo "=== Feasibility RL Loop (3 projects) ==="
echo "Pipeline: Research → Brief → Feasibility (iterate)"
echo "Starting at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

PIDS=()
for i in "${!BRIEFS[@]}"; do
  SLUG="${SLUGS[$i]}"
  BRIEF="src/lib/pdf-engine-v2/briefs/${BRIEFS[$i]}"
  OUT_DIR="$EVIDENCE_ROOT/$SLUG"
  mkdir -p "$OUT_DIR"
  
  echo "[$SLUG] Starting..."
  ( cd "$REPO_ROOT" && {
    npx tsx src/lib/pdf-engine-v2/feasibility-rl-iterate.ts \
      --brief "$(cat "$REPO_ROOT/$BRIEF")" \
      --output "$OUT_DIR" \
      --max-iter 5 \
      2>&1 | tee "$OUT_DIR/rl-log.txt"
  } ) &
  PIDS+=($!)
done

for pid in "${PIDS[@]}"; do
  wait "$pid" 2>/dev/null || true
done

echo ""
echo "=== Results ==="
PASS=0
FAIL=0
for SLUG in "${SLUGS[@]}"; do
  HISTORY="$EVIDENCE_ROOT/$SLUG/history.json"
  if [ -f "$HISTORY" ]; then
    FINAL=$(python3 -c "import json; h=json.load(open('$HISTORY')); print(h[-1]['overall'])" 2>/dev/null || echo "?")
    ITERS=$(python3 -c "import json; h=json.load(open('$HISTORY')); print(len(h))" 2>/dev/null || echo "?")
    echo "  $SLUG: $FINAL/10 ($ITERS iterations)"
    if [ "$FINAL" -ge 8 ] 2>/dev/null; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
  else
    echo "  $SLUG: FAILED"
    FAIL=$((FAIL+1))
  fi
done
echo ""
echo "Pass: $PASS/3, Fail: $FAIL/3"
echo "Duration: $SECONDS seconds"
