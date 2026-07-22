# Ruthless critique — organoid dossier (2026-07-22)

SIGHT target: `out/organoid-bioreactor-20260722-0657/` (post fixpack10 merge). Three adversarial
subagents (cost / render-vision / tab-honesty) + my own PCB SIGHT. **Unifying root cause:** the
scorer grades **column-contract arithmetic** (are the right cell-types populated + do formulas
reference drivers), NOT **engineering correctness** — so a well-formed but physically-wrong or
empty tab self-scores 9–10 (Goodhart). Compounded by the **device-scale-regime leak**
(`isWattScaleInstrument`): plant-scale defaults (utilisation hours, WRAS-water MoC, LCOE/DCF
frame, oversized heater, 1000 RPM) land on a sub-1 W benchtop instrument.

## LOOP STATUS (2026-07-22 ~11:05) — ALL known floor-setters fixed; loopbake4 (clean full batch) running
- **Both loopbake3 regressions FIXED `a7e6f5820`**: (1) Inputs orphan drivers — the 14 were DCF drivers left consumerless by the Financial instrument-reframe gate; now suppressed on the instrument path (only load_factor+hours emit, both consumed) → 10/10. (2) ⚠Check fail was an HONEST catch (not the heater check): a TDK NTC floored to £1.00 by `round(0.12)=0` vs £0.12 distributor = 8.3× → commodity floor now skips parts with a confirmed distributor price + 2dp sub-£1.
- **loopbake4 running** with EVERY known code-level floor-setter fixed: render ✅ PCB ✅ cost ✅ Verification ✅ Financial-reframe ✅ orphan-drivers ✅ price-floor ✅ heater ✅ RPM ✅ WRAS ✅ + Cursor fixpack13-16. This is the bake I expect to show the real floor climb. All 29 regression guards pass.
- NOTE: I over-scoped one sub-agent (2 regressions in one) → it ran 35 min / 1.65MB before I bounded it via SendMessage. LESSON: one well-scoped fix per agent.

## LOOP STATUS (2026-07-22 ~10:25) — loopbake3 SIGHTed: big items CLEARED, floor 1.2 = new honest catches
- **Ship axes all PASS**: Cost ceiling (materials £288 vs £385) ✓, PCB readiness FAB-READY ✓, Render vision clean ✓. **Verification off the sub-8 list** (P&P fix worked). The render/PCB/cost/Verification floor-setters are ALL cleared.
- Floor DROPPED 4 → 1.2 — but this is HONEST scoring + my fixes' side-effects becoming the new floor, NOT a quality regression. New sub-8 (non-mirror):
  - **Inputs & Assumptions 1.2** (the floor) — "14 drivers never referenced by any live formula (orphan inputs)" e.g. "Output volume". Likely my new contract quantities (agitation_speed_rpm / peak_heater_power_w) + the DCF-reframe removing the "Output volume" consumer. → diagnosis+fix sub-agent (a77781e) running.
  - **⚠ Checks 6** — "1 of 100 invariants FAIL" (likely the new heater-consistency check — heat-balance may still emit old power). → same sub-agent.
  - **Financial 6** — economics unverified on the OLD plant-DCF frame; the DCF reframe `398c2c2a8` (in HEAD, NOT in this bake) → instrument capital frame 10/10 next bake.
- Killed loopbake3 (grinding quality-loop, can't fix code-level floor-setters). NEXT bake carries: DCF reframe + the orphan/check fix (in flight) + everything prior.

## LOOP STATUS (2026-07-22 ~09:55) — Verification regression FOUND+FIXED; loopbake3 (full batch) running
- **Verification=4 root = REGRESSION from Cursor fixpack13** (`aggregatePipelinePositions` wrote a top-level pcb/positions.csv that concatenated KiCad MECHANICAL placements — fiducials FD*/mounting-holes H*/test-points TP* — so P&P count = 58 vs 35 generator parts → HARD "PCB generator parts ↔ PnP rows" row FAILED). **FIXED `da453106c`**: `_pcb_pos_count()` filters `^(FD|H|MH|MP|TP|AUX)\d` → count back to 35 = 35 → row PASSes. Two agents independently converged on it. Verification should return to ~9.9.
- **Heater duty FIXED `ae739cce6`**: one `peak_heater_power_w` quantity (5W not 5/10 split), cartridge heater removed (Peltier covers heat+cool for sub-1W), + new deterministic heater-power-consistency check.
- **Killed loopbake2** (grinding 59 min in the quality-loop, couldn't lift the floor because the floor-setters needed CODE fixes not in that run; it was corrupting state.pcb→null on its tail). Kicked **loopbake3** with the FULL batch: render fixes + RPM + WRAS + heater + P&P-count fix + Cursor fixpack13-16 + cost/fab-zip/vision-barrier. Expect a big floor jump.

## LOOP STATUS (2026-07-22 ~09:35) — RENDER CLEAN ✅, floor 4 now = Verification
- loopbake2 (0856) SIGHTed: **render-vision `broken: False`, 0 defects** — BOTH render fixes worked; the hero is a coherent sealed instrument, Renders is OFF the sub-8 list. CHECKS FAIL=0.
- **NEW floor-setter: Verification 9.9 → 4** ("1 open issue"). Diagnosis sub-agent (a6ba9b) running: is it a REGRESSION from the agitation RPM fix (a HARD row now target≠achieved) or a newly-exposed honest fail? Fix at source, never relax the check.
- Merged Cursor fixpack15 + fixpack16 (proof harness 28/28 + OD pack). Heater-duty fix still in flight.
- Sub-8 now: Executive Summary + Quality & Audit (MIRRORS of the floor) + **Verification** (the real one).

## LOOP STATUS (2026-07-22 ~08:40) — floor 2.4 → 4
- loopbake1 (0814) SIGHTed: **render/vision BARRIER worked** (sentinel landed +274s, critique ON DISK → honest scoring). **PCB cleared ≥8** (fab-zip + cost fixes); Renders is now the SOLE non-mirror floor-setter (floor 4). CHECKS FAIL=0.
- **Render B7 form-gate WORKED for the body** — 04-product-exterior.png is now a coherent sealed instrument (opaque chassis + fascia display/buttons/LED/port/lid). Defects 5→1.
- ✅ **DONE `88d26de24`** — render iter-2 (exterior floating vial). Root: the exterior keep-list at build_universal_scene.py:13218 used prefix `u_se_le_vial` which kept the TRANSLUCENT glass vessel + fluid visible on views 04-07 even after the clamp pulled it down. Fix: narrow to `u_se_le_vial_collar` (opaque flush sample-port only); vessel + fluid now hidden on exterior views. proveCatch added, all 35+ guards pass. **BAKING NOW to verify render clean + PCB (fixpack13/14) + RPM.**

## LOOP STATUS (2026-07-22 ~08:25)
- Autonomous cron `c79ad92e` every :09/:39. Render B7 fix LANDED (`d0dcdbec3`, form-gate 17494 + containment clamp + 4-assertion proveCatch). **Verification bake running** (loopbake1) — SIGHT `00-hero.png` when it lands; expect NO floating PCB / cuvette tower (form-gated for lab_electronics). Then re-attack + pick next item (device-scale content family: RPM/WRAS/DCF/heater).

## DONE this session (committed + proveCatch)
- **Render B7 form-gate** (`d0dcdbec3`) — the optical-handheld cuvette tower + vertical LED PCB no longer stamped on a vial_bioreactor; universal containment clamp added. Awaiting render SIGHT.
- **PCB fab-zip** (`1e2aa72f5`) — multi-board zip never written (no top-level `pcb/` dir) → PCB tab 0 → dossier floor 0. Fixed + per-board gerber namespacing (was silently colliding 3 boards). Terminal lane.
- **Cost-ceiling basis** (`ee6fe7a10`) — £475-ex-works-vs-£385 FALSE-FAIL on two ship surfaces; brief ceilings a *bill of materials* → now compares materials £287 → PASS. Shared `_ship_cost_layer_check`, wording-keyed. Terminal lane.
- **Render/vision timing barrier** (`e717661ea`) — vision critic ran 22 min, finished AFTER Excel built → false-UNVERIFIED-7 that HID a genuine BROKEN hero (≤4). Barrier waits for `.blender-bg-done` before build. Terminal lane.
- **PCB honesty gates** (`153886f3d`) — Gerber-on-disk + per-peripheral channel coverage. Terminal lane.

## BACKLOG — by priority + lane

### A. Scoring-honesty (Terminal lane — the through-line theme)
1. **`#DIV/0!` in Calculations 10/10** (B74/F74). V_tank=0 divisor. Two fixes: (a) CONTENT — the `P_V = P_w/V_tank` worked-calc must derive V_tank from the real 20–30 ml vessel volume, not `pi/4·T³` with T unset; (b) SCORING — a post-recalc scan must FAIL any scored tab carrying an Excel error string (`#DIV/0! #REF! #VALUE! #NAME? #N/A #NUM! #NULL!`). Recalc happens at `recalc_and_cache` (build-excel-export.py:23588) AFTER scoring — so the scan must run post-recalc and feed the ⚠Checks/floor (ordering work).
2. **Falsified-fault laundering** (Risk&Reg 9.9): a physics-critic finding with `corroboration:"falsified"` (24 V motor on 12 V board, no boost) is parked as non-scoring advisory. **VERIFY FIRST** — "falsified" may mean the critic's claim was *refuted* (NOT a real fault → advisory is correct; the determinism-treadmill warning applies). Read `7-5-physics-critique.json` + confirm the Nidec Copal F280A-24 voltage vs the board rail before acting. If genuinely a real fault → a corroborated finding must down-score its tab.
3. **Empty tabs scored 9** (Interconnect, Assembly): 3 rows each (title + badge + pointer); scored on "SVG present + coverage count", not on-tab content. Scorer should require substantive on-tab content, not a coverage-count proxy.
4. **Verified-out-of-scope scored 8** (Engineering Analysis): empty stress table; a verified-OOS tab should be EXCLUDED from the positive mean, not contribute an 8.
5. **Verification path-length row** target=1 achieved=2 stamped PASS (noun-count floor, not equality) — an over/under-provision passes. Make quantity rows equality-checked where the brief states a count.

### B. Device-scale-regime content leaks (Terminal lane — one root: isWattScaleInstrument)
6. ✅ **DONE `3385b685f`** — **Agitation RPM contradiction** 60/100/1000. Fixed: benchtop_bioreactor archetype now emits ONE `agitation_speed_rpm` (brief-derived, default 60); agitation:power reads it, dissolved-oxygen:control caps at it; bioreactor class-plan wires it. Fermenter 800 RPM backward-compat preserved. Selftests pass. Verifies in next bake.
7. ✅ **DONE `5758573b0`** — WRAS/irrigation-water MoC on electronic/lab parts. Root: brief "nutrient"/"cultivated" tripped the plant-water MoC branch; `_wetted_moc()` matched Debug Header (via "header"), Sterile Filter Vent, Dosing Pump. Fix: 3 guards in `_wetted_moc()` (electronic nouns, sterile lab consumables, isInstrumentDevice → WRAS only for genuine plumbing nouns). Plant-scale unaffected. 5 proveCatch pass. Batches into next bake.
8. **Plant DCF/LCOE on a benchtop instrument** (Financial 9.9): 20-year discounted cashflow treating 20 ml working volume as annual production; "£5.94/ml", 8000 h/yr @ 0 kW, NPV −£1,011. Device-scale should suppress the plant LCOE/DCF frame (same signal that gates 230 V-1φ).
9. **Heater duty 5 W (brief) vs 10 W (calc)** + redundant Peltier TEC **and** cartridge heater on a 0.93 W load (F2 recurrence with a different pair). Cross-tab duty reconcile + single actuator.
10. **All-in capex £546 vs BoM £286 unreconciled** (Financial). Show the reconciliation (materials→+labour+overhead+margin+channel) on the tab.

### C. Cursor lane (PCB) — routed to inbox
11. **KiCad designators 9/34** + **P&P 26/34** on the PCB tab (the remaining sub-8 after fab-zip). Real U1/C3/J2 designators from the generated netlist, and P&P extraction for all placed parts.

### D. Render long-pole (Terminal render lane — B7)
12. **The hero render is genuinely broken** (floating vertical PCB, exploded translucent geometry). **ROOT CAUSE FOUND + FIX IN PROGRESS (sub-agent, 2026-07-22 ~08:15) — do NOT re-dispatch.** `build_universal_scene.py:17494` — the generic `elif _IS_INSTRUMENT_DEVICE:` skin branch has no per-form gating, so a `vial_bioreactor` falls through and gets the OPTICAL-HANDHELD cutaway cues (`_place_instrument_handheld_cues` line 17521: cuvette tower z=764.7 + vertical LED PCB z=760.9, both ABOVE the 740.9mm deck). Fix: form-gate the handheld cues to `_IS_OPTICAL_HANDHELD_FORM` only (mirror the `_IS_LAB_ELECTRONICS_FORM` branch at line 13200); the interior story (`_place_lab_electronics_interior_layout`) is already correct. Plus a universal containment clamp in `place_sealed_enclosure` (line 16465) — no `_contain_placements` exists. proveCatch: no cuvette-tower/led-pcb mesh when `_LE_SIGNATURE=="vial_bioreactor"`; all `u_se_*` bbox_z_max ≤ base_z+H. When it lands → rebake → SIGHT `00-hero.png`.

## Notes
- Excel-only fixes (A1-scoring, cost, fab-zip, PCB gates) RE-SCORE from an existing state.json by re-running `build-excel-export.py <run_dir>` — no full re-bake needed. The vision barrier + content fixes (B) need a fresh bake.
- Cost/render numbers are HONEST — the cost stack is internally coherent (£287 materials in-band), only the gate basis was wrong; the render is honestly broken.
