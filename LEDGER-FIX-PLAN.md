# CORE ENGINE LOOP (Tristan 2026-06-17 — hold this when fixing ANY council finding)
The engine is a CLOSED loop, not a one-shot pipeline:
  brief → expanded brief → tools → contract → ledger → blender → engineering drawings → BACK TO tools
The engineering drawings are a FEEDBACK STAGE (they re-inform tool selection/sizing on the next pass),
NOT a terminal artefact to patch. So every council/loop finding must be ROUTED TO ITS STAGE and fixed at
source — NEVER band-aided in the drawing renderer:
  - wrong NUMBER / sizing            → fix the TOOL (re-derives down through contract→ledger→blender→drawings)
  - wrong QUANTITY / material / fail-state / cost → fix the CONTRACT / LEDGER (the single source)
  - wrong GEOMETRY / placement        → fix BLENDER (build_universal_scene)
  - genuine PROJECTION error (drawing mis-reads CORRECT ledger data) → fix the DRAWING + feed the signal back to TOOLS
Where a drawing exposes a gap the engine's OWN drawings→tools feedback SHOULD have caught + corrected,
STRENGTHENING that feedback is the universal fix (the self-correcting pillar of THE AIM; task #128).

---

# ════════ SESSION-2 COMPACTION CHECKPOINT (2026-06-17 pm) — READ FIRST ON RESUME ════════
**Git:** HEAD == origin/main == `ea0cd7e62`. Tree clean.

**Committed + pushed this session (all RAS except the model-update task Tristan asked for):**
- `222f43004` Phase 1c — cost-sanity re-derives on the AUTHORITATIVE BoM after the requirements_bom reconcile + honest `aquaculture_ras` £10k-55k/(t·yr) ex-works band (killed the stale £23,501 banner; now £46k/t·yr PASS). Invariant `UNIVERSAL.cost_sanity_reads_authoritative_bom_and_class_band`.
- `6341f001f` OpenRouter model slugs → current (GLM 5.1→5.2, deepseek-chat[V3]→deepseek-v4-flash ×12 adapters, qwen3.6→3.7-max, minimax-m2.7→m3, anthropic hyphen→dot). Audit: `docs/openrouter-model-audit-2026-06-17.md`. Anthropic-free gen rule VERIFIED holds.
- `4f3ad7c58` Blender router robustness (CABLE_TRAY_MAX_RUNGS=40 + per-edge 8s budget) + RAS contract physics (biofilter 0.35→0.30 kg TAN/m³·day; emergency-O2 30→120 min) + `scripts/build-council-facts.py` (NEW: deterministic neutral-facts-pack generator).
- `13f1f9249` Blender geometry O(scene_objects)→O(1) — THE real router-hang root: `add_pipe`/`add_box` used `bpy.ops` (select_all+convert / transform_apply) scanning the whole scene per call; `_add_pipe_fast`/`_add_box_fast` fix it. **The hang that blocked ALL fresh RAS runs is FIXED** (v14: hanging→60 s; v13: no regression, 113 routes).
- `ea0cd7e62` facts pack surfaces each quantity's DESIGN BASIS (stops the council over-flagging correct values).

**v15 = the current complete RAS dossier** (`out/ras-v15`): 108 routes, 77 drawings, BoM £9.47M, cost-sanity PASS £46k/t·yr, contract physics propagated (biofilter media 92 m³, emergency-O2 32 kg). The Blender fix HELD live.

**Council ROUND 1** (`out/ras-v13/COUNCIL-SCORES-ROUND1.md`): Electrical **3 (floor)** · Process/Mechanical/HVAC 5 · Cost/Buildability 6 · **avg 5.0**. NOT formally re-scored since (no round-2 numbers — don't claim one).

**VERIFY-BEFORE-OVERSTATING — the RAS physics is SOUND** (5 round-1 "defects" were OVER-FLAGS; DO NOT "fix" them; drawer `7d78258eddc51e7a`): O2 demand already includes nitrification (o2TotalPerKgFeed=1.0); degasser is 10:1 PER-COLUMN (133,600 = total air ÷ 8); recirc motor 132 kW = next IEC frame above 94 kW shaft÷0.93×1.15 (defensible); salt make-up 2,116 kg/day correctly doses only the 5% fresh-blend (MAKEUP_SEAWATER_FRACTION=0.95); O2 balance is feed-based (no DO-saturation constant). The seats mis-scored because the facts hid the basis (now fixed in build-council-facts.py).

**THE TWO REAL REMAINING GAPS (deeper; NOT contract physics):**
1. **PLACEMENT band-spread → cost inflation (the highest-leverage fix).** The plant footprint is 485 m in **Y** — NOT from the train fold (the foldable train is <52 m so `FLOW_TRAIN_SINGLE_LANE` never folds; a SESSION-2 deterministic-lane-count attempt was a NO-OP, reverted) — but because `place_process_plant` (build_universal_scene) puts the environmental_interface/HVAC band at **Y≈0** while the main process cluster sits at **Y≈394-471 m**. The main cluster (~56×77 m) + the tank grid (4 cols×3 rows, 42×28 m) are ALREADY compact — ONE mis-placed band drags the footprint to 485 m, which makes the £380k generator→dehumidifier/heater feeders (485 m runs) + the £1M pipe lump. FIX (universal+deterministic, in the band Y-placement): place the periphery/support band ADJACENT to the main cluster (small aisle), not ~390 m away.
2. **Electrical drawings (drawing-stage, re-render on v15/v13 — no Blender):** the panel still lists passive kit (Biofilter / MBBR Media) as powered circuits (v15 panel 1,762 kW vs real ~1,500; was 4,256 at v13). FIX = skip passive loads at circuit-creation in `draw_panel_schedule.py` (passive items get a kW via BOTH `_panel_type_kw` estimate AND `_panel_resolve_ledger_kw` ledger lookup — the skip must precede BOTH). Single-line wants ATS/MCC/RCD. ⚠ `test_panel_schedule.py` has **4 PRE-EXISTING failures at HEAD** (a rack reads 84.2 A default not its stated 130.2 A) — a SEPARATE pre-existing universal bug, NOT a regression; gate on "no NEW failures vs the 4-baseline", and verify on the RAS panel render, NOT the BESS fixture.

**DEFERRED (real, queued):** material single-source (BLOCKED on `connection_sizing.corrosive_service_material` false-positives — matches "thermal_oxidiser" unit-name + water-loop-through-O2; drawer `39aa987ce9f4641a`); self-audit stale-read (gate 31 runs ~chain 5536 before requirements_bom reconcile ~7101 → false BoM=2 "zero-price lines"; fix = re-run after reconcile, Phase 1c pattern; drawer `8b0f7e3a8e648f68`).

**DISCIPLINE (Tristan, session-2, BINDING):** ALL engine decisions UNIVERSAL + DETERMINISTIC — no per-class tables, no manual hand-holding/intervention; the engine self-corrects. Verify EACH council finding against the engine source before fixing (the seats over-flag). Verify the TEST BASELINE before calling something a regression (I mis-reverted a good electrical fix off the BESS test's pre-existing failures). `draw_panel_schedule`/`draw_single_line` are UNIVERSAL code whose regression test uses a BESS FIXTURE — that is NOT "the BESS project". Don't thrash deep layout code while depleted (this session drifted twice; Tristan caught both).

**NEXT:** (a) `place_process_plant` band compaction → re-run → confirm the £380k cables + £1M pipe drop (the highest-leverage cost fix, universal); (b) formal ROUND-2 re-score on a fresh run (facts pack now accurate); (c) electrical drawing polish.
# ═══════════════════════════════════════════════════════════════════════════════════════

# LEDGER FIX PLAN — one canonical part-ledger as the single source of truth

> Tristan (2026-06-17): "solve problems at the source, not band-aids that make things brittle. Fix the ledger."
> Grounded design: the architecture map (this session). Anchor run: `out/ras-v12/`.

## ROOT CAUSE (why every regression this session recurs)
There is NO single source of truth. The same fact is computed at 2–4 independent code sites that drift apart:
- **4 pricing engines:** `requirements_bom.py::_materials_takeoff`; `scripts/lib/cost/build-cost-basis.ts`; `class-cost-structure.ts::computeCostStack`; the word-engine BoM. (316L is £14/kg in one, £6/kg in another.)
- **3 material resolvers:** `connection_sizing.py::_pipe_material_factor` → route-manifest/connection-schedule; `requirements_bom.py::_connection_rows` (re-derives HDPE/316L); `draw_process_schedules.py::_pipe_material`.
- **Fail-state** invented by a heuristic inside `draw_pid.py` (198–199) — no ledger field; BoM/narrative have none.
- **qty** word(×1) vs parts-manifest(×8); **motor kW** shaft(word) vs nameplate(BoM) vs FLC(single-line); **cost total** ΣrequirementsBom vs word-engine(scaled) vs buildCostBasis; **levelised** £43,186(fresh) vs £23,501(stale).
The current "fix" is `reconcileBomTotalsToAuthoritative` — SCALING the divergent surfaces to match. Scaling masks divergence; it doesn't remove it. That's the brittleness.

## THE FIX
One `state.ledger`, assembled ONCE, consumed read-only by every surface.

**Schema (part-centric):**
- `part`: { id, tag, name, module, type, qty, geometry{shape, dia/H or w/d/h, vol_m3 (from the dims), pos_mm}, characterisation{ material, material_rate, mass_kg, fabrication{kind, wall_mm/factor}, rating{kind,value,unit}, fail_state, service{fluid,phase,rating,criticality} }, cost{ status, part, unit_gbp, line_gbp, basis, subcomponents[] }, ports[], tools_used[] }
- `port`: { port_id, medium(water|power|signal|gas|thermal|air), direction(in|out), connected_part_id, via_element(pipe|cable|signal_tie|duct|gas_pipe), size, length_m, material, fail_state, line_number, connection_gbp, sizing_tool }
- `totals` derived = Σ parts.line_gbp + Σ ports.connection_gbp; total_mass_kg.
A tank carries water-in + water-out ports AND per-instrument signal+power ports → one identity, many projections.

**Characterisation tool (`characterise_ledger`, new):** inserted in `serial-design-chain-v2.tsx` at ~line 7095 (after the manifests exist, before the BoM). For EVERY part + port, derive material / fabrication-kind / mass / price / fail-state FROM ITS SERVICE (fluid, phase, rating, criticality) — one deterministic pass, NO per-class table. This unifies the physics now split across requirements_bom.py + connection_sizing.py + draw_pid.py + buildCostBasis.

**5 increments (each leaves the engine runnable + verified; riskiest last):**
1. Assemble ledger + BoM projects from it (`requirements_bom.assemble` becomes ledger→rows; `_materials_takeoff`/`_connection_rows` move INTO characterise). Verify Σ ~identical + gate-2 (cover≡Σmodules).
2. Material/fail-state drawings project: draw_pid (fail_state+material+size), draw_process_schedules (material), draw_single_line/draw_panel_schedule (qty + power-medium ports). Verify by OPENING P&ID/line-list/single-line — material/DN/fail-state identical across all three.
3. Cost cascade + levelised project from `ledger.totals`: delete the 3 computeCostStack re-reconcile sites + buildCostBasis's own rates (kills the £14-vs-£6 fork). Verify cover ≡ §8 ≡ §9 ≡ levelised, NO scaling.
4. NEW signal/network drawing from `signal`-medium ports (task #157). No existing surface to break.
5. (riskiest) Narrative projects: move `buildNaturalLanguageLayer` after `assembleLedger` (or feed it the ledger) so prose cites material/rating/fail-state/price. Verify narrative matches BoM + gates 5/11/18.

## UNIVERSALITY GUARD (BESS/SAF/CO2 byte-identical)
The ledger is universal — other archetypes' parts/ports just populate it. Characterisation MUST reproduce each archetype's current material/price. Pre-flight every increment with `quality-scorecard.py --vs` frozen BESS+SAF+CO2 baselines. Reconcile 316L £14-vs-£6 to ONE rate (keep requirements_bom's, so authoritative totals don't move). Keep the field_erected-vs-manufactured cost-stack branch (archetype-shape, not per-class).

## £42M FRAME = THE PROOF THE LEDGER SUBSUMES THE BAND-AIDS
Today: "Structural Frame" word (no material/geometry) → placed enclosing the whole plant (parts-manifest 54.5×54.5×24.5 m) → `_bespoke_class`="simple" → `_materials_takeoff` CLOSED-vessel branch → hoop-stress wall 66 mm on a 57,000 m³ shell → 4.6M kg × £4.5/kg × 1.7 = £42.36M; the `_vessel_cost_ceiling` band-aid (~£342M) doesn't catch it. The legit "Steel Portal Frame" is £268k via £/m². Service-driven characterisation: frame service = "structural support, dry, no pressure" → fabrication=structural_tonnage → ~£270k. The ceiling band-aid, the noun-regex classifier, and the duplicate path all become unnecessary.

---

# COUNCIL REMEDIATION (4-seat design council, 2026-06-17) — the naive plan would have made things WORSE

The council validated the DESTINATION (one source of truth) but found the first-move plan flawed on six counts. Revised plan below.

## KILLER FINDINGS
1. **The ledger DESTROYS the engine's main error detector.** Gates 5/11/12/18/B-3 work by comparing two INDEPENDENT values and flagging disagreement. One ledger → one wrong `characterise()` flows identically into BoM+P&ID+single-line+narrative → they all agree WRONGLY → the contradiction gates go GREEN on a uniformly-wrong dossier. ras-v12 is the live preview (£51M ships with HIGH=0). **Mitigation is mandatory and must come BEFORE unifying: replace consistency gates with ABSOLUTE-PLAUSIBILITY gates** (a structural frame can't be a 57,000 m³ pressure shell — wrong on its own terms, no second surface needed) + gate-32 must re-derive £/output from a path the ledger does NOT feed.
2. **"Service" is NOT a typed field — it's the part NAME re-parsed by 100+ noun-regexes.** If `characterise_ledger` keys off `part.service.fluid` but that field is populated by noun-regex one layer up, the £42M trap is INTACT, just relocated. **Root fix: emit TYPED `service{fluid,phase,rating,criticality,dry_no_pressure}` from universal-contract-sizing.ts AT SYNTHESIS, from the driver-quantity physics** (a part from makeup_water_m3_h IS water; from a kW rating with no fluid IS dry-electrical; from a footprint area IS structural-dry-no-pressure). The characteriser reads typed service, NEVER the name.
3. **Characterisation is NOT "one universal pass" — it's a per-FAMILY dispatcher** (fluid-vessel / rotating-electrical / structural / aero / electronic-commodity), per the wall-3 A2 anchor. Material/fabrication/fail-state need per-family closers; only `sensing_principle` genuinely generalises. The plan over-claimed.
4. **The plan doesn't close the ACTUAL dossier-killing divergence.** The £51M-vs-£5M "921% over ceiling" banner lives in **keyMetrics + brief-compliance**, which the 5 increments never route through the ledger. Even fully built, the plan would NOT fix its own anchor. keyMetrics + compliance + envelope + suppliers + gates 13/14/16/30 (read orchestratorContract) stay outside scope unless added.
5. **Chain ordering contradiction (no valid inc-2 insertion point).** The drawings (draw_pid, parts_ledger) run at chain 7036 and read `state.requirementsBom` — but it isn't assembled until 7101, so they READ A STALE PRIOR-RUN BoM today. Must re-seam: Blender-manifest(7036) → assemble ledger(~7045) → annotated draws → BoM. Split generate_drawing_set.py. inc-5 narrative literal-relocation is INFEASIBLE → re-scope to a post-ledger prose-ENRICHMENT pass.
6. **Wrong first move / wrong archetype / wrong risk-order.** Building the ledger on RAS (mid-fix, 5/8 scoreboard broken) means you can't tell "ledger bug" from "RAS still-broken." Rate-unification (£14-vs-£6) BREAKS CO2/SAF (their numbers come from the £6 build-cost-basis path) — reconcile PER-ARCHETYPE, not one global. buildCostBasis carries load-bearing AACE estimate-class/RFQ provenance + curve-fitted HX/blower costs (NOT mass-derivable) — route into the ledger, don't delete. No frozen baselines exist on disk — PIN scorecard.json per archetype first.

## REVISED SEQUENCE (council-endorsed)
- **Phase 0 — typed service at source.** Emit `service{}` from universal-contract-sizing.ts at synthesis. The real root fix; everything else depends on it. Add the in-ledger plausibility invariants (mass↔vol↔density; material ∈ family-set; £/kg in band; frame≠pressure-shell).
- **Phase 1 — the 20% reconciliation (cheap, safe, ~80% of the benefit, additive):** ONE material/fail-state resolver imported by all drawings + _connection_rows; ONE rate set per archetype (kill the £14-vs-£6 fork without moving CO2/SAF); narrative + keyMetrics + compliance READ the authoritative requirements_bom rows (stop the word-engine computing a parallel BoM). Closes the cover-banner bug.
- **Phase 2 — absolute-plausibility gates REPLACE the consistency net** (before any unification). gate-32 re-derives independently.
- **Phase 3 — the full part-centric ledger, built ADDITIVELY on a PASSING archetype (CO2/SAF) behind a shadow flag** (LEDGER_ASSEMBLE=shadow|on, render-both+diff, per-increment rollback, inc-3 cost = one atomic flag). Per-family characterisers. Then migrate RAS. This is where the ports story (#157) + #136-by-id (replace every fuzzy name-resolve with id lookup) land.
- Schema additions (seat 1): port.service_code+dn; pre-resolved fail_state{action,basis}; control-loop primitive; electrical port breaker/CSA/voltdrop + genset/ATS source nodes; geometry.clearance_mm; rating as LIST (shaft+nameplate); keep BOTH qty+modelled_qty; assembly children as first-class parts; boundary nodes (grid/sea/atmosphere); open medium/via enums (busbar/harness/rf/data/propellant).

NOTE: the red-team's "reconcileBomTotalsToAuthoritative doesn't exist" is wrong — it WAS added to render-minimal-pdf.tsx this session (grep binary-detects that file; use grep -a). Its broader point (the banner bug is keyMetrics/compliance, outside the BoM-divergence scope) stands.

---

# RESUME STATE (post-compaction pickup — read this first)
- **Where we are:** ledger refactor, **Phase 0 DONE** (commit 67dfd9e8d): typed `service{fluid,phase,pressure_bar,fabrication_family,criticality}` emitted at synthesis (universal-contract-sizing.ts `deriveService`/`annotateServiceFamilies`) from the DRIVER not the noun; requirements_bom reads it (structural→£/m², not hoop-stress); plausibility invariant (no pressure shell without fluid+pressure+vol≤5000 m³). Frame £42.36M→£275k; RAS BoM £51M→£9.3M; CO2/SAF byte-identical. Harness invariants `no_pressure_vessel_without_fluid_service` + `no_57000m3_shell`.
- **Validating:** ras-v13 (chain run, PID was 38980) confirms Phase 0 live; waiter `bkndi8z2b` reports BoM Σ (want ~£9.3M, no line >£2M) + £/t·yr. CHECK its result first.
- **Score trajectory (6-seat council):** 3.7 (v4/v7) → **5.67 (v10)** → 5.17 (v11, regressed) → v12 had the £42M frame → v13 ≈£9.3M after Phase 0. Council facts/scores in out/ras-v{4,7,10,11}/COUNCIL-*.md.
- **NEXT — Phase 1 (council-endorsed, safe, additive):** (a) ONE shared material/fail-state resolver imported by draw_pid + draw_process_schedules + draw_single_line + requirements_bom._connection_rows (kill the 3-way material fork); (b) reconcile the 316L £14(requirements_bom)-vs-£6(build-cost-basis) rate PER-ARCHETYPE (CO2/SAF expect £6 — do NOT globally unify or they regress); (c) keyMetrics + brief-compliance READ the authoritative requirements_bom total (the £51M banner lived here — now ~£9.3M honest-over-£5M, deferred). Then **Phase 2** (absolute-plausibility gates REPLACE the cross-surface consistency net — gate-32 must re-derive £/output from a path the ledger doesn't feed) and **Phase 3** (full part-centric port-ledger, shadow-flagged `LEDGER_ASSEMBLE=shadow|on`, render-both+diff, built on a PASSING archetype CO2/SAF first then migrate RAS; per-FAMILY characterisers; replace every drawing's fuzzy name-resolve with id-lookup; the #157 signal/network drawing).
- **DISCIPLINE (memory drawers):** verify on the LIVE chain path not the cached out/ras-vN/state.json (it's a stale cache); a parallel fix-batch can regress the WHOLE even when each verifies locally — gate on a whole-system check before re-score; the ledger must NOT collapse the cross-surface error-detector (gates go green on a uniformly-wrong dossier) — that's why Phase 2 precedes full unification. FORBID git ops in subagent prompts. grep -a on render-minimal-pdf.tsx (binary-detected).
- **Scoreboard (the real AIM, task #155):** 5/8 archetypes still failing (compute_heat 11, BESS/vertical_farm/satellite 10, edge_ai 18) — RAS is ONE archetype; the universal fixes must be verified across all 8.

## v13 CONFIRMED (Phase 0 live, end-to-end)
RAS BoM £51,074,821 → **£10,668,668**; Structural Frame £42.36M → **£275,390**; zero lines >£2M; typed service emitting live. ~£52k/t·yr installed = the full-size-scenario cost (ceiling deferred per Tristan; cheaper variant = #97). Phase 0 source-fix VERIFIED. Resume at Phase 1.

## 2026-06-17 PROGRESS — Phase 1c DONE; material single-source DEFERRED (classifier bug)
- **Phase 1c DONE + pushed (commit 222f43004):** the independent cost-sanity gate (gate 32) recorded its verdict on the STALE early partVerifications subtotal (£4.79M ex-works) because it ran BEFORE the requirements_bom reconcile (£10.67M); the exec-summary renders state.costSanity, so the stale £23,501/(t·yr) MED leaked into the dossier and contradicted the £10.67M cover. FIX: chain re-runs computeCostSanity on the authoritative state right after the reconcile (serial-design-chain-v2.tsx ~7123) → £52,297/(t·yr). ALSO added an honest ex-works `aquaculture_ras` class band £10k-55k/(t·yr) to independent-cost-sanity-audit.ts so a plausible small-RAS cost reads PASS instead of being false-flagged HIGH by the CO₂-calibrated throughput band (the over-£5M-ceiling stays a separate honest brief-compliance matter). Invariant `UNIVERSAL.cost_sanity_reads_authoritative_bom_and_class_band` (absurd RAS still HIGH, CO₂ undercount still HIGH). Verified on v13 (no chain run needed — computeCostSanity is pure): stale MED→authoritative PASS.
- **Phase 1a material single-source ATTEMPTED → REVERTED (NOT byte-safe; classifier bug):** made connection_sizing publish its material label on the connection-schedule rows + requirements_bom read it (kill the 2nd classifier). Reverted because `connection_sizing.corrosive_service_material` has FALSE-POSITIVE oxidiser matches: its `oxidis` regex matches the UNIT NAME "thermal_oxidiser" (a purge-gas line to a combustion unit is NOT oxidiser service → SAF gets 2 lines wrongly HDPE→316L, breaking byte-identity) AND it tags a water LOOP line that merely passes through an O₂/ozone unit as 316L (RAS lines 204/205, ozone/LOX in the context blob). Single-sourcing NAIVELY would (a) regress SAF cost + (b) propagate the classifier bug INTO the BoM — exactly council killer-finding #1/#2 (the ledger makes BoM+drawings agree WRONGLY; noun-regex on a name-blob relocates the trap). REQUIRED FIRST: fix `corrosive_service_material` to key oxidiser-316L on TYPED signal (phase=gas / a genuine LOX/ozone SOURCE endpoint), not a bare `oxidis`/`ozone`/`o2` substring in the context — then single-source. This ALSO fixes a live drawing defect (SAF/RAS isometrics+line-list already show these false-316L lines). Queued as a dedicated increment (needs a re-run + visual + per-archetype scorecard).
- **NEXT (clean Phase 1a piece):** fail-state shared resolver — promote draw_process_schedules' ledger-driven resolver (`fail_action_from_text` / `collect_fail_state_quantities` / `fail_action_from_contract` / `valve_fail_action`, which reads contract `*_fail_state` quantities) into a shared stdlib module; have draw_pid import it (replace the narrow `_o2_dosing_fail_open`). Additive, byte-safe (same FO/FC answers), kills the two parallel fail-state computations.
- **In flight:** OpenRouter model-update audit (sub-agent) — update council/emitter/specialist model IDs to the newest OpenRouter slugs BEFORE the next council re-score, so the re-score uses current models.
