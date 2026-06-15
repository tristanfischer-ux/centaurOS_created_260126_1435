# Universal Engine Quality — Tracker

**Goal:** a deterministic, **universal** engine producing a dossier an engineer would be thrilled with — every part and connection *governed by a tool*, physics-derived, *holistically balanced*, all surfaced and checkable. RAS (aquaculture) is the live exemplar; **every change must be universal (no per-class logic).**

_Last updated 2026-06-15. Run under inspection: `out/ras-converged` → `dashboard.html`._

---

## ▶ RESUME POINT (post-compaction, 2026-06-15)

**Sequence Tristan set:** physics tools → Blender → 8 drawings → loops → BoM. Get each EXCELLENT *before* the PDFs. **Every change universal (no per-class logic).**

- ✅ **PHYSICS TOOLS — DONE + PROVEN.** Every component type computes its own physics in the shared module `scripts/component_engineering.py` (vessel · pump · blower/fan · heat-exchanger/heat-pump · transformer · panel/switchgear · valve · motor + the humidity/dehumidification load). **Proof:** `.venv/bin/python scripts/prove-physics.py` → COVERAGE PASS (47/47 parts spec'd-or-structural) · 5/5 formulas re-derive exactly · DETERMINISM PASS. Commits `f2e6605e8` + `0db8f5313`.
- ▶ **RESUME HERE — Blender (#136): tank ASPECT/freeboard.** The rearing tanks render ⌀10.3 × 6.3 m (too TALL; kingfish RAS tanks are shallow + wide, ~1.5–3 m deep). This inflates the envelope (521 m³ for 334 m³ working) AND the BoM tank cost (~£1.5M). Fix the vessel sizing in `scripts/blender-universal/build_universal_scene.py` to a shallow/wide aspect — it cascades: geometry → drawings → BoM cost move together. The BoM already reads the as-built geometry (`d2f88de79`), so fixing the Blender source fixes the BoM too.
- THEN: **8 drawings** (open + scrutinise — NOT looked at properly this session) → **loop 4×** (#135) → **BoM reconcile + RAS cost band** (#137).
- Honest caveat: the physics TOOLS are done; physics RESULTS are only as good as the inputs — the tank-aspect is an INPUT issue (the next step), not a physics-tool bug.

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
