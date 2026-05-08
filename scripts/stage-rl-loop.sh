#!/usr/bin/env bash
# stage-rl-loop.sh — Stage-agnostic RL launcher for the PDF engine v2.
#
# Fixes four flaws in the per-stage RL scripts (brief-rl-loop.sh,
# feasibility-rl-loop.sh, feasibility-full-rl-loop.sh, decompose-rl-loop.sh,
# sizing-rl-loop.sh):
#
#   1. NO UPSTREAM CACHING — every iteration re-runs stages 0..N fresh from the
#      founder brief, eliminating overfitting to a single upstream realisation.
#   2. ALL 10 BASELINE BRIEFS — uses the full diversity set by default, not 2-3.
#   3. SAME COUNCIL AS PRODUCTION — delegates scoring to council-scorer.ts
#      directly; no reimplementation.
#   4. STAGE-AGNOSTIC — one script parameterised by --stage, not five scripts.
#
# Usage:
#   ./scripts/stage-rl-loop.sh --stage decompose
#   ./scripts/stage-rl-loop.sh --stage brief_generation --iterations 3
#   ./scripts/stage-rl-loop.sh --stage bom_cost --briefs 01-cgm-wearable,09-bess-container
#   ./scripts/stage-rl-loop.sh --stage research --label my-research-run
#
# Supported stages (mirror pipeline stage names from index.ts):
#   training_data | research | brief_generation | decompose |
#   size_layout   | bom_cost | suppliers        | review
#
# Args:
#   --stage <name>           (required) pipeline stage to optimise
#   --iterations <K>         (default: 5) number of RL iterations
#   --briefs <list|all>      (default: all) comma-separated brief filenames or "all"
#   --label <slug>           (default: rl-stage-<stage>-<timestamp>)
#
# Output lands in ~/Downloads/engine-evidence/<label>/

set -eo pipefail

REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
EVIDENCE_ROOT="$HOME/Downloads/engine-evidence"

# ── Parse args ────────────────────────────────────────────────────────────────

STAGE=""
ITERATIONS="5"
BRIEFS="all"
LABEL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage)       STAGE="$2";      shift 2 ;;
    --iterations)  ITERATIONS="$2"; shift 2 ;;
    --briefs)      BRIEFS="$2";     shift 2 ;;
    --label)       LABEL="$2";      shift 2 ;;
    --help|-h)
      grep '^#' "$0" | head -40 | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "[stage-rl-loop] Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$STAGE" ]]; then
  echo "[stage-rl-loop] ERROR: --stage is required." >&2
  echo "Supported stages: training_data | research | brief_generation | decompose | size_layout | bom_cost | suppliers | review" >&2
  exit 1
fi

# Build label if not provided
if [[ -z "$LABEL" ]]; then
  TIMESTAMP=$(date -u +%Y%m%dT%H%M%S)
  LABEL="rl-stage-${STAGE}-${TIMESTAMP}"
fi

OUTPUT_DIR="$EVIDENCE_ROOT/$LABEL"
mkdir -p "$OUTPUT_DIR"

# ── Verify .env.local is loadable ─────────────────────────────────────────────
ENV_FILE="$REPO_ROOT/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[stage-rl-loop] WARNING: .env.local not found at $ENV_FILE" >&2
  echo "[stage-rl-loop] OPENROUTER_API_KEY must be set in environment." >&2
fi

# ── Summary header ────────────────────────────────────────────────────────────

echo ""
echo "=== Stage RL Loop ==="
echo "Stage:      $STAGE"
echo "Iterations: $ITERATIONS"
echo "Briefs:     $BRIEFS"
echo "Label:      $LABEL"
echo "Output:     $OUTPUT_DIR"
echo "Started:    $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# ── Invoke the TypeScript RL loop ─────────────────────────────────────────────
# The TS script handles all parallelism internally (concurrency cap 3 briefs).
# We tee stdout+stderr to both terminal and a log file.

LOG_FILE="$OUTPUT_DIR/rl-loop.log"

(
  cd "$REPO_ROOT"

  # Load .env.local into the subprocess environment so the TS script sees API keys.
  # Only set variables that aren't already in the environment.
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$')
    set +a
  fi

  npx tsx \
    src/lib/pdf-engine-v2/stage-rl-iterate.ts \
    --stage "$STAGE" \
    --iterations "$ITERATIONS" \
    --briefs "$BRIEFS" \
    --label "$LABEL" \
    --output "$OUTPUT_DIR" \
    2>&1

) | tee "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo "=== Stage RL Loop complete ==="
echo "Duration: $SECONDS seconds"
echo "Output:   $OUTPUT_DIR"
echo ""

# Print score table from summary.json if it was written
SUMMARY="$OUTPUT_DIR/summary.json"
if command -v python3 &>/dev/null && [[ -f "$SUMMARY" ]]; then
  python3 - "$SUMMARY" <<'PYEOF'
import json, sys
data = json.load(open(sys.argv[1]))
print(f"Stage:          {data.get('stage')}")
print(f"Best iteration: {data.get('bestIteration')} (mean {data.get('bestMeanScore')}/10)")
print("")
print("Iteration | Mean  | Briefs scored")
print("----------|-------|---------------")
for h in data.get("history", []):
    mean = h.get("meanScore")
    scored = h.get("scoredBriefs", "?")
    total  = h.get("totalBriefs", "?")
    mean_str = f"{mean:.2f}/10" if mean is not None else "N/A"
    print(f"    {h['iteration']:5d} | {mean_str:5s} | {scored}/{total}")
print("")
print("Full report: " + sys.argv[1].replace("/summary.json", "/BEST.md"))
PYEOF
fi

exit $EXIT_CODE
