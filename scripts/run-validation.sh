#!/usr/bin/env bash
# =============================================================================
# run-validation.sh — the CANONICAL VALIDATION / REVIEW chain runner.
#
# THE RULE (Tristan 2026-07-02, the v50–v55 lesson):
#   ITERATION runs may skip nets to stay cheap (CHAIN_SKIP_BENCHMARK_NET=1 etc.).
#   VALIDATION runs NEVER skip a net. All six v50–v55 "review" workbooks were
#   built with CHAIN_SKIP_BENCHMARK_NET=1, so gate 36 — the independent market-
#   sanity net designed to catch exactly a GW-scale headline on a 90 m³/h water
#   plant — never ran, and the Q&A tab honestly printed "Benchmark net was not
#   run". A dossier reviewed for ship-quality MUST be built by THIS script.
#
# What this script guarantees:
#   * benchmark net ON       — CHAIN_SKIP_BENCHMARK_NET is force-unset and
#                              BENCHMARK_NET_FORCE=1 (gate 36 runs + records
#                              state.benchmarkDivergence even on a cheap phase).
#   * no degrading skips     — every CHAIN_SKIP_* net toggle is force-unset, so
#                              cost-sanity (32), tool-archetype (34) and the
#                              part-reality check all run + record.
#   * drawing gates recorded — gate 35 always records drawing-gates.json + the
#                              punch-list; its ENFORCING default is left as-is
#                              (per the gate table, shadow-by-default gates stay
#                              shadow — this script RECORDS, it does not flip
#                              enforcement policy).
#   * node 22 on PATH        — the chain's supported runtime (better-sqlite3 ABI;
#                              system node 25 is NOT supported).
#   * .venv liveness         — the gate-37 preflight, run BEFORE spending ~45 min:
#                              .venv/bin/python must exist, must not be a
#                              self-referential symlink (the v51–v53 failure), and
#                              must import numpy. Otherwise every physics tool dies
#                              "Python exit null" and the Calculations sheet ships
#                              empty.
#
# Usage:
#   scripts/run-validation.sh <brief.md> <out-dir> [--dry-run]
#
#   --dry-run   print the resolved environment + the exact command, run nothing.
#
# Iteration runs (fast, nets skipped) are a DIFFERENT workflow — do not add skip
# flags here. If you need a cheap loop, call the chain directly and accept that
# the output is NOT reviewable.
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE22_BIN="/opt/homebrew/opt/node@22/bin"

usage() {
  echo "Usage: scripts/run-validation.sh <brief.md> <out-dir> [--dry-run]" >&2
  echo "THE RULE: iteration runs may skip nets; VALIDATION runs NEVER." >&2
  exit 1
}

DRY_RUN=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage ;;
    *) ARGS+=("$a") ;;
  esac
done
[ "${#ARGS[@]}" -eq 2 ] || usage
BRIEF="${ARGS[0]}"
OUT_DIR="${ARGS[1]}"
[ -f "$BRIEF" ] || { echo "FATAL: brief not found: $BRIEF" >&2; exit 1; }

# ── node 22 PATH (the chain's supported runtime) ─────────────────────────────
if [ -x "$NODE22_BIN/node" ]; then
  export PATH="$NODE22_BIN:$PATH"
else
  echo "WARN: node@22 not found at $NODE22_BIN — falling back to $(command -v node || echo 'no node')" >&2
fi

# ── .venv liveness preflight (gate 37, checked BEFORE the run, not 45 min in) ─
VENV_PY="$REPO_DIR/.venv/bin/python"
preflight_venv() {
  if [ -L "$REPO_DIR/.venv" ]; then
    local tgt
    tgt="$(readlink "$REPO_DIR/.venv")"
    case "$tgt" in
      .venv|*/.venv) echo "FATAL: .venv is a SELF-REFERENTIAL symlink ($tgt) — the v51–v53 failure. Rebuild: /opt/homebrew/bin/python3.12 -m venv .venv && .venv/bin/pip install numpy scipy pandas fluids thermo chemicals ht CoolProp psychrolib control pvlib windpowerlib pybamm pandapower" >&2; return 1 ;;
    esac
  fi
  if [ ! -x "$VENV_PY" ]; then
    echo "FATAL: $VENV_PY missing/not executable — gate 37 would kill the run after the tool plan. Rebuild the venv (see comment above)." >&2
    return 1
  fi
  if ! "$VENV_PY" -c "import numpy" >/dev/null 2>&1; then
    echo "FATAL: .venv python cannot import numpy — every physics tool would die 'Python exit null' (gate 37). Reinstall the engineering set into .venv." >&2
    return 1
  fi
  echo "· .venv preflight OK: $("$VENV_PY" -V 2>&1) + numpy imports"
}

# ── VALIDATION ENV: full nets ON — force-UNSET every degrading skip ──────────
# (an inherited CHAIN_SKIP_* in the calling shell must not silently degrade a
#  validation run; that is exactly how v50–v55 shipped without gate 36)
UNSET_VARS=(
  CHAIN_SKIP_BENCHMARK_NET     # gate 36 — the market-sanity net MUST run
  CHAIN_SKIP_COST_SANITY       # gate 32 — independent £/output-unit net
  CHAIN_SKIP_TOOL_ARCHETYPE    # gate 34 — wrong-domain tool net
  CHAIN_SKIP_PART_REALITY_CHECK
)
# Recorded-but-policy-unchanged: benchmark (36) + drawing gates (35) RECORD on every
# validation run; their ENFORCING defaults follow the gate table (shadow stays shadow).
EXPORT_VARS=(
  "BENCHMARK_NET_FORCE=1"      # gate 36 runs even when QUALITY_LOOP_PHASE < 3
)

if [ "$DRY_RUN" -eq 1 ]; then
  echo "== DRY RUN — nothing will execute =="
  echo "cd $REPO_DIR"
  echo "PATH prepend: $NODE22_BIN"
  echo ".venv preflight: would check $VENV_PY (exists, not self-referential, imports numpy)"
  for v in "${UNSET_VARS[@]}"; do echo "unset $v"; done
  for kv in "${EXPORT_VARS[@]}"; do echo "export $kv"; done
  echo "npx tsx scripts/serial-design-chain-v2.tsx $BRIEF $OUT_DIR"
  echo "== THE RULE: iteration runs may skip nets; VALIDATION runs NEVER. =="
  exit 0
fi

cd "$REPO_DIR"
preflight_venv

for v in "${UNSET_VARS[@]}"; do unset "$v" || true; done
for kv in "${EXPORT_VARS[@]}"; do export "${kv?}"; done

echo "· validation run: benchmark net FORCED ON (BENCHMARK_NET_FORCE=1), no CHAIN_SKIP_* nets, node $(node -v)"
echo "· brief: $BRIEF"
echo "· out:   $OUT_DIR"

exec npx tsx scripts/serial-design-chain-v2.tsx "$BRIEF" "$OUT_DIR"
