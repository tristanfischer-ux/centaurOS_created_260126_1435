#!/bin/bash
# scripts/ingest/run-electronics-price-enrich.sh
#
# Off-peak nightly price back-fill for the self-building parts DB
# (~/.forge-truth/forge-truth.db :: pretraining_extracted_parts.unit_price_gbp).
#
# WHY A NIGHTLY JOB: distributor quotas (Mouser / Digi-Key / Farnell / Nexar) are
# SHARED across every session and burn fast — at US business-hours peak Mouser 403s
# server-side and Digi-Key 429s ("daily quota exhausted, resets midnight UTC"). A
# clean coverage pass needs FRESH quotas, so this runs under launchd
# (com.forge.bom-price-enrich) at 06:00 local (~05:00 UTC) — a few hours after the
# Digi-Key reset, in US deep-night to dodge the Mouser load 403s.
#
# WHAT IT TARGETS: ONLY the genuinely distributor-addressable slice — the electronic_*
# component classes plus sensor / optical / magnetic (~573 NULL-price rows, within the
# DK 1000/day cap). The ~84% quote-only industrial rows (oem_subsystem, structural_metal,
# battery_cell, …) have no public catalogue price and are deliberately NOT crawled here
# (they would only burn quota on guaranteed misses); they are handled honestly in the
# dossier by the "indicative · RFQ" marker instead.
#
# SAFETY: the underlying tool (enrich-null-prices.ts) is verify-before-writeback —
# manufacturer-strict exact-MPN match, per-class sanity band, writes ONLY unit_price_gbp
# + a price_enrich provenance stamp, never clobbers an existing price, quota-stops when
# a source caps. Self-limiting: priced rows drop out of the NULL candidate set, so the
# job naturally shrinks to newly-ingested rows over time.
#
# Reverse a bad run: UPDATE pretraining_extracted_parts SET unit_price_gbp=NULL,
#   discovery_source=NULL WHERE discovery_source='price_enrich';

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

set -a
[ -f "$HOME/.claude/secrets/distributor-apis.env" ] && source "$HOME/.claude/secrets/distributor-apis.env"
set +a

REPO="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
cd "$REPO" || { echo "repo not found: $REPO" >&2; exit 1; }

LOG="$HOME/Library/Logs/forge-bom-price-enrich.log"
DB="$HOME/.forge-truth/forge-truth.db"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

{
  echo ""
  echo "===== price-enrich run ${TS} ====="
  echo "addressable NULL rows before: $(sqlite3 "$DB" "SELECT COUNT(*) FROM pretraining_extracted_parts WHERE unit_price_gbp IS NULL AND part_number IS NOT NULL AND LENGTH(TRIM(part_number))>=4 AND (component_class LIKE 'electronic_%' OR component_class IN ('sensor','optical','magnetic'));" 2>/dev/null)"
} >> "$LOG"

for C in electronic_pcb electronic_connector electronic_cable electronic_ic \
         electronic_passive electronic_power_module electronic_discrete \
         sensor optical magnetic; do
  echo "--- ${C} $(date -u +%H:%M:%S) ---" >> "$LOG"
  npx tsx scripts/ingest/enrich-null-prices.ts --class "$C" --commit >> "$LOG" 2>&1
done

WRITTEN="$(sqlite3 "$DB" "SELECT COUNT(*) FROM pretraining_extracted_parts WHERE discovery_source='price_enrich';" 2>/dev/null)"
echo "===== run ${TS} done — TOTAL price_enrich rows (all-time): ${WRITTEN} =====" >> "$LOG"
