"""PHANTM Phase 3 — extract the OPTIMISED SET's force curves for dynamics.

Winner (phase gate 2): duty 0.40 × tslot 1.5× × sslot 2× × N52 × gap 20 µm ×
Pm 0.5. Saves the net detent curve (both registrations), the 1.8 A driven
curve, and the detent stiffness at the working basin → out/opt/winner-curves.json.

Run: cd scripts/phantm && python -m femm.opt_dynamics_curves
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
from .sweep import FeForceModel, net_force, sweep_pitch
from .variants import apply_variant

import os as _os
PM = float(_os.environ.get("PHANTM_PM", "0.50"))
BR = float(_os.environ.get("PHANTM_BR", "1.45"))
OUTNAME = _os.environ.get("PHANTM_CURVES_OUT", "winner-curves.json")


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    reset_base()
    p = lua_gen.PITCH
    apply_variant(dict(FIXED, gap=0.020, tooth=round(0.40 * p, 4),
                       ss_slot_d=round(0.155 * 2.0, 4)))
    lua_gen.SLOT_T = round(0.465 * 1.5, 4)
    BASELINE.materials.ndfeb_br_t = BR
    m_mg = translator_mass_mg()
    offsets_drawn = [o for o in geo.pole_phasing(BASELINE)[1]]
    offsets_exact = [0.0, p / 3, 2 * p / 3]

    xs, fx, wco, lam, bb = sweep_pitch(0.0, PM)
    pm_model = FeForceModel(xs, fx)
    drv_raw = {}
    for i_a in (1.8, 3.35, 5.0, 7.0, -3.35, -5.0):
        xs_d, fx_d, _, _, _ = sweep_pitch(i_a, PM)
        drv_raw[i_a] = (list(map(float, xs_d)), list(map(float, fx_d)))
        drv_models = None

    xg = np.linspace(-p / 2, p / 2, 961)
    net_drawn = net_force(xg, None, pm_model, offsets_drawn)
    net_exact = net_force(xg, None, pm_model, offsets_exact)
    pm_raw = (list(map(float, xs)), list(map(float, fx)))

    # stiffness at the central basin (stable zero crossing nearest x=0)
    s = np.sign(net_drawn)
    zc = np.where((s[:-1] > 0) & (s[1:] < 0))[0]
    i0 = zc[np.argmin(np.abs(xg[zc]))]
    k = -(net_drawn[i0 + 4] - net_drawn[i0 - 4]) / ((xg[i0 + 4] - xg[i0 - 4]) * 1e-3)  # N/m
    out = dict(config=f"d40-t150-ss200-Br{BR}-g20-Pm{PM}", pm_mm=PM, mass_mg=round(m_mg, 1),
               pitch_mm=p, k_det_n_per_m=round(float(k), 1),
               x_mm=xg.tolist(),
               net_drawn_n=np.asarray(net_drawn, float).tolist(),
               net_exact_n=np.asarray(net_exact, float).tolist(),
               offsets_drawn=[float(o) for o in offsets_drawn],
               pm_pole=pm_raw,
               drv_pole_by_current={str(k): v for k, v in drv_raw.items()})
    json.dump(out, open(os.path.join(OUT, OUTNAME), "w"))
    reset_base()
    print(f"k_det = {k:.0f} N/m, mass {m_mg:.0f} mg; wrote {OUTNAME} "
          f"({time.time()-t0:.0f} s)")


if __name__ == "__main__":
    main()
