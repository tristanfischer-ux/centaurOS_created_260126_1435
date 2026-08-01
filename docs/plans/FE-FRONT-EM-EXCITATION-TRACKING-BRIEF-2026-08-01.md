# FE front MGU — the excitation-tracking fault. Review request.

**Date:** 2026-08-01. `ship_ok=false`. This supersedes the torque-shortfall framing:
the machine is no longer believed to be merely "short", it is believed to be
**mis-excited**, and I want that challenged.

## 1. The machine

24 stator slots / 8 poles (q=1, kw1=1.0, symmetric, solved by swat_em).
Rotor OD 139.4 mm, active length 97.58 mm, radial airgap 0.7 mm.
V-magnet IPM, NdFeB Br = 1.24 T, mur = 1.05, magnet 8.85 mm thick x 14.58 mm long,
two bars per pole. 477 A rms phase current. Required shaft torque 125.21 N·m.
2D FE via xfemm/femmcli, nonlinear BH, weighted stress tensor `mo_blockintegral(22)`.

## 2. The observation I want attacked

I sweep 37 rotor positions over **45° mechanical = 360° electrical** (p = 4),
holding the current angle fixed **in the rotor frame**. For a synchronous machine
that should give near-constant torque plus slot ripple. It does not:

| harmonic (cycles per 45° mech) | amplitude N·m | what I think it is |
|---|---|---|
| DC | **3.75** | the useful torque |
| k=1 | 53.65 | PM term, sin(δ), with δ sweeping |
| **k=2** | **80.17** | reluctance term, sin(2δ) — dominant |
| k=3 | 31.11 | 24-slot cogging (15° mech slot pitch) — legitimate |
| k=6 | 3.45 | normal ripple — legitimate |

Raw torque runs +55.0 → +114.2 (6.25°) → −88.4 (17.5°) → +69.5 (25°) → −100.3
(36.25°) → +55.0 (45°). Four sign reversals. Endpoints match exactly, so the
periodicity is right.

## 3. What I have already ruled out

- **Phase sequence.** Measured from the SOLVED layout: spatial MMF axes are
  A = 0°, B = +120°, C = +240° electrical. Currents are
  `i_a = I cos(θ)`, `i_b = I cos(θ−120°)`, `i_c = I cos(θ+120°)`, i.e.
  `i_k = I cos(θ − θ_k)`, which sums to `(3/2) I cos(φ − θ)` — a **forward**
  rotating MMF. Sequence is correct.
- **Geometry rotation.** Only the rotor steel label and the V-magnets carry the
  rotor offset; magnet positions AND their magnetisation vectors both rotate.
  Polarity alternates correctly (poles 0/2/4/6 outward, 1/3/5/7 inward),
  magnetisation within ±9° of radial.
- **Torque integral truncation.** Splitting the airgap into rotor-side and
  stator-side halves so the weighted-stress boundary sits in free space moved the
  answer 57.83 → 57.84 N·m. Not truncated.
- **rms/peak confusion.** 477 A rms → 674.58 A peak, applied correctly.
- **Sector/periodicity multiplier.** The LUA deck emits all 24 slots and 16
  magnet blocks — a genuine full 360° model, no symmetry factor to apply.

## 4. My current hypothesis, and why I distrust it

The excitation angle is set to `base + phase_A_axis − p·θ_mech`. If the correct
sign is **+**, then with **−** the relative angle δ sweeps at 2p·θ_m, giving
exactly one k=1 cycle and one k=2 cycle per 45° mech — which matches the table.

**But** I previously "fixed" this the other way on the strength of a 5-point
measurement over 15° mech (means: no advance −0.02, +p·θm −7.13, −p·θm +26.12).
I now believe that measurement was **aliased**: the reluctance term moves at
4p·θ_m = 240° of phase per 15° mech, which 5 samples cannot resolve. So my
evidence for the current sign is worthless, and I am re-running at 37 points
with the opposite sign.

## 5. The contradiction that makes me think this is not a sizing problem

Three quantities from the SAME FE deck, same mesh, same machine:

| route | value | implies |
|---|---|---|
| back-EMF, 324.06 V l-l rms at 19,500 rpm | λ_pm = 0.0324 Wb | **131.11 N·m** at 477 A rms |
| analytic design flux (with flux-focusing A_m/A_g = 0.562) | λ_pm = 0.0314 Wb | **126.95 N·m** |
| open-circuit airgap probe | B_peak 0.3175 T, rms 0.2379 T | back-EMF implies ~0.674 T peak — **0.47×** |
| FE torque integral | — | **3.75 N·m** DC (delivered) |

The two independent flux-linkage routes agree to 3% and both land within 5% of
the 125.21 N·m requirement. The torque integral is ~35× below them. A gap that
size cannot be saturation.

Separately the magnet is genuinely under-focused (A_m/A_g = 0.562, thickness at
12× mur·g_eff, i.e. 95.5% of Br — thickness saturated, face area starved). A
buildable rebalance to t = 7.0 / L = 23.34 mm gives A_m/A_g = 0.90 and ~1.53× the
airgap flux. I regard that as **real but secondary** and I want that judgement
challenged too.

## 6. Questions

1. Is the k=1/k=2 reading right — are those the PM and reluctance terms of a
   sweeping δ? If so, does k=2 > k=1 imply a saliency ratio, and what value?
2. Is there **any** mechanism other than a wrong advance sign that produces a
   sweeping δ at fixed rotor-frame command? What would distinguish them?
3. The airgap probe reads 0.47× of what the deck's own back-EMF implies. Which
   witness do you believe, and what would settle it?
4. Do you agree the excitation fault outranks the magnet rebalance, or would you
   do the rebalance first? Give a reason, not a preference.
5. Anything in §3 I have ruled out too confidently?
