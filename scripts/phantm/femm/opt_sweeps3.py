"""PHANTM optimisation — batch 3: close Phase 2.

Stack the remaining levers on the winner (sslot 2×, N52), probe the Pm plateau
(0.6/0.7), and test the gap-30 middle point — all with BASIN COUNTS on both
registrations (the check that killed V2-gap40) + bridge |B| saturation proxy.

Run: cd scripts/phantm && python -m femm.opt_sweeps3 → out/opt/opt-sweeps-3.json
"""
from __future__ import annotations

import json
import os
import time

import numpy as np

import geometry as geo
from params import BASELINE
from . import lua_gen
from .fixed_design import FIXED
from .opt_sweeps import OUT, reset_base, translator_mass_mg
from .sweep import FeForceModel, breakaway, net_force, sweep_pitch
from .variants import apply_variant

G = 9.80665

POINTS = [
    # (tag, gap, duty, tslot, sslot_scale, br, pm)
    ("win sslot2x",            0.020, 0.40, 1.50, 2.0, 1.30, 0.40),
    ("win sslot2x N52",        0.020, 0.40, 1.50, 2.0, 1.45, 0.40),
    ("win Pm 0.60",            0.020, 0.40, 1.50, 1.0, 1.30, 0.60),
    ("win Pm 0.70",            0.020, 0.40, 1.50, 1.0, 1.30, 0.70),
    ("g30 stack N52",          0.030, 0.40, 1.50, 2.0, 1.45, 0.40),
    ("g30 stack N52 Pm 0.55",  0.030, 0.40, 1.50, 2.0, 1.45, 0.55),
]


def basins(model_net, p):
    xg = np.linspace(-p / 2, p / 2, 481)
    f = model_net(xg)
    s = np.where(f > 0, 1, -1)
    return int(np.sum((s[:-1] > 0) & (s[1:] < 0)))


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    p = lua_gen.PITCH
    rows = []
    for tag, gap, duty, ts, ss, br, pm in POINTS:
        reset_base()
        apply_variant(dict(FIXED, gap=gap, tooth=round(duty * p, 4),
                           ss_slot_d=round(0.155 * ss, 4)))
        lua_gen.SLOT_T = round(0.465 * ts, 4)
        BASELINE.materials.ndfeb_br_t = br
        m_mg = translator_mass_mg()
        offsets_drawn = [o for o in geo.pole_phasing(BASELINE)[1]]
        offsets_exact = [0.0, p / 3, 2 * p / 3]
        xs, fx, wco, lam, bb = sweep_pitch(0.0, pm)
        model = FeForceModel(xs, fx)
        nd = lambda x: net_force(x, None, model, offsets_drawn)
        ne = lambda x: net_force(x, None, model, offsets_exact)
        bk_d, bk_e = breakaway(nd), breakaway(ne)
        row = dict(name=tag, gap_um=gap * 1e3, duty=duty, tslot=ts, sslot=ss,
                   br_t=br, pm_mm=pm, mass_mg=round(m_mg, 1),
                   bk_drawn_mn=round(bk_d * 1e3, 3), bk_exact_mn=round(bk_e * 1e3, 3),
                   margin_g_drawn=round(bk_d / (G * m_mg * 1e-6), 2),
                   margin_g_exact=round(bk_e / (G * m_mg * 1e-6), 2),
                   basins_drawn=basins(nd, p), basins_exact=basins(ne, p),
                   b_bridge_t=round(float(np.max(np.abs(bb))), 2))
        rows.append(row)
        print(f"{tag:24s} bk {row['bk_drawn_mn']:7.3f}/{row['bk_exact_mn']:7.3f} mN "
              f"({row['margin_g_drawn']:5.2f}/{row['margin_g_exact']:5.2f} g) "
              f"basins {row['basins_drawn']}/{row['basins_exact']} "
              f"B_br {row['b_bridge_t']:.2f} T", flush=True)
    reset_base()
    json.dump({"rows": rows, "runtime_s": round(time.time() - t0, 1)},
              open(os.path.join(OUT, "opt-sweeps-3.json"), "w"), indent=1)
    print(f"\nwrote out/opt/opt-sweeps-3.json ({time.time()-t0:.0f} s)")


if __name__ == "__main__":
    main()
