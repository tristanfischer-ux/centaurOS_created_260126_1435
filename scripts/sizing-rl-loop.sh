#!/usr/bin/env bash
# sizing-rl-loop.sh — Size & Layout RL loop
# Starts with BESS (passed feasibility 10/10, decomposition 8/10)
# Usage: ./scripts/sizing-rl-loop.sh [round_number]

set -eo pipefail
REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
EVIDENCE_ROOT="$HOME/Downloads/engine-evidence/sizing-rl"
ROUND=${1:-1}

BRIEFS=("baseline-10/09-bess-container.md")
SLUGS=("bess")

mkdir -p "$EVIDENCE_ROOT"
echo "=== Size & Layout RL Round $ROUND ==="
echo "Projects: ${SLUGS[*]} (passed feasibility 10/10, decomposition 8/10)"
echo "Starting at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

PIDS=()
for i in "${!BRIEFS[@]}"; do
  SLUG="${SLUGS[$i]}"
  BRIEF="src/lib/pdf-engine-v2/briefs/${BRIEFS[$i]}"
  OUT_DIR="$EVIDENCE_ROOT/${SLUG}-r${ROUND}"
  mkdir -p "$OUT_DIR"
  
  echo "[$SLUG] Starting..."
  ( cd "$REPO_ROOT" && {
    npx tsx src/lib/pdf-engine-v2/sizing-rl-iterate.ts \
      --brief "$(cat "$REPO_ROOT/$BRIEF")" \
      --output "$OUT_DIR" \
      --max-iter 3 \
      2>&1 | tee "$OUT_DIR/rl-log.txt"
  } ) &
  PIDS+=($!)
done

for pid in "${PIDS[@]}"; do
  wait "$pid"
done

echo ""
echo "=== Results ==="
for SLUG in "${SLUGS[@]}"; do
  HISTORY="$EVIDENCE_ROOT/${SLUG}-r${ROUND}/history.json"
  if [ -f "$HISTORY" ]; then
    FINAL=$(python3 -c "import json; h=json.load(open('$HISTORY')); print(h[-1]['overall'])" 2>/dev/null || echo "?")
    echo "  $SLUG: $FINAL/10"
  else
    echo "  $SLUG: FAILED"
  fi
done
echo "Duration: $SECONDS seconds"
