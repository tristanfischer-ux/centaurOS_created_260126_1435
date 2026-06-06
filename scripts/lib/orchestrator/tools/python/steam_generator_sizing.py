#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/steam_generator_sizing.py

process:steam-generator — FIRST-PRINCIPLES sizing of the waste-heat steam
generator that raises steam from the STRONGLY EXOTHERMIC Fischer-Tropsch (FT)
reactor. For an e-fuel (power-to-liquid) plant the FT reactor's heat REMOVAL is
the dominant thermal duty: CO2 hydrogenation to hydrocarbons releases roughly
165 kJ per mole of CO2 converted, and that heat is recovered as saturated steam
on the cooling side of a boiling heat exchanger / steam drum.

WHAT IT DOES
    Given the reactor exotherm (directly, OR from the CO2 conversion rate and the
    reaction enthalpy) it sizes the steam-raising system:

      Q       = exotherm duty [kW]
                - given directly, OR
                - from chemistry: Q = nCO2 x 1000 x |dH_rxn| / 3600
      steam   = Q / h_fg x 3600                       (saturated steam, kg/h)
      LMTD    = T_reactor - T_sat                     (isothermal boiling side)
      area    = Q x 1000 / (U x LMTD)                 (boiling HX, Q = U A dT)
      drum    = (steam/60 x 10) / rho_g               (~10-min vapour holdup)

    Saturated-steam properties (T_sat, h_fg, rho_g) are interpolated from a small
    embedded IAPWS-IF97 table (cited values, NO fabricated constants).

WHY:
    A power-to-liquid FT reactor with no SIZED steam generator leaves the plant's
    single largest thermal duty as an LLM guess. A sized steam generator (steam
    rate + heat-transfer area + drum volume) IS the BoM line item.

INPUT (JSON on stdin)
    {
      "exotherm_duty_kw": 600.0,           # FT reactor heat to remove [kW], OR:
      "co2_converted_kmol_h": 13.1,        # CO2 converted [kmol/h] (drives Q)
      "dh_rxn_kj_mol": 165.0,              # |dH| per mol CO2 to -CH2- (default 165)
      "steam_pressure_bar": 20.0,          # raised-steam pressure (default 20)
      "feedwater_t_k": 378.0,              # boiler feedwater temp [K] (default 378)
      "reactor_t_k": 573.0,               # FT reactor (hot side) temp [K] (default 573)
      "u_w_m2k": 500.0                     # overall U, boiling HX [W/m2K] (default 500)
    }

OUTPUT (JSON on stdout)
    exotherm duty, steam raised, T_sat, h_fg, heat-transfer area, LMTD, drum
    volume, a worked[] array (each line hand-checkable) and a _provenance block.

LICENCE: tool wrapper internal. Correlations cited inline (energy balance;
boiling-HX Q = U A dT; IAPWS-IF97 saturated-steam table) — NO fabricated
constants.
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

PROVENANCE = {
    "tool_name": "steam_generator_sizing (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Energy balance + boiling heat-exchanger duty Q = U x A x dT "
        "(Coulson & Richardson 'Chemical Engineering' Vol 6 / Sinnott, ch.12); "
        "saturated-steam properties from IAPWS-IF97 (cited table values); "
        "Fischer-Tropsch / CO2-hydrogenation reaction enthalpy ~ -165 kJ/mol CO2 "
        "to -CH2- (literature, e.g. Dry, 'The Fischer-Tropsch process', Catal. "
        "Today 2002; CO2 + 3H2 -> -CH2- + 2H2O)."
    ),
    "physics_basis": (
        "FT reactor heat removal recovered as saturated steam. Duty Q from the "
        "brief OR from chemistry Q = nCO2 x |dH_rxn| (nCO2 in mol/s = kmol/h x "
        "1000 / 3600). Steam mass rate = Q / h_fg (latent heat of vaporisation at "
        "the steam pressure). Boiling side isothermal, so LMTD = T_reactor - "
        "T_sat (a single temperature difference); heat-transfer area A = Q / (U x "
        "LMTD) from Q = U x A x dT. Steam-drum volume from ~10 min of vapour "
        "holdup divided by the saturated-vapour density. Saturated-steam T_sat, "
        "h_fg and rho_g interpolated from an embedded IAPWS-IF97 table."
    ),
    "confidence_class": "engineering_correlation",
    "last_reviewed_date": "2026-06-05",
}

# Saturated-steam properties vs pressure [bar] -> (T_sat [K], h_fg [kJ/kg],
# rho_g [kg/m3]). IAPWS-IF97 approximate saturation values (cited); linear
# interpolation between table points. NO fabricated constants.
STEAM_TABLE = [
    # P_bar, Tsat_K, hfg_kJ_kg, rho_g_kg_m3
    (10.0, 453.0, 2015.0, 5.15),
    (20.0, 485.5, 1890.0, 10.0),
    (30.0, 507.0, 1795.0, 15.0),
    (40.0, 523.5, 1714.0, 20.1),
]


def _interp_steam(p_bar: float) -> tuple[float, float, float, str]:
    """Linear-interpolate (T_sat_K, h_fg_kJ_kg, rho_g_kg_m3) at p_bar from the
    embedded IAPWS-IF97 table. Clamps to the table ends (with a basis note)."""
    pts = STEAM_TABLE
    p_lo, p_hi = pts[0][0], pts[-1][0]
    if p_bar <= p_lo:
        _, tsat, hfg, rho = pts[0]
        return tsat, hfg, rho, f"clamped to table minimum {p_lo} bar"
    if p_bar >= p_hi:
        _, tsat, hfg, rho = pts[-1]
        return tsat, hfg, rho, f"clamped to table maximum {p_hi} bar"
    for (p0, t0, h0, r0), (p1, t1, h1, r1) in zip(pts, pts[1:]):
        if p0 <= p_bar <= p1:
            f = (p_bar - p0) / (p1 - p0)
            tsat = t0 + f * (t1 - t0)
            hfg = h0 + f * (h1 - h0)
            rho = r0 + f * (r1 - r0)
            return tsat, hfg, rho, f"interpolated between {p0} and {p1} bar"
    # Unreachable given the clamps above; safe fallback.
    _, tsat, hfg, rho = pts[-1]
    return tsat, hfg, rho, "table endpoint"


def compute(payload: dict) -> dict:
    warnings: list[str] = []

    # ---- Exotherm duty Q [kW]: given, OR from CO2 conversion x reaction enthalpy ----
    dh_rxn_kj_mol = float(payload.get("dh_rxn_kj_mol", 165.0))
    if dh_rxn_kj_mol <= 0:
        raise ValueError("dh_rxn_kj_mol must be > 0 (use the magnitude |dH_rxn|)")

    duty_source: str
    co2_kmol_h = payload.get("co2_converted_kmol_h")
    if payload.get("exotherm_duty_kw") is not None:
        q_kw = float(payload["exotherm_duty_kw"])
        duty_source = "exotherm duty given directly"
        co2_used = float(co2_kmol_h) if co2_kmol_h is not None else None
    elif co2_kmol_h is not None:
        co2_used = float(co2_kmol_h)
        if co2_used <= 0:
            raise ValueError("co2_converted_kmol_h must be > 0")
        # nCO2 [mol/s] = kmol/h x 1000 / 3600 ; Q [kW] = nCO2 x dH [kJ/mol]
        q_kw = co2_used * 1000.0 * dh_rxn_kj_mol / 3600.0
        duty_source = "Q = nCO2 x |dH_rxn| (from CO2 conversion rate)"
    else:
        raise ValueError("provide exotherm_duty_kw OR co2_converted_kmol_h")
    if q_kw <= 0:
        raise ValueError("exotherm duty resolves to <= 0 kW")

    # ---- Saturated-steam properties at the raised-steam pressure ----
    steam_p_bar = float(payload.get("steam_pressure_bar", 20.0))
    if steam_p_bar <= 0:
        raise ValueError("steam_pressure_bar must be > 0")
    tsat_k, h_fg_kj_kg, rho_g_kg_m3, steam_basis = _interp_steam(steam_p_bar)
    tsat_c = tsat_k - 273.15

    feedwater_t_k = float(payload.get("feedwater_t_k", 378.0))
    if feedwater_t_k >= tsat_k:
        warnings.append(
            f"feedwater_t_k {feedwater_t_k} K >= T_sat {round(tsat_k, 1)} K; "
            "sensible pre-heat duty is ignored (latent-heat basis only)"
        )

    # ---- Steam mass rate from the latent-heat balance ----
    # steam [kg/h] = Q [kW] / h_fg [kJ/kg] x 3600 ; (kW = kJ/s, so kJ/s / kJ/kg = kg/s)
    steam_kg_h = q_kw / h_fg_kj_kg * 3600.0

    # ---- LMTD (isothermal boiling side) + heat-transfer area ----
    reactor_t_k = float(payload.get("reactor_t_k", 573.0))
    lmtd_k = reactor_t_k - tsat_k
    if lmtd_k <= 0:
        warnings.append(
            f"reactor_t_k {reactor_t_k} K <= T_sat {round(tsat_k, 1)} K — no "
            "driving temperature difference; LMTD floored at 10 K (review the "
            "reactor temperature or lower the steam pressure)"
        )
        lmtd_k = 10.0
    u_w_m2k = float(payload.get("u_w_m2k", 500.0))
    if u_w_m2k <= 0:
        raise ValueError("u_w_m2k must be > 0")
    # Q = U A dT -> A = Q[W] / (U[W/m2K] x dT[K]) ; Q[W] = q_kw x 1000
    area_m2 = q_kw * 1000.0 / (u_w_m2k * lmtd_k)

    # ---- Steam-drum volume (~10-min vapour holdup) ----
    # 10-min vapour mass = steam[kg/h]/60 x 10 ; volume = mass / rho_g
    drum_volume_m3 = (steam_kg_h / 60.0 * 10.0) / rho_g_kg_m3

    # ===================== worked[] — chained off rounded intermediates ==============
    q_kw_r = round(q_kw, 3)
    steam_kg_h_r = round(steam_kg_h, 2)
    tsat_c_r = round(tsat_c, 2)
    h_fg_r = round(h_fg_kj_kg, 1)
    lmtd_k_r = round(lmtd_k, 3)
    area_m2_r = round(area_m2, 3)
    drum_r = round(drum_volume_m3, 4)

    worked = []
    if payload.get("exotherm_duty_kw") is None and co2_used is not None:
        worked.append(worked_calc(
            label="Exotherm duty from CO2 conversion",
            formula="Q = nCO2 x 1000 x dH / 3600",
            values={"nCO2": (co2_used, "kmol/h"), "dH": (dh_rxn_kj_mol, "kJ/mol")},
            result=q_kw_r, result_unit="kW",
            assumptions=[
                "CO2 hydrogenation to -CH2- releases ~165 kJ/mol CO2 (literature)",
                "nCO2 [mol/s] = kmol/h x 1000 / 3600; Q [kW] = nCO2 x dH [kJ/mol]",
            ],
        ))
    worked.append(worked_calc(
        label="Saturated steam raised (latent-heat balance)",
        formula="steam = Q / h_fg x 3600",
        values={"Q": (q_kw_r, "kW"), "h_fg": (h_fg_r, "kJ/kg")},
        result=steam_kg_h_r, result_unit="kg/h",
        assumptions=[
            f"h_fg at {steam_p_bar} bar from IAPWS-IF97 table ({steam_basis})",
            "kW = kJ/s, so (kJ/s)/(kJ/kg) = kg/s; x3600 -> kg/h",
            "latent-heat basis (feedwater sensible pre-heat excluded)",
        ],
    ))
    worked.append(worked_calc(
        label="Log-mean temperature difference (isothermal boiling)",
        formula="LMTD = T_reactor - T_sat",
        values={"T_reactor": (round(reactor_t_k, 2), "K"), "T_sat": (round(tsat_k, 2), "K")},
        result=lmtd_k_r, result_unit="K",
        assumptions=[
            "boiling side isothermal at T_sat, so LMTD reduces to a single dT",
            f"steam saturation T_sat = {round(tsat_k, 2)} K ({tsat_c_r} degC)",
        ],
    ))
    worked.append(worked_calc(
        label="Boiler heat-transfer area",
        formula="A = Q x 1000 / (U x LMTD)",
        values={"Q": (q_kw_r, "kW"), "U": (u_w_m2k, "W/m2K"), "LMTD": (lmtd_k_r, "K")},
        result=area_m2_r, result_unit="m2",
        assumptions=[
            "boiling heat exchanger, Q = U x A x dT (Coulson & Richardson Vol 6)",
            "Q x 1000 converts kW -> W to match U in W/m2K",
        ],
    ))
    worked.append(worked_calc(
        label="Steam-drum volume (10-min vapour holdup)",
        formula="V_drum = (steam / 60 x 10) / rho_g",
        values={"steam": (steam_kg_h_r, "kg/h"), "rho_g": (rho_g_kg_m3, "kg/m3")},
        result=drum_r, result_unit="m3",
        assumptions=[
            "~10-minute saturated-vapour holdup for level control / disengagement",
            f"saturated-vapour density rho_g at {steam_p_bar} bar from IAPWS-IF97 table",
        ],
    ))

    return {
        "exotherm_duty_kw": round(q_kw, 3),
        "exotherm_duty_basis": duty_source,
        "co2_converted_kmol_h": co2_used,
        "dh_rxn_kj_mol": dh_rxn_kj_mol,
        "steam_raised_kg_h": round(steam_kg_h, 2),
        "steam_pressure_bar": steam_p_bar,
        "steam_tsat_c": round(tsat_c, 2),
        "h_fg_kj_kg": round(h_fg_kj_kg, 1),
        "steam_property_basis": steam_basis,
        "reactor_t_k": reactor_t_k,
        "feedwater_t_k": feedwater_t_k,
        "lmtd_k": round(lmtd_k, 3),
        "u_w_m2k": u_w_m2k,
        "heat_transfer_area_m2": round(area_m2, 3),
        "drum_volume_m3": round(drum_volume_m3, 4),
        "warnings": warnings,
        "worked": worked,
        "data_sources": [
            "IAPWS-IF97 — saturated-steam properties (T_sat, h_fg, rho_g) vs pressure",
            "Coulson & Richardson 'Chemical Engineering' Vol 6 (Sinnott) ch.12 — heat-exchanger Q = U A dT",
            "Dry, 'The Fischer-Tropsch process', Catalysis Today 71 (2002) — FT/CO2-hydrogenation reaction enthalpy",
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
