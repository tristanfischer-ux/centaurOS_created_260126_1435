#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/magnetorquer_sizing.py

Magnetorquer (mag-torquer / mag-rod) sizing — Earth magnetic dipole for
attitude control + reaction wheel momentum unloading.

Input:
    {
      "altitude_km": 500.0,
      "latitude_deg": 45.0,
      "desired_torque_nm": 1.0e-3,
      "coil_type": "air_core",        # air_core | iron_core_rod
      "voltage_v": 12.0,
      "power_budget_w": 5.0
    }

Output:
    {
      "magnetic_dipole_moment_am2": ...,
      "coil_turns": ...,
      "coil_current_a": ...,
      "coil_mass_kg": ...,
      "time_to_unload_minutes": ...,
      ...
    }

Physics:
  Torque: T = m × B (vector cross)  =>  |T| ≤ |m| × |B|
  Earth dipole field magnitude:
    |B| = (μ₀ M_E / 4π r³) × sqrt(1 + 3 sin²λ)
    where M_E = 7.96e22 A·m² (Earth dipole moment)

For air-core circular coil:
  m = N × I × A  (A·m²)
  R_coil = ρ × ℓ / A_wire  (resistance)
  Power = I² × R_coil

Iron-core rod has effective μ_r ≈ 50-200 (apparent permeability of an
elongated rod), so for same NI you get 50-200× larger m, but with mass
penalty.

References:
- Wertz, J.R., "Spacecraft Attitude Determination and Control", §6.6
- IGRF-13 Earth magnetic field model (https://www.ncei.noaa.gov/products/igrf).
- ZARM Technik AG MT15 / MT100 magnetorquer datasheets.
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
    "tool_name": 'magnetorquer_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Wertz ed. (1978), 'Spacecraft Attitude Determination and Control' §6.6; IGRF-13 magnetic-field model",
    "physics_basis": 'Torque T = m × B sin(θ). Required magnetic moment m = T_required / B_min(altitude, latitude). N-turn coil m = N × I × A.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


MU0 = 4 * math.pi * 1e-7  # T·m/A
EARTH_M_AM2 = 7.96e22     # Earth dipole moment, A·m²
R_EARTH_M = 6371e3        # Earth radius
COPPER_RESISTIVITY = 1.724e-8  # Ω·m at 20°C
COPPER_DENSITY = 8960.0   # kg/m³


def earth_b_field_t(altitude_km: float, latitude_deg: float) -> float:
    """Magnitude of Earth's dipole field at orbit altitude + magnetic latitude."""
    r_m = R_EARTH_M + altitude_km * 1000.0
    lam = math.radians(latitude_deg)
    # Total magnitude (north + east components):
    # |B| = (μ₀ M_E / 4π r³) × sqrt(1 + 3 sin²λ)
    b = (MU0 * EARTH_M_AM2 / (4 * math.pi * r_m**3)) * math.sqrt(1 + 3 * math.sin(lam)**2)
    return b


def compute(payload: dict) -> dict:
    altitude_km = float(payload.get("altitude_km", 500.0))
    latitude_deg = float(payload.get("latitude_deg", 45.0))
    desired_torque_nm = float(payload.get("desired_torque_nm", 1e-3))
    coil_type = str(payload.get("coil_type", "air_core"))
    voltage_v = float(payload.get("voltage_v", 12.0))
    power_budget_w = float(payload.get("power_budget_w", 5.0))

    if coil_type not in ("air_core", "iron_core_rod"):
        raise ValueError(f"unknown coil_type {coil_type!r}; known: air_core, iron_core_rod")

    # Earth field at orbit
    b_t = earth_b_field_t(altitude_km, latitude_deg)

    # Required dipole moment (assume torque vector perpendicular to B for best case)
    m_required_am2 = desired_torque_nm / b_t

    # Coil sizing
    # Air-core: design a typical 10 cm diameter coil. NI = m / A
    coil_diameter_m = 0.10
    coil_area_m2 = math.pi * (coil_diameter_m / 2.0)**2

    # Iron-core rod effective permeability
    if coil_type == "iron_core_rod":
        mu_apparent = 100.0
    else:
        mu_apparent = 1.0

    # N × I = m / (μ_app × A)
    ni_at = m_required_am2 / (mu_apparent * coil_area_m2)

    # Current = V / R  ; R = ρ × L_wire / A_wire
    # L_wire = N × π × d_coil
    # Power = I² × R = V × I  (for given voltage)
    # I = power_budget / V  (upper limit)
    i_max_from_power = power_budget_w / voltage_v

    # If iron core: cap I at 0.5 A to avoid saturation
    if coil_type == "iron_core_rod":
        i_max_from_power = min(i_max_from_power, 0.5)

    n_turns = ni_at / max(0.01, i_max_from_power)
    n_turns = math.ceil(n_turns)

    # Wire size: pick AWG with current carry capacity ≈ 3 A/mm² for continuous
    a_wire_required_mm2 = i_max_from_power / 3.0
    a_wire_required_mm2 = max(0.05, a_wire_required_mm2)  # AWG 30 minimum
    a_wire_m2 = a_wire_required_mm2 * 1e-6
    # Total wire length
    l_wire_m = n_turns * math.pi * coil_diameter_m
    # Coil resistance
    r_coil = COPPER_RESISTIVITY * l_wire_m / a_wire_m2
    i_actual = voltage_v / r_coil
    # Cap by what we can actually drive given power
    i_actual = min(i_actual, i_max_from_power)

    power_actual_w = i_actual**2 * r_coil
    m_actual_am2 = n_turns * i_actual * mu_apparent * coil_area_m2

    # Coil mass: ρ_Cu × V_wire = ρ × L × A
    coil_mass_copper_kg = COPPER_DENSITY * l_wire_m * a_wire_m2
    # Add core mass if iron-core (typical 0.5 kg for an MT-series rod)
    if coil_type == "iron_core_rod":
        core_mass_kg = 0.5
    else:
        core_mass_kg = 0.0
    coil_mass_total_kg = coil_mass_copper_kg + core_mass_kg
    # Add 30% overhead (former, leads, mounting)
    coil_mass_total_kg *= 1.30

    # Time-to-unload typical wheel momentum (assume H = 1 N·m·s to unload)
    h_to_unload = 1.0
    if desired_torque_nm > 0:
        t_unload_s = h_to_unload / desired_torque_nm
        t_unload_min = t_unload_s / 60.0
    else:
        t_unload_min = float("inf")

    # Rounded display values that chain through the worked calculations.
    m_req_r = round(m_required_am2, 4)
    i_max_r = round(i_max_from_power, 4)
    r_coil_r = round(r_coil, 3)
    i_actual_r = round(i_actual, 4)
    power_r = round(power_actual_w, 3)
    # Use 4-dp rounding for coil_area_r so _fmt represents it accurately (0.0079),
    # then derive m_actual_r from those same displayed inputs so the substitution
    # N x i_actual x mu_app x A_coil reproduces the stated result exactly.
    coil_area_r = round(coil_area_m2, 4)
    m_actual_r = round(n_turns * i_actual_r * mu_apparent * coil_area_r, 4)
    l_wire_r = round(l_wire_m, 2)
    t_unload_r = round(t_unload_min, 2)

    # Worked calculations (hand-checkable closed-form steps only).
    # b_t uses sqrt+sin (earth_b_field_t) — SKIP; pass b_t as live input symbol.
    # n_turns uses math.ceil — SKIP; pass n_turns as live input symbol.
    # r_coil uses actual wire area after max() clamp — use live a_wire_m2 in formula.
    # i_actual is min-clamped — SKIP direct formula; use live value as input to power/moment.
    worked = [
        worked_calc(
            label="Required magnetic dipole moment",
            formula="m_req = T_desired / B_earth",
            values={"T_desired": (desired_torque_nm, "N m"), "B_earth": (round(b_t, 9), "T")},
            result=m_req_r, result_unit="A m2",
            assumptions=["worst-case: torque vector perpendicular to B field (sin(theta)=1)"],
        ),
        worked_calc(
            label="Max current from power budget",
            formula="i_max = P_budget / V",
            values={"P_budget": (power_budget_w, "W"), "V": (voltage_v, "V")},
            result=i_max_r, result_unit="A",
            assumptions=["power-limited current cap; iron-core additionally capped at 0.5 A to avoid saturation"],
        ),
        worked_calc(
            label="Coil resistance",
            formula="R_coil = resistivity x L_wire / A_wire",
            values={
                "resistivity": (COPPER_RESISTIVITY, "Ohm m"),
                "L_wire": (l_wire_r, "m"),
                "A_wire": (round(a_wire_m2, 9), "m2"),
            },
            result=r_coil_r, result_unit="Ohm",
            assumptions=["copper resistivity 1.724e-8 Ohm m at 20 C"],
        ),
        worked_calc(
            label="Actual coil power dissipation",
            formula="P_actual = i_actual^2 x R_coil",
            values={"i_actual": (i_actual_r, "A"), "R_coil": (r_coil_r, "Ohm")},
            result=power_r, result_unit="W",
            assumptions=["i_actual is min(V/R, i_max_from_power)"],
        ),
        worked_calc(
            label="Achieved magnetic dipole moment",
            formula="m_actual = N x i_actual x mu_app x A_coil",
            values={
                "N": (n_turns, "turns"),
                "i_actual": (i_actual_r, "A"),
                "mu_app": (mu_apparent, ""),
                "A_coil": (coil_area_r, "m2"),
            },
            result=m_actual_r, result_unit="A m2",
            assumptions=["m = N I mu_apparent A for coil; mu_apparent=1 (air core), 100 (iron rod)"],
        ),
        worked_calc(
            label="Time to unload reaction wheel angular momentum",
            formula="t_unload = H_wheel / T_desired / 60",
            values={"H_wheel": (1.0, "N m s"), "T_desired": (desired_torque_nm, "N m")},
            result=t_unload_r, result_unit="min",
            assumptions=["H_wheel = 1 N m s (typical small-sat reaction wheel); divide by 60 for minutes"],
        ),
    ]

    return {
        "altitude_km": altitude_km,
        "latitude_deg": latitude_deg,
        "desired_torque_nm": desired_torque_nm,
        "coil_type": coil_type,
        "voltage_v": voltage_v,
        "power_budget_w": power_budget_w,
        "earth_b_field_t": b_t,
        "earth_b_field_microtesla": round(b_t * 1e6, 3),
        "magnetic_dipole_moment_required_am2": m_req_r,
        "magnetic_dipole_moment_am2": m_actual_r,
        "coil_diameter_m": coil_diameter_m,
        "coil_area_m2": coil_area_r,
        "coil_turns": n_turns,
        "coil_current_a": i_actual_r,
        "coil_wire_area_mm2": round(a_wire_required_mm2, 4),
        "coil_wire_length_m": l_wire_r,
        "coil_resistance_ohm": r_coil_r,
        "coil_power_w": power_r,
        "coil_mass_kg": round(coil_mass_total_kg, 4),
        "time_to_unload_minutes": t_unload_r,
        "apparent_permeability": mu_apparent,
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
