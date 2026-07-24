"""PHANTM — FE solve of the FIXED design (the smallest change set that works).

Baseline geometry misses Fd by ~16-23× (see femm-variants.json + sweep). The
recovery levers, FE-quantified 2026-07-24:

    F1  working gap        77.5 µm → 20 µm      (dominant: ×8.6 on net detent)
    F2  bridge + PM section ×1.5                (lifts the PM flux ceiling)

Teeth, pitch, translator, stator slots: UNCHANGED. (A 0.35·pitch tooth variant
reached Fd at smaller Pm but was REJECTED 2026-07-24: its harmonic mix leaves
only TWO stable detents per pitch — the ⅓-pitch step structure collapses.
Deep stator slots (0.465) are an optional third change that shrinks Pm* from
~0.27 to ~0.19 mm.) Basin count is asserted — any fix set must keep 3.

This driver solves Pm* (net breakaway = Fd) and Ic* (net drive peak = 2·Fd) on
the fixed design and writes dynamics-compatible net curves.

Outputs: out/fixed-design.json, out/fixed-design-curves.npz
Run:  ~/.venvs/phantm/bin/python -m femm.fixed_design
"""

from __future__ import annotations

import json
import os
import time

import numpy as np

import geometry as geo
from params import BASELINE, G_ACCEL
from . import lua_gen
from .sweep import CASES, FeForceModel, breakaway, fourier_fit, net_force, run_case, sweep_pitch
from .variants import apply_variant

OUT = os.path.join(os.path.dirname(__file__), "..", "out")

FIXED = dict(name="fixed", gap=0.020, tooth=0.232, ss_slot_d=0.155)
BRIDGE_SCALE = 1.5


def apply_fixed():
    apply_variant(FIXED)
    lua_gen.BRIDGE_T = 0.232 * (1.162 / 1.55) * BRIDGE_SCALE
    lua_gen.BRIDGE_X0 = lua_gen.BRIDGE_X1 - lua_gen.BRIDGE_T


def main():
    t0 = time.time()
    os.makedirs(CASES, exist_ok=True)
    apply_fixed()
    p = BASELINE
    s = geo.summarise(p)
    fd = p.detent_g_factor * G_ACCEL * s.translator_mass_kg
    offsets = [o for o in geo.pole_phasing(p)[1]]
    log = lambda m: print(m, flush=True)
    log(f"fixed design: gap {FIXED['gap']*1e3:.0f} µm, tooth {FIXED['tooth']*1e3:.0f} µm, "
        f"stator slots {FIXED['ss_slot_d']*1e3:.0f} µm, bridge ×{BRIDGE_SCALE}")

    # --- Pm* ---
    cache = {}

    def bk_of(pm):
        xs, fx, wco, lam, bb = sweep_pitch(0.0, pm)
        model = FeForceModel(xs, fx)
        cache[pm] = (xs, fx, lam, bb, model)
        return breakaway(lambda x: net_force(x, None, model, offsets))

    lo, hi = 0.12, 0.60
    b_lo, b_hi = bk_of(lo), bk_of(hi)
    log(f"  Pm {lo} → {b_lo*1e3:.2f} mN;  Pm {hi} → {b_hi*1e3:.2f} mN  (target {fd*1e3:.2f})")
    assert b_lo < fd < b_hi, "target outside bracket — geometry drifted"
    for _ in range(10):
        pm = float(np.sqrt(lo * hi))
        b = bk_of(pm)
        log(f"  Pm {pm:.4f} mm → breakaway {b*1e3:.3f} mN")
        if abs(b - fd) / fd < 0.015:
            break
        lo, hi = (pm, hi) if b < fd else (lo, pm)
    pm_star = pm
    xs_d, fx_d, lam_d, bb_d, pm_model = cache[pm_star]

    # --- Ic* ---
    def peak_of(i_a):
        xs, fx, wco, lam, bb = sweep_pitch(i_a, pm_star)
        model = FeForceModel(xs, fx)
        cache[("i", i_a)] = (xs, fx, lam, model)
        xg = np.linspace(-0.232, 0.232, 241)
        return float(np.max(net_force(xg, model, pm_model, offsets))), model

    i_lo, i_hi = 0.15, 8.0
    p_lo, _ = peak_of(i_lo)
    p_hi, drv_model = peak_of(i_hi)
    log(f"  Ic {i_lo} → {p_lo*1e3:.2f} mN;  Ic {i_hi} → {p_hi*1e3:.2f} mN  (target {2*fd*1e3:.2f})")
    ic_2fd_reachable = p_hi >= 2 * fd
    if ic_2fd_reachable:
        for _ in range(10):
            ic = float(np.sqrt(i_lo * i_hi))
            pk, drv_model = peak_of(ic)
            log(f"  Ic {ic:.3f} A → peak {pk*1e3:.3f} mN")
            if abs(pk - 2 * fd) / (2 * fd) < 0.015:
                break
            i_lo, i_hi = (ic, i_hi) if pk < 2 * fd else (i_lo, ic)
        ic_star = ic
    else:
        # brief-literal 2·Fd peak saturates out of reach: solve the criterion
        # stepping actually needs — min net force along the step path ≥ 0.5·Fd
        log("  2·Fd peak NOT reachable (drive saturates) — solving stall-free Ic")
        tgt_off = offsets[1]

        def stall_of(i_a):
            xs, fx, wco, lam, bb = sweep_pitch(i_a, pm_star)
            model = FeForceModel(xs, fx)
            cache[("i", i_a)] = (xs, fx, lam, model)
            path_ = np.linspace(0.0, tgt_off * 0.85, 60)
            return float(np.min(net_force(path_, model, pm_model, offsets))), model

        s_lo, _ = stall_of(i_lo)
        s_hi, drv_model = stall_of(i_hi)
        log(f"  stall-min {i_lo} A → {s_lo*1e3:.2f} mN;  {i_hi} A → {s_hi*1e3:.2f} mN "
            f"(target {0.5*fd*1e3:.2f})")
        assert s_lo < 0.5 * fd < s_hi, "stall-free target outside bracket"
        for _ in range(10):
            ic = float(np.sqrt(i_lo * i_hi))
            sm, drv_model = stall_of(ic)
            log(f"  Ic {ic:.3f} A → stall-min {sm*1e3:.3f} mN")
            if abs(sm - 0.5 * fd) / (0.5 * fd) < 0.03:
                break
            i_lo, i_hi = (ic, i_hi) if sm < 0.5 * fd else (i_lo, ic)
        ic_star = ic
        xg_pk = np.linspace(-0.232, 0.232, 241)
        pk = float(np.max(net_force(xg_pk, drv_model, pm_model, offsets)))

    # basin-count guard: the fix must preserve the 3 detents per pitch
    xg_fine = np.linspace(-0.232, 0.232, 481)
    f_fine = net_force(xg_fine, None, pm_model, offsets)
    basins = sum(1 for k in range(len(f_fine) - 1) if f_fine[k] > 0 > f_fine[k + 1])
    log(f"  stable detents per pitch: {basins}")
    assert basins == 3, f"fix set broke the detent structure ({basins} basins)"

    # stall margin + curves on a dense grid
    xg = np.linspace(-0.232, 0.232, 41)
    f_det_net = net_force(xg, None, pm_model, offsets)
    f_drv_net = net_force(xg, drv_model, pm_model, offsets)
    tgt = offsets[1]
    path = np.linspace(0, tgt * 0.85, 60)
    stall_min = float(np.min(net_force(path, drv_model, pm_model, offsets)))

    # Lc at the drive position
    lam_pts = {di: run_case(-offsets[1], ic_star + di, pm_star)["flux_linkage"]
               for di in (-0.05, 0.05)}
    lc = abs((lam_pts[0.05] - lam_pts[-0.05]) / 0.1)

    _, a_d, b_d = fourier_fit(xs_d, fx_d)
    amp = np.hypot(a_d, b_d)
    results = {
        "fixed_design": {**FIXED, "bridge_scale": BRIDGE_SCALE},
        "fd_mn": fd * 1e3, "pm_mm": pm_star, "breakaway_mn": b * 1e3,
        "ic_a": ic_star, "ic_criterion": ("peak=2Fd" if ic_2fd_reachable else "stall_min=0.5Fd"),
        "ic_2fd_reachable": bool(ic_2fd_reachable),
        "drive_peak_mn": pk * 1e3, "stall_min_mn": stall_min * 1e3,
        "lc_uh": lc * 1e6, "b_bridge_t": float(np.max(np.abs(bb_d))),
        "harmonics_mn": (amp[:4] * 1e3).tolist(),
        "runtime_s": time.time() - t0,
    }
    with open(os.path.join(OUT, "fixed-design.json"), "w") as f:
        json.dump(results, f, indent=2)
    np.savez(os.path.join(OUT, "fixed-design-curves.npz"),
             xs_detent=xg * 1e-3, f_detent=f_det_net, f_drive=f_drv_net,
             ic_a=ic_star, pm_m=pm_star * 1e-3, fd_n=fd)
    log(f"\nFIXED design: Pm* = {pm_star*1e3:.0f} µm, Ic* = {ic_star:.3f} A, "
        f"stall min {stall_min*1e3:.2f} mN, Lc {lc*1e6:.2f} µH "
        f"({time.time()-t0:.0f} s)")
    log("wrote out/fixed-design.json + out/fixed-design-curves.npz")
    apply_variant(dict(name="restore", gap=0.0775, tooth=0.232, ss_slot_d=0.155))
    lua_gen.BRIDGE_T = 0.232 * (1.162 / 1.55)
    lua_gen.BRIDGE_X0 = lua_gen.BRIDGE_X1 - lua_gen.BRIDGE_T


if __name__ == "__main__":
    main()
