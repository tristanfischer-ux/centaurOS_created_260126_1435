#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/crystalliser_evaporator_sizing.py

crystalliser:evaporator-sizing — FIRST-PRINCIPLES duty + heat-transfer area +
vessel size for an evaporative crystalliser (e.g. forced-circulation / draft-tube
baffle unit recovering a dissolved salt).

WHAT IT DOES
    Given a solute mass rate to recover, the feed solute concentration, the
    target recovery and the solubility at operating temperature, it computes how
    much WATER must be boiled off to drive the liquor to saturation, then the
    thermal DUTY (via the latent heat of the solvent) and the steam-side heat-
    transfer AREA (via Q = U x A x dT). A simple agitated/forced-circulation
    vessel is sized from the magma volume + a vapour-disengagement L/D.

      solute_recovered = solute_in x recovery
      water_to_evaporate:  drive the remaining liquor to its saturation ratio
          (solubility = g solute / g water at T_op). Mass of water that must
          leave so the residual solute sits at saturation:
              water_final = solute_residual_in_liquor / solubility_g_g
              water_evaporated = water_in_feed - water_final
      duty_evap_kw = (water_evaporated_kg_s) x latent_heat_kj_kg
                     [+ sensible pre-heat feed->boiling, optional]
      area_m2 = duty_W / (U x dT_steam_to_boiling)

WHY (Plan C, docs/grounding-and-selfgrowth-plan.md section C item 5):
    CO2-mineralisation's k2so4_recovery sub-module crystallises K2SO4 from the
    spent liquor — a NOVEL sub-module with no catalogue part. The crystalliser
    DUTY + area + vessel ARE the BoM line. Previously LLM-guessed.

INPUT (JSON on stdin)
    {
      "crystalliser_name": "K2SO4 evaporative crystalliser",
      "solute_name": "K2SO4",                 # used for latent-heat note only (solvent boils)
      "solute_mass_rate_kg_h": 165.0,         # solute to RECOVER as crystal product (target)
      "feed_solute_concentration_g_l": 120.0, # solute in the incoming liquor (g/L)
      "feed_density_kg_m3": 1100.0,           # liquor density (to convert g/L<->mass fractions)
      "target_recovery": 0.90,                # fraction of incoming solute crystallised
      "solubility_g_per_100g_water": 12.0,    # solute solubility at operating T (g/100 g water)
      "operating_pressure_kpa": 30.0,         # evaporator vapour-space pressure (for boiling pt / latent heat)
      "feed_temp_c": 25.0,                    # to add sensible pre-heat (optional; 0 if equals boiling)
      "overall_htc_w_m2k": 1200.0,            # U for the steam-heated calandria (Perry table)
      "steam_temp_c": 130.0,                  # heating-steam saturation temperature
      "magma_residence_time_h": 2.0,          # crystal magma residence (sets vessel volume)
      "length_to_diameter": 2.0,
      "n_units": 1
    }

OUTPUT (JSON on stdout)
    Water evaporated, evaporator DUTY (kW), steam mass, heat-transfer AREA (m2),
    vessel D x H, plus a worked[] array and a _provenance block.

LICENCE: tool wrapper internal. Latent heat + boiling point from CoolProp
(water IAPWS-IF97); area correlation = Q = U A dT (Perry / Coulson & Richardson).
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

PROVENANCE = {
    "tool_name": "crystalliser_evaporator_sizing (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Perry's Chemical Engineers' Handbook 8th ed. ch.11 (evaporators) + ch.18 "
        "(crystallisation); Coulson & Richardson 'Chemical Engineering' Vol 2 ch.15 "
        "(crystallisation) / Vol 6 (Sinnott, evaporator heat-transfer)."
    ),
    "physics_basis": (
        "Evaporation load from a water mass balance driving the residual liquor to its "
        "saturation ratio (solubility). Thermal duty Q = m_water x h_fg, with the latent "
        "heat of vaporisation h_fg of water at the vapour-space pressure from CoolProp "
        "(IAPWS-IF97). Heat-transfer area from Q = U x A x dT (steam-to-boiling), the "
        "overall coefficient U supplied (Perry Table 11-x typical 1000-2500 W/m2K for "
        "forced-circulation evaporators). Vessel volume from magma residence time x "
        "magma volumetric rate; diameter from a vapour-disengagement L/D."
    ),
    "confidence_class": "standard",
    "last_reviewed_date": "2026-06-04",
}


def _water_latent_heat_and_tsat(p_pa: float) -> tuple[float, float, str]:
    """Return (h_fg J/kg, T_sat degC, source) for water at pressure p_pa via CoolProp.
    Falls back to a cited constant if CoolProp is unavailable."""
    try:
        from CoolProp.CoolProp import PropsSI
        t_sat = PropsSI("T", "P", p_pa, "Q", 0, "Water")           # saturation temp [K]
        h_liq = PropsSI("H", "P", p_pa, "Q", 0, "Water")
        h_vap = PropsSI("H", "P", p_pa, "Q", 1, "Water")
        h_fg = h_vap - h_liq                                        # latent heat [J/kg]
        return float(h_fg), float(t_sat) - 273.15, "CoolProp IAPWS-IF97 (Water, h_vap - h_liq at P)"
    except Exception:
        # Cited fallback: water h_fg ~ 2257 kJ/kg at 100 degC (Perry / steam tables).
        return 2.257e6, 99.6, "fallback constant 2257 kJ/kg at ~1 atm (Perry steam tables)"


def compute(payload: dict) -> dict:
    name = str(payload.get("crystalliser_name", "evaporative crystalliser"))
    solute_name = str(payload.get("solute_name", "solute"))
    n_units = max(1, int(payload.get("n_units", 1)))

    solute_recover_kg_h = float(payload.get("solute_mass_rate_kg_h", 0.0))
    recovery = float(payload.get("target_recovery", 0.9))
    if not 0.0 < recovery <= 1.0:
        raise ValueError("target_recovery must be in (0,1]")
    if solute_recover_kg_h <= 0:
        raise ValueError("solute_mass_rate_kg_h must be > 0 (the crystal product rate)")

    # The product rate is the RECOVERED solute; back out the solute entering the liquor.
    solute_in_kg_h = solute_recover_kg_h / recovery
    solute_residual_kg_h = solute_in_kg_h - solute_recover_kg_h        # stays in mother liquor

    # ---- Feed water mass balance from concentration (g/L) + density ----
    conc_g_l = float(payload.get("feed_solute_concentration_g_l", 0.0))
    feed_density = float(payload.get("feed_density_kg_m3", 1100.0))
    if conc_g_l <= 0:
        raise ValueError("feed_solute_concentration_g_l must be > 0")
    # Feed liquor volumetric rate that carries solute_in:  solute_in / conc.
    feed_volume_m3_h = (solute_in_kg_h * 1000.0) / conc_g_l / 1000.0   # (g/h)/(g/L) = L/h -> m3/h
    feed_mass_kg_h = feed_volume_m3_h * feed_density
    water_in_feed_kg_h = feed_mass_kg_h - solute_in_kg_h
    if water_in_feed_kg_h <= 0:
        raise ValueError("feed water resolves <= 0 — check concentration vs density")

    # ---- Water that must evaporate so the RESIDUAL solute sits at saturation ----
    solubility_g_100g = float(payload.get("solubility_g_per_100g_water", 12.0))
    if solubility_g_100g <= 0:
        raise ValueError("solubility_g_per_100g_water must be > 0")
    solubility_g_g = solubility_g_100g / 100.0                         # g solute / g water at saturation
    water_final_kg_h = solute_residual_kg_h / solubility_g_g           # water retained holding residual at sat.
    water_evaporated_kg_h = water_in_feed_kg_h - water_final_kg_h
    if water_evaporated_kg_h <= 0:
        raise ValueError("no water needs evaporating — feed already at/over saturation for this recovery")

    # ---- Latent heat + boiling point at vapour-space pressure ----
    p_kpa = float(payload.get("operating_pressure_kpa", 101.325))
    p_pa = p_kpa * 1000.0
    h_fg_j_kg, t_boil_c, h_fg_source = _water_latent_heat_and_tsat(p_pa)
    h_fg_kj_kg = h_fg_j_kg / 1000.0

    # ---- Sensible pre-heat (feed -> boiling), optional ----
    cp_water_kj_kgk = 4.18
    feed_temp_c = float(payload.get("feed_temp_c", t_boil_c))
    dt_sensible = max(0.0, t_boil_c - feed_temp_c)
    duty_sensible_kw = feed_mass_kg_h / 3600.0 * cp_water_kj_kgk * dt_sensible

    # ---- Evaporation duty ----
    water_evap_kg_s = water_evaporated_kg_h / 3600.0
    duty_evap_kw = water_evap_kg_s * h_fg_kj_kg
    duty_total_kw = duty_evap_kw + duty_sensible_kw

    # ---- Heat-transfer area:  Q = U A dT ----
    u_w_m2k = float(payload.get("overall_htc_w_m2k", 1200.0))
    if u_w_m2k <= 0:
        raise ValueError("overall_htc_w_m2k must be > 0")
    steam_temp_c = float(payload.get("steam_temp_c", 130.0))
    dt_drive = steam_temp_c - t_boil_c
    if dt_drive <= 0:
        raise ValueError("steam_temp_c must exceed the boiling temperature for positive driving dT")
    area_m2 = (duty_total_kw * 1000.0) / (u_w_m2k * dt_drive)          # W / (W/m2K x K) = m2

    # Heating steam consumption (latent heat at steam temp)
    steam_p_pa = _saturation_pressure_water(steam_temp_c)
    h_fg_steam_j_kg, _, _ = _water_latent_heat_and_tsat(steam_p_pa)
    steam_kg_h = (duty_total_kw * 1000.0) / (h_fg_steam_j_kg) * 3600.0

    # ---- Vessel size from magma residence ----
    magma_tau_h = float(payload.get("magma_residence_time_h", 2.0))
    # Magma volume ~ residual liquor + crystals; approximate by the mother-liquor + product volume.
    magma_density = float(payload.get("magma_density_kg_m3", feed_density))
    magma_mass_kg_h = water_final_kg_h + solute_in_kg_h               # liquor + total solute in vessel
    magma_vol_m3_h = magma_mass_kg_h / magma_density
    v_vessel_m3 = magma_vol_m3_h * magma_tau_h / n_units
    l_to_d = float(payload.get("length_to_diameter", 2.0))
    diameter_m = (4.0 * v_vessel_m3 / (math.pi * l_to_d)) ** (1.0 / 3.0)
    height_m = l_to_d * diameter_m

    # ===================== worked[] =====================
    solute_in_r = round(solute_in_kg_h, 3)
    water_in_r = round(water_in_feed_kg_h, 3)
    water_final_r = round(water_final_kg_h, 3)
    water_evap_r = round(water_evaporated_kg_h, 3)
    h_fg_kj_kg_r = round(h_fg_kj_kg, 2)
    duty_evap_r = round(duty_evap_kw, 3)
    duty_total_r = round(duty_total_kw, 3)
    area_r = round(area_m2, 3)
    v_vessel_r = round(v_vessel_m3, 4)
    diameter_m_r = round(diameter_m, 4)

    worked = [
        worked_calc(
            label="Solute entering the liquor (back-out from recovery)",
            formula="solute_in = solute_product / recovery",
            values={"solute_product": (round(solute_recover_kg_h, 3), "kg/h"),
                    "recovery": (recovery, "")},
            result=solute_in_r, result_unit="kg/h",
            assumptions=[f"{round(recovery*100,1)}% of incoming {solute_name} reports to crystal product"],
        ),
        worked_calc(
            label="Water in the feed liquor",
            formula="water_in = feed_mass - solute_in",
            values={"feed_mass": (round(feed_mass_kg_h, 3), "kg/h"),
                    "solute_in": (solute_in_r, "kg/h")},
            result=water_in_r, result_unit="kg/h",
            assumptions=[f"feed {round(feed_volume_m3_h,4)} m3/h at {conc_g_l} g/L, rho {feed_density} kg/m3"],
        ),
        worked_calc(
            label="Water retained to hold residual solute at saturation",
            formula="water_final = solute_residual / solubility_g_g",
            values={"solute_residual": (round(solute_residual_kg_h, 3), "kg/h"),
                    "solubility_g_g": (round(solubility_g_g, 5), "g/g")},
            result=water_final_r, result_unit="kg/h",
            assumptions=[f"solubility {solubility_g_100g} g/100 g water at the operating temperature"],
        ),
        worked_calc(
            label="Water to evaporate",
            formula="water_evap = water_in - water_final",
            values={"water_in": (water_in_r, "kg/h"), "water_final": (water_final_r, "kg/h")},
            result=water_evap_r, result_unit="kg/h",
            assumptions=["drives the mother liquor to saturation so the recovered solute crystallises"],
        ),
        worked_calc(
            label="Evaporation duty",
            formula="duty_evap = (water_evap / 3600) x h_fg",
            values={"water_evap": (water_evap_r, "kg/h"), "h_fg": (h_fg_kj_kg_r, "kJ/kg")},
            result=duty_evap_r, result_unit="kW",
            assumptions=[f"latent heat of water at {round(p_kpa,1)} kPa: {h_fg_source}",
                         f"boiling point {round(t_boil_c,2)} degC at that pressure",
                         "/3600 converts kg/h to kg/s so kg/s x kJ/kg = kW"],
        ),
    ]
    if duty_sensible_kw > 1e-6:
        worked.append(worked_calc(
            label="Sensible pre-heat duty (feed to boiling)",
            formula="duty_sens = (feed_mass / 3600) x cp x (t_boil - t_feed)",
            values={"feed_mass": (round(feed_mass_kg_h, 3), "kg/h"), "cp": (cp_water_kj_kgk, "kJ/kgK"),
                    "t_boil": (round(t_boil_c, 2), "C"), "t_feed": (feed_temp_c, "C")},
            result=round(duty_sensible_kw, 3), result_unit="kW",
            assumptions=["water cp ~ 4.18 kJ/kgK; raises the feed to the boiling temperature"],
        ))
        worked.append(worked_calc(
            label="Total crystalliser duty",
            formula="duty_total = duty_evap + duty_sens",
            values={"duty_evap": (duty_evap_r, "kW"), "duty_sens": (round(duty_sensible_kw, 3), "kW")},
            result=duty_total_r, result_unit="kW",
            assumptions=[],
        ))
    worked.append(worked_calc(
        label="Steam-side heat-transfer area",
        formula="area = duty_total x 1000 / (U x dT)",
        values={"duty_total": (duty_total_r, "kW"), "U": (u_w_m2k, "W/m2K"),
                "dT": (round(dt_drive, 2), "K")},
        result=area_r, result_unit="m2",
        assumptions=[f"Q = U A dT; steam {steam_temp_c} degC to boiling {round(t_boil_c,2)} degC",
                     "U supplied (Perry: forced-circ. evaporators 1000-2500 W/m2K)",
                     "x1000 converts kW to W"],
    ))
    worked.append(worked_calc(
        label="Crystalliser body volume from magma residence",
        formula="V = (magma_mass / 3600 / rho_magma) x 3600 x tau / n_units",
        values={"magma_mass": (round(magma_mass_kg_h, 3), "kg/h"), "rho_magma": (round(magma_density, 1), "kg/m3"),
                "tau": (magma_tau_h, "h"), "n_units": (n_units, "")},
        result=v_vessel_r, result_unit="m3",
        assumptions=["magma (liquor + crystals) volumetric rate x residence time"],
    ))
    worked.append(worked_calc(
        label="Crystalliser body diameter from aspect ratio",
        formula="D = (4 x V / (pi x L_over_D))^(1/3)",
        values={"V": (v_vessel_r, "m3"), "L_over_D": (l_to_d, "")},
        result=diameter_m_r, result_unit="m",
        assumptions=["vertical cylinder with vapour-disengagement freeboard at the top"],
    ))

    return {
        "crystalliser_name": name,
        "solute_name": solute_name,
        "n_units": n_units,
        "solute_product_kg_h": round(solute_recover_kg_h, 3),
        "solute_in_liquor_kg_h": round(solute_in_kg_h, 3),
        "solute_residual_kg_h": round(solute_residual_kg_h, 3),
        "feed_volume_m3_h": round(feed_volume_m3_h, 4),
        "feed_mass_kg_h": round(feed_mass_kg_h, 3),
        "water_in_feed_kg_h": round(water_in_feed_kg_h, 3),
        "water_evaporated_kg_h": round(water_evaporated_kg_h, 3),
        "operating_pressure_kpa": round(p_kpa, 2),
        "boiling_point_c": round(t_boil_c, 2),
        "latent_heat_kj_kg": round(h_fg_kj_kg, 2),
        "duty_evaporation_kw": round(duty_evap_kw, 3),
        "duty_sensible_kw": round(duty_sensible_kw, 3),
        "duty_total_kw": round(duty_total_kw, 3),
        "overall_htc_w_m2k": u_w_m2k,
        "steam_temp_c": steam_temp_c,
        "driving_dt_k": round(dt_drive, 2),
        "heat_transfer_area_m2": round(area_m2, 3),
        "steam_consumption_kg_h": round(steam_kg_h, 2),
        "vessel_volume_m3": round(v_vessel_m3, 4),
        "vessel_diameter_m": round(diameter_m, 4),
        "vessel_height_m": round(height_m, 4),
        "length_to_diameter": l_to_d,
        "worked": worked,
        "data_sources": [
            "Latent heat + boiling point: CoolProp 7.2 (IAPWS-IF97 water), github.com/CoolProp/CoolProp",
            "Evaporator area Q = U A dT + U ranges: Perry's Chemical Engineers' Handbook 8th ed. ch.11",
            "Crystallisation magma sizing: Coulson & Richardson 'Chemical Engineering' Vol 2 ch.15",
        ],
    }


def _saturation_pressure_water(temp_c: float) -> float:
    """Water saturation pressure [Pa] at temp_c via CoolProp; Antoine fallback."""
    try:
        from CoolProp.CoolProp import PropsSI
        return float(PropsSI("P", "T", temp_c + 273.15, "Q", 0, "Water"))
    except Exception:
        # Antoine (NIST), valid ~1-100 degC, P in bar: log10(P) = A - B/(C+T)
        a, b, c = 5.40221, 1838.675, -31.737
        p_bar = 10 ** (a - b / (c + (temp_c + 273.15)))
        return p_bar * 1e5


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
