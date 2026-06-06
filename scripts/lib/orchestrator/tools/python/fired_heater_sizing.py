#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/fired_heater_sizing.py

process:fired-heater — FIRST-PRINCIPLES sizing of a FEED-PREHEAT + catalyst-
ACTIVATION startup heater on an e-fuel synthesis plant: process heat duty from a
sensible-heat (+ optional latent) energy balance, the fuel/electrical input duty
after burner/element efficiency, and (for a FIRED heater) the radiant-section
tube area from an average radiant heat flux.

IMPORTANT SCOPE — this is the FEED-PREHEAT heater that brings the CO2/H2 feed up
to reactor inlet temperature AND performs the iron Fischer-Tropsch catalyst's
reductive ACTIVATION/reduction soak at start-up. It is NOT the FT reactor's
thermal duty: the FT reaction is strongly EXOTHERMIC and that heat is REMOVED by
a separate steam-generator (boiler-feed-water) tool, not supplied by this heater.

WHAT IT DOES
    Q_process = (mdot/3600) * (Cp * dT + vaporise_frac * latent)        [kW]
    input_duty = Q_process / efficiency                                 [kW]
    fired:    radiant_area = Q_process * 0.6 / avg_radiant_flux         [m2]
    electric: heating_element = input_duty                              [kW]

WHY (e-fuel synthesis plant, OXCCU SAF / power-to-liquid):
    The feed-preheat / catalyst-activation heater is a real BoM line item with a
    real duty and (for fired) a real radiant tube area — previously LLM-guessed.

INPUT (JSON on stdin)
    {
      "mass_flow_kg_h": 1140.0,                # required
      "cp_kj_kgk": 2.2,                        # mean specific heat, default 2.2
      "t_in_k": 313.0, "t_out_k": 523.0,       # required inlet/outlet temperatures
      "vaporise_frac": 0.0,                    # fraction of stream vaporised, default 0
      "latent_kj_kg": 0.0,                     # latent heat of vaporisation, default 0
      "mode": "electric",                      # 'electric' | 'fired', default 'electric'
      "efficiency": 0.98,                      # default 0.98 electric / 0.88 fired
      "avg_radiant_flux_kw_m2": 30.0           # fired only, default 30
    }

OUTPUT (JSON on stdout)
    process_duty_kw, input_duty_kw, mode, efficiency_used, and EITHER
    radiant_area_m2 (fired) OR heating_element_kw (electric), plus a worked[]
    array (each line hand-checkable) and a _provenance block.

LICENCE: tool wrapper internal. Correlations cited inline (API 560 fired-heater
practice; first-law sensible-heat energy balance) — NO fabricated constants.
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

# Default fraction of process duty absorbed in the RADIANT section of a fired
# heater (the balance is recovered in the convection section). API 560 / fired-
# heater practice: radiant section typically absorbs ~55-65% of total absorbed
# duty; 0.6 is the standard first-pass split.
RADIANT_FRACTION = 0.6

PROVENANCE = {
    "tool_name": "fired_heater_sizing (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "API Standard 560 'Fired Heaters for General Refinery Service' "
        "(radiant heat-flux / tube-area practice); first-law sensible-heat energy "
        "balance Q = m_dot Cp dT (+ latent term)."
    ),
    "physics_basis": (
        "Process heat duty from a steady-flow first-law energy balance "
        "Q_process = (mdot/3600)(Cp dT + vaporise_frac * latent), dT = t_out - t_in. "
        "Input (fuel or electrical) duty = Q_process / efficiency (burner or element "
        "efficiency). For a FIRED heater the radiant-section tube area follows from "
        "the duty absorbed in the radiant section (RADIANT_FRACTION = 0.6 of process "
        "duty, API 560 practice) divided by the average radiant heat flux: "
        "A_radiant = Q_process * 0.6 / avg_radiant_flux. For an ELECTRIC heater the "
        "installed heating-element power equals the input duty. SCOPE: feed-preheat + "
        "catalyst-activation startup heater — NOT the FT reactor exotherm (removed by "
        "a separate steam-generator tool)."
    ),
    "confidence_class": "engineering_correlation",
    "last_reviewed_date": "2026-06-05",
}


def compute(payload: dict) -> dict:
    if payload.get("mass_flow_kg_h") is None:
        raise ValueError("mass_flow_kg_h is required")
    mass_flow_kg_h = float(payload["mass_flow_kg_h"])
    if mass_flow_kg_h <= 0:
        raise ValueError("mass_flow_kg_h must be > 0")

    if payload.get("t_in_k") is None or payload.get("t_out_k") is None:
        raise ValueError("t_in_k and t_out_k are required")
    t_in_k = float(payload["t_in_k"])
    t_out_k = float(payload["t_out_k"])
    if t_out_k <= t_in_k:
        raise ValueError("t_out_k must be greater than t_in_k (heating)")

    cp_kj_kgk = float(payload.get("cp_kj_kgk", 2.2))
    if cp_kj_kgk <= 0:
        raise ValueError("cp_kj_kgk must be > 0")
    vaporise_frac = float(payload.get("vaporise_frac", 0.0))
    if not 0.0 <= vaporise_frac <= 1.0:
        raise ValueError("vaporise_frac must be in [0, 1]")
    latent_kj_kg = float(payload.get("latent_kj_kg", 0.0))
    if latent_kj_kg < 0:
        raise ValueError("latent_kj_kg must be >= 0")

    mode = str(payload.get("mode", "electric")).strip().lower()
    if mode not in ("electric", "fired"):
        raise ValueError(f"mode must be 'electric' or 'fired', got {mode!r}")

    if payload.get("efficiency") is not None:
        efficiency = float(payload["efficiency"])
    else:
        efficiency = 0.98 if mode == "electric" else 0.88
    if not 0.0 < efficiency <= 1.0:
        raise ValueError("efficiency must be in (0, 1]")

    avg_radiant_flux_kw_m2 = float(payload.get("avg_radiant_flux_kw_m2", 30.0))
    if avg_radiant_flux_kw_m2 <= 0:
        raise ValueError("avg_radiant_flux_kw_m2 must be > 0")

    # ---- Process heat duty (sensible + optional latent) ----
    dt_k = t_out_k - t_in_k
    mdot_kg_s = mass_flow_kg_h / 3600.0
    sensible_kw = mdot_kg_s * cp_kj_kgk * dt_k          # kJ/s = kW (Cp in kJ/kg-K)
    latent_kw = mdot_kg_s * vaporise_frac * latent_kj_kg
    q_process_kw = sensible_kw + latent_kw

    # ---- Input duty after efficiency ----
    input_duty_kw = q_process_kw / efficiency

    # ---- Mode-specific output ----
    radiant_area_m2 = None
    heating_element_kw = None
    if mode == "fired":
        radiant_area_m2 = q_process_kw * RADIANT_FRACTION / avg_radiant_flux_kw_m2
    else:
        heating_element_kw = input_duty_kw

    # ===================== worked[] — chained off rounded intermediates =========
    dt_r = round(dt_k, 2)
    mdot_r = round(mdot_kg_s, 5)
    q_process_r = round(q_process_kw, 3)
    input_duty_r = round(input_duty_kw, 3)

    worked = []
    worked.append(worked_calc(
        label="Process heat duty (sensible + latent)",
        formula="Q_process = (mdot/3600) * (Cp * dT + vap_frac * latent)",
        values={"mdot/3600": (mdot_r, "kg/s"), "Cp": (cp_kj_kgk, "kJ/kg-K"),
                "dT": (dt_r, "K"), "vap_frac": (vaporise_frac, ""),
                "latent": (latent_kj_kg, "kJ/kg")},
        result=q_process_r, result_unit="kW",
        assumptions=["steady-flow first-law energy balance",
                     f"dT = t_out - t_in = {round(t_out_k,2)} - {round(t_in_k,2)} K",
                     "Cp in kJ/kg-K so kJ/s = kW directly",
                     "latent term zero unless a vaporised fraction is specified"],
    ))
    worked.append(worked_calc(
        label="Input (fuel/electrical) duty after efficiency",
        formula="Q_input = Q_process / efficiency",
        values={"Q_process": (q_process_r, "kW"), "efficiency": (efficiency, "")},
        result=input_duty_r, result_unit="kW",
        assumptions=[f"mode = {mode}",
                     "electric default 0.98 (element + losses); fired default 0.88 (burner)"],
    ))
    if mode == "fired":
        worked.append(worked_calc(
            label="Radiant-section tube area",
            formula="A_radiant = Q_process * radiant_frac / avg_radiant_flux",
            values={"Q_process": (q_process_r, "kW"),
                    "radiant_frac": (RADIANT_FRACTION, ""),
                    "avg_radiant_flux": (avg_radiant_flux_kw_m2, "kW/m2")},
            result=round(radiant_area_m2, 3), result_unit="m2",
            assumptions=["API 560: radiant section absorbs ~60% of process duty",
                         "balance recovered in the convection section",
                         "average radiant flux 25-40 kW/m2 typical for clean service"],
        ))
    else:
        worked.append(worked_calc(
            label="Installed heating-element power",
            formula="P_element = Q_input",
            values={"Q_input": (input_duty_r, "kW")},
            result=round(heating_element_kw, 3), result_unit="kW",
            assumptions=["electric resistance heater: installed element power = input duty"],
        ))

    out = {
        "process_duty_kw": round(q_process_kw, 3),
        "input_duty_kw": round(input_duty_kw, 3),
        "mode": mode,
        "efficiency_used": round(efficiency, 4),
        "delta_t_k": round(dt_k, 3),
        "mass_flow_kg_h": round(mass_flow_kg_h, 4),
        "worked": worked,
        "data_sources": [
            "API Standard 560 — Fired Heaters for General Refinery Service (radiant flux / tube area)",
            "First-law steady-flow energy balance Q = m_dot Cp dT (+ latent) — Smith/Van Ness 'Intro to Chemical Engineering Thermodynamics'",
        ],
    }
    if mode == "fired":
        out["radiant_area_m2"] = round(radiant_area_m2, 3)
    else:
        out["heating_element_kw"] = round(heating_element_kw, 3)
    return out


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
