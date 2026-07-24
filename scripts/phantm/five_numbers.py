"""PHANTM actuator — compute Tony's five numbers (analytic v1, Increment B).

Methods (stated per §4 so Tony can reconcile):
  1. Mt  — solid bar − slot volume × SMC density (geometry.py, density stated).
  2. Wm  — (slot-face separation − translator width)/2 from §2 geometry.
  3. Pm  — NdFeB length in the bridge path solved so the NET 3-pole zero-current
           breakaway force (peak of the detent curve) = Fd = 5·g·Mt.
           Nonlinear reluctance network, co-energy force (reluctance_model.py).
  4. Ic  — current in ONE coil (Nc=20, Dc=50 µm) solved so the peak NET axial
           force over one pitch (all PMs active) = 2·Fd. Also reports the
           minimum force along the 1-step path (stall margin) — honest scoring.
  5. Lc, Rc, tr — dλ/di at the operating point; wire length/gauge; nonlinear
           dλ/dt = V − iR integration onto 1 V.

FE validation of items 3+4 happens in Increment C — these are the network-model
numbers, fringing/leakage constants at their analytic defaults (FringeConfig).

Run:  ~/.venvs/phantm/bin/python scripts/phantm/five_numbers.py
Writes out/five-numbers.json + out/curves.npz (no plotting here; report stage plots).
"""

from __future__ import annotations

import json
import os
import time

import numpy as np

import geometry as geo
from params import BASELINE, G_ACCEL, MM
from reluctance_model import Actuator, PoleCircuit

OUT = os.path.join(os.path.dirname(__file__), "out")


def main():
    t_start = time.time()
    p = BASELINE
    os.makedirs(OUT, exist_ok=True)
    s = geo.summarise(p)

    # 1+2 — geometry deliverables
    mt_kg = s.translator_mass_kg
    fd_n = p.detent_g_factor * G_ACCEL * mt_kg
    wm_mm = s.magnetic_gap_mm
    print(f"1. Mt = {mt_kg*1e3:.4f} g   (SMC density {p.materials.smc_density_kg_m3/1000:.1f} g/cm³, "
          f"{s.n_slots_per_face} slots/face)")
    print(f"2. Wm = {wm_mm*1000:.1f} µm  ((1.704 − 1.549)/2)")
    print(f"   Fd target = 5·g·Mt = {fd_n*1e3:.3f} mN;  drive target 2·Fd = {2*fd_n*1e3:.3f} mN")

    # 3 — Pm for detent
    act = Actuator(p)
    print("3. solving Pm for net breakaway = Fd ...", flush=True)
    pm_m = act.solve_pm_for_detent(fd_n)
    xs_d, f_d = act.detent_curve(n=41)
    breakaway = float(np.max(np.abs(f_d)))
    op = act.poles[0].solve(0.0)
    b_pm = op.phi_source_wb / act.poles[0].A_bridge
    h_pm = (b_pm - act.poles[0].magnet.br_at(20.0)) / (4e-7 * np.pi * p.materials.ndfeb_mu_r)
    print(f"   Pm = {pm_m*1e3:.4f} mm   (breakaway {breakaway*1e3:.3f} mN; "
          f"PM operating point B={b_pm:.3f} T, H={h_pm/1e3:.1f} kA/m on the load line)")

    # 4 — Ic for drive (brief criterion: peak = 2·Fd; honest criterion: no stall)
    print("4. solving Ic for peak net drive = 2·Fd ...", flush=True)
    ic_a = act.solve_ic_for_drive(2 * fd_n)
    xs_v, f_v = act.drive_curve(ic_a, n=41)
    peak = float(np.max(f_v))
    step_target = act.offsets[1]
    path = (xs_v >= 0) & (xs_v <= step_target)
    stall_min = float(np.min(f_v[path])) if path.any() else float("nan")
    print(f"   Ic = {ic_a:.3f} A   (peak net {peak*1e3:.3f} mN; min along step path "
          f"{stall_min*1e3:.3f} mN; MMF = {p.coil.n_turns*ic_a:.1f} A-turns)")
    print("   solving Ic_step for min-along-path ≥ 0.5·Fd (stall-free criterion) ...", flush=True)
    ic_step = act.solve_ic_for_step(0.5 * fd_n)
    print(f"   Ic_step = {ic_step:.3f} A")

    # 5 — coil electricals
    pole: PoleCircuit = act.poles[1]
    rc = pole.coil_resistance()
    lc_aligned = pole.inductance(act.offsets[1] - act.offsets[1], ic_a)  # tooth-aligned
    lc_offset = pole.inductance(-act.offsets[1], ic_a)                   # at pole-0-aligned position
    ts, cur = pole.current_rise(-act.offsets[1], p.coil.supply_voltage_v)
    i_inf = p.coil.supply_voltage_v / rc
    tr_63 = float(np.interp(0.632 * i_inf, cur, ts))
    reaches_ic = bool(cur[-1] >= ic_a)
    tr_ic = float(np.interp(ic_a, cur, ts)) if reaches_ic else None
    print(f"5. Rc = {rc:.3f} Ω;  Lc = {lc_offset*1e6:.2f} µH (drive position) / "
          f"{lc_aligned*1e6:.2f} µH (aligned);  I_inf(1 V) = {i_inf:.2f} A")
    print(f"   tr(63% of V/R) = {tr_63*1e6:.1f} µs;  "
          f"reaches Ic on 1 V: {reaches_ic}" + (f" at {tr_ic*1e6:.1f} µs" if tr_ic else
          f"  (Ic={ic_a:.2f} A > I_inf — 1 V supply CANNOT reach Ic)"))

    results = {
        "mt_kg": mt_kg, "wm_mm": wm_mm, "fd_n": fd_n,
        "pm_mm": pm_m * 1e3, "pm_operating_b_t": float(b_pm), "pm_operating_h_ka_m": float(h_pm / 1e3),
        "breakaway_mn": breakaway * 1e3,
        "ic_a": ic_a, "ic_step_a": ic_step,
        "drive_peak_mn": peak * 1e3, "drive_stall_min_mn": stall_min * 1e3,
        "mmf_at": p.coil.n_turns * ic_a,
        "rc_ohm": rc, "lc_uh_drive_pos": lc_offset * 1e6, "lc_uh_aligned": lc_aligned * 1e6,
        "i_inf_1v_a": i_inf, "tr63_us": tr_63 * 1e6,
        "reaches_ic_on_1v": reaches_ic, "tr_ic_us": (tr_ic * 1e6 if tr_ic else None),
        "model": "nonlinear reluctance network v1 (pre-FE); FringeConfig defaults",
        "runtime_s": time.time() - t_start,
    }
    with open(os.path.join(OUT, "five-numbers.json"), "w") as f:
        json.dump(results, f, indent=2)
    np.savez(os.path.join(OUT, "curves.npz"),
             xs_detent=xs_d, f_detent=f_d, xs_drive=xs_v, f_drive=f_v,
             t_rise=ts, i_rise=cur, pm_m=pm_m, ic_a=ic_a, fd_n=fd_n)
    print(f"\nwrote out/five-numbers.json + out/curves.npz  ({results['runtime_s']:.0f} s)")


if __name__ == "__main__":
    main()
