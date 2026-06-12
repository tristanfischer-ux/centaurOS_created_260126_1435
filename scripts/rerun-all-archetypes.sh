#!/usr/bin/env bash
# Re-run ALL archetypes off the LATEST engine (this repo) — one universal chain,
# same defaults for every archetype, so there is no engine drift (Tristan
# 2026-06-09: "all new projects off your engine, not an earlier engine").
#
# Pool of 3 concurrent chains (per the concurrency-cap rule). Per-archetype log
# + a shared status file so progress is pollable. Launch in the background.
set -u
REPO=/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel
cd "$REPO" || exit 1
STATUS="$REPO/out/rerun-status.txt"
mkdir -p "$REPO/out"
{ echo "BATCH START $(date '+%Y-%m-%d %H:%M:%S')"; echo "engine: $(git rev-parse --short HEAD) ($(git log -1 --format=%ci))"; } > "$STATUS"

# archetypes: pass as args to run a subset, else the full 8
ARCHES="${*:-co2_mineralisation e_fuel_synthesis compute_heat_module energy_storage vertical_farm haps satellite_smallsat edge_ai_server}"

printf '%s\n' $ARCHES | xargs -P 3 -I {} bash -c '
  arch="$1"
  REPO=/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel
  cd "$REPO" || exit 1
  brief="briefs-rerun/${arch}.md"
  outdir="out/rerun-${arch}"
  mkdir -p "$outdir"
  echo "START $arch $(date +%H:%M:%S)" >> "$REPO/out/rerun-status.txt"
  npx tsx scripts/serial-design-chain-v2.tsx "$brief" "$outdir" > "$outdir/chain.log" 2>&1
  code=$?
  echo "DONE  $arch exit=$code $(date +%H:%M:%S)" >> "$REPO/out/rerun-status.txt"
' _ {}

echo "BATCH DONE $(date '+%Y-%m-%d %H:%M:%S')" >> "$STATUS"
