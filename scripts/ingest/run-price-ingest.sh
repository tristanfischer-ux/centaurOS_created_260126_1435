#!/usr/bin/env bash
# run-price-ingest.sh — drain the price-ingest queue into forge-truth.db (the growing-DB loop).
#
# Scheduled daily by ~/Library/LaunchAgents/com.forge.price-ingest.plist. The BoM engine
# (scripts/requirements_bom.py) appends every principal it could NOT price from the DB to
# ~/.forge-truth/price-ingest-queue.jsonl; this drains that queue: for each principal it asks an
# LLM for a real UK part + price, VERIFIES it (dual anchor: 4× of the estimate OR the DB class
# range; reject low-confidence / fake-MPN / absurd), and writes it back to pretraining_extracted_
# parts. Next chain run the DB-first resolver prices it from real data — coverage climbs run over run.
#
# Cost is BOUNDED by the queue size (a handful of principals/day) — NOT an LLM check-in loop. The job
# exits immediately when the queue is empty, so an idle day costs nothing.
#
# Manual run:   bash scripts/ingest/run-price-ingest.sh
# Dry-run:      INGEST_COMMIT=0 bash scripts/ingest/run-price-ingest.sh
set -euo pipefail

REPO="/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel"
QUEUE="$HOME/.forge-truth/price-ingest-queue.jsonl"
LOG="$HOME/.forge-truth/price-ingest-$(date +%Y-%m-%d).log"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
cd "$REPO"

# Nothing queued → exit quietly. Never spin up node / the LLM for an empty queue.
if [ ! -s "$QUEUE" ]; then
  echo "$(date '+%F %T') price-ingest: queue empty, nothing to do" >> "$LOG"
  exit 0
fi

# Load the OpenRouter key from the repo env (strip surrounding quotes if any).
KEY_LINE="$(grep -E '^OPENROUTER_API_KEY=' .env.local | head -1 | cut -d= -f2-)"
export OPENROUTER_API_KEY="$(printf '%s' "$KEY_LINE" | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//')"
if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "$(date '+%F %T') price-ingest: OPENROUTER_API_KEY missing in .env.local — skipping" >> "$LOG"
  exit 0
fi

# Fast non-reasoning model (the default GLM-5.2 reasoning model times out before emitting JSON).
export INGEST_MODEL="${INGEST_MODEL:-google/gemini-2.5-flash}"
export INGEST_LLM_TIMEOUT_MS="${INGEST_LLM_TIMEOUT_MS:-60000}"
export NODE_OPTIONS="--max-old-space-size=4096"

N="$(wc -l < "$QUEUE" | tr -d ' ')"
echo "$(date '+%F %T') price-ingest: draining $N queued principal(s) with $INGEST_MODEL" >> "$LOG"

# INGEST_COMMIT=0 forces a dry-run (verify only, no DB write); default commits + drains the queue.
FLAG="--commit"
[ "${INGEST_COMMIT:-1}" = "0" ] && FLAG=""
npx tsx scripts/ingest/ingest-priced-principals.ts $FLAG >> "$LOG" 2>&1 || \
  echo "$(date '+%F %T') price-ingest: job exited non-zero (see above) — queue left intact for next run" >> "$LOG"

echo "$(date '+%F %T') price-ingest: done" >> "$LOG"
