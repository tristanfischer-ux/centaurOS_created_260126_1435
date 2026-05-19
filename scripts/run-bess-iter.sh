#!/opt/homebrew/bin/bash
# run-bess-iter.sh — One iteration of the BESS pipeline for the ≥8/10 loop.
#
# Usage: bash scripts/run-bess-iter.sh <iter-number>
# Output:
#   ~/Downloads/bess-iter/iter-NN/bess-container/radical.pdf
#   ~/Downloads/bess-iter/iter-NN/bess-container/state.json
#   ~/Downloads/bess-iter/iter-NN/bess-container/log.txt
#   ~/Downloads/bess-iter/iter-NN/bess-container/.done       (sentinel)
#
# The scorer expects this exact <batch-dir>/<slug>/radical.pdf shape.

set -eo pipefail

ITER="${1:?Usage: run-bess-iter.sh <iter-number>}"
REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
OUT_DIR="$HOME/Downloads/bess-iter/iter-${ITER}/bess-container"
BRIEF="$REPO_ROOT/src/lib/pdf-engine-v2/briefs/baseline-10/09-bess-container.md"
LOG_FILE="$OUT_DIR/log.txt"

mkdir -p "$OUT_DIR"

export RADICAL_PHASE_0_SLICE=true
export RADICAL_PHASE_1_TREE_OUTPUT=true
export RADICAL_PHASE_2_RESOLUTION=true
export RADICAL_PHASE_3_COSTROLLUP=true
export RADICAL_PHASE_4_GRAMMAR=true
export RADICAL_PHASE_5_RENDER=true
# REQUIRED for worked-example pipeline (Stage 1.7 module decomp + Piece 1E/1F/1G LLM prose).
# Without this flag, the orchestrator falls through to the older Phase 1 single-shot path
# and Stage 1.7 + naturalLanguageLayer + briefOverviewProse never fire. Confirmed 2026-05-13.
export RADICAL_PHASE_3_PER_MODULE=true
export PA_PIPELINE=true
# WS-A Option A (commit c0615358): enable 6-emitter + 2-judge Stage 1.7 ensemble
export RADICAL_MULTI_EMITTER=true
# WS-B (commit f94af1b1): drive BoM from Tier 4 emission, bypass character-hierarchy WORDS[] filter
export RADICAL_TIER4_TREE=true

DISTRIBUTOR_ENV="$HOME/.claude/secrets/distributor-apis.env"
if [ -f "$DISTRIBUTOR_ENV" ]; then
  set -a; source "$DISTRIBUTOR_ENV"; set +a
fi

BRIEF_TEXT="$(cat "$BRIEF")"
START=$(date +%s)

echo "[iter-$ITER] starting BESS pipeline at $(date -u +%H:%M:%SZ)" | tee "$LOG_FILE"

cd "$REPO_ROOT"
set +e
npx tsx src/lib/pdf-engine-v2/run.ts \
  --output-prefix "bess-iter-${ITER}" \
  --brief "$BRIEF_TEXT" 2>&1 | tee -a "$LOG_FILE"
EXIT=${PIPESTATUS[0]}
set -e

END=$(date +%s)
DURATION_S=$((END - START))
echo "[iter-$ITER] pipeline exit=$EXIT duration=${DURATION_S}s" | tee -a "$LOG_FILE"

# Collect outputs that the pipeline writes to the repo root.
STATE_SRC=$(ls -t "$REPO_ROOT"/radical-phase5-state-*.json 2>/dev/null | head -1 || true)
PDF_SRC=$(ls -t "$REPO_ROOT"/radical-phase5-*.pdf 2>/dev/null | grep -v "state" | head -1 || true)

if [ -n "$STATE_SRC" ] && [ -f "$STATE_SRC" ]; then
  cp "$STATE_SRC" "$OUT_DIR/state.json"
  echo "[iter-$ITER] state.json copied ($(wc -c < "$OUT_DIR/state.json") bytes)" | tee -a "$LOG_FILE"
fi
if [ -n "$PDF_SRC" ] && [ -f "$PDF_SRC" ]; then
  cp "$PDF_SRC" "$OUT_DIR/radical.pdf"
  echo "[iter-$ITER] radical.pdf copied ($(wc -c < "$OUT_DIR/radical.pdf") bytes)" | tee -a "$LOG_FILE"
fi

if [ "$EXIT" -eq 0 ] && [ -f "$OUT_DIR/radical.pdf" ]; then
  echo "ok" > "$OUT_DIR/.done"
else
  echo "fail exit=$EXIT" > "$OUT_DIR/.done"
fi

echo "[iter-$ITER] complete. Outputs in $OUT_DIR"
