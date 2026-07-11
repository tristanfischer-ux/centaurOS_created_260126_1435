# HANDOVER — Powerwall dossier engine session, 2026-07-11

**Audience:** Cursor (or any coding agent) picking up this workstream.
**Repo:** `/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel` (branch `oxccu-efuel`; NOTE the standing anti-drift rule says canonical = `origin/main` — this branch has drifted since 06-29 and needs reconciling, but ALL of today's work is on it).
**Product under test:** residential Powerwall-3 clone. Brief: `briefs-loop/residential_powerwall_clone.md`. Design targets: 1105×609×193 mm, 13.5 kWh usable, 11.04 kW continuous, ≤130 kg, ~£8.5k ex-works, 230 V single-phase G98/G99 direct tie, air-cooled, sealed IP55.
**Design as it stands:** 88S × EVE LF50K-class 50 Ah LFP prismatic cells @ 281.6 V DC = 14.08 kWh nameplate / 13.58 usable, integrated hybrid inverter (3× MPPT channels, 20 kW PV STC), ~£8.6–8.9k raw-parts BoM with the ex-works→retail gap disclosed as a named commercial hold.

---

## 0. THE ONE-PARAGRAPH SUMMARY

Overnight the loop drove the dossier to floor 9.3 with every tab above 9 — then two outside audits (Grok) and Tristan's own eyes showed those scores were partly **unearned**: the render was an empty translucent box scored 9.6 by a critic that only checked for broken geometry, the P&ID/BFD showed chemical-plant equipment on a wall battery, and the workbook's live formulas disagreed with the recorded scores. The rest of this session **raised the bar** (stricter vision rubric, semantic drawing-domain gate, one-truth formula rule) and then **fixed the artefacts up to the new bar**.

**FINAL CONFIRMED RESULT — run 79 (`out/powerwall-20260711-1307`), the first run with the complete strict stack: floor 9.2, 33/33 tabs PASS, zero FAILs.** Workbook mirrors recalculate to 9.2 = python's 9.2 exactly (one truth). Renders 9.6 **earned** — the strict architectural rubric passed on a fresh first-call judgment (no cache, no tiebreak) over the detailed cutaway (dark segmented pack, orange HV busbars, heatsink fin bank, capacitor trio, PCB, fan rings). All 17 drawing gates green including G10 interior-fill and G11 domain-coherence. P&ID passes via the honest NA-BY-DESIGN declaration; BFD is the honest energy block flow. The loop board is fully dispositioned (every red-team/benchmark finding verified against state and either fixed with a commit or classified with evidence). Deliverable: `out/powerwall-20260711-1307/dossier.xlsx`. The one acknowledged-live engineering-presentation defect is the board-role inversion (§4.1) — real, understood, safe fix designed and unblocked.

---

## 1. HOW THIS ENGINE'S QUALITY LOOP WORKS (read first)

- **Launch protocol:** `bash scripts/run-loop.sh briefs-loop/residential_powerwall_clone.md out/powerwall-board.json powerwall`. This chains: loop-board gate → the design chain → `scripts/lib/ship_red_team.py` (outside reviewer) → board assemble. A run takes ~8–15 min and writes `out/powerwall-<timestamp>/`.
- **The loop board** (`scripts/lib/loop_board.py`, state in `out/powerwall-board.json`): every machine-readable defect from a run (FAIL-tab issues, parts-ledger residuals, benchmark faults, red-team findings) becomes a content-keyed defect. **The gate refuses the next launch until every defect is dispositioned** (`fixed <sha>` / `classified <evidence>` / `blocked <decision>`). A false `fixed` auto-REOPENS when the defect recurs. Quote defect ids containing `&` in the shell (`"tab:P&ID:..."`).
- **The outside reviewer** (`scripts/lib/ship_red_team.py`): one `x-ai/grok-4.3` call per run, reads DELIVERED artefacts (panel md, line list, vision verdict, cost layers, recorded scores as the attack target) → `red-team-punchlist.md`, harvested by the board. Findings are hypotheses — verify each against `state.json` before acting; the seat recurs on known families (see §4.3).
- **Scoring surfaces (all must agree):** python tab-scorecard (`tab-scorecard.json`), the workbook's LIVE formulas (`dossier.xlsx`, verify with `openpyxl data_only=True`), and the schedule's own printed verdicts. **THE THREE-SURFACE RULE:** any PASS/FAIL rule change must be minted on all three in the same commit — the in-cell `fx_verdict` formulas in `scripts/build-excel-export.py` recalculate in the reader's hands and expose divergence (this bit us at 8.9-vs-9.2; see §2.4).
- **Core principles** (project CLAUDE.md, mandatory): fix the SOURCE RULE never the data point; every fix UNIVERSAL (signal-keyed on contract quantities — `enclosure_volume_m3 < 1` is the device-scale signal used everywhere — never a product-class name); every fix carries a regression guard (`--selftest` proveCatch, both directions); never trust stdout — open the artefact.
- **Offline iteration (cheap, no chain run):** rebuild workbook+scorecard: `python3 scripts/build-excel-export.py <run_dir> /tmp/test.xlsx` (WARNING: clobbers the run's `tab-scorecard.json`); re-render scene: `python3 scripts/render-blender-scene.py --state <run>/state.json --out-dir <run>` (delete old PNGs first or it skips); re-run any drawer: `python3 scripts/blender-universal/draw_panel_schedule.py <run_dir>`; gates: `python3 scripts/blender-universal/drawing_gates.py <run_dir>` and `--selftest`.

---

## 2. WHAT WAS BUILT THIS SESSION (mechanism by mechanism, with commits)

### 2.1 Device-scale energy topology (the P&ID/BFD fix) — `f93f92809`, `9e17913b6`
**Problem:** archetype builders hand-author a PLANT topology (`pcs_inverter → heat_rejection`, `step_up_transformer → enclosure_atmosphere`). Device-scale part demotions removed the plant equipment but the topology EDGES survived, so the P&ID/BFD drew chemical-plant architecture on a wall battery (Grok scored them 1/10).
**Mechanism:** `deriveDeviceEnergyTopology()` in `scripts/lib/orchestrator/generic/derive-topology.ts`. On the `enclosure_volume_m3 < 1` signal it REPLACES the authored topology with the honest device graph: battery→DC bus→PCS→grid interface (G98/G99), PV array→MPPT→DC bus, air intake→fan→exhaust (thermal, real kW), battery→BMS→gateway (signal/data). Endpoints are slugs of the design's REAL part names (fuzzy token-overlap resolution downstream); currents = contract kW × 1.25. Wired in `scripts/serial-design-chain-v2.tsx` (search "DEVICE-SCALE topology override"), before the no-topology fallback deriver.
**CRITICAL LESSON (`9e17913b6`):** every derived edge is stamped `_drawing_only: true` and `build_universal_scene.py` filters them out of routing (search "DRAWING-ONLY edges"). Without this, the routed edges minted DUPLICATE schedule rows and the panel counted the same 11 kW PCS three ways (a 33.1 kW board on an 11 kW product, run 77). The drawings read the full topology from state; the scene routes only physical edges.
**Boundary vocabulary:** `grid_interface|pv_string_array|air_intake|air_exhaust` added to `_ABSTRACT_BOUNDARY_RE` in `scripts/blender-universal/connection_ledger.py` so the abstract endpoints never raise orphan concerns.

### 2.2 Real-process edge filter + NA-BY-DESIGN (Grok draft #1, integrated) — `a93a9a520`, `726d7b0df`
**Mechanism:** `_is_real_process_edge()` in `scripts/blender-universal/draw_pid.py` (shared by `draw_process_schedules.py` as `PID._is_real_process_edge`). Only physical fluid/thermal services are P&ID lines; electrical chains, signal ties and unpiped enclosure-air are excluded; liquid-cooled electrical subsystems (coolant/glycol/water/oil/refrigerant in medium/context) are kept.
**TRAP AVOIDED (do not reintroduce):** Grok's draft required medium/DN evidence on every fluid edge — that emptied EVERY codema P&ID (their `fluid_loop` edges carry no medium field; corpus sweep showed fischer-codema-v16..v79 all → 0 kept). The shipped rule: **a fluid mechanism between non-electrical endpoints IS the process claim**; evidence only gates the ambiguous cases. **Before adopting ANY filter change, sweep it against the archived corpus:** `for d in out/*/state.json: len(topo) vs len(kept)` — codema must keep ~44/56, RAS 9/9, SAF 7/8, CO2 7/8, powerwall 0/9.
**NA-BY-DESIGN:** with zero process edges the P&ID renders an engineering-standard "NOT APPLICABLE (NA-BY-DESIGN)" sheet stating what exists instead (`Process.na_reason`, set in `reconstruct_process`). The tab scorer accepts it at BOTH scoring surfaces — `_cov()` AND the content overlay `_sc_drawing()` in `scripts/build-excel-export.py` (the second one was missed first time and clobbered the tab to 0 in run 77; `726d7b0df`). Acceptance requires marker in the SVG **AND** the sealed contract signal — never marker alone.
**The BFD counterpart:** `reconstruct_blockflow()` in `draw_bfd.py` — when `proc.nodes` is empty and `na_reason` set, it builds the honest ENERGY block flow from the full topology (blocks for each electrical endpoint, energy/cooling-air streams with real currents, signal ties as a note). Verified rendering: 9 blocks, "50 A / 50 A / 64 A / 0.28 kW" stream labels.

### 2.3 G11 drawing-domain gate + G7/G10 scale-keying — `f93f92809`, `db35a3a2a`, G7 fix (last commit)
Grok's meta-point: "deterministic gates check geometry/coverage, not whether the drawing represents the right product." Now they do:
- **G11 `drawing_domain`** (`scripts/blender-universal/drawing_gates.py`): scans pid/bfd/single-line/panel SVG text for plant markers. MV/step-up-transformer markers fire when the contract sizes NO transformer AND ties ≤250 V; plant heat-rejection markers (`heat rejection|cooling tower|chiller|CDU`) fire on sealed products. **Negated disclosures are silent** (`"no step-up transformer (direct LV tie)"` is CORRECT content — lookbehind in `_G11_MV_RE`). proveCatch fires on run-75's real pid/bfd, silent on its SLD.
- **G10 `interior_fill`**: a sealed product's Σ part-bbox volume / enclosure volume must be ≥ 0.35 (`INTERIOR_FILL_MIN`) — run 73's empty-shell render measured 24–27%. Pure measure: `interior_fill_fraction()`. Skin parts excluded from the numerator.
- **G7 `site_utilisation` skips sealed products** (last commit): a wall-mounted unit has no site; its "deck" is the render floor prop. Plants keep the gate (v52 proveCatch retained).
- All gates: `python3 scripts/blender-universal/drawing_gates.py --selftest` must stay green; every gate has a proveCatch BOTH directions.

### 2.4 One-truth workbook formulas — `94fdc3e25`
**Problem (Grok's readback):** the workbook's live board-reconciliation formula enforced the bare ratio band [0.8, 1.25] while python applied the micro-board absolute tolerance (|Σ−demand| ≤ 6 A) — the delivered xlsx recalculated Electrical to 8.9 while python recorded 9.2. **The reader's Excel disagreed with the recorded score.**
**Mechanism:** the recon rows now thread `sum_a`/`demand_a` as numeric audit cells and the in-cell formula states `ratio-in-band OR abs-gap≤6` — the identical arithmetic. The build's own "ONE TRUTH read-back: N live score cells match" line is the guard; it also writes the WORKBOOK's numbers into `tab-scorecard.json`. **Verify any scoring change with:** `openpyxl.load_workbook(xlsx, data_only=True)` → `Quality & Audit` B31/B32 (mirrors) and B65 (live floor) must equal python's floor.

### 2.5 Render fidelity stack — `58373cc59`, `93a690491`, `9e17913b6`
The empty-translucent-box render is now a credible cutaway. In `scripts/blender-universal/build_universal_scene.py :: place_sealed_enclosure` (hero pass only; INSPECT/drawings byte-unchanged):
- **PACK-ARRAY expansion:** a qty-N part (N≥8) becomes a band-filling dark pack envelope with module-pitch grooves (the LTEC 26-module look) — never one small box. Signal: the part's own qty.
- **TRUE CUTAWAY:** open-front shell (5 plates + top vent band) replaced the closed box + inset face panel that stacked 3–4 pale alpha layers in front of the internals.
- **Zone equipment boards:** each non-energy zone carries a full-width dark board the real-dim parts mount proud of (the 570×420 mm consolidated-board look).
- **Functional detail** (for the strict rubric): heatsink fin bank ×9 + electrolytic capacitor trio on the power board, PCB-green board + 4 chips in the control zone, ORANGE HV busbar strip along the pack top (the PW3 signature), 2 fan rings behind the vent band, 3 bottom interface terminals. All zone-keyed, deterministic.
- **THREE BLENDER TRAPS (cost 6 render iterations):** (1) `fl.make_mat` expects LINEAR colour — wrap `fl._to_linear()` or dark colours render mid-grey; (2) the hero pass REPAINTS every part's meshes with deep module hues AND every structure-module object with the translucent ghost — material overrides must live inside those repaint loops (pack/`_seg_` exemptions) and visual structure (boards) must live in an equipment module, NOT `structure_containment`; (3) Pass-1 corner/top views frame `compute_scene_bbox()` = the whole world including the 6×-wide mounting wall — `spatial_bbox_override` (new param on `fl.run_render_pipeline`, `scripts/blender-templates/forge_blender_lib.py`) passes the product bbox.
- Reference material: LTEC PW3 teardown (1010×600×193, 26 modules, one 570×420 board, dual fans), PSC unboxing, cleanenergyreviews PW3 review.

### 2.6 Vision critic: strict rubric + tiebreak + pixel cache — `93a690491`, `504bc9fb9`, `a93a9a520`
- **Strict architectural rubric** (Grok draft #3, `_PRODUCT_PROMPT` in `scripts/lib/render_vision_critic.py`): the cutaway must show recognisable functional zones (dense lower pack, PE region, control/BMS, thermal path, service interfaces) — hollow/anonymous-boxes are broken:true.
- **Different-family tiebreak:** a nameless `broken:true` (no defects listed — violates the rubric's own output contract) that survives one same-model retry goes to `VISION_TIEBREAK_MODEL` (default `x-ai/grok-4.3`). A named tiebreak upholds; a clean one overrules with an audit trail (`tiebreak_after_nameless` in the verdict json). **Named verdicts are NEVER overruled** — flag-only doctrine intact.
- **Pixel-keyed cache:** the geometry-hash cache was blind to non-part scene geometry (boards/cutaway changed the IMAGE while parts/route stayed identical → replayed a stale verdict, run 75). `geometry_hash()` now includes the hero PNG's sha256, and a cached nameless-broken is never replayed.
- Scoring policy: a named-defect verdict caps Renders ≤4; nameless-after-tiebreak-upheld caps at 7 (unverified); clean verdict lets the deterministic coverage arithmetic score (run 78: 9.6 earned).

### 2.7 Panel schedule fixes — `2eab7311b`, `32acc6923`, `805e6b79e`, `a93a9a520`
- **PV/AC interface rows:** the MAIN board's Field/Value table states `N× MPPT string input, fused DC isolator <I> A / 600 V DC (IEC 60269-6 gPV) + SPD` and `1× <I> A MCB 2-pole (G98/G99) + SPD`, contract-keyed (`pv_stc_input_kw`, `mppt_count`, `ac_output_voltage_v ≤ 250`). Set on the Panel in `_new_panel()` (NOT in `render_markdown` — no state there), rendered from `pnl.pv_inputs_note`/`ac_interface_note`.
- **Breakdown → correct board** (Grok draft #2): `_reconcile_panels_to_breakdown()` selects its board by SEMANTIC token match (`_breakdown_items`/`_panel_breakdown_score`) and refuses to rescale when nothing matches — it used to rescale whichever board is NAMED main, which is the run-75 data-cross root (see §4.1).
- Sub-board incoming cable re-sized from its own demand (same `_demand_needs_circuit_override` rule as main); supply labels use the board's OWN system (a 282 V DC board is never captioned "230 V single-phase").

### 2.8 Misc honest-scoring fixes
- `dc4f42932`: `headline-deriver.ts` — sub-100-kWh scale renders kWh ("13.6 kWh usable", never "0.01 MWh") on the constraint slot too.
- `db35a3a2a`: cost_sanity MED whose gap IS the recorded `design_to_budget` decision hold renders as a disclosed advisory (HIGH still floors); drawing gate G4 material-diversity keys on FLUID routes only.
- `4d63b39f7` + tiebreak: the vision flake-filter lineage.

---

## 3. POWERWALL STATUS (run 79, `out/powerwall-20260711-1307` — CONFIRMED)

| Surface | Status | Notes |
|---|---|---|
| Floor (python == workbook) | **9.2 CONFIRMED (run 79)** | 33/33 PASS, zero FAILs; run 78's 7.5 was G7 firing on a wall unit (sealed-skip committed + validated in run 79). |
| Renders | **9.6 PASS — EARNED** | strict architectural rubric, fresh judgment, no cache/tiebreak. Hero: dark segmented pack + orange HV busbar + fin bank + capacitors + PCB + fan rings. |
| P&ID | **PASS via NA-BY-DESIGN** | honest N/A sheet; no fake process train. |
| BFD | **10 PASS** | honest energy block flow, real currents. |
| Electrical / Connection trace / Calculations / Line & velocity / Quantities / P&ID / Financial model etc. | 10 | one-truth live formulas |
| BoM (Ledger) / Assembly / Part names | 9.2 / 9.3 / 9.3 | the 9.2 is the honest sub-10 tail (4 parametric-priced commodity residuals) |
| Deliverable | `out/powerwall-20260711-1307/dossier.xlsx` (33 sheets) | run 79, the confirmed artefact |
| Loop board | all 14 active defects dispositioned | `python3 scripts/lib/loop_board.py status --board out/powerwall-board.json` |

---

## 4. KNOWN ISSUES + RECOMMENDED FIXES (priority order)

### 4.1 Board-role inversion (the one acknowledged-live defect) — HIGH VALUE, UNBLOCKED
**Symptom:** the 0.2 kW auxiliary micro-board is named "MAIN DC BUS" (6 A busbar) while the 11 kW / 39 A conversion board renders as a sub-board. The red-team flags it every run (correctly). Both boards' internal data is honest.
**Root cause:** `draw_panel_schedule.py` hub choice ranks candidate boards by TARGET COUNT (`main_hub = max(non_sub, key=non_sub.get)` — the aux board feeds many small loads), and raw schedule rows carry 1.2 A wholesale placeholder amps so magnitude ranking at choice time was blind.
**FAILED FIX — do not repeat:** commit `125021ea5` (reverted in `31b346b96`) swapped kind/name labels POST-FILL. The pipeline has NAME/KIND-keyed passes after fill — especially `_reconcile_panels_to_breakdown` (pre-Grok-#2 it rescaled "the board named main", crushing the renamed 11 kW board's circuits to 0.2 kW) and the J98 demand-override machinery. Any post-fill relabel re-targets them.
**Recommended fix (now safe):** Grok's #2 (semantic breakdown selection, committed) removed the biggest name-keyed hazard. Two options, prefer (a):
 (a) **Choice-time magnitude ranking:** compute per-hub Σ device kW at hub-choice time using the device/equipment kW the circuits later derive from (`_connected_kw_for(base, None, probe_panel, state, 1)` per terminal target, or the parts-manifest kW) — pick the hub with the largest Σ kW, target count as tiebreak. No relabeling, nothing name-keyed crosses.
 (b) Post-fill relabel AFTER every name-keyed pass (grep for `kind == "main"` and board-name keys in the file first: breakdown reconcile, `_set_busbar_rating`, audit operand mints, `reconcile()`).
**Verification protocol (mandatory):** offline drawer re-run is NOT sufficient (the breakdown pass runs only on the chain path — offline passed while the chain broke). Verify on a full chain run's `drawings/panel-schedule.md`: the ≥30 A board must carry the name "MAIN DC BUS", the PV/AC interface rows, and its own 11 kW circuits; the aux board ≤6 A as sub. Then check the excel Electrical tab recalculates 10 (openpyxl data_only).

### 4.2 Process-schedules artefact title — COSMETIC
With zero lines/valves the artefact is still titled "Working Schematic — Line / Valve / Instrument Schedules". The instrument index is real and stays; retitle to "Instrument Index" + an explicit "no process lines/valves — dry electrical product (NA-BY-DESIGN)" note when `PID._process_topology(state)` is empty. File: `scripts/blender-universal/draw_process_schedules.py`.

### 4.3 Recurring red-team classifieds (standing, evidence on the board — do NOT "fix" these)
The outside seat re-raises these most runs; they are verified-honest and classified each time:
- **Cell format:** 88 × 50 Ah × 3.2 V = 14.08 kWh is correct (seat assumes 100–280 Ah formats).
- **OEM-transfer pricing:** the BoM is priced as OEM component fragments (£8/cell, £838 inverter stage, £300 MPPT slice); the seat quotes boxed retail. The gap is the NAMED `design_to_budget` hold (Tristan's option (b), 2026-07-10, `state.decisionHolds`) and the retail comparison lives in the channel_list (£21.8k) / installed (£30.5k) layers.
- **not_found=4 vs perfect connectivity:** different surfaces (MPN-fill residuals vs the connection graph). The 4 residuals (voltage-monitoring sensors, humidity sensors, audible alarm, maintenance bypass switch) are parametric-priced commodities; seeding real MPNs via `scripts/ingest/seed-verified-class-parts.ts` (live-verified writeback + reachability probe; see the file's header discipline) would convert BoM 9.2 → higher.
- **Ewon Flexy 205 @ £977:** real MPN, honest catalogue price, plant-grade selection vs integrated comms = the same integration-depth hold.

### 4.4 Render: next fidelity increment — OPTIONAL
The strict rubric passes, but Gemini still returns nameless-broken sometimes (tiebreak resolves it). To make first-call passes robust: distinct fan blades visible THROUGH the vent band, a visible duct ribbon from fans to the pack channel, AC/DC/PV entry glands on the bottom face exterior, per-module horizontal seams on the pack. All in the `FUNCTIONAL DETAIL` block of `place_sealed_enclosure` (hero pass). Keep everything zone/vocabulary-keyed.

### 4.5 Housekeeping
- **Branch drift:** this branch vs `origin/main` needs reconciling (the ONE-ENGINE rule). All session commits are self-contained; a rebase/merge onto main is the standing instruction.
- **Pre-existing test failures (NOT from this session):** `test_panel_schedule.py` (3 failures incl. "chiller load is electrical") and `draw_pid_test.py` ("CO2 mineralisation: too few DN-sized lines 0/7") fail identically on HEAD~30. Fix or quarantine separately; do not attribute to today's changes.
- **The archetype-preflight idea** (agreed direction, not built): `archetype-preflight.ts` — contract-quantity-consumer check, DB reachability per family, scale-regime declaration, flat-constant lint. Would have caught several of this week's families before a run.

---

## 5. NON-NEGOTIABLE WORKING RULES FOR THIS CODEBASE (learned the hard way; several are in mempalace)

1. **Fix the source rule, never the data point.** Route by the line's `basis` provenance. Every fix universal (contract-signal-keyed), every fix with a `--selftest` proveCatch both directions.
2. **Three-surface mint** for any scoring rule (schedule verdict + python scorer + live fx_verdict formula), verified with openpyxl data_only.
3. **Corpus-sweep any filter/classifier change** against `out/*/state.json` before commit — the author of a patch only saw one archetype.
4. **Two scoring surfaces per tab** — `_cov()` AND `_sc_drawing()`/content overlay `min()` together; an acceptance rule must reach both.
5. **Guards-vs-honest-design:** when the floor regresses right after a correctness fix, check whether the failing check judges a recorded `decisionHold` as a defect or assumes a feature the fix correctly REMOVED (cost_sanity hold, G4 fluid-only, G7 sealed-skip are all this family).
6. **Blender:** linear colours (`fl._to_linear`), hero repaint loops own materials, structure module gets ghosted, spatial bbox override for product scenes, and every containment/spatial fix must END with a self-check that re-measures and prints violations.
7. **Never `git stash`** (it ate uncommitted edits mid-session again); to test pre-existence of a failure use `git show HEAD:file > /tmp/copy` and run against the copy. Commit with `git commit --only <paths>`; push via `git -c credential.helper='!gh auth git-credential' push --no-verify origin HEAD:main`.
8. **Launches are tracked tasks** — never shell `&` (untracked twice this session); the loop-board gate must be OPEN before a launch.
9. **The seat can be wrong in both directions:** verify red-team/benchmark findings against `state.json` before fixing (many are the recurring classifieds in §4.3); equally, a "gates all pass" is not a ship — Grok's standard, adopted: zero genuine outside findings is part of done.
10. **Vision verdicts:** named defects are load-bearing (never retried away); nameless-broken is a non-verdict (one retry → different-family tiebreak → audit trail).

---

## 6. FILE MAP (the ones that matter for this workstream)

| File | Role |
|---|---|
| `scripts/run-loop.sh` | canonical gated launcher |
| `scripts/lib/loop_board.py` | defect board + gate (state: `out/powerwall-board.json`) |
| `scripts/lib/ship_red_team.py` | outside reviewer (evidence pack: contract headline incl. PV, cost STACK LAYERS with real keys) |
| `scripts/serial-design-chain-v2.tsx` | the chain; device-topology override wiring; cost_sanity hold-aware section |
| `scripts/lib/orchestrator/generic/derive-topology.ts` | `deriveDeviceEnergyTopology` (edges stamped `_drawing_only`) |
| `scripts/blender-universal/build_universal_scene.py` | `place_sealed_enclosure` (pack-array, zone boards, cutaway, functional detail, containment clamp + INTERIOR-FILL self-check); `_drawing_only` route filter |
| `scripts/blender-universal/drawing_gates.py` | G1–G11 + `--selftest`; `GATE_STAGE` routing map |
| `scripts/blender-universal/draw_pid.py` | `_is_real_process_edge`, `_process_topology`, NA-BY-DESIGN sheet |
| `scripts/blender-universal/draw_bfd.py` | energy block-flow branch |
| `scripts/blender-universal/draw_panel_schedule.py` | boards, PV/AC rows, semantic breakdown selection, §4.1 lives here |
| `scripts/blender-universal/connection_ledger.py` | `_ABSTRACT_BOUNDARY_RE`, `_ELEC_GEAR_CLOSER_RE` |
| `scripts/lib/render_vision_critic.py` | strict rubric, tiebreak, pixel-keyed cache |
| `scripts/build-excel-export.py` | tab scorers, `_cov` + `_sc_drawing` NA acceptance, fx_verdict formulas, ONE-TRUTH read-back |
| `scripts/blender-templates/forge_blender_lib.py` | `run_render_pipeline` (+ `spatial_bbox_override`), `make_mat` (LINEAR colour!) |
| `~/.forge-truth/forge-truth.db` | parts DB (`pretraining_extracted_parts`, `verified_no_public_mpn_findings`) |

**Session commit range:** `1f8c396d4` (run-57 batch) … `e40a2e7`-family (G7 sealed skip), ~35 commits, `git log --since="2026-07-10 20:00"` on this branch. Every commit message carries its rationale + regression-harness line.
