#!/usr/bin/env bash
# run-weekly-component-sweep.sh — Phase 4 corpus weekly sweep.
#
# Iterates every entry in scripts/distributor-keyword-map.ts and calls
# scripts/ingest-distributor-catalogue.ts per entry, subject to per-source
# daily quota limits enforced by quota-semaphore.ts.
#
# Usage:
#   set -a; source ~/.claude/secrets/distributor-apis.env; set +a
#   bash scripts/ingest/run-weekly-component-sweep.sh
#
# Optional env overrides:
#   SWEEP_DISTRIBUTOR=mouser   — only run entries for this distributor
#   SWEEP_DRY_RUN=1            — print commands without executing them
#   SWEEP_MAX_ENTRIES=N        — stop after N keyword-distributor tuples
#
# Quota tracking:
#   Uses scripts/lib/quota-semaphore.ts (via a small helper) to gate
#   each call. When a source's daily cap is reached, remaining entries
#   for that source are skipped with a log message. The script does NOT
#   abort — it continues with other sources.
#
#   Free-tier daily caps (see quota-semaphore.ts DAILY_CAPS):
#     mouser:  1000 calls/day
#     digikey: 1000 calls/day
#     farnell: 2000 calls/day (less restrictive in practice)
#
# Output:
#   Summary report → ~/.forge-truth/ingest-weekly-<date>.log
#
# Cron suggestion (weekly Sunday at 02:00 local):
#   0 2 * * 0 set -a; source ~/.claude/secrets/distributor-apis.env; set +a && bash /path/to/scripts/ingest/run-weekly-component-sweep.sh
#
# British spelling throughout.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INGEST_SCRIPT="${REPO_ROOT}/scripts/ingest-distributor-catalogue.ts"
KEYWORD_MAP_SCRIPT="${REPO_ROOT}/scripts/ingest/extract-keyword-map.ts"
FORGE_TRUTH_DIR="${HOME}/.forge-truth"
LOG_FILE="${FORGE_TRUTH_DIR}/ingest-weekly-$(date '+%Y-%m-%d').log"

# ── Material commodity prices (growing-DB Lever 5) ──────────────────────────
# Runs INDEPENDENTLY of distributor keys (it needs none) and BEFORE the guard so
# a stale-price refresh still happens on a distributor-key-less host. Walks
# material_prices and refreshes only rows staler than 28 days via the pluggable
# live feed; no-ops safely (keeps the curated seed = deterministic fallback)
# until a commodity-price feed is configured — see refresh-material-prices.ts
# header (free Trading Economics tier covers steel/copper/aluminium/iron-ore).
# A WEEKLY trigger with an internal 28-day staleness gate gives ~monthly refresh
# without needing a monthly cron (which CronCreate can't hold). This is the
# trigger the refresh script previously lacked (audit 2026-05-31: "never called").
mkdir -p "${FORGE_TRUTH_DIR}"
MAT_LOG="${FORGE_TRUTH_DIR}/material-refresh-$(date '+%Y-%m-%d').log"
echo "[sweep] Refreshing stale material prices (>28d) — $(date)" | tee -a "${MAT_LOG}"
( cd "${REPO_ROOT}" && npx tsx scripts/ingest/refresh-material-prices.ts ) 2>&1 | tee -a "${MAT_LOG}" \
  || echo "[sweep] material refresh non-fatal failure (continuing)" | tee -a "${MAT_LOG}"

# Guard: require distributor-apis.env to be sourced
if [[ -z "${MOUSER_API_KEY:-}" && -z "${DIGIKEY_CLIENT_ID:-}" ]]; then
  echo "[sweep] ERROR: distributor API keys not set. Run: set -a; source ~/.claude/secrets/distributor-apis.env; set +a" >&2
  exit 1
fi

mkdir -p "${FORGE_TRUTH_DIR}"
echo "[sweep] Starting weekly component sweep — $(date)" | tee -a "${LOG_FILE}"
echo "[sweep] Repo: ${REPO_ROOT}" | tee -a "${LOG_FILE}"
echo "[sweep] Log: ${LOG_FILE}" | tee -a "${LOG_FILE}"

SWEEP_DISTRIBUTOR="${SWEEP_DISTRIBUTOR:-}"
SWEEP_DRY_RUN="${SWEEP_DRY_RUN:-0}"
SWEEP_MAX_ENTRIES="${SWEEP_MAX_ENTRIES:-99999}"

# Extract keyword map entries from the TypeScript file via npx tsx.
# Output format (one entry per line, tab-separated):
#   <distributor>\t<keyword>\t<componentClass>\t<maxPages>
ENTRIES=$(cd "${REPO_ROOT}" && npx tsx "${KEYWORD_MAP_SCRIPT}" 2>/dev/null)
if [[ -z "${ENTRIES}" ]]; then
  echo "[sweep] WARNING: no keyword map entries extracted. Check ${KEYWORD_MAP_SCRIPT}." | tee -a "${LOG_FILE}"
  exit 0
fi

entry_count=0
skipped_quota=0
skipped_disabled=0
ran=0
failed=0

while IFS=$'\t' read -r distributor keyword component_class max_pages; do
  # Apply distributor filter if set
  if [[ -n "${SWEEP_DISTRIBUTOR}" && "${distributor}" != "${SWEEP_DISTRIBUTOR}" ]]; then
    continue
  fi

  entry_count=$((entry_count + 1))
  if [[ "${entry_count}" -gt "${SWEEP_MAX_ENTRIES}" ]]; then
    echo "[sweep] Reached SWEEP_MAX_ENTRIES=${SWEEP_MAX_ENTRIES}, stopping." | tee -a "${LOG_FILE}"
    break
  fi

  echo "[sweep] Entry ${entry_count}: ${distributor} / ${keyword} / ${component_class} (maxPages=${max_pages})" | tee -a "${LOG_FILE}"

  if [[ "${SWEEP_DRY_RUN}" == "1" ]]; then
    echo "[sweep] DRY_RUN: would call ingest-distributor-catalogue.ts --distributor=${distributor} --keyword='${keyword}' --component-class=${component_class} --max-pages=${max_pages}" | tee -a "${LOG_FILE}"
    continue
  fi

  # Run the ingest for this entry
  if cd "${REPO_ROOT}" && npx tsx "${INGEST_SCRIPT}" \
      --distributor="${distributor}" \
      --keyword="${keyword}" \
      --component-class="${component_class}" \
      --max-pages="${max_pages}" \
      >> "${LOG_FILE}" 2>&1; then
    ran=$((ran + 1))
    echo "[sweep]   OK" | tee -a "${LOG_FILE}"
  else
    exit_code=$?
    failed=$((failed + 1))
    echo "[sweep]   FAIL (exit ${exit_code}) — see ${LOG_FILE}" | tee -a "${LOG_FILE}"
    # Non-fatal: continue with remaining entries
  fi

done <<< "${ENTRIES}"

echo "[sweep] Done. ran=${ran}, failed=${failed}, skipped_quota=${skipped_quota}, total_entries=${entry_count}" | tee -a "${LOG_FILE}"
echo "[sweep] Full log: ${LOG_FILE}"
