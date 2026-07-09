#!/bin/bash
# Cold determinism twin runner (2026-07-07 determinism audit, Sonnet subagent).
# Runs TWO independent cold chain builds of the SAME brief, clearing every
# design/LLM cache BEFORE EACH run so neither twin can memoize the other's
# LLM output (determinism-by-memoization is a false green — see the task
# brief's Step 2/5). Sequential ONLY — two parallel chains OOM the machine
# (per 2026-07-06 20:55 handover gotcha).
set -uo pipefail
cd /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

BRIEF="briefs-loop/aquaculture_ras.md"
OUT_A="out/det-cold-a"
OUT_B="out/det-cold-b"
LOG="/tmp/cold-twin-runner.log"

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

rm -rf "$OUT_A" "$OUT_B"
log "=== COLD TWIN RUN START ==="

log "clearing out/.design-cache + out/.benchmark-cache + out/.critique-cache before TWIN A"
rm -rf out/.design-cache out/.benchmark-cache out/.critique-cache

log "TWIN A: starting chain run -> $OUT_A"
NODE_OPTIONS="--max-old-space-size=8192" CHAIN_SKIP_PART_VERIFY=1 \
  npx tsx --no-cache scripts/serial-design-chain-v2.tsx "$BRIEF" "$OUT_A" \
  >> "$LOG" 2>&1
A_EXIT=$?
log "TWIN A: chain exited $A_EXIT"
if [ ! -f "$OUT_A/state.json" ]; then
  log "TWIN A: FATAL - no state.json written, aborting before twin B"
  exit 1
fi
log "TWIN A: state.json present ($(stat -f%z "$OUT_A/state.json" 2>/dev/null) bytes)"

log "clearing out/.design-cache + out/.benchmark-cache + out/.critique-cache before TWIN B (must be COLD, not reuse twin A's warm cache)"
rm -rf out/.design-cache out/.benchmark-cache out/.critique-cache

log "TWIN B: starting chain run -> $OUT_B"
NODE_OPTIONS="--max-old-space-size=8192" CHAIN_SKIP_PART_VERIFY=1 \
  npx tsx --no-cache scripts/serial-design-chain-v2.tsx "$BRIEF" "$OUT_B" \
  >> "$LOG" 2>&1
B_EXIT=$?
log "TWIN B: chain exited $B_EXIT"
if [ ! -f "$OUT_B/state.json" ]; then
  log "TWIN B: FATAL - no state.json written"
  exit 1
fi
log "TWIN B: state.json present ($(stat -f%z "$OUT_B/state.json" 2>/dev/null) bytes)"

log "=== RUNNING CANONICAL determinism-check.tsx ==="
npx tsx --no-cache scripts/determinism-check.tsx "$OUT_A/state.json" "$OUT_B/state.json" 2>&1 | tee -a "$LOG"
CHECK_EXIT=${PIPESTATUS[0]}
log "=== determinism-check.tsx exit: $CHECK_EXIT (0=PASS, 1=FAIL) ==="
exit $CHECK_EXIT
