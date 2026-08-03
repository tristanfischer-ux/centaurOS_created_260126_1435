# Formula E front powertrain kit — where it stands, and what decides it

**2026-08-02.** Twin `out/formula-e-front-mgu-20260729-1432`. Branch `oxccu-efuel`.
`ship_ok` **false**, homologation **NOT_HOMOLOGATED** throughout.

> **Updated 2026-08-03.** §7's thermal item is no longer an open caveat: with the
> iron loss derived from the real lamination, the **magnets breach their 150 °C
> limit by 9.3 K** on the design duty. The torque shortfall below is unchanged.

Every number below is a registered claim backed by a solver artefact, or it is
labelled as an assumption. Nothing here is hand arithmetic presented as a
measurement — where an estimate is a rescaling rather than a solve, it says so.

---

## 1. The headline

At the FIA front duty of **250 kW at 19,500 rpm**, the required shaft torque is
**125.2193 N·m**. The machine as designed delivers **81.558081 N·m** — a
**0.651×** result measured over a 37-point rotor sweep.

It does not close, and the shortfall is not a tuning problem.

## 2. What was tried, and what each was worth

| lever | result | verdict |
|---|---|---|
| **Magnet respec** | pole arc rebalanced; λ_pm 0.0014514 → 0.0155287 Wb | real gain, **not sufficient alone** |
| **Rotor diameter** | housing allows only **+1.8 mm** → ×1.0012 | worth nothing here |
| **Stack length** | closure alone needs **149.7 mm** in a 140.5 mm housing | exceeds the housing |
| **Bigger inverter** | 1.5× current gives ×1.5383 torque — it *closes* | **inadmissible**, see §3 |
| **Lower duty** | — | **fixed**: 250 kW is the FIA number |
| **Higher speed** | 250 kW at 30,000 rpm needs only 81.39 N·m | **closes**, at a cost — §4 |
| **Axial flux** | — | **unevaluable**: no solver in this repo |

## 3. Why a bigger inverter cannot be used

The obvious move is more current, and it works better than expected: this
machine is **64% reluctance torque**, so torque rises *superlinearly* with
current — 102.6% of linear at 1.5×, only falling to 97.7% at 2.0× where
saturation finally bites. At 1.5× current it makes 125.46 N·m and closes.

**It is still inadmissible.** At a fixed speed, more torque *is* more power:
P = T·ω. A 1.5× torque increase at 19,500 rpm is **375 kW against a 250 kW cap**.
A power cap is therefore also a torque cap at any given speed, and no inverter
size can be bought around it.

Worth keeping regardless: the superlinear response says the magnetic circuit is
**under-exploited** at the design point. If the duty turns out to be intermittent
(§6), that headroom becomes relevant.

## 4. The speed option, and why 30,000 rpm is the wrong answer

Required torque falls as `P/(η·ω)`, so speed is the only lever that respects the
power cap without new hardware. Rotor stress solved per speed with CalculiX
(`run_screen(rpm_override=…)`, not scaled by hand):

| speed | torque needed | machine makes | ratio | max stress | screening FoS |
|---|---|---|---|---|---|
| 19,500 | 125.22 | 81.558 | 0.651 | 96.94 MPa | 2.635 |
| 24,000 | 101.74 | 81.558 | 0.802 | 146.84 MPa | 1.740 |
| **27,000** | 90.44 | 81.558 | 0.902 | 185.84 MPa | **1.374** |
| 30,000 | 81.39 | 81.558 | **1.002** | 229.44 MPa | **1.113** |

30,000 rpm closes on the existing motor with no hardware change at all. **But a
screening factor of safety of 1.113 on a rotor at 30,000 rpm is not something to
build on** — and this screen family carries `release_fos_closed: false` and an
explicit instruction never to claim a pass from it.

**27,000 rpm is the more useful number**: FoS 1.374, and a 10% shortfall rather
than 35%, which a modest stack increase covers. See §5.

## 5. Recommended shape: two modest changes, not one heroic one

Rather than a 30,000 rpm rotor or a +52 mm housing, combine a moderate speed
rise with a moderate stack increase. All solved at their own geometry
(`_motor_stack/em_combined_case.json`); rotor FoS from the CalculiX sweep.

| speed | stack | delivered / required | ratio | axial allowance | freq | eddy loss |
|---|---|---|---|---|---|---|
| 27,000 rpm | 110 mm | 92.0 / 90.4 | **1.018×** | 30.5 mm | 1800 Hz | ×1.92 |
| 27,000 rpm | 120 mm | 100.4 / 90.4 | **1.110×** | 20.5 mm | 1800 Hz | ×1.92 |
| 24,000 rpm | 120 mm | 100.4 / 101.7 | **0.987×** | 20.5 mm | 1600 Hz | ×1.51 |
| 24,000 rpm | 130 mm | 108.8 / 101.7 | **1.069×** | 10.5 mm | 1600 Hz | ×1.51 |

Rotor screening FoS: 1.740 at 24,000 rpm, 1.374 at 27,000 rpm.

**The trade is speed against axial space.** Lower speed gives a safer rotor and
less iron loss but needs more stack, leaving less room for end windings and
bearings; higher speed frees axial space but works the rotor harder and raises
loss. **24,000 rpm / 130 mm** has the best rotor margin (FoS 1.740) at the cost of
only 10.5 mm axial allowance; **27,000 rpm / 120 mm** is the balanced pick.

Caveat carried from §7: torque only. The axial dimension is a 2-D planar depth
rescaling, not an independent solve, and the thermal case is not closed.

## 6. The question that may change all of the above

The duty bar is an **assumption**, and the engine flagged it before anyone
noticed:

```
front_regen_electrical_cap_kw = 250   basis=PEAK        "Gen3 public front regen electrical cap"
continuous_power_kw           = 250   basis=CONTINUOUS  "front continuous design duty ≈ regen cap
                                                         (Gen3 Evo motoring windows limited)"
continuous_regen_duration_s   = null  confidence=high   "No braking-event profile, lap duty cycle
                                                         or permitted continuous duration is stated;
                                                         continuous thermal inventory cannot be
                                                         closed from the brief alone."
```

The FIA figure is a **≤250 kW peak cap**. The continuous design duty was set
equal to it. The Gen3 front role is **regen only**; Gen3 Evo adds **limited AWD
traction windows**. Neither is obviously a continuous rating.

**This does not change the torque needed** — `T = P/(η·ω)` is the same for two
seconds or two hours. What an intermittent duty would normally buy is permission
to push more current, and §3 shows the machine responds superlinearly to it. That
door is currently shut by the power cap *and* by the inverter: `phase_current_max_a`
equals `phase_current_design_a` at 477 A.

**So the single highest-value input is the real duty cycle.** It decides whether
this is a design problem at all.

## 7. What is NOT covered

- **Thermal — now a BREACH, not an open item (re-solved 2026-08-03).** The
  contract carried **135.56 W** of stator iron loss, from a hardcoded eddy
  coefficient (`steinmetz_ke = 1e-7`) that corresponds to no real electrical
  steel, a generic 3.0 kg of iron against the measured 6.62 kg, and a single
  lumped 1.2 T against separately-probed teeth (1.799 T) and yoke (2.104 T).
  Derived from the machine's own **M400-50A / 0.50 mm** lamination
  (kh 0.03222, ke 1.1686e-4) on the measured flux and mass: **6035 W** — teeth
  2249 W, yoke 3786 W, yoke dominant. **45× the figure the cooling was sized on.**

  Machine losses 2.3 → **8.2 kW**; total heat 6.6 → **12.5 kW**; coolant rise
  9.1 → **17.2 K** (60 → 77.2 °C). Against limits: winding 159.3 °C (limit 180,
  +20.7 K), module 120.4 °C (limit 175, +54.6 K), **magnet 159.3 °C against a
  150 °C limit — a 9.3 K BREACH**. `all_temperatures_below_screen_limits` is
  False. Compounding: hot magnets lose remanence, costing torque on a machine
  already at 0.651×. Raising speed makes it worse — eddy loss goes as f².

  Two caveats, both load-bearing. The 6035 W is an **upper bound**, not a
  measurement: the Steinmetz form is fitted below saturation and this yoke sits
  at 2.10 T, outside it. And the two cooling screens **disagree by 76 K** — the
  coupled network screen reports 82.9 °C because its thermal path is the
  convective film alone (R = 0.000378 K/W) with no conduction from winding
  through slot liner and stator iron to the jacket wall; the lumped screen's
  0.01 K/W is 23× larger and is the credible value. **Trust the 159.3 °C.** The
  network screen needs a winding→wall resistance before its output means
  anything — flagged, deliberately not patched with a fudge factor.
- **Yoke saturation** at 2.09 T, which is why torque delivers 97.6% of geometric
  scaling rather than 100%.
- **Bearings, magnet retention and rotor dynamics** at raised speed.
- **Gear ratio** would change from 8 to ~11–12 depending on the speed chosen.
- **Packaging.** The bay envelope (343 × 259 × 267 mm) has room for a longer
  housing, but that check is a bounding box and models no gearbox, driveshafts,
  suspension or crash structure.
- **System closure.** Every number here is torque. Voltage, inverter limits and
  thermal are unproven.

## 8. Programme context

The Gen3 front powertrain is a **spec / common kit for all teams** of
Lucid/Atieva supplier lineage — *not* manufacturer-free like the rear MGU. A team
does not design this unit. That shapes what this exercise is: a supplier-side or
benchmarking study, not a car programme deliverable.

## 9. What would close this out fastest

1. **Get the real duty** — continuous or intermittent, the braking profile, the
   permitted speed range. §6 may dissolve the problem.
2. **Pick a speed** and commission a real rotor burst analysis at it. The
   screening FoS is not a release FoS.
3. **Re-derive the thermal case** against the real lamination loss. This is a
   risk to the package independent of which option wins.
