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
run "build-excel-export.py --selftest"        "$PY" scripts/build-excel-export.py --selftest
run "dossier_audit.py --selftest"            "$PY" scripts/lib/dossier_audit.py --selftest
run "dossier_repair.py --selftest"            "$PY" scripts/lib/dossier_repair.py --selftest
run "manifest_sight.py --selftest"            "$PY" scripts/lib/manifest_sight.py --selftest
run "render-vision rot-test (skip offline)"     "$PY" scripts/lib/render_vision_rot_test.py
run "emitter mis-pin guards"                      npx tsx scripts/lib/emitter-mispin-selftest.ts
run "render service-coherence guard"             "$PY" scripts/blender-universal/service_coherence_selftest.py
run "provenance.py --selftest"               "$PY" scripts/lib/provenance.py --selftest
run "deterministic_checks_lib.py --selftest"  "$PY" scripts/deterministic_checks_lib.py --selftest
run "drawing_gates.py --selftest"             "$PY" scripts/blender-universal/drawing_gates.py --selftest
# TOOL WRAPPERS — worked[] emission + one-mint kVA alignment + honest-absent cert cost (2026-07-03)
run "electrical_transformer_sizing --selftest" "$PY" scripts/lib/orchestrator/tools/python/electrical_transformer_sizing.py --selftest
run "control_systems_run --selftest"          "$PY" scripts/lib/orchestrator/tools/python/control_systems_run.py --selftest
run "regulatory_certification_cost --selftest" "$PY" scripts/lib/orchestrator/tools/python/regulatory_certification_cost.py --selftest
run "ga_massing.py --selftest"                "$PY" scripts/blender-universal/ga_massing.py --selftest
run "deterministic_layout --selftest"         "$PY" scripts/blender-universal/deterministic_layout.py --selftest
run "parts_ledger.py --selftest"              "$PY" scripts/blender-universal/parts_ledger.py --selftest
run "connection_ledger.py --selftest"         "$PY" scripts/blender-universal/connection_ledger.py --selftest
# NEW-ARCHETYPE PRE-FLIGHT auditor (docs/ARCHETYPE-CAMPAIGN-PLAYBOOK.md §pre-flight; wired
# into run-validation.sh) — proves every detector fires on a planted defect AND stays silent
# on a clean fixture, and that every scraped lexicon still loads from its live source file.
run "archetype-preflight --selftest"          "$PY" scripts/archetype-preflight.py --selftest
run "endpoint-resolution proveCatch"          "$PY" scripts/blender-universal/endpoint_resolution_test.py
run "derive-topology.ts --selftest"           npx tsx scripts/lib/orchestrator/generic/derive-topology.ts --selftest
run "pump-motor --selftest"                   npx tsx scripts/lib/orchestrator/generic/pump-motor-selftest.ts
run "drive-duty --selftest"                   npx tsx scripts/lib/orchestrator/generic/drive-duty-selftest.ts
run "instrument-sizing --selftest"            npx tsx scripts/lib/orchestrator/generic/instrument-sizing-selftest.ts
run "storage-aggregate --selftest"            npx tsx scripts/lib/orchestrator/generic/storage-aggregate-selftest.ts
run "count-match --selftest"                  npx tsx scripts/lib/orchestrator/generic/count-match-selftest.ts
run "unit-coercion --selftest (prove-catch)"  npx tsx scripts/lib/orchestrator/generic/unit-coercion.ts --selftest
run "numeric-drift-matcher --selftest"       npx tsx scripts/lib/numeric-drift-matcher-selftest.ts
run "population-count --selftest"             npx tsx scripts/lib/orchestrator/generic/population-count-selftest.ts
run "subassembly-class --selftest"           npx tsx scripts/lib/orchestrator/generic/subassembly-class-selftest.ts
run "pump-capacity --selftest"               npx tsx scripts/lib/orchestrator/generic/pump-capacity-selftest.ts
run "zoned-distribution --selftest"          npx tsx scripts/lib/orchestrator/generic/zoned-distribution-selftest.ts
run "motorless-duplicate --selftest"         npx tsx scripts/lib/orchestrator/generic/motorless-duplicate-selftest.ts
run "principal-dedup --selftest"             npx tsx scripts/lib/orchestrator/generic/principal-dedup-selftest.ts
run "provenance-trace --selftest"            npx tsx scripts/lib/orchestrator/generic/provenance-trace.ts --selftest
run "brief-storage-hold --selftest"           npx tsx scripts/lib/orchestrator/brief-storage-hold-selftest.ts
run "benchmark-expectation.ts --selftest"     npx tsx scripts/lib/benchmark-expectation.ts --selftest
run "sweet-spot.ts --selftest"                npx tsx scripts/lib/sweet-spot.ts --selftest
run "design-to-target.ts --selftest"          npx tsx scripts/lib/design-to-target.ts --selftest
run "scenario-planning.ts --selftest"         npx tsx scripts/lib/scenario-planning.ts --selftest
# PROVE-THE-CATCH: every registered gate must catch its own adversarial input (intent, not just
# existence). A gate that can no longer block the exact failure it exists to catch fails here.
run "gate-registry --selftest (prove-catch)"  npx tsx scripts/lib/gate-registry.ts --selftest
# VERIFY-BEFORE-WRITEBACK: an LLM-web spec/standard/product is persisted only with real evidence
# (authoritative URL + an excerpt that supports the value) — a hallucinated value is rejected.
run "web-extraction-verify --selftest"        npx tsx src/lib/pdf-engine-v2/lib/knowledge/web-extraction-verify.ts --selftest

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
