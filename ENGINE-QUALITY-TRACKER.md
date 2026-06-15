# Universal Engine Quality — Tracker

**Goal:** a deterministic, **universal** engine producing a dossier an engineer would be thrilled with — every part and connection *governed by a tool*, physics-derived, *holistically balanced*, all surfaced and checkable. RAS (aquaculture) is the live exemplar; **every change must be universal (no per-class logic).**

_Last updated 2026-06-15. Run under inspection: `out/ras-converged` → `dashboard.html`._

---

## ▶ RESUME POINT (post-compaction, 2026-06-15)

**Sequence Tristan set:** physics tools → Blender → 8 drawings → loops → BoM. Get each EXCELLENT *before* the PDFs. **Every change universal (no per-class logic).**

- ✅ **PHYSICS TOOLS — DONE + PROVEN.** Every component type computes its own physics in the shared module `scripts/component_engineering.py` (vessel · pump · blower/fan · heat-exchanger/heat-pump · transformer · panel/switchgear · valve · motor + the humidity/dehumidification load). **Proof:** `.venv/bin/python scripts/prove-physics.py` → COVERAGE PASS (47/47 parts spec'd-or-structural) · 5/5 formulas re-derive exactly · DETERMINISM PASS. Commits `f2e6605e8` + `0db8f5313`.
- ✅ **BLENDER — TANK ASPECT + FREEBOARD + ONE GEOMETRY (#136 geometry).** Commit `a14a1d812`. (1) open tanks now size SHALLOW + WIDE via a scale-aware water-depth band (clamp 0.4·V^⅓ → [1.5,4] m) + 15% freeboard: rearing tank ⌀9.5×4.7 (h/d 0.49, silo) → ⌀12.4×3.2 (h/d 0.26, shallow); towers/columns stay tall. (2) the parts-manifest reports the CANONICAL SHELL not the furniture-inflated bbox (plinth + top guardrail were a 1.9× phantom over-read) → BoM, GA, 3D agree on ONE tank, shell 386 m³ vs 334 working = honest 16% freeboard. Verified by re-render + LOOK (10 shallow circular tanks, degasser column tall); physics still PASS; invariant `UNIVERSAL.open_tank_shallow_wide_with_freeboard`.
- ✅ **8 DRAWINGS — derive from ONE shared source + reflect the new geometry.** Regenerated the full set (`generate_drawing_set.py`) off the re-rendered manifest/route-manifest; LOOKED at GA, P&ID, single-line, HVAC. GA plan+elevations now show the SHALLOW tanks (TK-101…110, plant 64.5×108×14 m); P&ID shows the recirc chain O₂→tanks(×10)→drum→biofilter→degasser→O₂-cones→UV + heat-pump loop; single-line board is correctly **400 V / 1024 A** for the 674 kW load (the "1,000 V" was a thumbnail misread); HVAC carries a sized AHU (15.12 m³/s), not empty. The drawings are structurally sound and geometry-consistent.
- ✅ **LOOP / TOPOLOGY (#135) + naming + BoM cost — ALL THREE issues FIXED, universal.**
  1. ✅ **Recirc loop CLOSED** (commit `a624b4dad`). 0 fluid edges returned to the tanks → 4 bugs fixed (`_vol` dict-read; directed dedup; fluid-capable filter; loop-flow sizing) → tank in = Protein Skimming DN300 recirc return.
  2. ✅ **Signal-vs-power + 1500 V board FIXED** (commit `973721c43`).
  3. ✅ **ORPHANS → 0** (universal). Built `augment_topology_connect_orphans` (build_universal_scene.py) + made `_required_services` (component_engineering.py, the SHARED classifier) **MODULE-PRIMARY**: a part inherits its module's service (power-dist→power, safety→signal, fluid→water) ONLY when name keywords left it unclassified — so a busbar/fuse/manifold/e-stop gets wired but a temperature SENSOR stays signal-only. Orphan flag relaxed to "isolated AND needs-a-service" (pure structure exempt). **Result: orphans 35 → 0.**
  4. ✅ **P&ID VISUALISES THE LOOP** (agent, draw_pid.py). Universal back-edge detector `_infer_return_loops` → "RECIRC RETURN" leg UV→tanks (verified in render). Once-through plants draw 0 return legs.
  5. ✅ **BoM VESSEL COST BAND** (agent, requirements_bom.py). Volume-parametric install factor (1.2–1.7×) + corrected material £/kg → rearing tank £93k → **£194k/tank** (in the £150–250k band); hand-derivation matches; `--selftest` OK. Universal — no per-class price table.
- **LOOP COUNT + DETAIL GROWTH (Tristan's question).** One comprehensive connectivity pass run; it SETTLES at orphans=0 (deterministic → re-running is idempotent, correct for a settled system). The system IS measurably more detailed this session: **connections 11 → 53**, **BoM rows 70 → 95**, **BoM £1.42M → £3.05M**, **orphans 35 → 0**, **DN300 pipe 241 m → 1198 m**. All 6 dashboard sections present (brief · expanded brief · tools · Blender · 8 drawings · full BoM) + every key image LOOKED at (P&ID return leg, single-line, GA, iso, hero).
- ▶ **REMAINING (next depth lever):** (a) **sub-assembly explosion** — explode each principal part into sub-components (tank→shell+nozzles+manway; pump→motor+baseplate+seal) so the BoM keeps DEEPENING pass-over-pass (the true "4× loop adds detail"). (b) **13 ungoverned parts** — wire a governing tool to each. (c) per-device feeder kW (single-line shows a uniform 54 A default where the contract lacks per-device power). (d) #138 wire the dashboard's physics/governance into the dossier PDF.

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
