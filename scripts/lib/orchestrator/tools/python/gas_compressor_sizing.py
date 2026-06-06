#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/gas_compressor_sizing.py

gas:compressor-sizing — FIRST-PRINCIPLES sizing of a multi-stage centrifugal /
reciprocating gas compressor: number of stages, per-stage pressure ratio,
real-gas POLYTROPIC head + shaft/driver power, discharge temperature and the
total intercooler duty — for an arbitrary gas mixture (H2 / CO2 / CO / CH4 /
N2 / H2O) as found on an e-fuel synthesis plant (CO2 + green-H2 feed
compression, syngas recycle, tail-gas boost).

WHAT IT DOES
    Given a mass flow, an inlet/outlet pressure and (optionally) the feed
    composition, it sizes the machine the way GPSA Engineering Data Book §13
    does for a polytropic centrifugal:

      n_stages = max(1, ceil(ln(p_out/p_in) / ln(max_stage_ratio)))
      r        = (p_out/p_in)^(1/n_stages)              # equal ratio per stage
      mixture MW, Cp, k from the component table (ideal-gas Cp), Cv = Cp - R
      REAL-GAS Z by Peng-Robinson (1976) for the MIXTURE at each stage's inlet
        and discharge (van-der-Waals one-fluid mixing rule, geometric-mean a_ij)
      polytropic exponent (n-1)/n = (k-1)/(k * poly_eff)
      H_poly = Z_avg * (R / M) * T_in * (n/(n-1)) * (r^((n-1)/n) - 1)   [J/kg]
      shaft (gas) power = (mdot * H_poly / poly_eff) summed over stages
      driver power = shaft / mech_eff
      T_disch per stage = T_in * r^((n-1)/n); intercool back to intercool_t_k
      intercooler duty/stage = mdot * Cp_specific * (T_disch - intercool_t_k)

WHY (e-fuel synthesis plant, OXCCU SAF / power-to-liquid):
    The CO2 + H2 feed must be raised from near-atmospheric capture pressure to
    the FT / methanol synthesis loop pressure (20-30 bar). The compression
    duty (and its intercooler heat rejection) is a major CAPEX + OPEX line and
    a real BoM item — previously LLM-guessed. Real-gas Z matters: CO2 near its
    critical point (304 K, 74 bar) departs materially from ideal.

INPUT (JSON on stdin)
    {
      "mass_flow_kg_h": 1000.0,                          # required
      "composition": {"CO2": 0.9, "H2": 0.1},            # optional MOLE fractions
      "mol_weight": 44.01, "k_cp_cv": 1.3,               # used iff no composition
      "p_in_bar": 1.5, "p_out_bar": 25.0,                # required (absolute)
      "t_in_k": 313.15,                                  # default 313.15
      "poly_eff": 0.75, "mech_eff": 0.95,                # polytropic + mechanical
      "max_stage_ratio": 3.5,                            # per-stage pressure-ratio cap
      "intercool_t_k": 313.15                            # default = t_in_k
    }

OUTPUT (JSON on stdout)
    n_stages, stage_pressure_ratio, shaft_power_kw, driver_power_kw,
    discharge_t_k, intercooler_total_duty_kw, mixture_mw, mixture_k, z_inlet,
    z_outlet, plus a worked[] array (each line hand-checkable) and a
    _provenance block.

LICENCE: tool wrapper internal. Correlations cited inline (GPSA Engineering
Data Book §13; Peng-Robinson 1976) — NO fabricated constants.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

R_J_MOL_K = 8.314  # universal gas constant [J/mol-K]

PROVENANCE = {
    "tool_name": "gas_compressor_sizing (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "GPSA Engineering Data Book 13th ed. Section 13 (Compressors & Expanders) "
        "— centrifugal/reciprocating polytropic head & power method; "
        "Peng & Robinson, 'A New Two-Constant Equation of State', Ind. Eng. Chem. "
        "Fundam. 15(1), 59-64 (1976) — real-gas compressibility Z for the mixture."
    ),
    "physics_basis": (
        "Equal per-stage pressure ratio r = (Pout/Pin)^(1/n) with "
        "n_stages = ceil(ln(Pout/Pin)/ln(max_stage_ratio)). Ideal-gas Cp from a "
        "component table, Cv = Cp - R, k = Cp/Cv. Real-gas Z by the Peng-Robinson "
        "(1976) cubic Z^3-(1-B)Z^2+(A-3B^2-2B)Z-(AB-B^2-B^3)=0 with a_i = "
        "0.45724 R^2 Tc_i^2/Pc_i * alpha_i, alpha_i=(1+m_i(1-sqrt(T/Tc_i)))^2, "
        "m_i=0.37464+1.54226 w_i-0.26992 w_i^2, b_i=0.07780 R Tc_i/Pc_i, and the "
        "van-der-Waals one-fluid mixing rule a_mix=SUM_i SUM_j x_i x_j sqrt(a_i a_j), "
        "b_mix=SUM_i x_i b_i (largest real positive root = vapour). Polytropic head "
        "H_poly = Z_avg (R/M) T_in (n/(n-1))(r^((n-1)/n)-1) with (n-1)/n=(k-1)/(k eta_p); "
        "gas power = mdot H_poly / eta_p; driver = gas power / eta_mech. Discharge "
        "T = T_in r^((n-1)/n); intercooler duty/stage = mdot Cp/M (T_disch - T_cool)."
    ),
    "confidence_class": "engineering_correlation",
    "last_reviewed_date": "2026-06-05",
}

# Component table: Tc [K], Pc [bar], acentric factor omega [-], MW [g/mol],
# ideal-gas Cp [J/mol-K] (near-ambient). Sources: Tc/Pc/omega from the DIPPR /
# Reid-Prausnitz-Poling 'Properties of Gases and Liquids' critical-constant
# tables; Cp_ideal near 300 K from the same (rounded to the brief's table).
COMPONENTS = {
    "H2":  {"Tc": 33.2,  "Pc": 13.0,  "omega": -0.216, "MW": 2.016,  "Cp": 28.8},
    "CO2": {"Tc": 304.2, "Pc": 73.8,  "omega": 0.224,  "MW": 44.01,  "Cp": 37.1},
    "CO":  {"Tc": 132.9, "Pc": 35.0,  "omega": 0.066,  "MW": 28.01,  "Cp": 29.1},
    "CH4": {"Tc": 190.6, "Pc": 46.0,  "omega": 0.011,  "MW": 16.04,  "Cp": 35.7},
    "N2":  {"Tc": 126.2, "Pc": 33.9,  "omega": 0.037,  "MW": 28.01,  "Cp": 29.1},
    "H2O": {"Tc": 647.1, "Pc": 220.6, "omega": 0.345,  "MW": 18.015, "Cp": 33.6},
}


def _normalise_composition(comp: dict) -> dict:
    """Return mole fractions normalised to sum 1.0, restricted to known species."""
    clean = {}
    for sp, x in comp.items():
        key = str(sp).strip().upper()
        # accept the canonical casing in the table (H2, CO2, CO, CH4, N2, H2O)
        match = None
        for cname in COMPONENTS:
            if cname.upper() == key:
                match = cname
                break
        if match is None:
            raise ValueError(f"unknown species {sp!r}; known: {list(COMPONENTS)}")
        xv = float(x)
        if xv < 0:
            raise ValueError(f"mole fraction for {sp} must be >= 0")
        clean[match] = clean.get(match, 0.0) + xv
    total = sum(clean.values())
    if total <= 0:
        raise ValueError("composition mole fractions sum to <= 0")
    return {k: v / total for k, v in clean.items()}


def _pr_z_factor(comp: dict, t_k: float, p_bar: float) -> float:
    """Peng-Robinson (1976) compressibility factor Z for a gas MIXTURE.

    comp: {species: mole_fraction} (already normalised).
    Returns the largest real positive root (the vapour-phase Z).
    """
    p_pa = p_bar * 1.0e5  # Pc and P in Pa
    species = list(comp.keys())
    x = np.array([comp[s] for s in species], dtype=float)

    a_i = np.zeros(len(species))
    b_i = np.zeros(len(species))
    for idx, s in enumerate(species):
        c = COMPONENTS[s]
        tc = c["Tc"]
        pc_pa = c["Pc"] * 1.0e5
        w = c["omega"]
        m = 0.37464 + 1.54226 * w - 0.26992 * w * w
        alpha = (1.0 + m * (1.0 - math.sqrt(t_k / tc))) ** 2
        a_i[idx] = 0.45724 * (R_J_MOL_K ** 2) * (tc ** 2) / pc_pa * alpha
        b_i[idx] = 0.07780 * R_J_MOL_K * tc / pc_pa

    # van-der-Waals one-fluid mixing rule, geometric-mean cross term (k_ij = 0).
    sqrt_a = np.sqrt(a_i)
    a_mix = float((x[:, None] * x[None, :] * np.outer(sqrt_a, sqrt_a)).sum())
    b_mix = float((x * b_i).sum())

    rt = R_J_MOL_K * t_k
    A = a_mix * p_pa / (rt ** 2)
    B = b_mix * p_pa / rt

    # Z^3 - (1-B) Z^2 + (A - 3B^2 - 2B) Z - (A B - B^2 - B^3) = 0
    coeffs = [
        1.0,
        -(1.0 - B),
        (A - 3.0 * B * B - 2.0 * B),
        -(A * B - B * B - B * B * B),
    ]
    roots = np.roots(coeffs)
    real_roots = [r.real for r in roots if abs(r.imag) < 1e-9 and r.real > 0]
    if not real_roots:
        raise ValueError("Peng-Robinson cubic produced no real positive root")
    return max(real_roots)  # vapour root


def compute(payload: dict) -> dict:
    warnings: list[str] = []

    if payload.get("mass_flow_kg_h") is None:
        raise ValueError("mass_flow_kg_h is required")
    mass_flow_kg_h = float(payload["mass_flow_kg_h"])
    if mass_flow_kg_h <= 0:
        raise ValueError("mass_flow_kg_h must be > 0")

    if payload.get("p_in_bar") is None or payload.get("p_out_bar") is None:
        raise ValueError("p_in_bar and p_out_bar are required (absolute bar)")
    p_in_bar = float(payload["p_in_bar"])
    p_out_bar = float(payload["p_out_bar"])
    if p_in_bar <= 0 or p_out_bar <= 0:
        raise ValueError("pressures must be > 0 (absolute bar)")
    if p_out_bar <= p_in_bar:
        raise ValueError("p_out_bar must be greater than p_in_bar (compression)")

    t_in_k = float(payload.get("t_in_k", 313.15))
    if t_in_k <= 0:
        raise ValueError("t_in_k must be > 0")
    poly_eff = float(payload.get("poly_eff", 0.75))
    mech_eff = float(payload.get("mech_eff", 0.95))
    if not 0.0 < poly_eff <= 1.0:
        raise ValueError("poly_eff must be in (0, 1]")
    if not 0.0 < mech_eff <= 1.0:
        raise ValueError("mech_eff must be in (0, 1]")
    max_stage_ratio = float(payload.get("max_stage_ratio", 3.5))
    if max_stage_ratio <= 1.0:
        raise ValueError("max_stage_ratio must be > 1")
    intercool_t_k = float(payload.get("intercool_t_k", t_in_k))
    if intercool_t_k <= 0:
        raise ValueError("intercool_t_k must be > 0")

    # ---- Mixture properties: MW, Cp, Cv, k ----
    composition = payload.get("composition")
    comp_norm: dict | None = None
    if composition:
        comp_norm = _normalise_composition(dict(composition))
        mw_g_mol = sum(comp_norm[s] * COMPONENTS[s]["MW"] for s in comp_norm)
        cp_mol = sum(comp_norm[s] * COMPONENTS[s]["Cp"] for s in comp_norm)  # J/mol-K
        cv_mol = cp_mol - R_J_MOL_K
        if cv_mol <= 0:
            raise ValueError("computed Cv <= 0; check composition")
        k = cp_mol / cv_mol
        prop_basis = "from composition (ideal-gas Cp table; Cv = Cp - R)"
    else:
        if payload.get("mol_weight") is None:
            raise ValueError("provide composition OR mol_weight (+ optional k_cp_cv)")
        mw_g_mol = float(payload["mol_weight"])
        if mw_g_mol <= 0:
            raise ValueError("mol_weight must be > 0")
        k = float(payload.get("k_cp_cv", 1.3))
        if k <= 1.0:
            raise ValueError("k_cp_cv must be > 1")
        # Cp from k for the intercooler sensible-heat term: Cp = k R / (k-1)
        cp_mol = k * R_J_MOL_K / (k - 1.0)
        cv_mol = cp_mol - R_J_MOL_K
        prop_basis = "from mol_weight + k_cp_cv (no composition supplied)"

    mw_kg_mol = mw_g_mol / 1000.0
    cp_specific = cp_mol / mw_kg_mol  # J/kg-K (specific heat at constant pressure)

    # ---- Stage count + per-stage ratio ----
    overall_ratio = p_out_bar / p_in_bar
    n_stages = max(1, math.ceil(math.log(overall_ratio) / math.log(max_stage_ratio)))
    r = overall_ratio ** (1.0 / n_stages)

    # ---- Polytropic exponent ----
    # (n-1)/n = (k-1)/(k * eta_p)
    n_exp_ratio = (k - 1.0) / (k * poly_eff)  # = (n-1)/n
    if n_exp_ratio <= 0 or n_exp_ratio >= 1:
        raise ValueError("polytropic exponent out of range; check k and poly_eff")

    mdot_kg_s = mass_flow_kg_h / 3600.0

    # ---- Real-gas Z + per-stage head/power/intercooler ----
    # Each stage: inlet (t_in_k, stage_p_in), discharge (T_disch, stage_p_out).
    # Stages are identical in ratio AND inlet T (intercool back to t_in_k for the
    # head calc basis = t_in_k). z_inlet reported = stage-1 inlet; z_outlet =
    # stage-1 discharge (representative; CO2 near-critical departure shows here).
    t_disch_stage = t_in_k * (r ** n_exp_ratio)

    total_gas_power_w = 0.0
    total_intercool_w = 0.0
    z_inlet_rep = 1.0
    z_outlet_rep = 1.0
    h_poly_rep = 0.0
    stage_p = p_in_bar
    for stage in range(n_stages):
        stage_p_in = stage_p
        stage_p_out = stage_p * r
        if comp_norm is not None:
            z_in = _pr_z_factor(comp_norm, t_in_k, stage_p_in)
            z_out = _pr_z_factor(comp_norm, t_disch_stage, stage_p_out)
        else:
            z_in = 1.0
            z_out = 1.0
        z_avg = 0.5 * (z_in + z_out)

        # Polytropic head [J/kg] for this stage (T basis = t_in_k after intercool).
        h_poly = (
            z_avg * (R_J_MOL_K / mw_kg_mol) * t_in_k
            * (1.0 / n_exp_ratio) * (r ** n_exp_ratio - 1.0)
        )
        gas_power_w = mdot_kg_s * h_poly / poly_eff
        total_gas_power_w += gas_power_w

        # Intercooler duty: cool discharge back to intercool_t_k (sensible heat).
        intercool_w = mdot_kg_s * cp_specific * (t_disch_stage - intercool_t_k)
        if intercool_w < 0:
            intercool_w = 0.0
        total_intercool_w += intercool_w

        if stage == 0:
            z_inlet_rep = z_in
            z_outlet_rep = z_out
            h_poly_rep = h_poly
        stage_p = stage_p_out

    if comp_norm is None:
        warnings.append(
            "no composition supplied: real-gas Z set to 1.0 (ideal-gas assumption); "
            "supply mole fractions for Peng-Robinson real-gas accuracy"
        )

    shaft_power_kw = total_gas_power_w / 1000.0
    driver_power_kw = total_gas_power_w / mech_eff / 1000.0
    intercooler_total_duty_kw = total_intercool_w / 1000.0

    # ===================== worked[] — chained off rounded intermediates =========
    overall_ratio_r = round(overall_ratio, 4)
    r_r = round(r, 4)
    k_r = round(k, 4)
    mw_r = round(mw_g_mol, 4)
    n_exp_ratio_r = round(n_exp_ratio, 5)
    z_avg_rep_r = round(0.5 * (z_inlet_rep + z_outlet_rep), 4)
    h_poly_rep_r = round(h_poly_rep, 1)
    t_disch_r = round(t_disch_stage, 2)
    shaft_kw_r = round(shaft_power_kw, 3)
    driver_kw_r = round(driver_power_kw, 3)
    intercool_kw_r = round(intercooler_total_duty_kw, 3)
    cp_specific_r = round(cp_specific, 2)

    worked = []
    worked.append(worked_calc(
        label="Number of compression stages",
        formula="n_stages = ceil(ln(Pout / Pin) / ln(max_stage_ratio))",
        values={"Pout": (p_out_bar, "bar"), "Pin": (p_in_bar, "bar"),
                "max_stage_ratio": (max_stage_ratio, "")},
        result=n_stages, result_unit="",
        assumptions=["equal pressure ratio per stage (GPSA EDB §13)",
                     f"overall ratio Pout/Pin = {overall_ratio_r}",
                     "at least 1 stage"],
    ))
    worked.append(worked_calc(
        label="Per-stage pressure ratio",
        formula="r = (Pout / Pin)^(1 / n_stages)",
        values={"Pout": (p_out_bar, "bar"), "Pin": (p_in_bar, "bar"),
                "n_stages": (n_stages, "")},
        result=r_r, result_unit="",
        assumptions=["equal-ratio staging keeps each stage discharge T within limits"],
    ))
    if comp_norm is not None:
        worked.append(worked_calc(
            label="Mixture molecular weight",
            formula="MW = SUM x_i * MW_i",
            values={f"x_{s}": (round(comp_norm[s], 4), "") for s in comp_norm},
            result=mw_r, result_unit="g/mol",
            assumptions=["mole-fraction-weighted; component MW from critical-constant table"],
        ))
        worked.append(worked_calc(
            label="Mixture heat-capacity ratio k",
            formula="k = Cp / (Cp - R)",
            values={"Cp": (round(cp_mol, 3), "J/mol-K"), "R": (R_J_MOL_K, "J/mol-K")},
            result=k_r, result_unit="",
            assumptions=["ideal-gas Cp (mole-weighted from table); Cv = Cp - R"],
        ))
        worked.append(worked_calc(
            label="Real-gas Z (Peng-Robinson) — stage-1 inlet & discharge",
            formula="Z_avg = (Z_in + Z_out) / 2",
            values={"Z_in": (round(z_inlet_rep, 4), ""),
                    "Z_out": (round(z_outlet_rep, 4), "")},
            result=z_avg_rep_r, result_unit="",
            assumptions=["Peng-Robinson 1976 cubic, largest real positive (vapour) root",
                         "van-der-Waals one-fluid mixing, geometric-mean a_ij (k_ij=0)",
                         f"stage-1 inlet ({round(t_in_k,2)} K, {round(p_in_bar,3)} bar), "
                         f"discharge ({t_disch_r} K, {round(p_in_bar*r,3)} bar)"],
        ))
    else:
        worked.append(worked_calc(
            label="Real-gas Z (no composition)",
            formula="Z_avg = 1.0",
            values={"Z_in": (1.0, ""), "Z_out": (1.0, "")},
            result=1.0, result_unit="",
            assumptions=["no composition supplied -> ideal-gas Z = 1.0 (see warnings)"],
        ))
    worked.append(worked_calc(
        label="Polytropic exponent group (n-1)/n",
        formula="(n-1)/n = (k - 1) / (k * eta_p)",
        values={"k": (k_r, ""), "eta_p": (poly_eff, "")},
        result=n_exp_ratio_r, result_unit="",
        assumptions=["polytropic compression (GPSA EDB §13)"],
    ))
    worked.append(worked_calc(
        label="Polytropic head per stage",
        formula="H_poly = Z_avg * (R / M) * T_in * (n/(n-1)) * (r^((n-1)/n) - 1)",
        values={"Z_avg": (z_avg_rep_r, ""), "R": (R_J_MOL_K, "J/mol-K"),
                "M": (round(mw_kg_mol, 6), "kg/mol"), "T_in": (round(t_in_k, 2), "K"),
                "r": (r_r, ""), "(n-1)/n": (n_exp_ratio_r, "")},
        result=h_poly_rep_r, result_unit="J/kg",
        assumptions=["n/(n-1) = 1 / ((n-1)/n); stage inlet T = t_in_k after intercool"],
    ))
    worked.append(worked_calc(
        label="Compressor shaft (gas) power — all stages",
        formula="P_shaft = n_stages * mdot * H_poly / eta_p / 1000",
        values={"n_stages": (n_stages, ""), "mdot": (round(mdot_kg_s, 5), "kg/s"),
                "H_poly": (h_poly_rep_r, "J/kg"), "eta_p": (poly_eff, "")},
        result=shaft_kw_r, result_unit="kW",
        assumptions=["identical stages summed; /1000 W->kW shown in formula so the printed arithmetic evaluates to the kW result (worked_calc_arithmetic_sound, 2026-06-06)",
                     "per-stage Z recomputed; representative head shown"],
    ))
    worked.append(worked_calc(
        label="Driver (electric motor / turbine) power",
        formula="P_driver = P_shaft / eta_mech",
        values={"P_shaft": (shaft_kw_r, "kW"), "eta_mech": (mech_eff, "")},
        result=driver_kw_r, result_unit="kW",
        assumptions=["mechanical/transmission losses (gearbox, bearings, seals)"],
    ))
    worked.append(worked_calc(
        label="Stage discharge temperature",
        formula="T_disch = T_in * r^((n-1)/n)",
        values={"T_in": (round(t_in_k, 2), "K"), "r": (r_r, ""),
                "(n-1)/n": (n_exp_ratio_r, "")},
        result=t_disch_r, result_unit="K",
        assumptions=["per-stage; intercooled back toward intercool_t_k between stages"],
    ))
    worked.append(worked_calc(
        label="Total intercooler heat-rejection duty",
        formula="Q_ic = n_inter * mdot * Cp_spec * (T_disch - T_cool) / 1000",
        values={"n_inter": (n_stages, ""), "mdot": (round(mdot_kg_s, 5), "kg/s"),
                "Cp_spec": (cp_specific_r, "J/kg-K"),
                "T_disch": (t_disch_r, "K"), "T_cool": (round(intercool_t_k, 2), "K")},
        result=intercool_kw_r, result_unit="kW",
        assumptions=["sensible-heat cooling of each stage discharge; /1000 W->kW shown in formula so the printed arithmetic evaluates to the kW result (worked_calc_arithmetic_sound, 2026-06-06)",
                     "Cp_spec = Cp_molar / MW (specific heat at constant pressure)"],
    ))

    return {
        "n_stages": n_stages,
        "stage_pressure_ratio": round(r, 4),
        "shaft_power_kw": round(shaft_power_kw, 3),
        "driver_power_kw": round(driver_power_kw, 3),
        "discharge_t_k": round(t_disch_stage, 2),
        "intercooler_total_duty_kw": round(intercooler_total_duty_kw, 3),
        "mixture_mw": round(mw_g_mol, 4),
        "mixture_k": round(k, 4),
        "z_inlet": round(z_inlet_rep, 4),
        "z_outlet": round(z_outlet_rep, 4),
        "overall_pressure_ratio": round(overall_ratio, 4),
        "mass_flow_kg_h": round(mass_flow_kg_h, 4),
        "property_basis": prop_basis,
        "worked": worked,
        "warnings": warnings,
        "data_sources": [
            "GPSA Engineering Data Book 13th ed. §13 — centrifugal/recip polytropic head + power",
            "Peng & Robinson (1976) Ind. Eng. Chem. Fundam. 15(1):59 — real-gas Z EOS",
            "Reid, Prausnitz & Poling 'Properties of Gases and Liquids' — Tc/Pc/omega/Cp constants",
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
