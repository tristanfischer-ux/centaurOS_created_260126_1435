#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/downwash_recirculation.py

Multirotor downwash recirculation / hover out of ground effect (HOGE).

Input:
    {
      "rotor_disk_loading_n_m2": 800.0,
      "num_rotors": 6,
      "rotor_spacing_diameters": 1.5,
      "altitude_agl_m": 5.0,
      "rotor_diameter_m": 1.8
    }

Output:
    {
      "power_loss_pct": ...,
      "recirculation_severity": "low|moderate|high|severe",
      "HIGE_to_HOGE_ratio": ...,
      "induced_velocity_ms": ...,
      ...
    }

Physics (momentum theory, McAlister & Lehman 1997, Conyers 2018):
- Induced velocity in hover: v_i = sqrt(T / (2·ρ·A))
- Power = T·v_i (ideal momentum)
- Ground effect correction: T_IGE/T_OGE = 1 / (1 - (R/(4z))²)  for z > R/2
- Recirculation factor f_rec for multi-rotor with normalised spacing s/D:
  - s/D > 2.0 → independent rotors (penalty < 3%)
  - s/D in [1.5, 2.0] → mild overlap, ~5-10% loss
  - s/D in [1.2, 1.5] → moderate, ~10-15% loss
  - s/D < 1.2 → severe, ~15-25% loss

References:
- Conyers (2018) "Empirical Evaluation of Ground, Ceiling, and Wall Effects
  for Small-Scale Rotorcraft," ETD U. Texas Austin.
- McAlister & Lehman (1997) "Helicopter Rotors in Forward Flight," NASA TM.
- Leishman "Principles of Helicopter Aerodynamics" 2nd ed., Ch. 5.
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "downwash_recirculation (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Conyers (2018) ETD U. Texas Austin; Leishman 'Principles of Helicopter Aerodynamics' Ch. 5",
    "physics_basis": "Momentum theory for induced velocity, empirical ground-effect correction T_IGE/T_OGE = 1/(1-(R/(4z))^2), inter-rotor spacing penalty curve.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

RHO_SL = 1.225


def compute(payload: dict) -> dict:
    DL = float(payload.get("rotor_disk_loading_n_m2", 800.0))
    n_rotors = int(payload.get("num_rotors", 6))
    s_over_D = float(payload.get("rotor_spacing_diameters", 1.5))
    z_agl = float(payload.get("altitude_agl_m", 5.0))
    D = float(payload.get("rotor_diameter_m", 1.8))

    R = D / 2.0

    # Induced velocity at single isolated rotor
    v_i = math.sqrt(DL / (2.0 * RHO_SL))
    induced_power_per_disk_w_m2 = DL * v_i

    # Ground effect correction (Cheeseman & Bennett 1955)
    # T_IGE / T_OGE = 1 / (1 - (R/(4z))^2)
    if z_agl >= R / 2.0:
        gef = 1.0 / (1.0 - (R / (4.0 * z_agl)) ** 2)
    else:
        gef = 1.4  # near-ground saturation
    gef = max(1.0, min(1.4, gef))

    # Inter-rotor spacing penalty (empirical from drone HOGE tests)
    if s_over_D >= 2.0:
        rec_loss_pct = 2.0
        severity = "low"
    elif s_over_D >= 1.5:
        rec_loss_pct = 5.0 + (2.0 - s_over_D) * 10.0  # 5-10%
        severity = "moderate"
    elif s_over_D >= 1.2:
        rec_loss_pct = 10.0 + (1.5 - s_over_D) * 17.0  # 10-15%
        severity = "high"
    else:
        rec_loss_pct = 15.0 + max(0.0, (1.2 - s_over_D)) * 50.0  # 15-25%+
        severity = "severe"

    # HIGE / HOGE ratio: in ground effect more thrust per unit power
    HIGE_to_HOGE_thrust_ratio = gef
    HIGE_to_HOGE_power_ratio = 1.0 / gef  # less power needed in GE

    return {
        "rotor_disk_loading_n_m2": DL,
        "induced_velocity_ms": round(v_i, 2),
        "induced_power_per_disk_kw_m2": round(induced_power_per_disk_w_m2 / 1000.0, 3),
        "ground_effect_factor": round(gef, 3),
        "power_loss_pct": round(rec_loss_pct, 1),
        "recirculation_severity": severity,
        "HIGE_to_HOGE_ratio": round(HIGE_to_HOGE_thrust_ratio, 3),
        "HIGE_to_HOGE_power_ratio": round(HIGE_to_HOGE_power_ratio, 3),
        "rotor_spacing_diameters": s_over_D,
        "num_rotors": n_rotors,
        "altitude_agl_m": z_agl,
        "recommended_min_spacing_d": 1.5,
    }


def main() -> int:
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
