#!/usr/bin/env bash
# feasibility-full-rl-loop.sh — Full-flow RL: raw text → Research → Brief → Feasibility → revision → Feasibility
# Starts with failed projects (farm, AUV), expands to 10 once 8/10+ achieved.
# Usage: ./scripts/feasibility-full-rl-loop.sh [round_number]

set -eo pipefail
REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
EVIDENCE_ROOT="$HOME/Downloads/engine-evidence/feas-full-rl"
ROUND=${1:-1}

# Start with the 2 projects that failed feasibility
BRIEFS=("baseline-10/07-vertical-farm.md" "baseline-10/08-auv-coastal.md")
SLUGS=("farm" "auv")

mkdir -p "$EVIDENCE_ROOT"
echo "=== Feasibility Full-Flow RL Round $ROUND ==="
echo "Pipeline: Research → Brief → Feasibility → (revision loop) → score"
echo "Projects: ${SLUGS[*]}"
echo "Starting at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

PIDS=()
for i in "${!BRIEFS[@]}"; do
  SLUG="${SLUGS[$i]}"
  BRIEF="src/lib/pdf-engine-v2/briefs/${BRIEFS[$i]}"
  OUT_DIR="$EVIDENCE_ROOT/${SLUG}-r${ROUND}"
  mkdir -p "$OUT_DIR"
  
  echo "[$SLUG] Starting..."
  ( cd "$REPO_ROOT" && {
    npx tsx src/lib/pdf-engine-v2/feasibility-full-rl.ts \
      --brief "$(cat "$REPO_ROOT/$BRIEF")" \
      --output "$OUT_DIR" \
      --max-iter 3 \
      2>&1 | tee "$OUT_DIR/rl-log.txt"
  } ) &
  PIDS+=($!)
done

for pid in "${PIDS[@]}"; do
  wait "$pid" 2>/dev/null || true
done

echo ""
echo "=== Results ==="
for SLUG in "${SLUGS[@]}"; do
  HISTORY="$EVIDENCE_ROOT/${SLUG}-r${ROUND}/history.json"
  if [ -f "$HISTORY" ]; then
    FINAL=$(python3 -c "import json; h=json.load(open('$HISTORY')); print(h[-1]['overall'])" 2>/dev/null || echo "?")
    ITERS=$(python3 -c "import json; h=json.load(open('$HISTORY')); print(len(h))" 2>/dev/null || echo "?")
    REVS=$(python3 -c "import json; h=json.load(open('$HISTORY')); print(sum(x.get('revisionCount',0) for x in h))" 2>/dev/null || echo "?")
    echo "  $SLUG: $FINAL/10 ($ITERS iterations, $REVS revisions)"
  else
    echo "  $SLUG: FAILED"
  fi
done
echo "Duration: $SECONDS seconds"
