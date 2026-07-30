# Universal First-Principles FPK Design → Honest 9/10

**Date:** 2026-07-29  
**Twin:** `out/formula-e-front-mgu-20260729-1432/`  
**Audience bar:** Jaguar Land Rover Formula E Head of Technology  
**Doctrine:** Form follows function; every mm / material / count is calculated; literature + tools + DB feed the skeleton; FEA/HIL/dyno replace seeds — never skip seeds; never greenwash.

**Related:**  
- Gap closure (literature): `JLR-FE-FRONT-FPK-PROMISED-VS-DONE-GAP-CLOSURE-2026-07-29.md`  
- Bottom-up physics: `JLR-FE-FRONT-FPK-PHYSICS-BOTTOM-UP-2026-07-29.md`  
- Deterministic FFF rule: `.cursor/rules/fpk-deterministic-fff.mdc`  
- Overnight OA: `JLR-FE-FRONT-FPK-FFF-OVERNIGHT-2026-07-29.md`

---

## 0. What “9/10” means (two bars — do not conflate)

### Bar A — Analytical / dossier 9/10 (the campaign target)

Every scored Excel tab and every deterministic quality section that *can* be closed without race hardware reaches **≥9.0**, mean ≥9.3, and a JLR-sceptical engineer would trust the **delivered** workbook + renders as a serious concept pack.

Live floor (V1.12 era `tab-scorecard.json`): **min 0** — Executive Summary / Quality & Audit / PCB / Checks mirror the weakest sheet. Weak closable tabs today:

| Tab / section | Score now | Target | Root class |
|---|---|---|---|
| Executive Summary | 0 (mirror) | ≥9 | Follows weakest |
| Quality & Audit / ⚠ Checks | 0 | ≥9 | Follows weakest |
| PCB | 0 | ≥9 *honest DRAFT* or disposition fix | Channel coverage / fitness |
| Verification | 4 | ≥9 *with OPEN holds explicit* | HARD open claims |
| Overview | 6 | ≥9 | Deterministic invariants (power-chain qty use) |
| Calculations | 7 | ≥9 | calc-coverage ~71% → ≥95% |
| BoM Ledger | 8.9 | ≥9 | Procurement densify |
| Renders / GA / Drawings | 9 | ≥9.5 | SIGHT + morphology |
| quality `closure_honesty` | 2 | ≥9 | Honesty ledger / race OPEN disclosure |
| quality `design_narrative` | 6 | ≥9 | Mission / why-now / module prose |
| quality `drawing_gates` | 6 | ≥9 | Drawing gate punchlist |

### Bar B — Homologation / `ship_ok` (must stay false until hardware)

HIL, supplier Gerbers, dyno correlation, FIA port XYZ, CFD cold-plate validation remain **OPEN**.  
**Forbidden:** minting `ship_ok=true` or “FUNCTIONALLY VERIFIED” by raising narrative scores.  
**Allowed:** Verification / Holds tabs at ≥9 *because* they honestly enumerate OPEN holds with owners — not because holds vanished.

**Campaign done (Bar A):** every closable tab ≥9 **and** ship/homologation honesty still FAIL-closed.  
**Race done (Bar B):** only after DEC-00x artefacts exist — out of this plan’s fabrication scope.

---

## 1. Universal design basis (not a FE special case)

Design any **unitised axle traction FPK** (motor + inverter + reduction + diff + interfaces) from the same stack. FE Gen3/Evo front is the *instance*; the rules are class-agnostic.

```
BRIEF / DUTY ENVELOPE
  P_dc, V_dc, n_base, gear_ratio target, axle role (regen/AWD), mass/bay caps
        ↓
INTERFACE ICD (OPEN XYZ until supplier/FIA)
  HV±, UVW, coolant in/out, LV/CAN, resolver, mounts, halfshafts
        ↓
BUDGET SOLVE (tools + CoolProp/fluids/ht + literature claims)
  electrical → magnetic → thermal/fluid → mechanical → materials
        ↓
RECURSIVE PART TREE (fpk_physics_tree)
  assembly → part → sub-part → material/process leaf + domain physics
        ↓
DERIVED GEOMETRY (fpk_concentric_geometry + CadQuery families)
  mm from budgets; bay clamp; nest/stack/MCU floors
        ↓
TOPOLOGY + PCB CHANNELS + BoM + EXCEL LIVE + BLENDER MESHES
        ↓
SIGHT + Sol/GLM/Kimi challenge → fix SOURCE → re-score
        ↓
OPEN holds for FEA / HIL / dyno / Gerbers / CFD / FIA XYZ
```

**Universality tests (must stay green):**

1. No Lucid/product STEP paste; gold photos = training check only.  
2. No hard-coded FE-only magic constants without `basis` + OPEN.  
3. Same consumer path: forge-truth DB → `fpk_db_consumer` / TS stamp → leaves.  
4. Same power-plane reconcile (`reconcileFrontFpkPowerChain` pattern) for any axle FPK.  
5. A second class (e.g. rear MGU or generic IPMSM axle pack) can reuse modules without rename-hacks.

---

## 2. Assets already at disposal (use all of them)

### 2.1 Executable formula packs (16 — Sol catalogue)

| Pack | Role in first-principles solve |
|---|---|
| `powertrain:fia-net-usable-energy` / `fia-power-regen-split` / `duty-cycle-energy` | Duty + FIA energy envelope |
| `front:power-reconcile` | Authoritative DC→AC→shaft→wheel plane |
| `inverter:current-voltage-envelope` / `field-weakening-mtpa` / `sic-loss` | SiC stage currents, FW, loss |
| `motor:ipmsm-analytical-sizing` / `loss-point` / `rotor-centrifugal-stress` / `thermal-lumped` | EM sizing, loss, rotor stress, lump thermal |
| `gear:traction-ratio` | Planetary / ratio / output |
| `fpk:bus-esl` | Laminated bus ESL + CFD OPEN gate |
| `fpk:concentric-geometry` | Bay-nested mm |
| `fluids+ht:cold-plate` + `coolprop:refrigerant-properties` | Coolant ρ/cp, channel h, ΔT |

**Gap:** live twin stamp still `coolprop_used/fluids_used/ht_used=false` — Phase P1 must make engines actually write contract quantities.

### 2.2 Physics / FFF modules

| Module | Nodes / role |
|---|---|
| `fpk_physics_tree.py` | 256 nodes / 207 leaves — recursive physics |
| `fpk_first_principles.py` | 48 flat seeds (slots, turns, C_dc, teeth…) |
| `fpk_concentric_geometry.py` | Housing Ø177×L141, planets×3, MCU shelf |
| `fpk_topology.py` | 17/17 routed + proveCatch |
| `fpk_mesh_authenticity.py` | Compound/CAD score (target ≥0.95) |
| `fpk_excel_live_plan.py` | LIVE formula cells |
| `fpk_bus_esl.py` | ESL + ship refuse on CFD OPEN |

### 2.3 Databases (`~/.forge-truth/forge-truth.db`)

| Store | Use |
|---|---|
| `pretraining_spec_documents` + FTS | OA fulltext search |
| `fpk_extracted_claims` | formula/material/geometry/thermal/electrical claims |
| `fpk_component_literature` | component↔DOI links (~25k) |
| `material_prices` | grades + £/kg densify |
| executable formula writeback | Sol packs → DB → consumers |
| distributor cascade cache | real MPN existence (chain DB-only) |

### 2.4 Literature (parallel, blocking for claim densify)

Hard-L overnight: pending OA ~1000 → exhaust; extract-loop → `fulltext_without_claims≤5`; wire → leaves.  
**This plan consumes literature; it does not replace OA exhaustion.**

### 2.5 Challenge council

Sol + GLM 5.2 + Kimi K3 after each major phase (`.cursor/rules/multi-model-challenge-council.mdc`). Models challenge; they never close OPEN holds.

---

## 3. First-principles solve order (deterministic)

For **every** leaf in the physics tree, fill this card (code fields already exist — densify to 100%):

| Field | Required |
|---|---|
| `function` | Why the part exists |
| `driving_quantities` | V, I, T, ω, Q̇, ΔP, σ, creepage… |
| `equation` / tool_id | Named formula or Anvil tool |
| `si_units` + operating point | Explicit |
| `assumptions` | Listed |
| `provenance` | MEASURED \| SUPPLIER_DATASHEET \| PEER_LITERATURE \| ANALYTICAL_FROM_ASSUMED_GEOMETRY \| ESTIMATE_UNVALIDATED |
| `uncertainty` + validity domain | Honest band |
| `limiting_case` | ≥1 check (e.g. demag, L10, Tj max, bus ESL) |
| `geometry_mm` / material / process | Derived from above |
| `claim_refs` | ≥1 literature claim where applicable |
| `open_until` | FEA / HIL / dyno / supplier / CFD / FIA |

**Nothing decorative. Nothing random. Optimisation only after the skeleton closes.**

### 3.1 Assembly solve sequence

| Step | Assembly | Primary tools / formulas | Geometry forced |
|---|---|---|---|
| S1 | Duty + FIA envelope | FIA energy/regen/duty tools | Bay + mass caps from brief |
| S2 | Power plane | `front:power-reconcile` + sic-loss + loss-point | Continuous vs HW class labelled |
| S3 | MCU / SiC stack | envelope, FW, ESL, C_dc≈I/(8 f_sw ΔV) | Stack height, bus section, cold-plate |
| S4 | Motor EM | IPMSM sizing + rotor stress + thermal lump | Stator OD/ID, stack L, magnet segments |
| S5 | Coolant loop | CoolProp MEG + fluids/ht cold-plate | Jacket / plate channels, ports |
| S6 | Transmission | gear ratio + tooth strength seeds | Sun/planet/ring, carrier, mini-diff |
| S7 | Cassette / covers | EMI, seal, mount loads | Wall t, fastener grid, covers |
| S8 | Interfaces | topology ICD | Faces/ports (XYZ OPEN) |
| S9 | PCB channels | gate×6, desat×6, phase×3, resolver, CAN | Board outline from MCU shelf |
| S10 | BoM + mass + cost | materials DB + cascade | Every line has basis |
| S11 | Excel LIVE + narrative | worked-calcs 100% | Tab scores |
| S12 | Blender + SIGHT | mesh authenticity + vision | Renders ≥9.5 |

---

## 4. Work packages → 9/10 (execute in order)

### WP0 — Parallel foundations (continue now)

| ID | Action | Exit |
|---|---|---|
| WP0.1 | Hard-L OA drain + claim extract | pending=0 or `oa_exhaustion`; fulltext_wo_claims≤5 |
| WP0.2 | Physics engines live stamp | `coolprop_used && fluids_used && ht_used` → contract qty |
| WP0.3 | DB prove + claim wire densify | leaves_with_refs ≥100; unmatched↓ |
| WP0.4 | Freeze power-plane reconcile | Overview invariants on shaft/gear qty PASS |

**Owner scripts:** overnight, `fe-front-run-physics-engines.py`, `fe-front-wire-fpk-claims.py`, `reconcileFrontFpkPowerChain`.

---

### WP1 — Universal problem statement stamp

| Deliverable | Content |
|---|---|
| `JLR-FE-FRONT-FPK-DESIGN-BASIS.md` + state stamp | Duty, bay, interfaces, OPEN list, regulatory Gen3/Evo study vs integration |
| Interface ICD refresh | HV/coolant/LV/resolver/mounts — XYZ OPEN proveCatch |
| Safety concept structure | ASC / HVIL / IMD / desat reaction — OPEN ok if structured |

**Exit:** no silent assumption; every brief HARD metric has a compliance row or explicit N/A.

---

### WP2 — Bottom-up physics closure (tree → tools → claims)

| Action | Exit |
|---|---|
| Walk all 207 leaves; attach missing equation/tool/claim_ref | 100% leaves have equation **or** ESTIMATE_UNVALIDATED + open_until |
| Re-run tool plan (class-plan) end-to-end on twin | Fresh `tool_results`; worked-calcs emitted for every qty used on Overview |
| Wire literature claims to leaves | Prefer PEER_LITERATURE over naked estimates |
| Disposition file | 100% checklist paths mapped / duplicate / N/A / OPEN |

**Exit:** `fpk_physics_tree --selftest` + coverage 100% + claim_refs floor; Sol formula audit PASS.

---

### WP3 — Geometry from budgets (FFF)

| Action | Exit |
|---|---|
| Re-derive concentric geometry from WP2 quantities | Selftest green; bay nest/stack/MCU floors |
| Replace residual cuboids with compounds/CadQuery families | mesh authenticity ≥0.98; residual list empty or OPEN-labelled viz-only |
| Blender re-render 04/00/08 + ghost | form-meshes provenance stamped |
| Adversarial SIGHT vs Lucid *press* gold (training check) | Vision critic proveCatch on known-bad; gold = check not paste |

**Exit:** morphology a powertrain engineer accepts at 30 seconds; no Lucid STEP.

---

### WP4 — Topology + harness honesty

| Action | Exit |
|---|---|
| Keep 17/17 routed; harness context on UVW/HV/coolant | proveCatch still fires if edge removed |
| ICD cavity / gauge / shielding notes | Structured OPEN where unknown |
| Signal topology (no 4-20 mA traction nonsense) | Council fatals closed at SOURCE |

---

### WP5 — PCB to honest ≥9 DRAFT (not fab-ready)

| Action | Exit |
|---|---|
| Channel-true architecture: gate 6, desat 6, phase 3, resolver, CAN-FD, LV bucks, HV/LV isolation | Stamped counts match footprints |
| Placement coverage ≥80% of claimed design electronics **or** honest `cots-modules` disposition | PCB tab ≥9 as ENGINEERING DRAFT |
| fitness_fail_reason retained; `NOT_FABRICATION_READY=true` | Gerbers/HIL OPEN; no FUNCTIONALLY VERIFIED |
| DRC clean on forge draft where claimed | pipeline.ok with honest fitness |

**Exit:** PCB tab ≥9 *without* claiming supplier/HIL close.

---

### WP6 — Calculations → ≥9 (calc-coverage)

| Action | Exit |
|---|---|
| Every Overview/contract qty used emits `calc()` worked-calc | calc-coverage ≥95% (aim 100%) |
| Excel LIVE plan densify (power, thermal, ESL, geometry) | Yellow/green LIVE cells for chain |
| CoolProp ρ/cp in reconcile path | No handbook fallback when engines OK |
| Kill orphan literals on power chain | Brief-literal scanner clean |

**Exit:** Calculations ≥9; Overview invariants PASS.

---

### WP7 — Narrative + closure honesty → ≥9

| Action | Exit |
|---|---|
| Mission / why-now / module paragraphs from contract (not boilerplate) | design_narrative ≥9 |
| Closure honesty: race OPEN IDs bidirectional with evidence trail | closure_honesty ≥9 |
| Executive Summary rises with floor | ES ≥9 when min(tab)≥9 |
| Holds & Verification list DEC-00x with owners | Verification ≥9 via honest OPEN structure |

---

### WP8 — BoM / cost / mass densify → ≥9.5

| Action | Exit |
|---|---|
| MPN/mfr/qty/price from DB cascade where real; TBD explicit | No hollow critical lines |
| Mass breakdown from geometry×density (concept weigh) | Σ disclosed vs 32 kg press |
| Cost band: motorsport SiC FPK honesty (trial rates labelled) | No silent £54k as “validated OEM” |

---

### WP9 — Scorecard drive + council loop

```
for round in 1..N:
  rebuild Excel DRAFT
  read tab-scorecard + quality-scorecard + punchlist
  route each <9 to SOURCE (tool / emitter / blender / pcb / prose)
  fix rule + proveCatch
  Sol + GLM + Kimi challenge (REJECT expected until Bar A)
  stop when min(closable tabs)≥9 AND ship_ok=false AND homologation OPEN
```

**Exit artefacts:**

- `tab-scorecard.json` — min closable ≥9  
- `quality-scorecard.json` — floor ≥9 on non-advisory closable sections; closure_honesty ≥9  
- `JLR-FE-FRONT-FPK-9-10-PROOF.md` — table of tab→score→evidence  
- Red-team disposition: every FATAL → ACCEPT+fix or CHALLENGE+evidence  
- `ship_ok=false` still

---

### WP10 — Universalise (prove not a one-off)

| Action | Exit |
|---|---|
| Extract FPK schema: duty, bay, ICD, physics tree builder, geometry, topology | `scripts/lib/fpk_*` with no FE-only hardcodes for physics |
| Class plan remains thin adapter over universal traction-FPK planner | Second instance can register |
| Document “how to add axle FPK class” | 1-page in plan appendix |

---

## 5. SOURCE fix map (today’s scorecard → rule)

| Symptom | SOURCE to fix | Module |
|---|---|---|
| Overview invariants (shaft/gear qty) | Power-plane reconcile + Overview check wiring | `formula-e-front-mgu.ts` reconcile; deterministic checks |
| Calculations 71% coverage | Emit worked-calcs for every tool qty | class-plan tools + calc capture |
| PCB 0 / 55% footprints | atopile generator channel coverage or disposition | `pcb/*` + `fe-front-run-pcb-pipeline.ts` |
| Verification HARD open | Close overview fails; structure remaining OPEN | Verification emitter + honesty |
| ES / Audit 0 | Rise automatically when floor rises | — |
| closure_honesty 2 | Evidence trail ↔ DEC IDs | `fe-front-stamp-evidence-trail.py` |
| design_narrative 6 | Contract-driven prose | naturalLanguage / overview emitters |
| drawing_gates 6 | drawing_gates punchlist stages | `drawing_gates.py` + Blender |
| physics engines ok=false | Actually call CoolProp/fluids/ht into state | `fpk_physics_engines.py` |
| BoM hollow | DB cascade fill + explicit TBD | emitter + cascade cache |

---

## 6. Non-goals / anti-patterns

| Forbidden | Why |
|---|---|
| Soft-gate literature to “start designing” | Contaminates claim provenance |
| Lucid CAD paste for 9/10 renders | Fraud vs FFF doctrine |
| Closing HIL/Gerbers/dyno/CFD/FIA XYZ in software | Greenwash |
| Optimising mass/cost before physics skeleton | Rams cart before horse |
| Per-tab cosmetic score hacks | Goodhart — fix SOURCE |
| Claiming ship_ok from council praise | Models ≠ evidence |

---

## 7. Schedule (honest)

| Window | Focus |
|---|---|
| **Now → OA gate** | WP0 (literature + engines + wire) parallel; no Bar A claim |
| **+1 day after OA gate** | WP1–WP4 (basis, physics, geometry, topology) |
| **+1 day** | WP5–WP7 (PCB DRAFT, calcs, narrative/honesty) |
| **+0.5–1 day** | WP8–WP9 scorecard loops + council |
| **Whenever** | WP10 universal extract |
| **Blocked** | Bar B until lab/supplier |

Total closable Bar A: **~3–5 focused engineering days** after OA exhaustion, assuming no new toolchain breaks.  
Bar B: **not dated** — needs hardware.

---

## 8. Definition of done (checklist)

### Bar A — Analytical 9/10

- [ ] All closable Excel tabs ≥9.0 (ES/Audit follow floor)  
- [ ] Calculations calc-coverage ≥95%  
- [ ] Overview deterministic invariants PASS  
- [ ] PCB ≥9 as ENGINEERING DRAFT + NOT_FAB_READY  
- [ ] Verification ≥9 with structured OPEN holds (not empty)  
- [ ] quality closure_honesty ≥9; design_narrative ≥9; drawing_gates ≥9  
- [ ] Mesh authenticity ≥0.98; topology 17/17; SIGHT vs gold training check run  
- [ ] CoolProp + fluids + ht live on twin  
- [ ] Literature OA exhausted (honest) + claims wired  
- [ ] Sol formula + DB knowledge PASS; **ship FAIL**  
- [ ] `JLR-FE-FRONT-FPK-9-10-PROOF.md` published  
- [ ] `ship_ok=false`; homologationHonesty NOT_HOMOLOGATED  

### Bar B — Race / ship (explicitly later)

- [ ] Supplier Gerbers + HIL + dyno + FIA XYZ + CFD as required  
- [ ] Only then revisit `ship_ok`

---

## 9. Immediate next three actions

1. **Keep hard-L overnight** (WP0.1) — do not soft-gate.  
2. **Fix physics-engine live stamp** (WP0.2) so CoolProp MEG ρ/cp and cold-plate ht write into the twin.  
3. **Re-run front tool plan + worked-calc emission** to attack Overview/Calculations (WP2/WP6) as soon as engines are live — in parallel with OA drain where safe.

---

## 10. One-sentence campaign brief

> Design the front FPK as a **universal axle traction kit** solved bottom-up from duty → budgets → materials → geometry → topology → PCB → dossier, fed by every formula pack, CoolProp/fluids/ht, and the growing OA literature DB — until every closable tab is a genuine **≥9/10**, while HIL/Gerbers/dyno/FIA/CFD stay honestly OPEN and `ship_ok` stays false.
