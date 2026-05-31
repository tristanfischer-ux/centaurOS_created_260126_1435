#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/hvac_load_sizing.py

HVAC system load + sizing calculator. Combines sensible + latent loads
into chiller, condenser, evaporator, and airflow requirements.
Stdin JSON -> stdout JSON.

Input:
    {
      "sensible_load_kw": 30.0,
      "latent_load_kw_or_moisture_kg_h": 0.0,
      "indoor_db_c": 25.0,
      "indoor_rh_pct": 50.0,
      "outdoor_db_c": 35.0,
      "outdoor_rh_pct": 50.0,
      "airflow_cms": null,                  # optional override
      "supply_air_dt_k": 11.0,              # optional, default 11 K
      "refrigerant": "R290"                 # optional, default R290
    }

Output:
    {
      "total_load_kw": 30.0,
      "sensible_heat_ratio": 1.0,
      "required_chiller_capacity_kw": 33.0, # +10% safety
      "required_airflow_cms": 2.27,
      "required_evap_area_m2": 4.5,
      "required_cond_area_m2": 6.5,
      "expected_cop": 3.85,
      ...
    }

Method:
  - Combine sensible+latent into total load
  - Mass flow of supply air from sensible-only side (Q_s = m·cp·ΔT)
  - SHR = sensible / (sensible + latent)
  - Chiller capacity = 1.1 × total load (10% safety + duct gain)
  - Coil area sized via UA / LMTD assuming U_evap ≈ 35 W/m²K,
    U_cond ≈ 30 W/m²K (air-side limited finned-tube coils, ASHRAE 2017
    Chapter 22 typical values)
  - COP from refrigeration_cycle.py model with T_evap ≈ indoor_db - 12 K
    and T_cond ≈ outdoor_db + 12 K (typical air-cooled approach temps)

Reference: ASHRAE Handbook of Fundamentals 2017 Chapter 18 (Load), 22 (Coils),
Heat Pump and Refrigeration Cycles - Moran/Shapiro Ch 10.

License: MIT.
"""
from __future__ import annotations

import json
import math
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'hvac_load_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'ASHRAE Handbook of Fundamentals 2017 chapters 18 (nonresidential cooling) + 22 (chiller selection)',
    "physics_basis": 'Sensible heat load Q_s = m_dot × Cp × ΔT, latent Q_l = m_dot × h_fg × Δω. Chiller COP per Carnot × isentropic efficiency. SHR = Q_s / (Q_s + Q_l).',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Air properties at standard conditions (ASHRAE 2017 Ch 1)
RHO_AIR = 1.20  # kg/m³ at sea-level standard
CP_AIR_DRY = 1.006  # kJ/kg-K
CP_AIR_HUMID = 1.026  # kJ/kg-K typical at 25C/50% RH (approx)
H_FG_WATER = 2454.0  # kJ/kg at 20°C latent heat of vaporisation

# Coil overall heat transfer coefficients (W/m²K) — typical finned-tube
# air-side limited values from ASHRAE 2017 Ch 22 Table 5
U_EVAP_FINNED = 35.0  # chilled water + air at 2-4 m/s
U_COND_FINNED = 30.0  # refrigerant gas + air, lower because gas-side


def saturation_pressure_pa(t_c: float) -> float:
    """Magnus-Tetens approximation for water saturation pressure (Pa)."""
    t = float(t_c)
    return 610.78 * math.exp((17.27 * t) / (t + 237.3))


def humidity_ratio(t_c: float, rh_pct: float, p_atm: float = 101325.0) -> float:
    """Humidity ratio W [kg water / kg dry air] from dry-bulb + RH."""
    p_ws = saturation_pressure_pa(t_c)
    p_w = p_ws * max(0.0, min(1.0, rh_pct / 100.0))
    return 0.622 * p_w / max(1.0, p_atm - p_w)


def compute(payload: dict) -> dict:
    Q_sens_kw = float(payload.get("sensible_load_kw", 0.0))
    latent_input = payload.get("latent_load_kw_or_moisture_kg_h", 0.0)

    # Indoor / outdoor air conditions
    indoor_db_c = float(payload.get("indoor_db_c", 25.0))
    indoor_rh_pct = float(payload.get("indoor_rh_pct", 50.0))
    outdoor_db_c = float(payload.get("outdoor_db_c", 35.0))
    outdoor_rh_pct = float(payload.get("outdoor_rh_pct", 50.0))

    airflow_cms_input = payload.get("airflow_cms")  # optional
    supply_air_dt_k = float(payload.get("supply_air_dt_k", 11.0))
    safety_factor = float(payload.get("safety_factor", 1.10))

    # Convert latent input to kW. If user supplies in kg/h, multiply by h_fg.
    # Heuristic: values > 5 are assumed moisture in kg/h (a 5 kW chiller
    # at 25°C/50% RH room has latent ~0 typically; >5 kg/h moisture is
    # 3.4 kW already).
    if float(latent_input) > 5.0:
        moisture_kg_h = float(latent_input)
        Q_lat_kw = (moisture_kg_h / 3600.0) * H_FG_WATER
    else:
        Q_lat_kw = float(latent_input)
        moisture_kg_h = (Q_lat_kw / H_FG_WATER) * 3600.0 if Q_lat_kw > 0 else 0.0

    Q_total_kw = Q_sens_kw + Q_lat_kw
    SHR = Q_sens_kw / max(1e-6, Q_total_kw)

    # Chiller capacity sized with safety factor (covers duct gain, fouling)
    chiller_capacity_kw = Q_total_kw * safety_factor

    # Airflow: Q_sens = m_dot · cp · ΔT
    # m_dot = Q_sens / (cp · ΔT); volume = m_dot / ρ_air
    if airflow_cms_input is not None:
        airflow_cms = float(airflow_cms_input)
    else:
        # Use dry-air cp for sensible-only sizing (W = constant assumption)
        if Q_sens_kw > 0 and supply_air_dt_k > 0:
            m_dot_kg_s = (Q_sens_kw * 1000.0) / (CP_AIR_DRY * 1000.0 * supply_air_dt_k)
            airflow_cms = m_dot_kg_s / RHO_AIR
        else:
            # Pure latent case (rare): size by mass transfer + 6 ACH default
            airflow_cms = 0.05  # placeholder

    # COP from approximate evap/cond temperatures
    t_evap_c = indoor_db_c - 12.0  # 12 K approach
    t_cond_c = outdoor_db_c + 12.0  # 12 K approach
    # Approximate ideal-cycle COP with η_isentropic = 0.70 + sub-Carnot
    t_evap_k = t_evap_c + 273.15
    t_cond_k = t_cond_c + 273.15
    carnot_cop = t_evap_k / max(1.0, (t_cond_k - t_evap_k))
    eta_relative = 0.55  # 55% of Carnot — typical real refrigerant cycle
    expected_cop = carnot_cop * eta_relative

    # Compressor power = chiller_load / cop_cool
    compressor_power_kw = chiller_capacity_kw / max(0.1, expected_cop)

    # Condenser duty = evap duty + compressor power (energy balance)
    condenser_duty_kw = chiller_capacity_kw + compressor_power_kw

    # Coil areas via Q = U · A · LMTD
    # Evap: chilled water 7-12°C, air enters at indoor T, returns at supply T
    # Approximate LMTD ≈ 6-8 K typical chilled water coil
    lmtd_evap_k = 7.0
    A_evap_m2 = (chiller_capacity_kw * 1000.0) / (U_EVAP_FINNED * lmtd_evap_k)

    # Cond: refrigerant 50-55°C → outdoor air at outdoor_db_c
    # LMTD ≈ 15 K typical for air-cooled condensers
    lmtd_cond_k = max(5.0, (t_cond_c - outdoor_db_c))
    A_cond_m2 = (condenser_duty_kw * 1000.0) / (U_COND_FINNED * lmtd_cond_k)

    # Sensible-only check via humidity ratios
    W_indoor = humidity_ratio(indoor_db_c, indoor_rh_pct)
    W_outdoor = humidity_ratio(outdoor_db_c, outdoor_rh_pct)

    return {
        "total_load_kw": round(Q_total_kw, 3),
        "sensible_load_kw": round(Q_sens_kw, 3),
        "latent_load_kw": round(Q_lat_kw, 3),
        "moisture_load_kg_h": round(moisture_kg_h, 3),
        "sensible_heat_ratio": round(SHR, 4),
        "required_chiller_capacity_kw": round(chiller_capacity_kw, 3),
        "required_airflow_cms": round(airflow_cms, 4),
        "required_airflow_cmh": round(airflow_cms * 3600.0, 1),
        "required_evap_area_m2": round(A_evap_m2, 3),
        "required_cond_area_m2": round(A_cond_m2, 3),
        "expected_cop": round(expected_cop, 3),
        "compressor_power_kw": round(compressor_power_kw, 3),
        "condenser_duty_kw": round(condenser_duty_kw, 3),
        "t_evap_design_c": round(t_evap_c, 2),
        "t_cond_design_c": round(t_cond_c, 2),
        "lmtd_evap_k": round(lmtd_evap_k, 2),
        "lmtd_cond_k": round(lmtd_cond_k, 2),
        "humidity_ratio_indoor_kg_kg": round(W_indoor, 6),
        "humidity_ratio_outdoor_kg_kg": round(W_outdoor, 6),
        "carnot_cop_ceiling": round(carnot_cop, 3),
        "carnot_efficiency_pct": round(eta_relative * 100.0, 1),
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
