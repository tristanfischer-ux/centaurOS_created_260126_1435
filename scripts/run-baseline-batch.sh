#!/usr/bin/env bash
# Run all 20 baseline evidence runs sequentially in background.
# Output: ~/Downloads/engine-evidence/post-g12-b6/<slug>/{report.pdf,log.txt,.done}
# Total time: ~60-100 min (20 runs × 3-5 min each).

set -eo pipefail

REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
EVIDENCE_ROOT="$HOME/Downloads/engine-evidence/post-5470c9ae"
LABEL="post-5470c9ae"

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
  "baseline-10-minimal/01-cgm-wearable.md"
  "baseline-10-minimal/02-drone-prosumer.md"
  "baseline-10-minimal/03-edge-ai-server.md"
  "baseline-10-minimal/04-heatpump-30kw.md"
  "baseline-10-minimal/05-dc-fast-ev-charger.md"
  "baseline-10-minimal/06-pharma-bioreactor.md"
  "baseline-10-minimal/07-vertical-farm.md"
  "baseline-10-minimal/08-auv-coastal.md"
  "baseline-10-minimal/09-bess-container.md"
  "baseline-10-minimal/10-haps-stratospheric.md"
)

# Slugs for output directories
SLUGS=(
  "r1-cgm" "r1-drone" "r1-edge-ai" "r1-heatpump" "r1-ev-charger"
  "r1-bioreactor" "r1-farm" "r1-auv" "r1-bess" "r1-haps"
  "r2-cgm" "r2-drone" "r2-edge-ai" "r2-heatpump" "r2-ev-charger"
  "r2-bioreactor" "r2-farm" "r2-auv" "r2-bess" "r2-haps"
)

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Starting ${#BRIEFS[@]} evidence runs" | tee "$EVIDENCE_ROOT/batch.log"

for i in "${!BRIEFS[@]}"; do
  BRIEF="src/lib/pdf-engine-v2/briefs/${BRIEFS[$i]}"
  SLUG="${SLUGS[$i]}"
  OUT_DIR="$EVIDENCE_ROOT/$SLUG"

  echo "$(date -u +%H:%M:%S) [$((i+1))/${#BRIEFS[@]}] Starting $SLUG..." | tee -a "$EVIDENCE_ROOT/batch.log"

  bash "$REPO_ROOT/scripts/engine-evidence-bg.sh" "$LABEL/$SLUG" "$BRIEF"

  # Wait for this run to finish before starting next
  while [ ! -f "$OUT_DIR/.done" ]; do
    sleep 10
  done

  echo "$(date -u +%H:%M:%S) [$((i+1))/${#BRIEFS[@]}] $SLUG done" | tee -a "$EVIDENCE_ROOT/batch.log"
done

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) All ${#BRIEFS[@]} runs complete" | tee -a "$EVIDENCE_ROOT/batch.log"
