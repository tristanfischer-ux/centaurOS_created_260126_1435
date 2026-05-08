#!/usr/bin/env bash
# brief-rl-loop.sh — Fast RL loop for Brief section quality
# Runs research once, then iterates: generate → score → revise → score
# Usage: ./scripts/brief-rl-loop.sh [iteration_number]
# Output: ~/Downloads/engine-evidence/brief-rl/<project>/

set -eo pipefail

REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
EVIDENCE_ROOT="$HOME/Downloads/engine-evidence/brief-rl"

BRIEFS=(
  "baseline-10/02-drone-prosumer.md"
  "baseline-10/08-auv-coastal.md"
  "baseline-10/09-bess-container.md"
)
SLUGS=("drone" "auv" "bess")

mkdir -p "$EVIDENCE_ROOT"

echo "=== Brief RL Loop ==="
echo "Starting at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Projects: ${SLUGS[*]}"
echo ""

# Run all 3 projects in parallel (each does research once + 5 iterations)
PIDS=()
for i in "${!BRIEFS[@]}"; do
  SLUG="${SLUGS[$i]}"
  BRIEF="src/lib/pdf-engine-v2/briefs/${BRIEFS[$i]}"
  OUT_DIR="$EVIDENCE_ROOT/$SLUG"
  mkdir -p "$OUT_DIR"
  
  echo "[$SLUG] Starting RL loop (5 iterations max)..."
  ( cd "$REPO_ROOT" && {
    npx tsx src/lib/pdf-engine-v2/brief-rl-iterate.ts \
      --brief "$(cat "$REPO_ROOT/$BRIEF")" \
      --output "$OUT_DIR" \
      --max-iter 5 \
      2>&1 | tee "$OUT_DIR/rl-log.txt"
  } ) &
  PIDS+=($!)
done

# Wait for all 3
for pid in "${PIDS[@]}"; do
  wait "$pid" 2>/dev/null || true
done

echo ""
echo "=== All projects complete ==="
echo ""

# Summary
for SLUG in "${SLUGS[@]}"; do
  HISTORY="$EVIDENCE_ROOT/$SLUG/history.json"
  if [ -f "$HISTORY" ]; then
    FINAL=$(python3 -c "import json; h=json.load(open('$HISTORY')); print(h[-1]['score'])" 2>/dev/null || echo "?")
    BEST=$(python3 -c "import json; h=json.load(open('$HISTORY')); print(max(x['score'] for x in h))" 2>/dev/null || echo "?")
    ITERS=$(python3 -c "import json; h=json.load(open('$HISTORY')); print(len(h))" 2>/dev/null || echo "?")
    echo "  $SLUG: final=$FINAL/10, best=$BEST/10, iterations=$ITERS"
  else
    echo "  $SLUG: no results"
  fi
done

echo ""
echo "Duration: $SECONDS seconds"
echo "Results in: $EVIDENCE_ROOT/<project>/"
