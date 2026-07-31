# Formula E Front FPK — Bar A / Bar B Close-Out Tracker (2026-07-31)

**Twin:** `out/formula-e-front-mgu-20260729-1432/`  
**Rule:** Bar A = concept under named assumptions (can close in software). Bar B = race / homologation (hardware or partner artefacts). **`ship_ok` stays false until Bar B closes.**  
**Live registers:**  
- Assumption design → `JLR-FE-FRONT-FPK-ASSUMPTION-BASED-DESIGN.{json,md}`  
- Bar B readiness → `JLR-FE-FRONT-FPK-BAR-B-READINESS.{json,md}`  
- Quantity lineage → `fpk-quantity-lineage.json`  
- Multiphysics → `motor-multiphysics.json`  
- Council digest → `_redteam_digest_v2.json` + `_closeout_council_v1/`

---

## 0. Executive scoreboard (live SIGHT — refresh after every restamp)

| Gate | Live status | Bar | Blocks ship? |
|---|---|---|---|
| `ship_ok` | **false** | A+B | Yes (correct) |
| Homologation | **NOT_HOMOLOGATED** | B | Yes |
| Architecture blockers OPEN | **1** — `EM_TORQUE_VS_ROTOR_BORE` | A (architecture) | Soft-blocks “architecture cleared” claims |
| Gear-oil cornering / jet gallery | **CLEARED (screening)** after baffled wet-sump architecture | A | Was OPEN; fixed at SOURCE 2026-07-31 |
| `duty_torque_screen_ok` | **false** (mean ~118.75 &lt; required ~125.21; `torque_reliable=false`) | A→B | Yes for EM duty claim |
| Provenance audit | **PASS** (0 sourceless / 0 HIGH divergence) | A | Was FAIL; fixed |
| Quantity lineage sha | **Present** (`fpk-quantity-lineage.json`) | A | F-PROC-2 partial → module landed |
| CAD release coverage | **0%** | B | Partner / supplier STEP |
| Hardware correlation holds | **6/6 OPEN** | B | Dyno / HIL / flow / overspeed / double-pulse / XYZ |
| PCB Gerbers / HIL | **forgeDraftOnly / OPEN** | B | Supplier |
| Blender per-part explode | **Rendered**; kept as the ASSEMBLY-story view. Framing bug fixed (ortho_scale now covers both axes — it was cropping parts off all four edges). Inventory moved to `14`. | A | Sphere-proxy residual only |
| Blender parts-on-paper | **IMPLEMENTED + SIGHT-VERIFIED** — `14-product-parts-catalogue.png`: 97 labelled cells, 188/188 parts reconciled, 336 mm→5.00 mm, captions `Name xN` + true size. 96/97 captions clear (Motor Housing partly behind its own fins). | A | Awaiting Tristan's human gate |
| Blender cutaway human SIGHT | **ROOT CAUSE FIXED + SIGHT-VERIFIED** — `u_se_td_winding_end_{0,1}` were SOLID full-diameter discs re-sealing the bore behind passing section gates; now annular. `08` shows the planetary nest, shafts and MCU shelf through an open bore. | A | §4.3 checklist 5/7; magnets/planets still sphere proxies |

---

## 1. What Bar A and Bar B mean (do not conflate)

### Bar A — concept floor (software-closable)

A chartered engineer can rely on the **dossier as a serious concept pack under named assumptions**: identity-locked quantities, honest screens, readable morphology, Excel LIVE arithmetic, PCB draft topology labelled NOT_FAB, no greenwash of CLEARED/OK/`ship_ok`.

**Done when:** every Bar A row below is `DONE` or `RESULT_UNDER_ASSUMPTIONS` with evidence path, and **zero** architecture blockers that are software-fixable remain OPEN without a named DEC.

### Bar B — race / homologation (not software)

Physical or partner artefacts: dyno maps, HIL, supplier Gerbers, chassis XYZ, flow-bench CFD correlation, FIA release CAD.

**Done when:** hardware holds close with measured evidence. Assumptions **never** mint `ship_ok`.

---

## 2. Bar A — detailed close-out checklist

### A1. Electromagnetic duty vs hollow-rotor nest — **OPEN (P0)**

| Field | Value |
|---|---|
| Blocker | `EM_TORQUE_VS_ROTOR_BORE` |
| Evidence | `_motor_stack/em_fia_front_kit_case.json` |
| Fail numbers | Required **125.21 N·m**; sweep mean \|T\| **118.75**; ratio **0.948**; peak **207.12**; `torque_reliable=false`; nest_fits_rotor **true**; FoS≈**1.21** |
| Why it is architecture | Planetary strength resize grew rotor ID; magnet annulus vs bore trade-off leaves mean torque short of continuous duty at n_max |
| Why peak must not clear it | Peak is best rotor position — continuous duty uses mean + reliability (`shaft_torque_identity.evaluate_duty_torque_screen_ok`) |

**Steps to close (ordered):**

1. **Decide DEC-EM-1** (human): (a) grow EM annulus / stack / poles inside bay, (b) external planetary (smaller bore), or (c) accept lower continuous front regen kW and re-freeze A-DUTY.  
2. If (a): raise `EM_MIN_ROTOR_RADIAL_MM` / stack length in `fpk_concentric_geometry.py` + writeback; keep nest tip ≤ rotor ID − clearance.  
3. Re-run `em_fia_front_kit_case.py` with **≥36** mechanical positions (not 4) at MTPA current angle.  
4. ProveCatch: mean ≥ required **and** fail if only peak clears.  
5. Keep `torque_reliable=false` until denser map / dyno — that is **Bar B**, not a silent True.  
6. Restamp `fe-front-stamp-motor-multiphysics.py`; confirm blocker absent or replaced by honest `EM_DUTY_TORQUE_SCREEN` if nest no longer fits.  
7. Update ABD pitch + Jack results table.

**Owner:** EM / packaging. **Est.:** 1–3 FEMM wall-clock sessions + geometry DEC.

---

### A2. Gear oil architecture — **DONE (screening) 2026-07-31**

| Field | Value |
|---|---|
| Was | `GEAR_OIL_CORNERING_PICKUP`, `GEAR_OIL_JET_GALLERY` OPEN |
| SOURCE | `gear_oil_fia_front_kit_case.py` — baffled slosh **30 mm**, nozzle **Ø1.8 mm**, charge floor helper → twin **~626 ml** |
| Live | cornering_ok **True**; gallery_ok **True**; ΔP≈**160 kPa** |
| Still OPEN | Free-surface CFD + clear-case bench (**Bar B**) |

**Do not regress:** adversarial proveCatch keeps Ø1.0 mm / 80 ml / 90 mm slosh as FAIL.

---

### A3. Provenance / Calculations — **DONE 2026-07-31**

- Face width ≠ tooth module (`provenance.py` `_GEAR_METRIC_GROUPS` + `gear` generic).  
- `gear_face_mm` / `planet_count` emit `source_detail`.  
- Twin audit: **PASS**.

---

### A4. Quantity lineage (F-PROC-2) — **PARTIAL → module landed**

| Field | Value |
|---|---|
| Module | `scripts/lib/fpk_quantity_lineage.py` |
| Twin file | `fpk-quantity-lineage.json` |
| Live | canonical keys **19**; sha present; motor_stack unique hashes still **>1** (restamp lag) |

**Steps to fully close:**

1. After every quantity edit: stamp lineage → restamp all `_motor_stack` cases that bind state → stamp multiphysics.  
2. Wire lineage sha into Excel header / Calculations note (optional).  
3. proveCatch already: mutation changes sha.  
4. Council digest should list lineage sha (add to `fe-front-build-redteam-digest.py` if missing).

---

### A5. ABD pitch / Jack honesty — **DONE**

Pitch is data-driven; no “screens torque” when duty fails. Keep restamping after EM work.

---

### A6. Blender + drawings morphology — **IN PROGRESS (P0 visual) — Tristan human reject 2026-07-31**

**Human gate (Tristan, unanswered until artefact passes):** cutaway still a black box; explode does not let him inventory parts; he wants **all parts laid out on a big piece of paper with labels**. Full brief: [`CURSOR-TO-CLAUDE-CODE-HANDOVER-FE-FRONT-FPK-2026-07-31.md`](./CURSOR-TO-CLAUDE-CODE-HANDOVER-FE-FRONT-FPK-2026-07-31.md) §4.

| View | Intent | Live SIGHT (2026-07-31, images OPENED — not log lines) |
|---|---|---|
| `00-hero` cutaway | Shell-off + hollow stator/rotor rear-half; nest + PE + SiC | **Bore now open.** Root cause was NOT the section pass (which was correct and green): `u_se_td_winding_end_{0,1}` were built with `add_cyl` as SOLID discs at `stator_od*0.48`, capping both motor ends and re-sealing the guts the section pass had just exposed — the "solid copper ellipsoid". Now `add_hollow_cyl` (r 100.5→115.1 mm), clearing the rotor and opening through to the nest. |
| `08` / ghost / 3D GLB+USDZ | Same open state, rotatable | Planetary nest, motor shaft, stator segments, MCU shelf + busbars all read. Sphere proxies remain the residual. |
| `13-product-exploded` | Assembly explode / lattice | Kept as the assembly story. Framing fixed: ortho_scale governs only the LARGER render axis, so `max_dim × k` was cropping the other axis on a 3:2 frame while the log claimed a correct reframe. |
| `14-product-parts-catalogue` | **Parts-on-paper labelled grid** (Tristan ask) | **DELIVERED.** 97 cells, 188/188 reconciled, `coverage_ok=True`. Rings read as rings, motor housing shows its fins, PCBs/busbars colour-distinct. |
| GA / SLD | Orthographic engineering drawings | Present; not a substitute for shaded inventory |
| Coverage / authenticity JSON | Engine self-score | Can be green while human fails — do not Goodhart |

**SOURCE:** `build_universal_scene.py` (`_fpk_explode_*`, `_fpk_apply_functional_section_view`) + **new** `_fpk_apply_parts_catalogue_view`; register view in `render_view_contract.py`.

**Steps to close visual Bar A (ordered):**

1. **Implement `14-product-parts-catalogue.png`** — every inventoriable `u_se_td_*` on a flat labelled paper grid (pitch ≥120–150 mm); proveCatch; force-render; **open PNG with eyes**.  
2. Improve cutaway (`00-hero` / `08`) until nest + MCU guts narrate in one glance (hide opaque gearbox nest).  
3. Keep `13` as assembly-story explode; raise pitch only if siblings still overlap after paper view exists.  
4. Authenticity residual: replace sphere proxies with CAD/compound roles (`seed_internal_cad_assets` / tier2 motor).  
5. Copy passing PNGs into Excel design-pack; STATUS “How to view” note.  
6. Update this tracker + punchlist only after human SIGHT — not after log lines alone.

**Owner:** morphology → Claude Code. **Est.:** catalogue + cutaway SIGHT = first session block; authenticity sprint separate.

---

### A6b. DEC-EM-1 decision worksheet (copy into Jack)

| Field | Fill |
|---|---|
| Chosen option | (a) / (b) / (c) |
| Owner | |
| Freeze date | |
| Bay / mass impact | |
| Re-run commands | `em_fia_front_kit_case.py` → denser sweep → `fe-front-stamp-motor-multiphysics.py` → ABD + lineage + Excel |
| Pass criteria | mean \|T\| ≥ required **and** proveCatch rejects peak-alone; `torque_reliable` stays false until Bar B map |

---

### A7. Excel LIVE / scorecard — **MOSTLY DONE / VERIFY**

| Item | Action |
|---|---|
| LIVE `T_shaft` | proveCatch in `fpk_excel_live_plan` — keep |
| Calculations after provenance fix | Rebuild Excel; confirm score &gt; 0 |
| Verification HARD opens | Race holds stay OPEN (Bar B) — do not floor Quality falsely |

---

### A8. PCB draft — **DRAFT DONE / NOT_FAB**

Channels match required as draft. Placement overlap residual (U2 vs U6). Gerbers = Bar B.

**Steps:** fix placement overlap in draft; never claim FAB-READY.

---

### A9. Documentation freshness — **DONE this session (refresh after EM/Blender)**

Keep punchlist / plain-language / explainer aligned with twin (no “0 OPEN” lies).

---

## 3. Bar B — detailed close-out checklist

| ID | Hold | What closes it | Who | Assumption placeholder |
|---|---|---|---|---|
| B1 | Dyno torque / loss / demag maps | Measured shaft T–ω–η map vs FEMM | Test / EM | Predicted screens only |
| B2 | `torque_reliable=true` | Map correlation policy + data | EM | Stays false in software |
| B3 | HIL / firmware proof | Bench on populated board | Controls | forgeDraftOnly |
| B4 | Supplier Gerbers + pinout ICD | Files from supplier | Electronics | NOT_FAB |
| B5 | Chassis port XYZ / mounts | JLR ICD STEP | Vehicle | Types-only |
| B6 | Cold-plate / jacket flow bench | Δp / T correlation vs OpenFOAM | Thermal | Analytical + duct Δp |
| B7 | Gear-oil free-surface CFD + clear case | CFD + bench | Transmission | Baffled analytical screen |
| B8 | Release CAD (supplier/team STEP) | Authority coverage → 1.0 | CAD | Parametric families only |
| B9 | Overspeed / burst / pocket FEA release | CalculiX + material certs | Structures | Screening FoS |
| B10 | FIA / series software energy tool | Race CSV (DEC-007) | Race eng | 250 kW freeze |

**Verdict language:** `BAR_B_LIST_FILLED_UNDER_ASSUMPTIONS_NOT_HOMOLOGATED` — list complete ≠ homologated.

---

## 4. Big-push sequence (recommended order)

```
1. DEC-EM-1 decision (human, &lt;1 day)
2. Geometry writeback + FEMM denser sweep          } parallel with
3. Blender re-render explode/cutaway/GA           } 2
4. Restamp multiphysics + ABD + lineage + digest
5. Excel rebuild + scorecard SIGHT
6. Closeout council (Sol/GLM/Kimi) re-attack
7. Jack pack refresh (xlsx + email) — secondary
8. Bar B partner asks only (never invent XYZ/Gerbers)
```

---

## 5. Frozen assumptions that must stay named (Jack)

| ID | Statement | Live seed | Replace with |
|---|---|---|---|
| A-DUTY | 250 kW front regen electrical | 250 kW | Race energy tool |
| A-BAY | 343×259×267 mm / ~32 kg | quantities | Chassis ICD |
| A-OIL-CHARGE | Baffled wet-sump charge | **~626 ml** | Team oil volume |
| A-OIL-JET | Nozzle Ø | **1.8 mm × 8** | Supplier gallery drawing |
| A-OIL-BAFFLE | Effective slosh length | **30 mm** | Sump CAD |
| A-SIC | Module class not MPN | topology seed | Supplier MPN + STEP |
| A-IFACE | Port types only | ICD types | XYZ |

---

## 6. proveCatch / regression map

| Catch | Where |
|---|---|
| Duty never peak-alone | `shaft_torque_identity.py` |
| Oil Ø1.0 mm high-ΔP fails gallery | `gear_oil_fia_front_kit_case.py --selftest` |
| Unbaffled+80 ml fails cornering | same |
| Kit baffled architecture clears | same |
| Provenance face≠module | `provenance.py --selftest` |
| ABD pitch no greenwash | `fpk_assumption_based_design.py --selftest` |
| Lineage mutation | `fpk_quantity_lineage.py --selftest` |
| Blocker honesty | `motor_multiphysics_stamp` proveCatch |

---

## 7. Council close-out pack

**Live OpenRouter call (2026-07-31 ~07:00):** HTTP **402 Payment Required** — quota/billing.  
**Fallback used:** prior `_redteam_v2/` seats (**Sol REJECT 99**, **GLM REJECT 92**, **Opus5** Kimi-fallback) + live twin SIGHT after oil SOURCE clear → `_closeout_council_v1/merged-closeout.json` + `SYNTHESIS.md`.

### Synthesized verdict: **PUSH_WITH_HOLDS**

| Seat (prior) | Verdict | Confidence |
|---|---|---:|
| Sol | REJECT (process) | 99 |
| GLM | REJECT (process) | 92 |
| Opus5 (Kimi fallback) | (parse/reasoning attack) | — |
| Close-out synthesis | **PUSH_WITH_HOLDS** | 85 |

**Council-aligned P0s (union):**

1. Clear `EM_TORQUE_VS_ROTOR_BORE` via DEC-EM-1 + denser FEMM (never peak-alone).  
2. Re-render Blender exploded/cutaway with **per-part** lattice; SIGHT every part.  
3. Keep oil architecture (do not regress Ø1.0 / 80 ml / 90 mm).  
4. Restamp lineage + Excel after EM.  
5. Bar B partner asks only — never invent XYZ/Gerbers; `ship_ok` false.

Re-run `python3 scripts/fe-front-closeout-council.py --rebuild-digest` when OpenRouter billing is restored to get fresh Sol/GLM/Kimi JSON seats. **Do not treat PUSH_WITH_HOLDS as ship_ok.**

---

## 8. Definition of done

**Bar A software push done when:**

- [ ] `architecture_blockers_open` empty **or** only named DEC holds with human owner  
- [ ] `duty_torque_screen_ok` true under mean+reliable rules **or** A-DUTY re-frozen with Jack  
- [ ] Provenance PASS; lineage sha stamped; Excel Calculations not zeroed  
- [ ] Exploded PNG shows individual parts (SIGHT pass); cutaway authentic  
- [ ] ABD / Jack docs match twin; no “0 OPEN” lies  
- [ ] Closeout council re-run finds no new FATAL process greenwash  

**Bar B / ship done when:** B1–B10 evidence exists and `ship_ok` policy flips under homologation process — **not this tracker alone**.

---

## 9. Immediate big-push runbook (owner checklist)

### Day 0 — freeze honesty (done / verify)

| # | Action | Evidence |
|---|---|---|
| 0.1 | Oil screening CLEARED; adversarial proveCatch still FAIL on Ø1.0 / 80 ml / 90 mm | `gear_oil_fia_front_kit_case.py --selftest` |
| 0.2 | Provenance PASS | twin provenance audit |
| 0.3 | Lineage module stamped | `fpk-quantity-lineage.json` |
| 0.4 | Council PUSH_WITH_HOLDS (OpenRouter 402 → fallback seats) | `_closeout_council_v1/SYNTHESIS.md` |
| 0.5 | Catalogue explode SOURCE + force re-render | log `catalogue lattice, pitch=110mm` |

### Day 1 — DEC-EM-1 (human gate — blocks Bar A “architecture cleared”)

| Option | What changes | Risk |
|---|---|---|
| **(a) Grow EM annulus / stack / poles** inside bay | `fpk_concentric_geometry` writeback; FEMM ≥36 pos | Bay / mass / thermal |
| **(b) External planetary** (smaller rotor bore) | Nest packaging rewrite | Architecture change; more CAD |
| **(c) Re-freeze A-DUTY** lower continuous front regen | Jack assumption update; screens re-run | Performance claim drops |

**Record decision in Jack Assumptions sheet + ABD.** Do not peak-clear duty.

### Day 1–2 — after DEC (software)

1. Geometry writeback → `em_fia_front_kit_case.py` denser sweep.  
2. `fe-front-stamp-motor-multiphysics.py` → blockers / duty screens.  
3. Stamp ABD + lineage + redteam digest.  
4. Rebuild Excel; SIGHT Calculations ≠ 0; scorecard honest.  
5. Blender SIGHT pass (§A6 checklist).  
6. Re-run `fe-front-closeout-council.py` when OpenRouter billing restored (Sol + GLM + Kimi).

### Parallel — Bar B partner asks (never invent)

Send / refresh Jack xlsx asks for: dyno map, chassis XYZ, Gerbers, oil CFD/bench, flow bench, release STEP. Every ask maps to B1–B10. `ship_ok` stays **false**.

### Hard stops (never do)

- Mint `ship_ok` / CLEARED / homologated from software screens  
- Clear `EM_TORQUE_VS_ROTOR_BORE` on peak FEMM alone  
- Set `torque_reliable=true` without map policy  
- Invent XYZ / Gerbers / dyno CSV  
- Claim oil CFD closed because analytical cornering_ok  
- Claim Bar A done while exploded SIGHT still shows sphere clutter
