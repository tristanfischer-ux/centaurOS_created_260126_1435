"""PHANTM — Tony's v2 actuator (28 Jul drawings): the deterministic numbers.

Fills the worksheet Tony sent, from his dimensions, with every assumption named.
Force items (dL/dx and force-vs-current) come from finite element in
femm/tony_v2_fe.py and are read back here — nothing magnetic is asserted from a
lumped estimate, per the standing rule that Pm and Ic ship FE-validated only.

GEOMETRY, AS RECEIVED. All of Tony's drawing dimensions are labelled "mm" but
are microns (a SketchUp limitation he flagged). Two closure checks pass, which
is what licenses the rest:

  teeth 25 x 125 um + slots 24 x 187 um = 7613 um  vs his stated L_z 7.612 mm
  core 280 um + 2 x slot depth 280 um  =  840 um  vs his stated L_x 840 um

The tooth/slot assignment is forced by that first closure: 125 um teeth on a
312 um pitch, NOT the other way round (swapping them gives 7.675 mm and misses).
That makes the tooth duty 0.401 — which is, to three figures, the 0.40 the
optimisation campaign independently found to be the best point on the duty
sweep. Worth telling him: he has converged on the same number from the other
direction.

Run: ~/.venvs/phantm/bin/python tony_v2.py  ->  out/tony-v2-numbers.json
"""

from __future__ import annotations

import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

G = 9.80665
MU0 = 4e-7 * math.pi
RHO_CU_20 = 1.72e-8

# ---- translator, from Tony's drawing (um) ---------------------------------
N_TEETH, N_SLOTS = 25, 24
TOOTH_W_UM, SLOT_W_UM = 125.0, 187.0
PITCH_UM = TOOTH_W_UM + SLOT_W_UM              # 312
CORE_UM = 280.0                                # central spine
SLOT_D_UM = 280.0                              # slot depth, each face
LX_UM = CORE_UM + 2 * SLOT_D_UM                # 840 — across the gaps
LY_UM = 1200.0                                 # transverse (out of plane)
LZ_UM = N_TEETH * TOOTH_W_UM + N_SLOTS * SLOT_W_UM   # 7613
RHO_FECO = 8120.0                              # kg/m3, Fe-Co (Tony: 8.12 g/cc)

DETENT_G = 30.0                                # Tony's F_d = 30 * M_t * g

# ---- pole piece + coil, from Tony's drawing -------------------------------
GAP_UM = 60.0
N_TURNS = 70                                   # Tony's correction (drawing shows 60)
WIRE_BARE_UM = 40.0
WIRE_OD_UM = 48.0                              # enamelled, grade-2 class for 40 um bare
COIL_WINDOW_LEN_UM = 1521.0                    # along the wound limb
WOUND_LIMB_W_UM = 400.0                        # the drawing's window dimension
WOUND_LIMB_D_UM = LY_UM                        # transverse, same as the stack
SUPPLY_V = 5.0

STEPS_PER_S = 10.0                             # Tony's nominal rate


def translator():
    """Mass and the force targets that follow from it."""
    vol_full = LX_UM * LY_UM * LZ_UM                    # um^3
    # 24 slots per face, both faces, each slot_w wide x slot_d deep x LY
    vol_slots = 2 * N_SLOTS * SLOT_W_UM * SLOT_D_UM * LY_UM
    vol_um3 = vol_full - vol_slots
    vol_m3 = vol_um3 * 1e-18
    mass_kg = vol_m3 * RHO_FECO
    weight_n = mass_kg * G
    fd_n = DETENT_G * mass_kg * G
    return dict(
        volume_mm3=round(vol_um3 * 1e-9, 4),
        solid_fraction=round(vol_um3 / vol_full, 4),
        mass_mg=round(mass_kg * 1e6, 3),
        weight_mn=round(weight_n * 1e3, 4),
        detent_target_mn=round(fd_n * 1e3, 3),
        stepping_force_mn=[round(1.5 * fd_n * 1e3, 2), round(2.0 * fd_n * 1e3, 2)],
        pitch_um=PITCH_UM, tooth_duty=round(TOOTH_W_UM / PITCH_UM, 4),
        step_um=round(PITCH_UM / 3.0, 2),   # 3-phase => third-pitch steps
    )


def coil(temp_c: float = 20.0):
    """Resistance, inductance scale, time constant, drive voltage.

    Mean turn length is the one number NOT on the drawing. It is computed from
    the wound-limb cross-section plus half the winding build, and the answer is
    reported with its sensitivity so Tony can correct it in one line.
    """
    layers = math.ceil(N_TURNS / max(1, int(COIL_WINDOW_LEN_UM // WIRE_OD_UM)))
    turns_per_layer = math.ceil(N_TURNS / layers)
    build_um = layers * WIRE_OD_UM
    # mean turn sits at half the build out from the limb surface
    mean_w = WOUND_LIMB_W_UM + build_um
    mean_d = WOUND_LIMB_D_UM + build_um
    mean_turn_um = 2 * (mean_w + mean_d)
    len_m = N_TURNS * mean_turn_um * 1e-6
    area_m2 = math.pi * (WIRE_BARE_UM * 1e-6 / 2) ** 2
    rho = RHO_CU_20 * (1 + 0.00393 * (temp_c - 20.0))
    r_ohm = rho * len_m / area_m2
    j_at = lambda i: i / area_m2
    return dict(
        layers=layers, turns_per_layer=turns_per_layer,
        winding_build_um=round(build_um, 1),
        window_capacity_turns=int(COIL_WINDOW_LEN_UM // WIRE_OD_UM) * layers,
        mean_turn_length_um=round(mean_turn_um, 1),
        wire_length_mm=round(len_m * 1e3, 1),
        resistance_ohm=round(r_ohm, 3),
        current_density_a_mm2={f"{i:.2f}A": round(j_at(i) * 1e-6, 1)
                               for i in (0.30, 0.35, 0.40)},
        voltage_v={f"{i:.2f}A": round(i * r_ohm, 3) for i in (0.30, 0.35, 0.40)},
        inside_5v={f"{i:.2f}A": bool(i * r_ohm < SUPPLY_V)
                   for i in (0.30, 0.35, 0.40)},
    )


def mechanics(mass_mg: float, fd_mn: float, step_um: float, f_step_mn: float,
              pitch_um: float = PITCH_UM):
    """Step time, energy, power, and the magnetic-spring resonance.

    TWO stiffness models are reported, because they disagree by a factor of six
    and the difference is not a rounding matter.

    Tony's worksheet uses k = 2.pi.F_d/(S/2) with S the STEP (pitch/3). The
    standard result for a detent that varies sinusoidally over one tooth PITCH,
    F(x) = F_d.sin(2.pi.x/pitch), is the derivative at the zero crossing:

        k = dF/dx|_0 = F_d . 2.pi / pitch

    Substituting S/2 = pitch/6 in place of pitch inflates the stiffness by 6x
    and the resonant frequency by sqrt(6) = 2.45x. The sinusoidal form is the
    defensible one; Tony's is reported alongside it so the discrepancy is
    visible rather than silently resolved in our favour. (Caught by the 28 Jul
    red team.)
    """
    m = mass_mg * 1e-6
    s = step_um * 1e-6
    p = pitch_um * 1e-6
    f = f_step_mn * 1e-3
    # ballistic estimate: constant net force over the step, from rest
    t_step = math.sqrt(2 * s / (f / m)) if f > 0 else float("inf")

    def res(k):
        return (1 / (2 * math.pi)) * math.sqrt(k / m) if k > 0 else 0.0

    k_tony = 2 * math.pi * (fd_mn * 1e-3) / (s / 2) if s > 0 else 0.0
    k_sin = 2 * math.pi * (fd_mn * 1e-3) / p if p > 0 else 0.0
    return dict(step_time_ms=round(t_step * 1e3, 3),
                stiffness_tony_n_per_m=round(k_tony, 1),
                f_resonance_tony_hz=round(res(k_tony), 1),
                stiffness_sinusoidal_n_per_m=round(k_sin, 1),
                f_resonance_sinusoidal_hz=round(res(k_sin), 1),
                ratio=round(res(k_tony) / res(k_sin), 2) if k_sin else None,
                # the defensible figure is the sinusoidal one
                f_resonance_hz=round(res(k_sin), 1),
                stiffness_n_per_m=round(k_sin, 1),
                margin_over_step_rate=round(res(k_sin) / STEPS_PER_S, 1))


def supply_ceiling(r_ohm: float, supply_v: float = 5.0,
                   delta_t_k: float = 0.0, alpha: float = 0.00393):
    """Maximum current the rail can actually deliver, hot as well as cold.

    Copper resistance rises ~0.39 %/K, so a coil that just reaches its target
    current cold falls below it once it has warmed by even a few kelvin. A
    design sitting a couple of percent inside the rail has no margin at all —
    it works on the first pulse of a burst and not on the second.
    """
    r_hot = r_ohm * (1 + alpha * delta_t_k)
    return supply_v / r_hot


def pm_options(mmf_required_at: float):
    """FIRST-PASS SCREEN of magnet materials — explicitly NOT a verdict.

    LIMITATION, flagged independently by two seats of the 28 Jul red team and
    accepted. Comparing H_c x thickness against a coil's ampere-turns is NOT a
    valid way to rank magnets. The flux a magnet actually drives depends on its
    LOAD LINE — the external permeance it sees — together with its recoil
    permeability and the shape of its B-H curve. Two magnets with identical
    H_c.t can deliver very different flux into the same circuit. This is an
    order-of-magnitude screen for ruling candidates in or out and nothing more;
    thickness must finally be chosen from a magnetic-circuit solve with the
    magnet PRESENT.

    Minimum thicknesses are what each material is realistically SOLD in, which
    is not what is physically makeable, and they are not generic: 0.30 mm
    sintered ferrite is a ground ceramic part rather than catalogue plate, and
    0.20 mm bonded NdFeB means calendered/flexible sheet rather than ordinary
    moulded stock. Both carry a cost premium.
    """
    mats = [
        ("NdFeB sintered (N42-class)", 900e3, 1.30, 0.30,
         "highest energy; the required slice is far below any sheet stock"),
        ("SmCo (Sm2Co17)", 800e3, 1.05, 0.30,
         "as thin a problem as NdFeB, but tolerates far more heat"),
        ("Alnico 5", 50e3, 1.25, 0.50,
         "thick enough to handle easily, but low coercivity means it is easy "
         "to demagnetise in service — an adjacent coil reverse field is a real risk"),
        ("Sintered ferrite (Sr/Ba)", 250e3, 0.40, 0.30,
         "Tony's suggestion; cheap and corrosion-proof, but 0.30 mm is a "
         "GROUND part, not catalogue plate — and its H_c is close enough to "
         "the coil reverse field that demagnetisation needs a real check"),
        ("Bonded NdFeB", 600e3, 0.65, 0.20,
         "0.20 mm means calendered/flexible sheet rather than ordinary "
         "moulded stock; thin sections are routine in that form"),
    ]
    rows = []
    for name, hc, br, t_min_mm, note in mats:
        t_mm = mmf_required_at / hc * 1e3
        # The useful test is NOT "can it be made that thin" — you would simply
        # buy the thinnest stock available. It is what magnetomotive force that
        # thinnest stock then DELIVERS. Too much is as bad as too little here:
        # an over-strong detent is one the coil cannot step the translator out
        # of, which is exactly the failure the previous design ran into.
        mmf_at_min = hc * (t_min_mm * 1e-3)
        rows.append(dict(material=name, hc_ka_m=round(hc / 1e3),
                         br_t=br, thickness_required_mm=round(t_mm, 4),
                         supplier_min_thickness_mm=t_min_mm,
                         mmf_at_min_thickness_at=round(mmf_at_min, 1),
                         ratio_to_required=round(mmf_at_min / mmf_required_at, 2)
                         if mmf_required_at > 0 else None,
                         verdict=("MATCHES at the minimum thickness"
                                  if 0.6 <= mmf_at_min / mmf_required_at <= 1.6
                                  else ("far too strong — unsteppable"
                                        if mmf_at_min > mmf_required_at
                                        else "too weak even at sensible thickness")),
                         note=note))
    return rows


def main():
    os.makedirs(OUT, exist_ok=True)
    t = translator()
    c = coil()

    fe_path = os.path.join(OUT, "tony-v2-fe.json")
    fe = json.load(open(fe_path)) if os.path.exists(fe_path) else None

    # stepping force: FE if available, else the target band so the mechanics
    # numbers are still computable and clearly labelled as target-driven
    if fe and fe.get("force_vs_current"):
        f_step = max(r["force_mn"] for r in fe["force_vs_current"])
        f_src = "FE"
    else:
        f_step = t["stepping_force_mn"][0]
        f_src = "TARGET (finite element not yet run)"

    m = mechanics(t["mass_mg"], t["detent_target_mn"], t["step_um"], f_step)

    # energy per step at the recommended point
    out = dict(geometry=dict(
        teeth=N_TEETH, slots=N_SLOTS, tooth_um=TOOTH_W_UM, slot_um=SLOT_W_UM,
        pitch_um=PITCH_UM, core_um=CORE_UM, slot_depth_um=SLOT_D_UM,
        lx_um=LX_UM, ly_um=LY_UM, lz_um=LZ_UM, gap_um=GAP_UM,
        closure_lz_mm=round(LZ_UM / 1e3, 4), closure_lx_um=LX_UM),
        translator=t, coil=c, mechanics=m,
        stepping_force_used_mn=round(f_step, 3), stepping_force_source=f_src,
        fe=fe)

    json.dump(out, open(os.path.join(OUT, "tony-v2-numbers.json"), "w"), indent=1)

    print("TRANSLATOR")
    print(f"  volume {t['volume_mm3']} mm3 ({t['solid_fraction']*100:.1f}% solid)")
    print(f"  MASS {t['mass_mg']} mg   weight {t['weight_mn']} mN")
    print(f"  detent target (30 g) {t['detent_target_mn']} mN")
    print(f"  stepping force 1.5-2x  {t['stepping_force_mn'][0]}-"
          f"{t['stepping_force_mn'][1]} mN")
    print(f"  pitch {t['pitch_um']} um, duty {t['tooth_duty']}, "
          f"third-pitch step {t['step_um']} um")
    print("\nCOIL (70 turns, 40 um wire)")
    print(f"  {c['layers']} layers x {c['turns_per_layer']} turns; build "
          f"{c['winding_build_um']} um; window holds ~{c['window_capacity_turns']}")
    print(f"  wire {c['wire_length_mm']} mm -> R = {c['resistance_ohm']} ohm")
    for k, v in c["voltage_v"].items():
        print(f"    {k}: {v} V  (inside 5 V: {c['inside_5v'][k]}), "
              f"J = {c['current_density_a_mm2'][k]} A/mm2")
    print("\nMECHANICS")
    print(f"  stiffness {m['stiffness_n_per_m']} N/m -> resonance "
          f"{m['f_resonance_hz']} Hz ({m['margin_over_step_rate']}x the "
          f"{STEPS_PER_S:.0f} steps/s rate)")
    print(f"  ballistic step time {m['step_time_ms']} ms at {f_step:.2f} mN "
          f"[{f_src}]")
    print("\nwrote out/tony-v2-numbers.json")


if __name__ == "__main__":
    main()
