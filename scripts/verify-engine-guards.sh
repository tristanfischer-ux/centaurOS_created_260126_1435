#!/bin/bash
#
# verify-engine-guards.sh — DETERMINISTIC enforcement of the engine's regression guards
# (Tristan 2026-06-24: "it needs to be in the actual code that executes the project as a
# deterministic set, not hoping that CLAUDE.md will look at the line and fix it").
#
# The CORE FIX PRINCIPLE (fix the source rule, never the symptom; every fix carries a guard)
# is only real if the guards are RUN and BLOCK on failure — not left to an agent to remember.
# This runs every engine --selftest (the rule-level guards where pricing/sizing/contract fixes
# land) and, when a snapshot is available, the no-render universal regression harness. It exits
# NON-ZERO on the first failure, so a regression cannot be committed/pushed. Wired into
# .husky/pre-push. No PDFs are produced (REGRESSION_NO_RENDER=1 — the harness renders otherwise).
#
# Usage:  bash scripts/verify-engine-guards.sh [--with-harness <snapshot-state.json>]
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2

PY=".venv/bin/python"; [ -x "$PY" ] || PY="python3"
RED='\033[0;31m'; GREEN='\033[0;32m'; YEL='\033[0;33m'; NC='\033[0m'
FAILED=0
run() {  # run <label> <command...>
  local label="$1"; shift
  printf "  → %-46s" "$label"
  if out=$("$@" 2>&1); then
    # a --selftest is only a PASS if it actually says so (a crash that prints nothing must FAIL)
    if echo "$out" | grep -qiE "selftest:? OK|self-test:? passed|all invariants hold|OVERALL: .*passed|_selftest passed|: OK$"; then
      printf "${GREEN}PASS${NC}\n"
    else
      printf "${YEL}RAN (no explicit OK marker — check)${NC}\n"
    fi
  else
    printf "${RED}FAIL${NC}\n"
    echo "$out" | tail -8 | sed 's/^/      /'
    FAILED=1
  fi
}

echo ""
echo "━━━ Engine regression guards (deterministic; blocks a regression) ━━━"

# ── the RULE-LEVEL guards (no snapshot needed — these cover the pricing/sizing/contract rules
#    where source-rule fixes land; this is the deterministic enforcement of the CORE FIX PRINCIPLE)
run "requirements_bom.py --selftest"          "$PY" scripts/requirements_bom.py --selftest
run "deterministic_checks_lib.py --selftest"  "$PY" scripts/deterministic_checks_lib.py --selftest
run "drawing_gates.py --selftest"             "$PY" scripts/blender-universal/drawing_gates.py --selftest
run "benchmark-expectation.ts --selftest"     npx tsx scripts/lib/benchmark-expectation.ts --selftest
run "sweet-spot.ts --selftest"                npx tsx scripts/lib/sweet-spot.ts --selftest
run "design-to-target.ts --selftest"          npx tsx scripts/lib/design-to-target.ts --selftest
run "scenario-planning.ts --selftest"         npx tsx scripts/lib/scenario-planning.ts --selftest
# PROVE-THE-CATCH: every registered gate must catch its own adversarial input (intent, not just
# existence). A gate that can no longer block the exact failure it exists to catch fails here.
run "gate-registry --selftest (prove-catch)"  npx tsx scripts/lib/gate-registry.ts --selftest

# ── the UNIVERSAL regression harness (pure invariants incl. benchmark_net + requirements_bom
#    selftest), against an EXPLICIT complete snapshot only. NO PDF (REGRESSION_NO_RENDER=1).
#    Opt-in (--with-harness <state.json>): never auto-pick out/*/state.json — an in-progress run
#    writes a PARTIAL state that fails invariants spuriously. The rule-level --selftests above are
#    the always-on deterministic guard; the harness is the deeper, snapshot-bound check.
SNAP=""; [ "${1:-}" = "--with-harness" ] && SNAP="${2:-}"
if [ -n "$SNAP" ] && [ -f "$SNAP" ]; then
  printf "  → %-46s" "regression-harness (no-render) $(basename "$(dirname "$SNAP")")"
  # capture output regardless of exit code (the harness exits 1 on ANY fail), then count [FAIL]
  out=$(REGRESSION_NO_RENDER=1 npx tsx scripts/regression-harness.tsx --snapshot="$SNAP" 2>&1)
  if echo "$out" | grep -q "OVERALL:"; then
    fails=$(echo "$out" | grep -cE "^[[:space:]]*\[FAIL\]")
    if [ "$fails" -gt 0 ]; then
      printf "${RED}FAIL (%s)${NC}\n" "$fails"; echo "$out" | grep -E "\[FAIL\]" | head -8 | sed 's/^/      /'; FAILED=1
    else
      printf "${GREEN}PASS${NC}\n"
    fi
  else
    printf "${RED}FAIL (harness did not complete)${NC}\n"; echo "$out" | tail -8 | sed 's/^/      /'; FAILED=1
  fi
else
  printf "  → %-46s${YEL}SKIP (pass --with-harness <complete state.json>)${NC}\n" "regression-harness (no-render)"
fi

echo ""
if [ "$FAILED" -ne 0 ]; then
  echo -e "${RED}✗ Engine guards FAILED — a source rule regressed. Fix the rule (not the symptom) before landing.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Engine guards passed.${NC}"
