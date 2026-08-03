"""PHANTM — the tooth-region model, with an IDEAL return path.

WHY THIS EXISTS. The previous model unrolled the real (out-of-plane) horseshoe
into the tooth plane. That was not merely approximate, it was actively wrong:
the straightened bridge sat 1.17 mm from the pole foot at a fifth of the real
limb thickness, so it both SHUNTED flux away from the teeth and added series
reluctance. Measured consequence: 0.084 T in the working gap against 0.277 T in
the bridge, and forces about 5x below an independent model with faithful
topology.

THE DECOMPOSITION USED HERE, which is the standard way to treat a magnetic
circuit whose return path is not coplanar with the working region:

  EXACT   the teeth, the two working gaps and the pole feet. This region IS
          prismatic across the 1200 um transverse width, so a 2D planar solve
          is not an approximation of it — it is exact, up to transverse end
          effects at the two outer faces.
  SEPARATE the return path. Its job is to carry flux round with as little
          reluctance as possible; it does not modulate with translator
          position, so it contributes NOTHING to force shape and only scales
          the flux available. Here it is drawn deliberately FAR from the teeth
          and GENEROUSLY thick, so it approaches an ideal return, and the real
          bridge reluctance is added afterwards as a series term.

What this buys: force-versus-position shape, gap sensitivity and modulation
depth all come from the exact region. Those are the quantities the design
decisions turn on. The absolute level still needs the real return reluctance,
which is a separate and much easier calculation than a full 3D solve.

WHAT THIS DOES NOT FIX: transverse (out-of-plane) end effects at the 1200 um
faces, which a 2D planar solve cannot see at all. Those are a real residual and
are the reason a 3D reference is still worth building eventually.

Run: ~/.venvs/phantm/bin/python -m femm.tooth_exact
"""

from __future__ import annotations

import json
import math
import os
import time

import numpy as np

from params import BASELINE
from . import lua_gen
from .sweep import CASES, run_case
from .tony_v2_fe import DEPTH, PITCH, POLE_FOOT, POLE_SLOT_D, SLOT_D_TRANS, LX

OUT = os.path.join(os.path.dirname(__file__), "..", "out")

# How far to push the return path away from the teeth, in tooth pitches, and
# how thick to make it relative to the pole back. Both are deliberately
# generous; the convergence check below sweeps them to prove the answer no
# longer depends on either.
RETURN_CLEAR_PITCHES = 8.0
RETURN_THICK_SCALE = 4.0


def configure(gap_um: float, turns: int = 70, pitch: float = PITCH,
              tooth: float | None = None, slot_d: float = SLOT_D_TRANS,
              pole_slot_d: float = POLE_SLOT_D, n_pole_teeth: int = 3,
              clear_pitches: float = RETURN_CLEAR_PITCHES,
              thick_scale: float = RETURN_THICK_SCALE):
    g = lua_gen
    g.PITCH = pitch
    g.TOOTH = tooth if tooth is not None else round(0.401 * pitch, 4)
    g.GAP = gap_um / 1000.0
    g.HT = LX / 2.0
    g.SLOT_T = slot_d
    g.DEPTH = DEPTH
    g.SS_TIP_Y = g.HT + g.GAP
    g.SS_SLOT_D = pole_slot_d
    g.SS_BACK_DRAWN = 0.310 * (1.076 / DEPTH)
    g.SS_BACK_Y0 = g.SS_TIP_Y + g.SS_SLOT_D
    g.SS_BACK_Y1 = g.SS_BACK_Y0 + g.SS_BACK_DRAWN
    g.N_POLE_TEETH = n_pole_teeth
    g.POLE_HALF = max(POLE_FOOT, n_pole_teeth * pitch) / 2.0

    # --- the ideal return path -------------------------------------------
    # far away, and thick. Thickness matters as much as distance: a thin limb
    # is a reluctance in series with the gaps, which is exactly what depressed
    # the flux before.
    g.BRIDGE_T = g.SS_BACK_DRAWN * thick_scale
    g.BRIDGE_X1 = -(g.POLE_HALF + clear_pitches * pitch)
    g.BRIDGE_X0 = g.BRIDGE_X1 - g.BRIDGE_T
    g.COND_W = 0.110
    # translator ends clear of the coil, symmetric about the pole
    g.TRANSL_XR = g.POLE_HALF + 3 * pitch
    g.TRANSL_XL = -g.TRANSL_XR
    g.GAP_STRIP_X = g.POLE_HALF * 0.90
    g.AIR = abs(g.BRIDGE_X0) + 1.0, 1.8
    BASELINE.coil.n_turns = turns
    BASELINE.materials.ndfeb_br_t = 0.0


def solve(i_a: float, n_x: int = 16):
    """Force over one pitch, DC artefact removed, plus where the flux sits."""
    xs = (np.arange(n_x) / n_x - 0.5) * lua_gen.PITCH
    res = [run_case(float(x), i_a, 0.05) for x in xs]
    fx = np.array([r["fx"] for r in res])
    lam = np.array([r["flux_linkage"] for r in res])
    gap_b = np.array([abs(r["gap_by_int"] / r["gap_vol"]) for r in res])
    br_b = np.array([abs(r["bridge_by_int"] / r["bridge_vol"]) for r in res])
    dc = float(np.mean(fx))
    f = fx - dc
    L = lam / i_a
    return dict(xs=xs, f=f, dc=dc, peak_mn=float(np.max(np.abs(f))) * 1e3,
                gap_b=float(np.mean(gap_b)), bridge_b=float(np.mean(br_b)),
                mod_pct=float(L.max() - L.min()) / float(L.mean()) * 100,
                l_mean_uh=float(L.mean()) * 1e6)


def at_dx(i_a, dx_mm=0.078, n_x=16):
    s = solve(i_a, n_x)
    return abs(float(np.interp(dx_mm, s["xs"], s["f"],
                               period=lua_gen.PITCH))) * 1e3, s


def main():
    t0 = time.time()
    os.makedirs(CASES, exist_ok=True)
    out = {}

    print("STEP 1 — does the answer still depend on where the return path is?")
    print("If it does, the return is still participating and the model is not")
    print("yet a clean tooth-region solve.")
    print(f"{'clear':>7} {'thick':>7} {'F@0.35A':>9} {'gap B':>8} {'return B':>9} {'mod%':>7}")
    conv = []
    for clear in (4.0, 8.0, 12.0):
        for thick in (2.0, 4.0):
            configure(60, 70, clear_pitches=clear, thick_scale=thick)
            f, s = at_dx(0.35)
            print(f"{clear:7.0f}p {thick:7.1f}x {f:9.3f} {s['gap_b']:8.3f} "
                  f"{s['bridge_b']:9.3f} {s['mod_pct']:7.2f}", flush=True)
            conv.append(dict(clear_pitches=clear, thick_scale=thick,
                             force_mn=round(f, 4), gap_b=round(s["gap_b"], 4),
                             return_b=round(s["bridge_b"], 4),
                             mod_pct=round(s["mod_pct"], 3)))
    out["return_path_convergence"] = conv

    print()
    print("STEP 2 — Tony's three benchmark cases, on the corrected model")
    print(f"{'case':24s} {'Tony':>8} {'ours':>8} {'ratio':>7} {'gap B':>8}")
    bench = []
    for nm, gp, i, tn, tony in (("60 um 0.35 A 70 T", 60, 0.35, 70, 4.157),
                                ("20 um 0.35 A 70 T", 20, 0.35, 70, 6.855),
                                ("40 um 0.50 A 90 T", 40, 0.50, 90, 31.318)):
        configure(gp, tn)
        f, s = at_dx(i)
        print(f"{nm:24s} {tony:8.3f} {f:8.3f} {f/tony:7.2f} {s['gap_b']:8.3f}",
              flush=True)
        bench.append(dict(case=nm, tony_mn=tony, ours_mn=round(f, 3),
                          ratio=round(f / tony, 3), gap_b=round(s["gap_b"], 4)))
    out["benchmark"] = bench

    print()
    print("STEP 3 — gap sensitivity, the number the design turns on")
    configure(60, 70)
    f60, _ = at_dx(0.35)
    configure(20, 70)
    f20, _ = at_dx(0.35)
    print(f"  60 -> 20 um at fixed drive: ours {f20/f60:.2f}x   "
          f"(Tony 1.65x, our OLD model 4.40x)")
    out["gap_sensitivity_60_to_20"] = round(f20 / f60, 3)

    out["runtime_s"] = round(time.time() - t0, 1)
    json.dump(out, open(os.path.join(OUT, "tooth-exact.json"), "w"), indent=1)
    print(f"\nwrote out/tooth-exact.json ({out['runtime_s']:.0f} s)")


if __name__ == "__main__":
    main()
