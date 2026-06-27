# LOOP-TRACKER — THE ONE master tracker for ForgeOS dossier-≥8 work

> Tristan 2026-06-26: ONE tracker. No duplicates. This is it. All others are archived (`docs/archive/trackers/`)
> or are reference-only: `OPERATING-FRAME-2026-06.md` (why + self-prompt + SIGHT), `REVIEW-PUNCHLIST-2026-06-27.md`
> (verbatim tab review). Work the MASTER CHECKLIST top-down; update status in place; the RESUME blocks below
> are the running detail log.


═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-26 v10 — 11/16 DATA tabs ≥8; 5 FAIL, ALL precisely diagnosed)
═══════════════════════════════════════════════════════════════════════════════
Fresh v10 (all accumulated fixes). 11/16 data tabs ≥8 (Line&velocity/Panel/Process/Assembly now 10 —
the canonical-manifest fix made data surfaces coherent). 5 FAIL, root causes from brief ground-truth
(briefs-loop/fischer_farms_codema.md):
1. Exec Summary 0 + Risk 6 — WATER SIZING vs brief:
   • irrigation_pump_flow_m3_h = 12 but irrigation_demand_m3_h = 90 (brief: 2 depts × 45) → pump UNDER its
     OWN declared demand. FIX: pump flow = max(computed, irrigation_demand_m3_h). [source: irrigation pump sizing]
   • storage: brief water_storage_capacity = 120 (3 tanks × 40); compared metric reads
     fresh_water_storage_capacity = 40 (ONE tank). total_water_storage_volume_m3 = 261.6 exists. FIX: the
     brief-target comparison must use the TOTAL (count×each / total_*), not the per-unit quantity.
   • fertigation: brief 90 (2 units × 45); compared reads fertigation_dosing_pump_throughput = 45 (per unit).
     Same per-unit-vs-total mismatch.
   • drain_water_tank = 64.8 each vs brief 40 — buffer-sizing consumptive model over-sizes (no reclaim term).
2. BoM 2 — (a) P&ID 0/44 + BFD 0/20 EMPTY generators (Stage 3 build-out #101); (b) duplicate tag 'X-123'×2.
3. Connection trace 2 — process-parts fluid-in+out coverage + ledger-completeness invariants.
4. Overview 6 — 6/290 invariants FAIL (BoM P-105 emitted-kW mismatch + 5 more).
CORE INSIGHT: brief targets are PLANT TOTALS; design quantities are PER-UNIT (N tanks / 2 depts / 2 units).
The brief-target comparison + several metrics must aggregate count×per-unit. + irrigation pump genuinely
under-sized. SIGHT: manifest divergence STILL flags _loop vs root (early settle-loop vs final placement) —
the snapshot/restore fixed the DATA surfaces but root≠_loop persists (render-PNG freeze still open).
NEXT: (1) irrigation pump = demand; (2) brief-target comparison uses totals; (3) drain reclaim; (4) P&ID/BFD
generators; (5) dup-tag X-123; then re-run v11 + re-score. Each needs a fresh chain run to verify.


═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-26 v13 — gate-34 irrigation-drop FIXED; pump now an AUTO-PLANNER input-mapping bug)
═══════════════════════════════════════════════════════════════════════════════
v13 = 11/16 data tabs ≥8 (same as v12). LANDED + CONFIRMED: storage total 120, fertigation total 90 (the
brief-named-total contract quantities). gate-34 fix LANDED: irrigation:pump-sizing is NO LONGER dropped
(no drop_wrong_domain in v13 actions; provenance shows the tool RAN) — a genuine universal bug fixed
(isIrrigationClass added + guarded, harness c2).
BUT irrigation_pump_flow_m3_h is STILL 12 vs demand 90. PRECISE ROOT (v13 provenance): the kept tool is the
AUTO-PLANNER BOOTSTRAP (tool_version:"bootstrap"), NOT the registered vertical-farm class-plan — so my
vertical-farm.ts input_from_contract edit (passing the demand) is DEAD for water_treatment. The auto-planner
mapped total_emitters=6000 (→ 6000×2L/h = 12 m³/h) into the tool but did NOT pass irrigation_demand_m3_h=90,
even though it IS a declared input_key (tool-io-manifest). NEXT (the precise fix): make the auto-planner
bootstrap MAP irrigation_demand_m3_h/peak_flow_m3_h from the contract into the tool payload (the tool ALREADY
floors to it — unit-verified: demand 90 → pump 90.0). Find where composeToolGraph/bootstrap builds the tool
input payload + ensure declared demand input_keys present in the contract are passed. ALTERNATIVELY: brief-pin
irrigation_pump_flow to the demand so the executor 'brief is ground truth' directional guard (MUST_MEET
flow_rate, under-size→restore) lifts it post-tool — but irrigation_pump_flow_m3_h ends _flow_m3_h → synth
trigger (universal-contract-sizing:112), so guard against minting a phantom pump.
REMAINING 5 FAILS unchanged: Exec (irrigation 12 + fertigation-matcher + hand_watering), BoM (P&ID/BFD empty
generators + dup-tag X-123), Connection-trace, Overview (6/290 invariants), Risk.


═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-26 v14 — DESIGN NOW MEETS THE BRIEF; remaining Exec = #86 matcher non-determinism)
═══════════════════════════════════════════════════════════════════════════════
v14 = 11/16 data tabs ≥8. THE SIZING IS NOW CORRECT (real, not faked): irrigation_pump_flow 90 (=demand,
auto-wire fix LANDED), water_storage 120 (3×40), fertigation 90 (2×45). Three distinct UNIVERSAL bugs fixed
this session to get here: (1) brief-named TOTAL contract quantities (per-unit→plant-total); (2) gate-34
isIrrigationClass (was dropping irrigation tools on an irrigation plant); (3) auto-planner DECLARED-INPUT
COMPLETION (LLM omitted the demand input → pump fell to emitter-sum 12; now deterministically wired).
REMAINING Exec Summary 0 is NO LONGER under-sizing — it is the #86 COMPLIANCE-MATCHER / BRIEF-PARSE
NON-DETERMINISM: the brief parser NAMES the same requirement differently each run
(max_irrigation_demand_m3_per_hr ↔ max_irrigation_demand_per_department; fertigation_dosing_capacity_m3_per_hr
↔ fertigation_dosing_capacity), so the compliance check can't bind the CORRECT achieved quantity (pump 90,
fert 90) to the wandering brief-metric name → reports UNVERIFIED/FAIL despite the design being right. Also
hand_watering_capacity has no emitted total (brief 25 m³/h @3 bar → emit hand_watering_capacity_m3_per_hr =
handWaterM3H). HIGHEST-LEVERAGE NEXT = #86: make the compliance matcher bind a brief metric to an achieved
quantity by SEMANTIC FAMILY + UNIT (irrigation-flow ↔ irrigation_demand/pump_flow) robust to the name
variation, OR make the brief parser emit DETERMINISTIC metric keys. This single fix should clear Exec + much
of Risk. THEN: P&ID/BFD empty generators (BoM), connection-trace fluid-in+out + ledger-completeness, Overview
6/290 invariants. (Risk now also has a NEW physics-critic note ON the correct 90 pump — verify it's not a
false flag on the now-right design.)


═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-26 v14 — 12/16 DATA TABS ≥8; design MEETS brief; remaining 4 = GENERATION layer)
═══════════════════════════════════════════════════════════════════════════════
MILESTONE: 12/16 data tabs genuine ≥8 (was 11; Exec Summary 0→≥8). The matcher fixes this session made the
ENGINE HONESTLY RECOGNISE that the design MEETS the brief (pump 90/storage 120/fert 90):
  • deterministic_checks_lib brief-target invariant: _ufam folds #86 unit-notation (m3/hr≡m³/h); never binds
    a dimensioned metric to a *_count; MEET-OR-EXCEED (≥) not equality → 7/7 brief targets PASS (was 4/7).
  • dossier_audit _contract_match Pass 4 SUBJECT-anchored: a met DEMAND named differently from its DELIVERY
    binds (irrigation 'demand' 45 ↔ delivered 'pump_flow' 90) → removed the last Exec false-UNVERIFIED.
  Both committed + selftest-green. These are SCORING-layer (apply to any state, verified OFFLINE on v14 —
  no chain run needed to iterate the matcher).
REMAINING 4 (all GENERATION-layer — need a chain run to verify, deeper engineering):
  • Connection trace 2 + Overview 6 (SAME 2 invariants): topology gap — only 18/27 process parts have BOTH a
    fluid IN and OUT in connection-schedule.json (66.7% < 80% threshold) + 3 parts missing a required
    connection. FIX: the connection-topology generator must wire every process part's inlet+outlet (OR, if
    terminal parts like a final drain legitimately have one side, relax the invariant for true terminals).
    Verify FIRST whether it's a real gap or terminal-part false-positive (offline: inspect connection-schedule).
  • BoM 6: P&ID 0/47 + BFD 0/21 EMPTY generators (#101 Stage-3 build-out — the dominant BoM blocker).
  • Risk 6: physics-critic HIGHs (X6) — incl. a NEW note on the now-correct 90 pump; verify not a false flag.
NEXT: (1) connection-topology in+out (offline-triage first); (2) P&ID/BFD generators; (3) Risk closure. The
SIZING + COMPLIANCE are DONE and honest — what's left is drawing/topology GENERATION + physics-critic closure.


═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-26 v14b — connectivity coverage FIXED; STRICT 3 = GENUINE topology gaps, do NOT exempt)
═══════════════════════════════════════════════════════════════════════════════
parts_ledger.py connectivity exemptions committed → process coverage 67%→94% PASS (Overview recovered;
Connection-trace 2→6). The STRICT 'Ledger completeness' check reads the Blender-authored
connection-ledger.json, which ALREADY had the nutrient/membrane/valve/sample exemptions (my parts_ledger
edit was the MIRROR that was missing — they now agree). v14's 3 remaining STRICT concerns are GENUINE
topology gaps, NOT false-positives — do NOT exempt them (an unconnected isolation valve IS a real gap;
gaming it would violate honest-scoring):
  • Isolation Valves — missing BOTH fluid ties (0 connections): the topology placed them on no line.
  • Sample Valve 2 — missing fluid-connection (0 ties): not tapped onto its line.
  • Emergency Stop — missing its signal tie to the safety system.
FIX = the connection-TOPOLOGY generator (build_universal_scene route_topology / connection_ledger
finalize) must wire inline manual valves to the line they sit on + the E-stop to the safety relay. This
is GENERATION (chain-run-verified), the same family as the remaining BoM (P&ID/BFD emitters) + Risk
(physics-critic). The matcher/sizing/coverage SCORING work is DONE + honest (12/16 genuine ≥8; the design
meets the brief). What remains is 3 generation build-outs, each needing a fresh chain run:
  1. topology wiring of inline valves + E-stop (Connection-trace + Overview).
  2. P&ID/BFD emitters emit part tags (BoM).
  3. physics-critic HIGH closure + re-run (Risk).


═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-27 v15/v16 — RENDER LITTER + P&ID/BFD TOPOLOGY fixed UNIVERSALLY)
═══════════════════════════════════════════════════════════════════════════════
TWO universal fixes committed + verified this session (HEAD c20ab489a):
1. RENDER/GA LITTER (commit 61ccae24b) — extract_parts now drops GA non-massing parts
   (accessories/instruments/switchgear+panel internals/inline valves) from the 3D scene;
   they were all falling to one shared default box (manifest_sight LITTER). Single-sourced
   in scripts/blender-universal/ga_massing.py (is_ga_non_massing + --selftest proveCatch).
   VERIFIED IN REAL CHAIN: v15 parts-manifest 128→54 parts, 0 litter clusters, ratio 0.0.
   → the 8 render sheets + GA should leave 0 (were 0 from litter).
2. P&ID/BFD EMPTY (commit c20ab489a) — water_treatment (+ any unseen generic-path class)
   emitted NO contract.topology, so P&ID/BFD drew "nothing to draw" = 0. New
   deriveProcessTopology (scripts/lib/orchestrator/generic/derive-topology.ts) derives a
   feed→product spine from the synthesised principal equipment (role-rank ported from
   draw_bfd _ROLE_PATTERNS), wired in the chain after principal-equipment reconcile, FIRES
   ONLY when no hand-authored topology exists. Verified on v14 state: 15 nodes → 14 edges.
v16 = the clean run with BOTH fixes (in progress; out/fischer-codema-v16).

NEXT INCREMENT (Risk/physics-critic, #79/#99/#82) — PUMP MOTOR UNDERSIZED (skeleton critic
flagged on v15): Irrigation Pump 90 m³/h @ 3.5 bar is given only a ~2 kW drive motor + VSD.
ROOT (precise): scripts/lib/orchestrator/generic/universal-contract-sizing.ts `motorKw` (line
573) = max(1.5, (p.kw || p.m3h/120)/0.88). A FLOW-rated pump has p.kw=0 → collapses to the
floor 1.5 kW, IGNORING head entirely. The CORRECT value ALREADY EXISTS in the contract:
orchestratorContract.quantities.irrigation_pump_motor_kw = 9.653 kW (from tool:irrigation:
pump-sizing; siblings fertigation 7.5, drain 1.923 also present). UNIVERSAL FIX = consume the
contract: thread quantities into explodeEquipmentSubAssemblies (line 712; call site sets
readParentPhysics at 746) and, for a pump parent, inject its stem-matched `*_motor_kw`/
`*_power_kw` into ParentPhysics.kw so the Drive Motor + VSD derive (lines 627-628) read the
real hydraulic figure. Reusable formula if needed: process_pump_sizing.py (P=ρgQH/η). ALL
pumps on ALL archetypes flow through motorKw → one fix covers everything. Guard: extend
test-universal-sizing or add a selftest asserting a 90 m³/h pump → motor ≈ contract value.
ALSO (#13-class part mis-pin): the irrigation pump is pinned "Grundfos CM3-3" (~3 m³/h unit)
for a 90 m³/h duty — absurdly undersized part SELECTION (separate from the motor kW); a
90 m³/h @ 3.5 bar duty wants a big end-suction/multistage pump, not a CM-series. Route to the
pump part-selection rule.


═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-27 — THREE universal fixes committed; v16 confirming, motor → v17)
═══════════════════════════════════════════════════════════════════════════════
THREE universal+guarded fixes landed this session:
  1. RENDER/GA LITTER — 61ccae24b (ga_massing.py). VERIFIED real chain v15: 128→54 parts, 0 litter.
  2. P&ID/BFD TOPOLOGY — c20ab489a (derive-topology.ts). CONFIRMED FIRING in real chain v16 log
     ("derived process topology" ×1). Derives feed→product spine from synthesised equipment.
  3. PUMP MOTOR kW — e0ad4f1a9 (universal-contract-sizing motorKwOverride). Offline-verified:
     irrigation pump 2→10 kW (binds contract 9.653). NOT in v16 (committed after launch) → v17.
All three have a proveCatch selftest in verify-engine-guards.sh (ga_massing / derive-topology /
pump-motor). v16 = render+topology clean run (in progress, out/fischer-codema-v16).

OBSERVATIONS from v16 (for later):
  • BLENDER_UNIVERSAL_FALLBACK: water_treatment has NO bespoke -9shot template → renders use the
    GENERIC universal scene (dark CAD). Litter fix removes the part-vomit so the DETERMINISTIC
    render score (coverage+litter+divergence) should clear, but a bespoke water template would be
    the "wow" visual upgrade (big build — Tristan call). See [[forgeos_two_render_engines_bespoke_vs_universal]].
  • Skeleton critic (advisory) flagged: "Total Water Storage" 262 m³ aggregate vs brief's 3×40
    split (storage representation), + the now-fixed pump-motor. Re-check on v17.
NEXT: (1) let v16 finish → read tab-scorecard.json: confirm 8 renders + GA + P&ID + BFD leave 0.
(2) launch v17 (adds motor fix) → re-score. (3) remaining: divergence (render-PNG freeze, if still
flagged), Financial capex frame (#57), storage 3×40 split, ⚠Checks/⚠Audit (derived — fall as rest clear).

═══════════════════════════════════════════════════════════════════════════════
## ★ MASTER CHECKLIST — every must-do for a genuine ≥8-on-EVERY-tab dossier
═══════════════════════════════════════════════════════════════════════════════
`[x]` done+guarded · `[~]` partial (SIGHT/sub-item done, SOURCE fix pending) · `[ ]` not started.
EVERY fix UNIVERSAL (keyed on a signal, no archetype table) + PERMANENT (`--selftest`/proveCatch guard).

STAGE 0 — Honest + TOTAL scorer (PRECONDITION)
  [x] X1 banner+score on every sheet · [x] ship gate spans full workbook · [x] X2 Overview/Conn honest
  [x] ⚠Checks by invariant pass-rate · [x] Financial gate-FAIL when economics UNVERIFIED
  [x] F1 banner RE-STAMP (every banner re-stamped from FINAL scores; Financial 10→6 FAIL) · [x] guard: banner reflects score (selftest 5)
STAGE 0.5 — SIGHT: audit the DELIVERED artefact, not state.json
  [x] render LITTER (`manifest_sight.py`, caps render/GA; v9 47%→0/FAIL) — SOURCE fix = Stage 3
  [~] shared-layout DIVERGENCE: detector DONE; SOURCE fix DONE for DATA surfaces (snapshot/restore canonical manifest across render passes so GA+parts_ledger+BoM+Line&velocity read ONE placement; render-PNG visual-match = residual freeze) — verify on v10
  [ ] bbox-containment (N/A this archetype: no envelope) · [ ] Excel cell-reader
  [ ] vision critic (adversarial, proveCatch on littered render) · [ ] render-then-reingest wiring
STAGE 1 — Provenance spine (= X4, highest-leverage build-out)
  [ ] every number carries WHERE-FROM + WHERE-TO as data · [ ] orphan-number check
  [ ] CW1 cost-waterfall traces to BoM · [ ] IA2 inputs from brief · [ ] CA3/Q1/B3 flow · [ ] CA2 used/unused
STAGE 2 — Close the risk loop (X6/R1)
  [ ] HIGH physics finding → correction + re-run · [ ] Risk score reflects CLOSURE (guard: unclosed HIGH FAILs)
STAGE 3 — Drawing-content build-outs (SOURCE generators)
  [ ] P&ID generator (EMPTY→tagged loops, #101) · [ ] BFD generator (EMPTY, #101)
  [ ] geometry generator derives REAL per-part dims (SOURCE of the litter) · [ ] ONE layout → GA-top+render-top (#100)
  [ ] isometrics 201/202/203 distinct (#101) · [ ] single-line/HVAC verified
STAGE 4 — Class-appropriate economics (F1)
  [x] F2 feedstock N/A · [ ] capex/opex/payback frame for infrastructure · [ ] no phantom revenue + banner reflects it
  [ ] guard: economics-model-matches-class (feedstock-on-water + hardcoded-waterfall both FAIL)
STAGE 5 — Universal tags + verification coverage
  [x] X3 tab order · [x] B1 BoM key-inputs/factors · [~] B2 child rows · [x] CH2 ⚠Checks alignment
  [x] LV1/X5 Line&velocity rows carry the canonical line tag (201-WT-DN15, joined from route-manifest) · [ ] PS1/Panel/Assembly checks
  [x] AU2 benchmark-net (LLM top-down vs engine bottom-up + ratio + verdict) rendered in ⚠Audit · [ ] Brief verbatim (#60)

RECOVERED (2026-06-26, mined from ALL ~117 old trackers by 4 agents → docs/RECOVERED-TRACKER-ITEMS-2026-06.md).
Still-open recurring ARCHITECTURE items past councils flagged — fold into the stages above:
  ★ [1/3 THE BIG ONE] ONE CANONICAL LEDGER — assemble `state.ledger` ONCE; BoM/P&ID/single-line/narrative/cost/
    drawings are READ-ONLY projections of it (kills the multi-pricing-engine / multi-material-resolver / multi-
    load-list drift = "the render shows a stale value the ledger already fixed"). CAVEAT (load-bearing): a single
    ledger DESTROYS the cross-surface error detectors (gates 5/11/12/18 diff two independent values) → ADD
    absolute-plausibility gates + a gate-32/benchmark re-derive on a path the ledger does NOT feed BEFORE unifying.
    [LEDGER-FIX-PLAN, ANVIL-UNIVERSAL-TRACKER]
  [loop] THE DESIGN LOOP must run ≥3×: tools→Blender→drawings "does this make sense?"→discover next tool→back to
    tools; BoM/cost only AFTER it settles + geometry feeds BACK into sizing (today BoM/cost run BEFORE Blender
    convergence, so measured run-lengths + converged loads never reach the dossier) [ENGINE-FIX-PLAN, UNIVERSAL-DESIGN-LOOP-DESIGN]
  [1 SIZING WALL] `applyFamilySizing` is a NO-OP — execute the super-brief governing equations BEFORE grounding
    parts (the £34k-for-£8M sizing wall; the lone blocker to a ≥8 sizing tab) [UNIVERSAL-ENGINE-SUPERBRIEF-PLAN]
  [1 provenance] per-line cost_basis {method,inputs,unit_rate+cepci_year,correlation_ref,factors,estimate_class,
    confidence} (~6% sourced today); every tool returns {value,source,uncertainty}; every prose number traces to a
    contract field; keysMatch key on (base_key,basis) NOT ≥8-char substring (it fuses dc/ac siblings) [CO2-COST-AUDIT, ITER9, wall2-council]
  [0 honest] distinguish DERIVED from ASSUMED-BUT-COHERENT — "internal coherence fooled the physics critic"; a
    self-consistent HARD-CODED number must NOT score as a verified one [OXCCU-SAF-REVIEW, PLAN-deterministic-generation]
  [2] deterministic repair: on a sizing-gate fail the emitter RE-DERIVES the part from the failed constraint (≤2),
    never an LLM swap (anti-band-aid = CORE FIX PRINCIPLE) [PLAN-deterministic-generation]
  [2] promote SWALLOWED warnings to visible FAILs: convergence-not-reached (ships iter-N as "converged"),
    keyMetrics=null reaching reviewers Stages 15-25 (only set at 32) [IMPROVEMENT_PLAN, AUDIT_TRACE]
  [2 gates] requirement-coverage fail-closed (brief-required subsystem absent = FAIL, #84); +closedFluidLoopHasHeatRejection,
    +partNumberCapacityVsModel (model-suffix capacity, ZR18K=5.27kW≠18); activate gates that silently skip when the
    Generator omits their derived_parameters field [HAPS-AUTOPLANNER, ITER9-RED-TEAM]
  [3] real per-feeder electrical loads (single-line shows 0.0A; no fake total÷N) + ONE per-equipment load list so
    the panel total == contract BY CONSTRUCTION (load_reconcile is green-by-luck) [ENGINE-FIX-PLAN, LEDGER-FIX-PLAN]
  [3] over-decomposition: BoM ~6× too many lines vs reference density (~40 heat-pump/~100 BESS) — inflates cost +
    hides per-line absurdity; collapse fixings to one "sundries" line [PLAN-2026-05-17]
  [3/0.5] design-to-envelope fit-audit: force the design into its stated envelope (e.g. 40ft hi-cube), cross-check
    CAD bbox vs contract vs mass — "the most powerful sizing-bug detector" (a SIGHT artefact-read) [DESIGN-TO-ENVELOPE-PLAN]
  [3] layout-revealed-needs: after each Blender pass add tools the geometry reveals (long run→booster pump, wide
    span→support steel, hot line→trace-heat) [UNIVERSAL-DESIGN-LOOP-DESIGN]
  [4] payback=0 is a bug; re-base economics on ACHIEVED installed capex (floored by the bottom-up BoM); Towler/Turton
    C_e=a+b·S^n CEPCI-indexed correlations + Lang factors, labelled HONESTLY as AACE Class-4 ±30% (never ±10%) [CO2-COST-AUDIT, SCENARIO-PLANNING-PLAN, OXCCU-SAF-REVIEW]
  [NEW] self-learning DB never grows: class-ref reads BAKED 2026-05-18 snapshots; writebackDiscoveredNode/Edge have
    ZERO callers; no web-on-miss topology discovery for unseen classes [UNIVERSAL-ENGINE-PLAN, FORGE-ENGINE-DB-AUDIT]
  [NEW scope] a brief with no physical BoM (pure software/data) must be REFUSED honestly, not faked through the gates [SPACE-SECTOR-ROADMAP]

EXIT: (1) honest scorecard ≥8 on all 37 sheets, gate exits 0 (UNVERIFIED=FAIL); (2) every check proves its
catch + no false-positive; (3) every number resolves up+down (zero orphans); (4) fresh skeptic pass finds
nothing; (5) benchmark net (top-down) agrees with engine (bottom-up) within band.
RE-VERIFY: brief parser non-deterministic on names/units (#86) → verify on a FRESH run; parts_ledger stale
in-chain → re-run on final state. Latest run: out/fischer-codema-v9 (needs a v10 for gac/irrigation contract).

═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-27 v7 — 13/16 ≥8; 3 left ALL trace to WATER-ARCHETYPE SIZING bugs)
═══════════════════════════════════════════════════════════════════════════════
v7 (fresh, all fixes) = 13/16 tabs ≥8, the 3 remaining ALL at 6 (close). Caret fix (m^3≡m³≡m3, commit
this push) flipped Exec 0→6 — the brief parser is NON-DETERMINISTIC about unit notation (#86); without
it a flow metric matched a unitless COUNT. The 3 remaining tabs reduce to a CLUSTER OF WATER SIZING BUGS
the physics critic correctly flags (fix at SOURCE in engineering-contract.ts + the auto-tools):
  • drain_collection_sump_volume_each_m3 = 600 m³ (brief = 5,000 L = 5 m³ pits → ~120× OVER) — from
    tool:irrigation:ebb-flow-demand; almost certainly an L→m³ unit error in that generated tool.
  • total_water_storage 262 m³ + fresh_water_storage_capacity 196.8 (brief 40 m³) — buffer tool uses a
    CONSUMPTIVE model, no drain-reclaim term (ebb/flow recirculates) → over-sized.
  • fertigation + hand-watering pump MOTORS under-powered (process:pump-sizing under-rates the motor).
  • irrigation_pump_flow 12 vs 45 demand — tool floors to demand (d1b9e45e5) + manifest declares it
    (e6d5e72ab) but the LLM auto-planner did NOT wire irrigation_demand_m3_h this run (non-deterministic).
    HIGH-LEVERAGE candidate fix: make the executor PROTECT a brief-sourced quantity from tool overwrite
    (universal "brief is ground truth" — would fix irrigation AND storage), OR pin irrigation_pump_flow in
    the contract. Plus the per-dept metric name shares too few tokens with any delivery qty (matcher edge).
  • BoM: parts_ledger P&ID 0/45 + BFD 0/20 drawing MATCHING false-negs (known, mem forgeos_parts_ledger_exists)
    + parts-ledger STALE (runs before BoM final → re-run on final state gives £802k + real coverage).
NEXT (deliberate, verify each with a fresh run): (1) fix the 600 m³ sump unit error in the ebb-flow-demand
tool; (2) buffer-sizing reclaim term / honour-brief-spec; (3) pump-motor power calc; (4) irrigation pump
deterministic sizing (executor brief-protection is the universal lever); (5) parts_ledger drawing match +
run-it-last. NOTE: build-excel repair + parts_ledger are NOT persisted — re-run parts_ledger.py on the
final state, then dossier_audit.tab_scores. 12 commits this session; honest-scoring + ≥8 ship gate DONE.

═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-27 — 13/16 TABS ≥8 on a FRESH run; 3 left, v7 validating 2)
═══════════════════════════════════════════════════════════════════════════════
FRESH v6 run CONFIRMS the committed fixes end-to-end: 13/16 tabs ≥8, 0 UNSCORED, Calc holds at 8,
the ≥8 SHIP GATE fires (ship_ok=False + exit 2 + DRAFT). 3 FAILS remain:
1. Exec Summary 2 — irrigation pump 12 vs 45 (FIXED: tool floors to demand d1b9e45e5 + manifest now
   declares irrigation_demand_m3_h so the planner wires it [latest commit]) + gac/softener UNVERIFIED
   (FIXED: renamed to brief's GAC terms 519eb8879). BOTH land in v7 → Exec Summary should PASS.
2. BoM 6 — TWO issues: (a) parts-ledger STALE (parts_ledger.py ran in-chain before the BoM was final →
   grand_total=0; re-running it on the FINAL state gives £802,727 + real coverage — SAME staleness class
   as dossier_repair; fix = run parts_ledger LAST / build-excel re-derive). (b) drawing-coverage matching
   false-negs: P&ID 0/45, BFD 0/20 (parts in those drawings don't match BoM tags) — the KNOWN parts_ledger
   matching issue (mem forgeos_parts_ledger_exists). DEEP — do deliberately.
3. Risk 6 — irrigation (fixed → v7 resolves one HIGH) + water storage OVER-SIZED: the buffer tool
   (generated/water_storage__buffer_sizing.py) uses a CONSUMPTIVE model fresh=(demand−supply)·dur·SF=196.8
   m³ but Codema ebb/flow RECIRCULATES (drain reclaim) so brief's 40 m³ is right — needs a reclaim term OR
   honour-brief-spec (don't let a generic tool override a brief-pinned HARD slot). ENGINEERING NUANCE — do
   deliberately (40 vs 196.8 must be got right).
v7 IN FLIGHT (out/fischer-codema-v7) → validates #1 + half of #3. After v7: fix parts_ledger staleness +
matching (BoM), water-storage model (Risk). NOTE: build-excel's repair + parts_ledger are NOT persisted, so
re-score offline via dossier_audit.tab_scores on out/<run>/state.json after re-running parts_ledger.py.

═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-26 NIGHT — ≥8-EVERY-TAB is now a CODED SHIP GATE; grinding tabs up)
═══════════════════════════════════════════════════════════════════════════════
TRISTAN: work CONTINUOUSLY (no check-ins) until EVERY tab is a GENUINE ≥8 (not fake); the ≥8-every-tab
floor must be PART OF THE CODE. DONE this push (commits): per-tab ≥8 floor is now the SHIP GATE
(build-excel ship_ok=False + EXIT 2 + DRAFT banner unless tabScorecardSummary.all_pass; UNSCORED counts as
fail = anti-fake-8) [099de10e3]; tag_validity accepts range tags FCV-201–208 (gate-intent) [099de10e3];
4 formerly-UNSCORED tabs now have GENUINE deterministic checks (Part names/Line&velocity/Panel schedule/
Glossary — prove-the-catch Fixture K) so UNSCORED count = 0 [next commit]; irrigation pump tool sizes to
the stated DEMAND + auto-sizes its pipe (12→45 m³/h, DN100, 2.2 kW) [the tool fix]; gac/softener throughput
renamed to the brief's GAC terms → compliance matches (UNVERIFIED→PASS) [gac commit].
v5 PER-TAB now: Exec 2, Calc 6, BoM 6, Risk 6, the 4 ex-UNSCORED = 10/10/10/8, rest 10. all_pass FALSE.
REMAINING sub-8 (drive each to ≥8 at SOURCE): Exec Summary = irrigation pump (tool fixed; CHECK v6 wired
the demand — if still 12, wire irrigation_demand_m3_h into the auto-planner tool input) + gac (fixed);
Calc 6 = calc-coverage 24% (28/37 numbers have no worked-calc — systematic: emit calc() per derived qty);
BoM 6 = parts-ledger 0/0 (parts_ledger.py didn't populate — CHECK v6); Risk 6 = water storage OVER-SIZED
(fresh_water_storage_capacity 196.8 + drain tank 64.8 vs brief 40 m³ — the universal sizer overwrites the
brief-pinned HARD slot; deep sizer fix, do carefully). FRESH RUN out/fischer-codema-v6 IN FLIGHT (exercises
the repair/tag/irrigation/gac fixes) → when done: build-excel, read tab_scores, continue the grind from the
REAL state. Then a v7 after the contract (gac/irrigation) fixes land.

═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-26 EVE — HONEST SCORING DONE; next = STALE-BoM determinism #86)
═══════════════════════════════════════════════════════════════════════════════
HONEST-SCORING SYSTEM COMPLETE + VERIFIED on a FRESH v5 run (5 commits, all guarded). v5 compliance:
7 PASS, 1 FAIL (irrigation pump 12<45 = #2 real), 1 UNVERIFIED (gac/softener throughput not emitted =
real gap); renderer+audit+banner all agree, Exec Summary honest 2/10. Commits 9159e4525, eacba20d2,
0e6903183, 93c44b0a1 (+ tracker). Matcher now: per-metric UNVERIFIED=HIGH; ONE shared matcher
(family+synonym+token-subset ≥half, plurals folded); echoes (…_demand) excluded → match DELIVERED qty;
dimensioned family NEVER matches a unitless count (_fam_compatible). Guards: dossier_audit --selftest
G/H/J; requirements_bom --selftest (d1).

✅ £2.77M PHANTOM PANEL FIXED (commit 7add12c3d) — it was NOT a stale-manifest issue (earlier hypothesis
WRONG). ROOT: the chain runs dossier_repair.py (serial-design-chain-v2.tsx:8589) which writes state.json in
place; its fix_duplicate_principal merges 'by-function duplicates' and SUMS qty, but _dup_key keyed on
r['part'] = the placeholder 'requirement stated' (identical on ALL not-found rows) → Electrical Control Panel
(qty 1) + RO membrane (qty 3463) + ~100 distinct not-found lines collapsed into ONE row, summed qty 3463 →
£2.77M = 90% of bill, 171→68 lines. costStack stayed £779k (set at 8375) → BoM≠costStack in the SAME state =
the fingerprint of a repair-step corruption. FIX: _dup_key keys on REQUIREMENT (identity), placeholder/empty
noun → no merge. VERIFIED v5: BoM 170 lines / £779,521, installed capex £1,325,058 ≈ Codema £1.25M; phantom
GONE; min tab is now Exec Summary 2/10 (the REAL irrigation FAIL + gac gap). Drawer forgeos_fixes_21962caf479dbcc2.
NEXT real punch-list (all now-honest signals): (#2) irrigation pump 12 vs 45 m³/h (irrigation_pump_sizing.py);
gac/softener throughput quantity not emitted (universal-contract-sizing); parts-ledger 0/0 (not populated this
run); 3 garbage tags; then chain min-tab≥8 hard-gate. A FRESH chain run now exercises the fixed repair end-to-end.

═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-26 PM — HONEST SCORING LANDED; fresh v5 run in flight)
═══════════════════════════════════════════════════════════════════════════════
TRISTAN HAMMERED (4×): "a pass is good — unverified AND fail are bad"; "an 8 must make someone go
'wow', not box-tick"; "if you can't score yourself correctly you can't fix yourself". THE SCORER WAS
GENEROUS — fixed at source (3 commits, all guarded):
  • 9159e4525 — per-metric honesty: each UNVERIFIED brief metric is its OWN HIGH (was: collapsed to ONE
    MED unless 100% unverified → tab scored 8). Exec Summary 8→0.
  • eacba20d2 — ONE compliance matcher shared by renderer (build-excel _match_quantity) + audit
    (dossier_audit _contract_match): family+synonym+token-subset, plurals folded, requirement-ECHO
    (…_demand/_target) EXCLUDED so a metric matches the DELIVERED qty not the requirement it restates.
    Retired the phantom compliance_matcher_gap. Result: containers/ro_permeate/valves → green PASS,
    irrigation 12<45 → red FAIL (surfaces the undersized pump). Exec Summary 0→6 (honest+precise).
  • 0e6903183 — min-credible price floor for electrical ASSEMBLIES (panel £800 / switchboard+MCC £3,000),
    placed LAST so components (busbar £120/breaker £45) win; bare solar/vent panels untouched.
FINDING: the £713k 'Electrical Control Panel' (58% of bill) was STALE STATE — current code yields qty=1
(£218→£800 floored). The dominant-BoM-line flag fired on v4's old requirementsBom.
GUARDS: dossier_audit.py --selftest Fixtures G+H; requirements_bom.py --selftest section (d1).
IN FLIGHT: fresh chain → out/fischer-codema-v5 (log out-fischer-codema-v5.log, 6 *_ENFORCING=0). When it
lands: build-excel-export.py out/fischer-codema-v5 …, read tab_scores — expect Exec Summary ≈6 (irrigation
FAIL), BoM no longer £713k. THEN punch-list #2 = irrigation pump 12 vs 45 (irrigation_pump_sizing.py) +
its marine-material leak; then parts-ledger/calc-coverage/UNSCORED tabs/chain min-tab≥8 hard-gate.

═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-26 — WORK DOWN THE PER-TAB PUNCH-LIST; post-compaction)
═══════════════════════════════════════════════════════════════════════════════
TRISTAN'S STANDING INSTRUCTION: "keep going down the punch list until everything fixed." The loop is now
INTERNAL + deterministic — each chain run writes out/<run>/tab-scorecard-punchlist.md, every failing
Excel tab routed to its SOURCE rule. Work that list top-down: fix the SOURCE rule (never the symptom),
add a guard, re-run, the tab re-scores. Done when every tab ≥8 (min tab score is the headline).

WHERE IT STANDS: the water_treatment archetype is BUILT + WORKING (commits 8af2a8826 + iterations). On
briefs-loop/fischer_farms_codema.md the dossier went vertical_farm min1/mean3.8/£112M → water_treatment
v4 min3/mean7.2/£1,225,300 (≈ Codema £1.25M). Battery contamination + building scope-creep + RO £61M all
FIXED. The deterministic per-tab scorecard is BUILT (#94): dossier_audit.tab_scores() scores every tab,
title_row stamps it ON each tab, build() persists tab-scorecard.json + the punch-list.

ROUTED REMAINING (the punch-list — fix in order, each traced to source):
  1. ELECTRICAL CONTROL PANEL £713,078 = 58% of the £1.225M bill (DOMINANT — so the total is
     coincidentally ≈Codema but composition-WRONG). Word qty=×1, but requirements_bom.py prices it
     'bottom-up parametric' (no price hint) → £713,078 shown as 3271×£218, ~15× over for a 48 kW plant.
     FIX: the parametric electrical-enclosure pricer in requirements_bom.py (find the driver = 3271).
  2. IRRIGATION PUMP 12 m³/h vs 90 m³/h demand (physics 3/10 BLOCKER). From the auto-created
     irrigation:pump-sizing tool (scripts/lib/orchestrator/tools/python/irrigation_pump_sizing.py) — sizes
     12 not 90; irrigation is actually delivered by the 2×45 m³/h fertigation pumps so the separate
     Irrigation Pump is redundant OR must size to irrigation_demand_m3_h. ALSO it got a MARINE material
     ("316L/bronze seawater chloride") on a FRESHWATER plant — a wrong-domain material default to find+fix.
  3. parts-ledger empty (drawing coverage 0/0) + 2 garbage tags (BoM HIGHs).
  4. Calculations 6/10 (calc-coverage 24% — emit a worked-calc per derived number).
  5. 4 UNSCORED tabs (Part names, Panel schedule, Line & velocity, Glossary) — write their deterministic
     checks in dossier_audit.py + add to COVERED_TABS so they can be certified.
  6. Chain HARD-GATE on min tab ≥8 (read tab-scorecard.json) so a failing dossier can't ship.
ALREADY FIXED THIS PUSH: BoM line-math check now skips SUB-COMPONENT rows (commit 0c520046c) — those
carry line_gbp=£0 BY DESIGN (rolled into the principal); never flag them.

RUN (shadow gates so it completes for inspection):
PDF_ENGINE_SELF_AUDIT_ENFORCING=0 COST_SANITY_ENFORCING=0 PHYSICS_CRITIC_ENFORCING=0 \
TOOL_ARCHETYPE_ENFORCING=0 BENCHMARK_NET_ENFORCING=0 DRAWING_GATES_ENFORCING=0 \
npx tsx scripts/serial-design-chain-v2.tsx briefs-loop/fischer_farms_codema.md out/fischer-codema-v5
Then: .venv/bin/python scripts/build-excel-export.py out/fischer-codema-v5 out/fischer-codema-v5/dossier.xlsx
READ per-tab: python3 -c "import json,sys;sys.path.insert(0,'scripts/lib');from dossier_audit import tab_scores;
s=json.load(open('out/fischer-codema-v5/state.json'));print(tab_scores(s,s.get('requirementsBom') or [],'out/fischer-codema-v5'))"
KEY DRAWERS: forgeos_gotchas_ba0ec09401ee666d (duty-aware FLOOR bug family) · meta_decisions_74a61f5c4a458987
(per-tab deterministic loop) · forgeos_decisions_12757a69844bba8e (how to add a process-plant archetype).

═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-25 — FISCHER FARMS / WATER-PLANT ARCHETYPE; superseded)
═══════════════════════════════════════════════════════════════════════════════
THE GOAL: make the engine reproduce the real Codema Fischer Farms deliverable (a WATER /
fertigation / ebb-flow irrigation PLANT, ~£1.25M / €1,395,019) from the detailed brief
briefs-loop/fischer_farms_codema.md. THE METRIC = state.selfAudit.min_score (the ≥8-every-section
scorecard, now a front Excel tab ⭐ Scorecard). Lead with min_score, NEVER sub-metrics (provenance
%, calc-coverage %) — a rising sub-metric on a wrong artifact is a false signal (drawer
forgeos_gotchas_83ce662c83091aac).

PUNCH-LIST PROGRESS 2026-06-26 (working down tab-scorecard-punchlist.md):
- FIXED: BoM line-math check skipped SUB-COMPONENT rows (commit 0c520046c) — removed 202 false-positive
  HIGHs that masked the real BoM issues. NOTE: SUB-COMPONENT rows carry line_gbp=£0 BY DESIGN (price
  rolled into the principal); never flag them.
- ROUTED-REMAINING (each traced to source, fix next):
  1. Electrical Control Panel £713,078 = 58% of the £1.225M bill (DOMINANT). Word qty=×1, but
     requirements_bom.py prices it 'bottom-up parametric' (no price hint) → £713,078 shown as 3271×£218.
     The parametric panel/cabinet pricer over-estimates ~15× for a 48 kW plant. FIX in requirements_bom.py
     parametric electrical-enclosure pricing (find what driver yields qty 3271). This is why £1.225M was
     coincidentally ≈Codema but composition-WRONG.
  2. Irrigation pump 12 m³/h vs 90 m³/h demand (physics 3/10 BLOCKER). From the auto-created
     irrigation:pump-sizing tool (irrigation_pump_sizing.py) — it sizes 12 not 90; the irrigation is
     actually delivered by the 2×45 m³/h fertigation pumps, so the separate Irrigation Pump is redundant
     OR must size to irrigation_demand_m3_h. ALSO it got a MARINE material ('316L/bronze seawater chloride')
     on a FRESHWATER plant — a wrong-domain material default to find+fix.
  3. parts-ledger empty (drawing coverage 0/0) + 2 garbage tags (BoM HIGHs).
  4. Calculations 6/10 (calc-coverage 24% — emit a worked-calc per derived number).
  5. 4 UNSCORED tabs (Part names, Panel schedule, Line & velocity, Glossary) — write deterministic checks.
  6. Chain HARD-GATE on min tab ≥8 (read tab-scorecard.json) so a failing dossier can't ship.
  v4 scorecard: min 3/mean 7.2; per-tab min BoM (0/10 → after check fix reveals the £713k panel etc.).

STATUS 2026-06-26 (per-tab scorecard + water archetype iterations):
- water_treatment archetype: v4 = min 3/mean 7.2, BoM £1,225,300 ≈ Codema £1.25M. Battery contamination
  (storage-aware energy floor, derive-skeleton.ts) + building scope-creep (numeric building_out_of_scope
  flag) BOTH fixed+verified GONE. RO £61M→£244k (partial). Remaining blocker: physics_fidelity 3/10 —
  IRRIGATION PUMP UNDERSIZED (rated 12 m³/h vs 45 m³/h/dept demand) — route to the irrigation pump sizing.
- DETERMINISTIC PER-TAB SCORECARD BUILT (#94, Tristan's architectural ask): dossier_audit.tab_scores()
  scores EVERY Excel tab 0-10 vs ≥8 (HIGH=4/MED=2/LOW=1 penalty); title_row stamps the score ON each tab;
  ⭐ Scorecard front table; build() persists tab-scorecard.json + tab-scorecard-punchlist.md (routed loop
  signal). UNSCORED = no check = coverage gap (never a free 10). v4 per-tab: BoM 0 (line-math £0 lines),
  Calc 6 (calc-cov 24%), Risk 6 (physics), 4 UNSCORED (Part names/Panel schedule/Line & velocity/Glossary).
  NEXT: write checks for the 4 UNSCORED tabs; chain-gate on min tab ≥8; fix BoM £0 lines + irrigation pump.

STATUS 2026-06-25 (continuation): TASK #93 ARCHETYPE IS BUILT + WORKING — engine classifies the Codema
brief as water_treatment + builds the RIGHT water subsystems. Scorecard on briefs-loop/fischer_farms_
codema.md: vertical_farm min1/mean3.8 (£112M) → water_treatment v1 min2/mean6.5 (£2.3M) → v2 min2/mean5.7.
brief_compliance 9, performance_card 10, connected_load 48 kW (was 124 MW). Commits 8af2a8826 (archetype,
5 reg points) + 50d51e669 (WT invariant) + iteration fixes. NOW ITERATING TO ≥8 (min stuck at 2). ROUTED
REMAINING BUGS (scorecard-flagged, fix at SOURCE): (a) RO membrane £61M→£244k (re-keyed _skid_area_m2→
_skid_volume_m3) but a TOOL still sizes "364 m² membrane" → £244k ~3× high; fix the membrane sub-assembly
£/m² rule. (b) Building scope-creep £1.1M slab FIXED commit 15e53717d (numeric building_out_of_scope=1 →
synthesizeBuildingStructure returns 0); PENDING run-confirm. (c) THE CURRENT BLOCKER = BATTERY-TEMPLATE
CONTAMINATION (non-determinism #86): v2 narrative/physics/BoM pulled in "energy_storage_source / cell
assemblies / Cell Monitoring Unit / copy-paste battery template" (v1 did NOT) — an LLM emitter/narrative
stage defaults to BESS language on a water plant; INVESTIGATE which stage injects it. (d) ebb/flow PIPEWORK
+ 200 valves (71% of £1.25M) still not costed (distributed-network follow-on; total currently equipment-only
≈£2.3-2.4M). RUN with the 6 *_ENFORCING=0 shadow flags (see below) → out/fischer-codema-v3 → read selfAudit.

(superseded — for context) THE PINNED NEXT BUILD = TASK #93: a water_treatment / process-water ARCHETYPE. Fischer Farms is
mis-classified: product-classifier.ts:133 routes fertigation/vertical-farm/growing-tray →
vertical_farm → the full-farm emitter (LED/HVAC/canopy = £112M, the wrong artifact). The brief IS
a water-system spec (Tristan: don't build a vertical farm then prune — that's the symptom; the
SOURCE is the missing class). FIX: (a) a classifier rule that routes a "water-handling /
fertigation / irrigation PLANT or SYSTEM" brief to water_treatment BEFORE the vertical_farm rule
(match the PRODUCT noun, not the context); (b) a water_treatment contract builder + emitter sizing
RO (8 m³/h, 75% rec), softener (14 m³/h), GAC (14.5 m³/h), particle filter, 3×40 m³ storage tanks,
2 A/B fertigation units (45 m³/h, Lowara e-SHE 7.5 kW, EC/pH loop, Iwaki dosing, 8×1000 L stock),
the ebb/flow network (6000 containers, 200 valves, 45 m³/h·dept, DN125→DN75 mains, DN110/160 drain,
5000 L pit, 80 m³/h cloth filter), hand watering (25 m³/h), the Hoogendoorn iSii control. Reuse the
existing process tools (pump/tank/RO/dosing sizing the RAS+generic paths use). GROUND TRUTH (the
sense-check target, all in the brief): per-subsystem £85k/£31k/£92k/£895k/£24k/£128k → £1.25M;
D ebb/flow = 71% = installed pipework+200 valves+labour; load = low TENS of kW not MW. VERIFY by a
fresh chain run → the ⭐ Scorecard min_score + the Sense-check tab (water-vs-water) + landing near £1.25M.

INFRASTRUCTURE BUILT THIS SESSION (all committed, all VISIBLE in the Excel now — these make the
quality measurable so #93 can be judged):
- ⭐ Scorecard tab (front, #87) + quality dashboard (#92) — min/mean + per-section + blocking +
  traceability%/calc-coverage% (commits 0c133929a, f595193ed).
- Sense-check tab (#88-ish) — the benchmark net (gate 36) LLM top-down expected BoM/cost vs the
  engine, per-dimension + per-LINE faults flagged; was computed every run + discarded (commit 5e1f7c5ff).
- Traceability SPINE (provenance.py) — every number records lineage; 17%→95% (executor stamp +
  design-loop writeback); chain shadow gate + ⚠Audit check + invariant.
- dossier_audit.py — ~20 deterministic per-tab checks incl. brief_unverified, dominant_bom_line,
  scope_fidelity (#85 detection), calc_coverage (the "all calcs in Excel" GUARANTEE, 3% today),
  provenance. dossier_repair.py — audit→FIX→re-audit loop (wired into chain + Excel build).
- Source fixes (correct but exposed the scope bug): vertical_farm reads brief tray_capacity
  (1182bec89); parsedBrief.original_text preserved so builders read real specs (8561c09ed).

RUN HOW-TO: shadow gates so it completes for inspection:
PDF_ENGINE_SELF_AUDIT_ENFORCING=0 COST_SANITY_ENFORCING=0 PHYSICS_CRITIC_ENFORCING=0 \
TOOL_ARCHETYPE_ENFORCING=0 BENCHMARK_NET_ENFORCING=0 DRAWING_GATES_ENFORCING=0 \
npx tsx scripts/serial-design-chain-v2.tsx briefs-loop/fischer_farms_codema.md out/fischer-codema-v1
Read score: python3 -c "import json;s=json.load(open('out/.../state.json'));print(s['selfAudit'])"

TASK LIST = #56-93 (the full punch-list from both BESS + Fischer reviews + resilience + Excel checks
+ #93 the archetype). Work one-by-one, mark complete ONLY when verified in the artifact.

═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ (prior) SELF-CORRECTING DOSSIER LOOP
═══════════════════════════════════════════════════════════════════════════════
TRISTAN'S DIRECTIVE (the spine): the engine must FIND every problem AND FIX it INTERNALLY,
deterministically, and NOT produce a dossier until it's clean. A report that says "failed"
is a failure, not a deliverable. Detection ≠ the deliverable. (4-seat council unanimous.)

DONE + COMMITTED (main, latest 4538f51ad):
- dossier_audit.py — deterministic per-tab self-audit, ~16 checks (tag coverage/validity,
  line-math, capex≡ΣBoM reconciliation, MWh↔kWh + synonym matcher gap, brief_metric_FAIL
  [catches dc_bus 800-vs-1500], duplicate-principal, phantom-reference, traceability/basis,
  partial+empty drawing coverage, unresolved-HIGH-physics, no-revenue, template-leak). Wired
  as a "⚠ Audit" tab; Exec Summary says "DRAFT — N issues" not "validated" when not clean.
- dossier_repair.py — the generate→audit→FIX→re-audit LOOP + fixer registry (fix_missing_tags
  ISA noun→prefix, fix_duplicate_principal, fix_zero_principal_price). FIXABLE_CHECKS split +
  NON_FIXABLE_RATIONALE (human/source gaps surface as QUESTIONS, never dropped). Converges to
  a fixed point. Both --selftest in verify-engine-guards.sh.
- Earlier same session (committed f76875a70): the 4 top-severity source fixes — A matcher
  MWh↔kWh, B capex-by-category sums the bill (£797k cells dominate), C transformer 1.25→3.15
  MVA sized to power (+invariant), F rack 2-tier stacking → GA fits 20-ft (5.3m).

PROGRESS 2026-06-25 (post-compaction, commit 25994304c): repair loop WIRED into
build-excel-export.py build() — runs repair_dossier() BEFORE rendering any tab. On v5: 137
untagged principals → 0 (118 ISA tags), 44 dup lines merged, 2 £0 filled. Verdict + ⚠ Audit
tab now a pure function of the POST-repair audit. Remaining 16 are honest design/source gaps
(dc_bus FAIL, 3 physics HIGH, phantom refs, no-revenue, 0/0 coverage, 7 £0 commodities
DELIBERATELY routed-not-patched: missing price = source-rule gap, not a loop band-aid).
state._dossierRepair records {iterations, fixes_applied, needs_input[]}.

THE REMAINING BIG PIECE (this is the control-flow change the council said is the real fix):
  1. ✅ DONE — repair loop wired into the Excel build (verdict = pure function of post-repair audit).
  1b. WIRE repair_dossier() INTO serial-design-chain-v2.tsx too (not just the Excel build) so the
     DRAWINGS/renders reflect the fixes, and human-gaps surface as QUESTIONS pre-emit.
  2. ✅ (Excel) verdict is now a pure function of the post-repair audit (state._dossierAudit). The
     chain-level "validated"/benchmark-🟢 green light still needs the same treatment.
  3. Add the SOURCE-RULE auto-fixers the loop flags but can't patch in rows: fuse/current/
     transformer-coherence sizing reconciliation in the contract/emitter; the duplicate-pump
     at source; the missing-tag at the emitter (not just post-patched).
  4. Still-flagged-not-fixed from Tristan's BESS review: economics (no revenue line for BESS,
     £71k labour proxy, capex shown-as-computed-then-tweakable), generic-process templates on
     a battery (assembly "hydrostatic test", thin P&ID, phantom cabinets), exterior render =
     interior, "original brief verbatim" not verbatim, calc→BoM traceability (numbers "from
     nowhere"). The audit now FLAGS most; the loop must FIX or escalate each.
  5. STRONG real test case waiting: Fischer Farms (Codema) water/fertigation/ebb-flow brief —
     €1.395M ground-truth, ~80% fluid-handling (engine's sweet spot), lighting excluded. The
     agent drafted a ready brief. Run it once the loop is wired.

GTM (separate thread, parked): ~/Downloads/forgeos-gtm-strategy.html (red-teamed) — operating
companies in PROCESS/fluid-handling ("pumps, pipes, tanks"), below the consultancy waterline,
prove-on-known-answers → warm pilot → public; CI is GREEN (workflow-scope saga resolved).

═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-25, Tristan asleep — "work autonomously")
═══════════════════════════════════════════════════════════════════════════════
THEME: the benchmark net + the database now do real work, not rubber-stamping.

DONE THIS SESSION (all UNIVERSAL, committed; pushing to main):
  ✓ BENCHMARK NET now actually checks — was diffing ONLY cost (BESS headline "850 MWh/yr throughput"
    matched none of its 6 predicted outputs by unit-string). Now diffs EVERY predicted output vs the
    contract by name + unit-family (canonicalMeasure/engineValueForMetric). Flags power 1000-vs-2500
    kW RADICAL, nameplate 2912-vs-5000 + dc-bus 800-vs-1500 WARN. WARN tightened 1.5×→1.2× (a >20%
    delta is actionable → routed). benchmark-expectation.ts.
  ✓ PRICING DB-FIRST + UNIVERSAL — _db_spec_price(name,md) in requirements_bom.py: median real
    forge-truth.db price by NOUN + discriminating SPEC (noun-only reproduced the over-prices; spec
    required). Cell £0/£100 → real DB £52. Wired into cell + catalogue-miss + the RATING MODEL.
  ✓ GROWING-DB LOOP CLOSED end-to-end: Part A (_enqueue_db_misses → ~/.forge-truth/price-ingest-
    queue.jsonl, no API) + Part B (scripts/ingest/ingest-priced-principals.ts → LLM sources real
    part, dual-anchor verify [4× of estimate OR DB class range], writeback). DEMONSTRATED: 86 kW
    chiller £51,600 estimate → ingested Daikin EWAD-TZB2R86 £38,500 → re-price reads it from DB.
    DATA-BACKED 56%→65%. SCHEDULED daily 03:30 (launchd com.forge.price-ingest + run-price-ingest.sh;
    fast model google/gemini-2.5-flash — GLM-5.2 reasoning times out).
  ✓ EXEC SUMMARY upgraded PDF-quality + deterministic: _exec_synopsis (every clause a state value) +
    Validation card + the brief Key-specs/compliance table. FIXED _match_quantity (was matching the
    target-CLOSEST quantity = the _requested ECHO → false PASS; now matches by NAME, echoes excluded
    → nameplate shows the honest 2912) + efficiency/cycle-life direction + _humanize_class display.
    Fixes the ⚠ Checks tab too. build-excel-export.py.

IN FLIGHT: clean full run → out/bess-20ft-v3 (the v2 re-run had a head -1 SIGPIPE; relaunched clean).
  On completion: verify benchmark flags the under-sizing + exec summary honest + chiller DB-backed →
  push all → handover. NOTE: v3's benchmark will now (correctly) flag power/nameplate — the design is
  genuinely under the 5 MWh/2.5 MW brief (the DENSITY gap, engine sizes 2.91 MWh in a 20-ft).

REMAINING (real long pole, unchanged): 5-9 MWh DENSITY (engine sizes 2.91 not 5 — needs 2026 high-
  density cells; the benchmark now FLAGS it); 40-ft container hardcode (deterministic-emitter.ts:4220);
  CI red needs Tristan's ci.yml one-liner (workflow scope). Drawers: forgeos_gotchas_{f0ba3f06dc6aab83,
  32400f7728a3e1b4}, forgeos_decisions_e7e330189c33aef5.

═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME (2026-06-24 night, Tristan asleep — "keep going all the way through")
═══════════════════════════════════════════════════════════════════════════════
20-FT BESS SHOWCASE is the canonical example (40-ft RETIRED — Tristan: "nobody uses 40-ft").
Industry input (drawer forgeos_reference_c190d8414ae30c20): 20-ft = 5-9 MWh, 2.5 MW max, 2-8h family;
the container is BATTERIES ONLY (PCS/transformer/MV in a SEPARATE container); BESS-only ~$80/kWh(2h)/$65(8h).

DONE THIS SESSION (all on main except the last re-run; main==origin/main as of the pushes):
  ✓ Gate work: benchmark net wired (gate 36) + prove-the-catch registry (all 20 gates) + enforcement
    on for wrongness gates + gate-17 renderer guard + DB verify-before-writeback. (earlier commits)
  ✓ Branch drift CLOSED + root cause fixed (jest mis-collected tsx-scripts → unpassable gate → bypassed).
  ✓ COST source-rules (all UNIVERSAL, requirements_bom.py, each --selftest'd): capacity→m³, flow→kW,
    busbar floor, corpus-lift class-mismatch + RATIO guard (£40→£3k trays), micro-commodity material
    split (wire/pad £0.3-2.5 vs metal £2-15), BATTERY CELL energy-priced (£0/£100→£40, dominant line),
    small-heater £/W ceiling + lift-skip (£1500→£150). 20-ft BoM now £539k = £185/kWh, cell 24% (realistic).
  ✓ RENDER placement: exterior pass runs on artifact-reuse → 2 interior + 2 exterior.
  ✓ CONTAINER-FIT: triggers for 20-ft (aspect≥2.2 OR payload-rated); battery-only split → PCS/
    transformer/switchgear to a COMPANION container; battery container 11m→9.4m.
  ✓ CI red FIXED-LOCALLY: pre-push now runs typecheck:baseline (was never running tsc); baseline
    re-captured (166 pre-existing errors, none mine). ⚠ CI STILL RED until TRISTAN changes ci.yml's
    typecheck step `npx tsc --noEmit` → `npm run typecheck:baseline` (needs `workflow` token scope I lack).

IN FLIGHT: clean 20-ft re-run → out/bess-20ft-v2 (bg task b9g5lxb6p, ~40min) with ALL fixes. When done:
  verify cost(~£185/kWh)/GA-fit/4-renders/benchmark-net verdict → push the 3 unpushed commits to main →
  handover. REMAINING over-prices the net will route: off-gas activation solenoid £1500/u (×13), + the
  battery-container chiller still ~9.4m (engine sizes a 2.4m standalone chiller; real = compact in-line).
NEXT (engine fixes, beyond Tristan's explicit cell/heater/battery-split list — all UNIVERSAL):
  1. ⭐ 40-FT CONTAINER HARDCODED: deterministic-emitter.ts emitStructureContainment(p: BessParams)
     hardcodes a 40-ft Hi-Cube container word (line ~4220, CIMC 40HC-BESS-HD £14,000 list) +
     "86 m³ = 40-ft HC" defaults (lines 620/712/718). The emitter has NO access to the brief's
     max_dimensions_mm → a 20-ft brief still emits a 40-ft container (£14k line + wrong GA size +
     "40-foot" narrative). Tristan: "nobody uses 40-ft anymore" → the DEFAULT is now wrong. Fix:
     thread max_dimensions_mm → BessParams → emit a 20-ft (~£4-5k) or 40-ft container by the brief.
  2. 5-9 MWh DENSITY: engine sizes 2.91 MWh in a 20-ft (briefed 5) — needs 2026 high-density cells;
     G0.5 should flag the density infeasibility instead of silently sizing down.
  3. GA: 2-high rack stacking + compact/wall-mount battery-side BoP (chiller) so the battery
     container fits 6.06 m (currently 9.4 m). Drawer forgeos_gotchas_7669116b0b806dfc.
  4. Smaller cost over-prices the net will route: insulation monitor £10k (IMD ~£500-2k), container
     AC £7.8k (corpus-lifted £3.8k→£7.8k, 2× — under the 20× ratio guard).



═══════════════════════════════════════════════════════════════════════════════
## ▶▶▶ RESUME HERE (post-compaction #5, 2026-06-24) — BESS showcase + quality arc
═══════════════════════════════════════════════════════════════════════════════
DONE THIS SESSION (4 commits on oxccu-efuel):
  ✓ 1. WIRE THE NET INTO THE CHAIN — gate 36 (commit 3f9c3ea23). serial-design-chain-v2.tsx generates the
       benchmark after the authoritative cost-sanity re-derive, compareToBenchmark, records
       state.benchmarkDivergence/.benchmarkExpectation/.benchmarkFaults, prints the full-check. SHADOW by
       default; BENCHMARK_NET_ENFORCING hard-exits 36 on RADICAL. Runs on QUALITY_LOOP_PHASE>=3 or
       BENCHMARK_NET_FORCE=1; CHAIN_SKIP_BENCHMARK_NET=1 kills it. Gate 36 in CLAUDE.md table. Harness
       invariant UNIVERSAL.benchmark_net_flags_radical_divergence.
  ✓ NO-PDF GUARD (commit c3eb265f8) — regression-harness rendered a PDF/snapshot (Tristan caught it AGAIN).
       REGRESSION_NO_RENDER=1 / --no-render now runs pure invariants with ZERO PDFs. USE THIS to verify a
       pure invariant against a snapshot. (chain is Excel-only; CHAIN_WANT_PDF off by default.)
  ✓ 3. SYSTEMIC COMPONENT-VOLUME BUG (commit 8f7bc85c3) — ROOT CAUSE was requirements_bom.py:2532
       hardcoding " m³" onto ANY `capacity` modifier, ignoring its unit. So 2300 A breaker→"2300 m³",
       150 L/min pump→"150 m³", 86 kW chiller→"86 m³" (the benchmark net's 48× sizing flag). FIXED: honour
       the capacity unit (m³ only when truly volume; else A/V/W/kW/L; drop if rating_primary covers it).
       38 bogus m³ lines → 0. requirements_bom.py --selftest gains 4 capacity-unit assertions.
  ✓ GA-CONTAINER-FIT (commit f35178660) — "doesn't fit the 40-ft container." build_universal_scene laid
       BESS into an 8.68×7.97 m SQUARE. The brief HAS the envelope (max_dimensions_mm). Added a
       containerised layout (gated aspect≥3, every other class untouched): main() detects the envelope;
       place_rack_farm lines racks down BOTH walls + wraps the BoP into the same rows + shell at true 40-ft
       dims; place_all gets a _place_container flat-pack for non-rack-farm containerised classes; optimiser
       skipped when containerised. VERIFIED by render: 8.68×7.97 → 12.7×2.9 m container-shaped.
  ✓ 4. COMMODITY OVER-PRICES (5 commits) — cost £2,963/kWh → £206/kWh (£617k, INSIDE the benchmark
       £600-950k envelope). TWO recurring bug families (drawer forgeos_unit_confusion_and_corpus_mismatch):
       (a) UNIT-CONFUSION: rating_kw read "150 L/min" as 150 kW → pump £210k→£3.3k (commit b321236c9).
       (b) MICRO-COMMODITY floor/cap: cell busbar £120-floor→£3 (£448k→£11k); tap wire/pad reel-price
       capped £12 (£371k→£90k) (commits 18b62a274, 56e1e9b2d). (c) CORPUS-LIFT class-mismatch: module
       frame £40→£34k×15 + cold plate £700→£19k matched to large-component refs → rejected when target
       >£10k & orig <£1k (commit 56e1e9b2d). All guarded by requirements_bom.py --selftest.
REMAINING, IN ORDER:
  2. B1 — flip sanity gates ENFORCING for the clean run: COST_SANITY_ENFORCING=1 BENCHMARK_NET_ENFORCING=1
     (env flags on the run command; no code).
  5. FIX RENDER PLACEMENT — dossier visuals tab (build-excel-export.py ~5683-5702) expects
     00-hero + 02-corner-FR (interior) + exterior/00-hero + exterior/02-corner-FR (a BLENDER_PLANT_SHELL=1
     pass to <run>/exterior/ that isn't being produced → only interior shows). Best fixed AFTER the
     re-run produces the real render set. For a CONTAINER, "exterior" = the closed 40-ft container shell.
  6. CLEAN BESS RE-RUN (`npx tsx scripts/serial-design-chain-v2.tsx briefs-loop/bess_grid_storage.md
     out/bess-clean`, ~45 min, NEEDS TRISTAN'S GO-AHEAD — deliberate compute spend) with the B1 flags →
     run the benchmark net → must read OK/within-envelope BEFORE shipping → THEN export the Exec-Summary
     cover as the LinkedIn one-pager + cherry-pick the commercial commits (e12f5a342 funnel, 5c65befb9
     breakdown, c2af05c59 cover) onto origin/main (prod).
SESSION COMMITS (8, all on oxccu-efuel): 3f9c3ea23 (net→gate36) · c3eb265f8 (no-PDF guard) · 8f7bc85c3
(capacity→m³) · f35178660 (GA container-fit) · b321236c9 (rating_kw unit) · 18b62a274 (busbar floor) ·
56e1e9b2d (corpus-mismatch + micro-cap). NO background processes. All committed.
Drawers: net design 604abf87e23f3f51, GLM-5.2 token squeeze 058a933ac8f135ff, BESS showcase e83ec8ec10e9d32f,
Tristan voice = historyfuturenow.com 267ce26369937301. NO background processes running. All code committed.

═══════════════════════════════════════════════════════════════════════════════
## ⭐⭐⭐ POST-COMPACTION RESUME #3 — READ FIRST (2026-06-24, pre-compaction #3)
═══════════════════════════════════════════════════════════════════════════════
**THE SESSION PIVOTED to WEBSITE / MONEY (Fractional Forge commercialisation). Engine work is in
a good state (parked). After compaction, resume the COMMERCIAL thread.**

### THE STRATEGY (agreed with Tristan — don't re-litigate)
Fractional Forge thesis: help a hardware-software startup go design→manufacturable in a fraction of
time/people/cost. THE DOSSIER IS THE WEDGE (one-sided, sells day one, no network). Everything else is
a CONCIERGE LADDER one customer climbs: £100 dossier → experts the dossier flagged (10% of per-diem via
Stripe) → RFQs to suppliers (paid) → fundraising help (%). THE WEBSITE = a MAP that SHOWS the whole
journey but only TRANSACTS the dossier; every later rung is a "request this" CTA Tristan fulfils BY HAND
until demand repeats. Tristan's circle = building instead of SELLING; the cure = sell 5 dossiers this week
(manually) + the 5-investor validation test, and let those customers' questions dictate what to build.
Anchor doc: FRACTIONAL-FORGE-RELAUNCH-PLAN.md (mostly WIRING not building — Stripe billing, marketplace,
supplier matcher, 29k suppliers all ALREADY BUILT).

### DEPLOY: main IS PROD (Tristan confirmed). Website code is IDENTICAL on oxccu-efuel and origin/main —
the 147-commit gap is ALL engine R&D. To ship a web fix: CHERRY-PICK only the isolated commercial
commits onto origin/main (keep engine R&D off prod). Vercel auto-deploys main.

### COMMITTED THIS TURN (commercial), on oxccu-efuel — STILL NEED CHERRY-PICK TO main TO DEPLOY:
- PUBLIC_ROUTES funnel fix: /about /contact /story /case-study /sample-package /investor-readiness
  /preview-landing made public (were bouncing anon visitors to /login — funnel-killer). src/lib/supabase/middleware.ts.
- f7039600c UNIVERSAL instrument-pricing fix: field instruments (probe/sensor/meter/gauge) were
  inheriting a co-located vessel's material take-off → a CO2 pH probe priced £62,529 (~£250k phantom/
  dossier). Added them to AUXILIARY_GUARD in scripts/lib/cost/bom-cost-grounding.ts. 39 tests pass.
  ⚠ Re-prices on the NEXT chain run — existing dossiers still have the £62k probes baked in.

### ⭐ BESS SHOWCASE + QUALITY/SANITY-NET ARC (2026-06-24, the live thread)
PUBLIC SHOWCASE = BESS (drawer forgeos_decisions_e83ec8ec10e9d32f): CO2 confidential (client brief),
SAF→OXCCU, fish→FishFrom. Fresh clean-room brief `briefs-loop/bess_grid_storage.md`. The 20 MWh/5 MW
version FAILED G0.5 (engine's BESS archetype caps at ONE ~2.9 MWh container, can't scale to multi-
container — a real engine limitation). RIGHT-SIZED to a single 3 MWh/1.5 MW 40-ft container → G0.5 PASS.
THEN Tristan inspected the output and found CLEAR quality bugs (I'd been watching logs, NOT output —
process failure):
  1. COST ~10× over (£2,963/kWh). Root: corpus-median-lift + floors over-pricing per-cell COMMODITIES.
     FIXED A1 (ef9986f2f): commodity-noun lift-skip (busbar £452→£120, BoM £4.67M→£2.42M = £806/kWh).
     STILL ~2.7× over — remaining whack-a-mole over-prices: module steel frame £34k×15, cooling pump
     £105k×2, cold plate £19k, cell tap wire £59×3750, busbar £120 floor still high. THESE STILL NEED FIXING.
  2. BUSBAR VOLUME = 350 m³ (should be ~0.07) → GA drawing doesn't fit the 40-ft container (mass DOES
     fit: 29,875<30,480 kg, so it's a GEOMETRY/volume bug not overflow). A2 NOT YET FIXED — find the
     busbar volume computation.
  3. RENDERS: 33 PNGs exist but the dossier places only ~1 internal (expected 2 internal + 2 external) —
     recurring placement bug (same as the CO2 "4 images, 1 shows"). A3 NOT YET FIXED.
  4. `costSanity=HIGH` FIRED but is SHADOW → engine KNEW and shipped anyway. B1 = flip the existing
     sanity gates to ENFORCING (COST_SANITY_ENFORCING=1 etc.) — the "pull back", already built, NOT YET ON.

⭐⭐⭐ BENCHMARK NET — FULL VERSION DONE (4bc58388a, supersedes the cost-only 20987f432). 3 anchors
(COST + SIZING + COMPONENT) + AUTO-DIAGNOSE all working. On out/bess-clean it auto-flagged cost 9.4×,
sizing total 7,711 m³ vs 160 m³ (48×), and the auto-diagnose (grok-4.3) pinpointed the SYSTEMIC ROOT
CAUSE: ~6 components carry 50-250× too-large VOLUMES (busbar 350 m³, PTC heater 250 m³, coolant 200 m³,
pump 150 m³, chiller 86 m³, grounding 50 m³) — NOT one busbar; a pervasive component VOLUME-ATTRIBUTE
bug in the emitter/sizing. Also LLM-flagged a genuinely MISSING fire-suppression subsystem. Design rules
in drawer forgeos_decisions_604abf87e23f3f51; GLM-5.2 token/latency squeeze in forgeos_gotchas_058a933ac8f135ff
(empty at low max_tokens, timeout at high → diagnose uses grok-4.3 4000tok/180s, generation GLM-5.2 6000tok).
REMAINING on the net: WIRE INTO CHAIN (generate at brief, compare post-cost, record state.benchmarkDivergence,
optionally gate when enforcing).

⭐ (historical) generative benchmark SANITY NET v1 cost-only (B2, 20987f432):
`scripts/lib/benchmark-expectation.ts`. An LLM (z-ai/glm-5.2, the most capable; BENCHMARK_MODEL overrides)
generates a TOP-DOWN market benchmark (expected cost/output/BoM-mix) from the brief; diffed vs the
deterministic engine; RADICAL divergence (≥2.5×) → auto-flag + "full check". INDEPENDENCE PRINCIPLE
(load-bearing): benchmark is TOP-DOWN (market gestalt £/kWh) vs engine BOTTOM-UP (sums parts) — prompt
FORBIDS itemise-and-add so it can't reproduce the engine's arithmetic bug. UNIVERSAL (no hardcoded band,
unlike gate 32). VERIFIED: on out/bess-clean GLM-5.2 said £600-950k, flagged engine's £8.89M as RADICAL
11.9×. CLI `npx tsx scripts/lib/benchmark-expectation.ts <out-dir>`, --selftest passes. REMAINING: WIRE
INTO THE CHAIN (generate at brief, compare post-cost, record state.benchmarkDivergence, optionally gate).

NEXT (this arc, in order): wire benchmark net into chain + B1 enforce + A1-remainder over-prices + A2
busbar volume + A3 render placement → then a clean BESS re-run that passes the benchmark → THEN the
LinkedIn one-pager. Do NOT ship the BESS dossier until the benchmark verdict is OK/within-envelope.

### ✅ DONE since RESUME #3 (commercial commits, on oxccu-efuel — need cherry-pick to main):
- 5c65befb9 COST-BREAKDOWN OVERVIEW — "Where the money goes" capex-by-category table+bars on Overview
  tab (cost_breakdown_by_category in build-excel-export.py; instruments BEFORE vessels in classifier).
- c2af05c59 EXECUTIVE SUMMARY "WOW" COVER — new FIRST tab (gridlines off, hero, headline cards
  WHAT/OUTPUT/COST/STATUS, cost breakdown, what's-inside, concierge ladder). Forced ahead of Contents.
STILL TODO this thread: LinkedIn one-pager (PNG/PDF export of the cover — NEEDS a clean re-run first +
a voice sample from Tristan per the "Writing for Tristan" rules) + website concierge-journey section.
⚠ GATING DEPENDENCY: a CLEAN CO2 re-run (all fixes applied) is needed before the cover/LinkedIn asset
show CREDIBLE numbers — current co2_mineralisation-fix still has the £62k probes + floor 6/10. Deliberate
~20-40min compute spend; confirm with Tristan; do NOT run concurrent with another CO2 chain.

### EARLIER NEXT-BUILD NOTES (kept for the classifier design):
1. COST-BREAKDOWN OVERVIEW (deterministic "where does my money go", % by category). Classifier is
   designed+tested: read parts-ledger.json equipment[].type + line_gbp + connections[] (pipework/
   cabling). Use a richer NAME-based classifier (reboil pot→vessel, dryer→thermal, centrifuge→
   separation, MCC→electrical, skid→structural) — but put INSTRUMENTS/VALVES *before* VESSELS so
   "reactor pH probe"→instrument not vessel. Categories: Vessels/reactors/columns, Heat exchangers,
   Pumps/blowers/compressors, Filtration/separation, Instruments, Valves, Electrical/power, Control,
   Structure, Material-handling, Pipework, Cabling, Balance-of-plant. Put it in the Overview/cover.
2. EXEC-SUMMARY "WOW" COVER TAB (Tristan: first tabs must say "wow", not look like a grid): gridlines
   OFF, big hero render, headline (what·output·all-in cost·1-line verdict), the cost breakdown, "what's
   inside" tab-map, "your next steps" concierge ladder. + a STANDALONE LinkedIn one-pager (PNG/PDF export
   of that summary — you CANNOT post Excel on LinkedIn). build-excel-export.py tab_overview is the base.
3. WEBSITE concierge-journey section (the ladder visible) + DRAFT the LinkedIn post in Tristan's voice
   (British spelling; "I built a system that turns a hardware idea into a full engineering dossier in
   days — here's a real one — DM me"). 
4. ⚠ NEEDS a CLEAN dossier re-run (with the pricing fix) to demo on credible numbers. Do NOT run a 2nd
   concurrent CO2 chain (collision risk). Run ONE deliberate CO2 re-run when nothing else is running.

### NEW BUG FOUND (follow-up): TWO COST SURFACES DISAGREE. The chain's reconcile verdict said
"compatible" for a £2.57M CO2 design vs a £1.90M ceiling (wrong — it's over). state.sweetSpot was
computed from a DIFFERENT cost surface (costStack/costBasis) than readHeadlineCostGbp (£2.57M). A dossier
must not claim "fits your budget" when it doesn't — make the chain reconcile use the SAME authoritative
cost surface readHeadlineCostGbp uses. (Two-cost-surfaces gotcha: costBasis ≠ requirementsBom.)

### ENGINE STATE (parked — proven, don't redo): cost/output OPTIMISATION done — sweet-spot scoping
(65efb64a9 core, 757807edb wiring: brief primary_objective field + cost_sanity defer + dossier display)
+ #47 design-to-target CLOSED LOOP logic complete (951835e8d core root-finder, 320802ccb orchestrator+
DESIGN_TARGET_SCALE chain override, e5605658b auto-trigger smart entry point `npx tsx scripts/design-to-
target-run.ts <brief> <outdir>`, 4db0acd47 metrics-scaling fix). RAS scale-0.5 run PROVED the override
genuinely resizes the real design (production/biomass/capex all halved). The CO2 soak was KILLED (slow
~1hr/round, core already proven). Remaining: #46 Phase-2 structural-lever scenarios; a full real soak (low
priority). Drawers: design-to-target 5aef0031a66f777c, two-layer decision b543c1f04089e9d1.

═══════════════════════════════════════════════════════════════════════════════
## ⭐⭐ POST-COMPACTION RESUME — READ FIRST (written 2026-06-24 pre-compaction #2)
═══════════════════════════════════════════════════════════════════════════════
**You were compacted mid-feature. THE NEXT BUILD = task #47: the DESIGN-TO-TARGET CLOSED LOOP
(the "accurate layer" of the cost/output optimisation). Tristan said "get ready to compress…
resume after." After compaction, confirm-or-start #47.**

### WHAT THIS FEATURE IS (cost/output optimisation — the engine's real job)
A brief is a WISH-LIST, can ask incompatible things (1M t/yr for £1). The engine must RECONCILE by
the brief's stated `primary_objective` (cost_min | output_max | balanced) and find the SWEET SPOT.
TWO LAYERS (decision drawer `forgeos_decisions_b543c1f04089e9d1`):
- **Layer 1 = SCOPING (DONE + committed):** `scripts/lib/sweet-spot.ts` reconcile() — an ANALYTICAL
  six-tenths frontier Capex(Q)=Capex_ref·(Q/Q_ref)^0.65 picks the approximate target per objective.
  Commits: core 65efb64a9; wiring (brief primary_objective field + chain state.sweetSpot + cost_sanity
  DEFER + dossier Financial-model display) 757807edb. Verified: CO2→incompatible (365 t/yr@£2.54M vs
  £1.90M ceiling → balanced 302 t/yr), RAS→compatible. `npx tsx scripts/lib/sweet-spot.ts --selftest`.
- ⚠ **Layer 2 = #47, NOT YET BUILT (Tristan's key correction):** the six-tenths law is CRUDE — at a
  different scale the DESIGN is genuinely different, so the estimate is close-ish but NEVER the real
  number. The accurate answer: take the chosen target, RE-RUN the full chain at that scale, measure
  ACTUAL (output, cost), and LOOP on REAL data (secant root-finding — real points replace the 0.65
  assumption after round 1) until converged (±tol or ~4 rounds). This AUTOMATES the manual RAS-£5M
  iteration (Tristan nudges productivity/scale by hand to land on £5M). Expensive (2-4 full ~20-min
  runs) but ONLY on the committed design.

### HOW TO BUILD #47
- Read: scripts/lib/sweet-spot.ts (gives rescale_factor + frontier), state.sweetSpot (recorded by the
  chain), readHeadlineCostGbp + deriveOutputDenominator (src/lib/pdf-engine-v2/lib/independent-cost-
  sanity-audit.ts). The cost_sanity DEFER in serial-design-chain-v2.tsx (~line 2416, triggers on
  state.sweetSpot.verdict==='incompatible') is the Layer-1 STOPGAP that "excuses" the cost — Layer-2
  must REPLACE it with redirect-to-redesign-at-reconciled-scale.
- FIND how the chain sets its target SCALE (the brief target_performance / contract capacity) so the
  loop can re-invoke the chain at a NEW output target. The loop re-runs the chain (a real run) per round.
- Don't auto-loop on every option — only on the chosen/committed design. Tie expensive runs to the
  cost-discipline (Tristan picked QUEUE not auto-dispatch for the coverage heartbeat — same spirit).

### ALSO DONE THIS SESSION (committed — DO NOT redo). Branch oxccu-efuel.
Loop strengthenings #1-#5: lesson-loop→failure-ledger+invariant-stubs (2dcab4d38), DB-first class-
standards for unseen archetypes flag-gated STANDARDS_DB_LIVE (a868461d8), executable preflight
(76c94fc0c), £0 coverage-heartbeat queue + enforcing-drain (76e74c823). CO2 tank fixes: absorber
DN300×24.5 + distillation height + crystalliser cone_vessel primitive (9697ff072) + cone-shape
ancillary fix (68cc1f4ff). Connectivity/cabinets/connector-deck (8933c1280), 4 renders + m³ tank
geometry (806508e9a), Excel consolidation 38→30 one-Ledger+Financial-model (038a9b551). Genset 5000kVA
verified. CO2 quality-loop runaway was KILLED (was spinning zero-delta on cost_sanity=2 — the tension
this whole feature fixes).

### GOTCHAS (drawers): CLAUDE.md "corpus tables" table is STALE — specs/standards writeback IS live
(30315e18e07d8262). The connectivity audit must read connection-LEDGER.json not -schedule.json
(6e97dd8ef132a01f). Blender m³-only dims silently box-collapse; exterior renders gated BLENDER_PLANT_
SHELL=1 (311bbdbc0c2e0f3f). Excel tab-consolidation decision (3258f6dbb4806e29). 338-341 project tsc
errors are PRE-EXISTING baseline (chain runs via tsx) — don't chase.

### TASKS: #41 follow-ups (fix stale CLAUDE.md table, #2 writeback slice, soak flags), #46 Phase 2
(structural-lever scenarios: layout/lean/intensify), #47 Phase 1.5 design-to-target loop = THE NEXT
BUILD. #42-45 done. Open Q to Tristan (asked, unanswered): start #47 now vs pause — he chose compress,
so resume into #47.
═══════════════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════════════
## ✅ COMPLETED 2026-06-24 — #27/#29/#31/#32 ALL DONE + VERIFIED (commit 8933c1280)
═══════════════════════════════════════════════════════════════════════════════
ROOT CAUSE of false connector orphans: parts_ledger.py audited connection-SCHEDULE.json
(sized cables/pipes only, NO signal) instead of the AUTHORITATIVE connection-LEDGER.json
(full graph). Fixed → parts_ledger reads both. Drawer drawer_forgeos_gotchas_6e97dd8ef132a01f.
Other universal fixes (all Blender-side): distribution-spine classifies power transformer as
a series stage + chains boards main→MCC + safety-relay/motor-protection taps; cl.close_residual_
completeness self-healing net (service-aware dedup so signal can parallel power); _classify
matches \bmeter\b (density meter was typing as vessel); make-up tank = origin; relief valve exempt.
#29 cabinets: parts_ledger._build_cabinets houses small power/control devices. #32: Excel
"Cabinet schedule" tab proves per-cabinet contents + in/out connectors + all-connected verdict.
VERIFIED all 3 (SAF/RAS/CO2): parts_ledger=0, strict ledger=0, integrity=0, all cabinets proven.
#31: FRESH RAS chain re-run (out/ras-genset-verify) → genset 2500→5000 kVA (fix applied),
ledger COMPLETENESS ✓ all 83, cabinets all_proven, Excel built+opens. Chain exit 20/21 =
render-and-flag distributor-reality disclosures (un-catalogued MPN + 1 mispriced line),
PRE-EXISTING, orthogonal to this work. Dossiers in ~/Downloads/{SAF,CO2,RAS}-cabinet-connectors-v*.xlsx.
REMAINING (optional): re-run SAF+CO2 chains to apply genset fix to those examples too (universal,
already validated on RAS); cabinet auto-assignment is deterministic but cosmetic (a few empty cabinets).

═══════════════════════════════════════════════════════════════════════════════
## ⭐ POST-COMPACTION RESUME — (superseded by the COMPLETED block above)
═══════════════════════════════════════════════════════════════════════════════
**You were compacted mid-task. Tristan said "yes, proceed" with the LAST remaining piece:
close #27's connector gaps + build #29 cabinet grouping, UNIVERSAL, verified by SINGLE controlled
chain re-runs. Resume that. Archetypes: e_fuel_synthesis(SAF) / aquaculture_ras(RAS) / co2_mineralisation(CO2).
Out dirs: `out/<arch>-fix/`. Briefs: `briefs-loop/<arch>.md`. Preserved clean states: `out/<arch>-fix/state.iter1.json`.**

### ALREADY DONE — 6 universal fixes COMMITTED (do NOT redo): worked-calc-static (Excel opens),
PDF-audit-gate-skip (no false exit-10), genset cap-undersizing, tool-provenance DAG (#26 ✅), connector-proof-
UNIVERSAL (#27 proof ✅: CONN0 + Excel Connection-trace deck now read parts-ledger.json::connectivity for ALL),
render-palette (#28 ✅: desaturated MODULE_EQUIP_COLOURS → killed parts-vomit; CO2/SAF renders now clean).
### 7 VERIFIED NON-BUGS — do NOT re-chase: cost-sanity (works, field cost_per_output_unit), mpn-shape (intentional),
degasser qty-22 (correct=4×turnover), economics £22/kg (grounded kingfish), physics_fidelity (LLM advisory),
biofilter HRT (MBBR sized by TAN load not HRT), heater #148 (deliberate 50% standby + 85% HEX covers it). (#30 ✅)

### THE TASK: close #27's 12 gaps (RAS 0, SAF 5, CO2 7) + #29 cabinet
**#27 ELECTRICAL gaps (7 of 12, the bulk) ROOT CAUSE (traced):** parts_ledger.py audits `connection-schedule.json`
for connectivity.concerns. That file is written by `build_universal_scene.py` (~L5396, authored ~L5294) and its
electrical power edges source from a GENERIC "Electrical Supply" boundary (pattern at build_universal_scene.py:3216
`electrical_supply|grid|mains|incomer`) → loads, BYPASSING the real transformer→switchgear→busbar/MCC, which then
read as orphaned (no in/out). (connection_ledger.py::close_power_directions DOES wire a hub→loads but writes to
connection-ledger.json which is Blender/RAS-only — SPLIT authoring, NOT what parts_ledger reads.) **FIX:** in
build_universal_scene.py make the connection-schedule power edges route the DISTRIBUTION HIERARCHY
grid/genset→transformer→switchgear→busbar/MCC/distribution-board→loads (load spurs source from the board, not the
boundary). Blender-side → verify by RE-RENDER then re-run parts_ledger → CONN0 n_concerns drops.
**#27 PROCESS gaps (5 of 12):** some are MIS-CLASSIFICATION fixable in parts_ledger.py (no chain re-run): R-109
"slurry density meter" is typed `vessel` (should be instrument); I-101 "pressure-relief valve" not in the
AIR_OR_SUBCOMPONENT exemption (parts_ledger.py:504-518) — add relief-valve/density-meter/instrument-on-line. Others
(C-101 column feed, K-103 compressor out, V-102 filter out, TK-101 tank feed) are real topology ties.
**#29 CABINET (new synthesis feature, no existing grouping):** in `engineering-contract.ts`, identify SMALL
control/electrical parts (size<~700mm + type instrument/breaker/relay/marshalling/PLC/IO) → HOUSE in a cabinet
(control/marshalling for I&C; distribution-board/MCC for power) → emit cabinet as BoM/render unit + parts as contents
(new parent_tag field; manifest/BoM/render honour it). COUPLED with #27-electrical (the board IS the distribution hub).
RAS scatters 30 small parts/0 cabinets; CO2/SAF have a few. Chain-re-run-verified.

### COMMANDS (verified working)
- RENDER one (≈1-2min): `INSPECT=0 BLENDER_OUT_DIR=out/<arch>-fix STATE_JSON=out/<arch>-fix/state.json /opt/homebrew/bin/blender --background --python scripts/blender-universal/build_universal_scene.py -- out/<arch>-fix/state.json` (writes 00-hero.png; view it with Read).
- REBUILD Excel: `.venv/bin/python scripts/build-excel-export.py out/<arch>-fix out/<arch>-fix/dossier.xlsx`
- SINGLE chain re-run (≈25min, PDF off, Excel-only): `npx tsx scripts/serial-design-chain-v2.tsx briefs-loop/<arch>.md out/<arch>-fix` — ⚠ NEVER use scripts/run-3-example-loop.sh (the 3-concurrent runner RAN AWAY: overlapping/restarting chains).
- VERIFY CONN0: `.venv/bin/python -c "import sys,json;sys.path.insert(0,'scripts');import deterministic_checks_lib as d;[print(a,[c.actual for c in d._checks_connectivity(json.load(open(f'out/{a}-fix/state.json')),f'out/{a}-fix') if c.producer=='conn:ledger_completeness']) for a in ['e_fuel_synthesis','aquaculture_ras','co2_mineralisation']]"`
- VERIFY provenance: load dossier.xlsx 'Tool provenance' tab, Status col should be USED (0 ORPHANED).
- GAPS list: `parts-ledger.json::connectivity.concerns` per out dir.

### BRANCH: on `oxccu-efuel` (6 fixes committed here). origin/main canonical but pre-push hook fails on
PRE-EXISTING jest tests → consolidation deferred. Deliver clean dossiers to ~/Downloads as <arch>-example-vN.xlsx.
═══════════════════════════════════════════════════════════════════════════════


## GOAL (the only done-condition)
SAF (`e_fuel_synthesis`), CO2 (`co2_mineralisation`), RAS (`aquaculture_ras`) each at **≥8 on EVERY
deterministic section** (scorecard floor — the FLOOR, not the average) AND the **Excel numbers
reconcile with the engine's physics computations** (Tristan 2026-06-23: "check the Excel sheet to see
whether all the numbers are actually working relative to the physics you produce"). No PDFs — Excel only.

## IRON RULE — EVERY FIX IS UNIVERSAL (Tristan 2026-06-23)
Fix the ENGINE MECHANISM, never an archetype-specific patch. No `if class == 'ras'`. The fix must make
EVERY unseen archetype better. Per CLAUDE.md: every chain commit adds a `scripts/regression-harness.tsx`
invariant OR a `regression-harness: no-invariant-needed because <reason>` commit line. If a bug recurs,
that means the fix wasn't universal — escalate to the root mechanism.

## LOOP PROTOCOL (detect → route → fix-at-source → invariant → re-run → pass)
Per archetype, each iteration:
1. RUN `npx tsx scripts/serial-design-chain-v2.tsx briefs-loop/<arch>.md out/<arch>-fix` (Excel-only,
   gates SHADOW so it completes + records every score). Runner: `scripts/run-3-example-loop.sh` (3 concurrent).
2. INSPECT (NEVER trust stdout alone):
   - scorecard floor — `out/<arch>-fix/` scorecard/state → every section ≥8?
   - `drawing-gates.json` (G1-G5) + `drawing-gates-punchlist.md`
   - the 13 audits (audit-pdf-*, parts-spec, sizing, etc.) + cost-sanity (gate 32) + tool-archetype (gate 34)
   - **EXCEL-vs-PHYSICS**: open `out/<arch>-fix/dossier.xlsx`, confirm cost surfaces reconcile (BoM Σ ==
     cover total == requirementsBom), the physics-derived quantities (sizing tool outputs) match the
     Calculations tab, Economics has no #DIV/0!/#N/A/blank, brief-compliance units+direction correct.
3. FIX at source, UNIVERSAL + add invariant.
4. RE-RUN. Repeat until every section ≥8 AND Excel reconciles.

## KNOWN ISSUES from the 2026-06-23 audit (starting work-list — verify against the fresh re-run)
UNIVERSAL (all 3 — highest leverage):
- [ ] `parts-ledger grand_total_gbp` exports as 0 → cost-reconciliation Check shows false FAIL though BoM reconciles. (build-excel-export)
- [ ] Economics tab shows #DIV/0!/#N/A/−NPV/blank when sale price is £0/absent → show LEVELISED COST instead of a broken revenue/NPV block. (engine economics + excel)
- [ ] Brief-compliance bug class: (a) MAX-constraints (≤) checked as must-meet (≥) → compliant designs spuriously FAIL; (b) unit-conversion misses (kW-vs-MW "3000 MW", fraction-vs-% "0.6% vs 60%"); (c) value+unit stream-matcher conflates different streams (K2SO4=gypsum). (brief-constraint-completeness-audit + compliance renderer + metric matcher)
SAF: economics display (above); feedstock cost £0 omits H2/CO2 opex (dominant) → levelised cost understated.
CO2: Economics blank; hero render "part-vomit" (universal-procedural fallback — needs bespoke template OR the template-adapter path); wrong brief-compliance matches.
RAS: cover Floor 0 / connectivity 0 / physics-fidelity "severe implausibilities (pump/velocity/generator)"; capex stated 3 ways + £5M-vs-£50M ceiling (capex-ceiling fix already committed — verify it took); over-replication (22 degassers/23 pumps); revenue £22/kg — VERIFY independently (kingfish sashimi ≠ salmon; audit benchmarked vs salmon, may be wrong).

## STATUS (after iter-1 baseline)
| Archetype | iter-1 | Excel opens | self-audit | cost £/t·yr (manual, all in-band) | drawing-gates fail |
|---|---|---|---|---|---|
| SAF | exit10(false) | ✅ v7 | 7 | £14.8k (band 12-60k) ✅ | panel load_reconcile |
| CO2 | exit10(false) | ✅ v7 | 7 | £7.0k (band 1.5-10k) ✅ | BFD legibility 4.3:1 + 1 |
| RAS | exit10(false) | ✅ v7 | 4 ⚠ | £47.8k (band 10-55k) ✅ | qty_coverage (degasser 22→manifest 1) ×4 |

## DONE (universal, committed, verified)
- **worked-calc results → STATIC** (build-excel-export): kills the recurring SAF sheet14 corruption for EVERY
  archetype (no worked-calc can emit an Excel-invalid formula). Proven: 0 non-cell-ref Calc formulas, LibreOffice
  drops 0, CO2 regression clean. The prior v6 was per-FILE (not universal) — chain regenerated the break.
- **PDF-audit gate skipped when no PDF** (serial-design-chain-v2): the exit-10 "chain-v2.pdf missing" false-fail
  blocked EVERY Excel-only run. Now BoM validated by Excel ⚠Checks + state-based gates.

## CORRECTIONS (verified non-bugs — do NOT chase)
- ~~cost-sanity headline=None~~ = MY FIELD-NAME MISREAD. computeCostSanity WORKS: real fields are
  `cost_per_output_unit` + `headline_cost_gbp` + `direction` (not headline_per_unit/ratio). SAF verified
  in_band £14,832/(t·yr) PASS. Costs are sane. NOT a bug.
- mpn-shape missing module (Stage 10.6 "Cannot find module") = INTENTIONAL. git a86f921b1 reverted it
  ("it activated a CRASHING Stage 10.6"). DO NOT recreate — re-introduces the crash. Warning benign; gate 20 backstop.

## iter-2 (engine cc793c946) — foundational fixes CONFIRMED
- SAF exit=0 (was exit 10) + Excel 0 invalid / 0 Calc-nonref → BOTH committed universal fixes work END-TO-END.
- CO2/RAS heavier iter (~40min, progressing not stuck: CO2 Blender CAD, RAS BoM pricing).

## CONSOLIDATED VERDICT (after rigorous per-issue verification)
The 2026-06-23 audit MASSIVELY over-flagged. Verified NON-bugs (do NOT chase): cost-sanity works;
mpn-shape intentional; degasser qty-22 CORRECT (recirc 39,296=4× tank-vol 9,824 per brief); economics
£22/kg grounded-correct for sashimi kingfish; physics_fidelity LLM number is advisory. The examples
now WORK (open, costs in-band: SAF £14.8k/CO2 £7.0k/RAS £47.8k per t·yr). 2 REAL blockers FIXED+verified
(worked-calc static, PDF-gate-skip). 
THE genuinely-real remaining issue = RAS physics-SIZING (Physics Critic high/high, deterministic):
  (a) GENSET 2500 kVA vs 3784 kW life-safety load (~1.9× undersized) — universal sizing-rule fix (size to load/PF).
  (b) BACKUP HEATER 1649 kW vs 3254 kW make-up heating — = KNOWN memory #148 (makeup-heating/heat-pump
      cascade, flagged "needs Tristan, risky"). DO NOT auto-fix blind — flag for Tristan.
  (c) BIOFILTER single 451 m³ @ 39,296 m³/h → HRT 41s (grossly undersized). The biofilter is the wrongly-
      SINGLE unit (NOT the degasser, which is correctly ×22). Universal fix: size biofilter to a real HRT
      (parallel-replicate like the degasser, or size the tank to flow). 
SAF/CO2 self-audit 7 (closer to 8). Drawing-gate fidelity gaps (RAS qty manifest-rep, SAF panel reconcile,
CO2 BFD legibility) are DEEP Blender-manifest fixes needing ~55min re-runs to verify.

## NEXT (prioritised, do carefully + tested, add invariant each)
0. RAS genset sizing (size to life-safety load ÷ PF) + biofilter sizing (size to proper HRT / replicate) —
   UNIVERSAL root-cause sizing fixes; the genuine ≥8 blockers. FLAG the heater (#148) for Tristan, don't auto-fix.
1. drawing-gates (the deterministic ≥8 DRAWING condition) — fix at each gate's named stage:
   RAS qty_coverage (degasser contract qty 22 vs parts-manifest 1 — BUT verify 22 isn't over-replication
   first: a 600t RAS shouldn't need 22 degassers — likely a SIZING bug in universal-contract-sizing.ts, not
   a manifest-replication gap); SAF panel load_reconcile (panel Σ vs connected_electrical_load_kw); CO2 BFD
   legibility 4.3:1 (multi-sheet wrap in the BFD draw-script — universal: any >4:1 diagram).
2. economics `is_ras`/£22 per-class hardcode → ONE universal path: verified sale price → revenue/NPV, else
   LEVELISED COST (not #DIV/0). Pervasive refactor (is_ras at L2424-2433/2469/2723/2752/2777) — careful + tested.
   NOTE £22/kg is plausible for kingfish (premium) so it's a code-smell, not a wild number.
3. drawing-gates: RAS qty_coverage (parts-manifest must replicate qty-N principal nodes, not collapse to 1 —
   universal manifest-expansion fix); SAF panel load_reconcile (panel total vs connected_electrical_load_kw);
   CO2 BFD legibility (multi-sheet wrap in draw-script). Each names its fix-stage.
4. RAS self-audit 4 (deeper design quality) — investigate after 1-3.
- NOTE: scorecard-floor key empty in state — find where the deterministic floor is recorded (selfAudit is the LLM one).

## BRANCH DRIFT (resolve when work is clean)
Working in the `oxccu-efuel` linked worktree; canonical = `origin/main` (separate worktree at
`CentaurOS created 260126 1435`, on `main`). HEAD is 126 ahead of origin/main. Pre-push hook runs
lint+jest; **jest currently FAILS** (blocker — diagnose: likely pre-existing council-scorer tests).
Per memory `forgeos_one_engine_on_main_anti_drift`: consolidate to main. PLAN: once the loop's fixes
are committed + jest green (or failures confirmed pre-existing + unrelated), `git push origin HEAD:main`
to fast-forward main (it's a strict ancestor), then work on main. Do NOT force a 126-commit deploy mid-broken-examples.

## ROOT-CAUSE FINDINGS (for precise universal fixes — apply AFTER iter-1 baseline lands)
### #1 ECONOMICS (universal, highest leverage) — `scripts/build-excel-export.py` ~L2356-2450, 2567-2730
- ROOT: `_ECON_DEFAULTS["sale_price_ras"]=22.0` + `feed_price_ras`/`fcr_ras` + the `is_ras` branch (L2424) is a
  PER-CLASS HARDCODE — this IS the audit's "£22/kg". Violates the universal rule.
- NONE of the 3 contracts carries a verified sale price (`grep` of 0.5-engineering-contract.json: SAF only
  `saf_output_tonnes_yr`, RAS only `annual_production_t_yr`, CO2 none). Generic path (L2631) → sale 0 → CO2/SAF
  #DIV/0!/#N/A/−NPV. SAF brief's "£2,200/tonne" is a COST TARGET, not a sale price (the deliberate £0 fix).
- UNIVERSAL FIX (do tested, post-baseline): delete the `is_ras` price hardcode + `sale_price_ras`/`feed_price_ras`/
  `fcr_ras`; ONE path. If a VERIFIED sale price exists (brief/contract/commodity lookup, `sale_price_verified`) →
  revenue/EBITDA/NPV/IRR. ELSE → render a LEVELISED COST view (£/output-unit = (annual opex + annualised capex)/output;
  always computable, honest for a first-commercial plant) — NO #DIV/0, NO fabricated NPV, NO £/kg stub.
  INVARIANT: no per-class price literals in build-excel-export; economics renders levelised-cost (not #DIV/0) when
  `sale_price_verified` is False. TEST: run build-excel-export on a complete state (saf-example) → valid xlsx, no #DIV/0.
### #2 grand_total_gbp=0 (cost-reconciliation false-FAIL) — build-excel L1922; check parts_ledger.py grand_total OR derive from BoM Σ.
### #3 brief-compliance bug class — direction (≤ vs ≥), unit-conversion (kW/MW, fraction/%), stream-matcher conflation. (brief-constraint-completeness-audit + compliance renderer)
### #4 CO2 part-vomit render (bespoke template / template-adapter); #5 RAS over-replication + connectivity-0 + physics-fidelity.
DISCIPLINE: every build-excel edit TESTED on a complete saved state before relying on it (the in-flight chains call it as a subprocess at their end).

## SESSION RESULT (autonomous, 2026-06-23 night)
THREE universal fixes committed: (1) worked-calc results static → all Excels open [verified end-to-end:
SAF iter-2 exit=0 + 0 invalid]; (2) PDF-audit gate skipped when no PDF → no false exit-10 [verified: SAF
exit=0]; (3) genset never silently undersized (cap→round-up) [math-verified 4730→5000 kVA; NEEDS an
end-to-end re-run to confirm the RAS critic clears].
SIX "issues" DEBUNKED as non-bugs (verified each — do NOT chase): cost-sanity works (field-name misread);
mpn-shape missing is intentional (reverted, crashes if recreated); degasser qty-22 correct (=4× tank turnover
per brief); economics £22/kg grounded-correct for sashimi kingfish; physics_fidelity LLM score is advisory;
biofilter "HRT 41s" is a critic misread (MBBR correctly sized by TAN load / media area, not HRT).
ONE genuine NEEDS-TRISTAN: backup heater 1649 vs 3254 kW make-up heating = known memory #148 (heat-pump
makeup-heating cascade, flagged risky — do NOT auto-fix).
EXAMPLES NOW WORK: all 3 Excels open; costs in-band (SAF £14.8k / CO2 £7.0k / RAS £47.8k per t·yr); designs
largely sound. The 2026-06-23 audit's "FIX FIRST / not investable / part-vomit" verdict was substantially
OVER-STATED (6 of its flags were non-bugs).
REMAINING (slow / Tristan): genset end-to-end re-run verify; drawing-gate FIDELITY (RAS manifest qty-rep so
the GA shows 22 degassers not 1; CO2 BFD multi-sheet wrap >4:1; SAF panel load_reconcile) — deep Blender,
~55min/re-run; heater #148 (Tristan).
RUNAWAY NOTE: the 3-concurrent runner (run-3-example-loop.sh) ran away on iter-2 (overlapping/restarting
chains, >75min vs 27, process count 15→24) — KILLED. Use a SINGLE controlled chain for re-runs; investigate
the runner's restart/duplicate behaviour before re-using it.

## LOG
- 2026-06-23 ~20:35 — launched iter-1 of all 3 (bg `scripts/run-3-example-loop.sh`); poll `out/loop-status.txt`.
- 2026-06-23 ~20:45 — confirmed all 3 chains healthy (PA Stage 3, correctly classified). Root-caused the #1 universal
  bug (economics is_ras/£22 hardcode + no-sale-price → levelised cost). Holding edits until iter-1 lands (test vs complete states).
