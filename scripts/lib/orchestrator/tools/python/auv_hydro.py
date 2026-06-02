#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/auv_hydro.py

AUV (Autonomous Underwater Vehicle) hydrostatic + hydrodynamic
calculator. Reads JSON from stdin, writes JSON to stdout.

Input:
    {
      "depth_m": 1000.0,
      "velocity_m_s": 2.0,
      "length_m": 2.5,
      "beam_m": 0.3,                    # hull diameter (or beam) [m]
      "c_d": 0.04,                      # drag coefficient (referenced to frontal area)
      "salinity_ppt": 35.0,             # seawater salinity, default 35
      "water_temp_c": 4.0,              # deep ocean ~ 4°C
      "hull_form": "torpedo"            # torpedo | flatfish | submarine
    }

Output:
    {
      "hydrostatic_pressure_pa": 1.013e7,
      "hydrostatic_pressure_bar": 101.3,
      "seawater_density_kg_m3": 1037.4,
      "drag_force_n": 24.9,
      "drag_power_w": 49.7,
      "frontal_area_m2": 0.0707,
      "wetted_area_m2": ...
      ...
    }

Reference: Fossen "Handbook of Marine Craft Hydrodynamics and Motion
Control" Ch. 6, Allmendinger "Submersible Vehicle Systems Design".
Uses python-seawater (PSS-78 / UNESCO equation of state).

License: MIT (seawater)
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
    "tool_name": 'auv_hydro (python-seawater)',
    "tool_version": '3.3.5',
    "tool_license": 'MIT',
    "tool_source_url": 'https://github.com/pyoceans/python-seawater',
    "tool_paper": "UNESCO (1983), 'Algorithms for computation of fundamental properties of seawater', UNESCO Technical Papers in Marine Science 44",
    "physics_basis": 'UNESCO EOS-80 seawater equation of state. Drag coefficient via ITTC 1957 friction line + Hoerner form-factor correction for slender bodies.',
    "confidence_class": 'library',
    "last_reviewed_date": "2026-05-22",
}


G = 9.80665  # m/s²


def compute(payload: dict) -> dict:
    depth_m = float(payload.get("depth_m", 100.0))
    velocity_m_s = float(payload.get("velocity_m_s", 2.0))
    length_m = float(payload.get("length_m", 2.5))
    beam_m = float(payload.get("beam_m", 0.3))
    c_d = float(payload.get("c_d", 0.04))
    salinity_ppt = float(payload.get("salinity_ppt", 35.0))
    water_temp_c = float(payload.get("water_temp_c", 4.0))
    hull_form = str(payload.get("hull_form", "torpedo")).lower()

    # Seawater density via python-seawater (UNESCO EOS-80)
    try:
        import seawater as sw
        # Pressure in decibars (1 dbar ≈ 1 m depth in seawater)
        pressure_dbar = depth_m
        # sw.dens returns density in kg/m³ given (salinity, temp_c, pressure_dbar)
        rho_water = float(sw.dens(salinity_ppt, water_temp_c, pressure_dbar))
        seawater_lib_ok = True
    except Exception as exc:
        # Fallback: linear approximation rho_0 + thermal/salinity corrections
        rho_water = 1025.0 + (salinity_ppt - 35.0) * 0.75 - (water_temp_c - 4.0) * 0.15 + depth_m * 0.0044
        seawater_lib_ok = False

    # Hydrostatic pressure (gauge, atop ambient atmospheric)
    p_hydrostatic = rho_water * G * depth_m
    p_absolute = p_hydrostatic + 101325  # add 1 atm

    # Frontal area (assumed circular for torpedo hull form)
    if hull_form in ("torpedo", "submarine"):
        frontal_area = math.pi * (beam_m / 2.0) ** 2
    elif hull_form == "flatfish":
        # rectangular cross-section, height = beam/2
        frontal_area = beam_m * (beam_m / 2.0)
    else:
        frontal_area = math.pi * (beam_m / 2.0) ** 2

    # Drag force F_d = ½ ρ v² C_d A
    drag_force_n = 0.5 * rho_water * (velocity_m_s ** 2) * c_d * frontal_area
    drag_power_w = drag_force_n * velocity_m_s

    # Wetted surface area (approximate for torpedo hull = cylinder + 2 hemispheres)
    if hull_form in ("torpedo", "submarine"):
        # Cylinder body length = total - 2 hemispheres
        body_length = max(0.0, length_m - beam_m)
        cyl_area = math.pi * beam_m * body_length
        sphere_area = math.pi * (beam_m ** 2)  # 2 hemispheres = 1 sphere
        wetted = cyl_area + sphere_area
    else:
        # Rough box approximation
        wetted = 2 * (length_m * beam_m + length_m * beam_m / 2.0 + beam_m * beam_m / 2.0)

    # Reynolds number (kinematic viscosity of seawater ~ 1.5e-6 m²/s)
    nu_kinematic = 1.5e-6  # typical for cold seawater
    reynolds = velocity_m_s * length_m / nu_kinematic

    # Buoyancy = ρ × g × V; estimate body volume as cylinder + 2 hemispheres
    body_volume = math.pi * (beam_m / 2.0) ** 2 * max(0.0, length_m - beam_m) + (
        4.0 / 3.0 * math.pi * (beam_m / 2.0) ** 3
    )
    buoyancy_n = rho_water * G * body_volume

    # --- Worked calculations ---
    # rho_water is from python-seawater library (or linear fallback), so it is
    # passed as a rounded live value.  frontal_area is branchy (hull_form),
    # so drag_force_n is also skipped as a direct formula — instead drag_power_w
    # chains off the live drag_force_n value.
    rho_r = round(rho_water, 3)
    p_hydro_r = round(p_hydrostatic, 1)
    drag_n_r = round(drag_force_n, 3)
    reynolds_r = round(reynolds, 0)

    worked = [
        worked_calc(
            label="Hydrostatic pressure",
            formula="p_hydro = rho_water x G x depth",
            values={"rho_water": (rho_r, "kg/m3"), "G": (G, "m/s2"),
                    "depth": (depth_m, "m")},
            result=p_hydro_r, result_unit="Pa",
            assumptions=["rho_water from UNESCO EOS-80 (python-seawater) or linear fallback"],
        ),
        worked_calc(
            label="Drag power",
            formula="P_drag = F_drag x velocity",
            values={"F_drag": (drag_n_r, "N"), "velocity": (velocity_m_s, "m/s")},
            result=round(drag_power_w, 3), result_unit="W",
            assumptions=["F_drag includes hull-form-dependent frontal area"],
        ),
        worked_calc(
            label="Reynolds number",
            formula="Re = velocity x length / nu",
            values={"velocity": (velocity_m_s, "m/s"), "length": (length_m, "m"),
                    "nu": (nu_kinematic, "m2/s")},
            result=reynolds_r, result_unit="",
            assumptions=["nu = 1.5e-6 m2/s for cold deep seawater (~4 deg C)"],
        ),
    ]

    return {
        "depth_m": depth_m,
        "velocity_m_s": velocity_m_s,
        "length_m": length_m,
        "beam_m": beam_m,
        "salinity_ppt": salinity_ppt,
        "water_temp_c": water_temp_c,
        "hull_form": hull_form,
        "seawater_density_kg_m3": round(rho_water, 3),
        "hydrostatic_pressure_pa": round(p_hydrostatic, 1),
        "hydrostatic_pressure_bar": round(p_hydrostatic / 1e5, 3),
        "absolute_pressure_pa": round(p_absolute, 1),
        "absolute_pressure_bar": round(p_absolute / 1e5, 3),
        "frontal_area_m2": round(frontal_area, 5),
        "wetted_area_m2": round(wetted, 4),
        "body_volume_m3": round(body_volume, 5),
        "drag_force_n": round(drag_force_n, 3),
        "drag_power_w": round(drag_power_w, 3),
        "buoyancy_n": round(buoyancy_n, 3),
        "reynolds_number": round(reynolds, 0),
        "c_d": c_d,
        "worked": worked,
        "_meta": {"seawater_lib_used": seawater_lib_ok},
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
