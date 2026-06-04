#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/dryer_thermal_sizing.py

dryer:thermal-sizing — FIRST-PRINCIPLES sizing of a convective (hot-air) dryer:
the evaporative water load, the drying-AIR mass flow (from the humidity pick-up)
and the heat DUTY (from the air-enthalpy rise).

WHAT IT DOES
    Given the wet-solids rate, the inlet/outlet moisture content and the inlet/
    outlet drying-air conditions, it computes:

      water_evaporated = solids x (moisture balance, wet- or dry-basis)
      air_mass_flow = water_evaporated / (W_out - W_in)        [kg dry air / time]
          W = humidity ratio (kg water / kg dry air) from psychrolib at each state
      heat_duty = air_mass_flow x (h_air_in - h_ambient)       [enthalpy rise of the
          air heater] + evaporation sensible/latent already carried by the humid air

WHY (Plan C, docs/grounding-and-selfgrowth-plan.md section C item 6):
    CO2-mineralisation's CaCO3 dryer + K2SO4 dryer dry the washed crystal cakes —
    sized here from a humidity + enthalpy balance instead of LLM-guessed. The
    dryer (air flow + heater duty) IS the BoM line.

INPUT (JSON on stdin)
    {
      "dryer_name": "CaCO3 cake dryer",
      "wet_solids_kg_h": 200.0,               # wet feed cake mass rate
      "moisture_in_pct": 30.0,                # inlet moisture (see moisture_basis)
      "moisture_out_pct": 1.0,                # outlet (product) moisture
      "moisture_basis": "wet",                # "wet" (kg water/kg wet) | "dry" (kg water/kg dry solid)
      # --- drying air states (psychrolib) ---
      "ambient_air_temp_c": 20.0,             # ambient air drawn into the heater
      "ambient_air_rh_pct": 60.0,
      "inlet_air_temp_c": 120.0,              # heated drying air entering the dryer
      "outlet_air_temp_c": 60.0,              # exhaust air leaving the dryer
      "outlet_air_rh_pct": 60.0,              # exhaust RH (humidity the air picked up)
      "pressure_pa": 101325,
      "heater_efficiency": 0.85,              # heater + duct losses
      "n_units": 1
    }

OUTPUT (JSON on stdout)
    Water evaporated, dry-air mass flow, humid-air volumetric flow, heater DUTY,
    plus a worked[] array and a _provenance block.

LICENCE: tool wrapper internal. Psychrometric states from psychrolib
(ASHRAE 2017); mass/enthalpy balance = Perry's / Coulson & Richardson Vol 2 ch.16.
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

PROVENANCE = {
    "tool_name": "dryer_thermal_sizing (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Perry's Chemical Engineers' Handbook 8th ed. ch.12 (psychrometry) + "
        "Coulson & Richardson 'Chemical Engineering' Vol 2 ch.16 (drying); "
        "psychrometric properties from ASHRAE 2017 Handbook of Fundamentals."
    ),
    "physics_basis": (
        "Water-evaporation load from a solids moisture balance (wet- or dry-basis). "
        "Drying-air mass flow from the humidity pick-up: m_air = m_water / (W_out - W_in), "
        "with the humidity ratio W (kg water / kg dry air) of each air state from "
        "psychrolib (ASHRAE 2017 / Hyland-Wexler). Heater duty from the air-enthalpy "
        "rise across the heater: Q = m_air x (h_inlet - h_ambient), divided by heater "
        "efficiency. Humid-air volumetric flow from the moist-air specific volume."
    ),
    "confidence_class": "standard",
    "last_reviewed_date": "2026-06-04",
}


def _psy_state(dry_bulb_c: float, rh_pct: float, pressure_pa: float) -> dict:
    """Full moist-air state from dry-bulb + RH via psychrolib. Returns humidity ratio
    (kg/kg dry air), enthalpy (kJ/kg dry air), specific volume (m3/kg dry air)."""
    import psychrolib as psy
    psy.SetUnitSystem(psy.SI)
    rh = max(1e-4, min(1.0, rh_pct / 100.0))
    (hum_ratio, t_wb, t_dp, vap_pres, enth_j_kg, sp_vol, deg_sat) = (
        psy.CalcPsychrometricsFromRelHum(dry_bulb_c, rh, pressure_pa))
    return {
        "humidity_ratio_kg_kg": float(hum_ratio),
        "enthalpy_kj_kg": float(enth_j_kg) / 1000.0,
        "specific_volume_m3_kg": float(sp_vol),
        "dew_point_c": float(t_dp),
    }


def compute(payload: dict) -> dict:
    name = str(payload.get("dryer_name", "convective dryer"))
    n_units = max(1, int(payload.get("n_units", 1)))

    wet_solids_kg_h = float(payload.get("wet_solids_kg_h", 0.0))
    if wet_solids_kg_h <= 0:
        raise ValueError("wet_solids_kg_h must be > 0")
    m_in_pct = float(payload.get("moisture_in_pct", 30.0))
    m_out_pct = float(payload.get("moisture_out_pct", 1.0))
    basis = str(payload.get("moisture_basis", "wet")).strip().lower()
    if basis not in ("wet", "dry"):
        raise ValueError("moisture_basis must be 'wet' or 'dry'")
    if m_in_pct <= m_out_pct:
        raise ValueError("moisture_in_pct must exceed moisture_out_pct")

    # ---- Water-evaporation load from the solids moisture balance ----
    if basis == "wet":
        # wet basis X_w = water / (water + dry).  bone-dry solids are conserved.
        x_in = m_in_pct / 100.0
        x_out = m_out_pct / 100.0
        bone_dry_kg_h = wet_solids_kg_h * (1.0 - x_in)
        water_in_kg_h = wet_solids_kg_h - bone_dry_kg_h
        # product mass so that its wet-basis moisture is x_out: water_out/(water_out+dry)=x_out
        product_kg_h = bone_dry_kg_h / (1.0 - x_out)
        water_out_kg_h = product_kg_h - bone_dry_kg_h
    else:
        # dry basis X_d = water / dry.
        x_in = m_in_pct / 100.0
        x_out = m_out_pct / 100.0
        # wet feed = dry x (1 + X_in)  ->  dry = wet / (1 + X_in)
        bone_dry_kg_h = wet_solids_kg_h / (1.0 + x_in)
        water_in_kg_h = bone_dry_kg_h * x_in
        water_out_kg_h = bone_dry_kg_h * x_out
        product_kg_h = bone_dry_kg_h + water_out_kg_h
    water_evap_kg_h = water_in_kg_h - water_out_kg_h
    if water_evap_kg_h <= 0:
        raise ValueError("evaporation load resolves <= 0 — check moisture in/out + basis")

    # ---- Air states (psychrolib) ----
    pressure_pa = float(payload.get("pressure_pa", 101325))
    amb_t = float(payload.get("ambient_air_temp_c", 20.0))
    amb_rh = float(payload.get("ambient_air_rh_pct", 60.0))
    in_t = float(payload.get("inlet_air_temp_c", 120.0))
    out_t = float(payload.get("outlet_air_temp_c", 60.0))
    out_rh = float(payload.get("outlet_air_rh_pct", 60.0))

    try:
        amb = _psy_state(amb_t, amb_rh, pressure_pa)
        # Heated drying air: heating is sensible-only, so humidity ratio == ambient W.
        # Build the inlet state at the SAME humidity ratio as ambient (heater adds no water).
        import psychrolib as psy
        psy.SetUnitSystem(psy.SI)
        w_amb = amb["humidity_ratio_kg_kg"]
        h_in_j = psy.GetMoistAirEnthalpy(in_t, w_amb)
        v_in = psy.GetMoistAirVolume(in_t, w_amb, pressure_pa)
        inlet = {"humidity_ratio_kg_kg": w_amb, "enthalpy_kj_kg": h_in_j / 1000.0,
                 "specific_volume_m3_kg": v_in}
        outlet = _psy_state(out_t, out_rh, pressure_pa)
        psy_source = "psychrolib (ASHRAE 2017)"
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"psychrolib state evaluation failed: {exc}")

    w_in = inlet["humidity_ratio_kg_kg"]
    w_out = outlet["humidity_ratio_kg_kg"]
    dW = w_out - w_in
    if dW <= 0:
        raise ValueError("outlet air humidity ratio not above inlet — air cannot carry the evaporated water; "
                         "raise outlet RH/temperature spread")

    # ---- Dry-air mass flow from humidity pick-up ----
    air_dry_kg_h = water_evap_kg_h / dW
    air_dry_kg_s = air_dry_kg_h / 3600.0

    # ---- Heater duty from the air-enthalpy rise (ambient -> heated inlet) ----
    dh = inlet["enthalpy_kj_kg"] - amb["enthalpy_kj_kg"]      # kJ per kg dry air
    heater_eff = float(payload.get("heater_efficiency", 0.85))
    if not 0.3 <= heater_eff <= 1.0:
        raise ValueError("heater_efficiency must be in [0.3, 1.0]")
    duty_ideal_kw = air_dry_kg_s * dh
    duty_kw = duty_ideal_kw / heater_eff

    # ---- Humid-air volumetric flow at the heated inlet (fan/duct sizing) ----
    humid_vol_m3_s = air_dry_kg_s * inlet["specific_volume_m3_kg"]
    humid_vol_m3_h = humid_vol_m3_s * 3600.0

    # Per-unit split
    air_dry_kg_h_pu = air_dry_kg_h / n_units
    duty_kw_pu = duty_kw / n_units
    humid_vol_m3_h_pu = humid_vol_m3_h / n_units

    # ===================== worked[] =====================
    bone_dry_r = round(bone_dry_kg_h, 3)
    water_in_r = round(water_in_kg_h, 3)
    water_out_r = round(water_out_kg_h, 3)
    water_evap_r = round(water_evap_kg_h, 3)
    w_in_r = round(w_in, 6)
    w_out_r = round(w_out, 6)
    dW_r = round(dW, 6)
    air_dry_r = round(air_dry_kg_h, 2)
    dh_r = round(dh, 3)
    duty_kw_r = round(duty_kw, 3)
    humid_vol_r = round(humid_vol_m3_h, 2)

    worked = [
        worked_calc(
            label="Bone-dry solids (conserved)",
            formula=("dry = wet x (1 - X_in)" if basis == "wet" else "dry = wet / (1 + X_in)"),
            values={"wet": (round(wet_solids_kg_h, 3), "kg/h"),
                    "X_in": (round(x_in, 5), "")},
            result=bone_dry_r, result_unit="kg/h",
            assumptions=[f"{basis}-basis moisture; bone-dry solids pass through unchanged"],
        ),
        worked_calc(
            label="Water evaporated",
            formula="water_evap = water_in - water_out",
            values={"water_in": (water_in_r, "kg/h"), "water_out": (water_out_r, "kg/h")},
            result=water_evap_r, result_unit="kg/h",
            assumptions=[f"product {round(product_kg_h,3)} kg/h at {m_out_pct}% {basis}-basis moisture"],
        ),
        worked_calc(
            label="Inlet drying-air humidity ratio (heated ambient)",
            formula="W_in = W_ambient",
            values={"W_ambient": (round(w_amb, 6), "kg/kg")},
            result=w_in_r, result_unit="kg/kg",
            assumptions=[f"ambient {amb_t} degC / {amb_rh}% RH heated to {in_t} degC; "
                         "sensible heating adds no moisture", psy_source],
        ),
        worked_calc(
            label="Outlet (exhaust) air humidity ratio",
            formula="W_out = f(T_out, RH_out)",
            values={"T_out": (out_t, "C"), "RH_out": (out_rh, "%")},
            result=w_out_r, result_unit="kg/kg",
            assumptions=[f"exhaust {out_t} degC / {out_rh}% RH; psychrolib humidity ratio", psy_source],
        ),
        worked_calc(
            label="Dry-air mass flow from humidity pick-up",
            formula="m_air = water_evap / (W_out - W_in)",
            values={"water_evap": (water_evap_r, "kg/h"), "W_out": (w_out_r, "kg/kg"),
                    "W_in": (w_in_r, "kg/kg")},
            result=air_dry_r, result_unit="kg/h",
            assumptions=["dry-air basis; the air carries every kg of evaporated water as added humidity"],
        ),
        worked_calc(
            label="Air-enthalpy rise across the heater",
            formula="dh = h_inlet - h_ambient",
            values={"h_inlet": (round(inlet["enthalpy_kj_kg"], 3), "kJ/kg"),
                    "h_ambient": (round(amb["enthalpy_kj_kg"], 3), "kJ/kg")},
            result=dh_r, result_unit="kJ/kg",
            assumptions=["per kg dry air; moist-air enthalpy from psychrolib", psy_source],
        ),
        worked_calc(
            label="Heater duty",
            formula="duty = (m_air / 3600) x dh / heater_eff",
            values={"m_air": (air_dry_r, "kg/h"), "dh": (dh_r, "kJ/kg"),
                    "heater_eff": (heater_eff, "")},
            result=duty_kw_r, result_unit="kW",
            assumptions=[f"heater + duct efficiency {heater_eff}", "/3600 converts kg/h to kg/s; kg/s x kJ/kg = kW"],
        ),
        worked_calc(
            label="Humid-air volumetric flow at heater outlet",
            formula="Q_air = (m_air / 3600) x v_humid x 3600",
            values={"m_air": (air_dry_r, "kg/h"),
                    "v_humid": (round(inlet["specific_volume_m3_kg"], 4), "m3/kg")},
            result=humid_vol_r, result_unit="m3/h",
            assumptions=["moist-air specific volume at the heated inlet (fan/duct sizing)", psy_source],
        ),
    ]

    return {
        "dryer_name": name,
        "n_units": n_units,
        "moisture_basis": basis,
        "bone_dry_solids_kg_h": round(bone_dry_kg_h, 3),
        "product_kg_h": round(product_kg_h, 3),
        "water_in_kg_h": round(water_in_kg_h, 3),
        "water_out_kg_h": round(water_out_kg_h, 3),
        "water_evaporated_kg_h": round(water_evap_kg_h, 3),
        "ambient_humidity_ratio_kg_kg": round(amb["humidity_ratio_kg_kg"], 6),
        "inlet_humidity_ratio_kg_kg": round(w_in, 6),
        "outlet_humidity_ratio_kg_kg": round(w_out, 6),
        "humidity_pickup_kg_kg": round(dW, 6),
        "drying_air_mass_flow_kg_h": round(air_dry_kg_h, 2),
        "drying_air_mass_flow_kg_h_per_unit": round(air_dry_kg_h_pu, 2),
        "air_enthalpy_rise_kj_kg": round(dh, 3),
        "heater_efficiency": heater_eff,
        "heater_duty_kw": round(duty_kw, 3),
        "heater_duty_kw_per_unit": round(duty_kw_pu, 3),
        "humid_air_volumetric_flow_m3_h": round(humid_vol_m3_h, 2),
        "humid_air_volumetric_flow_m3_h_per_unit": round(humid_vol_m3_h_pu, 2),
        "inlet_air_temp_c": in_t,
        "outlet_air_temp_c": out_t,
        "worked": worked,
        "data_sources": [
            "Psychrometric air states (humidity ratio, enthalpy, specific volume): psychrolib 2.5 (ASHRAE 2017), github.com/psychrometrics/psychrolib",
            "Dryer mass + enthalpy balance: Coulson & Richardson 'Chemical Engineering' Vol 2 ch.16 (drying)",
            "Psychrometry: Perry's Chemical Engineers' Handbook 8th ed. ch.12",
        ],
    }


def main() -> int:
    t = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse: {exc}"}, sys.stdout)
        return 2
    try:
        out = compute(payload)
        out["_provenance"] = PROVENANCE
        out.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t, 3)
    except Exception as exc:  # noqa: BLE001
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
