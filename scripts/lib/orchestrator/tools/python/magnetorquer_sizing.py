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
import sys
import time

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

    return {
        "altitude_km": altitude_km,
        "latitude_deg": latitude_deg,
        "desired_torque_nm": desired_torque_nm,
        "coil_type": coil_type,
        "voltage_v": voltage_v,
        "power_budget_w": power_budget_w,
        "earth_b_field_t": b_t,
        "earth_b_field_microtesla": round(b_t * 1e6, 3),
        "magnetic_dipole_moment_required_am2": round(m_required_am2, 4),
        "magnetic_dipole_moment_am2": round(m_actual_am2, 4),
        "coil_diameter_m": coil_diameter_m,
        "coil_area_m2": round(coil_area_m2, 5),
        "coil_turns": n_turns,
        "coil_current_a": round(i_actual, 4),
        "coil_wire_area_mm2": round(a_wire_required_mm2, 4),
        "coil_wire_length_m": round(l_wire_m, 2),
        "coil_resistance_ohm": round(r_coil, 3),
        "coil_power_w": round(power_actual_w, 3),
        "coil_mass_kg": round(coil_mass_total_kg, 4),
        "time_to_unload_minutes": round(t_unload_min, 2),
        "apparent_permeability": mu_apparent,
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
