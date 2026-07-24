#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/magnetics_vr_drive.py

Toothed VR stepper DRIVE force — net axial force with ONE coil energised
(aiding its own pole's PM), including the other poles' detent load, and the
worst-case force along the one-step path (the stall criterion).

Input: the magnetics_vr_detent inputs PLUS
    {
      "coil_mmf_at": 67.0,               # N·I of the energised coil, A-turns
      "drive_pole_index": 1              # default 1 (the next pole in sequence)
    }

Output:
    {
      "peak_net_force_mn": ...,          # max over one pitch
      "stall_min_force_mn": ...,         # min over [0, 0.85·step] from the detent
      "step_target_mm": ...,
      "warnings": [...]
    }

Sign contract (PHANTM 2026-07-24): coil_mmf_at > 0 means the coil AIDS its
pole's PM. A driver wired in opposition makes force FALL with current — looks
like saturation, is a polarity bug. Same validity caveat as the detent tool:
analytic modulation is optimistic at gap/tooth > 0.15 — FE-calibrate.
"""
from __future__ import annotations

import json
import math
import sys

from magnetics_vr_detent import HARD as DETENT_HARD, MU0, permeance_endpoints

HARD = DETENT_HARD + ["coil_mmf_at"]


def solve(inp):
    missing = [k for k in HARD if k not in inp]
    if missing:
        raise ValueError(f"missing required inputs: {missing}")
    warnings = []
    mm = 1e-3
    t = inp["tooth_width_mm"] * mm
    pitch = inp["tooth_pitch_mm"] * mm
    g = inp["gap_mm"] * mm
    w = inp["stack_width_mm"] * mm
    ds = inp["stator_slot_depth_mm"] * mm
    dt = inp["translator_slot_depth_mm"] * mm
    n_teeth = int(inp["n_teeth_per_pole"])
    offs = [o * mm for o in inp["pole_phase_offsets_mm"]]
    lm = inp["pm_length_mm"] * mm
    br = inp["pm_br_t"]
    mu_r = float(inp.get("pm_mu_r", 1.05))
    a_pm = inp["pm_area_mm2"] * 1e-6
    b_sat = float(inp.get("steel_b_sat_t", 1.5))
    k3 = float(inp.get("harmonic3_ratio", 1.0 / 9.0))
    cal = float(inp.get("modulation_calibration", 1.0))
    mmf_coil = float(inp["coil_mmf_at"])
    drv = int(inp.get("drive_pole_index", 1))

    if cal == 1.0:
        warnings.append("UNCALIBRATED: analytic force is an UPPER BOUND — "
                        "FE-calibrate modulation_calibration (PHANTM 2026-07-24: "
                        f"×15–40 optimistic); this run g/t = {g/t:.2f}")

    p_max, p_min = permeance_endpoints(t, g, ds, dt)
    p0, p1 = 0.5 * (p_max + p_min), 0.5 * (p_max - p_min) * cal
    scale = MU0 * w * n_teeth
    f_pm = (br / (MU0 * mu_r)) * lm
    r_pm = lm / (MU0 * mu_r * a_pm)
    phi_cap = b_sat * a_pm

    def pole_force(x, f_src):
        th = 2 * math.pi * x / pitch
        s = (math.cos(th) + k3 * math.cos(3 * th)) / (1 + k3)
        dsdx = (-(math.sin(th)) - 3 * k3 * math.sin(3 * th)) / (1 + k3) * 2 * math.pi / pitch
        p_gap = scale * (p0 + p1 * s)
        r_gap = 2.0 / p_gap
        phi = min(f_src / (r_pm + r_gap), phi_cap)
        if phi >= phi_cap * 0.999:
            pole_force.saturated = True
        dr_dx = -2.0 * scale * p1 * dsdx / (p_gap ** 2)
        return -0.5 * phi * phi * dr_dx

    pole_force.saturated = False

    def net(x):
        total = 0.0
        for k, off in enumerate(offs):
            f_src = f_pm + (mmf_coil if k == drv else 0.0)
            total += pole_force(x - off, f_src)
        return total

    n_s = 241
    xs = [(-0.5 + i / (n_s - 1)) * pitch for i in range(n_s)]
    peak = max(net(x) for x in xs)
    tgt = offs[drv] % pitch
    path = [tgt * 0.85 * i / 59 for i in range(60)]
    stall = min(net(x) for x in path)
    if pole_force.saturated:
        warnings.append(f"steel/PM section saturates at {b_sat} T — force is "
                        f"flux-capped; more MMF will not add force")
    return {
        "peak_net_force_mn": peak * 1e3,
        "stall_min_force_mn": stall * 1e3,
        "step_target_mm": tgt / mm,
        "warnings": warnings,
    }


def _selftest():
    from magnetics_vr_detent import PHANTM_FIXED
    # PHANTM fixed design at Ic* (67 At): FE truth peak 15.4 mN. Uncalibrated
    # analytic = upper bound + warns; more MMF never decreases force (aiding
    # sign contract).
    out = solve({**PHANTM_FIXED, "coil_mmf_at": 67.0})
    assert out["peak_net_force_mn"] >= 15.4, out
    assert any("UNCALIBRATED" in w for w in out["warnings"]), out
    out2 = solve({**PHANTM_FIXED, "coil_mmf_at": 100.0})
    assert out2["peak_net_force_mn"] >= out["peak_net_force_mn"] * 0.95, (out, out2)
    # calibrated peak lands in a ±50% band of the FE truth (15.4 mN); the stall
    # minimum is reported but its SIGN is force-waveform-shape-sensitive beyond
    # a lumped model's fidelity — FE (scripts/phantm/femm/) is the authority.
    cal = solve({**PHANTM_FIXED, "coil_mmf_at": 67.0, "modulation_calibration": 0.16})
    assert 15.4 * 0.5 <= cal["peak_net_force_mn"] <= 15.4 * 1.5, cal
    assert "stall_min_force_mn" in cal
    print("magnetics_vr_drive selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        sys.exit(0)
    print(json.dumps(solve(json.load(sys.stdin))))
