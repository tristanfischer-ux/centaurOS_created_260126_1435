# DEC-EM-1 — the decision, and why. Challenge it.

**Date:** 2026-08-01. `ship_ok=false`. I have made a decision; I want it attacked.

## 1. Where the machine actually is

Formula E front MGU. Required shaft torque **125.21 N·m** (set by 250 kW at
19,500 rpm and η=0.978 — the gear ratio cannot change it).

The excitation fault is **closed and proven closed**: sweeping rotor position at
a fixed rotor-frame current angle, the async harmonics fell from 53.65/80.17 N·m
to 0.01/0.01 when the advance sign was corrected to `+p·θm`. Every torque number
this campaign quoted before that (118, 93.6, 57.84, 64.6) was a rectified mean
over a machine that was never in synchronism, and is void.

A cogging-cancelled low-current sweep (50 → 674.58 A, three rotor positions a
third of a slot pitch apart) separates the two torque terms:

```
T = 0.03882·I + 3.578e-05·I²
λ_pm from FE torque = 0.006470 Wb        ← the machine as the solver sees it
at 674.58 A:  PM 26.2 + reluctance 16.3 = 42.5 N·m   (measured 41.9)
```

**Measured capability 42.5 N·m against 125.21 required — a 2.95× shortfall.**
38% of it is reluctance torque; the PM circuit is weak.

### What I got wrong earlier, corrected

I reported "two independent analytic routes agree at 127–131 N·m". They are
**not independent**. `em_fia_voltage_fw_screen` computes back-EMF *analytically*
from the FE's open-circuit airgap RMS B (`pole_flux = 2√2·B_rms·r_gap·L/p`), so
the "measured back-EMF" route and the "analytic design flux" route share one
assumption and nearly one calculation. They agreed because they are the same
sum. The only direct measurement is the FE torque integral.

## 2. The levers — CORRECTED after council review

> **My first version of this table was WRONG.** It multiplied the whole 42.5 N·m
> by the magnet rebalance factor. The rebalance raises the **PM term only** —
> reluctance torque scales with (L_d − L_q)·I², not with PM flux. Both Sol and
> MiniMax-M3 caught it independently. Corrected:

Torque is linear in stack length (both terms) and in airgap fundamental (PM term
only).

| lever | result | closes? |
|---|---|---|
| magnet rebalance alone (PM ×1.53, reluctance unchanged) | 56.4 N·m = **0.45×** | no |
| stack 97.58 → 214 mm alone (both terms ×2.19) | 93.2 N·m = **0.74×** | no |
| **both together** | **123.7 N·m = 0.988×** | **NO — below duty, zero margin** |

And the ×1.53 is an **unverified analytic estimate**, not an FE measurement.

## 3. THE DECISION — do NOT change geometry yet

**Reconcile the flux linkage first. Commit no geometry until it is settled.**

The deciding fact is a 5.01× disagreement between two figures for the same
machine's PM flux linkage:

| source | λ_pm | what it implies |
|---|---|---|
| FE torque, low-current PM slope | 0.006470 Wb | machine makes 42.5 N·m; even both levers reach only 0.99× |
| 1-D analytic from OC airgap B | 0.032393 Wb | machine should already make ~131 N·m and needs **no geometry change at all** |

These two cannot both be right, and **they imply opposite actions**. Committing a
stack-length and magnet change now would be spending real BoM, mass and packaging
budget — plus a housing conflict — on a number that might be an artefact.

Sol's priority-1 recommendation is the same: *"audit full-machine torque scaling,
model depth and winding/circuit definition before changing geometry."* Sol also
notes the 2.95× deficit is suspiciously close to exactly 3 and wants phase
summation, sector periodicity and stack-depth scaling checked first.

**The reconciliation is cheap** — FE solves only, no geometry change, does not
touch rotor OD, does not re-open the planetary writeback. It is strictly ordered
before any geometry decision because it determines whether one is needed.

### Ordered work

1. Independent open-circuit **transient back-EMF** from FE (not the 1-D
   transform) — a genuinely independent witness for λ_pm.
2. Reconcile series turns per phase against the FE's applied ampere-turns
   (turns=7 per slot, 2 parallel paths, phase current not path current).
3. Check phase summation / sector periodicity / planar depth for a factor near 3.
4. **Only if the torque-derived λ_pm survives all three**, revisit geometry — and
   then the honest finding is that even both levers land at 0.99×, so the
   architecture is short and DEC-EM-1 becomes a redesign, not a tweak.

## 4. What I am NOT doing, and why

- **Not committing the stack or magnet change.** Corrected arithmetic says the
  pair does not close the duty, and the multiplier is unverified.
- **Not freezing and documenting the shortfall.** The λ_pm contradiction is
  unresolved; documenting 0.39× as final would be asserting a number two of the
  deck's own witnesses disagree about by 5×.
- **Not growing rotor OD.** Bay-limited, and would invalidate the planetary.

### Unresolved constraint conflict (still live)

`fpk_housing_len_mm = 140.5` (basis=rated) versus a 214 mm stack. A 214 mm stack
does not fit a 140.5 mm housing. If the stack lever is ever taken, this must be
resolved first.

## 5. Questions

1. Is the 2.19× stack lever real, or does `fpk_housing_len_mm = 140.5` bind and
   the bay width not apply to the motor axis? This is the load-bearing one.
2. Does the magnet rebalance survive contact with demagnetisation? Thinner
   magnets (8.85 → 7.0 mm) at 477 A rms — check the knee at temperature.
3. Reluctance is 38% of the torque. Growing PM flux ×1.53 shifts the optimal
   current angle; does the −30° screened angle still hold, and does the
   reluctance term help or fight at the new angle?
4. Doubling stack length doubles copper loss at constant current density and
   changes the thermal problem. Does the oil circuit (CLEARED at 30 mm slosh /
   Ø1.8 mm jet / ~626.4 ml) survive it?
5. Anything in §3 that is a false economy — i.e. where would you spend the
   effort instead?
