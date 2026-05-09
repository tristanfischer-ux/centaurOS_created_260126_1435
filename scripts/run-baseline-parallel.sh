#!/opt/homebrew/bin/bash
# Run 10 baseline evidence runs in parallel (max 4 concurrent).
# Output: ~/Downloads/engine-evidence/post-5470c9ae/<slug>/{report.pdf,log.txt,.done}
# Skips runs where .done already exists — safe to re-run.
#
# Add --dry-run as first arg to print the plan without executing anything.

set -eo pipefail

MAX_CONCURRENT=4
REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
EVIDENCE_ROOT="$HOME/Downloads/engine-evidence/pa-baseline-71c6133c"
LABEL="pa-baseline-71c6133c"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

mkdir -p "$EVIDENCE_ROOT"

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
  "r1-cgm" "r1-drone" "r1-edge-ai" "r1-heatpump" "r1-ev-charger"
  "r1-bioreactor" "r1-farm" "r1-auv" "r1-bess" "r1-haps"
)

BATCH_LOG="$EVIDENCE_ROOT/batch.log"

log() {
  echo "$(date -u +%H:%M:%SZ) $*" | tee -a "$BATCH_LOG"
}

if [ "$DRY_RUN" = 1 ]; then
  echo "=== DRY RUN — no processes will be launched ==="
  echo "EVIDENCE_ROOT: $EVIDENCE_ROOT"
  echo "MAX_CONCURRENT: $MAX_CONCURRENT"
  echo ""
  echo "Run plan:"
  for i in "${!BRIEFS[@]}"; do
    SLUG="${SLUGS[$i]}"
    OUT_DIR="$EVIDENCE_ROOT/$SLUG"
    if [ -f "$OUT_DIR/.done" ]; then
      echo "  [$((i+1))/10] $SLUG — SKIP (already done)"
    elif [ -f "$OUT_DIR/.pid" ] && ps -p "$(cat "$OUT_DIR/.pid")" > /dev/null 2>&1; then
      echo "  [$((i+1))/10] $SLUG — SKIP (already in-flight, PID $(cat "$OUT_DIR/.pid"))"
    else
      echo "  [$((i+1))/10] $SLUG — WILL RUN"
      echo "         brief: src/lib/pdf-engine-v2/briefs/${BRIEFS[$i]}"
      echo "         output-prefix: post-5470c9ae--$SLUG"
      echo "         log: $OUT_DIR/log.txt"
    fi
  done
  echo ""
  PENDING=0
  for i in "${!SLUGS[@]}"; do
    SLUG="${SLUGS[$i]}"
    OUT_DIR="$EVIDENCE_ROOT/$SLUG"
    [ -f "$OUT_DIR/.done" ] && continue
    [ -f "$OUT_DIR/.pid" ] && ps -p "$(cat "$OUT_DIR/.pid")" > /dev/null 2>&1 && continue
    PENDING=$((PENDING+1))
  done
  echo "Pending runs: $PENDING / ${#SLUGS[@]}"
  echo "First wave (up to $MAX_CONCURRENT): will launch simultaneously"
  echo "Concurrency mechanism: bash job-control + wait -n"
  exit 0
fi

log "Starting parallel baseline (max $MAX_CONCURRENT concurrent) — ${#BRIEFS[@]} total runs"

# Track background PIDs in an array
declare -a PIDS=()
declare -a PID_SLUGS=()
IN_FLIGHT=0

# ------------------------------------------------------------------
# Token-based semaphore using a FIFO to cap concurrency at MAX_CONCURRENT.
# Compatible with macOS Homebrew bash 5+ (wait -n requires bash 4.3+).
# ------------------------------------------------------------------

wait_for_slot() {
  # If fewer than MAX_CONCURRENT in flight, return immediately
  if [ "$IN_FLIGHT" -lt "$MAX_CONCURRENT" ]; then
    return
  fi
  # Otherwise wait for any background job to finish
  wait -n 2>/dev/null || true
  IN_FLIGHT=$((IN_FLIGHT - 1))
}

for i in "${!BRIEFS[@]}"; do
  BRIEF="src/lib/pdf-engine-v2/briefs/${BRIEFS[$i]}"
  SLUG="${SLUGS[$i]}"
  OUT_DIR="$EVIDENCE_ROOT/$SLUG"

  if [ -f "$OUT_DIR/.done" ]; then
    log "[$((i+1))/${#BRIEFS[@]}] $SLUG already done, skipping"
    continue
  fi

  # Skip if a run is already in-flight (existing .pid points to a live process)
  if [ -f "$OUT_DIR/.pid" ]; then
    EXISTING_PID=$(cat "$OUT_DIR/.pid")
    if ps -p "$EXISTING_PID" > /dev/null 2>&1; then
      log "[$((i+1))/${#BRIEFS[@]}] $SLUG already in-flight (PID $EXISTING_PID), skipping"
      continue
    fi
  fi

  # Block until a concurrency slot is free
  wait_for_slot

  log "[$((i+1))/${#BRIEFS[@]}] Launching $SLUG (in-flight will be $((IN_FLIGHT+1))/$MAX_CONCURRENT)..."

  # Launch the bg script — it forks its own subshell and returns a .pid.
  # We also track *this* shell's wait-able job (the bash script itself).
  (
    bash "$REPO_ROOT/scripts/engine-evidence-bg.sh" "$LABEL/$SLUG" "$BRIEF" >> "$BATCH_LOG" 2>&1
    # Wait for the run to actually complete (bg script returns immediately)
    while [ ! -f "$OUT_DIR/.done" ]; do
      sleep 10
    done
    log "[$((i+1))/${#BRIEFS[@]}] $SLUG finished"
  ) &

  PIDS+=($!)
  PID_SLUGS+=("$SLUG")
  IN_FLIGHT=$((IN_FLIGHT + 1))
done

# Wait for all remaining background jobs
log "All runs launched — waiting for ${IN_FLIGHT} in-flight runs to complete..."
wait
log "$(date -u +%Y-%m-%dT%H:%M:%SZ) All ${#BRIEFS[@]} runs complete"

# Final summary
DONE_COUNT=$(find "$EVIDENCE_ROOT" -maxdepth 2 -name .done 2>/dev/null | wc -l | tr -d ' ')
log "Done count: $DONE_COUNT / ${#BRIEFS[@]}"
