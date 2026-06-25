#!/usr/bin/env bash
# Autonomous 3-example quality loop (Tristan 2026-06-23, asleep): re-run SAF / CO2 / RAS off the
# CURRENT engine, Excel-only (PDF off by default), gates in SHADOW so the chain completes and records
# EVERY deterministic score (scorecard floor, 13 audits, drawing-gates, cost-sanity). One universal
# engine, no per-class flags — every fix must be universal. 3 concurrent (the concurrency cap).
set -u
REPO=/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel
cd "$REPO" || exit 1
STATUS="$REPO/out/loop-status.txt"
{ echo "LOOP RUN START $(date '+%F %T')"; echo "engine: $(git rev-parse --short HEAD)"; } > "$STATUS"
printf '%s\n' e_fuel_synthesis co2_mineralisation aquaculture_ras | xargs -P 3 -I {} bash -c '
  arch="$1"
  REPO=/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel
  STATUS="$REPO/out/loop-status.txt"
  cd "$REPO" || exit 1
  brief="briefs-loop/${arch}.md"
  outdir="out/${arch}-fix"
  mkdir -p "$outdir"
  echo "START $arch $(date +%H:%M:%S)" >> "$STATUS"
  npx tsx scripts/serial-design-chain-v2.tsx "$brief" "$outdir" > "$outdir/chain.log" 2>&1
  echo "DONE  $arch exit=$? $(date +%H:%M:%S)" >> "$STATUS"
' _ {}
echo "LOOP RUN ALL DONE $(date '+%F %T')" >> "$STATUS"
