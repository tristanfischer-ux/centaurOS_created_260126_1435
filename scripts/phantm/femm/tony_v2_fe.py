"""PHANTM — finite element on Tony's v2 actuator (28 Jul drawings).

Answers the two force questions in his worksheet that cannot be answered from
a lumped estimate: peak dL/dx, and force vs current at 0.30 / 0.35 / 0.40 A.

WHAT IS EXACT AND WHAT IS NOT, stated up front because it decides how much
weight the answer carries. The tooth-and-gap region — which is where reluctance
force is actually produced — is modelled from Tony's dimensions exactly:

    translator teeth   125 um on a 312 um pitch, slots 187 um x 280 um deep
    pole teeth         140 um on the SAME 312 um pitch (140 + 172 = 312, which
                       is how we know the pole and translator pitches agree)
    working gap        60 um
    out-of-plane depth 1200 um

The back-iron and the wound limb are approximate: the drawing gives outline
dimensions (815 / 960 / 1076 / 1521 / 1935 um) without enough to fix the flux
path unambiguously, and the unrolled-loop idealisation of the original model
still applies. Since force is dominated by the gap permeance derivative and the
back iron only matters if it saturates, that approximation costs little at
these currents — but bridge saturation is reported so it is visible if it bites.

FORCE IS A RELUCTANCE FORCE HERE. Section 2 of Tony's worksheet asks for force
vs current on a single phase, which is the coil acting alone: F = 1/2 i^2 dL/dx.
So the magnet is set to zero remanence for this study — the permanent-magnet
detent is a separate question (his section 7) and is not double-counted here.

Run: ~/.venvs/phantm/bin/python -m femm.tony_v2_fe  ->  out/tony-v2-fe.json
"""

from __future__ import annotations

import json
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from params import BASELINE
from . import lua_gen
from .sweep import CASES, run_case

OUT = os.path.join(os.path.dirname(__file__), "..", "out")

# ---- Tony's v2 dimensions (mm) --------------------------------------------
PITCH = 0.312
TOOTH_TRANS = 0.125          # translator tooth width
TOOTH_POLE = 0.140           # pole tooth width (140 + 172 = 312 = pitch)
GAP = 0.060
LX = 0.840                   # translator across-gap dimension
CORE = 0.280                 # central spine
SLOT_D_TRANS = 0.280         # translator slot depth
DEPTH = 1.200                # transverse (out of plane)
POLE_SLOT_D = 0.120          # pole slot depth (drawing's 120 um feature)
POLE_FOOT = 0.960            # pole foot axial length (carries 3 teeth at pitch)
N_TURNS = 70

# Tony's three points, plus the range needed to find where the force target is
# actually reached — extrapolating i^2 across a saturation knee is exactly the
# kind of shortcut that produces a confident wrong answer, so it is solved.
CURRENTS = [0.30, 0.35, 0.40, 0.70, 1.00, 1.20, 1.40, 1.60, 2.00]
N_X = 16                     # positions over one pitch

R_COIL_OHM = 3.618           # from tony_v2.py (70 turns, 40 um wire)
SUPPLY_V = 5.0
CU_C_VOL = 3.45e6            # J/(m^3 K), copper volumetric heat capacity
WIRE_BARE_M = 40e-6


def configure():
    """Point the generator at Tony's v2 geometry."""
    g = lua_gen
    g.PITCH = PITCH
    g.TOOTH = TOOTH_TRANS
    g.GAP = GAP
    g.HT = LX / 2.0                       # translator half-height, 420 um
    g.SLOT_T = SLOT_D_TRANS
    g.DEPTH = DEPTH
    g.SS_TIP_Y = g.HT + GAP
    g.SS_SLOT_D = POLE_SLOT_D
    # pole back iron: keep the real transverse width, scaled into the plane the
    # same way the original model does (area-preserving unroll)
    g.SS_BACK_DRAWN = 0.310 * (1.076 / DEPTH)
    g.SS_BACK_Y0 = g.SS_TIP_Y + g.SS_SLOT_D
    g.SS_BACK_Y1 = g.SS_BACK_Y0 + g.SS_BACK_DRAWN
    g.POLE_HALF = POLE_FOOT / 2.0
    g.BRIDGE_T = 0.400 * (1.200 / DEPTH)  # wound limb, 400 um window dimension
    g.BRIDGE_X1 = -(g.POLE_HALF + 0.55)
    g.BRIDGE_X0 = g.BRIDGE_X1 - g.BRIDGE_T
    g.COND_W = 0.110
    # The translator must start clear of the coil conductor block, which
    # occupies BRIDGE_X1 .. BRIDGE_X1 + COND_W at the translator's own height.
    # Overlapping regions is what "material properties have not been defined
    # for all regions" actually means — the solver sees the intersection as a
    # region nobody labelled.
    g.TRANSL_XL = g.BRIDGE_X1 + g.COND_W + 0.12
    g.TRANSL_XR = g.POLE_HALF + 0.45
    # the fine-mesh gap strip must sit INSIDE both the translator and the pole
    # foot, or it creates a region the solver has no material for
    g.GAP_STRIP_X = min(g.POLE_HALF, g.TRANSL_XR, abs(g.TRANSL_XL)) * 0.90
    g.AIR = 2.4, 1.8
    BASELINE.coil.n_turns = N_TURNS
    BASELINE.materials.ndfeb_br_t = 0.0   # reluctance force only — no magnet


def sweep(i_a: float, workers: int = 6):
    xs = (np.arange(N_X) / N_X - 0.5) * PITCH
    with ThreadPoolExecutor(max_workers=workers) as ex:
        res = list(ex.map(lambda x: run_case(float(x), i_a, 0.05), xs))
    fx = np.array([r["fx"] for r in res])
    lam = np.array([r["flux_linkage"] for r in res])
    bb = np.array([abs(r["bridge_by_int"] / r["bridge_vol"]) for r in res])
    return xs, fx, lam, bb


def main():
    t0 = time.time()
    os.makedirs(CASES, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    configure()

    rows, curves = [], {}
    for i_a in CURRENTS:
        xs, fx, lam, bb = sweep(i_a)
        # inductance from flux linkage; dL/dx by centred difference on the
        # periodic sweep (the quantity Tony asked for directly)
        L_h = lam / i_a
        dx = float(xs[1] - xs[0]) * 1e-3          # m
        dLdx = np.gradient(np.concatenate([L_h, L_h[:1]]),
                           dx)[:len(L_h)]
        peak_f = float(np.max(np.abs(fx)))
        rows.append(dict(
            current_a=i_a,
            force_mn=round(peak_f * 1e3, 3),
            peak_dL_dx_h_per_m=round(float(np.max(np.abs(dLdx))), 4),
            L_aligned_uh=round(float(np.max(L_h)) * 1e6, 3),
            L_unaligned_uh=round(float(np.min(L_h)) * 1e6, 3),
            b_bridge_max_t=round(float(np.max(bb)), 3),
            # cross-check: F = 1/2 i^2 dL/dx should reproduce the stress-tensor
            # force if the model is self-consistent
            force_from_dLdx_mn=round(0.5 * i_a ** 2
                                     * float(np.max(np.abs(dLdx))) * 1e3, 3),
            mmf_at=round(N_TURNS * i_a, 1),
            volts_across_coil=round(i_a * R_COIL_OHM, 2),
            inside_5v=bool(i_a * R_COIL_OHM <= SUPPLY_V),
            ohmic_w=round(i_a ** 2 * R_COIL_OHM, 2),
            current_density_a_mm2=round(
                i_a / (math.pi * (WIRE_BARE_M / 2) ** 2) * 1e-6, 0)))
        curves[f"{i_a:.2f}"] = dict(x_mm=[round(float(v), 5) for v in xs],
                                    fx_mn=[round(float(v) * 1e3, 4) for v in fx],
                                    L_uh=[round(float(v) * 1e6, 4) for v in L_h])
        r = rows[-1]
        print(f"  {i_a:.2f} A -> peak force {r['force_mn']:8.3f} mN   "
              f"peak dL/dx {r['peak_dL_dx_h_per_m']:8.4f} H/m   "
              f"L {r['L_unaligned_uh']:.2f}-{r['L_aligned_uh']:.2f} uH   "
              f"B_br {r['b_bridge_max_t']:.2f} T  {r['mmf_at']:.0f} At  "
              f"{r['volts_across_coil']:.2f} V{'' if r['inside_5v'] else ' OVER 5V'}  "
              f"{r['ohmic_w']:.2f} W", flush=True)

    out = dict(geometry=dict(
        pitch_mm=PITCH, tooth_translator_mm=TOOTH_TRANS,
        tooth_pole_mm=TOOTH_POLE, gap_mm=GAP, depth_mm=DEPTH,
        n_turns=N_TURNS, slot_depth_translator_mm=SLOT_D_TRANS,
        pole_slot_depth_mm=POLE_SLOT_D),
        note=("reluctance force only (no magnet); tooth/gap region exact from "
              "Tony's dimensions, back iron and wound limb approximate"),
        force_vs_current=rows, curves=curves,
        runtime_s=round(time.time() - t0, 1))
    json.dump(out, open(os.path.join(OUT, "tony-v2-fe.json"), "w"), indent=1)
    print(f"\nwrote out/tony-v2-fe.json ({out['runtime_s']:.0f} s)")


if __name__ == "__main__":
    main()
