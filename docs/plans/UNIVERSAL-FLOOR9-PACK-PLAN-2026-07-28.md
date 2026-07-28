# Universal floor-9 pack plan (2026-07-28)

**Council:** Opus 4.8 + GPT-5.6 Sol (“Terra 5.6”)  
**Cursor:** execute; Tristan owns priorities  
**Test artefact:** `briefs-loop/benchtop_cell_cycler.md` → `consumer_electronics` / `bench_power_instrument`  
**STOP:** new `cell_cycler` class · skeleton part Goodhart · Blender lottery · loosen Gate 38 · full twin per micro-patch

---

## Recap (what landed before this plan)

| Era | What | Evidence |
|---|---|---|
| Disease stack | brief→ledger→multiplicity→PCB collection→device-scale MPN | cold-v1…v15 |
| Closure SOURCE | Gate 40, typed ledger, replication-scope ×8, PCB channel AFE arch, power_mosfet→IRLB3813, thermal conservation, shared fan, instrument-device-flag, USB, G17/Assembly optical skip, bay-temp seed, dissipation≠shunt | commit `e03c87164` |
| Variance control | N=3 same-tree: coh=10×3, HIGH=0, plaus±1 (real climb), part±3 | `out/variance-control-20260728T0211Z` |
| Loop policy | Single-run OK except **part-realism → N=3**; skeleton universality for unseen products **FIXED** | Terminal refined read |
| Twin in flight | `out/cell-cycler-cold-v17` (Blender+PCB, screen) | running |

cold-v15 had 16 tabs <9; several were already SOURCE-fixed and await v17 SIGHT (P0).

---

## Joint council verdict

1. **Do not patch v15’s 16 red tabs independently** — SIGHT v17 first (P0).
2. **Remaining diseases are projection/coverage**, not “need another skeleton critic.”
3. **Yuri transfer** (Rodeostat/NinjaPCR identities → universal channel roles) beats cold-rewrite lottery for BoM/PCB.
4. **Call council again** only after proveCatches green + twin still has an unroutable <9, standards judgement, or form/SIGHT disagreement — not per micro-patch.

---

## Phases (execute in order)

### P0 — Freeze truth on cold-v17 (SIGHT, no edits)
Confirm bay-temp / provenance / Assembly optical SOURCE actually raise Exec Summary, Checks, Quality, Calculations, Assembly.  
**Success:** those five ≥9 on v17, or a *regression* punchlist (not a new floor).

### P1 — Dry-instrument fluid gating — LANDED 2026-07-28
**Disease:** EMC line filter typed as process `separator`; electrical `discharge` / air `exhaust` nouns raised fluid-sink concerns.  
**SOURCE:** `parts_ledger.py` — EMC/line filter → electrical; `_is_non_fluid_boundary_noun` (discharge MOSFET/pass-bank + exhaust air); operator deck terminal; wet effluent still fires.  
**proveCatch:** selftest both directions (Emc Line Filter electrical; mosfet/exhaust no concern; Effluent Discharge Header still fires).  
**Unblocks:** Connection trace → helps Drawings / Checks. Await twin SIGHT.

### P2 — Board-centric interconnect (one graph, two projections) — LANDED `56ea3af4f`
**Disease:** plant-fluid / exploded graphs; Interconnect empty or unreadably capped.  
**SOURCE:** `draw_interconnect.py` collapses `Per Channel *` roles → Precision AFE ×N + absorb rail litter.  
**proveCatch:** cold-v15-shaped BoM → layout_ok (10 nodes, depth 4); regenerate on v15 state PASS.  
**Unblocks:** Interconnect, Drawings.

### P3 — Part fitting on closed slots (N=3) — LANDED `8d650f5c8` (N=3 part score still at P6)
**Disease:** slots closed but TBD/£0 / package_family-only.  
**SOURCE:** Yuri rules (TL072/WSL2512/NCP15/IRLB) + cascade seed + `fillBlank` verified-candidate bridge + catalogue tokens `afe/shunt/thermistor`.  
**proveCatch:** resolveVerified + live fillBlank pins all four channel roles; wrong-voltage reject on identity path.  
**Unblocks:** BoM, PCB fitness (await acceptance twin).

### P4 — Hazard/capability risk (no class table) — LANDED (TS + Excel mirror)
**Disease:** “No class-standards for consumer_electronics” WARN.  
**SOURCE:** `LAB_BENCHTOP_INSTRUMENT_FLOOR` + `isLabBenchtopInstrumentCapability(brief)` via `getClassStandards`/`getClassStandardsDBFirst`; Excel `_effective_compliance_gate` re-derives at render when chain wrote empty WARN before `isInstrumentDevice`.  
**proveCatch:** cell-cycler brief → mandatory≥1 / not empty WARN; phone brief stays empty WARN; Excel mirror both directions.  
**SIGHT (v17 rebuild):** Risk & Regulatory off fail list (no longer capped at 7 by stale WARN).

### P5 — HARD claims: close or honest-block — PARTIAL (invariants cleared on v17 SIGHT)
**Disease:** open HARD claims; Calculations false-pair bay max vs stability; Overview/Checks floored by 9 FAILs.  
**SOURCE:**
- `_match_quantity` polarity (min/max ≠ stability)
- provenance `_TEMP_DELTA_TOKENS` += stability/tolerance/accuracy
- `enclosure_emc.py` material+standard aliases (`aluminum`→`die_cast_alu`, `CISPR 11`→Class-B) — bootstrap SE=0 disease
- bootstrap EMC power inject also reads dissipation quantities
- `PADDING_RE` drops numbered `… Subcomponent N` placeholders
**proveCatch:** provenance bay envelope; enclosure_emc `--selftest` aluminum PASS / plastic FAIL / 35 W unshielded PASS.  
**SIGHT (v17 rebuild after SOURCE + artefact re-derive):** CHECKS FAIL **0**; Overview/Risk off fail list. Residual <9: Calculations (calc-coverage MED), Verification/PCB (PnP fitness + readiness), Renders (vision/washed-out), BoM MPNs await P6 twin with P3 fillBlank. Firmware stays `FAB-READY — UNPROVEN IN HARDWARE` without HIL.

### P6 — One acceptance twin (+ part N=3 if needed)
After proveCatches green: one cold twin with Blender+PCB. Do not twin-per-patch.  
Firmware never claims HIL-verified.

### P6b — Renders exterior SOURCE — LANDED `941f677f7` (2026-07-28)
**Disease:** `bench_power` had interior guts but **no exterior signature branch** → featureless sealed box on 04/00 (vision correctly FAIL; Renders 4 floors Exec/Quality).  
**SOURCE:** `_build_bench_power_signature` (HMI fascia + bay posts + C14 + side fins) + shared `_build_lab_electronics_front_fascia`; keep-list `u_se_le_bay|mains|fins`; proveCatch `_le_exterior_partset` + keep prefixes. Same pattern as vial_bioreactor signature meshes.  
**Next:** one Blender acceptance pass for **website imagery** (do not compete while nested v17 chains hold `out/cell-cycler-cold-v17`).

---

## Honest strategic note (Terminal → Cursor, 2026-07-28 ~07:45) — ADOPTED

Cursor took “cannot design an unseen product at all” → **~31/34 tabs ≥8** in ~twelve hours. Excellent.

**The remaining three are qualitatively different from the engine-rule diseases that came before:**

| Residual | Score | Nature | Action |
|---|---|---|---|
| **Renders** | 4 | Form-generation bug (blank chassis) | **FIX** — signature-mesh path; commercially the website imagery |
| **PCB** | 6 | ~67 on-board parts without catalogue MPN | **Corpus / parts-data** — not another engine patch |
| **BoM** | 6.3 | Per-channel TBD / £0 catalogue gaps | **Same long pole** — BoM data coverage, not code |

**Policy from here:**
1. **Fix Renders first** — binding constraint, cheapest of the three, known solved pattern, highest commercial value (website shots).
2. **Do not touch part-realism single-run** — N=3 proved ±3 with zero code change; Part names 8.1 is noise.
3. **After Renders clears, stop stacking engine fixes** for PCB/BoM MPN gaps — diminishing returns; floor becomes a data problem.
4. **Decide / decelerate** once website imagery is good — do not chase universal floor-9 via more fillBlank/PCB code on this twin.

---

## Definition of done

**Engine floor (this pack):** Renders clears via form SOURCE; shippable tabs that are *code-reachable* stay ≥9; Gate 38 honesty intact; firmware honesty string only without HIL.

**Not in this pack’s code loop:** catalogue completeness for every on-board / Per-Channel MPN (corpus ingest). That is a separate data program, not another `fillBlank` / Gate 38 patch.
