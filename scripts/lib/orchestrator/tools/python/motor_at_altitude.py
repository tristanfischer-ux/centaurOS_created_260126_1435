#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/motor_at_altitude.py

Electric motor performance at 20 km / 0.1 atm.

Key altitude effects:
1. Convective cooling decreases ∝ ρ^0.8 → forced air ineffective
2. Radiative cooling becomes primary (need high-emissivity finish)
3. Dielectric strength of air drops → Paschen min at ~7.5 kPa for some gaps
4. Brushed: corona inception at 5 kV decreases to 2 kV → use brushless
5. Magnet temperature must stay below Curie point - NdFeB at 80-180°C

Cooling models:
- Passive convection at altitude: h = 0.5-3 W/m²K (vs 25-50 sea level)
- Radiation: σε(T^4 - T_ambient^4)
- Conduction to mounting: dominant for small motors

Junction temp at altitude:
    T_motor = T_ambient + P_loss × R_thermal
    R_thermal_eff = R_thermal_sl × (ρ_sl/ρ_altitude)^0.5  (degraded cooling)

Derating per IEC 60034-1 for altitude:
- Above 1000m: derate by 1% per 100m above 1000m
- At 20 km: ~80% derating (only 20% rated power viable continuously)

References:
- IEC 60034-1 (rotating machinery rating)
- Hauke Hannig, "Electric motor at high altitudes", DLR Tech Note 2018
- Drela "Hybrid Electric Aerospace Propulsion" notes 2019
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'motor_at_altitude (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'ASHRAE Handbook of Fundamentals ch.14 (Air-side heat transfer); NASA TN D-7867 (Aerospace motor cooling)',
    "physics_basis": 'Convective cooling Q_loss = h × A × (T_motor - T_amb). h drops with ρ_air^0.8 at altitude. Power derate per max-temp.',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


# Boltzmann constant for radiation
SIGMA_SB = 5.67e-8   # W/(m²·K⁴)


def compute(payload: dict) -> dict:
    motor_power_w_rated = float(payload.get("motor_power_w", 5000))
    ambient_temp_c = float(payload.get("ambient_temp_c", -56.5))  # 20km
    ambient_pressure_kpa = float(payload.get("ambient_pressure_kpa", 5.5))
    cooling_type = str(payload.get("cooling", "passive")).lower()
    motor_efficiency = float(payload.get("motor_efficiency_at_sl", 0.92))
    motor_diameter_mm = float(payload.get("motor_diameter_mm", 80))
    motor_length_mm = float(payload.get("motor_length_mm", 120))
    surface_emissivity = float(payload.get("surface_emissivity", 0.9))

    # Air density from ideal gas: ρ = P / (R_specific × T)
    R_air = 287.05   # J/(kg·K)
    T_K = ambient_temp_c + 273.15
    rho = ambient_pressure_kpa * 1000 / (R_air * T_K)
    rho_sl = 1.225

    # Power loss = (1 - η) × rated power
    p_loss_w_rated = motor_power_w_rated * (1 - motor_efficiency)

    # Surface area
    surface_area_m2 = (math.pi * (motor_diameter_mm / 1000)**2 / 2
                      + math.pi * (motor_diameter_mm / 1000) * (motor_length_mm / 1000))

    # Convective coefficient
    # h_forced_sl = 50, h_natural_sl = 10 (W/m²K typical)
    # h_at_altitude ≈ h_sl × (ρ/ρ_sl)^0.8
    rho_ratio = rho / rho_sl
    if cooling_type == "forced":
        h_sl = 50.0
    else:
        h_sl = 10.0
    h_alt = h_sl * (rho_ratio ** 0.8)

    # Steady-state heat balance: P_loss = (h × A + radiation) × ΔT
    # First solve assuming ΔT = 70 K (max insulation Class F = 155°C)
    max_temp_rise_K = 70.0
    T_surface_K = T_K + max_temp_rise_K

    # Radiation: P_rad = σ ε A (T_s^4 - T_amb^4)
    p_rad = SIGMA_SB * surface_emissivity * surface_area_m2 * (T_surface_K ** 4 - T_K ** 4)
    p_conv = h_alt * surface_area_m2 * max_temp_rise_K
    p_dissipable = p_conv + p_rad

    # Continuous power capability
    # If p_dissipable >= p_loss_rated, no derating. Else: rated × (p_dissipable / p_loss_rated)
    if p_dissipable >= p_loss_w_rated:
        derating_factor = 1.0
    else:
        # Power scales with sqrt of losses for thermal limit (constant efficiency)
        derating_factor = p_dissipable / p_loss_w_rated

    continuous_power_w = motor_power_w_rated * derating_factor

    # Actual junction (winding) temp at continuous operation
    actual_p_loss = continuous_power_w * (1 - motor_efficiency)
    # Solve quartic iteratively: actual_p_loss = h_alt × A × ΔT + σεA((T_amb + ΔT)^4 - T_amb^4)
    dt = 30.0
    for _ in range(100):
        T_s_K = T_K + dt
        p_dis = h_alt * surface_area_m2 * dt + SIGMA_SB * surface_emissivity * surface_area_m2 * (T_s_K ** 4 - T_K ** 4)
        # Derivative
        dp = h_alt * surface_area_m2 + 4 * SIGMA_SB * surface_emissivity * surface_area_m2 * T_s_K ** 3
        dt_new = dt - (p_dis - actual_p_loss) / max(0.01, dp)
        if abs(dt_new - dt) < 0.05:
            dt = dt_new
            break
        dt = max(1.0, dt_new)

    junction_temp_c = ambient_temp_c + dt

    # Efficiency at altitude — drops slightly due to higher resistance at higher temp
    # Cu α ≈ 0.00393 /K
    delta_t_from_25 = (junction_temp_c - 25.0)
    resistance_factor = 1 + 0.00393 * delta_t_from_25
    eff_altitude = 1 - (1 - motor_efficiency) * resistance_factor

    # IEC 60034-1 altitude derating (above 1000m, 1%/100m)
    altitude_m_isa_approx = 44330 * (1 - (ambient_pressure_kpa / 101.325) ** (1 / 5.256))
    if altitude_m_isa_approx > 1000:
        iec_derating_pct = min(95, (altitude_m_isa_approx - 1000) / 100.0)
    else:
        iec_derating_pct = 0

    return {
        "motor_power_w_rated": motor_power_w_rated,
        "ambient_temp_c": ambient_temp_c,
        "ambient_pressure_kpa": ambient_pressure_kpa,
        "ambient_air_density_kg_m3": round(rho, 4),
        "altitude_m_isa_approx": int(altitude_m_isa_approx),
        "rho_ratio_to_sl": round(rho_ratio, 3),
        "cooling_type": cooling_type,
        "h_convection_w_m2k_sea_level": h_sl,
        "h_convection_w_m2k_at_altitude": round(h_alt, 2),
        "surface_area_m2": round(surface_area_m2, 4),
        "continuous_power_w": round(continuous_power_w, 0),
        "thermal_derating_factor": round(derating_factor, 3),
        "iec_60034_derating_pct": round(iec_derating_pct, 1),
        "junction_temp_c": round(junction_temp_c, 1),
        "junction_temp_rise_above_ambient_k": round(dt, 1),
        "efficiency_pct_at_altitude": round(eff_altitude * 100, 2),
        "efficiency_pct_sea_level": round(motor_efficiency * 100, 2),
        "radiation_dissipation_w_at_70K_rise": round(p_rad, 1),
        "convection_dissipation_w_at_70K_rise": round(p_conv, 1),
        "dissipation_total_w_at_max_rise": round(p_dissipable, 1),
        "p_loss_rated_w": round(p_loss_w_rated, 1),
        "warning_curie_temp": (junction_temp_c > 150),  # NdFeB Tc warning
        "recommended_winding_class": (
            "Class H (180°C)" if junction_temp_c > 130 else
            "Class F (155°C)" if junction_temp_c > 105 else "Class B (130°C)"
        ),
        "notes": (
            "Cooling per Newton/Stefan-Boltzmann balance. At 20km altitude, "
            "convection drops 5-10×, radiation becomes dominant. Use high "
            "emissivity (black anodised, ε=0.9) coating. Active cooling via "
            "thermal strap to radiator (see thermal_strap.py tool)."
        ),
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
