#!/bin/bash
# run-loop.sh — THE canonical gate-enforced loop launcher (2026-07-10, Tristan/Grok review:
# "the loop board exists and passes selftest but is not enforced by the canonical launcher").
# Every quality-loop run goes through here: the board gate BLOCKS the launch while any
# harvested defect lacks a disposition, and every run auto-assembles its own board.
#
#   scripts/run-loop.sh <brief.md> <board.json> [run-label]
#
# Env honoured: DESIGN_STAGE_CACHE_DIR (defaults to a shared per-brief cache),
# LOOP_TARGET_SCORE (harvest bar, default 9). The or402 failover shim rides NODE_OPTIONS.
set -u
BRIEF="${1:?usage: run-loop.sh <brief.md> <board.json> [label]}"
BOARD="${2:?usage: run-loop.sh <brief.md> <board.json> [label]}"
LABEL="${3:-$(basename "$BRIEF" .md)}"
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
export NODE_OPTIONS="--max-old-space-size=8192 --import $PWD/scripts/lib/or402-failover.mjs"
export DESIGN_STAGE_CACHE_DIR="${DESIGN_STAGE_CACHE_DIR:-$PWD/out/.$LABEL-stage-cache}"
export BENCHMARK_NET_FORCE="${BENCHMARK_NET_FORCE:-1}" QUALITY_LOOP_PHASE="${QUALITY_LOOP_PHASE:-3}" PHYSICS_CRITIC_AUTOCORRECT="${PHYSICS_CRITIC_AUTOCORRECT:-1}"
OUT="out/$LABEL-$(date +%Y%m%d-%H%M)"
mkdir -p "$OUT"

python3 scripts/lib/loop_board.py gate --board "$BOARD" || {
  echo "[run-loop] GATE CLOSED — disposition every board defect before launching (loop_board.py dispose <id> ...)"; exit 3; }

npx tsx --no-cache scripts/serial-design-chain-v2.tsx "$BRIEF" "$OUT" > "out-$(basename "$OUT").log" 2>&1
EXIT=$?
echo "== $LABEL run exit: $EXIT $(date +%H:%M:%S) — $OUT =="
# OUTSIDE REVIEWER — a different model family reads the DELIVERED artefacts with fresh
# eyes before the board assembles, so its findings need dispositions like everything else.
python3 scripts/lib/ship_red_team.py "$OUT" || true
python3 scripts/lib/loop_board.py assemble "$OUT" --board "$BOARD"
exit $EXIT
