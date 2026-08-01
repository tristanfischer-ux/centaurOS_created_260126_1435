# FE Front MGU — torque shortfall: full statement, plan, and review request (v2)

**Date:** 2026-08-01 · `ship_ok=false` · `EM_TORQUE_VS_ROTOR_BORE` OPEN
**Supersedes** the 2026-07-31 brief. Read §5 first if short of time — it is where
I think I am wrong.

---

## 1. What we are trying to do

Design a **Formula E FRONT powertrain kit (FPK)**: a regenerative front
motor-generator unit plus its inverter, packaged inside a stated front bay. The
deliverable is an engineering dossier a chartered engineer would sign. Nothing
ships until every screen is honest — `ship_ok` is hard-false until Bar B hardware
evidence exists (dyno, HIL, supplier CAD).

## 2. What must be proven, numerically

| Quantity | Value | Where from |
|---|---|---|
| Electrical power | 250 kW | brief |
| Max rotor speed | 19,500 rpm | brief |
| Assumed regen efficiency | 0.978 | contract |
| **Required shaft torque** | **125.21 N·m** | `shaft_torque_identity` |
| DC bus | 750 V nominal (600–900 V) | brief |
| Phase current (design) | 477 A rms | contract |
| Front bay envelope | W 343 × D 259 × H 267 mm | brief |

T = P/ω = 250 kW / (19,500 rpm) = 122.4 N·m; with the efficiency assumption the
identity returns 125.21 N·m. **Set by POWER and SPEED — the gear ratio does not
change it.**

## 3. The machine, as currently specified

Bay-limited: `od_cap = min(D·0.98, H·0.96)·0.78 = 197.98 mm`, and the rotor needs
`rotor_od × 1.42` of cross-section (jacket + MCU shelf + wall), so **bay-max rotor
= 139.42 mm**. Axial is NOT the binding limit (housing cap 308 mm ⇒ stack ≤ ~214 mm).

| | value |
|---|---|
| stator slots / rotor poles | 24 / 8 (q = 1, kw1 = 1.0, symmetric — solved by swat_em) |
| rotor OD / stator OD | 139.4 / 188.2 mm (bay-legal) |
| active length | 97.58 mm |
| radial airgap | 0.7 mm |
| turns per phase | 14 (⇒ 7 turns/coil derived; the twin's stated 4 gives 8/phase and is inconsistent) |
| magnet | NdFeB, Br ≈ 1.2 T |

## 4. Where the numbers stand

| route | torque | ratio | notes |
|---|---|---|---|
| A — design flux linkage, LINEAR | 215.01 N·m | 1.72 | 1-D magnet operating point; ignores Carter, leakage, saturation |
| B — measured back-EMF, LINEAR: T = 1.5·p·λpm·Iq | 131.11 N·m | 1.05 | λpm from 324.1 V l-l rms at 19,500 rpm |
| **C — FE (xfemm) weighted-stress integral** | **57.84 N·m** | **0.462** | the only route with the nonlinear BH curve |
| required | 125.21 N·m | 1.0 | |

FE sweep, 37 rotor positions at the screened angle: **min 3.01, max 122.65 N·m**
— peak-to-peak ripple ≈ 207% of mean. FE reports **peak airgap flux density
1.64 T**.

## 5. THE ISSUE — and where I am probably wrong

Routes A and B are **linear**; route C is the only one that models saturation. At
1.64 T peak airgap the iron is saturating hard, so **A and B are upper bounds, not
rival measurements**. I previously concluded from B-vs-C = 2.27× that "the torque
integration is the suspect". **I now think that was over-read** — a linear estimate
exceeding a saturated FE result is expected, not evidence of a bug.

Things I fixed that were REAL but did not close the gap (each verified):
1. Winding belt map was a hardcoded 12-slot pattern valid only for 48 slots; at
   the contract's 24 it produced 4.34 N·m with 120°-electrical periodicity (three
   belts never forming a rotating MMF). Replaced with swat_em → 31.76 N·m.
2. `turns_per_coil = 4` inconsistent with `turns_per_phase = 14`; derived 7 → 43.34.
3. Rotor-frame current advance (θe = p·θm) — verified working.
4. Slot count now twin-derived; phase-A axis derived from the solved layout.
   → 57.84 N·m.

A fix that did NOT work: adding the airgap to the weighted-stress block selection.
FEMM requires the selection boundary to be in free space, so I split the airgap
(circle at r_gap, inner half with the rotor, outer half stationary). Valid usage,
zero rejections — and the answer moved 57.83 → 57.84. **So the integral was not
truncated.**

Remaining unexplained: **207% torque ripple, min 3.01 N·m**. The torque REVERSES
SIGN across the sweep, which should not happen for a synchronous machine held at a
fixed angle in the rotor frame. The oscillation period is one SLOT PITCH (15° mech
at 24 slots). Note the stator slot opening is parameterised as **46% of slot pitch**
(`slot_half_width_rad = slot_pitch_rad * 0.23`), so at 24 slots the opening is
6.9° mech — very wide, and real traction machines use semi-closed slots at ~10–20%.

## 6. My plan (please attack it)

1. **LINEAR-MATERIAL FE RUN** — fix µr, remove the BH curve. If linear FE ≈ 131 N·m
   the gap is saturation and the machine is genuinely short; if it stays ≈ 58 N·m
   the integration is still wrong. One decisive experiment.
2. **Resolve the sign reversal** — a fixed rotor-frame angle must not reverse
   torque. Suspect the rotor-position implementation (geometry vs label rotation)
   or an angle-convention sign.
3. **Narrow the slot opening** to a realistic semi-closed value and re-measure
   ripple and mean.
4. **Only then** decide whether the machine is short, and by how much.

## 7. Questions for you

1. Is my §5 reassessment right — is a 2.27× linear-vs-saturated gap NORMAL at
   1.64 T peak airgap, or still too large to be saturation alone?
2. What torque SHOULD a 139.4 mm bore × 97.58 mm stack IPMSM at 477 A rms make?
   Give N·m and the airgap shear stress (kPa) you would expect.
3. **What causes torque to reverse sign** across a rotor-position sweep at fixed
   rotor-frame current angle? That is the observation I cannot explain.
4. Is 24 slots / 8 poles (q=1) a sane choice here, or is the 48-slot alternative
   the right machine? Note turns_per_phase=14 is consistent with 24 slots.
5. Is the plan in §6 right, and what would you do first?
6. Any error in §2–§4?
