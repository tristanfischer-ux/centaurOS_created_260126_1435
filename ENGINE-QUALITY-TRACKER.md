# Universal Engine Quality — Tracker

**Goal:** a deterministic, **universal** engine producing a dossier an engineer would be thrilled with — every part and connection *governed by a tool*, physics-derived, *holistically balanced*, all surfaced and checkable. RAS (aquaculture) is the live exemplar; **every change must be universal (no per-class logic).**

_Last updated 2026-06-15. Run under inspection: `out/ras-converged` → `dashboard.html`._

---

## ▶ RESUME POINT (post-compaction, 2026-06-15)

**Sequence Tristan set:** physics tools → Blender → 8 drawings → loops → BoM. Get each EXCELLENT *before* the PDFs. **Every change universal (no per-class logic).**

- ✅ **PHYSICS TOOLS — DONE + PROVEN.** Every component type computes its own physics in the shared module `scripts/component_engineering.py` (vessel · pump · blower/fan · heat-exchanger/heat-pump · transformer · panel/switchgear · valve · motor + the humidity/dehumidification load). **Proof:** `.venv/bin/python scripts/prove-physics.py` → COVERAGE PASS (47/47 parts spec'd-or-structural) · 5/5 formulas re-derive exactly · DETERMINISM PASS. Commits `f2e6605e8` + `0db8f5313`.
- ✅ **BLENDER — TANK ASPECT + FREEBOARD + ONE GEOMETRY (#136 geometry).** Commit `a14a1d812`. (1) open tanks now size SHALLOW + WIDE via a scale-aware water-depth band (clamp 0.4·V^⅓ → [1.5,4] m) + 15% freeboard: rearing tank ⌀9.5×4.7 (h/d 0.49, silo) → ⌀12.4×3.2 (h/d 0.26, shallow); towers/columns stay tall. (2) the parts-manifest reports the CANONICAL SHELL not the furniture-inflated bbox (plinth + top guardrail were a 1.9× phantom over-read) → BoM, GA, 3D agree on ONE tank, shell 386 m³ vs 334 working = honest 16% freeboard. Verified by re-render + LOOK (10 shallow circular tanks, degasser column tall); physics still PASS; invariant `UNIVERSAL.open_tank_shallow_wide_with_freeboard`.
- ✅ **8 DRAWINGS — derive from ONE shared source + reflect the new geometry.** Regenerated the full set (`generate_drawing_set.py`) off the re-rendered manifest/route-manifest; LOOKED at GA, P&ID, single-line, HVAC. GA plan+elevations now show the SHALLOW tanks (TK-101…110, plant 64.5×108×14 m); P&ID shows the recirc chain O₂→tanks(×10)→drum→biofilter→degasser→O₂-cones→UV + heat-pump loop; single-line board is correctly **400 V / 1024 A** for the 674 kW load (the "1,000 V" was a thumbnail misread); HVAC carries a sized AHU (15.12 m³/s), not empty. The drawings are structurally sound and geometry-consistent.
- ▶ **RESUME HERE — the LOOP / topology (#135), diagnosed.** The drawings exposed THREE topology defects (all upstream of the drawings — fixing topology auto-fixes every drawing):
  1. ✅ **Recirc loop CLOSED** (commit pending). Was: 0 fluid edges returned to the tanks (a RAS that didn't recirculate). FOUR layered bugs found + fixed in `build_universal_scene.py`: (a) `_module_repr_part_name._vol` read `p.dim` (a DICT) as a `(list,tuple)` → always 0 → the module representative silently degraded to the FIRST part, never the principal vessel; now reads the cyl/box dict → the rearing TANK represents the fluid module. (b) `augment_topology_cross_module` deduped module-pairs UNDIRECTED (`frozenset`) so the return leg B→A was suppressed by the forward A→B; now DIRECTED → the return is added (once-through plants author no return grammar link, so still a no-op there). (c) a fluid link whose representative is STRUCTURAL (frame/panel/enclosure) is now skipped (`fluid_only` filter) → no non-physical "tank→frame" pipes. (d) the augmented leg inherits the loop's max `flow_capacity` → the return is DN300 (was DN15). RESULT: rearing tank in = heat-pump (DN250) + Protein Skimming (DN300 recirc return), out = drum filter (DN300 forward). Verified: prove-physics PASS, determinism PASS. NB: the P&ID generator still draws a LINEAR feed→product projection (doesn't *visualise* the loop) — making it render the closed loop is a follow-up.
  2. ✅ **Signal-vs-power FIXED** (commit pending). `build_universal_scene.py:5481` sensor→ctrl link relabelled `electrical_bus`→`signal` (consumers grepped: `'signal'` is a known mechanism, sized by `constraint_kind=current_rating` not mechanism, and the single-line filters on `"electrical" in mechanism` so signal correctly drops off). Verified: 20 electrical_bus/0 signal → 13/7; "Main Controller ×7" power feeders → 0. ALSO ✅ **single-line board voltage FIXED**: `draw_single_line.py:_bus_voltage_label` took an UNGUARDED spec `system_voltage_v`, grabbing the 1500 V DC-bus default `_infer_system_voltage` leaks onto AC edges → board mislabelled "1,500 V"; added the same `[100,1000] V` LV guard the sibling already uses → board now reads **415 V** (verified in SVG + render).
  3. **Naming split (#136 ONE identity).** `recirc_pumps_and_heat_pumps` (process-ID) vs `Heat Pump`/`Recirc Pump` (equipment-name) appear as separate consumers → reconcile to ONE part identity.
  THEN: **BoM reconcile + RAS cost band** (#137) → **wire dashboard physics into the chain** (#138).
- Caveat carried to #137: the rearing-tank BoM line reads ~£93k/tank (10× = £933k) — looks LOW for a 386 m³ FRP tank (real ~£150–250k). Revisit in the BoM cost-band pass, not now.

---

## ✅ DONE (committed to main)

### Tools — selection + creation + robustness
- [x] Relevance sweep — deterministic 188-tool catalogue → relevant subset, cached per brief-hash `9029b7a5e`
- [x] Fail-soft tools — off-vocabulary inputs normalise instead of crashing (53→0) `9029b7a5e`
- [x] Tool-creation on-the-fly + assume-broken self-test gate `9029b7a5e`
- [x] Wiring de-dup **by output** (depth without conflicting values) `d809ad1a7`

### Blender / CAD
- [x] No-template classes → the GOOD universal builder (killed the ghost cube-grid) `d809ad1a7`
- [x] **Power/signal densifier** — power feed per device + signal link per sensor; orphans 35→20, connections 11→30, all sized `4eae0a7b6`

### Brief
- [x] Reasoner brief-expander — thin brief → detailed quantified duties (earlier)

### Dashboard (the inspection surface — `build-run-dashboard.py`)
- [x] 6 sections: brief · tools+results · contract · Blender · 8 docs · BoM `3dc56f96a`
- [x] Routed connections → service-classified BoM rows (length + sizing) `a41b0d9b8`
- [x] Per-part connectivity + orphan detection `cf7632172`
- [x] Governance + checker — governing tool per part, calc per connection `b7a34d901`
- [x] Missing-connection diagnosis (the densifier's work-list) `b0c240337`
- [x] Per-component physics — vessels: material → hoop-stress wall → mass `1354a599b`
- [x] Physics into the cost + comprehensive BoM table with per-line calcs `e555641b6`
- [x] Holistic system balances — power/water/air/heat/O₂/feed + closures `861f6438b`
- [x] Geometry unification — BoM take-off reads the as-built Blender geometry `d2f88de79`

---

## 🔲 OPEN — the changes still needed (all UNIVERSAL)

### A. Per-component physics — extend the vessel pattern to every type
- [ ] **Pumps** — material by fluid (cast iron / bronze / 316L), NPSH available vs required, motor frame, mass
- [ ] **Pipes** — material + wall schedule by pressure/temperature, mass/m, insulation
- [ ] **Air handling** — blowers/fans sized (airflow · static pressure · power · motor)
- [ ] **Humidity** — compute the building moisture / dehumidification load _(the flagged air-balance gap)_
- [ ] **Electrical** — transformer, switchgear, distribution panels: component specs

### B. The convergence loop
- [ ] Run **densify → re-route → re-size 4×** end-to-end; orphans → 0 each round
- [ ] Water tie-ins for the remaining process units (the ~5 genuine water orphans)
- [ ] Label signal cables as **signal** (not power) so the checker clears for sensors
- [ ] Govern the **13 ungoverned parts** (wire their tools)

### C. Geometry + naming (structural)
- [ ] **Calibrate Blender vessel freeboard** — 521 m³ envelope for 334 m³ working ≈ 56 %, looks high; fixing it brings BoM + drawings + 3D down together
- [ ] **Carry canonical ⌀,H on the contract** — emitter + Blender + BoM all read one number
- [ ] **Reconcile process-ID ↔ equipment-name into ONE part identity** — kills the naming-mismatch orphans + the geometry split at the root

### D. Holistic balances
- [ ] Compute the **humidity load** (air-balance gap)
- [ ] Close the **91 kW electrical gap** (itemise the small consumers)
- [ ] Add ledger checks: **control loops** (sensor→controller→actuator closed) · **utility matrix** · **mass/energy closure** enforced

### E. BoM + cost
- [ ] RAS cost **band** — gate flags £16,862/t·yr "med"; the band is too low for capital-intensive RAS (real ~£15–25k/t·yr). Add a RAS-correct band, don't shrink the design
- [ ] Reconcile equipment + connections + cost-stack to the ex-works total
- [ ] Price every BoM line: DB-first → educated guess → live distributor lookup in the background

### F. Chain integration — **CRITICAL**
- [ ] Much of the per-component physics, governance, checker and balances is currently computed in the **dashboard** (a view). Wire the SAME deterministic computations into the **chain/state** so the actual dossier (`chain-v2.pdf`), not just the inspection dashboard, carries them.

### G. Blender (deprioritised)
- [ ] Per-module highlighted views (Tristan: not needed now) — task #131
