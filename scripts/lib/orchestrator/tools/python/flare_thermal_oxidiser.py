#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/flare_thermal_oxidiser.py

flare:thermal-oxidiser — FIRST-PRINCIPLES sizing of the enclosed thermal
oxidiser / flare that safely destroys the combustible purge / off-gas stream of
an e-fuel (power-to-liquid) plant. The light-ends and unconverted syngas that
cannot be recycled are routed to a thermal oxidiser whose combustion chamber is
sized for a destruction temperature and residence time, with a stack sized for
an exit velocity.

WHAT IT DOES
    Given the combustible purge mass rate (and its lower heating value) it sizes
    the oxidiser:

      heat    = m_purge / 3600 x LHV x 1000              (heat release [kW])
      air     = m_purge x stoich_air x (1 + excess)      (combustion air [kg/h])
      flue    = m_purge + air                            (flue-gas [kg/h])
      rho_flue= (MW/1000) x P / (R x T)                  (flue density, ideal gas)
      Qv      = (flue / 3600) / rho_flue                 (flue volumetric [m3/s])
      V_chamber = Qv x residence                         (combustion chamber [m3])
      D_stack = sqrt(4 x Qv / (pi x v_exit))             (stack diameter [m])

WHY:
    A power-to-liquid plant's purge / off-gas must be destroyed safely; without a
    SIZED thermal oxidiser the chamber volume and stack diameter are LLM guesses.
    A sized oxidiser (heat release + air + chamber volume + stack diameter) IS the
    BoM line item, and the destruction temperature + residence time are the
    safety basis (carbon-monoxide / VOC destruction).

INPUT (JSON on stdin)
    {
      "purge_flow_kg_h": 150.0,            # combustible purge / off-gas [kg/h] (required)
      "lhv_mj_kg": 30.0,                   # lower heating value of purge [MJ/kg] (default 30)
      "stoich_air_kg_per_kg": 12.0,        # stoichiometric air / fuel mass ratio (default 12)
      "excess_air_frac": 0.2,              # excess-air fraction (default 0.2 = 20%)
      "comb_temp_c": 1000.0,               # combustion / destruction temp [degC] (default 1000)
      "residence_s": 1.0,                  # combustion-gas residence time [s] (default 1.0)
      "exit_velocity_ms": 15.0,            # stack exit velocity [m/s] (default 15)
      "flue_mw": 28.0                      # flue-gas mean molar mass [g/mol] (default 28)
    }

OUTPUT (JSON on stdout)
    heat release, combustion air, flue-gas rate, chamber volume, stack diameter,
    plus the safety basis (temperature + residence), a worked[] array (each line
    hand-checkable) and a _provenance block.

LICENCE: tool wrapper internal. Correlations cited inline (combustion
stoichiometry; ideal-gas density; continuity for the stack; API 521 / API 537 /
enclosed-thermal-oxidiser practice) — NO fabricated constants.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

# Universal gas constant [J/mol/K] and standard atmospheric pressure [Pa].
R_GAS_J_MOL_K = 8.314
P_ATM_PA = 101325.0

PROVENANCE = {
    "tool_name": "flare_thermal_oxidiser (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Combustion stoichiometry (air/fuel mass balance + excess air); flue-gas "
        "density from the ideal-gas law rho = (MW/1000) x P / (R x T); chamber "
        "volume from gas residence time; stack diameter from continuity "
        "Qv = A x v with A = pi/4 x D^2. Design practice: API STD 521 (pressure-"
        "relieving and depressuring / flare systems), API STD 537 (flare details), "
        "and enclosed thermal-oxidiser practice. 1000 degC + ~1.0 s residence are "
        "standard for carbon-monoxide / VOC destruction efficiency."
    ),
    "physics_basis": (
        "Combustible purge destroyed in an enclosed thermal oxidiser. Heat release "
        "= mass rate x lower heating value. Combustion air = fuel x stoichiometric "
        "air/fuel ratio x (1 + excess-air fraction). Flue-gas = fuel + air "
        "(mass conservation). Flue density from the ideal-gas law at the combustion "
        "temperature; flue volumetric flow = mass flow / density. Combustion-"
        "chamber volume = volumetric flow x required residence time (the "
        "destruction-efficiency basis). Stack diameter from continuity "
        "Qv = (pi/4) x D^2 x v_exit -> D = sqrt(4 Qv / (pi v_exit))."
    ),
    "confidence_class": "engineering_correlation",
    "last_reviewed_date": "2026-06-05",
}


def compute(payload: dict) -> dict:
    if payload.get("purge_flow_kg_h") is None:
        raise ValueError("purge_flow_kg_h is required")
    purge_kg_h = float(payload["purge_flow_kg_h"])
    if purge_kg_h <= 0:
        raise ValueError("purge_flow_kg_h must be > 0")

    lhv_mj_kg = float(payload.get("lhv_mj_kg", 30.0))
    if lhv_mj_kg <= 0:
        raise ValueError("lhv_mj_kg must be > 0")
    stoich_air = float(payload.get("stoich_air_kg_per_kg", 12.0))
    if stoich_air <= 0:
        raise ValueError("stoich_air_kg_per_kg must be > 0")
    excess_air = float(payload.get("excess_air_frac", 0.2))
    if excess_air < 0:
        raise ValueError("excess_air_frac must be >= 0")
    comb_temp_c = float(payload.get("comb_temp_c", 1000.0))
    comb_temp_k = comb_temp_c + 273.15
    if comb_temp_k <= 0:
        raise ValueError("comb_temp_c resolves to <= 0 K")
    residence_s = float(payload.get("residence_s", 1.0))
    if residence_s <= 0:
        raise ValueError("residence_s must be > 0")
    exit_velocity_ms = float(payload.get("exit_velocity_ms", 15.0))
    if exit_velocity_ms <= 0:
        raise ValueError("exit_velocity_ms must be > 0")
    flue_mw = float(payload.get("flue_mw", 28.0))
    if flue_mw <= 0:
        raise ValueError("flue_mw must be > 0")

    # ---- Heat release [kW] ----
    # m[kg/s] = kg/h / 3600 ; LHV[kJ/kg] = MJ/kg x 1000 ; Q[kW] = m[kg/s] x LHV[kJ/kg]
    heat_release_kw = purge_kg_h / 3600.0 * lhv_mj_kg * 1000.0

    # ---- Combustion air + flue gas [kg/h] (mass balance) ----
    combustion_air_kg_h = purge_kg_h * stoich_air * (1.0 + excess_air)
    flue_gas_kg_h = purge_kg_h + combustion_air_kg_h

    # ---- Flue-gas density (ideal gas) + volumetric flow ----
    # rho = (MW/1000)[kg/mol] x P[Pa] / (R[J/mol/K] x T[K])  -> kg/m3
    rho_flue = (flue_mw / 1000.0) * P_ATM_PA / (R_GAS_J_MOL_K * comb_temp_k)
    q_flue_m3s = (flue_gas_kg_h / 3600.0) / rho_flue

    # ---- Combustion chamber volume + stack diameter ----
    chamber_volume_m3 = q_flue_m3s * residence_s
    # Qv = (pi/4) D^2 v  ->  D = sqrt(4 Qv / (pi v))
    stack_diameter_m = math.sqrt(4.0 * q_flue_m3s / (math.pi * exit_velocity_ms))

    # ===================== worked[] — chained off rounded intermediates ==============
    heat_kw_r = round(heat_release_kw, 2)
    air_kg_h_r = round(combustion_air_kg_h, 2)
    flue_kg_h_r = round(flue_gas_kg_h, 2)
    rho_flue_r = round(rho_flue, 4)
    q_flue_r = round(q_flue_m3s, 4)
    chamber_r = round(chamber_volume_m3, 4)
    stack_d_r = round(stack_diameter_m, 4)

    worked = []
    worked.append(worked_calc(
        label="Heat release from purge combustion",
        formula="Q = m / 3600 x LHV x 1000",
        values={"m": (round(purge_kg_h, 3), "kg/h"), "LHV": (lhv_mj_kg, "MJ/kg")},
        result=heat_kw_r, result_unit="kW",
        assumptions=[
            "m[kg/s] = kg/h / 3600; LHV[kJ/kg] = MJ/kg x 1000; Q[kW] = m x LHV",
            "lower heating value basis (water leaves as vapour)",
        ],
    ))
    worked.append(worked_calc(
        label="Combustion air (stoichiometric + excess)",
        formula="air = m x stoich_air x (1 + excess)",
        values={"m": (round(purge_kg_h, 3), "kg/h"), "stoich_air": (stoich_air, "kg/kg"),
                "excess": (excess_air, "")},
        result=air_kg_h_r, result_unit="kg/h",
        assumptions=[
            "stoichiometric air/fuel mass ratio from fuel composition",
            f"{round(excess_air * 100, 1)}% excess air for complete combustion",
        ],
    ))
    worked.append(worked_calc(
        label="Flue-gas mass rate (mass conservation)",
        formula="flue = m + air",
        values={"m": (round(purge_kg_h, 3), "kg/h"), "air": (air_kg_h_r, "kg/h")},
        result=flue_kg_h_r, result_unit="kg/h",
        assumptions=["mass in = mass out (fuel + combustion air -> flue gas)"],
    ))
    worked.append(worked_calc(
        label="Flue-gas density at combustion temperature (ideal gas)",
        formula="rho = (MW / 1000) x P / (R x T)",
        values={"MW": (flue_mw, "g/mol"), "P": (P_ATM_PA, "Pa"),
                "R": (R_GAS_J_MOL_K, "J/mol/K"), "T": (round(comb_temp_k, 2), "K")},
        result=rho_flue_r, result_unit="kg/m3",
        assumptions=[
            "ideal-gas law at atmospheric pressure and the combustion temperature",
            f"combustion temperature {comb_temp_c} degC = {round(comb_temp_k, 2)} K",
        ],
    ))
    worked.append(worked_calc(
        label="Flue-gas volumetric flow",
        formula="Qv = (flue / 3600) / rho",
        values={"flue": (flue_kg_h_r, "kg/h"), "rho": (rho_flue_r, "kg/m3")},
        result=q_flue_r, result_unit="m3/s",
        assumptions=["mass flow / density at the combustion temperature"],
    ))
    worked.append(worked_calc(
        label="Combustion-chamber volume (residence time)",
        formula="V_chamber = Qv x residence",
        values={"Qv": (q_flue_r, "m3/s"), "residence": (residence_s, "s")},
        result=chamber_r, result_unit="m3",
        assumptions=[
            f"{residence_s} s residence at {comb_temp_c} degC for CO/VOC destruction",
            "API 521 / API 537 / enclosed thermal-oxidiser practice",
        ],
    ))
    worked.append(worked_calc(
        label="Stack diameter (continuity at exit velocity)",
        formula="D = sqrt(4 x Qv / (pi x v_exit))",
        values={"Qv": (q_flue_r, "m3/s"), "v_exit": (exit_velocity_ms, "m/s")},
        result=stack_d_r, result_unit="m",
        assumptions=[
            "Qv = (pi/4) x D^2 x v_exit (continuity for a circular stack)",
            f"exit velocity {exit_velocity_ms} m/s (flame stability / dispersion)",
        ],
    ))

    return {
        "purge_flow_kg_h": round(purge_kg_h, 3),
        "lhv_mj_kg": lhv_mj_kg,
        "heat_release_kw": round(heat_release_kw, 2),
        "stoich_air_kg_per_kg": stoich_air,
        "excess_air_frac": excess_air,
        "combustion_air_kg_h": round(combustion_air_kg_h, 2),
        "flue_gas_kg_h": round(flue_gas_kg_h, 2),
        "flue_mw": flue_mw,
        "flue_density_kg_m3": round(rho_flue, 4),
        "flue_volumetric_m3_s": round(q_flue_m3s, 4),
        "comb_temp_c": comb_temp_c,
        "residence_s": residence_s,
        "chamber_volume_m3": round(chamber_volume_m3, 4),
        "exit_velocity_ms": exit_velocity_ms,
        "stack_diameter_m": round(stack_diameter_m, 4),
        "worked": worked,
        "data_sources": [
            "API STD 521 — Pressure-relieving and Depressuring Systems (flare sizing)",
            "API STD 537 — Flare Details for Petroleum, Petrochemical, and Natural Gas Industries",
            "Combustion stoichiometry + ideal-gas law (standard thermodynamics)",
            "Enclosed thermal-oxidiser practice — 1000 degC, ~1 s residence for CO/VOC destruction",
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
    except Exception as exc:  # noqa: BLE001 — surface any failure as structured error
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
