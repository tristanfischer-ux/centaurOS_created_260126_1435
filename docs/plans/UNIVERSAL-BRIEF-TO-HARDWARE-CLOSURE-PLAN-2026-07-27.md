# Universal brief→hardware closure plan (2026-07-27)

**Council:** Sol (GPT-5.6 Sol xhigh) + Fable-seat (Opus 4.8; Fable 5 retention-blocked)  
**Cursor:** execute; Blender REQUIRED (Tristan 2026-07-28: BoM needs Blender geometry/parts-manifest; Renders tab too — not a HOLD)  
**Test artefact:** `briefs-loop/benchtop_cell_cycler.md` → `consumer_electronics` — **no new product class**

---

## Shared diagnosis

| Seat | Root cause (one line) |
|---|---|
| **Sol** | No typed, provenance-preserving binding from brief/tool quantities → word multiplicity / rating / dims; upstream facts discarded into `×1` / `0` / TBD. |
| **Fable-seat** | Emitter paints nouns **before** a quantity model is solved; scorecard rewards the void (hon=9 on all-TBD). Structure is decoration, not a projection of a closed demand→capacity ledger. |

**Joint verdict:** Containment (Gate 39, floors, homonyms) is necessary but **not** a universal model. Cold-v5 proves it: right nouns, `×1` channels, `0 m²` heatsinks, all TBD. Stop Goodharting skeleton scores.

---

## STOP list (both seats)

- STOP adding `BENCH_POWER_*_FLOOR` arrays / regex exceptions as the design method
- STOP Blender re-render lottery (exterior morphology not on the acceptance path)
- STOP scoring fillable-TBD as “honest disclosure”
- STOP chasing part realism before closure
- STOP new product class / per-class sizing tables
- STOP full-chain lottery until fixture proveCatches go green

---

## Joint 5-phase plan

### Phase 1 — Typed demand ledger
**SOURCE:** `engineering-contract.ts` quantity schema + orchestrator duty assembly  
**SIGNAL:** every hard demand carries `{value, unit_family, scope: per-unit|aggregate|shared, provenance}`  
**proveCatch:** 8-channel brief → `channel_count=8` with `scope=per-device`; empty/scalar-without-scope ledger FAILS  
**Success:** 8 channels, per-channel current/voltage, 200 W aggregate remain first-class obligations through generation

### Phase 2 — Mandatory quantity_basis binding
**SOURCE:** `derive-skeleton.ts` (`contractCountFor` / `componentWord`) + bootstrap graph  
**SIGNAL:** every structural word cites a ledger entry + op (`×scope`, shared, sizing-fn); bare numbers rejected  
**proveCatch:** `Per Channel Precision Afe ×1` while `channel_count=8` → FIRE; cold-v5 fixture FAILS  
**Success:** per-channel hardware `×8`, shared PSU/controller `×1`; liquid HX without liquid duty FAILS

### Phase 3 — Authoritative sizing projection
**SOURCE:** `universal-contract-sizing.ts` dim/rating + tool-result consumers  
**SIGNAL:** tool output field → role → dims; unit-family keyed, never class slug  
**proveCatch:** dissipation >0 ∧ heatsink area `0 m²` → FIRE; cold-v5 fixture FAILS  
**Success:** thermal area >0 equals projection from duty (or coherent N-way split) with provenance

### Phase 4 — Design-closure gate BEFORE LLM paint
**SOURCE:** new/extended gate (admission family) + `serial-design-chain-v2.tsx` ordering  
**SIGNAL:** ledger complete ∧ all words bound ∧ no zero-dim-on-demand ∧ no fillable-TBD on critical roles  
**proveCatch:** cold-v5 skeleton blocks paint; closed skeleton passes  
**Success:** reviewers cannot paint until closure green (shadow → enforcing)

### Phase 5 — Part fitting on closed slots + honesty redefinition
**SOURCE:** `emitter-completion.ts` fillBlank + self-audit honesty  
**SIGNAL:** rating envelope + evidence; TBD the ledger could resolve = DEFECT not disclosure  
**proveCatch:** all-TBD skeleton → honesty LOW (not 9); FN3359-class oversize still rejected  
**Success:** principal roles verified-compatible OR honest unresolved block; PCB architecture can start

---

## Definition of done (this brief, no new class)

1. Ledger has `channel_count=8` with provenance; per-channel words render **×8**, shared **×1**
2. No structural word left at `{×1 default, 0 m², TBD}` where ledger/tool could compute it
3. Thermal area **>0** and equals projection from 200 W duty
4. **Closure gate passes** (enforcing) before paint
5. Acceptance = closure gate + PCB honesty path + Blender artefacts (parts-manifest / drawings / renders that BoM and Excel consume) — **not** LLM skeleton scores alone
6. Mechanisms universal — no `cell_cycler` class, no `consumer_electronics` special branch

---

## Work blocks (next)

| Block | Do | Don’t |
|---|---|---|
| **1** | Phases 1–3 against **extracted cold-v5 fixtures**; proveCatches red→green; no full chain | Blender, full-chain lottery, more floors |
| **2** | Phase 4 closure gate + Phase 5 honesty/part fitting; two cold twins + second unseen multi-unit brief | Resume Blender until twins pass |

---

## Status

- Plan written: 2026-07-27 (Cursor + Sol + Fable-seat)
- **Block 1 Phases 1–3 SOURCE landed (2026-07-27 evening)** — fixture proveCatches green; no full chain / no Blender
  1. `seedBriefScaleCountMetrics` in `buildContractForChain` — brief `*_count` → contract (fixes empty `consumer_electronics` ledger)
  2. `contractCountFor` — `per_<scope>_*` binds `<scope>_count` before head-noun (Powerwall negative preserved)
  3. Floor names aligned to `per_channel_*` for pass-bank / power heatsink / fan / Kelvin sense
  4. `formatAreaM2` — sub-1 m² tool areas no longer `Math.round` → `0 m²`
  5. Guards: `count-match-selftest`, `brief-scale-seed-selftest`, heatsink block in `instrument-sizing-selftest`, harness ×8 asserts
- **Block 2 landed (2026-07-27 ~20:45):**
  1. Gate **40** `design-closure-gate.ts` — pre-paint; hard-block unbound multiplicity + zero-dim-on-demand; fillable-TBD docks honesty (MED)
  2. Expanded `per_channel_*` floors (charge/mosfet/shunt/thermistor/OV-UV/overcurrent/overtemp/reverse)
  3. `stampHeatsinkThermalFromContract` — dissipation_w → watt rating when no area
  4. Deterministic `closure_honesty` scorecard section (all-TBD ≤2, not LLM disclosure)
  5. Wired into chain + gate-registry + verify-engine-guards + CLAUDE.md exit 40
- **Block 2b SOURCE (Sol+Fable reject of cold-v5, 2026-07-27 ~21:15):**
  1. P1 `replication-scope.ts` — role→`channel_count` for bare channel roles (charge/mosfet/shunt/thermistor/trips); shared bus/MCU stay ×1; Powerwall `cell_count` untouched
  2. P2 Gate 40 unbound fires on **delivered** bare ×1 words (cold-v5: unbound=8); proveCatch uses bare names, not only `per_channel_*`
  3. P3/P4 `seedBriefHardScalarMetrics` — voltage/current/dissipation/life/accuracy onto ledger; `aggregate_dissipation_w` alias/derive so 200 W is not satisfied by 25 W/channel
  4. PCB: bare `channel_count` no longer mints `motion_driver_board`; electrical evidence → `channel_power_afe_controller` with power/sense/safety channels
- **Block 2c (2026-07-27 night) — cold-v10 SIGHT:**
  - Gate 40 **PASS** `unbound=0` (was 8 bare ×1 on cold-v5)
  - Skeleton critic: brief=9 / plaus≈6 / coh=8 / part=5 / hon=10
  - PCB architecture: `channel_power_afe_controller` + 8× power/sense/safety (not motion)
  - Gate 38 honest fire: footprint **15/52 = 29%** token board (pipeline.ok but incomplete)
  - Cost-sanity: dissipation no longer £/kW; S6 ceiling bust real (~£3.7k vs £2k)
- **Block 2d SOURCE (Sol+Fable REJECT expand-only, 2026-07-27 ~23:00):** cold-v10 `main.ato` had 15 parts and **zero** MOSFET/shunt/control-loop — disease was pre-generator collection, not expand.
  1. Underscore-aware `ELECTRONIC_CATEGORY_PATTERNS` admit charge/MOSFET/shunt/AFE/trips from `character_id`
  2. `classifyFunction` maps the channel power chain (diode_protection before detector smear)
  3. `nonBoardPlacement`: cooling_fan + heatsink + AC-DC brick + touch HMI off-board; power bus = interconnect
  4. Gate 38 denominator = `architecture.onBoardElectronicPartCount` (not scan with fans)
  5. `expandPhysicalInstances` + channel evidence min-of-constituents for power/sense/safety
  6. proveCatch: architecture collects mosfet/shunt on_board; fan off_board; classifyFunction disease words
- **Cold twin:** `out/cell-cycler-cold-v11`…`v15` SIGHT done; `v16` killed for variance control; **`v17` RUNNING** (Blender ON + PCB, screen-detached).
- **Variance control (2026-07-28):** `out/variance-control-20260728T0211Z` N=3 same-tree → part spread=3, plaus spread=1. **Adopted:** N=3 (or deterministic gates/Excel floors) as primary signal — stop Goodharting single-run skeleton part/plaus.
- **Block 2e SOURCE (post-control, 2026-07-28):**
  1. `seedBriefHardScalarMetrics` — `cell_bay_temp_min_c` / `max_c` (v15 Exec Summary / Verification floor)
  2. `provenance.py` — `dissipation`/`loss` generic (200 W aggregate ≠ 0.5 W shunt)
  3. `build-excel-export._assembly_glance_verdict` — `requires_optical_silhouette` matches G17 (bench_power ≠ optical)
  4. Prior: `power_mosfet` + IRLB3813 + thermal conservation + shared fan + PCB-realized £0 functions
- **Still open:** BoM TBD MPNs / £2k ceiling; Interconnect layout; fluid false-positive on Connection trace; firmware HIL cap (`VIRTUAL BRING-UP`); PCB fitness MPN tier.
