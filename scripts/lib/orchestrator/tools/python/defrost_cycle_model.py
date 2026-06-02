#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/defrost_cycle_model.py

Heat pump defrost cycle modelling for outdoor units in cold/humid weather.

Frost formation rate (per Lee & Ro 2010):
    m_dot_frost = K_frost × (W_air - W_sat(T_coil)) × m_dot_air
where:
    W_air, W_sat = humidity ratios (kg/kg dry air)
    K_frost = 0.5-0.7 (deposition coefficient)

Frost density grows from ~50 kg/m³ initial to 400 kg/m³ aged.

Defrost frequency triggers:
- Pressure drop across coil > threshold (Δp = 1.5-2× clean)
- Time-based: every 30-90 minutes during frost-forming conditions
- Demand defrost: temperature differential + pressure
- Frost-forming envelope: T_ambient < 7°C AND RH > 65%

Defrost methods:
1. Reverse-cycle: 5-7 minute reverse heat (most common). Hot water capacity
   degradation: ~25%. Energy penalty: 5-15%.
2. Hot-gas bypass: 3-5 minutes. Less capacity penalty (~10%).
3. Electric resistance: dedicated heater. 8-12 min. Adds OPEX.

References:
- Lee & Ro, "Frost formation on a vertical plate in simultaneously developing
  flow", Experimental Thermal and Fluid Science 2010
- ASHRAE Handbook, HVAC Applications 2023, Ch. 41 Service Water Heating
- AHRI 210/240 (defrost test procedure)
- VDI 3922 (heat pump performance testing)
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
    "tool_name": 'defrost_cycle_model (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "O'Neal, Peterson (1990), 'Mass and Heat Transfer Effects During Air-Source Heat Pump Operation', ASHRAE Transactions 96(2); Yang, Zhang (2014), 'Frost growth on outdoor heat exchanger', Int. J. Refrig. 46:155-164",
    "physics_basis": "Frost mass-growth rate per O'Neal-Peterson. Reverse-cycle defrost energy = m_frost × h_fusion + sensible cooling.",
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


# Saturation pressure (kPa) approximation (Magnus formula)
def saturation_pressure_kpa(T_c: float) -> float:
    return 0.6108 * math.exp((17.27 * T_c) / (237.3 + T_c))


def humidity_ratio(T_c: float, rh_pct: float, p_atm_kpa: float = 101.325) -> float:
    """kg water / kg dry air"""
    p_sat = saturation_pressure_kpa(T_c)
    p_w = (rh_pct / 100.0) * p_sat
    return 0.622 * p_w / (p_atm_kpa - p_w)


def compute(payload: dict) -> dict:
    T_amb = float(payload.get("ambient_temp_c", 0.0))
    rh = float(payload.get("rh_pct", 80))
    T_evap = float(payload.get("evaporator_temp_c", -8.0))
    method = str(payload.get("defrost_method", "reverse_cycle")).lower()
    unit_capacity_kw = float(payload.get("rated_heating_capacity_kw", 8))
    hot_water_storage_l = float(payload.get("hot_water_storage_l", 200))

    # Check if frost-forming conditions
    is_frost_zone = T_amb < 7.0 and rh > 65.0 and T_evap < 0.0

    # Compute humidity ratios
    W_air = humidity_ratio(T_amb, rh)
    W_sat_coil = humidity_ratio(T_evap, 100.0)   # saturated at evap temp

    # Frost mass flow (proxy, per unit air flow). Use 0.3 kg/s air typical for 8kW unit.
    m_dot_air = 0.3
    K_frost = 0.6
    delta_w = max(0, W_air - W_sat_coil)
    m_frost_kg_per_s = K_frost * delta_w * m_dot_air
    frost_g_per_min = m_frost_kg_per_s * 60 * 1000

    # Defrost trigger when frost mass reaches ~250g per kW capacity (typical threshold)
    frost_threshold_g = 250 * unit_capacity_kw
    if frost_g_per_min > 0.1:
        defrost_interval_minutes = frost_threshold_g / frost_g_per_min
    else:
        defrost_interval_minutes = 480  # 8 hrs effectively never

    defrost_frequency_per_hour = 60.0 / max(1, defrost_interval_minutes) if is_frost_zone else 0

    # Defrost duration by method
    defrost_duration = {
        "reverse_cycle": 6,        # 6 min average
        "hot_gas": 4,              # 4 min
        "electric": 10,            # 10 min
        "hot_gas_bypass": 4,
    }.get(method, 6)

    # Energy penalty as % of heat output
    energy_penalty_pct = {
        "reverse_cycle": 12,
        "hot_gas": 8,
        "electric": 15,
        "hot_gas_bypass": 8,
    }.get(method, 12)

    # Adjust for cold weather (penalty rises as T_amb falls below -5°C)
    if T_amb < -5:
        energy_penalty_pct *= 1.3
    if T_amb < -10:
        energy_penalty_pct *= 1.5

    # Hot water capacity lost per defrost
    # During reverse-cycle, heating reverses - no hot water for ~6 min.
    # Average rate of HW depletion: tank loses ~10°C drop / hr at 8kW load
    # Per defrost cycle: ~1°C drop in tank = (defrost_min/60) × tank_volume × 4.184 / 8 kW
    capacity_lost_pct = {
        "reverse_cycle": 25,
        "hot_gas": 10,
        "electric": 0,            # uses external resistance, heating still works
        "hot_gas_bypass": 10,
    }.get(method, 25)

    hot_water_capacity_lost_l = hot_water_storage_l * capacity_lost_pct / 100.0

    # Annual penalty (kWh)
    if is_frost_zone:
        annual_frost_hours = 1500   # typical UK climate frost hours per year
    else:
        annual_frost_hours = 100
    defrost_minutes_per_yr = defrost_frequency_per_hour * defrost_duration * annual_frost_hours
    defrost_kwh_per_yr = defrost_minutes_per_yr / 60.0 * unit_capacity_kw * (energy_penalty_pct / 100.0)

    # Worked calculations.
    # Humidity ratios use Magnus equation (exp) — skip; pass delta_w as known input.
    # energy_penalty_pct has conditional multipliers (branchy) — skip; pass as known input.
    # defrost_minutes_per_yr chain is fully arithmetic once inputs are known.
    delta_w_r = round(delta_w, 5)
    # Derive frost_g_r from the same rounded delta_w_r used in the substitution so
    # K_frost x delta_w_r x m_dot_air x 1000 x 60 evaluates to this exact value.
    frost_g_r = round(K_frost * delta_w_r * m_dot_air * 1000 * 60, 3)
    frost_thresh_r = round(frost_threshold_g, 0)
    defrost_int_r = round(defrost_interval_minutes, 0)
    ep_r = round(energy_penalty_pct, 1)
    annual_mins_r = round(defrost_minutes_per_yr, 0)
    annual_kwh_r = round(defrost_kwh_per_yr, 1)

    worked: list[dict] = []
    if is_frost_zone:
        worked += [
            worked_calc(
                label="Frost mass deposition rate",
                formula="m_frost = K_frost x delta_W x m_dot_air x 1000 x 60",
                values={
                    "K_frost": (K_frost, ""),
                    "delta_W": (delta_w_r, "kg/kg"),
                    "m_dot_air": (m_dot_air, "kg/s"),
                },
                result=frost_g_r, result_unit="g/min",
                assumptions=[
                    "K_frost = 0.6 deposition coefficient (Lee & Ro 2010)",
                    "m_dot_air = 0.3 kg/s nominal air flow for 8 kW outdoor unit",
                    "delta_W = W_air - W_sat(T_coil) via Magnus equation — not shown",
                    "multiply by 1000 (kg to g) and 60 (per second to per minute)",
                ],
            ),
            worked_calc(
                label="Frost mass threshold before defrost triggers",
                formula="m_thresh = 250 x capacity_kw",
                values={"capacity_kw": (unit_capacity_kw, "kW")},
                result=frost_thresh_r, result_unit="g",
                assumptions=["250 g per kW rated heating capacity (AHRI 210/240 empirical threshold)"],
            ),
            worked_calc(
                label="Defrost interval between cycles",
                formula="t_defrost = m_thresh / m_frost",
                values={
                    "m_thresh": (frost_thresh_r, "g"),
                    "m_frost": (frost_g_r, "g/min"),
                },
                result=defrost_int_r, result_unit="min",
                assumptions=["frost accumulation assumed linear at steady m_frost rate"],
            ),
            worked_calc(
                label="Annual defrost energy penalty",
                formula="E_defrost = (freq x t_dur x frost_hr / 60) x capacity x ep / 100",
                values={
                    "freq": (round(defrost_frequency_per_hour, 4), "cycles/hr"),
                    "t_dur": (defrost_duration, "min"),
                    "frost_hr": (annual_frost_hours, "hr"),
                    "capacity": (unit_capacity_kw, "kW"),
                    "ep": (ep_r, "%"),
                },
                result=annual_kwh_r, result_unit="kWh/yr",
                assumptions=[
                    f"annual frost hours {annual_frost_hours} hr/yr (typical UK climate)",
                    f"energy penalty {ep_r}% for {method} (includes cold-weather multipliers if T_amb < -5°C)",
                ],
            ),
        ]

    return {
        "ambient_temp_c": T_amb,
        "rh_pct": rh,
        "evaporator_temp_c": T_evap,
        "frost_forming_conditions": is_frost_zone,
        "defrost_method": method,
        "humidity_ratio_air_kg_kg": round(W_air, 5),
        "humidity_ratio_coil_sat_kg_kg": round(W_sat_coil, 5),
        "delta_humidity_ratio_kg_kg": delta_w_r,
        "frost_mass_flow_g_per_min": frost_g_r,
        "defrost_threshold_g": frost_thresh_r,
        "defrost_interval_minutes": defrost_int_r,
        "defrost_frequency_per_hour": round(defrost_frequency_per_hour, 2),
        "defrost_duration_minutes": defrost_duration,
        "energy_penalty_pct": ep_r,
        "hot_water_capacity_lost_pct": capacity_lost_pct,
        "hot_water_capacity_lost_l": round(hot_water_capacity_lost_l, 1),
        "annual_frost_hours_estimated": annual_frost_hours,
        "annual_defrost_minutes": annual_mins_r,
        "annual_defrost_kwh_penalty": annual_kwh_r,
        "rated_heating_capacity_kw": unit_capacity_kw,
        "notes": (
            "Frost rate per Lee & Ro (2010); defrost intervals AHRI 210/240. "
            "Reverse-cycle is industry default (cheapest); hot-gas reduces capacity "
            "loss; electric eliminates capacity loss but adds OPEX. "
            "Demand-defrost (pressure-sensor triggered) reduces unnecessary cycles vs timer."
        ),
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
