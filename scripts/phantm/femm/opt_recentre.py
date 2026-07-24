"""PHANTM optimisation — Phase 2 re-centre of the batch-2 winners.

For each winner (d.40 t1.50, d.45 t1.50 at gap 20; V2 g40 d.40 t1.50 N52):
Pm sweep → detent curve + BASIN COUNT per point (the 3-detent requirement),
pick the plateau knee; then a 3-point Ic sweep at the chosen Pm for the drive
picture. Registration pair reported throughout.

Run: cd scripts/phantm && python -m femm.opt_recentre → out/opt/opt-recentre.json
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
from .opt_sweeps import OUT, reset_base
from .sweep import FeForceModel, breakaway, net_force, run_case, sweep_pitch
from .variants import apply_variant

G = 9.80665

WINNERS = [
    ("d40-t150-g20", 0.020, 0.40, 1.50, 1.30),
    ("d45-t150-g20", 0.020, 0.45, 1.50, 1.30),
    ("V2-d40-t150-g40-N52", 0.040, 0.40, 1.50, 1.45),
]
PM_GRID = [0.15, 0.20, 0.243, 0.30, 0.40, 0.50]
IC_GRID = [1.0, 1.8, 3.0]


def apply_winner(gap, duty, ts, br):
    reset_base()
    tooth = round(duty * lua_gen.PITCH, 4)
    apply_variant(dict(FIXED, gap=gap, tooth=tooth))
    lua_gen.SLOT_T = round(0.465 * ts, 4)
    BASELINE.materials.ndfeb_br_t = br


def basins(model_net, p):
    xg = np.linspace(-p / 2, p / 2, 481)
    f = model_net(xg)
    # count stable zero-crossings (force + -> -)
    s = np.sign(f)
    idx = np.where((s[:-1] > 0) & (s[1:] < 0))[0]
    return int(len(idx))


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    p = lua_gen.PITCH
    out = {}
    for name, gap, duty, ts, br in WINNERS:
        apply_winner(gap, duty, ts, br)
        slot_w = lua_gen.PITCH - lua_gen.TOOTH
        m_mg = (1.549 * 1.55 * 12.5 - 2 * 26 * lua_gen.SLOT_T * slot_w * 1.55) * 7.4
        offsets_drawn = [o for o in geo.pole_phasing(BASELINE)[1]]
        offsets_exact = [0.0, p / 3, 2 * p / 3]
        pm_rows = []
        best = None
        for pm in PM_GRID:
            xs, fx, wco, lam, bb = sweep_pitch(0.0, pm)
            model = FeForceModel(xs, fx)
            nd = lambda x: net_force(x, None, model, offsets_drawn)
            ne = lambda x: net_force(x, None, model, offsets_exact)
            bk_d, bk_e = breakaway(nd), breakaway(ne)
            nb_d, nb_e = basins(nd, p), basins(ne, p)
            row = dict(pm_mm=pm, bk_drawn_mn=round(bk_d * 1e3, 3),
                       bk_exact_mn=round(bk_e * 1e3, 3),
                       basins_drawn=nb_d, basins_exact=nb_e,
                       margin_g_drawn=round(bk_d / (G * m_mg * 1e-6), 2),
                       margin_g_exact=round(bk_e / (G * m_mg * 1e-6), 2))
            pm_rows.append(row)
            print(f"{name:22s} Pm {pm:.3f}: bk {row['bk_drawn_mn']:7.3f}/{row['bk_exact_mn']:7.3f} mN "
                  f"({row['margin_g_drawn']:5.2f}/{row['margin_g_exact']:5.2f} g) "
                  f"basins {nb_d}/{nb_e}", flush=True)
            ok = nb_d == 3 and nb_e == 3
            if ok and (best is None or bk_d > best[1]):
                best = (pm, bk_d, model)
        pm_star = best[0] if best else PM_GRID[2]
        ic_rows = []
        for ic in IC_GRID:
            r = run_case(-0.116, ic, pm_star)
            ic_rows.append(dict(ic_a=ic, fx_quarter_mn=round(r["fx"] * 1e3, 3)))
        out[name] = dict(mass_mg=round(m_mg, 1), pm_star_mm=pm_star,
                         pm_rows=pm_rows, ic_rows=ic_rows,
                         gap_mm=gap, duty=duty, tslot_scale=ts, br_t=br)
        print(f"{name}: Pm* (max detent, 3 basins both regs) = {pm_star} mm", flush=True)
    reset_base()
    json.dump({"winners": out, "runtime_s": round(time.time() - t0, 1)},
              open(os.path.join(OUT, "opt-recentre.json"), "w"), indent=1)
    print(f"\nwrote out/opt/opt-recentre.json ({time.time()-t0:.0f} s)")


if __name__ == "__main__":
    main()
