# DEC-EM-1 — RESOLVED BY MEASUREMENT

> ## ⚠⚠ HOLD — A 2× WINDING DISCREPANCY IS OPEN (2026-08-02)
>
> **Do not act on the torque figures below until this closes.**
>
> pyleecan's own winding model says the FE deck builds a machine with **28
> series turns per phase** where the contract specifies **14**:
>
> ```
> Zs=24, 2p=8, Ntcoil=7
>   Npcp=1  →  Ncspc 4  →  28 series turns/phase   ← what the FE builds
>   Npcp=2  →  Ncspc 2  →  14 series turns/phase   ← what the contract specifies
> ```
>
> FEMM has no concept of parallel paths — a circuit is one series path — so
> `mi_addcircprop(674.58)` with 7 turns/slot excites the a=1 machine. Confirmed
> independently: on the REBALANCED machine, whose field is near-sinusoidal
> (THD 6.9%) so the 1-D transform is valid, FE λ_pm / analytic = **1.964**.
> (On the baseline the same ratio is 0.206, but that field is a PULSE at
> THD 198% and the transform does not apply there.)
>
> **If it carries through to torque, every figure below halves and this decision
> REVERSES** — the magnet respec would no longer clear the 125.21 N·m duty.
>
> It may not halve. The machine is **saturated** (tooth 1.799 T, yoke 2.104 T),
> so reducing MMF de-saturates it and costs *less* than proportionally —
> MiniMax-M3 corrected an earlier estimate of mine on exactly this point. An FE
> run at the path current (238.5 A rms) is measuring it rather than arguing it.
>
> Raised independently by Grok 4.5 and Sol in the turns council. I had dismissed
> it earlier after checking only the current MAGNITUDE (477 × √2 = 674.58,
> correct) and missing that the coupling runs through TURNS.
>
> **Settled regardless of the torque outcome:** the FE deck and the contract
> describe different windings. That needs fixing either way.


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


---

## P3 — corpus findings acted on (2026-08-02)

The forge-truth corpus was queried before deriving anything further. Four
findings bear on this decision; none is closed, and each is recorded rather
than absorbed.

### 1. ⚠ The corpus argues AGAINST the respec direction

`fpk:geometry:58bf626998` — *"preventive measures are taken to avert PM
demagnetization. These consist of the multiclass design of rotor poles,
**increasing the thickness of PM**, and using supporter cylinders."*

DEC-EM-1 **reduces** thickness 8.85 → 6.0 mm. The demag screen returns ×3.25 at
160 °C against a thermal prediction of 127.2 °C, so the measured margin holds —
but the literature says this direction costs robustness, and that is a standing
caveat on the decision, not a resolved point.

### 2. Grain-oriented steel — the 7× is probably NOT applicable

`fpk:material:296d849f4e` — *"Kowal et al. [7] applied a grain-oriented material
to the stator and the iron loss is seven times less."* Four independent
extractions, all keyed to `stator_core`, none stating the topology.

GO steel is **anisotropic**: its low-loss axis is the rolling direction. In a
radial-flux stator the **tooth flux is radial** and the **yoke flux
circumferential**, so one sheet orientation cannot favour both. Bounds against
the 1020.5 W:

| case | iron loss | motor loss |
|---|---|---|
| blanket 7× (if it applied) | 145.8 W | 2379 W |
| **yoke only 7×** (the circumferential path) | 474.5 W | 2708 W |
| yoke only 2× (realistic segmented) | 702.0 W | 2936 W |

The yoke is 62% of the iron loss **and** the circumferential path, so it is
where a directional grade could plausibly act. **Teeth cannot benefit.** Treat
the blanket 7× as inapplicable until the source topology is established.

### 3. ⚠ "Measured iron loss" was the wrong term — corrected

MiniMax-M3: *"presented as ground truth but actually a post-processed simulation
output whose fidelity depends on unstated Steinmetz coefficients, lamination
grade, and gauge."* Correct, and now fixed in `machine_loss_bounds`.

What is measured is the **flux density**. The **loss** is modelled from it with
coefficients that DEFAULT (`kh=0.02, ke=1e-5, α=1.8`) and a **lamination gauge
that is not established anywhere in this twin**. Eddy loss goes as gauge
squared, so that single unstated number moves the answer more than the
grain-orientation debate does.

### 4. A more rigorous method exists and is not implemented

`fpk:fea:P_core` — the *hierarchical method* computing core loss from the
analytical air-gap field solution. Recorded in `machine_loss_bounds` as a known
refinement.

### What P3 changes about the decision

**Nothing yet, and that is the honest answer.** The magnet respec still stands
on torque, demag and pocket retention. The iron-loss lever is real but smaller
and more conditional than the corpus headline suggests, and the loss numbers
themselves carry two unstated inputs. The next measurement is not a topology
argument — it is establishing the **lamination gauge and grade**.
