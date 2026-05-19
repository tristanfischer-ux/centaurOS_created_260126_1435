#!/usr/bin/env bash
# run-fanout.sh — launch a batch of serial-design-chain-v2 runs with bounded concurrency.
#
# Why this exists (2026-05-15): iter-58 fan-out launched 8 chains within 30 seconds
# of each other. 4 of 8 died on transient TCP socket terminate / Grok JSON truncation
# / empty response — all at the first or second LLM call, all under peak concurrent
# load against OpenRouter. Cap concurrency at 3 simultaneous and the empirical
# failure rate drops from ~50% to ~15%. See drawer drawer_forgeos_gotchas_5896fd708eb2b496.
#
# Usage:
#   scripts/run-fanout.sh <iter-tag> <concurrency> <brief1.md> <outdir1> [<brief2.md> <outdir2> ...]
#
# Example:
#   scripts/run-fanout.sh iter-59 3 \
#     src/lib/pdf-engine-v2/briefs/bess.md  /Users/tristanfischer/Downloads/bess-iter/iter-59-bess/container \
#     src/lib/pdf-engine-v2/briefs/farm.md  /Users/tristanfischer/Downloads/bess-iter/iter-59-vf/container \
#     ...
#
# The runner:
#   • Launches at most <concurrency> chains at once.
#   • Waits for any one to finish before launching the next.
#   • Logs per-class exit codes to a summary file.
#   • Exits 0 even if some chains FATAL — caller reads the summary to see what landed.

set -u  # die on unset vars, but NOT on chain FATAL (we want all of them to run)

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 <iter-tag> <concurrency> <brief1.md> <outdir1> [<brief2.md> <outdir2> ...]"
  exit 1
fi

ITER_TAG="$1"
CONCURRENCY="$2"
shift 2

if ! [[ "$CONCURRENCY" =~ ^[1-9][0-9]*$ ]]; then
  echo "concurrency must be a positive integer; got '$CONCURRENCY'"
  exit 1
fi

# Pair up positional args: (brief1 outdir1) (brief2 outdir2) ...
if [ $(($# % 2)) -ne 0 ]; then
  echo "args after iter-tag + concurrency must come in (brief, outdir) pairs; got $# extras"
  exit 1
fi

SUMMARY_FILE="/tmp/run-fanout-${ITER_TAG}-$(date +%s).log"
echo "=== fanout summary ${ITER_TAG} ===" > "$SUMMARY_FILE"
echo "concurrency: ${CONCURRENCY}" >> "$SUMMARY_FILE"
echo "started: $(date)" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"

declare -a pairs=()
while [ "$#" -gt 0 ]; do
  pairs+=("$1::$2")
  shift 2
done

echo "[fanout] launching ${#pairs[@]} chains with concurrency=${CONCURRENCY}, summary=$SUMMARY_FILE" >&2

declare -A pid_to_label=()
running=0

launch_one() {
  local pair="$1"
  local brief="${pair%%::*}"
  local outdir="${pair##*::}"
  local label
  label="$(basename "$(dirname "$outdir")")"
  mkdir -p "$outdir"
  local run_log
  run_log="$(dirname "$outdir")/run.log"
  npx tsx scripts/serial-design-chain-v2.tsx "$brief" "$outdir" > "$run_log" 2>&1 &
  local pid=$!
  pid_to_label["$pid"]="$label"
  echo "[fanout] launched pid=$pid label=$label brief=$(basename "$brief")" >&2
}

wait_one() {
  # Wait for any single child to exit, then record its status.
  local exited_pid
  if wait -n -p exited_pid 2>/dev/null; then
    local rc=$?
    local label="${pid_to_label[$exited_pid]:-unknown}"
    echo "[fanout] finished pid=$exited_pid label=$label exit=$rc" >&2
    echo "$(date +%H:%M:%S) $label exit=$rc" >> "$SUMMARY_FILE"
    unset "pid_to_label[$exited_pid]"
    running=$((running - 1))
  else
    # Fallback for bash < 5.1 (no -p) — wait on all, may over-wait once
    wait -n 2>/dev/null
    local rc=$?
    echo "[fanout] one child exited (bash <5.1 fallback) exit=$rc" >&2
    echo "$(date +%H:%M:%S) (untracked) exit=$rc" >> "$SUMMARY_FILE"
    running=$((running - 1))
  fi
}

for pair in "${pairs[@]}"; do
  while [ "$running" -ge "$CONCURRENCY" ]; do
    wait_one
  done
  launch_one "$pair"
  running=$((running + 1))
done

# Drain remaining
while [ "$running" -gt 0 ]; do
  wait_one
done

echo "" >> "$SUMMARY_FILE"
echo "finished: $(date)" >> "$SUMMARY_FILE"
echo "[fanout] all chains done. summary: $SUMMARY_FILE" >&2
cat "$SUMMARY_FILE" >&2
