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
run "excel_closure_blocks.py --selftest"      "$PY" scripts/lib/excel_closure_blocks.py --selftest
run "homologation_honesty.py --selftest"      "$PY" scripts/lib/homologation_honesty.py --selftest
run "physics_plausibility.py --selftest"      "$PY" scripts/lib/physics_plausibility.py --selftest
run "fe_iron_loss_writeback.py --selftest"    "$PY" scripts/lib/fe_iron_loss_writeback.py --selftest
run "stator_thermal_chain.py --selftest"      "$PY" scripts/lib/stator_thermal_chain.py --selftest
run "magnet_margin_sensitivity --selftest"    "$PY" scripts/lib/magnet_margin_sensitivity.py --selftest
run "dec_em1_option_screen --selftest"        "$PY" scripts/lib/dec_em1_option_screen.py --selftest
run "check_falsifiability_audit --selftest"   "$PY" scripts/lib/check_falsifiability_audit.py --selftest
run "check_bar_b_register_freshness --selftest" "$PY" scripts/lib/check_bar_b_register_freshness.py --selftest
run "check_store_divergence --selftest"    "$PY" scripts/lib/check_store_divergence.py --selftest
run "check_escalation_stub_freshness --selftest" "$PY" scripts/lib/check_escalation_stub_freshness.py --selftest
run "check_detached_geometry --selftest" "$PY" scripts/lib/check_detached_geometry.py --selftest
run "dossier_audit.py --selftest"            "$PY" scripts/lib/dossier_audit.py --selftest
run "dossier_repair.py --selftest"            "$PY" scripts/lib/dossier_repair.py --selftest
run "manifest_sight.py --selftest"            "$PY" scripts/lib/manifest_sight.py --selftest
run "render-image-quality --selftest"            "$PY" scripts/lib/render_image_quality.py --selftest
run "render-vision critic --selftest"           "$PY" scripts/lib/render_vision_critic.py --selftest
run "render-vision rot-test (skip offline)"     "$PY" scripts/lib/render_vision_rot_test.py
# AgX-first view transform (the pale-wash bug that bit twice): product renders MUST prefer AgX,
# never default to Standard (no highlight roll-off → light body + studio bloom to near-white).
run "render AgX-first view-transform guard"       "$PY" scripts/blender-universal/render_view_transform_selftest.py
run "emitter mis-pin guards"                      npx tsx scripts/lib/emitter-mispin-selftest.ts
run "reference-anchor F1c device-scale guard"     npx tsx scripts/enrich-state-with-reference-anchor.tsx --selftest
run "F1f design-scale-tier (identity lock)"       npx tsx scripts/lib/orchestrator/generic/design-scale-tier-selftest.ts
run "F1f Layer1 hard scale-veto (relevance)"      npx tsx scripts/lib/orchestrator/generic/f1f-scale-veto-selftest.ts
run "instrument-proxy F1b device-scale geometry"  "$PY" scripts/blender-universal/instrument_proxy_selftest.py
run "main-incomer F1d device-scale electrical"    npx tsx scripts/lib/orchestrator/generic/main-incomer-selftest.ts
run "device-commodity price ceilings (est-default)" npx tsx scripts/estimate-missing-prices.tsx --selftest
run "strip-unverified pv-consistency (R1 F3/F4)"    npx tsx scripts/lib/strip-unverified-pv-consistency-selftest.ts
run "re-open mispin resolve (F3 pump→real pump)"    npx tsx scripts/lib/reopen-mispin-resolve-selftest.ts
run "gate-25 brief-literal scanner (mains vs £)"  npx tsx scripts/lib/brief-value-literal-scanner.ts --selftest
run "interconnect F1e device-scale tubing"        "$PY" scripts/blender-universal/interconnect_device_scale_selftest.py
run "F1a cartridge-heater homonym guard"          npx tsx scripts/lib/orchestrator/generic/f1a-cartridge-heater-selftest.ts
run "F1a OV/UV electrical vs UV disinfection"     npx tsx scripts/lib/orchestrator/generic/f1a-ov-uv-electrical-selftest.ts
run "render service-coherence guard"             "$PY" scripts/blender-universal/service_coherence_selftest.py
run "B4 lab_electronics signature split"          "$PY" scripts/blender-universal/lab_electronics_signature_selftest.py
run "LE handheld-cue form-gate (vial_bioreactor)" "$PY" scripts/blender-universal/le_handheld_cue_gating_selftest.py
run "interior_pack stacked/single-layer pack"    "$PY" scripts/blender-universal/interior_pack.py --selftest
run "interior_geometry function->mesh library"   "$PY" scripts/blender-universal/interior_geometry.py --selftest
run "power_subsystem universal load-sized power"  "$PY" scripts/lib/power_subsystem.py --selftest
run "provenance.py --selftest"               "$PY" scripts/lib/provenance.py --selftest
# EXCEL-STRICT OOXML validator (2026-07-05) — catches the class of defect LibreOffice
# (our only prior verifier) silently tolerates: Tristan opened bess-campaign-v3's
# dossier.xlsx in real Excel for Mac and got a "we found a problem with some content"
# repair prompt. proveCatch: a synthetic fixture reproducing the LibreOffice-recalc
# duplicate-VML-id defect (byte-identical pattern to the real BESS + Codema output)
# must fire HIGH; a clean fixture must be silent.
run "ooxml_strict_check.py --selftest"       "$PY" scripts/lib/ooxml_strict_check.py --selftest
run "deterministic_checks_lib.py --selftest"  "$PY" scripts/deterministic_checks_lib.py --selftest
run "P9 instrument direct logical routing"    "$PY" scripts/blender-universal/instrument_direct_routing_selftest.py
run "growing_db_freshness.py --selftest"      "$PY" scripts/lib/growing_db_freshness.py --selftest
run "prove_growing_db_loop.py (A8)"           "$PY" scripts/ingest/prove_growing_db_loop.py
run "functional_form.py --selftest (B2)"      "$PY" scripts/lib/functional_form.py --selftest
run "drawing_gates.py --selftest"             "$PY" scripts/blender-universal/drawing_gates.py --selftest
run "draw_pid.py --selftest (T-23/T-03)"      "$PY" scripts/blender-universal/draw_pid.py --selftest
run "draw_process_schedules_test (T-09)"      "$PY" scripts/blender-universal/draw_process_schedules_test.py
run "draw_single_line.py --selftest"          "$PY" scripts/blender-universal/draw_single_line.py --selftest
run "draw_hvac.py --selftest (T-10)"          "$PY" scripts/blender-universal/draw_hvac.py --selftest
run "test_derive_flows.py"                    "$PY" scripts/blender-universal/test_derive_flows.py
run "process-equipment-cost --selftest (T-16)" npx tsx scripts/lib/cost/process-equipment-cost.ts --selftest
run "build-cost-basis.test (T-14 how_to_verify)" npx tsx scripts/lib/cost/build-cost-basis.test.tsx
run "draw_ga.py --selftest (T-27)"            "$PY" scripts/blender-universal/draw_ga.py --selftest
run "draw_distribution_interface --selftest"  "$PY" scripts/blender-universal/draw_distribution_interface.py --selftest
run "draw_facility_layout --selftest"         "$PY" scripts/blender-universal/draw_facility_layout.py --selftest
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
run "gimbal-actuation --selftest"             npx tsx scripts/lib/orchestrator/generic/gimbal-actuation-selftest.ts
run "storage-aggregate --selftest"            npx tsx scripts/lib/orchestrator/generic/storage-aggregate-selftest.ts
run "membrane-stage-brief-gate --selftest"    npx tsx scripts/lib/orchestrator/generic/membrane-stage-brief-gate-selftest.ts
run "ion-exchange-brief-gate --selftest"      npx tsx scripts/lib/orchestrator/generic/ion-exchange-brief-gate-selftest.ts
run "nursery-reservoir-volume --selftest"     npx tsx scripts/lib/orchestrator/generic/nursery-reservoir-volume-selftest.ts
run "civils-scope --selftest (T-06)"          npx tsx scripts/lib/orchestrator/generic/civils-scope-selftest.ts
run "pump-unit-skid --selftest (T-22)"        npx tsx scripts/lib/orchestrator/generic/pump-unit-skid-selftest.ts
run "recovery-oxygen-dosing --selftest"      npx tsx scripts/lib/orchestrator/generic/recovery-oxygen-dosing-selftest.ts
run "count-match --selftest"                  npx tsx scripts/lib/orchestrator/generic/count-match-selftest.ts
run "brief-scale-seed --selftest"             npx tsx scripts/lib/orchestrator/generic/brief-scale-seed-selftest.ts
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
run "structural-admission-gate --selftest"  npx tsx scripts/lib/structural-admission-gate.ts --selftest
run "design-closure-gate --selftest"        npx tsx scripts/lib/design-closure-gate.ts --selftest
# PCB firmware honesty doctrine (Anvil SSOT — not LLM memory / docs alone).
# proveCatch: contract JSON loads; tier≥3 never FUNCTIONALLY VERIFIED; state prefer path.
run "pcb-firmware-honesty.py --selftest"      "$PY" scripts/lib/pcb_firmware_honesty.py --selftest
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
