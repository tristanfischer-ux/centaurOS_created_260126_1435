"""PHANTM v2 — the gap x current design matrix, and the physics behind it.

THE GOVERNING NUMBER is the ratio of working gap to tooth width. A toothed
reluctance actuator makes force by MODULATING the gap permeance as teeth move
in and out of alignment. If the gap is small compared with the tooth, the
unaligned permeance is genuinely low and the modulation is deep. If the gap is
comparable with the tooth, flux simply fringes across from tooth to tooth even
when they are unaligned, the permeance barely changes, and there is almost
nothing to make force with.

At the as-drawn 60 um gap against 125 um teeth that ratio is 0.48, and the
measured inductance modulation is 3.2% of the mean. The ideal no-fringing
figure would be an order of magnitude larger; finite element gives 7-11% of the
ideal force across the range, i.e. fringing is throwing away about 90% of the
theoretical force. Closing the gap is therefore not a marginal optimisation —
it is the whole design.

MODEL VALIDITY. The magnetic circuit (pole, stub, bridge, coil) is held FIXED
and only the translator overhang varies for the convergence check: peak force
moves 0.4% between 2, 3 and 5 tooth pitches of overhang. Halving every meshsize
moves it 0.5%. The constant end-attraction of the unrolled model is removed as
a DC term before any peak is taken, exactly as the periodic structure requires
(a periodic device can have no net force averaged over a whole pitch).

Run: ~/.venvs/phantm/bin/python -m femm.tony_v2_matrix -> out/tony-v2-matrix.json
"""

from __future__ import annotations

import json
import math
import os
import time

import numpy as np

from . import lua_gen
from .sweep import CASES
from .tony_v2_fe import (CURRENTS, DEPTH, N_TURNS, PITCH, R_COIL_OHM,
                         SUPPLY_V, configure, sweep)

OUT = os.path.join(os.path.dirname(__file__), "..", "out")

GAPS_UM = [60, 40, 30, 20]
MU0 = 4e-7 * math.pi
N_POLE_TEETH = 3


def set_gap(gap_um: float):
    """Change ONLY the gap; the rest of the magnetic circuit stays put."""
    g = lua_gen
    configure()
    g.GAP = gap_um / 1000.0
    g.SS_TIP_Y = g.HT + g.GAP
    g.SS_BACK_Y0 = g.SS_TIP_Y + g.SS_SLOT_D
    g.SS_BACK_Y1 = g.SS_BACK_Y0 + g.SS_BACK_DRAWN
    g.TRANSL_XL = -(g.POLE_HALF + 3 * PITCH)
    g.TRANSL_XR = -g.TRANSL_XL
    g.BRIDGE_X1 = g.TRANSL_XL - g.COND_W - 0.12
    g.BRIDGE_X0 = g.BRIDGE_X1 - g.BRIDGE_T
    g.AIR = abs(g.BRIDGE_X0) + 0.8, 1.8


def ideal_force_mn(gap_um: float, i_a: float) -> float:
    """No-fringing upper bound, for scale: F = 0.5*(N.i)^2 * N^2 dP/dx / N^2."""
    dPdx = MU0 * (DEPTH * 1e-3) * N_POLE_TEETH / (2 * gap_um * 1e-6)
    return 0.5 * (N_TURNS * i_a) ** 2 * dPdx * 1e3


def main():
    t0 = time.time()
    os.makedirs(CASES, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    out = {"gaps_um": GAPS_UM, "currents_a": CURRENTS, "by_gap": {}}

    for gap in GAPS_UM:
        rows = []
        for i_a in CURRENTS:
            set_gap(gap)
            xs, fx, lam, bb = sweep(i_a)
            dc = float(np.mean(fx))
            pk = float(np.max(np.abs(fx - dc)))
            L = lam / i_a
            rows.append(dict(
                current_a=i_a, force_mn=round(pk * 1e3, 4),
                l_mean_uh=round(float(L.mean()) * 1e6, 3),
                l_span_uh=round(float(L.max() - L.min()) * 1e6, 4),
                modulation_pct=round(float(L.max() - L.min()) / float(L.mean())
                                     * 100, 2),
                b_bridge_t=round(float(np.max(bb)), 3),
                volts=round(i_a * R_COIL_OHM, 2),
                inside_rail=bool(i_a * R_COIL_OHM <= SUPPLY_V),
                ideal_mn=round(ideal_force_mn(gap, i_a), 2),
                fraction_of_ideal=round(pk * 1e3 / ideal_force_mn(gap, i_a), 3)))
            print(f"  gap {gap:3d} um  {i_a:.2f} A -> {pk*1e3:8.4f} mN  "
                  f"modulation {rows[-1]['modulation_pct']:5.2f}%  "
                  f"{rows[-1]['fraction_of_ideal']*100:4.1f}% of ideal  "
                  f"{rows[-1]['volts']:.2f} V"
                  f"{'' if rows[-1]['inside_rail'] else ' OVER'}", flush=True)
        out["by_gap"][str(gap)] = rows

    out["runtime_s"] = round(time.time() - t0, 1)
    json.dump(out, open(os.path.join(OUT, "tony-v2-matrix.json"), "w"), indent=1)
    print(f"\nwrote out/tony-v2-matrix.json ({out['runtime_s']:.0f} s)")


if __name__ == "__main__":
    main()
