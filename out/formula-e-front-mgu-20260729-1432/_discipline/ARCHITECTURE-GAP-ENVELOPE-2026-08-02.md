# §5.3 — the architecture gap: CORRECTED envelope, 2026-08-02

The first version of this brief contained two errors, both found by the start
council's arithmetic checks. Both are corrected below and the corrections change
the conclusion's *reasoning*, though not its direction.

## 1. The denominator — SETTLED by a canonical rule, not by argument
`scripts/motor-stack/shaft_torque_identity.py` exists specifically to stop this
drift (red-team F-EM-2, 2026-07-31). The bar is

    T_required = P_elec / (eta_combined * omega),  eta = 0.9777

    = 250 kW / (0.9777 * 2042.04 rad/s) = **125.2193 N·m**

The module's own docstring: the eta=1 value of 122.43 N·m is *"diagnostic only;
never the kit duty bar"*. The **117.000 N·m** from `wheel_torque/(ratio*eta)` is
a DIFFERENT quantity — the driveline demand at the wheel — and a machine meeting
125.22 covers it. Sol was right that the brief conflated them.

**Residual against the measured 81.558081 N·m: ×1.5353.**

## 2. Tip speed — I MISREAD THE QUANTITY, and it was stale as well
- `tip_speed_at_retention_m_s = 137` is **not a limit**. Its own condition reads
  *"at 1.10× base speed retention"* — it is the same rotor evaluated at an
  overspeed point, from `motor:rotor-centrifugal-stress`. The 137/124.54 = 1.100
  I called "headroom" is simply the overspeed factor. There was never a stated
  tip-speed ceiling.
- Both stored values are also **stale**: `fpk_physics_tree.py:448` reads
  `d_gap_mm=_num(q, "rotor_airgap_diameter_mm", "fpk_rotor_od_mm", default=122.0)`
  and 124.54 m/s is exactly 122.0 mm at 19,500 rpm. The lookup resolves correctly
  NOW (139.4 mm → 142.33 m/s), so the value dates from a run before that quantity
  existed. Same silent-default family as `ke=1e-5` and `iron_mass_kg=5.0`.

**The real rotor constraint** is the CalculiX screen, which ran on the CORRECT
geometry (rotor OD 139.4 / ID 105.9 / length 97.58):
max principal stress **96.94 MPa** vs an assumed yield of **355 MPa**,
**FoS 2.635** at 19,500 rpm, `release_fos_closed: false`, and an explicit
*"never claim PASS or closed release FoS from this screening case"*.
Stress scales as D² at fixed speed, so yield would not be reached until
D ≈ 266.8 mm (D ≈ 217.8 mm at a 1.5 FoS target). **Rotor stress is not what caps
the diameter.**

## 3. What actually caps each lever
| lever | cap | number |
|---|---|---|
| **radial** | stator OD 188.2 mm inside a 198.0 mm housing — **4.90 mm of wall** | proportional growth to a 192 mm stator OD is ×1.020 on D, **×1.041 on D²** |
| **axial** | 140.5 mm housing, before end windings/bearings/seals | ×1.5353 needs a **149.7 mm** stack |
| **rotor stress** | FoS 2.635 screening | not binding until D ≈ 218–267 mm |
| **iron** | yoke already at **2.09 T**, iron loss understated (993.6 W defaulted vs several × on the real M400-50A lamination) | makes naive D²L scaling optimistic |

Diameter alone would need a **233.2 mm stator OD in a 198.0 mm housing —
exceeds by 35.2 mm**. Combining maximum radial growth (×1.041) with axial still
demands a **143.9 mm stack** in a 140.5 mm housing, before end turns.

## 4. Gear ratio is NOT a lever for this duty bar — and this is the crux
The canonical bar is set by **power at speed**: `T = P/(eta*omega)`. Gear ratio
does not appear in it. Changing the ratio changes the WHEEL torque delivered, not
the motor's required torque at its own duty point. Ratio is only a lever if the
requirement is expressed as wheel torque (the 117 N·m route), which is not the
bar the screens use. My first brief listed it as "the lever the EM deck cannot
see"; that was wrong for this duty definition, and Sol's challenge to it was
correct for a different reason than the one Sol gave.

## 5. Where this points — to be CONFIRMED WITH TOOLS, not concluded here
Radial exhausted, axial exhausted, rotor stress not binding, iron saturated, and
the one system-level lever does not act on this bar. That points to **the front
unit not meeting this duty in this housing envelope**, which is a legitimate
engineering finding — but it must be produced by `em_fia_torque_map_screen.py`
(the calculation guard's top hit) and a candidate re-solve through
`em_fia_front_kit_case.py`, not by the scaling arithmetic above, which Sol
correctly warns extrapolates through already-saturated iron.

## Non-goals
- Do NOT re-open the magnet rebalance. (Note: the "3.07×" figure repeated all
  session is **unbacked** by the current claims — Grok. Current claims show
  λ_pm 0.0014514 → 0.0155287 Wb and probe torque 18.076 → 81.558 N·m. Retire or
  re-derive 3.07× before reusing it.)
- Do NOT re-litigate 0.651×. `ship_ok` stays false.
