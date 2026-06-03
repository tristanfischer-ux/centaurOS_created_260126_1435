#!/opt/homebrew/bin/bash
# scripts/iterate-to-release.sh — AUTO-ITERATE-TO-≥8 RELEASE GATE (2026-06-03).
#
# Tristan's "self-correcting" pillar: the engine should iterate a dossier and only
# release a version to the customer once EVERY council section is ≥8. This wraps
# the existing chain + multimodal scorer into a pre-release gate:
#
#   for i in 1..MAX:
#     run the chain          -> dossier i
#     council-score it       -> 12 section scores
#     if every section ≥8    -> RELEASE dossier i (exit 0)
#     else                   -> keep the best, try again
#   end
#   -> HOLD: report the best dossier + the sections still <8 + a structural-vs-output
#            diagnosis (some misses are STRUCTURAL — missing class-plan, sizing wall —
#            that re-running cannot fix; those are flagged for a wiring fix, NOT shipped).
#
# v1 exploits the chain's stochasticity (best-of-N) + enforces the ≥8 gate. The
# smarter v2 (feed weak-section diagnostics back into the next run) is the follow-up.
#
# Usage: bash scripts/iterate-to-release.sh <brief.md> <class-slug> [maxIters=3]
set -eo pipefail
REPO="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
cd "$REPO"

BRIEF="$1"; CLASS="$2"; MAX="${3:-3}"
[ -z "$BRIEF" ] || [ -z "$CLASS" ] && { echo "usage: iterate-to-release.sh <brief.md> <class> [maxIters]"; exit 2; }

GATE=8
BEST_BELOW=999 ; BEST_DIR="" ; BEST_MIN=0
echo "[release-gate] $CLASS — up to $MAX iterations; releasing only when every section ≥ $GATE"

# Extract the per-section scores from a score log → print "min_score below8_count".
parse_scores() {
  awk '
    /Section scores/ {inblk=1; next}
    /Overall mean/   {inblk=0}
    inblk && NF>=2 {
      for (i=1;i<=NF;i++) if ($i ~ /^[0-9]+\.[0-9]+$/) { s=$i; if(min==""||s<min)min=s; n++; if(s<8)b++ }
    }
    END { printf "%s %d", (min==""?"0":min), (b==""?n:b) }
  ' "$1"
}

for i in $(seq 1 "$MAX"); do
  OUT="out/release-${CLASS}-iter${i}"
  echo "[release-gate] iter $i/$MAX — generating…"
  rm -rf "$OUT"
  bash scripts/run-class-iter.sh "$BRIEF" "$OUT" > "${OUT}.run.log" 2>&1 || echo "[release-gate]   (chain exited non-zero — PDF may still have rendered)"
  if [ ! -f "$OUT/radical.pdf" ]; then
    echo "[release-gate]   iter $i produced no PDF (hard structural failure) — see ${OUT}.run.log"
    continue
  fi
  echo "[release-gate] iter $i — scoring…"
  python3 scripts/score-radical-pdfs-multimodal.py --pdf "$OUT/radical.pdf" --class "$CLASS" --run-tag "release-iter${i}" > "${OUT}.score.log" 2>&1 || true
  read MINSCORE BELOW < <(parse_scores "${OUT}.score.log")
  echo "[release-gate] iter $i — min section = ${MINSCORE}; sections below ${GATE} = ${BELOW}"
  if [ "${BELOW:-999}" -eq 0 ] 2>/dev/null; then
    echo "[release-gate] ✅ RELEASE — every section ≥ ${GATE} on iter $i → $OUT/radical.pdf"
    exit 0
  fi
  if [ "${BELOW:-999}" -lt "$BEST_BELOW" ] 2>/dev/null; then
    BEST_BELOW=$BELOW ; BEST_DIR=$OUT ; BEST_MIN=$MINSCORE
  fi
done

echo ""
echo "[release-gate] ⛔ HOLD — no iteration cleared every section ≥ ${GATE} after ${MAX} tries."
echo "[release-gate]    best: $BEST_DIR (min section ${BEST_MIN}, ${BEST_BELOW} section(s) < ${GATE})"
echo "[release-gate]    DO NOT SHIP. Sections still < ${GATE} (from ${BEST_DIR}.score.log):"
if [ -n "$BEST_DIR" ]; then
  awk '/Section scores/{b=1;next} /Overall mean/{b=0} b && NF>=2 {for(i=1;i<=NF;i++) if($i ~ /^[0-9]+\.[0-9]+$/ && $i<8){print "      - "$1" = "$i; break}}' "${BEST_DIR}.score.log"
fi
echo "[release-gate]    Persistent low sections across all iters are STRUCTURAL (missing class-plan, sizing/grammar in the emitter) — fix the wiring, do not keep iterating output."
exit 1
