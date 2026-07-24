"""PHANTM — Pm-sweep and Ic-sweep curves for BOTH designs (Tony's tasks 3+4
answered as asked: the requested number either exists on the curve, or the
curve shows why it cannot).

For each design (baseline as specified; fixed = gap 20 µm + bridge/PM ×1.5):
  * net 3-pole detent BREAKAWAY vs Pm  (+ PM operating point B at alignment)
  * net drive-force PEAK vs Ic at the design's reference Pm
  * baseline additionally: full net drive curve at 4 A (for the drive figure)

Writes out/pm-ic-sweeps.json (+ curves in out/pm-ic-sweeps.npz).
Run:  ~/.venvs/phantm/bin/python -m femm.pm_ic_sweeps    (~3 min)
"""

from __future__ import annotations

import json
import os
import time

import numpy as np

import geometry as geo
from params import BASELINE, G_ACCEL
from . import lua_gen
from .fixed_design import apply_fixed
from .sweep import CASES, FeForceModel, breakaway, net_force, sweep_pitch
from .variants import apply_variant

OUT = os.path.join(os.path.dirname(__file__), "..", "out")

PM_LISTS = {
    "baseline": [0.015, 0.03, 0.06, 0.10, 0.15, 0.22, 0.30, 0.45],
    "fixed": [0.12, 0.18, 0.243, 0.30, 0.40, 0.50],
}
IC_LISTS = {
    "baseline": [0.25, 0.5, 1.0, 2.0, 4.0, 8.0],
    "fixed": [0.5, 1.0, 1.8, 2.4, 3.35, 5.0],
}
PM_REF = {"baseline": 0.30, "fixed": 0.243}   # magnet used for the Ic sweeps


def apply_design(name: str):
    if name == "fixed":
        apply_fixed()
    else:
        apply_variant(dict(name="baseline", gap=0.0775, tooth=0.232, ss_slot_d=0.155))
        lua_gen.BRIDGE_T = 0.232 * (1.162 / 1.55)
        lua_gen.BRIDGE_X0 = lua_gen.BRIDGE_X1 - lua_gen.BRIDGE_T


def main():
    t0 = time.time()
    os.makedirs(CASES, exist_ok=True)
    p = BASELINE
    fd = p.detent_g_factor * G_ACCEL * geo.summarise(p).translator_mass_kg
    offsets = geo.pole_phasing(p)[1]
    br = p.materials.ndfeb_br_t
    mu = 4e-7 * np.pi * p.materials.ndfeb_mu_r
    results, extra = {}, {}
    for design in ("baseline", "fixed"):
        apply_design(design)
        pm_rows = []
        for pm in PM_LISTS[design]:
            xs, fx, wco, lam, bb = sweep_pitch(0.0, pm)
            model = FeForceModel(xs, fx)
            bk = breakaway(lambda x: net_force(x, None, model, offsets))
            b_pm = float(np.abs(bb[len(bb) // 2]))     # bridge/PM B at alignment
            pm_rows.append({"pm_mm": pm, "breakaway_mn": bk * 1e3,
                            "b_pm_t": b_pm, "h_pm_ka_m": (b_pm - br) / mu / 1e3})
            print(f"{design} Pm={pm:.3f}: breakaway {bk*1e3:.3f} mN, B_pm {b_pm:.2f} T",
                  flush=True)
        # reference-PM detent model for the Ic sweep
        xs0, fx0, *_ = sweep_pitch(0.0, PM_REF[design])
        pm_model = FeForceModel(xs0, fx0)
        ic_rows = []
        xg = np.linspace(-0.232, 0.232, 241)
        for ic in IC_LISTS[design]:
            xs, fx, *_ = sweep_pitch(ic, PM_REF[design])
            drv = FeForceModel(xs, fx)
            peak = float(np.max(net_force(xg, drv, pm_model, offsets)))
            ic_rows.append({"ic_a": ic, "peak_mn": peak * 1e3})
            print(f"{design} Ic={ic:.2f}: net drive peak {peak*1e3:.3f} mN", flush=True)
            if design == "baseline" and ic == 4.0:
                xg41 = np.linspace(-0.232, 0.232, 41)
                extra["baseline_drive_x_mm"] = xg41
                extra["baseline_drive_f_n"] = net_force(xg41, drv, pm_model, offsets)
        results[design] = {"pm_sweep": pm_rows, "ic_sweep": ic_rows,
                           "pm_ref_mm": PM_REF[design]}
    apply_design("baseline")
    results["fd_mn"] = fd * 1e3
    results["runtime_s"] = time.time() - t0
    with open(os.path.join(OUT, "pm-ic-sweeps.json"), "w") as f:
        json.dump(results, f, indent=2)
    if extra:
        np.savez(os.path.join(OUT, "pm-ic-sweeps.npz"), **extra)
    print(f"wrote out/pm-ic-sweeps.json ({time.time()-t0:.0f} s)")


if __name__ == "__main__":
    main()
