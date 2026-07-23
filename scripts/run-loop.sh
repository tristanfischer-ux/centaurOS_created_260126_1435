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

# better-sqlite3 / node@22 ABI PRE-BAKE CHECK (recurring break, drawer 8744be60adfaa0b0):
# a sub-agent `git push` fires the pre-push hook, which rebuilds better-sqlite3 for the SYSTEM
# node (25 / ABI 141); the chain then runs on node@22 (ABI 127) and dies mid-bake with an
# opaque native-module error. PATH=node@22 above does NOT fix an already-wrong-ABI binary.
# Verify the native module actually LOADS under node@22; auto-rebuild once if it doesn't.
if ! node -e "require('better-sqlite3')" >/dev/null 2>&1; then
  echo "[run-loop] better-sqlite3 fails to load under node@22 (ABI mismatch — likely a stray system-node rebuild). Rebuilding…"
  if ! npm rebuild better-sqlite3 >/dev/null 2>&1 || ! node -e "require('better-sqlite3')" >/dev/null 2>&1; then
    echo "[run-loop] ABORT — better-sqlite3 still won't load under node@22 after rebuild. Fix: PATH=/opt/homebrew/opt/node@22/bin:\$PATH npm rebuild better-sqlite3"; exit 4
  fi
  echo "[run-loop] better-sqlite3 rebuilt for node@22 ✓"
fi

# DECISION: primary log under $OUT (campaign watch + durable nohup). Mirror to
# repo-root out-*.log for existing greppers. PIPESTATUS[0] = chain exit.
CHAIN_LOG="$OUT/chain.log"
ROOT_LOG="out-$(basename "$OUT").log"
set -o pipefail
npx tsx --no-cache scripts/serial-design-chain-v2.tsx "$BRIEF" "$OUT" \
  2>&1 | tee "$CHAIN_LOG" "$ROOT_LOG"
EXIT=${PIPESTATUS[0]:-$?}
echo "== $LABEL run exit: $EXIT $(date +%H:%M:%S) — $OUT ==" | tee -a "$CHAIN_LOG"
# OUTSIDE REVIEWER — a different model family reads the DELIVERED artefacts with fresh
# eyes before the board assembles, so its findings need dispositions like everything else.
python3 scripts/lib/ship_red_team.py "$OUT" || true
python3 scripts/lib/loop_board.py assemble "$OUT" --board "$BOARD"
exit $EXIT
