#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/dehumidification_calc.py

Dehumidifier sizing from a moisture (transpiration / evaporation) load.
Stdin JSON -> stdout JSON.

Input:
    {
      "moisture_load_kg_h": 200.0,
      "indoor_db_c": 22.0,
      "indoor_rh_target_pct": 65.0,
      "outdoor_db_c": 28.0,
      "outdoor_rh_pct": 80.0,
      "dehumidifier_type": "refrigeration"   # or "desiccant"
    }

Output:
    {
      "moisture_removal_required_kg_h": 200.0,
      "dehumidifier_capacity_l_day": 4800.0,
      "chiller_load_kw": 136.3,              # refrigeration path
      "regen_energy_kw": null,               # desiccant path only
      "airflow_min_cms": 5.6,
      "indoor_humidity_ratio_kg_kg": 0.0109,
      "outdoor_humidity_ratio_kg_kg": 0.0190,
      ...
    }

Method:
  - Compute humidity ratio at indoor target vs outdoor (Magnus-Tetens
    saturation, ASHRAE 2017 Ch 1).
  - Moisture removal rate L/day = kg/h × 24
  - Refrigeration latent load = m·h_fg (h_fg ≈ 2454 kJ/kg at 20°C)
  - Desiccant regen energy ≈ 1.5 × latent load (typical regeneration
    + lift-air heating, Munters / Bry-Air manufacturer data)
  - Minimum airflow from required moisture removal rate using W_indoor
    delta from supply (supply air W = saturation at coil temp ~5°C =
    0.0054 kg/kg)

Reference: ASHRAE Handbook of HVAC Applications 2019 Ch 23
(Dehumidification), Munters Application Engineering Guide, Bry-Air
Pharma Desiccant Sizing Spreadsheet 2018.

License: MIT.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'dehumidification_calc (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'ASHRAE Handbook of Applications 2019 chapter 23; Munters Dehumidification Handbook 3rd ed.',
    "physics_basis": 'Mass balance on water vapour. m_water = m_air × (ω_in - ω_out). Chiller load via psychrometrics.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


H_FG_WATER = 2454.0  # kJ/kg at 20°C latent heat of vaporisation
RHO_AIR = 1.20  # kg/m³


def saturation_pressure_pa(t_c: float) -> float:
    """Magnus-Tetens water saturation pressure (Pa)."""
    t = float(t_c)
    return 610.78 * math.exp((17.27 * t) / (t + 237.3))


def humidity_ratio(t_c: float, rh_pct: float, p_atm: float = 101325.0) -> float:
    """Humidity ratio W [kg water / kg dry air]."""
    p_ws = saturation_pressure_pa(t_c)
    p_w = p_ws * max(0.0, min(1.0, rh_pct / 100.0))
    return 0.622 * p_w / max(1.0, p_atm - p_w)


def compute(payload: dict) -> dict:
    m_h2o_kg_h = float(payload.get("moisture_load_kg_h", 0.0))
    indoor_db_c = float(payload.get("indoor_db_c", 22.0))
    rh_target = float(payload.get("indoor_rh_target_pct", 65.0))
    outdoor_db_c = float(payload.get("outdoor_db_c", 28.0))
    outdoor_rh = float(payload.get("outdoor_rh_pct", 80.0))
    dehum_type = str(payload.get("dehumidifier_type", "refrigeration")).strip().lower()

    # Humidity ratios
    W_indoor = humidity_ratio(indoor_db_c, rh_target)
    W_outdoor = humidity_ratio(outdoor_db_c, outdoor_rh)

    # Supply air W after cooling coil at 5°C (saturated, conservative)
    W_supply = humidity_ratio(5.0, 100.0)

    # Moisture removal rate (already the load — the dehumidifier removes
    # this from indoor air; ventilation air added would add to load if
    # >0). For VF this is transpiration; for HVAC infiltration this is
    # outdoor moisture ingress.
    moisture_kg_h = m_h2o_kg_h
    capacity_l_day = moisture_kg_h * 24.0  # 1 kg = 1 L water

    # Refrigeration latent load (kW): Q = m_dot × h_fg
    chiller_latent_kw = (moisture_kg_h / 3600.0) * H_FG_WATER

    # Desiccant regen: typical 1.5× latent for solid desiccant rotor
    # (Munters), 1.8× for liquid desiccant
    regen_factor = 1.5 if dehum_type == "desiccant" else 0.0
    regen_kw = chiller_latent_kw * regen_factor if dehum_type == "desiccant" else None

    # Minimum airflow: m_air × (W_indoor - W_supply) = m_h2o
    # Δ W typically 0.005-0.008 kg/kg in refrigeration dehumidifier
    delta_W = W_indoor - W_supply
    if delta_W > 0:
        m_air_kg_s = (moisture_kg_h / 3600.0) / delta_W
        airflow_min_cms = m_air_kg_s / RHO_AIR
    else:
        airflow_min_cms = 0.0

    # Sensible reheat needed (refrigeration path overshoots low temp)
    # Approx 0.4 × latent for typical 5°C coil + back to indoor target
    reheat_kw = chiller_latent_kw * 0.4 if dehum_type == "refrigeration" else 0.0

    # Worked calculations for the PDF appendix — built from the SAME live values
    # above (drift-safe). SKIPPED: humidity ratios W_indoor / W_outdoor / W_supply
    # (Magnus-Tetens saturation, transcendental exp — not a +-*/ expression); the
    # resulting delta_W value is used as a live input to the airflow line below.
    chiller_latent_r = round(chiller_latent_kw, 3)
    worked = [
        worked_calc(
            label="Moisture removal capacity",
            formula="capacity = moisture x 24",
            values={"moisture": (round(moisture_kg_h, 3), "kg/h")},
            result=round(capacity_l_day, 1), result_unit="L/day",
            assumptions=["1 kg water = 1 L"],
        ),
        worked_calc(
            label="Refrigeration latent load",
            formula="Q_latent = (moisture / 3600) x h_fg",
            values={"moisture": (round(moisture_kg_h, 3), "kg/h"), "h_fg": (H_FG_WATER, "kJ/kg")},
            result=chiller_latent_r, result_unit="kW",
            assumptions=["h_fg = latent heat of vaporisation at 20 C"],
        ),
    ]
    if delta_W > 0:
        # Express delta_W in g/kg (x1000) so the small divisor prints with full
        # precision; airflow = moisture/3600/delta_W/rho = moisture/(3.6 x dW_g x rho).
        delta_w_g_kg = delta_W * 1000.0
        worked.append(worked_calc(
            label="Minimum process airflow",
            formula="airflow = moisture / (3.6 x delta_W_g_kg x rho_air)",
            values={"moisture": (round(moisture_kg_h, 3), "kg/h"),
                    "delta_W_g_kg": (round(delta_w_g_kg, 3), "g/kg"), "rho_air": (RHO_AIR, "kg/m3")},
            result=round(airflow_min_cms, 4), result_unit="m3/s",
            assumptions=["supply air saturated at 5 C coil", "delta_W_g_kg = (W_indoor - W_supply) x 1000"],
        ))

    result = {
        "moisture_removal_required_kg_h": round(moisture_kg_h, 3),
        "dehumidifier_capacity_l_day": round(capacity_l_day, 1),
        "indoor_humidity_ratio_kg_kg": round(W_indoor, 6),
        "outdoor_humidity_ratio_kg_kg": round(W_outdoor, 6),
        "supply_air_humidity_ratio_kg_kg": round(W_supply, 6),
        "delta_w_kg_kg": round(delta_W, 6),
        "airflow_min_cms": round(airflow_min_cms, 4),
        "airflow_min_cmh": round(airflow_min_cms * 3600.0, 1),
        "indoor_db_c": indoor_db_c,
        "indoor_rh_target_pct": rh_target,
        "dehumidifier_type": dehum_type,
    }

    if dehum_type == "refrigeration":
        result["chiller_load_kw"] = round(chiller_latent_kw, 3)
        result["sensible_reheat_kw"] = round(reheat_kw, 3)
        result["regen_energy_kw"] = None
        result["total_electrical_load_kw"] = round(chiller_latent_kw / 3.5 + reheat_kw / 3.5, 3)
    elif dehum_type == "desiccant":
        result["regen_energy_kw"] = round(regen_kw, 3) if regen_kw is not None else None
        result["chiller_load_kw"] = None
        result["sensible_reheat_kw"] = 0.0
        # Desiccant total = regen heat + fan power (~25% of cooling equiv)
        result["total_electrical_load_kw"] = round(
            (regen_kw if regen_kw else 0.0) / 0.95 + chiller_latent_kw * 0.10, 3
        )

    result["worked"] = worked
    return result


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
