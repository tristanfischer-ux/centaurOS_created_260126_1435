# FE Front MGU — EM torque shortfall: independent review brief

**Date:** 2026-07-31 · **Status:** OPEN architecture blocker · `ship_ok=false`
**Ask:** review the maths and the framing. Challenge the premises, not just the arithmetic.

---

## 1. What the kit must do

| Quantity | Value | Source |
|---|---|---|
| Electrical power | 250 kW | brief |
| Max rotor speed | 19,500 rpm | brief |
| Assumed regen efficiency | 0.978 | contract |
| **Required shaft torque** | **125.215 N·m** | `shaft_torque_identity` |
| DC bus | 750 V nominal (600–900 V) | brief |
| Phase current (design) | 535 A | contract |
| Rotor poles / stator slots | 8 / 24 | `em_fia_front_kit_case` |
| Front bay envelope | W 343 × D 259 × H 267 mm | brief |

Sanity: T = P/ω = 250,000 / (19,500 × 2π/60) = 122.4 N·m; with the efficiency
assumption the identity returns 125.215 N·m. **This is set by POWER and SPEED, so
the gear ratio does not change it** — the ratio moves wheel torque, not motor torque.

---

## 2. The geometric envelope is the binding constraint

`fpk_concentric_geometry` caps the rotor from the bay cross-section:

```
od_cap        = min(bay_D × 0.98, bay_H × 0.96) × 0.78
              = min(253.8, 256.3) × 0.78 = 197.98 mm
bay-max rotor = od_cap / 1.42 = 139.42 mm     (1.42 = jacket + MCU shelf + wall build)

axial cap     = bay_W × 0.98 − 2×wall − 16 = 308.1 mm
              housing = stack + 2×end_wind, end_wind = max(18, 0.22×stack)
              => max stack ≈ 214 mm
```

---

## 3. Measured FE results (FEMM/xfemm magnetostatic, 37-point rotor sweep)

All at the bay-max rotor 139.4 mm, 8 poles, 24 slots, 477 A rms, −40°e:

| Config | stack | mean \|T\| | ratio vs 125.215 |
|---|---|---|---|
| bay-max rotor | 97.58 mm | 44.566 N·m | **0.356** |
| bay-max rotor, **axial max** | 205.0 mm | 93.626 N·m | **0.748** |

Stack scaling is exactly linear (44.566 × 205/97.58 = 93.6 vs 93.626 measured), as
expected for T ∝ L at fixed diameter.

**So at the maximum rotor AND maximum stack the bay permits, the machine reaches
74.8% of required torque. Geometry is exhausted.** Closing needs ×1.337 from
non-geometric levers.

### Field weakening — NOT the limit
`em_fia_voltage_fw_screen`: back-EMF 324.1 V l-l rms at 19,500 rpm; loaded terminal
322.5 V; worst utilisation **0.928 at 600 Vdc**; FW not indicated. There is voltage
headroom, so the machine is current/torque limited, not voltage limited.

---

## 4. Corrections already made (so reviewers do not re-derive dead ends)

1. **The rotor-position sweep was UNPHYSICAL.** It held the stator current angle
   fixed IN SPACE while mechanically rotating the rotor — measuring a machine
   falling out of synchronism. |T| collapsed 214.7 → 6.65 N·m over 13.75° mech;
   ripple 169% of mean. Fixed to hold the commanded angle in the ROTOR frame
   (θe = p·θm, p = 4). Ripple now 21%. **Every torque number published before this
   fix is void.**
2. **Two incompatible machines.** The twin's artefacts were split: torque screens on
   a 197.1 mm rotor, structural/demag/cooling screens on 122.0 mm. The 197.1 mm
   rotor **does not fit the bay** (needs 279.9 mm vs 197.98 mm cap). All figures in
   §3 are on the bay-legal 139.4 mm machine.
3. **A D²L scaling estimate was optimistic by 2×** (predicted 0.716, measured
   0.356). Diameter scaling is not trustworthy here; length scaling is.

---

## 5. Known weaknesses in the present analysis — please attack these

- **Single current angle.** §3 is at −40°e, not an MTPA optimum. `em_fia_mtpa_screen`
  is running; expected recovery is single-digit %, but that is an assumption.
- **`torque_reliable=false`** — no dyno correlation, no full torque map.
- **Magnetostatic only** — no iron loss, no temperature-dependent remanence, no
  demagnetisation check at the elevated current levels proposed below.
- **The 1.42 radial build factor** (jacket + MCU shelf + wall) is a derivation
  constant. If it is conservative, the bay-max rotor grows and T grows as ~D².
  **This is the highest-leverage assumption in the whole chain — is 1.42 right?**
- **The 0.78 cross-section fraction** is likewise a derivation constant.
- Slot/pole count 24/8 has not been traded. Would a different combination
  (e.g. 48/8, or a higher pole count) raise torque density materially at this bore?

---

## 6. The levers, with honest costs

| Lever | Required change | Consequence |
|---|---|---|
| Electrical loading | 535 A → ~715 A (+34%) | I²R ×1.79; cooling + inverter re-screen; demag risk at temperature |
| Magnet remanence | higher grade NdFeB | ~+17% at best — **insufficient alone** |
| Speed | 19,500 → ~26,080 rpm at 250 kW | centrifugal stress ×1.79; rotor structural screen void; bearings |
| Bay envelope | grow D/H beyond 259/267 | vehicle-level change |
| Slot/pole trade | ? | unexplored |
| Radial build factor 1.42 | if reducible, rotor grows, T ~ D² | derivation assumption, not physics |

---

## 7. Questions for the panel

1. Is the 125.215 N·m requirement itself right, given it is fixed by P and ω?
2. Is a 74.8% shortfall at bay-max geometry credible for a 139.4 mm bore IPMSM at
   477 A rms, or does that suggest an error in the FE setup / winding model?
   **What torque density (N·m/litre of rotor volume) should this machine achieve?**
3. Which lever would you pursue, and what have we missed?
4. Is the 1.42 radial build factor defensible, and what would a real FE front MGU use?
5. Any error in §1–§3?
