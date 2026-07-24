"""PHANTM — FE recovery-lever study (§6 make-or-break quantification).

The baseline FE verdict: at g/t = 77.5/232 ≈ 1/3, fringing keeps the unaligned
permeance high, gap-flux modulation is ~8%, and the net 3-phase detent tops out
~0.5 mN vs the 7.7 mN spec (~16× short); drive similarly. This study sweeps the
§6 recovery levers on the SAME FE pipeline: air gap, stator slot depth, tooth
width fraction, and a combined variant — reporting per-pole force harmonics and
the net-3-pole breakaway at fixed Pm, plus a driven point.

Geometry variants are applied by consistently rewriting femm.lua_gen's module
constants (documented hack — the generator reads them at call time).

Run:  ~/.venvs/phantm/bin/python -m femm.variants
"""

from __future__ import annotations

import json
import os
import time

import numpy as np

import geometry as geo
from params import BASELINE
from . import lua_gen
from .sweep import CASES, FeForceModel, breakaway, fourier_fit, net_force, run_case, sweep_pitch

OUT = os.path.join(os.path.dirname(__file__), "..", "out")

BASE = dict(gap=0.0775, tooth=0.232, ss_slot_d=0.155)

VARIANTS = [
    dict(name="baseline", **BASE),
    dict(name="gap40", **{**BASE, "gap": 0.040}),
    dict(name="gap20", **{**BASE, "gap": 0.020}),
    dict(name="deep_stator_slots", **{**BASE, "ss_slot_d": 0.465}),
    dict(name="tooth_0p35", **{**BASE, "tooth": 0.162}),
    dict(name="combo_g40_deep_t0p35",
         **{**BASE, "gap": 0.040, "ss_slot_d": 0.465, "tooth": 0.162}),
    dict(name="combo_g20_deep_t0p35",
         **{**BASE, "gap": 0.020, "ss_slot_d": 0.465, "tooth": 0.162}),
]

PM_STUDY_MM = 0.10   # fixed magnet for cross-variant comparison
I_STUDY_A = 1.24     # one driven point (network-model Ic scale)


def apply_variant(v: dict):
    g = lua_gen
    g.GAP = v["gap"]
    g.TOOTH = v["tooth"]
    g.SS_SLOT_D = v["ss_slot_d"]
    g.SS_TIP_Y = g.HT + g.GAP
    g.SS_BACK_Y0 = g.SS_TIP_Y + g.SS_SLOT_D
    g.SS_BACK_Y1 = g.SS_BACK_Y0 + g.SS_BACK_DRAWN


def main():
    t0 = time.time()
    os.makedirs(CASES, exist_ok=True)
    offsets = [o for o in geo.pole_phasing(BASELINE)[1]]
    rows = []
    for v in VARIANTS:
        apply_variant(v)
        xs, fx, wco, lam, bb = sweep_pitch(0.0, PM_STUDY_MM)
        model = FeForceModel(xs, fx)
        net = lambda x: net_force(x, None, model, offsets)
        bk = breakaway(net)
        _, a, b = fourier_fit(xs, fx)
        amp = np.hypot(a, b)
        r_drv = run_case(-0.116, I_STUDY_A, PM_STUDY_MM)
        drv_quarter = r_drv["fx"] - model(-0.116)  # coil contribution at quarter
        lam_mod = (np.max(np.abs(lam)) - np.min(np.abs(lam))) / np.max(np.abs(lam))
        row = dict(name=v["name"], gap_um=v["gap"] * 1e3, tooth_um=v["tooth"] * 1e3,
                   ss_slot_um=v["ss_slot_d"] * 1e3,
                   h1_mn=amp[0] * 1e3, h3_mn=amp[2] * 1e3,
                   net_breakaway_mn=bk * 1e3,
                   flux_modulation=lam_mod,
                   fx_driven_quarter_mn=r_drv["fx"] * 1e3,
                   b_bridge_t=float(np.max(np.abs(bb))))
        rows.append(row)
        print(f"{v['name']:24s} h1={row['h1_mn']:7.3f} mN  h3={row['h3_mn']:6.3f}  "
              f"net_bk={row['net_breakaway_mn']:7.3f} mN  fluxmod={lam_mod:5.1%}  "
              f"F_drv(¼)={row['fx_driven_quarter_mn']:7.3f} mN  B_br={row['b_bridge_t']:.2f} T",
              flush=True)
    apply_variant(VARIANTS[0])  # restore baseline constants
    with open(os.path.join(OUT, "femm-variants.json"), "w") as f:
        json.dump({"pm_study_mm": PM_STUDY_MM, "i_study_a": I_STUDY_A,
                   "variants": rows, "runtime_s": time.time() - t0}, f, indent=2)
    print(f"\nwrote out/femm-variants.json ({time.time()-t0:.0f} s)")


if __name__ == "__main__":
    main()
