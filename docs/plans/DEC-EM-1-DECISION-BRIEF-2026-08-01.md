# DEC-EM-1 — RESOLVED BY MEASUREMENT

**Date:** 2026-08-01. `ship_ok` **false** (unchanged). This file previously
argued for and then against a geometry change on ARITHMETIC. Both arguments are
superseded: the question was settled by measuring the machine.

---

## The answer

**Rebalance the magnet pole arc. Change nothing else.**

| | baseline | rebalanced | required |
|---|---|---|---|
| magnet | t 8.85 × L 14.58 mm | **t 6.0 × L 22.5 mm** | |
| A_m/A_g | 0.562 | **0.868** | |
| λ_pm fundamental | 0.002903 Wb | **0.031057 Wb** | |
| linkage THD | 198.2% | **6.9%** | |
| delivered torque | 41.9 N·m | **145.73 N·m** | 125.21 |
| ratio | 0.335× | **1.16×** | 1.0 |
| torque sign | crossed zero 4× | **never crosses zero** | |
| excitation k1/k2 | 14.3 / 21.4 | **0.0 / 0.0** | < 0.35 |
| demag margin @160 °C | ×4.79 | **×3.25 (OK)** | |

**No stack change. No housing change. No rotor OD change.** The planetary
strength writeback is therefore untouched.

## Why the machine was short — one fact, not a list

Magnets spanning 56% of the pole pitch, bunched at ±11° within a 45° pole,
produce a narrow flux **pulse** rather than a broad quasi-sinusoid. A pulse is
rich in 3rd harmonic and poor in fundamental: the measured 3rd was **1.90× the
fundamental**. In a three-phase machine the 3rd harmonic is **zero-sequence and
produces no torque at all**, so most of the rotor's flux was doing nothing.

Widening the arc converts that dead energy into fundamental. That is why the
measured flux gain is **10.7×** where the face-area ratio alone predicts 1.46×.

It also retrospectively explains the contradiction that drove most of this
campaign: the 1-D airgap transform read 0.032393 Wb against a measured 0.002903
— 11× apart — because a magnitude-based transform assumes a sinusoid. On the
rebalanced machine the same transform agrees with measurement to **1.04×**.

## Superseded arithmetic — recorded so it is not re-derived

| claim | status |
|---|---|
| "magnet rebalance gives 1.53× flux" | **wrong twice.** The dimensions (7.0 × 23.34) are not buildable — the V-magnets collide. Placement-aware, the analytic figure is 1.46×; the MEASURED flux gain is 10.7×. |
| "both levers give 0.988×, do not change geometry" | superseded. That applied a PM multiplier to reluctance torque, then compared against an unmeasured machine. |
| "stack 97.58 → 108.6 mm closes the residual" | **unnecessary.** Derived from a 112.458 N·m figure measured at γ=0, which was not the maximum. Re-optimising the angle gives 145.7. |
| "the architecture is short by 2.95×" | false. The pole arc was wrong; the architecture was not. |

## What still gates ship_ok — unchanged

`duty_torque_screen_ok` remains **false** and must. `torque_reliable` is
hardcoded false pending dyno correlation: the torque condition is met
**analytically**, and Bar B hardware evidence is what clears it. Nothing here
changes homologation status.

## Open before this is executable

1. **Thermal at the new operating point.** Higher torque at the same current
   means higher loss density in the same envelope.
2. **MTPA map** — the 145.7 figure is a cogging-cancelled mean at one screened
   angle, not a closed torque map.
3. **The magnet respec must reach the BoM and the drawings.** t 8.85 → 6.0 mm
   and L 14.58 → 22.5 mm is a real part change, and it is +27% magnet volume per
   bar. It is not a model tweak.
4. **Structural**: the magnet pocket changes shape, so
   `calculix_fia_magnet_pocket_screen` needs re-running against the new pocket.
