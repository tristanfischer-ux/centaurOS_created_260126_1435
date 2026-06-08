#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/absorption_column_htu_ntu.py

absorption:column-htu-ntu — FIRST-PRINCIPLES sizing of a packed gas-liquid
absorber (or stripper): packed HEIGHT = HTU x NTU, and column DIAMETER from a
flooding/superficial-velocity criterion.

WHAT IT DOES
    Given the gas flow + its inlet/outlet solute (e.g. CO2) mole fraction, the
    solvent rate, the packing height-of-a-transfer-unit (HTU) and an operating
    fraction of flooding, it sizes the column:

      NTU  = number of transfer units. For a dilute absorber with a linear
             equilibrium line and constant absorption factor A = L / (m G):
                 NTU = ln[ ((y1 - m x2)/(y2 - m x2)) x (1 - 1/A) + 1/A ] / (1 - 1/A)
             (Colburn equation, Treybal 'Mass-Transfer Operations' Eq. 8.48).
             When A -> 1 the log form is singular -> NTU = (y1 - y2)/(y2 - m x2)
             (the operating-line == equilibrium-line limit).
      H    = HTU x NTU                                  (packed height)
      D    = sqrt( 4 x G_vol / (pi x u_superficial) )  with u = f_flood x u_flood
             u_flood from the Eckert generalised pressure-drop correlation
             (capacity factor C_s,flood from the packing factor Fp).

WHY (Plan C, docs/grounding-and-selfgrowth-plan.md section C item 3):
    CO2-mineralisation's absorber (the brief's ~100 mm ID, 1.6-8.2 m at 1 t/day
    CO2) + the stripper are sized here from first principles instead of LLM-guessed.
    The packed column IS the BoM line.

INPUT (JSON on stdin)
    {
      "column_name": "CO2 absorber",
      "mode": "absorber",                     # absorber | stripper (label + default packing)
      "gas_flow_kg_h": 2000.0,                # total inlet gas mass rate
      "gas_molar_mass_kg_kmol": 29.0,         # inlet gas MW (flue gas ~ 29-30)
      "gas_density_kg_m3": 1.1,               # inlet gas density at column conditions
      "y_in_mol_frac": 0.12,                  # solute mole fraction IN (e.g. 12% CO2 flue gas)
      "target_removal": 0.90,                 # fraction of solute removed -> sets y_out
      "x_in_mol_frac": 0.0,                   # solute in lean solvent entering top
      "liquid_flow_kg_h": 12000.0,            # solvent (e.g. MEA solution) mass rate
      "liquid_molar_mass_kg_kmol": 24.0,      # effective solvent MW (aqueous amine ~ 20-25)
      "liquid_density_kg_m3": 1000.0,
      "liquid_viscosity_cp": 1.0,
      "equilibrium_slope_m": 0.5,             # m = dy*/dx (Henry-like slope; <1 favourable absorber)
      "htu_m": 0.6,                           # height of a transfer unit for the packing (e.g. Mellapak 250Y)
      "packing_factor_fp_per_m": 66.0,        # Fp [1/m] (Mellapak 250Y ~ 66; random 25mm rings ~ 500)
      "fraction_of_flooding": 0.65,           # design u / u_flood
      "n_columns": 1
    }

OUTPUT (JSON on stdout)
    NTU, packed height, flooding + design velocity, column DIAMETER, plus a
    worked[] array and a _provenance block.

LICENCE: tool wrapper internal. NTU = Colburn/Treybal; flooding = Eckert GPDC.
Correlation constants cited inline — NONE fabricated.
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
    "tool_name": "absorption_column_htu_ntu (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Treybal, 'Mass-Transfer Operations' 3rd ed. (Colburn NTU, Eq. 8.48); "
        "Eckert generalised pressure-drop correlation (flooding); "
        "Coulson & Richardson 'Chemical Engineering' Vol 2 ch.11 (packed columns); "
        "Perry's Chemical Engineers' Handbook 8th ed. ch.14."
    ),
    "physics_basis": (
        "Packed height H = HTU x NTU. NTU from the Colburn dilute-absorption equation "
        "with constant absorption factor A = L/(m G). Column diameter from the Eckert "
        "generalised pressure-drop correlation: flooding capacity factor C_sb,flood "
        "as a function of the flow parameter F_LV = (L/G) x sqrt(rho_G/rho_L); "
        "u_flood = C_sb,flood x sqrt((rho_L - rho_G)/rho_G) x Fp^-0.5-style packing "
        "dependence; design velocity = fraction_of_flooding x u_flood; "
        "D = sqrt(4 Q_G / (pi u_design))."
    ),
    "confidence_class": "standard",
    "last_reviewed_date": "2026-06-04",
}


def _colburn_ntu(y1: float, y2: float, x2: float, m: float, a_factor: float) -> tuple[float, str]:
    """Colburn NTU for dilute absorption. Returns (NTU, note)."""
    # Driving forces at top (lean) referenced to entering liquid x2.
    y1_star = m * x2           # gas-phase composition in equilibrium with entering liquid
    num_ratio = (y1 - y1_star) / (y2 - y1_star)
    if abs(a_factor - 1.0) < 1e-6:
        # A == 1 limit: NTU = (y1 - y2)/(y2 - m x2)
        return (y1 - y2) / (y2 - y1_star), "absorption factor A == 1 limit"
    inv_a = 1.0 / a_factor
    inner = num_ratio * (1.0 - inv_a) + inv_a
    if inner <= 0:
        raise ValueError("Colburn NTU argument <= 0 — removal not achievable with this solvent rate (A too low)")
    return math.log(inner) / (1.0 - inv_a), "Colburn dilute-absorption equation (Treybal Eq. 8.48)"


def compute(payload: dict) -> dict:
    name = str(payload.get("column_name", "packed column"))
    mode = str(payload.get("mode", "absorber")).strip().lower()
    n_cols = max(1, int(payload.get("n_columns", 1)))

    # ---- Gas side ----
    gas_kg_h = float(payload.get("gas_flow_kg_h", 0.0))
    gas_mw = float(payload.get("gas_molar_mass_kg_kmol", 29.0))
    rho_g = float(payload.get("gas_density_kg_m3", 1.1))
    if gas_kg_h <= 0 or rho_g <= 0:
        raise ValueError("gas_flow_kg_h and gas_density_kg_m3 must be > 0")
    y1 = float(payload.get("y_in_mol_frac", 0.12))
    removal = float(payload.get("target_removal", 0.90))
    if not 0.0 < removal < 1.0:
        raise ValueError("target_removal must be in (0,1)")
    if not 0.0 < y1 < 1.0:
        raise ValueError("y_in_mol_frac must be in (0,1)")
    # Solute removed; outlet mole fraction on the (approx constant) gas basis.
    # For dilute systems y2 ~ y1 x (1 - removal); keep the simple dilute form.
    y2 = y1 * (1.0 - removal)
    x2 = float(payload.get("x_in_mol_frac", 0.0))

    # ---- Liquid side ----
    liq_kg_h = float(payload.get("liquid_flow_kg_h", 0.0))
    liq_mw = float(payload.get("liquid_molar_mass_kg_kmol", 24.0))
    rho_l = float(payload.get("liquid_density_kg_m3", 1000.0))
    if liq_kg_h <= 0 or rho_l <= 0:
        raise ValueError("liquid_flow_kg_h and liquid_density_kg_m3 must be > 0")

    # Molar flows (kmol/h) for the absorption factor.
    g_kmol_h = gas_kg_h / gas_mw
    l_kmol_h = liq_kg_h / liq_mw
    m_slope = float(payload.get("equilibrium_slope_m", 0.5))
    if m_slope <= 0:
        raise ValueError("equilibrium_slope_m must be > 0")
    a_factor = l_kmol_h / (m_slope * g_kmol_h)        # absorption factor A = L / (m G)

    ntu, ntu_note = _colburn_ntu(y1, y2, x2, m_slope, a_factor)
    if ntu <= 0:
        raise ValueError("NTU resolved <= 0")

    htu_m = float(payload.get("htu_m", 0.6))
    if htu_m <= 0:
        raise ValueError("htu_m must be > 0")
    packed_height_m = htu_m * ntu

    # Reactive-amine empirical override (C. Schoolderman, OXCCU CO2 co, 2026-06-08): the
    # Colburn dilute-physical HTU-NTU model is INVALID for chemically/kinetically-enhanced
    # MEA-CO2 absorption AND assumes zero lean loading, so it badly under-predicts packed
    # height (~1.4 m vs ~20 m from public MEA pilot trials). When the caller supplies an
    # empirical packed height it GOVERNS; the Colburn NTU/HTU are kept for reference only.
    height_override_m = float(payload.get("packed_height_override_m", 0.0) or 0.0)
    height_method = "Colburn HTU x NTU (dilute-physical)"
    if height_override_m > 0:
        packed_height_m = height_override_m
        height_method = "empirical reactive-MEA anchor (public MEA pilot trials; Colburn invalid for kinetically-enhanced amine absorption + non-zero lean loading)"

    # ---- Column diameter via Eckert generalised pressure-drop correlation (flooding) ----
    # Flow parameter F_LV = (L/G) x sqrt(rho_G / rho_L), mass-flow ratio.
    f_lv = (liq_kg_h / gas_kg_h) * math.sqrt(rho_g / rho_l)
    # Flooding capacity factor C_sb,flood [m/s] from a Kessler-Wankat fit of the Eckert
    # flooding line (Wankat 'Separation Process Engineering' Eq. 10-x; Y at flooding):
    #   ln(Y_flood) = -3.7121 - 1.0371 ln(F_LV) - 0.1501 (ln F_LV)^2
    #                 - 0.007544 (ln F_LV)^3
    # where Y = u^2 Fp (rho_G/(rho_L-rho_G)) (mu_L^0.1) / g  (Eckert ordinate, SI-consistent form).
    ln_flv = math.log(f_lv)
    ln_y = (-3.7121 - 1.0371 * ln_flv - 0.1501 * ln_flv ** 2 - 0.007544 * ln_flv ** 3)
    y_eckert = math.exp(ln_y)
    fp = float(payload.get("packing_factor_fp_per_m", 66.0))            # [1/m]
    mu_l_cp = float(payload.get("liquid_viscosity_cp", 1.0))
    g_accel = 9.80665
    # Solve Eckert ordinate Y for u_flood:  Y = u^2 Fp (rho_G/(rho_L-rho_G)) mu^0.1 / g
    #   u_flood = sqrt( Y g (rho_L - rho_G) / (rho_G Fp mu^0.1) )
    denom = rho_g * fp * (mu_l_cp ** 0.1)
    u_flood = math.sqrt(y_eckert * g_accel * (rho_l - rho_g) / denom)
    f_flood = float(payload.get("fraction_of_flooding", 0.65))
    if not 0.1 <= f_flood <= 0.95:
        raise ValueError("fraction_of_flooding must be in [0.1, 0.95]")
    u_design = f_flood * u_flood

    # Gas volumetric flow at column conditions, split across n_cols.
    gas_vol_m3_s = (gas_kg_h / rho_g) / 3600.0 / n_cols
    area_m2 = gas_vol_m3_s / u_design
    diameter_m = math.sqrt(4.0 * area_m2 / math.pi)

    # ===================== worked[] =====================
    a_factor_r = round(a_factor, 4)
    ntu_r = round(ntu, 4)
    packed_height_r = round(packed_height_m, 4)
    f_lv_r = round(f_lv, 5)
    y_eckert_r = round(y_eckert, 6)
    u_flood_r = round(u_flood, 4)
    u_design_r = round(u_design, 4)
    gas_vol_r = round(gas_vol_m3_s, 5)
    diameter_m_r = round(diameter_m, 4)
    y2_r = round(y2, 6)

    worked = [
        worked_calc(
            label="Outlet solute mole fraction (target removal)",
            formula="y2 = y1 x (1 - removal)",
            values={"y1": (round(y1, 5), ""), "removal": (removal, "")},
            result=y2_r, result_unit="",
            assumptions=[f"{round(removal*100,1)}% of the solute removed; dilute-gas basis"],
        ),
        worked_calc(
            label="Absorption factor",
            formula="A = L / (m x G)",
            values={"L": (round(l_kmol_h, 4), "kmol/h"), "m": (m_slope, ""),
                    "G": (round(g_kmol_h, 4), "kmol/h")},
            result=a_factor_r, result_unit="",
            assumptions=["A > 1 favours absorption; m = equilibrium-line slope dy*/dx"],
        ),
        worked_calc(
            label="Number of transfer units (NTU)",
            formula="NTU = ln[((y1 - m x2)/(y2 - m x2)) x (1 - 1/A) + 1/A] / (1 - 1/A)",
            values={"y1": (round(y1, 5), ""), "y2": (y2_r, ""), "m": (m_slope, ""),
                    "x2": (x2, ""), "A": (a_factor_r, "")},
            result=ntu_r, result_unit="",
            assumptions=[ntu_note, "dilute system, linear equilibrium, constant A"],
        ),
        worked_calc(
            label="Packed height",
            formula="H = empirical reactive-MEA anchor" if height_override_m > 0 else "H = HTU x NTU",
            values={"H_empirical_m": (packed_height_r, "m")} if height_override_m > 0 else {"HTU": (htu_m, "m"), "NTU": (ntu_r, "")},
            result=packed_height_r, result_unit="m",
            assumptions=([height_method, f"Colburn HTU x NTU would give {round(htu_m * ntu, 2)} m — rejected as invalid for reactive MEA"] if height_override_m > 0 else [f"HTU {htu_m} m for the specified packing ({mode})"]),
        ),
        worked_calc(
            label="Flow parameter (Eckert abscissa)",
            formula="F_LV = (L_mass / G_mass) x sqrt(rho_G / rho_L)",
            values={"L_mass": (round(liq_kg_h, 1), "kg/h"), "G_mass": (round(gas_kg_h, 1), "kg/h"),
                    "rho_G": (rho_g, "kg/m3"), "rho_L": (rho_l, "kg/m3")},
            result=f_lv_r, result_unit="",
            assumptions=["mass-flow ratio form of the generalised pressure-drop correlation"],
        ),
        worked_calc(
            label="Flooding velocity (Eckert GPDC)",
            formula="u_flood = sqrt(Y_flood x g x (rho_L - rho_G) / (rho_G x Fp x mu_L^0.1))",
            values={"Y_flood": (y_eckert_r, ""), "g": (round(g_accel, 4), "m/s2"),
                    "rho_L": (rho_l, "kg/m3"), "rho_G": (rho_g, "kg/m3"),
                    "Fp": (fp, "1/m"), "mu_L": (mu_l_cp, "cP")},
            result=u_flood_r, result_unit="m/s",
            assumptions=["Y_flood from the Kessler-Wankat fit of the Eckert flooding line",
                         "Fp = packing factor (Mellapak 250Y ~ 66 1/m; 25 mm random rings ~ 500 1/m)"],
        ),
        worked_calc(
            label="Design superficial gas velocity",
            formula="u_design = f_flood x u_flood",
            values={"f_flood": (f_flood, ""), "u_flood": (u_flood_r, "m/s")},
            result=u_design_r, result_unit="m/s",
            assumptions=[f"operate at {round(f_flood*100,0)}% of flooding (typical 60-75%)"],
        ),
        worked_calc(
            label="Column diameter from gas load",
            formula="D = sqrt(4 x Q_G / (pi x u_design))",
            values={"Q_G": (gas_vol_r, "m3/s"), "u_design": (u_design_r, "m/s")},
            result=diameter_m_r, result_unit="m",
            assumptions=[f"gas volumetric flow {gas_vol_r} m3/s" + (f" per column ({n_cols} columns)" if n_cols > 1 else ""),
                         "cross-section A = Q_G / u_design; D = sqrt(4A/pi)"],
        ),
    ]

    return {
        "column_name": name,
        "mode": mode,
        "n_columns": n_cols,
        "y_in_mol_frac": round(y1, 6),
        "y_out_mol_frac": round(y2, 6),
        "x_in_mol_frac": x2,
        "target_removal": removal,
        "gas_molar_flow_kmol_h": round(g_kmol_h, 4),
        "liquid_molar_flow_kmol_h": round(l_kmol_h, 4),
        "equilibrium_slope_m": m_slope,
        "absorption_factor": round(a_factor, 4),
        "ntu": round(ntu, 4),
        "htu_m": htu_m,
        "packed_height_m": round(packed_height_m, 4),
        "flow_parameter_flv": round(f_lv, 5),
        "eckert_ordinate_y_flood": round(y_eckert, 6),
        "packing_factor_fp_per_m": fp,
        "flooding_velocity_m_s": round(u_flood, 4),
        "fraction_of_flooding": f_flood,
        "design_velocity_m_s": round(u_design, 4),
        "gas_volumetric_flow_m3_s": round(gas_vol_m3_s, 5),
        "column_area_m2": round(area_m2, 5),
        "column_diameter_m": round(diameter_m, 4),
        "column_diameter_mm": round(diameter_m * 1000.0, 1),
        "worked": worked,
        "data_sources": [
            "NTU (Colburn dilute-absorption equation): Treybal, 'Mass-Transfer Operations' 3rd ed. Eq. 8.48",
            "Flooding (generalised pressure-drop correlation): Eckert; fit per Wankat 'Separation Process Engineering'",
            "Packed-column design: Coulson & Richardson 'Chemical Engineering' Vol 2 ch.11; Perry's 8th ed. ch.14",
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
