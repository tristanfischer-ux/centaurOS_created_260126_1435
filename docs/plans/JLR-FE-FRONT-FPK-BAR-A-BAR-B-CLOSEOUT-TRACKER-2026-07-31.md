# Formula E Front FPK — Bar A / Bar B Close-Out Tracker

**Created 2026-07-31 · FORMALLY REWRITTEN 2026-08-03 against the live twin.**
**Twin:** `out/formula-e-front-mgu-20260729-1432/` · **`ship_ok` false** ·
**NOT_HOMOLOGATED**

> The 07-31 body is preserved from §H1 onward as history. Sections 1–5 below are
> the current position and supersede it. Every number here was read from the twin
> on 2026-08-03, not carried from a previous note.

---

## 1. Executive position

**Bar A engine work is complete. Bar A ENGINEERING is gated on one unanswered
question, and Bar B is untouched — correctly.**

| | |
|---|---|
| Deliverable | 31-tab workbook · 23/23 drawing gates · 100% render/GA/SLD coverage |
| Design verdict | **The machine does not make its duty (0.651×) and may breach its magnet limit** |
| The one question | **Is 250 kW continuous, or a 24% duty?** It decides the architecture |
| `ship_ok` | **false** — correct; no Bar B evidence exists |

### The single decisive fact

The contract states **250 kW `basis=continuous`** and, separately, a duty vignette
of **24 s regen in every 100 s (24% duty)**. Both describe the same machine; they
cannot both be true. The consequences are not marginal:

| | continuous duty | 24% vignette |
|---|---|---|
| Magnet temperature | **159.3 °C — breach** (limit 150) | 83.8 °C — 66 K margin |
| DEC-EM-1 speed/stack options | **NONE clears** torque + FoS + thermal | **all four clear** |

So the duty answer is the difference between *"no option exists in this design
space"* and *"any of four works — pick on rotor factor of safety."* It is a
brief-reading question, not a solver run, and it is the highest-value thing Jack
can give us.

---

## 2. Live scoreboard (read from the twin 2026-08-03)

| Gate | Live | Bar | Blocks ship? |
|---|---|---|---|
| `ship_ok` | **false** | A+B | Yes (correct) |
| Homologation | **NOT_HOMOLOGATED** | B | Yes |
| Architecture blockers | **0 open** | A | No |
| **EM duty** | required **125.2193 N·m**, delivered **81.558081** = **0.651×** | A→B | Yes for the duty claim |
| Shaft power vs class | 244.5 kW against a 350 kW label = 70% | A | Design decision |
| **Magnet temperature** | **159.35 °C vs 150 °C — CONDITIONAL breach** | A | Gated on duty + loss |
| Iron loss | **6035 W**, `basis: screening_estimate`, range **3.9–8.5 kW** | A | Two-sided error |
| Machine efficiency | 0.96749 | A | No |
| Thermal screens agree | **YES — 0.1 K** (was 76 K apart) | A | No |
| Closure honesty (gate 40) | **10/10** | A | No |
| Drawing gates | **23/23 PASS** | A | No |
| Render / GA / SLD coverage | **23/23 · 23/23 · 6/6 = 100%** | A | No |
| PCB | 2 routed boards, DRC 0 violations, fitness 7.6/10 | A | `NOT_FABRICATION_READY` |
| Suppliers | 3 archetypes / 7 candidates | A | No |
| Falsifiability audit | **7 of 169 checks cannot fail** | A | Tracked below |
| CAD release coverage | **0%** | B | Partner STEP |
| Hardware correlation | **B1–B10 all OPEN** | B | Yes |

**A note on the torque denominator.** The contract's `mgu_shaft_torque_nm = 119.7`
is the torque *at* the 244.49 kW shaft power. The DUTY requirement is
**125.2193 N·m** — 250 kW electrical through the efficiency chain — which is what
every solver artefact uses. The correct ratio is **0.651×**; quoting 119.7 would
flatter it to 0.681×.

---

## 3. Bar A — closed this session

Nine engine defects, each fixed at SOURCE with a proveCatch. Listed because
several were hiding real engineering findings.

| # | Was | Now |
|---|---|---|
| Closure honesty | 2/10 (floor) | **10/10** — deferred parts declared with their own stated reasons |
| Motor internals | Built (194 meshes) but never exported; coverage 47.8% | **100%** — two registries had drifted |
| GA projection | 23 false disagreements | **0** — the gate assumed every cylinder stands on end |
| Single-line | Generic 400 V AC utility stub | Real HV spine; mechanical parts no longer drawn as electrical loads |
| Cable sizing | 561 A on 2×6 mm² labelled "within spec" | Sized from current; unsized reports `within_spec: None` |
| PCB tab | Missing from the workbook | Renders — 2 routed boards were invisible |
| **Iron loss** | 135.56 W (invented `ke = 1e-7`) | **6035 W** from the real M400-50A |
| **Thermal network** | Film only — 76 K optimistic | Two-source LPTN — screens agree to **0.1 K** |
| LLM in ship decision | 3 blockers bound the gate | Deterministic physics; **1 was refuted** |

### Bar A items 0–7 (this session's work order)

| # | Item | Outcome |
|---|---|---|
| **0** | Duty basis | **Contradiction found and encoded.** Decides everything below |
| **1** | Thermal network | **CLOSED** — 76 K → 0.1 K, breach now correctly reported |
| **2** | Iron-loss range | **Closed as far as software honestly can** — decomposed to corners; closing needs transient FE + measured data ≥1.8 T (**Bar B**) |
| **3** | Magnet breach | **CONDITIONAL** — needs continuous duty **and** ≥ mid loss; either alone clears |
| **4** | DEC-EM-1 | **RECOMMENDATION REVERSED** — see §4 |
| **5** | Gear-oil | **CLEARED** — the "regression" was a stale artefact; charge-floor source fix shipped |
| **6** | Suppliers | **POPULATED** — Hewland, Xtrac, Ricardo, Infineon, Helix, Lucid |
| **7** | Falsifiability | **BUILT** — found 5 more live tautologies |

---

## 4. DEC-EM-1 — the recommendation has REVERSED

Re-scored on the corrected M400-50A loss. Iron loss is ~85% eddy, which goes as
**f²**, so every option that closes the torque gap by raising speed pays for it
thermally.

| option | Hz | T/T_req | rotor FoS | iron W | magnet °C | margin K | @24% duty |
|---|---|---|---|---|---|---|---|
| baseline 19,500 / 98.3 | 1300 | 0.651 | 2.635 | 6,035 | 159.3 | −9.3 | 83.8 |
| 24,000 / 120 | 1600 | 0.987 | 1.740 | 10,830 | 213.9 | −63.9 | 96.9 |
| **24,000 / 130** | 1600 | **1.069** | **1.740** | 11,733 | 224.1 | **−74.1** | 99.4 |
| 27,000 / 110 | 1800 | 1.018 | 1.374 | 12,382 | 231.5 | −81.5 | 101.2 |
| 27,000 / 120 | 1800 | 1.110 | 1.374 | 13,508 | 244.3 | −94.3 | 104.2 |
| 30,000 / 97.6 | 2000 | 1.002 | 1.113 | 13,404 | 243.1 | −93.1 | 104.0 |

**On a continuous duty, NO option clears torque + FoS + thermal.** 24,000 / 130 mm
was the standing recommendation at FoS 1.740; on the corrected loss it trades a
35% torque shortfall for a **74 K thermal breach**. The previous ranking could not
see this — it was chosen on a loss model 45× too low.

**On the 24% vignette every option clears comfortably.** DEC-EM-1 is therefore
entirely gated on §1's question.

Torque ratio and rotor FoS are MEASURED (FE 37-position sweep; CalculiX speed
sweep) and are not re-solved here. The thermal column is the new information.

---

## 5. What remains

### Bar A — software-closable, in priority order

| # | Item | Why it is still open | Est. |
|---|---|---|---|
| A-i | **Five tautological brief checks** — `front_hardware_power_class_kw`, `max_rotor_speed_rpm`, `assumed_vdc_min_v`, `assumed_vdc_max_v`, `assumed_coolant_inlet_c` | Each compares a target to itself and cannot fail — the shape that hid the magnet breach | 1 session |
| A-ii | **`actual_source` / `expected_source` on `Check`** | The falsifiability audit cannot detect tautology generically without it; today it catches only the brief family | 1 session |
| A-iii | **Two tolerance-swallowed checks** (`BoM I-4`, `coolant_viscosity_pa_s`) | Tolerance ≥ expected magnitude — unfailable | small |
| A-iv | **Derived stator thermal chain** | `stator_thermal_chain.py` refuses to publish: a single series chain cannot carry two heat sources. Needs a two-source LPTN with slot fill + impregnation data | Bar B input |

### Bar B — unchanged, and nothing this session moved one

| ID | Hold | Sharpened by this session? |
|---|---|---|
| B1 | Dyno torque / loss / demag maps | **Yes** — must also settle the iron-loss range (3.9–8.5 kW) and magnet temperature, not just torque. A calorimetric loss split closes A2 outright |
| B2 | `torque_reliable=true` | No |
| B3 | HIL / firmware proof | No — PCB is `forgeDraftOnly` |
| B4 | Supplier Gerbers + pinout ICD | No |
| B5 | Chassis port XYZ / mounts | No |
| B6 | Cold-plate / jacket flow bench | **Yes** — now the calibration source for the two-source LPTN screening constants |
| B7 | Gear-oil free-surface CFD + clear case | No |
| B8 | Release CAD (supplier/team STEP) | No |
| B9 | Overspeed / burst FEA release | **Yes** — FoS 1.740 vs 1.374 decides DEC-EM-1 *if* the duty resolves |
| B10 | FIA / series energy tool | **Yes** — this is where §1's duty answer comes from |

### The ask to Jack, in order of value

1. **Is 250 kW continuous, or a peak cap on an intermittent duty? If intermittent,
   what is the duration and repetition?** Worth the whole architecture (§1).
2. **Real duty/lap logs** to replace the illustrative 24 s / 100 s vignette (B10).
3. **Dyno loss split** — settles the 3.9–8.5 kW iron-loss range (B1).
4. **Housing envelope confirmation** — if longer than 140.5 mm assumed, the torque
   problem eases without touching speed.

**`ship_ok` stays false.** The Bar B list being complete is not homologation.

---

# HISTORY — the 2026-07-31 tracker body

*Superseded by §1–5 above. Retained because it records what was believed at the
time and why. Section numbers below are prefixed H.*

## H1. What Bar A and Bar B mean (do not conflate)

### Bar A — concept floor (software-closable)

A chartered engineer can rely on the **dossier as a serious concept pack under named assumptions**: identity-locked quantities, honest screens, readable morphology, Excel LIVE arithmetic, PCB draft topology labelled NOT_FAB, no greenwash of CLEARED/OK/`ship_ok`.

**Done when:** every Bar A row below is `DONE` or `RESULT_UNDER_ASSUMPTIONS` with evidence path, and **zero** architecture blockers that are software-fixable remain OPEN without a named DEC.

### Bar B — race / homologation (not software)

Physical or partner artefacts: dyno maps, HIL, supplier Gerbers, chassis XYZ, flow-bench CFD correlation, FIA release CAD.

**Done when:** hardware holds close with measured evidence. Assumptions **never** mint `ship_ok`.

---

## 2. Bar A — detailed close-out checklist

### A1-NEW (2026-08-03). EM duty — OPEN, WORSE, AND DEC-EM-1 WAS REVERSED

The 07-31 numbers below are superseded. Measured over **37 rotor positions with six
explicit branch circuits**: required **125.2193 N·m**, delivered **81.558081 N·m**
= **0.651×**. The earlier 0.948 came from a 4-position sweep.

**DEC-EM-1 was decided and then REVERSED.** FEMM has no parallel paths; exciting at
TERMINAL current built 28 series turns where the contract says 14. The torque
residual across the correction is ≤3.6e-6 N·m — so the half-current run WAS a valid
proxy and 81.558 N·m stands — but **flux linkage was exactly 2.0000× out**, so every
λ / back-EMF / voltage figure in that campaign was double the terminal value.

Levers, all measured: rotor diameter buys ×1.0012 (worthless — housing allows +1.8 mm);
stack alone needs 149.7 mm in a 140.5 mm housing; more current CLOSES it but is
**inadmissible** (at fixed speed more torque IS more power: 375 kW against a 250 kW
cap). Combined cases: **24,000 rpm / 130 mm = 1.069× at FoS 1.740**, 27,000 rpm /
120 mm = 1.110× at FoS 1.374. **Sequence with the thermal work — raising speed raises
eddy loss as f², and the magnets already breach.**

---

### A1. Electromagnetic duty vs hollow-rotor nest — ⚠ HISTORICAL 07-31 (superseded by A1-NEW)

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

### A2. Gear oil architecture — **CLEARED (screening). The "regression" was a STALE ARTEFACT.**

I reported this as a live regression when I refreshed the tracker earlier today.
That was wrong, and the correction is worth recording because it is a repeat of a
failure mode this campaign has hit four times: **reading a stale artefact and
believing it describes the current design.**

The artefact on disk (2 Aug 05:50) held `cornering_pickup_ok: false`, immersion
0.0715, gear_face **14.0 mm**, sump 123.44 ml. The LIVE twin carries gear_face
**19.2 mm** from `gear_geometry_writeback`. Re-running the screen against current
state gives sump_axial 8.064 mm, oil level 23.14 mm, cornering immersion
**0.2399** against the 0.08 floor — `cornering_pickup_ok: **True**`,
`oil_delivery_screen_ok: **True**`.

**A2 is CLEARED at screening.** Free-surface CFD + clear-case bench remain OPEN
(Bar B, B7).

**Source fix shipped anyway** (`minimum_oil_charge_ml_for_screens` is now wired to
the DEFAULT path): the frozen 350 ml seed no longer stands while the geometry moves
underneath it. On the stale 14.0 mm geometry the helper asks 374.7 ml — a 24.7 ml
shortfall that was the entire difference between pass and fail. A charge the TWIN
states is the team's number and is never overridden; only a defaulted charge is
raised to the derived floor, and the raise is printed.

---

### A2-HISTORICAL. Gear oil architecture — DONE (screening) 2026-07-31

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
