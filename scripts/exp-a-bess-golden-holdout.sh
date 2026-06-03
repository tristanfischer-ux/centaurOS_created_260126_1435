#!/opt/homebrew/bin/bash
# scripts/exp-a-bess-golden-holdout.sh
#
# EXPERIMENT A — BESS-golden holdout (GENERIC-EMITTER-PLAN.md §1).
#
# Forces the canonical BESS brief down the GENERIC emitter path with the
# ~4,710-line hand BESS emitter HELD OUT, so the generic output can be
# councilled against the 9.28 hand-built golden. This is THE de-risk for
# wall-3: it converts "can a generic dossier score >=8 on a known class?"
# into a measured number.
#
# What it proves: how far  structure-from-graph + downstream gap-filler parts
# + contract quantities  gets WITHOUT bespoke coupled-physics sizing code.
#
# Decision rule (GENERIC-EMITTER-PLAN.md §1):
#   >= 8.0 all sections                              -> GO pure-generic
#   6.0-7.9 + fidelity >= 6 + zero HIGH gate findings -> GO hybrid, target >=6-honest (the realistic win)
#   < 6  OR any HIGH engineering finding             -> PIVOT to class-family sizing plug-ins first
#
# Usage: bash scripts/exp-a-bess-golden-holdout.sh [out-dir]
#   default out-dir: out/exp-a-bess-holdout
set -eo pipefail

REPO_ROOT="/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
cd "$REPO_ROOT"

# Canonical BESS brief — the same one run-bess-iter.sh uses for the golden.
BRIEF="$REPO_ROOT/src/lib/pdf-engine-v2/briefs/baseline-10/09-bess-container.md"
OUT_DIR="${1:-$REPO_ROOT/out/exp-a-bess-holdout}"

# THE holdout: hide the BESS registered + legacy emitters (assembler.ts §0) so
# 'bess' falls through to the generic miss-fallback (§4); turn that path ON.
export EXP_A_HOLDOUT_CLASS=bess
export UNIVERSAL_GENERIC_EMITTER=1

echo "[exp-a] BESS-golden holdout — generic path, hand emitter held out"
echo "[exp-a] brief : $BRIEF"
echo "[exp-a] out   : $OUT_DIR"
echo "[exp-a] flags : EXP_A_HOLDOUT_CLASS=$EXP_A_HOLDOUT_CLASS  UNIVERSAL_GENERIC_EMITTER=$UNIVERSAL_GENERIC_EMITTER"
echo "[exp-a] then : council the resulting chain-v2.pdf vs the 9.28 golden, section by section (see EXP-A-README.md)."

# run-class-iter.sh sets the RADICAL_* flags, sources LLM keys, and uses .venv.
# Exported holdout vars are inherited by the exec'd child.
exec bash scripts/run-class-iter.sh "$BRIEF" "$OUT_DIR"
