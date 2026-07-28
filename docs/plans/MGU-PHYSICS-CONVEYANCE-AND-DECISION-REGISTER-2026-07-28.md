# MGU/MCU physics conveyance + Decision Register

**Date:** 2026-07-28
**Ask:** Are we using the new Python pack deterministically? Looking at PHANTM — do we need another Excel physics sheet, or do existing tabs suffice? How else to convey engineering physics + human decisions?
**SOL consult:** gpt-5.6-sol-high (decisive).
**Status:** IMPLEMENTED IN SOURCE — calc completeness + Decision Register wired; cold twin pending.

---

## 1. Verdict (one page)

| Question | Answer |
|---|---|
| Using all new Python MGU tools? | **Yes in the class plan** — all 9 registered tools. Not using PHANTM VR magnetics, CadQuery add-ons, or `generated/` LLM stubs as authority. |
| Add-ons working deterministically? | **Core maths yes** (stdlib-only, selftests green, 2249 all 9 `ok:true`). **Dossier conveyance incomplete** — only 2/9 emit `worked[]`; thermal field-name mismatch kills contract writeback. |
| Need a new Excel "physics bible" sheet? | **No.** PHANTM's one-sheet calculator is a **standalone design tool**, not a dossier pattern to copy. Universal tabs already cover Calculations / Verification / Checks / Holds / Questions / Design basis / Engineering Analysis. |
| What's missing then? | (1) **Full `worked[]` on all 9 tools** → Calculations sheet becomes the physics audit trail. (2) A universal **Decision Register** sheet — durable owned human decisions that survive when Questions/Holds flip to resolved. |

---

## 2. What Python we actually use (Anvil MGU pack)

### In chain (deterministic, stdlib-only)

| Tool id | Python | Emits `worked[]` today? | Contract writeback? |
|---|---|---|---|
| `inverter:sic-loss` | `inverter_sic_loss.py` | **Yes** | Yes |
| `inverter:dc-link-capacitor` | `inverter_dc_link_capacitor.py` | No | Yes |
| `inverter:gate-drive-budget` | `inverter_gate_drive_budget.py` | No | Yes |
| `motor:ipmsm-analytical-sizing` | `ipmsm_analytical_sizing.py` | **Yes** | Yes |
| `motor:loss-point` | `motor_loss_point.py` | No | Yes |
| `motor:fw-mtpa-point` | `motor_fw_mtpa_point.py` | No | Partial (`required:false` in plan) |
| `motor:thermal-lumped` | `mgu_thermal_lumped.py` | No | **Broken** — Python emits `winding_temperature_c` / `magnet_temperature_c`; plan reads `winding_temp_c` / `magnet_temp_c` |
| `gear-ratio:traction` | `gear_ratio_traction.py` | No | Yes |
| `duty-cycle:energy` | `duty_cycle_energy.py` | No | Yes |

Proof on `out/formula-e-rear-mgu-20260728-2249`: all nine `ok: true`. Selftest: `prototypes/mgu-mcu-pack/selftest_all.py` → 9/9 OK.

### Explicitly NOT in the authority path

| Asset | Why not |
|---|---|
| `scripts/phantm/*` (VR magnetics, FE runner, PHANTM Excel calculator) | Wrong machine class (variable-reluctance ≠ IPMSM traction MGU). Pattern to **reuse later** for FE demag / efficiency maps — not tonight's Tier-0 pack. |
| `prototypes/mgu-mcu-pack/*.py` | Staging copies; chain reads `scripts/lib/orchestrator/tools/python/`. |
| `generated/inverter_switching__loss_model.py` etc. | LLM-generated seeds — physics crib only; not registered on class plan. |
| CadQuery / numpy / scipy FE | Not required for Tier-0 analytical tools; would break determinism if bolted on without a separate FE stage. |

### Determinism bar

- Same brief + same contract quantities → same tool outputs (pure functions, no LLM inside tools).
- `worked[]` built at compute time via `_worked.py` so formula/substitution cannot drift from code (regression: `UNIVERSAL.worked_calc_arithmetic_sound`).
- Gap today: dossier **Calculations** only shows the two tools that emit `worked[]` — reviewer cannot hand-check the other seven from Excel alone.

---

## 3. PHANTM vs universal dossier tabs

### What PHANTM did (correct for a *calculator product*)

- One dense sheet: `PHANTM calculator` — inputs, computed geometry, force/torque, thermal, FE hooks.
- Markdown report + Tony/Vlad question packs for human decisions.
- Purpose: **interactive design tool**, not a multi-stakeholder engineering dossier.

### What the Formula E / universal chain already emits

From `out/formula-e-rear-mgu-20260728-2157/dossier.xlsx` (representative sheet set):

| Sheet | Role for physics / decisions |
|---|---|
| **Calculations** | Tool `worked[]` transcripts — *the* physics audit trail when tools emit them |
| **Verification** | Claim → evidence mapping |
| **⚠ Checks** | Gate findings |
| **Holds & exclusions** | Unproven / excluded claims (rotor margin, dyno, FE…) |
| **Questions for the customer** | Open human inputs |
| **Design basis** | Assumptions / basis of design |
| **Engineering Analysis** | Narrative engineering |
| **Risk & Regulatory** | Risk + FIA/regs |
| **Sense-check** | Sanity |
| Cover / Brief / BoM / Drawings / … | Delivery surface |

**Conclusion:** Do **not** add a PHANTM-style mega physics sheet to the dossier. That would duplicate Calculations + Design basis and fight the universal exporter.

**ANVIL prep already said this** (`docs/plans/ANVIL-MGU-MCU-PACK-PREP-2026-07-28.md` §7): promote tools with dossier-ready `worked[]` — no new physics sheet.

---

## 4. SOL decision (binding for this plan)

### A. No new physics/maths sheet — PARTIAL

Strengthen **Calculations** so every Tier-0 tool shows:

1. Inputs (with units)
2. Governing equation (ASCII, from `_worked.worked_calc`)
3. Substituted numbers
4. Result + unit
5. Assumptions / validity envelope
6. Model tier (analytical / map / FE)
7. Link to HOLD if not FE/dyno-proven

### B. Yes — add universal **Decision Register** sheet

**Why Questions / Holds are not enough:**

- Questions disappear when "answered."
- Holds disappear when "cleared."
- A chartered engineer / Jaguar trial lead needs a **durable owned table**: what was decided, by whom, on what evidence, what it freezes, what residual risk remains.

**Columns (universal — never Formula-E-named):**

| Column | Intent |
|---|---|
| ID | Stable key (`DEC-###` or slug) |
| Decision | What was chosen |
| Owner | Role / named person |
| Status | OPEN / PROPOSED / APPROVED / SUPERSEDED |
| Evidence | Tool id + worked label / HOLD / dyno ref |
| Freezes | Contract quantities / BoM lines affected |
| Residual risk | What is still unproven |
| Date | ISO date |
| Notes | Short |

**Wire via existing seams in `scripts/build-excel-export.py`:**

- Calculations ← `worked[]`
- Verification ← claim/evidence
- Holds / Questions ← already registered
- **New:** Decision Register ← `state.decisionRegister[]` (or equivalent) populated from class-plan HOLD/decision seeds + resolved Questions — **no product-named branch**

**Seed OPEN decisions for this trial (do not invent Jaguar approvals):**

1. Peak phase current / SiC die class (`I_ph` vs module rating)
2. Continuous vs peak thermal duty (race stint definition)
3. Gear ratio lock (and whether ratio is frozen before dyno)
4. Coolant chemistry + inlet temperature
5. 35 kg pack mass allocation (motor / inverter / gear / cold plate)
6. Accept analytical rotor margin 1.443 vs 1.5 HOLD until FE/dyno
7. Duty-cycle binning authority (which lap / which CSV)

### C. Other conveyance (priority order)

| Channel | Use | Authority? |
|---|---|---|
| Calculations (`worked[]`) | Hand-check maths | Yes (with tools) |
| Decision Register | Owned human freezes | Yes (governance) |
| Holds & exclusions | Unproven claims | Yes |
| Questions for customer | Elicit missing inputs | Transient |
| Verification | Trace claim → evidence | Yes |
| Optional PDF physics annex | Same records, printable | Mirror of Excel — later |
| HTML sensitivity explorer | What-if sweeps | **Not** authority |

---

## 5. Implementation plan

### Phase 0 — Overnight (this run / immediate code)

1. Keep **one** clean chain (`…-2301`); do not start competing twins.
2. Fix `motor:thermal-lumped` field names in class plan **or** Python (pick one schema; prefer aligning plan to Python's verbose names + alias both).
3. Emit `worked[]` for the seven tools that lack it — use `_worked.py` inside each Python `compute()`.
4. SIGHT after dossier: Calculations rows for all 9 tools; Verification/Holds honest; no plant smear; no 2205 mm coupling.

### Phase 1 — Next build (Decision Register)

1. Schema: `DecisionRegisterEntry` in a small TS module + JSON on `state`.
2. Seed from class-plan decision/HOLD list (universal helper, keyed by noun signals — not `if formula_e`).
3. `build-excel-export.py`: new sheet after Verification (or after Holds).
4. proveCatch / harness: empty register on non-decision classes is OK; traction pack with OPEN seeds must list ≥ N rows.
5. Morning review: Jaguar / Tristan approve rows — flip OPEN → APPROVED with owner + date; re-run from frozen inputs.

### Phase 2 — Later (PHANTM-pattern FE, not a new sheet)

- Efficiency / loss maps via looped `motor:loss-point`
- Nonlinear EM FE for IPMSM (PHANTM FE runner pattern)
- Demag under fault
- Dyno residual table
- Optional PDF annex from the **same** Calculations + Decision Register records

---

## 6. Acceptance criteria

- [ ] All 9 MGU tools `ok:true` on a clean run
- [ ] All 9 emit ≥1 `worked[]` each; Calculations sheet shows them
- [ ] Thermal temps write back to contract (field names aligned)
- [ ] No CadQuery/numpy required for Tier-0 path
- [ ] Decision Register sheet present on traction-pack dossiers with OPEN seeds
- [ ] No Formula-E-named Excel branch
- [ ] Rotor margin < 1.5 remains a HOLD until FE/dyno — Decision Register records the **acceptance of that HOLD**, not a fake PASS

---

## 7. What to tell a human reviewer tomorrow

> The dossier does not need a PHANTM-style physics mega-sheet. Physics lives in **Calculations** (once every tool emits worked maths). Human freezes live in a new **Decision Register**. Until those seven tools grow `worked[]` and Decision Register ships, treat the Excel as **structurally right but physics-thin** — do not stamp the trial pack on Calculations emptiness alone.
