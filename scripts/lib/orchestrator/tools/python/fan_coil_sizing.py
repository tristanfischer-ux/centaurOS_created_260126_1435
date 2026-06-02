#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/fan_coil_sizing.py

Air-side coil + fan + filter sizing for an air-handling unit. Reads
JSON from stdin, writes JSON to stdout.

Input:
    {
      "airflow_cms": 5.0,
      "coil_load_kw": 25.0,
      "coil_type": "chilled_water",            # 'chilled_water'|'dx_evap'|'heating_hot_water'
      "static_pressure_pa": 250.0,             # external static pressure
      "face_velocity_m_s": 2.5,                # optional, default 2.5
      "filter_required_class": null            # auto-pick if null
    }

Output:
    {
      "coil_face_area_m2": 2.0,
      "coil_rows": 4,
      "fan_power_kw": 6.9,
      "filter_class_required": "F7",
      "filter_area_m2": 4.0,
      "static_pressure_total_pa": 540.0,
      ...
    }

Method:
  - Face area A_face = Q_air / V_face (V_face 2.0-2.5 m/s typical)
  - Coil rows from required UA: rows ≈ (Q × ΔT_factor) / (U × A × LMTD × row_factor)
  - Fan power P_fan = (Q × ΔP_total) / η_fan (kW)
  - Filter face velocity 0.5 m/s for F7/H13, 1.0 m/s for G4 (ASHRAE 2019
    Ch 29 / EN 779)
  - ΔP additions: coil 80-150 Pa, filter 80-250 Pa (clean to loaded)

Reference: ASHRAE Handbook 2017 Ch 22 (Coils) + Ch 21 (Fans), Honeywell
Air Handler Sizing Guide, EN 779:2012 / ISO 16890:2016 filter classes.

License: MIT.
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'fan_coil_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'ASHRAE Handbook of Fundamentals 2017 chapter 22; EN 779:2012 (filter classifications)',
    "physics_basis": 'Face velocity v = Q / A. Fan power P = Q × ΔP / η. Filter resistance per ASHRAE 52.2 / EN 779 minimum-efficiency test.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Coil overall U (W/m²K) per row, air-side limited
U_COIL = {
    "chilled_water": 50.0,  # 7-12°C CHW + air ~ 2 m/s
    "dx_evap": 60.0,         # refrigerant evap is colder, better LMTD
    "heating_hot_water": 35.0,  # gas-side limited slightly
}

# Filter face velocity recommendations (m/s) — EN 779
FILTER_FACE_VELOCITY = {
    "G4": 1.5,     # ePM10 > 50% (coarse)
    "F7": 0.5,     # ePM2.5 > 70%
    "F9": 0.45,
    "H13": 0.30,   # HEPA 99.95%
    "H14": 0.25,   # HEPA 99.995%
}

# Pressure drops (Pa) typical
PRESSURE_DROP = {
    "coil_chilled_water": 100,
    "coil_dx_evap": 120,
    "coil_heating_hot_water": 80,
    "filter_G4": 120,    # avg of clean (60) + final (180)
    "filter_F7": 200,    # avg of clean (100) + final (300)
    "filter_F9": 250,
    "filter_H13": 350,
    "filter_H14": 450,
}


def pick_filter_class(coil_type: str) -> str:
    # Default class depends on application
    if coil_type == "dx_evap":
        return "F7"  # general AC
    if coil_type == "chilled_water":
        return "F7"
    return "G4"  # heating only typically needs less


def compute(payload: dict) -> dict:
    Q_air_cms = float(payload.get("airflow_cms", 1.0))
    coil_load_kw = float(payload.get("coil_load_kw", 1.0))
    coil_type = str(payload.get("coil_type", "chilled_water")).strip().lower()
    p_ext_pa = float(payload.get("static_pressure_pa", 250.0))
    v_face = float(payload.get("face_velocity_m_s", 2.5))
    filter_class = payload.get("filter_required_class") or pick_filter_class(coil_type)
    filter_class = str(filter_class).upper()

    if coil_type not in U_COIL:
        raise ValueError(f"unknown coil_type {coil_type!r}; supported: {list(U_COIL.keys())}")
    if filter_class not in FILTER_FACE_VELOCITY:
        raise ValueError(f"unknown filter class {filter_class!r}; supported: {list(FILTER_FACE_VELOCITY.keys())}")

    # Coil face area
    A_face = Q_air_cms / max(0.1, v_face)

    # Coil rows estimate: Q = U × A_total × LMTD where A_total = rows × A_face × fin_factor
    # Use fin_factor of 12 (typical 12 m² per m² face per row including fins)
    U = U_COIL[coil_type]
    fin_factor = 12.0
    lmtd_k = 8.0  # typical for chilled water; lower for DX evap; higher for hot water
    if coil_type == "dx_evap":
        lmtd_k = 12.0
    elif coil_type == "heating_hot_water":
        lmtd_k = 25.0

    rows = max(1, int(round(coil_load_kw * 1000.0 / (U * A_face * fin_factor * lmtd_k))))

    # Pressure drop accumulators
    dp_coil = PRESSURE_DROP[f"coil_{coil_type}"] * (rows / 4.0)  # scale to 4-row baseline
    dp_filter = PRESSURE_DROP[f"filter_{filter_class}"]
    dp_extras = 50  # dampers + diffusers
    dp_total = p_ext_pa + dp_coil + dp_filter + dp_extras

    # Fan power: P_fan_kW = (Q_cms × ΔP_Pa) / (η_fan × 1000)
    eta_fan = 0.65  # typical centrifugal AHU fan + motor + belt
    fan_power_kw = (Q_air_cms * dp_total) / (eta_fan * 1000.0)

    # Filter area
    v_filter = FILTER_FACE_VELOCITY[filter_class]
    A_filter = Q_air_cms / v_filter

    # Worked calculations for the PDF appendix — built from the SAME live values
    # above (drift-safe). SKIPPED: coil_rows (int(round(...)) — the integer
    # rounding means a re-evaluated continuous expression would not match the
    # printed integer; its value feeds the total static-pressure line as a live
    # input via dp_coil).
    dp_coil_r = round(dp_coil, 1)
    dp_total_r = round(dp_total, 1)
    worked = [
        worked_calc(
            label="Coil face area",
            formula="A_face = airflow / face_velocity",
            values={"airflow": (Q_air_cms, "m3/s"), "face_velocity": (round(v_face, 2), "m/s")},
            result=round(A_face, 3), result_unit="m2",
        ),
        worked_calc(
            label="Total static pressure",
            formula="dp_total = external + dp_coil + dp_filter + dp_extras",
            values={"external": (round(p_ext_pa, 1), "Pa"), "dp_coil": (dp_coil_r, "Pa"),
                    "dp_filter": (round(dp_filter, 1), "Pa"), "dp_extras": (dp_extras, "Pa")},
            result=dp_total_r, result_unit="Pa",
            assumptions=["coil + filter drops per ASHRAE 2017 Ch 22 / EN 779; dp_extras = dampers + diffusers"],
        ),
        worked_calc(
            label="Fan shaft power",
            formula="fan_power = (airflow x dp_total) / (fan_eff x 1000)",
            values={"airflow": (Q_air_cms, "m3/s"), "dp_total": (dp_total_r, "Pa"),
                    "fan_eff": (eta_fan, "")},
            result=round(fan_power_kw, 3), result_unit="kW",
            assumptions=["centrifugal AHU fan + motor + belt efficiency"],
        ),
        worked_calc(
            label="Filter face area",
            formula="A_filter = airflow / filter_face_velocity",
            values={"airflow": (Q_air_cms, "m3/s"), "filter_face_velocity": (v_filter, "m/s")},
            result=round(A_filter, 3), result_unit="m2",
            assumptions=[f"{filter_class} face velocity {v_filter} m/s (EN 779)"],
        ),
    ]

    return {
        "airflow_cms": Q_air_cms,
        "coil_face_area_m2": round(A_face, 3),
        "face_velocity_m_s": round(v_face, 2),
        "coil_rows": rows,
        "coil_total_surface_m2": round(A_face * rows * fin_factor, 1),
        "coil_pressure_drop_pa": round(dp_coil, 1),
        "filter_class_required": filter_class,
        "filter_face_velocity_m_s": v_filter,
        "filter_area_m2": round(A_filter, 3),
        "filter_pressure_drop_pa": round(dp_filter, 1),
        "external_static_pa": round(p_ext_pa, 1),
        "static_pressure_total_pa": round(dp_total, 1),
        "fan_efficiency": round(eta_fan, 3),
        "fan_power_kw": round(fan_power_kw, 3),
        "coil_lmtd_k": round(lmtd_k, 2),
        "coil_u_w_m2_k": round(U, 1),
        "coil_type": coil_type,
        "coil_load_kw": coil_load_kw,
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
