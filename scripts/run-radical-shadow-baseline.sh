#!/opt/homebrew/bin/bash
# run-radical-shadow-baseline.sh — Run all 10 baseline briefs with ALL six Radical flags enabled.
#
# Produces shadow-mode evidence for the cutover-decision assessment.
# Each run writes:
#   <out-dir>/<slug>/report.pdf       — primary pipeline PDF
#   <out-dir>/<slug>/radical.pdf      — Radical renderer PDF (if Phase 5 OK)
#   <out-dir>/<slug>/state.json       — radical-phase5-state snapshot (for aggregator)
#   <out-dir>/<slug>/run-manifest.json — timing, sizes, productClass, ok flag
#   <out-dir>/<slug>/log.txt          — full pipeline stdout+stderr
#   <out-dir>/<slug>/.done            — sentinel (always written, even on error)
#
# On any run error: captures error in .done + run-manifest.json, continues.
# The aggregator can run once all .done files exist.
#
# Usage:
#   bash scripts/run-radical-shadow-baseline.sh [--dry-run]
#
# After completion, run:
#   npx tsx src/lib/pdf-engine-v2/eval-harness/shadow-mode-aggregator.ts <out-dir>

set -eo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_CONCURRENT=4
REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
TIMESTAMP="$(date -u +%Y%m%dT%H%M)"
EVIDENCE_ROOT="$HOME/Downloads/engine-evidence/radical-shadow-${TIMESTAMP}"
LABEL="radical-shadow-${TIMESTAMP}"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

# All six Radical flags — these MUST all be set for Phase 5 shadow mode
export RADICAL_PHASE_0_SLICE=true
export RADICAL_PHASE_1_TREE_OUTPUT=true
export RADICAL_PHASE_2_RESOLUTION=true
export RADICAL_PHASE_3_COSTROLLUP=true
export RADICAL_PHASE_4_GRAMMAR=true
export RADICAL_PHASE_5_RENDER=true

# Source distributor API credentials (Mouser, DigiKey, Farnell)
DISTRIBUTOR_ENV="$HOME/.claude/secrets/distributor-apis.env"
if [ -f "$DISTRIBUTOR_ENV" ]; then
  # shellcheck source=/dev/null
  set -a
  source "$DISTRIBUTOR_ENV"
  set +a
  echo "[radical-shadow] Distributor API credentials sourced from $DISTRIBUTOR_ENV"
else
  echo "[radical-shadow] WARNING: distributor-apis.env not found at $DISTRIBUTOR_ENV — distributor lookups will use Grade-D fallback"
fi

mkdir -p "$EVIDENCE_ROOT"

# ---------------------------------------------------------------------------
# Brief definitions (10 baseline product classes)
# ---------------------------------------------------------------------------

BRIEFS=(
  "baseline-10/01-cgm-wearable.md"
  "baseline-10/02-drone-prosumer.md"
  "baseline-10/03-edge-ai-server.md"
  "baseline-10/04-heatpump-30kw.md"
  "baseline-10/05-dc-fast-ev-charger.md"
  "baseline-10/06-pharma-bioreactor.md"
  "baseline-10/07-vertical-farm.md"
  "baseline-10/08-auv-coastal.md"
  "baseline-10/09-bess-container.md"
  "baseline-10/10-haps-stratospheric.md"
)

SLUGS=(
  "rs-cgm"
  "rs-drone"
  "rs-edge-ai"
  "rs-heatpump"
  "rs-ev-charger"
  "rs-bioreactor"
  "rs-farm"
  "rs-auv"
  "rs-bess"
  "rs-haps"
)

BATCH_LOG="$EVIDENCE_ROOT/batch.log"

log() {
  echo "$(date -u +%H:%M:%SZ) $*" | tee -a "$BATCH_LOG"
}

# ---------------------------------------------------------------------------
# Dry-run mode
# ---------------------------------------------------------------------------

if [ "$DRY_RUN" = 1 ]; then
  echo "=== DRY RUN — no processes will be launched ==="
  echo "EVIDENCE_ROOT: $EVIDENCE_ROOT"
  echo "MAX_CONCURRENT: $MAX_CONCURRENT"
  echo ""
  echo "Radical flags enabled:"
  echo "  RADICAL_PHASE_0_SLICE=$RADICAL_PHASE_0_SLICE"
  echo "  RADICAL_PHASE_1_TREE_OUTPUT=$RADICAL_PHASE_1_TREE_OUTPUT"
  echo "  RADICAL_PHASE_2_RESOLUTION=$RADICAL_PHASE_2_RESOLUTION"
  echo "  RADICAL_PHASE_3_COSTROLLUP=$RADICAL_PHASE_3_COSTROLLUP"
  echo "  RADICAL_PHASE_4_GRAMMAR=$RADICAL_PHASE_4_GRAMMAR"
  echo "  RADICAL_PHASE_5_RENDER=$RADICAL_PHASE_5_RENDER"
  echo ""
  echo "Run plan:"
  for i in "${!BRIEFS[@]}"; do
    SLUG="${SLUGS[$i]}"
    echo "  [$((i+1))/10] ${SLUG} — ${BRIEFS[$i]}"
  done
  echo ""
  echo "Distributor env: $DISTRIBUTOR_ENV"
  [ -f "$DISTRIBUTOR_ENV" ] && echo "  (found)" || echo "  (NOT FOUND — Grade-D fallback)"
  exit 0
fi

# ---------------------------------------------------------------------------
# Per-run launcher
# ---------------------------------------------------------------------------

# run_one <slug> <brief-path> <out-dir>
# Runs inline (called inside a subshell backgrounded by the main loop).
run_one() {
  local SLUG="$1"
  local BRIEF_PATH="$2"
  local OUT_DIR="$3"

  mkdir -p "$OUT_DIR"

  local START_EPOCH
  START_EPOCH="$(date +%s)"

  # Output prefix for deterministic primary PDF filename
  local OUTPUT_PREFIX="${LABEL}--${SLUG}"

  # Temporary brief passthrough (avoids shell quoting hell)
  local BRIEF_TMP="$OUT_DIR/.brief-passthrough.txt"
  cp "$BRIEF_PATH" "$BRIEF_TMP"

  # Record start
  echo "[run-one] $SLUG start $(date -u +%H:%M:%SZ)" >> "$BATCH_LOG"

  {
    echo "[run-one] [$SLUG] Brief: $BRIEF_PATH"
    echo "[run-one] [$SLUG] Output prefix: $OUTPUT_PREFIX"
    echo "[run-one] [$SLUG] Radical flags: PHASE_0=$RADICAL_PHASE_0_SLICE PHASE_1=$RADICAL_PHASE_1_TREE_OUTPUT PHASE_2=$RADICAL_PHASE_2_RESOLUTION PHASE_3=$RADICAL_PHASE_3_COSTROLLUP PHASE_4=$RADICAL_PHASE_4_GRAMMAR PHASE_5=$RADICAL_PHASE_5_RENDER"
    echo "[run-one] [$SLUG] Start: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

    local BRIEF_TEXT
    BRIEF_TEXT="$(cat "$BRIEF_TMP")"

    local RUN_OK=true
    local ERROR_REASON=""
    local RUN_OUTPUT=""
    local RADICAL_RENDER_MS=""
    local PRIMARY_RENDER_MS=""
    local LEGACY_COST_BOM_TOTAL=""

    # Time the pipeline run (captures stdout JSON into RUN_OUTPUT)
    set +e
    RUN_OUTPUT=$(
      cd "$REPO_ROOT" &&
      RADICAL_PHASE_0_SLICE="$RADICAL_PHASE_0_SLICE" \
      RADICAL_PHASE_1_TREE_OUTPUT="$RADICAL_PHASE_1_TREE_OUTPUT" \
      RADICAL_PHASE_2_RESOLUTION="$RADICAL_PHASE_2_RESOLUTION" \
      RADICAL_PHASE_3_COSTROLLUP="$RADICAL_PHASE_3_COSTROLLUP" \
      RADICAL_PHASE_4_GRAMMAR="$RADICAL_PHASE_4_GRAMMAR" \
      RADICAL_PHASE_5_RENDER="$RADICAL_PHASE_5_RENDER" \
      npx tsx src/lib/pdf-engine-v2/run.ts --output-prefix "$OUTPUT_PREFIX" --brief "$BRIEF_TEXT" 2>&1
    )
    local EXIT=$?
    set -e

    echo "$RUN_OUTPUT"

    local END_EPOCH
    END_EPOCH="$(date +%s)"
    local TOTAL_DURATION_MS=$(( (END_EPOCH - START_EPOCH) * 1000 ))

    if [ "$EXIT" -ne 0 ]; then
      RUN_OK=false
      ERROR_REASON="exit code $EXIT"
    fi

    # Parse stage timings from JSON output (last valid JSON block in stdout)
    local JSON_BLOCK
    JSON_BLOCK=$(echo "$RUN_OUTPUT" | python3 -c "
import sys, json

# Find the last complete JSON object in the output (the run.ts summary JSON)
lines = sys.stdin.read()
# Try to extract the last {...} block
import re
blocks = re.findall(r'(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})', lines, re.DOTALL)
for block in reversed(blocks):
    try:
        obj = json.loads(block)
        if 'stages' in obj and 'totalDurationMs' in obj:
            print(json.dumps(obj))
            break
    except:
        continue
" 2>/dev/null || echo "")

    local PIPELINE_OK=false
    if [ -n "$JSON_BLOCK" ]; then
      PIPELINE_OK=$(echo "$JSON_BLOCK" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('ok') else 'false')" 2>/dev/null || echo "false")

      # Extract primary render latency (stage 'pdf')
      PRIMARY_RENDER_MS=$(echo "$JSON_BLOCK" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for s in d.get('stages',[]):
    if s.get('name')=='pdf' and s.get('ok'):
        print(s.get('durationMs',0))
        break
" 2>/dev/null || echo "")

      # Extract radical render latency (stage 'pdf_radical_phase5')
      RADICAL_RENDER_MS=$(echo "$JSON_BLOCK" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for s in d.get('stages',[]):
    if s.get('name')=='pdf_radical_phase5' and s.get('ok'):
        print(s.get('durationMs',0))
        break
" 2>/dev/null || echo "")

      # Check if pipeline reported ok=false
      if [ "$PIPELINE_OK" = "false" ] && [ "$RUN_OK" = "true" ]; then
        RUN_OK=false
        ERROR_REASON="pipeline ok=false"
      fi
    else
      if [ "$RUN_OK" = "true" ]; then
        RUN_OK=false
        ERROR_REASON="no valid JSON output"
      fi
    fi

    echo "[run-one] [$SLUG] Pipeline ok=$RUN_OK exit=$EXIT duration=${TOTAL_DURATION_MS}ms"

    # ── Extract legacy cost from Phase3/shadow-diff log line ──────────────
    # The pipeline logs: [Phase3/shadow-diff] Legacy (Stage 4):  £<N>
    # We parse this to get the legacy bomTotal for the cost delta metric.
    LEGACY_COST_BOM_TOTAL=$(echo "$RUN_OUTPUT" | python3 -c "
import sys, re
text = sys.stdin.read()
# Match: [Phase3/shadow-diff] Legacy (Stage 4):  £<number>
m = re.search(r'\[Phase3/shadow-diff\] Legacy \(Stage 4\):\s+£([\d,]+)', text)
if m:
    val = int(m.group(1).replace(',', ''))
    print(val)
else:
    print('')
" 2>/dev/null || echo "")

    if [ -n "$LEGACY_COST_BOM_TOTAL" ]; then
      echo "[run-one] [$SLUG] Legacy cost (Stage 4): £${LEGACY_COST_BOM_TOTAL}"
    else
      echo "[run-one] [$SLUG] Legacy cost not found in pipeline output (Phase 3 may be disabled or diff not logged)"
    fi

    # ── Move primary PDF ────────────────────────────────────────────────────
    local PDF_SRC="$REPO_ROOT/output-${OUTPUT_PREFIX}.pdf"
    local PRIMARY_PDF_SIZE=0
    if [ -f "$PDF_SRC" ]; then
      mv "$PDF_SRC" "$OUT_DIR/report.pdf"
      PRIMARY_PDF_SIZE=$(stat -f%z "$OUT_DIR/report.pdf" 2>/dev/null || stat -c%s "$OUT_DIR/report.pdf" 2>/dev/null || echo 0)
      echo "[run-one] [$SLUG] Primary PDF → $OUT_DIR/report.pdf (${PRIMARY_PDF_SIZE}B)"
    else
      echo "[run-one] [$SLUG] WARNING: primary PDF not found at $PDF_SRC"
      if [ "$RUN_OK" = "true" ]; then
        RUN_OK=false
        ERROR_REASON="primary PDF missing"
      fi
    fi

    # ── Find and move Radical state snapshot ───────────────────────────────
    # The pipeline writes radical-phase5-state-<projectId>.json to the repo root.
    # We find the newest one written since this run started.
    local STATE_SRC=""
    STATE_SRC=$(ls -t "$REPO_ROOT"/radical-phase5-state-*.json 2>/dev/null | head -1)
    local RADICAL_PDF_SIZE=0

    if [ -n "$STATE_SRC" ] && [ -f "$STATE_SRC" ]; then
      # Only take it if it's newer than our run start
      local STATE_MTIME
      STATE_MTIME=$(python3 -c "import os; print(int(os.path.getmtime('$STATE_SRC')))" 2>/dev/null || echo 0)
      if [ "$STATE_MTIME" -ge "$START_EPOCH" ]; then
        cp "$STATE_SRC" "$OUT_DIR/state.json"
        echo "[run-one] [$SLUG] State snapshot → $OUT_DIR/state.json"

        # Extract product class + legacy cost from state
        LEGACY_COST_BOM_TOTAL=$(python3 -c "
import json, sys
try:
    d = json.load(open('$OUT_DIR/state.json'))
    rc = d.get('radicalCostSummary')
    # The legacy bomTotal isn't in the state snapshot directly — it's in state.costSummary
    # which isn't serialised. We fall back to None.
    print('')
except:
    print('')
" 2>/dev/null || echo "")
      else
        echo "[run-one] [$SLUG] State snapshot at $STATE_SRC predates this run (stale) — skipping"
      fi
    else
      echo "[run-one] [$SLUG] No state snapshot found (Phase 5 may have been skipped or failed)"
    fi

    # ── Find and move Radical PDF ──────────────────────────────────────────
    # The pipeline writes radical-phase5-<projectId>.pdf to the repo root.
    local RADICAL_PDF_SRC=""
    RADICAL_PDF_SRC=$(ls -t "$REPO_ROOT"/radical-phase5-*.pdf 2>/dev/null | grep -v "state" | head -1)

    if [ -n "$RADICAL_PDF_SRC" ] && [ -f "$RADICAL_PDF_SRC" ]; then
      local RADICAL_MTIME
      RADICAL_MTIME=$(python3 -c "import os; print(int(os.path.getmtime('$RADICAL_PDF_SRC')))" 2>/dev/null || echo 0)
      if [ "$RADICAL_MTIME" -ge "$START_EPOCH" ]; then
        mv "$RADICAL_PDF_SRC" "$OUT_DIR/radical.pdf"
        RADICAL_PDF_SIZE=$(stat -f%z "$OUT_DIR/radical.pdf" 2>/dev/null || stat -c%s "$OUT_DIR/radical.pdf" 2>/dev/null || echo 0)
        echo "[run-one] [$SLUG] Radical PDF → $OUT_DIR/radical.pdf (${RADICAL_PDF_SIZE}B)"
      else
        echo "[run-one] [$SLUG] Radical PDF at $RADICAL_PDF_SRC predates this run (stale) — skipping"
      fi
    else
      echo "[run-one] [$SLUG] No radical PDF found"
    fi

    # Extract productClass from state.json if available
    local PRODUCT_CLASS="unknown"
    if [ -f "$OUT_DIR/state.json" ]; then
      PRODUCT_CLASS=$(python3 -c "
import json
try:
    d = json.load(open('$OUT_DIR/state.json'))
    tree = d.get('resolvedRadicalTree', {})
    meta = tree.get('resolution_meta', {})
    print(meta.get('product_class', 'unknown'))
except:
    print('unknown')
" 2>/dev/null || echo "unknown")
    fi

    # ── Write run manifest ─────────────────────────────────────────────────
    local MANIFEST_OK_BOOL
    MANIFEST_OK_BOOL=$( [ "$RUN_OK" = "true" ] && echo "true" || echo "false" )
    local PRIM_MS_JSON
    PRIM_MS_JSON=$( [ -n "$PRIMARY_RENDER_MS" ] && echo "$PRIMARY_RENDER_MS" || echo "null" )
    local RAD_MS_JSON
    RAD_MS_JSON=$( [ -n "$RADICAL_RENDER_MS" ] && echo "$RADICAL_RENDER_MS" || echo "null" )
    local ERROR_JSON
    ERROR_JSON=$( [ -n "$ERROR_REASON" ] && printf '"%s"' "$ERROR_REASON" || echo "null" )
    local LEGACY_COST_JSON
    LEGACY_COST_JSON=$( [ -n "$LEGACY_COST_BOM_TOTAL" ] && echo "$LEGACY_COST_BOM_TOTAL" || echo "null" )
    local SAVED_AT
    SAVED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    printf '{
  "slug": "%s",
  "brief": "%s",
  "productClass": "%s",
  "ok": %s,
  "errorReason": %s,
  "totalDurationMs": %s,
  "pdfSizeBytes": %s,
  "radicalPdfSizeBytes": %s,
  "primaryRenderMs": %s,
  "radicalRenderMs": %s,
  "legacyCostBomTotal": %s,
  "savedAt": "%s"
}\n' \
      "$SLUG" "$BRIEF_PATH" "$PRODUCT_CLASS" "$MANIFEST_OK_BOOL" "$ERROR_JSON" \
      "$TOTAL_DURATION_MS" "$PRIMARY_PDF_SIZE" "$RADICAL_PDF_SIZE" \
      "$PRIM_MS_JSON" "$RAD_MS_JSON" "$LEGACY_COST_JSON" "$SAVED_AT" \
      > "$OUT_DIR/run-manifest.json" || \
      printf '{"slug":"%s","ok":false,"errorReason":"manifest write failed"}\n' "$SLUG" > "$OUT_DIR/run-manifest.json"

    # ── Always touch .done (even on error — the aggregator reads the manifest) ─
    touch "$OUT_DIR/.done"
    echo "[run-one] [$SLUG] .done written"

  } > "$OUT_DIR/log.txt" 2>&1

  # Log to batch log (outside the subshell output redirect)
  local RUN_STATUS
  RUN_STATUS=$(python3 -c "import json; m=json.load(open('$OUT_DIR/run-manifest.json')); print('OK' if m['ok'] else 'FAIL')" 2>/dev/null || echo "UNKNOWN")
  echo "[radical-shadow] $(date -u +%H:%M:%SZ) $SLUG finished — $RUN_STATUS" >> "$BATCH_LOG"
}

# ---------------------------------------------------------------------------
# Main parallel loop
# ---------------------------------------------------------------------------

log "radical-shadow-baseline: starting ${#BRIEFS[@]} runs (max $MAX_CONCURRENT concurrent)"
log "Evidence root: $EVIDENCE_ROOT"
log "Radical flags: PHASE_0=$RADICAL_PHASE_0_SLICE PHASE_1=$RADICAL_PHASE_1_TREE_OUTPUT PHASE_2=$RADICAL_PHASE_2_RESOLUTION PHASE_3=$RADICAL_PHASE_3_COSTROLLUP PHASE_4=$RADICAL_PHASE_4_GRAMMAR PHASE_5=$RADICAL_PHASE_5_RENDER"

IN_FLIGHT=0

wait_for_slot() {
  if [ "$IN_FLIGHT" -lt "$MAX_CONCURRENT" ]; then
    return
  fi
  wait -n 2>/dev/null || true
  IN_FLIGHT=$((IN_FLIGHT - 1))
}

for i in "${!BRIEFS[@]}"; do
  BRIEF_REL="src/lib/pdf-engine-v2/briefs/${BRIEFS[$i]}"
  BRIEF_PATH="$REPO_ROOT/$BRIEF_REL"
  SLUG="${SLUGS[$i]}"
  OUT_DIR="$EVIDENCE_ROOT/$SLUG"

  if [ ! -f "$BRIEF_PATH" ]; then
    log "[$((i+1))/${#BRIEFS[@]}] $SLUG — ERROR: brief not found at $BRIEF_PATH"
    mkdir -p "$OUT_DIR"
    echo '{"slug":"'"$SLUG"'","ok":false,"errorReason":"brief file not found","productClass":"unknown","totalDurationMs":0}' > "$OUT_DIR/run-manifest.json"
    touch "$OUT_DIR/.done"
    continue
  fi

  if [ -f "$OUT_DIR/.done" ]; then
    log "[$((i+1))/${#BRIEFS[@]}] $SLUG — already done, skipping"
    continue
  fi

  wait_for_slot

  log "[$((i+1))/${#BRIEFS[@]}] Launching $SLUG (in-flight will be $((IN_FLIGHT+1))/$MAX_CONCURRENT)..."

  (
    run_one "$SLUG" "$BRIEF_PATH" "$OUT_DIR"
  ) &

  IN_FLIGHT=$((IN_FLIGHT + 1))
done

log "All runs launched — waiting for ${IN_FLIGHT} in-flight runs to complete..."
wait
log "$(date -u +%Y-%m-%dT%H:%M:%SZ) All ${#BRIEFS[@]} runs complete"

# ---------------------------------------------------------------------------
# Final summary
# ---------------------------------------------------------------------------

DONE_COUNT=$(find "$EVIDENCE_ROOT" -maxdepth 2 -name .done 2>/dev/null | wc -l | tr -d ' ')
OK_COUNT=$(find "$EVIDENCE_ROOT" -maxdepth 2 -name run-manifest.json -exec python3 -c "
import json, sys
try:
    m = json.load(open(sys.argv[1]))
    print('ok' if m.get('ok') else 'fail')
except:
    print('unknown')
" {} \; 2>/dev/null | grep -c ok || echo 0)
FAIL_COUNT=$(find "$EVIDENCE_ROOT" -maxdepth 2 -name run-manifest.json -exec python3 -c "
import json, sys
try:
    m = json.load(open(sys.argv[1]))
    print('fail' if not m.get('ok') else 'ok')
except:
    print('unknown')
" {} \; 2>/dev/null | grep -c fail || echo 0)

log "Summary: $DONE_COUNT done, $OK_COUNT succeeded, $FAIL_COUNT failed"
log ""
log "To aggregate results, run:"
log "  npx tsx \"$REPO_ROOT/src/lib/pdf-engine-v2/eval-harness/shadow-mode-aggregator.ts\" \"$EVIDENCE_ROOT\""
log ""
log "Evidence root: $EVIDENCE_ROOT"

echo ""
echo "==================================================================="
echo "radical-shadow-baseline complete"
echo "  Done:    $DONE_COUNT / ${#BRIEFS[@]}"
echo "  Success: $OK_COUNT"
echo "  Failed:  $FAIL_COUNT"
echo ""
echo "Run aggregator:"
echo "  npx tsx \"$REPO_ROOT/src/lib/pdf-engine-v2/eval-harness/shadow-mode-aggregator.ts\" \\"
echo "    \"$EVIDENCE_ROOT\""
echo "==================================================================="
