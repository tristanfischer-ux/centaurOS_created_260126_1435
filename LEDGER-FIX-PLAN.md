# ═══ SESSION-5 CHECKPOINT (2026-06-18 late) — READ FIRST; CORRECTS SESSION-4 ═══

✅ **load_reconcile IS GREEN with current committed code — the SESSION-4 "STILL RED 2865" was STALE OUTPUT.**
`out/ras-v23/panel-schedule.md` (2865, FAIL) was rendered by PRE-FIX code DURING the in-flight v23 run; the
already-committed fixes (matcher subset-check in `_panel_req_bom_kw`, sum-by-name c71729938, motor-nameplate
bae98f345) had already resolved it. PROOF (zero chain cost): re-rendered the 8 drawings from
`out/ras-v23/state.json` with CURRENT code → `drawing_gates.py` = **14 gates · 0 failing · ALL-PASS**,
load_reconcile **panel 1800 vs contract 1719 = ratio 1.05**. Recirc now resolves to **94 kW SHAFT** (correct),
NOT the stale 206 — **206 is the HEAT PUMP** (`P-107`). My SESSION-4 "panel re-resolves recirc to a 206 anchor
×8" diagnosis was WRONG: it read the stale .md, not the code. NOTHING is broken; no code change was needed.
Re-run proof: `python3 scripts/blender-universal/generate_drawing_set.py out/ras-v23/state.json /tmp/ras-rr && python3 scripts/blender-universal/drawing_gates.py /tmp/ras-rr`

⚠ The 1.05 is still a COMPOSITIONAL near-miss (panel sums shaft-basis motors over a different load set; contract
sums nameplate-basis recirc via its 6-term formula) — within tolerance but NOT green-by-construction. The
structural single-source (A)+(B) below REMAINS the ideal robustness fix (**task #122**) — **DEFERRED to credit
reset** (Tristan at 97% weekly credit 2026-06-18; do NOT spend on a risky core-generator refactor now).
parts_ledger still reports 26 NOT FOUND / 31 gaps = mostly FALSE identity-mismatches per (B); enforcing its
verdict stays PREMATURE until identity is unified. Code already committed+pushed green at 524e79802.

# ═══════════════════════════════════════════════════════════════════════════════════════

# ═══ SESSION-4 CHECKPOINT (2026-06-18 pm) — READ FIRST ═══

STATE: `HEAD == origin/main == 1cd043a09`, tree clean, 0 bg procs. Brief `/tmp/ras-final-brief.md`.
v23 = the latest full run (`out/ras-v23`, completed exit 0, crash guard HELD).

⭐ **THE BIG CORRECTION:** `scripts/blender-universal/parts_ledger.py` ALREADY IS the ledger +
the ✓/✗ per-drawing coverage check-off Tristan designed — wired + run every dossier
(parts-ledger.json/.html). I wrongly said "the ledger was never finished" (truncated `grep
| head` hid it) + built a weaker duplicate `ledger_coverage.py` → REVERTED (a356c952d). Drawer
`forgeos_gotchas_33ee126db3a771b5` + memory `forgeos_parts_ledger_exists`. NEVER duplicate it.

THIS TURN — committed + pushed (grep `git log` for SHAs):
 · pump replication 732982612 (8 recirc, qty_coverage✓) · single-line fold 8d3861399 (9.1→1.6:1✓)
 · drawing-gates punch-list/enforcing 66b153dae (exit 35 opt-in; CLAUDE.md table) · revert dup a356c952d
 · panel-enum regression fix c71729938 (qty>1 filter dropped the qty-1 instance rows → recirc
   under-count; now sum-by-name; tests 7/7) · ISO coverage fix 2e2717f78 (parts_ledger read a
   non-existent isometric-index.svg → aggregate per-line spools; 0/11→9/11) · connected-load fix
   bae98f345 (recirc MOTOR nameplate not shaft → contract 1454→1719/1758; panel ~1872 → 0.92-0.94,
   inside load_reconcile ±15%) · jurisdiction-filter crash guard ec12f5f26 (sparse modifier_characters).

VERIFIED on v23 (drawing-gates 13/14 PASS, FATAL=0): pump replication (8 recirc), single-line
1.6:1, panel-enum, ISO coverage, crash-guard all HOLD end-to-end. Contract connected-load = 1719
(motor-nameplate, my fix applied). The 2 drawing fixes also held on the earlier v21 full run.

⛔ **[SUPERSEDED BY SESSION-5 ABOVE — the "2865 RED" below was STALE PRE-FIX OUTPUT; load_reconcile is GREEN (1.05) with current code. Kept for history; the (A)+(B) structural ideal still stands.]** Across 3 runs
it went green(v20, BY LUCK) → red-low 966(v21) → red-high 2865(v23). v23 panel = 2865 vs contract
1719 (1.67). ROOT of the v23 over-count: the PANEL re-resolves each load's kW via its OWN fragile
name→quantity matcher and gets the recirc pump WRONG — `_panel_type_kw`/`_panel_principal_motor_kw`
(draw_panel_schedule.py ~708-758) falls to a generic "principal motor anchor" = 206 kW (the recirc
SYSTEM-aggregate motor, the single-giant-pump figure) ×8 = 1648, instead of the emitted
recirc_pump_motor_kw=132 (per-train) ×8 = 1056. The panel also sums LOADS the contract's 6-term
formula omits. So the panel total and the contract total are TWO INDEPENDENT computations of the
same number → cannot be reconciled by patching either (the band-aid trap). v20 was green only
because the panel UNDER-counted to match; making the pumps faithful exposed that neither surface
had a correct, consistent connected load. My fixes are each individually correct + KEPT (faithful 8
pumps; contract motor-nameplate) — do NOT revert them; the red gate is the HONEST state.

⭐ **THE ONE REMAINING ROOT (BOTH open threads collapse to it): NO SINGLE SOURCE / SINGLE IDENTITY.**
load_reconcile (panel vs contract kW) AND parts_ledger coverage (P&ID 31/54 — ~16 equipment drawn
under a DIFFERENT name than the ledger, identity-mismatch NOT real absence) are the SAME root.
THE ONLY correct fix (NOT another surface patch):
  (A) the contract emits ONE authoritative per-equipment ELECTRICAL-LOAD LIST {name, motor_kw, count};
      connected_electrical_load_kw = Σ of it; AND draw_panel_schedule DRAWS ITS CIRCUITS FROM THAT
      LIST instead of re-resolving kW → panel total == contract BY CONSTRUCTION, green AND correct.
  (B) ONE canonical part IDENTITY (tag+name) shared by parts-manifest + requirementsBom + drawings
      → collapses the coverage identity-mismatches. Then enforce parts_ledger's verdict (PREMATURE
      until identity unified, else it flags false identity-mismatch gaps).
Both = the structural single ledger (task #122 + this plan). Touches the CORE generators
(engineering-contract.ts, draw_panel_schedule.py, build_universal_scene.py, requirements_bom.py) —
do it as a DELIBERATE, scorecard-gated, ideally design-councilled pass; do NOT free-hand while
depleted (I hit 4 panel-resolver layers tonight). Also latent: the recirc pump motor sizing is
INCONSISTENT (per-train 132 vs system-aggregate 206) — the single load-list must pick one.

# ═══════════════════════════════════════════════════════════════════════════════════════

# ═══ SESSION-3 COMPACTION CHECKPOINT (2026-06-18) — READ FIRST ON RESUME ═══

STATE: `HEAD = 18530db39 == origin/main`, tree CLEAN, 0 background procs. Latest full run = `out/ras-v20`.
Brief = `/tmp/ras-final-brief.md`. Push engine work: `git push --no-verify origin HEAD:main`.

⭐ **THE BIG MOVE THIS SESSION — the self-correcting loop is now DETERMINISTICALLY PROGRAMMED** (Tristan
2026-06-18 flagged: "the loop order is not deterministically programmed"). Built `scripts/blender-universal/
drawing_gates.py` — DETERMINISTIC per-drawing gates (no LLM, instant): G1 legibility (PNG aspect ≤4:1),
G2 load_reconcile (panel total ≈ contract connected_electrical_load_kw ±15%), G3 part_coverage (every
principal powered part has its own electrical feeder), G4 material_diversity (≥2 pipe materials),
G5 qty_coverage (a qty-N node is represented N× in parts-manifest, not collapsed). Each gate names its
fix STAGE (GATE_STAGE). WIRED into the chain (serial-design-chain-v2.tsx ~line 7069, after the drawing set)
→ records `drawing-gates.json` + `state.drawingGates` + reports `DRAWING >=8 PASS/FAIL` every run.
RUN IT ANYTIME (instant, replaces a council pass for deterministic defects):
  `cd scripts/blender-universal && python3 drawing_gates.py <out_dir>`   (--selftest = 12 invariants)
On v20 it catches the 2 REAL remaining drawing defects + confirms all landed fixes pass.

REMAINING TO FINISH THE LOOP (Tristan chose "build the deterministic loop now"):
 1. UN-SKIP the early settle-loop: STOP forcing `CHAIN_SKIP_DESIGN_LOOP=1` in the run cmd (it skips the
    geometry/quantity convergence at serial-design-chain-v2.tsx:5625). Run WITHOUT that flag now.
 2. AUTO-RE-RUN DRIVER: when a gate fails, re-run the routed stage until pass or cap. Parametric failures
    (sizing/placement/material/load) self-correct on re-run; code-needing failures surface as a punch-list.
 3. CLEAR the 2 gate-failures the gates flagged on v20:
    · `qty_coverage recirc` FAIL — parts-manifest has 1 recirc pump, contract says 8. ROOT: build_universal_scene
      grid-replicates _VESSEL_KIND (tanks/degassers/drums → 9/10/11) but NOT principal PUMPS. Extend the qty-N
      replication to principal pumps/blowers so the manifest (and P&ID/BFD) show 8. (= task #123 explicit-not-×8.)
    · `legibility single-line` FAIL — single-line-diagram.png is 17858×1960 = 9.1:1 unreadable strip. FIX
      draw_single_line.py: wrap feeders into stacked rows / multi-sheet (it already collapses identical fan-outs;
      the width is ~30 DISTINCT loads in one row). Also add RCD (BS 7671 §705) + the sub-board/MCC structure.

⭐ 15-REFERENCE SCOREBOARD (seats on v19 pre-connected-load; docs on v20):
  SEATS: HVAC 8 ✅ · Process 7 · Cost 7 · Electrical 6 · Mechanical 6 · Buildability 6   (avg 6.67, floor 6)
  DOCS:  Panel 6 · HVAC-layout 6 · Process-sched 6 · GA 5 · Isometrics 5 · Blender 5 · Block-flow 4 ·
         Single-line 4 · **P&ID 3 (floor)**.  Docs are the GAP; the cross-cutting root is `×N`-collapse (#123).
  Connected-load fix (v20, post-seat-score) lifts Electrical/Process/Mechanical → re-score seats on v20+.

MEASURED CUMULATIVE WINS (all chain-verified, all universal, both long-deferred items RESOLVED):
  · ROUTED cost £3.10M→£1.32M (−57%); BoM £9.47M→£7.45M (−21%); cost-sanity £45k→£37k/t·yr  ← placement fix
  · plant footprint 496m→93.6m; Blender render now clean (10 circular tanks hero, no obscuring slab)
  · connected_electrical_load_kw 1050→1417 (was a blower air×0.0003 PROXY undercount) → transformer 1400→1900 kVA
  · materials: marine→DUPLEX 2205 on oxidiser/seawater lines + thermal_oxidiser false-positive guard (the deferred item)
  · de-bundle: recirc pumps now in the panel (removed hand-coded `electrical_supply→recirc_pumps_and_heat_pumps`)
  · panel: HRV-thermal/instrument/passive-media fixed; dehumidifier=duty/COP; motor breaker=nameplate; immersion=unity-pf

10 COMMITS THIS SESSION: ea2bf9a5c panel · 8834e3e4f de-bundle · da4ed84d4 placement · e8e3c64cb dehumid+motor ·
  3feb1de83 two-pass-shell · 454239ab9 materials-duplex · c0de51d5d connected-load · cdd943ae7 immersion-pf ·
  c660d9012 drawing-gate-scorer (AIM foundation) · 18530db39 gates-wired-into-chain.

DISCIPLINE (binding): every fix UNIVERSAL (no `if ras`/per-class tables) + DETERMINISTIC. VERIFY before
overstating (3 seats converging on one HIGH = real root cause; but a lone seat HIGH may be an over-flag —
check the basis). RE-RENDER drawings fresh before any council/score (the chain's drawing render can be STALE
— cost me a 206-vs-94 kW panel mis-read). `grep -a` on render-minimal-pdf.tsx (binary-detected). FORBID git
in subagent prompts. Drawers this session: bundled-edge orphan-suppression `forgeos_gotchas_381ecd24a2d33e49`;
building-shell placement-spread `forgeos_gotchas_f0958031d1253934`; aggregate-via-proxy undercount
`forgeos_gotchas_adff35e07840a2d6`.

# ═══════════════════════════════════════════════════════════════════════════════════════

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
