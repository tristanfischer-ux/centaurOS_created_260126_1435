#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/rolling_resistance.py

E-bike / EV rolling resistance + aero drag + grade power calculator.
Stdin JSON -> stdout JSON.

Input:
    {
      "total_mass_kg": 95.0,                # rider + bike
      "velocity_ms": 8.33,                  # 30 km/h
      "tire_pressure_bar": 4.5,
      "rider_position": "upright",          # upright | tucked | aero
      "road_grade_pct": 0.0,                # +ve uphill
      "wheel_diameter_inch": 27.5,
      "air_density_kg_m3": 1.225,
      "tire_type": "commuter"               # commuter | road | knobby_mtb | slick
    }

Output:
    {
      "rolling_drag_n": 6.5,
      "aero_drag_n": 17.0,
      "gradient_drag_n": 0.0,
      "total_power_required_w": 196.0,
      "battery_power_required_w": 235.0,
      ...
    }

Method:
  - Rolling: F_rr = Crr × m × g (Crr from tire data + pressure correction)
  - Aero: F_aero = 0.5 × ρ × CdA × v² (CdA tabulated by rider position)
  - Grade: F_grad = m × g × sin(arctan(grade/100))
  - Power = (F_rr + F_aero + F_grad) × v
  - Battery power = Power_wheel / η_drive (efficiency 80-92%)

Reference: Wilson "Bicycling Science" 4th ed MIT Press 2020 Ch 4
(Resistance), Martin et al "Validation of a Mathematical Model for
Road Cycling Power" J Appl Biomech 1998, ECE R136 lab certification.

License: MIT.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'rolling_resistance (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Wilson, Papadopoulos (2004), 'Bicycling Science' 3rd ed., MIT Press",
    "physics_basis": 'P_total = (C_rr × m × g + 0.5 × ρ × C_d × A × v² + m × g × sin(θ)) × v / η. Wilson textbook coefficients.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Rolling resistance coefficient (typical at 100 kPa = 1 bar, dry asphalt)
TIRE_CRR_BASE = {
    "commuter": 0.0070,     # 28-35 mm urban
    "road": 0.0040,         # 23-25 mm road race
    "knobby_mtb": 0.0120,   # off-road
    "slick": 0.0050,
    "fat": 0.0150,           # fat-bike tires
}

# Aero CdA (drag coefficient × frontal area) per rider position
RIDER_CDA_M2 = {
    "upright": 0.55,    # comfortable city posture
    "tucked": 0.35,     # drop bars on hoods
    "aero": 0.25,       # aero position drops
    "ttbike": 0.20,     # time-trial bike
}


def compute(payload: dict) -> dict:
    m_kg = float(payload.get("total_mass_kg", 90.0))
    v_ms = float(payload.get("velocity_ms", 5.5))
    p_tire_bar = float(payload.get("tire_pressure_bar", 4.0))
    rider_pos = str(payload.get("rider_position", "upright")).strip().lower()
    grade_pct = float(payload.get("road_grade_pct", 0.0))
    wheel_d_in = float(payload.get("wheel_diameter_inch", 27.5))
    rho = float(payload.get("air_density_kg_m3", 1.225))
    tire_type = str(payload.get("tire_type", "commuter")).strip().lower()
    drive_eta = float(payload.get("drive_efficiency", 0.85))

    g = 9.80665
    # Rolling resistance — Crr correction for pressure (Carradice / Cycling Weekly)
    # Crr = Crr_base × (4 bar / p_actual)^0.5  (Pearson 2007 fit)
    crr_base = TIRE_CRR_BASE.get(tire_type, 0.0070)
    crr = crr_base * (4.0 / max(0.5, p_tire_bar)) ** 0.5
    F_rr = crr * m_kg * g

    # Aero drag
    cda = RIDER_CDA_M2.get(rider_pos, 0.55)
    F_aero = 0.5 * rho * cda * v_ms * v_ms

    # Grade drag (positive = uphill load)
    grade_rad = math.atan(grade_pct / 100.0)
    F_grad = m_kg * g * math.sin(grade_rad)

    F_total = F_rr + F_aero + F_grad
    p_wheel_w = F_total * v_ms

    # Battery / motor input power
    p_battery_w = p_wheel_w / max(0.05, drive_eta)

    # Velocity in km/h
    v_kmh = v_ms * 3.6

    # Worked calculations — each step uses rounded live values so the
    # substitution string matches by construction (drift-safe).
    crr_r = round(crr, 5)
    F_rr_r = round(F_rr, 3)
    F_aero_r = round(F_aero, 3)
    F_grad_r = round(F_grad, 3)
    F_total_r = round(F_total, 3)
    p_wheel_r = round(p_wheel_w, 2)

    worked = [
        worked_calc(
            label="Rolling resistance force",
            formula="F_rr = crr x m x g",
            values={
                "crr": (crr_r, ""),
                "m": (m_kg, "kg"),
                "g": (g, "m/s^2"),
            },
            result=F_rr_r, result_unit="N",
            assumptions=[
                f"Crr corrected for tyre pressure: {tire_type} base Crr {crr_base} "
                f"scaled by (4 bar / {p_tire_bar} bar)^0.5 (Pearson 2007 fit)",
            ],
        ),
        worked_calc(
            label="Aerodynamic drag force",
            formula="F_aero = 0.5 x rho x CdA x v^2",
            values={
                "rho": (rho, "kg/m^3"),
                "CdA": (cda, "m^2"),
                "v": (v_ms, "m/s"),
            },
            result=F_aero_r, result_unit="N",
            assumptions=[
                f"CdA = {cda} m^2 for rider position '{rider_pos}' (Wilson Bicycling Science tables)",
            ],
        ),
        worked_calc(
            label="Total wheel power",
            formula="P_wheel = (F_rr + F_aero + F_grad) x v",
            values={
                "F_rr": (F_rr_r, "N"),
                "F_aero": (F_aero_r, "N"),
                "F_grad": (F_grad_r, "N"),
                "v": (v_ms, "m/s"),
            },
            result=p_wheel_r, result_unit="W",
            assumptions=["F_grad computed via arctan + sin (transcendental); passed as input here"],
        ),
        worked_calc(
            label="Battery / motor input power",
            formula="P_battery = P_wheel / eta_drive",
            values={
                "P_wheel": (p_wheel_r, "W"),
                "eta_drive": (drive_eta, ""),
            },
            result=round(p_battery_w, 2), result_unit="W",
            assumptions=[f"Drive-train efficiency {drive_eta} (motor + controller + chain)"],
        ),
    ]

    return {
        "rolling_drag_n": F_rr_r,
        "aero_drag_n": F_aero_r,
        "gradient_drag_n": F_grad_r,
        "total_drag_n": F_total_r,
        "total_power_required_w": p_wheel_r,
        "battery_power_required_w": round(p_battery_w, 2),
        "crr_used": crr_r,
        "crr_base": crr_base,
        "cda_m2": cda,
        "velocity_kmh": round(v_kmh, 2),
        "velocity_ms": v_ms,
        "total_mass_kg": m_kg,
        "rider_position": rider_pos,
        "tire_type": tire_type,
        "tire_pressure_bar": p_tire_bar,
        "road_grade_pct": grade_pct,
        "air_density_kg_m3": rho,
        "drive_efficiency": drive_eta,
        "wheel_diameter_inch": wheel_d_in,
        "worked": worked,
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
        if isinstance(result, dict):
            result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
