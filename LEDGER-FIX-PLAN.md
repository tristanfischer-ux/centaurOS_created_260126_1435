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
