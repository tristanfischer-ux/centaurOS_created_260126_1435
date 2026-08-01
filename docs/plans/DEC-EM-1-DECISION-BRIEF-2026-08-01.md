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

## 2. The levers, measured not guessed

Torque is **linear** in both stack length and airgap fundamental.

| lever | mechanism | result | closes? |
|---|---|---|---|
| magnet rebalance (t 8.85→7.0, L 14.58→23.34 mm; A_m/A_g 0.562→0.90) | ×1.53 airgap flux | 65.0 N·m = **0.52×** | **no** |
| stack 97.58 → 214 mm | ×2.19 active length | 93.1 N·m = **0.74×** | **no** |
| **both together** | ×3.35 | **142.5 N·m = 1.14×** | **yes** |

## 3. THE DECISION

**Do both, and do the stack first.** Neither alone closes the duty; the two
together close it with 14% margin.

Reasoning:

1. **Neither single lever is sufficient**, so "pick one" was a false choice — the
   question is only whether the pair is affordable.
2. **The stack lever is the larger one (2.19× vs 1.53×) and nobody had looked at
   it.** The machine runs a 97.58 mm stack.
3. **The stack lever does NOT touch rotor OD**, so it does not invalidate the
   planetary strength writeback. The magnet rebalance also holds rotor OD fixed
   (it trades magnet thickness for length *inside* the existing rotor ring, and
   was solved against the placer's own radial budget). **So DEC-EM-1 as decided
   re-opens nothing that is currently closed.** That is the main reason to
   prefer it over the rotor-OD growth I was previously circling.
4. **Cost is honest and bounded**: +27% magnet volume per bar, and a longer
   housing. It is a BoM and mass change, not an architecture change.

### The constraint conflict this exposes, unresolved

The twin carries `fpk_housing_len_mm = 140.5` (basis=**rated**) while the
front-bay envelope is W 343 × D 259 × H 267 mm. A 214 mm stack does not fit a
140.5 mm housing. Either the housing grows toward the bay's ~308 mm usable width
(if the motor axis runs across the bay width), or the 214 mm figure is wrong.
**I have not resolved which, and the decision above depends on it.** This is the
first thing to attack.

## 4. What I am NOT doing, and why

- **Not freezing and documenting the shortfall.** A dossier saying "0.39× of
  duty, architecture short" would be honest but wrong: the machine has 3.35× of
  unexploited, measured, bay-legal lever. Documenting a shortfall we know how to
  close would be a false negative.
- **Not growing rotor OD.** It is bay-limited to 139.42 mm and would invalidate
  the planetary writeback. The two chosen levers avoid it.
- **Not chasing the airgap-probe discrepancy further.** It is an rms-derived
  estimate of a quantity the torque measurement now supersedes.

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
