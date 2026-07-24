#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/magnetics_vr_detent.py

Toothed variable-reluctance PM detent force — net zero-power holding force of
an N-pole linear (or rotary-unrolled) VR stepper with a permanent magnet in
series with each pole's magnetic path.

Input (all REQUIRED unless a default is shown — missing hard inputs FAIL loudly):
    {
      "tooth_pitch_mm": 0.464,
      "tooth_width_mm": 0.232,
      "gap_mm": 0.0775,                  # single-side working gap
      "n_teeth_per_pole": 3,
      "stack_width_mm": 1.55,            # transverse flux width
      "stator_slot_depth_mm": 0.155,
      "translator_slot_depth_mm": 0.465,
      "n_poles": 3,
      "pole_phase_offsets_mm": [0.0, 0.142, 0.284],   # tooth-phase offset per pole
      "pm_length_mm": 0.243,
      "pm_br_t": 1.30,
      "pm_mu_r": 1.05,                   # default 1.05
      "pm_area_mm2": 0.405,              # PM (and narrowest steel) cross-section
      "steel_b_sat_t": 1.5,              # default 1.5 (SMC)
      "harmonic3_ratio": 0.111,          # P(x) 3rd/1st harmonic (default 1/9 triangle seed)
      "modulation_calibration": 1.0      # FE calibration on (P_max−P_min); default 1.0
    }

Output:
    {
      "net_breakaway_force_mn": ...,     # peak of the net N-pole detent curve
      "per_pole_force_amplitude_mn": ...,
      "detent_positions_mm": [...],      # stable equilibria over one pitch
      "n_detents_per_pitch": ...,
      "pm_operating_b_t": ..., "pm_operating_h_ka_m": ...,
      "flux_per_pole_uwb": ...,
      "warnings": [...]
    }

Physics: harmonic gap permeance P(x) = P0 + P1·(cosθ + k3·cos3θ)/(1+k3) per
toothed interface (two in series per pole), aligned/unaligned end-points from
tooth geometry with corner-fringing terms; PM as MMF source Hc·Lm with internal
reluctance; flux capped at steel saturation; force F = ½·Φg²·dR/dx summed over
poles at their phase offsets. With ~⅓-pitch offsets the FUNDAMENTAL components
cancel — the net detent rides on the 3rd harmonic (that is why harmonic3_ratio
is a first-class input).

VALIDITY (PHANTM lesson, 2026-07-24): this analytic model OVERESTIMATES the
permeance modulation when gap/tooth_width > ~0.15 — fringing keeps the
unaligned interface conducting and only nonlinear FE gives the truthful force
(PHANTM baseline: analytic ×15 optimistic at g/t = 1/3). The tool WARNS above
that ratio and exposes modulation_calibration for an FE-derived correction.

References: Fleadh/HDL stepper permeance models; FEMM 4.2 validation runs in
scripts/phantm/femm/ (C-core gate + mesh-convergence, 2026-07-24).
"""
from __future__ import annotations

import json
import math
import sys

MU0 = 4e-7 * math.pi
HARD = ["tooth_pitch_mm", "tooth_width_mm", "gap_mm", "n_teeth_per_pole",
        "stack_width_mm", "stator_slot_depth_mm", "translator_slot_depth_mm",
        "n_poles", "pole_phase_offsets_mm", "pm_length_mm", "pm_br_t", "pm_area_mm2"]


def permeance_endpoints(t, g, ds, dt):
    """Normalised (÷ µ0·w) aligned / unaligned permeance per tooth."""
    d_eff = min(ds, dt)
    p_max = t / g + (4.0 / math.pi) * math.log1p(math.pi * d_eff / (2.0 * g))
    p_min = (t * 0.5 * (1.0 / (g + ds) + 1.0 / (g + dt))
             + (2.0 / math.pi) * math.log(2.0))
    return p_max, p_min


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
    if len(offs) != int(inp["n_poles"]):
        raise ValueError("pole_phase_offsets_mm length must equal n_poles")
    lm = inp["pm_length_mm"] * mm
    br = inp["pm_br_t"]
    mu_r = float(inp.get("pm_mu_r", 1.05))
    a_pm = inp["pm_area_mm2"] * 1e-6
    b_sat = float(inp.get("steel_b_sat_t", 1.5))
    k3 = float(inp.get("harmonic3_ratio", 1.0 / 9.0))
    cal = float(inp.get("modulation_calibration", 1.0))

    if cal == 1.0:
        warnings.append(
            f"UNCALIBRATED: analytic permeance modulation is an UPPER BOUND on "
            f"force — fringing + finite-µ effects reduce it strongly (PHANTM FE "
            f"2026-07-24: ×40 at g/t={20/232:.2f}, ×15 net at g/t=0.33). Supply "
            f"an FE-derived modulation_calibration for truthful numbers; "
            f"this run g/t = {g/t:.2f}")

    p_max, p_min = permeance_endpoints(t, g, ds, dt)
    p0 = 0.5 * (p_max + p_min)
    p1 = 0.5 * (p_max - p_min) * cal
    scale = MU0 * w * n_teeth
    hc = br / (MU0 * mu_r)
    f_pm = hc * lm
    r_pm = lm / (MU0 * mu_r * a_pm)
    phi_cap = b_sat * a_pm

    def pole_force(x):
        th = 2 * math.pi * x / pitch
        s = (math.cos(th) + k3 * math.cos(3 * th)) / (1 + k3)
        dsdx = (-(math.sin(th)) - 3 * k3 * math.sin(3 * th)) / (1 + k3) * 2 * math.pi / pitch
        p_gap = scale * (p0 + p1 * s)              # one interface
        r_gap = 2.0 / p_gap                        # two gaps in series
        phi = min(f_pm / (r_pm + r_gap), phi_cap)
        dr_dx = -2.0 * scale * p1 * dsdx / (p_gap ** 2)
        return -0.5 * phi * phi * dr_dx, phi

    n_s = 241
    xs = [(-0.5 + i / (n_s - 1)) * pitch for i in range(n_s)]
    net = []
    for x in xs:
        f = sum(pole_force(x - o)[0] for o in offs)
        net.append(f)
    breakaway = max(abs(f) for f in net)
    detents = []
    for i in range(n_s - 1):
        if net[i] > 0 > net[i + 1]:
            x0, x1 = xs[i], xs[i + 1]
            detents.append(x0 + net[i] * (x1 - x0) / (net[i] - net[i + 1]))
    amp_single = max(abs(pole_force(x)[0]) for x in xs)
    phi_aligned = pole_force(0.0)[1]
    b_pm = phi_aligned / a_pm
    h_pm = (b_pm - br) / (MU0 * mu_r)
    if len(detents) != len(offs):
        warnings.append(f"{len(detents)} stable detents per pitch vs {len(offs)} poles — "
                        f"step structure degraded (check offsets/harmonic content)")
    return {
        "net_breakaway_force_mn": breakaway * 1e3,
        "per_pole_force_amplitude_mn": amp_single * 1e3,
        "detent_positions_mm": [d / mm for d in detents],
        "n_detents_per_pitch": len(detents),
        "pm_operating_b_t": b_pm,
        "pm_operating_h_ka_m": h_pm / 1e3,
        "flux_per_pole_uwb": phi_aligned * 1e6,
        "p_modulation_ratio": p_max / p_min,
        "warnings": warnings,
    }


PHANTM_FIXED = {
    "tooth_pitch_mm": 0.464, "tooth_width_mm": 0.232, "gap_mm": 0.020,
    "n_teeth_per_pole": 3, "stack_width_mm": 1.55,
    "stator_slot_depth_mm": 0.155, "translator_slot_depth_mm": 0.465,
    "n_poles": 3, "pole_phase_offsets_mm": [0.0, 0.142, 0.284],
    "pm_length_mm": 0.243, "pm_br_t": 1.30, "pm_area_mm2": 0.405,
}
PHANTM_FIXED_FE_MN = 7.72   # FE truth (femm/fixed_design.py, 2026-07-24)


def _selftest():
    # 1) uncalibrated = UPPER BOUND on the FE truth, 3 detents, and WARNS
    out = solve(dict(PHANTM_FIXED))
    assert out["n_detents_per_pitch"] == 3, out
    assert out["net_breakaway_force_mn"] >= PHANTM_FIXED_FE_MN, out
    assert any("UNCALIBRATED" in w for w in out["warnings"]), out
    # 2) the calibration knob can reproduce FE truth: bisect cal ∈ (0.01, 1)
    lo, hi = 0.01, 1.0
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        f = solve({**PHANTM_FIXED, "modulation_calibration": mid})["net_breakaway_force_mn"]
        if f < PHANTM_FIXED_FE_MN:
            lo = mid
        else:
            hi = mid
    assert 0.05 <= mid <= 0.5, f"FE-matching calibration {mid} outside sane band"
    fcal = solve({**PHANTM_FIXED, "modulation_calibration": mid})
    assert abs(fcal["net_breakaway_force_mn"] - PHANTM_FIXED_FE_MN) < 0.5, fcal
    assert not any("UNCALIBRATED" in w for w in fcal["warnings"]), fcal
    # 3) missing hard input must raise
    try:
        solve({"tooth_pitch_mm": 0.464})
        raise AssertionError("missing-input did not raise")
    except ValueError:
        pass
    print(f"magnetics_vr_detent selftest OK (FE-matching cal ≈ {mid:.3f})")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        sys.exit(0)
    print(json.dumps(solve(json.load(sys.stdin))))
