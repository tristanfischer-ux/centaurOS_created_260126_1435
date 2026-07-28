# Anvil MGU / MCU pack — preparation (2026-07-28)

**Status:** PROMOTED into orchestrator (2026-07-28) — Tier 0 + Tier 1 registered.  
**Staging code (source of truth for physics drafts):** `prototypes/mgu-mcu-pack/`  
**Live code:** `scripts/lib/orchestrator/tools/*.ts` + `tools/python/*.py` + `register-all.ts` imports.  
**Pattern:** formula → deterministic Python (`stdin` JSON → `stdout` JSON + `--selftest`) → TS wrapper + `register-all.ts` import (PHANTM recipe).

---

## 1. What “add-ons” means here

There is no external download store. Anvil add-ons are **deterministic Python physics tools** that the orchestrator invokes. Historically:

1. An engineer writes the governing equations (or extracts them from a brief / datasheet).
2. They become a Python `solve(payload)` / `compute(payload)` with HARD inputs, worked calcs, and `--selftest`.
3. A thin TypeScript wrapper `spawnSync`s the repo `.venv` and `registerTool()`s them.
4. Optional: class-plan wiring + tool-IO harvest + `verify-engine-guards.sh` line.

Gold exemplar: `scripts/lib/orchestrator/tools/python/magnetics_vr_detent.py` + `magnetics-vr-detent.ts` (Hooley / PHANTM).

---

## 2. Recipe to promote one staged tool (after freeze)

Safe files only — **new files** + **one append** to `register-all.ts`:

| Step | Action |
|---|---|
| 1 | Copy `prototypes/mgu-mcu-pack/python/<name>.py` → `scripts/lib/orchestrator/tools/python/<name>.py` |
| 2 | Add `scripts/lib/orchestrator/tools/<kebab>.ts` (copy PHANTM wrapper shape) |
| 3 | Append `import './tools/<kebab>'` in `register-all.ts` |
| 4 | Run `.venv/bin/python3 …/<name>.py --selftest` |
| 5 | Smoke-invoke via registry (`getTool('…').invoke(…)`) |
| 6 | Re-harvest `tool-io-raw.json` / `tool-io-manifest.json` |
| 7 | Append `TOOL_INVENTORY.md` row |
| 8 | Optional: `verify-engine-guards.sh` selftest line; class-plan later |

**Do not edit while other lanes are hot:**  
`pcb/**`, `serial-design-chain-v2.tsx`, `build-excel-export.py`, `bootstrap-tool-plan.ts`, `tool-creation-pass.ts`, `structural-*`, `parts_ledger.py`, `out/cell-cycler-*`.

**Prefer an isolated worktree** (`…-wt-mgu`) when promoting, even after freeze.

---

## 3. Inventory — leave-behind capability → staged tool

### Tier 0 — MCU / inverter (do first)

| Capability | Staged module | Tool id (planned) | Notes |
|---|---|---|---|
| SiC conduction + switching loss | `inverter_sic_loss.py` | `inverter:sic-loss` | Promotes / hardens generated `inverter_switching__loss_model.py` |
| DC / phase current & voltage envelope | `inverter_current_voltage_envelope.py` | `inverter:current-voltage-envelope` | Battery V range × Iph max → power / torque ceiling |
| Field-weakening / MTPA current split | `field_weakening_mtpa.py` | `inverter:field-weakening-mtpa` | Analytical λ/L_d,d-q current limits |

### Tier 1 — MGU electromagnetic / mechanical (analytical first pass)

| Capability | Staged module | Tool id (planned) | Notes |
|---|---|---|---|
| Radial-flux IPMSM first sizing | `ipmsm_analytical_sizing.py` | `motor:ipmsm-analytical-sizing` | D²L torque, air-gap shear, back-EMF / base speed |
| Loss at one (T,ω) point | `motor_loss_point.py` | `motor:loss-point` | Cu + Fe (Steinmetz-ish) + magnet eddy + mech |
| Rotor centrifugal stress | `rotor_centrifugal_stress.py` | `motor:rotor-centrifugal-stress` | Rim stress / sleeve hoop — analytical |
| Lumped thermal (winding / magnet) | `mgu_thermal_lumped.py` | `motor:thermal-lumped` | Two-node RC with coolant |
| Traction gear ratio map | `gear_ratio_traction.py` | `gear:traction-ratio` | Wheel ↔ MGU; not bicycle-specific |
| Race duty-cycle energy | `duty_cycle_energy.py` | `powertrain:duty-cycle-energy` | Histogram / time-series → net energy + loss integral |

### Tier 2 — later (not staged as code yet; formulas sketched in §5)

| Capability | Status |
|---|---|
| Full efficiency / loss **maps** (grid of T,ω) | Loop `motor:loss-point` + surrogate fit — after Tier 1 selftests green |
| Nonlinear EM FE (FEMM / xfemm) for IPMSM | Reuse PHANTM FE runner pattern; separate increment |
| Demagnetisation under fault / high temp | Extend PHANTM demag doctrine to rotor magnets |
| Homologation evidence binder | Requirements matrix JSON — after tools exist |
| Dyno correlation residuals | Compare tool maps vs ingested dyno CSV |

---

## 4. Existing fragments to reuse (not re-invent)

| Existing | Reuse how |
|---|---|
| `generated/inverter_switching__loss_model.py` | Physics seed for `inverter_sic_loss.py` (HARD inputs, selftest, worked[]) |
| `ngspice_run.py` efficiency sketch | Too coarse for race MCU — keep for PCS; do not alias as MGU MCU |
| `motor_prop_match.py` / `motor:altitude-derating` | Drone/HAPS only — leave alone |
| `gear_ratio.py` (`gear-ratio:bicycle`) | Leave alone; traction tool is separate |
| `magnetics_vr_*` (PHANTM) | Recipe + FE discipline; wrong machine class for MGU |
| `_worked.py` | Use for dossier-ready worked calcs when promoting |

---

## 5. Governing formulas (deterministic core)

### 5.1 SiC inverter loss (3-ph bridge)

\[
I_{ac,rms}=\frac{P}{\sqrt{3}\,V_{ac}},\quad
P_{cond,sw}=I_{sw,rms}^{2}\,R_{ds(on)}\,D,\quad
P_{sw,sw}=(E_{on}+E_{off})\,f_{sw}\,\frac{V_{dc}}{V_{test}}\,\frac{I_{ac}}{I_{test}}
\]

\[
P_{diss}=N_{sw}(P_{cond,sw}+P_{sw,sw}),\quad
\eta_{inv}=1-\frac{P_{diss}}{P}
\]

### 5.2 Electrical ≠ mechanical

\[
P_{wheel}=P_{elec}\,\eta_{inv}\,\eta_{MGU}\,\eta_{gear}
\]

Regulatory axle cap is **electrical** DC-bus flow, not shaft kW.

### 5.3 IPMSM sizing (order-of-magnitude)

\[
T\approx\frac{\pi}{2}\,B_{g}\,A_{rms}\,D^{2}L\,k_w,\quad
\omega_{base}\approx\frac{V_{ph}}{\sqrt{(R_s)^{2}+(\omega\lambda)^{2}}}\ \text{(simplified)}
\]

Use for envelope / parameterisation seed — **not** FE truth.

### 5.4 Field weakening

At \(\omega>\omega_{base}\), \(i_d\) increases (more negative) to hold \(v\leq V_{max}\):

\[
v_d=R i_d-\omega L_q i_q,\quad
v_q=R i_q+\omega(L_d i_d+\lambda_{pm}),\quad
v_d^{2}+v_q^{2}\le V_{max}^{2},\quad
i_d^{2}+i_q^{2}\le I_{max}^{2}
\]

Analytical MTPA / FW intersection for the staged tool; FE later.

### 5.5 Rotor rim stress (thin-ring approx)

\[
\sigma\approx\rho\,\omega^{2}\,r^{2}
\]

Compare to material allowables; sleeve hoop separately if sleeve OD given.

### 5.6 Duty-cycle net energy

\[
E_{net}=\int P_{elec}(t)\,dt,\quad
E_{loss}=\int\big(P_{inv,loss}+P_{mgu,loss}+P_{gear,loss}\big)\,dt
\]

Accept either time-series samples or histogram bins \(\{(T,\omega,dt)\}\).

---

## 6. How to run the staged pack (no registry)

```bash
cd /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel
.venv/bin/python3 prototypes/mgu-mcu-pack/selftest_all.py
# or one tool:
.venv/bin/python3 prototypes/mgu-mcu-pack/python/inverter_sic_loss.py --selftest
```

---

## 7. Isolation rules while other work finishes

- Keep all new physics under `prototypes/mgu-mcu-pack/` until promote day.
- Do **not** import staging into `register-all.ts` yet.
- Do **not** touch HOLD files listed in §2.
- When ready: worktree `anvil-mgu-mcu-pack` → promote Tier 0 → selftest → then Tier 1.

---

## 8. Done definition

- [x] Prep doc (this file)
- [x] Tier 0 + Tier 1 Python modules with `--selftest`
- [x] `selftest_all.py` green locally
- [x] TS wrappers + `register-all` imports
- [x] Registry smoke invoke (sic-loss, field-weakening, duty-cycle, sizing)
- [ ] tool-IO harvest (optional planner visibility polish)
- [ ] optional class slug `formula_e_rear_mgu` / plan stub
- [ ] FE / map / homologation tiers (Tier 2)

---

*Prepared 2026-07-28; promoted same day after other lanes cleared.*
