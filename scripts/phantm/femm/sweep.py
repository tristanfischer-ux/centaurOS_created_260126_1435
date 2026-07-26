"""PHANTM — FEMM sweep driver: FE-truth detent Pm and drive Ic (Increment C).

Single-pole FE curves (femmcli, ~1 s/case), assembled into the 3-pole net by
superposition at the pole phase offsets (cross-pole coupling not modelled —
council BLOCK #1; bounded later if needed). Per-pitch force curves are Fourier-
fitted (harmonics 1..6): the DC term is dropped (a physical tooth force has no
DC over a period — the fitted DC is exactly the unrolled-bridge end bias), and
the harmonic amplitudes double as the calibration targets for the network model.

Outputs: out/femm-five-numbers.json, out/femm-curves.npz.
Run:  ~/.venvs/phantm/bin/python -m femm.sweep    (from scripts/phantm)
"""

from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

import geometry as geo
from params import BASELINE, G_ACCEL
from .lua_gen import PITCH, actuator_lua
from .runner import run_lua

OUT = os.path.join(os.path.dirname(__file__), "..", "out")
CASES = os.path.join(OUT, "femm-cases")
N_X = 16                      # samples per pitch (uniform, no endpoint dup)
N_HARM = 6
_counter = [0]


def run_case(x_mm: float, i_a: float, pm_mm: float, probe_pts=None,
             harmonic=None) -> dict:
    _counter[0] += 1
    tag = f"case_{_counter[0]:05d}"
    path = os.path.join(CASES, f"{tag}.lua")
    with open(path, "w") as f:
        f.write(actuator_lua(x_mm, i_a, pm_mm, f"{tag}.fem",
                             probe_pts=probe_pts, harmonic=harmonic))
    res = run_lua(path)
    for ext in (".lua", ".fem", ".ans"):
        p = os.path.join(CASES, f"{tag}{ext}")
        if os.path.exists(p):
            os.remove(p)
    return res


def sweep_pitch(i_a: float, pm_mm: float, workers: int = 6):
    """FE force + coenergy at N_X uniform positions over one pitch."""
    xs = (np.arange(N_X) / N_X - 0.5) * PITCH
    with ThreadPoolExecutor(max_workers=workers) as ex:
        results = list(ex.map(lambda x: run_case(x, i_a, pm_mm), xs))
    fx = np.array([r["fx"] for r in results])
    wco = np.array([r["coenergy"] for r in results])
    lam = np.array([r["flux_linkage"] for r in results])
    b_bridge = np.array([r["bridge_by_int"] / r["bridge_vol"] for r in results])
    return xs, fx, wco, lam, b_bridge


def fourier_fit(xs, ys, n_harm: int = N_HARM):
    """Fit ys(x) periodic over PITCH; return (a[k], b[k]) k=1..n_harm, DC."""
    n = len(xs)
    coeff = np.fft.rfft(ys) / n
    dc = coeff[0].real
    a = 2 * coeff[1:n_harm + 1].real
    b = -2 * coeff[1:n_harm + 1].imag
    return dc, a, b


def eval_fourier(x, a, b, x0_offset):
    """Evaluate the zero-DC Fourier series at x (phase-referenced to the FFT grid
    start −PITCH/2)."""
    th = 2 * np.pi * (np.asarray(x) - x0_offset) / PITCH
    out = np.zeros_like(th, dtype=float)
    for k in range(len(a)):
        out += a[k] * np.cos((k + 1) * th) + b[k] * np.sin((k + 1) * th)
    return out


class FeForceModel:
    """Zero-DC periodic force curve from one FE sweep, evaluable anywhere."""

    def __init__(self, xs, fx):
        self.x0 = xs[0]
        self.dc, self.a, self.b = fourier_fit(xs, fx)

    def __call__(self, x):
        return eval_fourier(x, self.a, self.b, self.x0)


def net_force(x, drv_model: FeForceModel | None, pm_model: FeForceModel, offsets):
    """3-pole net force at translator position x; pole 1 optionally driven."""
    total = np.zeros_like(np.asarray(x, dtype=float))
    for k, off in enumerate(offsets):
        model = drv_model if (drv_model is not None and k == 1) else pm_model
        total += model(np.asarray(x) - off)
    return total


def breakaway(model_net) -> float:
    xg = np.linspace(-PITCH / 2, PITCH / 2, 241)
    return float(np.max(np.abs(model_net(xg))))


def main():
    t0 = time.time()
    os.makedirs(CASES, exist_ok=True)
    p = BASELINE
    s = geo.summarise(p)
    fd = p.detent_g_factor * G_ACCEL * s.translator_mass_kg
    offsets = [o for o in geo.pole_phasing(p)[1]]  # mm
    log = lambda m: print(m, flush=True)

    # --- 1. Pm solve on FE detent curves (secant on log-breakaway) ---
    log(f"target Fd = {fd*1e3:.3f} mN; FE Pm solve ...")
    pm_grid = {}

    def fe_breakaway(pm_mm):
        xs, fx, wco, lam, bb = sweep_pitch(0.0, pm_mm)
        pm_model = FeForceModel(xs, fx)
        pm_grid[pm_mm] = (xs, fx, wco, lam, bb, pm_model)
        net = lambda x: net_force(x, None, pm_model, offsets)
        return breakaway(net)

    lo, hi = 0.015, 0.30
    f_lo, f_hi = fe_breakaway(lo), fe_breakaway(hi)
    log(f"  Pm {lo:.3f} mm -> {f_lo*1e3:.3f} mN;  Pm {hi:.3f} mm -> {f_hi*1e3:.3f} mN")
    if not (f_lo <= fd <= f_hi):
        log("  WARNING: target outside initial bracket — expanding")
    for _ in range(12):
        mid = float(np.sqrt(lo * hi))
        f_mid = fe_breakaway(mid)
        log(f"  Pm {mid:.4f} mm -> breakaway {f_mid*1e3:.3f} mN")
        if abs(f_mid - fd) / fd < 0.02:
            break
        if f_mid < fd:
            lo = mid
        else:
            hi = mid
    pm_star = mid
    xs_d, fx_d, wco_d, lam_d, bb_d, pm_model = pm_grid[pm_star]

    # --- 2. coenergy cross-check on the detent sweep ---
    # central difference of W' on the uniform grid vs WST force (interior pts)
    dx = (xs_d[1] - xs_d[0]) * 1e-3                      # m
    f_coen = (np.roll(wco_d, -1) - np.roll(wco_d, 1)) / (2 * dx)  # periodic
    f_wst_fit = pm_model(xs_d)
    mask = np.abs(f_wst_fit) > 0.3 * np.abs(f_wst_fit).max()
    rel = np.abs(f_coen[mask] - f_wst_fit[mask]) / np.abs(f_wst_fit[mask])
    coen_agree = float(np.median(rel))
    log(f"  coenergy vs WST median agreement: {coen_agree:.1%}")

    # --- 3. Ic solve on FE drive curves ---
    log("FE Ic solve (peak net = 2·Fd) ...")

    drv_cache = {}

    def drive_peak(i_a):
        xs, fx, wco, lam, bb = sweep_pitch(i_a, pm_star)
        drv_model = FeForceModel(xs, fx)
        drv_cache[i_a] = (xs, fx, lam, bb, drv_model)
        xg = np.linspace(-PITCH / 2, PITCH / 2, 241)
        return float(np.max(net_force(xg, drv_model, pm_model, offsets))), drv_model

    i_lo, i_hi = 0.2, 4.0
    pk_lo, _ = drive_peak(i_lo)
    pk_hi, _ = drive_peak(i_hi)
    log(f"  Ic {i_lo} A -> {pk_lo*1e3:.2f} mN;  Ic {i_hi} A -> {pk_hi*1e3:.2f} mN")
    for _ in range(10):
        i_mid = float(np.sqrt(i_lo * i_hi))
        pk, drv_model = drive_peak(i_mid)
        log(f"  Ic {i_mid:.3f} A -> peak {pk*1e3:.3f} mN")
        if abs(pk - 2 * fd) / (2 * fd) < 0.02:
            break
        if pk < 2 * fd:
            i_lo = i_mid
        else:
            i_hi = i_mid
    ic_star = i_mid

    # stall margin along the step path at ic_star
    tgt = offsets[1]
    xg = np.linspace(0.0, tgt * 0.85, 60)
    stall_min = float(np.min(net_force(xg, drv_model, pm_model, offsets)))
    log(f"  stall min over [0, 0.85·step] at Ic: {stall_min*1e3:.3f} mN")

    # --- 4. Lc from FE flux linkage at the drive position ---
    x_drv = -offsets[1]
    lam_pts = {}
    for di in (-0.05, 0.05):
        r = run_case(x_drv, ic_star + di, pm_star)
        lam_pts[di] = r["flux_linkage"]
    lc = abs((lam_pts[0.05] - lam_pts[-0.05]) / 0.1)
    log(f"  Lc(FE, at drive point) = {lc*1e6:.2f} µH")

    # --- 5. harmonic decomposition (network-model calibration targets) ---
    _, a_d, b_d = fourier_fit(xs_d, fx_d)
    amp = np.hypot(a_d, b_d)
    log(f"  detent force harmonics (mN): " +
        ", ".join(f"h{k+1}={amp[k]*1e3:.3f}" for k in range(4)))

    results = {
        "fd_mn": fd * 1e3,
        "pm_mm_fe": pm_star,
        "breakaway_mn_fe": f_mid * 1e3,
        "ic_a_fe": ic_star,
        "drive_peak_mn_fe": pk * 1e3,
        "stall_min_mn_fe": stall_min * 1e3,
        "lc_uh_fe": lc * 1e6,
        "coenergy_wst_median_agreement": coen_agree,
        "b_bridge_t_at_detent": float(np.max(np.abs(bb_d))),
        "force_harmonics_mn": (amp * 1e3).tolist(),
        "harmonic3_over_1": float(amp[2] / amp[0]) if amp[0] else None,
        "n_fe_cases": _counter[0],
        "runtime_s": time.time() - t0,
    }
    with open(os.path.join(OUT, "femm-five-numbers.json"), "w") as f:
        json.dump(results, f, indent=2)
    np.savez(os.path.join(OUT, "femm-curves.npz"),
             xs=xs_d, fx_detent=fx_d, coenergy=wco_d, lam=lam_d, b_bridge=bb_d,
             fx_drive=drv_cache[ic_star][1] if ic_star in drv_cache else fx_d,
             pm_mm=pm_star, ic_a=ic_star,
             a_harm=a_d, b_harm=b_d)
    log(f"\nFE five-numbers: Pm={pm_star*1e3:.1f} µm, Ic={ic_star:.3f} A "
        f"({_counter[0]} FE cases, {time.time()-t0:.0f} s)")
    log("wrote out/femm-five-numbers.json + out/femm-curves.npz")


if __name__ == "__main__":
    main()
