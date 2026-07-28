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

### P4 — Hazard/capability risk (no class table) — LANDED (this pack)
**Disease:** “No class-standards for consumer_electronics” WARN.  
**SOURCE:** `LAB_BENCHTOP_INSTRUMENT_FLOOR` + `isLabBenchtopInstrumentCapability(brief)` via `getClassStandards`/`getClassStandardsDBFirst`; battery/channel energy hazard in Excel `_HAZARD_LIB`.  
**proveCatch:** cell-cycler brief → mandatory≥1 / not empty WARN; phone brief stays empty WARN.  
**Unblocks:** Risk.

### P5 — HARD claims: close or honest-block
**Disease:** open HARD claims mix ledger-closable vs HIL-only.  
**SOURCE:** Verification spine — ledger→VERIFIED; HIL→`FAB-READY — UNPROVEN IN HARDWARE`.  
**Unblocks:** Verification.

### P6 — One acceptance twin (+ part N=3 if needed)
After proveCatches green: one cold twin with Blender+PCB. Do not twin-per-patch.  
Firmware never claims HIL-verified.

---

## Definition of done

Every shippable Excel tab ≥9; mechanisms universal (no product-class branch); Gate 38 honesty intact; firmware honesty string only without HIL; second unseen multi-channel bench brief confirms P1–P2 (council checkpoint).
