#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/reactor_cstr_pfr_sizing.py

reactor:cstr-pfr-sizing — FIRST-PRINCIPLES sizing of a stirred-tank (CSTR) or
plug-flow (PFR) reactor: working VOLUME, residence time, a real vessel size
(diameter x height from an aspect ratio) and the shell thickness/mass/material
(the SAME hoop-stress wall calc the pressure-vessel tool uses).

WHAT IT DOES
    Given a throughput (volumetric m3/h, OR a mass rate + density) and a residence-
    time basis, it sizes the reactor:

      tau   = residence time [h]
              - given directly, OR
              - from first-order kinetics: tau = -ln(1 - X) / k   (CSTR: tau = X/[k(1-X)])
      V_react = Q x tau                                   (working / liquid volume, m3)
      V_vessel = V_react / fill_fraction                 (gross vessel incl. freeboard)
      from L/D and V_vessel (cylinder, V = pi/4 D^2 L, L = (L/D) x D):
          D = (4 V_vessel / (pi x (L/D)))^(1/3)
          L = (L/D) x D
      shell wall (hoop stress under internal design pressure, thin-wall, with a
      corrosion allowance + weld-joint efficiency, then mass from the steel density)

WHY (Plan C, docs/grounding-and-selfgrowth-plan.md section C item 4):
    CO2-mineralisation's gypsum_carbonation reactor + the K2SO4 reactor are NOVEL
    sub-modules with no catalogue part — a SIZED reactor (volume + vessel + shell
    mass) IS the BoM line item. Previously LLM-guessed.

INPUT (JSON on stdin)
    {
      "reactor_name": "gypsum carbonation reactor",   # optional label
      "reactor_type": "cstr",                          # cstr | pfr  (affects tau-from-kinetics)
      # --- throughput: either volumetric, or mass + density ---
      "volumetric_flow_m3_h": 4.0,                     # OR:
      "mass_flow_kg_h": 4000.0, "density_kg_m3": 1100.0,
      # --- residence-time basis: one of ---
      "residence_time_h": 1.5,                         # direct, OR derive from:
      "target_conversion": 0.95, "rate_constant_per_h": 2.0,   # 1st-order k [1/h]
      # --- geometry + mechanical ---
      "length_to_diameter": 2.0,                       # L/D aspect ratio (Perry default 2-3 for agitated)
      "fill_fraction": 0.8,                            # working vol / gross vessel (freeboard)
      "design_pressure_barg": 2.0,                     # internal design gauge pressure
      "material": "steel_316L",                        # shell metal (MATERIALS table)
      "allowable_stress_mpa": null,                    # override; else 0.6 x yield (ASME-style)
      "corrosion_allowance_mm": 3.0,
      "weld_joint_efficiency": 0.85,                   # E (spot-RT)
      "n_reactors": 1                                  # parallel/series train (divides duty volume)
    }

OUTPUT (JSON on stdout)
    Working + gross volume, residence time, D x L, shell thickness/mass, plus a
    worked[] array (each line hand-checkable) and a _provenance block.

LICENCE: tool wrapper internal. Correlations cited inline (Perry's, Coulson &
Richardson, Levenspiel) — NO fabricated constants.
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
    "tool_name": "reactor_cstr_pfr_sizing (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Levenspiel, 'Chemical Reaction Engineering' 3rd ed. (design equations); "
        "Coulson & Richardson 'Chemical Engineering' Vol 6 / Sinnott, ch.13 "
        "(vessel L/D + wall thickness); Perry's Chemical Engineers' Handbook 8th ed."
    ),
    "physics_basis": (
        "Reactor working volume V = Q x tau. Residence time tau from the brief OR "
        "from first-order kinetics: PFR tau = -ln(1-X)/k, CSTR tau = X/[k(1-X)] "
        "(Levenspiel Eq. 5.x). Vessel diameter from cylinder volume V = pi/4 D^2 L "
        "with L = (L/D) x D. Shell minimum thickness from thin-wall hoop stress "
        "t = P_design x D / (2 x S x E - 1.2 x P_design) + corrosion allowance "
        "(ASME VIII Div.1 UG-27 circumferential-stress form / BS EN 13445), with the "
        "allowable stress S taken as 0.6 x yield when not supplied. Shell mass from "
        "cylinder-wall volume x steel density."
    ),
    "confidence_class": "standard",
    "last_reviewed_date": "2026-06-04",
}

# Shell-metal properties [yield MPa, density kg/m3] — same family as pressure_vessel.py.
MATERIALS = {
    "steel_316L":     {"yield_mpa": 290, "density": 8000},
    "steel_304L":     {"yield_mpa": 290, "density": 8000},
    "steel_CS":       {"yield_mpa": 250, "density": 7850},   # carbon steel SA-516-70 ~ 260 MPa yield; conservative 250
    "steel_carbon":   {"yield_mpa": 250, "density": 7850},
    "duplex_2205":    {"yield_mpa": 450, "density": 7800},
    "Ti_grade2":      {"yield_mpa": 275, "density": 4510},
    "glass_lined_CS": {"yield_mpa": 250, "density": 7850},   # carbon-steel substrate; lining mass ignored
    "FRP":            {"yield_mpa": 100, "density": 1800},   # filament-wound GRP, conservative
}


def compute(payload: dict) -> dict:
    reactor_name = str(payload.get("reactor_name", "reactor"))
    reactor_type = str(payload.get("reactor_type", "cstr")).strip().lower()
    if reactor_type not in ("cstr", "pfr"):
        raise ValueError(f"reactor_type must be 'cstr' or 'pfr', got {reactor_type!r}")

    n_reactors = max(1, int(payload.get("n_reactors", 1)))

    # ---- Throughput -> volumetric flow (m3/h) ----
    if payload.get("volumetric_flow_m3_h") is not None:
        q_m3_h = float(payload["volumetric_flow_m3_h"])
        flow_basis = "volumetric (given)"
    elif payload.get("mass_flow_kg_h") is not None:
        mass_flow = float(payload["mass_flow_kg_h"])
        density = float(payload.get("density_kg_m3", 1000.0))
        if density <= 0:
            raise ValueError("density_kg_m3 must be > 0")
        q_m3_h = mass_flow / density
        flow_basis = f"mass {mass_flow} kg/h / rho {density} kg/m3"
    else:
        raise ValueError("provide volumetric_flow_m3_h OR (mass_flow_kg_h + density_kg_m3)")
    if q_m3_h <= 0:
        raise ValueError("throughput resolves to <= 0 m3/h")

    # ---- Residence time tau (h) ----
    tau_source: str
    target_conversion = payload.get("target_conversion")
    k_per_h = payload.get("rate_constant_per_h")
    if payload.get("residence_time_h") is not None:
        tau_h = float(payload["residence_time_h"])
        tau_source = "given directly"
        conv_used = float(target_conversion) if target_conversion is not None else None
    elif target_conversion is not None and k_per_h is not None:
        x = float(target_conversion)
        k = float(k_per_h)
        if not 0.0 < x < 1.0:
            raise ValueError("target_conversion must be in (0,1)")
        if k <= 0:
            raise ValueError("rate_constant_per_h must be > 0")
        if reactor_type == "pfr":
            tau_h = -math.log(1.0 - x) / k         # PFR, 1st order: tau = -ln(1-X)/k
            tau_source = "PFR 1st-order: tau = -ln(1 - X) / k"
        else:
            tau_h = x / (k * (1.0 - x))            # CSTR, 1st order: tau = X / [k(1-X)]
            tau_source = "CSTR 1st-order: tau = X / [k x (1 - X)]"
        conv_used = x
    else:
        raise ValueError(
            "provide residence_time_h OR (target_conversion + rate_constant_per_h)")
    if tau_h <= 0:
        raise ValueError("residence time resolves to <= 0 h")

    # ---- Working + gross volume ----
    v_working_m3 = q_m3_h * tau_h                  # total working volume across the train
    v_working_per_reactor = v_working_m3 / n_reactors
    fill_fraction = float(payload.get("fill_fraction", 0.8))
    if not 0.1 <= fill_fraction <= 1.0:
        raise ValueError("fill_fraction must be in [0.1, 1.0]")
    v_vessel_m3 = v_working_per_reactor / fill_fraction   # gross vessel volume (per reactor, incl. freeboard)

    # ---- Vessel geometry from L/D (vertical cylinder, ignore heads for first pass) ----
    l_to_d = float(payload.get("length_to_diameter", 2.0))
    if l_to_d <= 0:
        raise ValueError("length_to_diameter must be > 0")
    # V = pi/4 D^2 L, L = (L/D) D  ->  V = pi/4 (L/D) D^3  ->  D = (4V / (pi (L/D)))^(1/3)
    diameter_m = (4.0 * v_vessel_m3 / (math.pi * l_to_d)) ** (1.0 / 3.0)
    height_m = l_to_d * diameter_m

    # ---- Shell wall thickness (hoop stress, internal pressure) ----
    material = str(payload.get("material", "steel_316L"))
    if material not in MATERIALS:
        raise ValueError(f"unknown material {material!r}; known: {list(MATERIALS)}")
    mat = MATERIALS[material]
    p_design_barg = float(payload.get("design_pressure_barg", 2.0))
    p_design_mpa = p_design_barg * 0.1                          # 1 bar = 0.1 MPa
    s_allow_mpa = payload.get("allowable_stress_mpa")
    if s_allow_mpa is None:
        s_allow_mpa = 0.6 * mat["yield_mpa"]                    # ASME-style allowable ~ 0.6 x yield
        s_basis = "0.6 x yield (no datasheet allowable supplied)"
    else:
        s_allow_mpa = float(s_allow_mpa)
        s_basis = "supplied allowable stress"
    weld_eff = float(payload.get("weld_joint_efficiency", 0.85))
    corr_mm = float(payload.get("corrosion_allowance_mm", 3.0))
    diameter_mm = diameter_m * 1000.0
    # ASME VIII Div.1 UG-27 circumferential (hoop): t = P R / (S E - 0.6 P) ; with D=2R
    #   t = P D / (2 S E - 1.2 P)
    denom = (2.0 * s_allow_mpa * weld_eff - 1.2 * p_design_mpa)
    if denom <= 0:
        raise ValueError("design pressure too high for allowable stress (negative wall thickness)")
    t_pressure_mm = p_design_mpa * diameter_mm / denom
    t_min_mm = t_pressure_mm + corr_mm
    # Practical minimum plate (Sinnott: small vessels rarely below ~5 mm for rigidity/handling)
    t_shell_mm = max(t_min_mm, 5.0)

    # ---- Shell mass (cylindrical wall + 2 flat-ish heads approximated as plate) ----
    r_outer_mm = diameter_mm / 2.0 + t_shell_mm
    r_inner_mm = diameter_mm / 2.0
    height_mm = height_m * 1000.0
    cyl_wall_vol_mm3 = math.pi * (r_outer_mm ** 2 - r_inner_mm ** 2) * height_mm
    head_vol_mm3 = 2.0 * (math.pi * r_outer_mm ** 2) * t_shell_mm     # 2 flat heads (conservative)
    shell_vol_m3 = (cyl_wall_vol_mm3 + head_vol_mm3) / 1e9
    shell_mass_kg_per_reactor = shell_vol_m3 * mat["density"]
    shell_mass_kg_total = shell_mass_kg_per_reactor * n_reactors

    # ===================== worked[] — drift-safe, chained off rounded intermediates ====
    q_m3_h_r = round(q_m3_h, 4)
    tau_h_r = round(tau_h, 4)
    v_working_r = round(v_working_m3, 4)
    v_working_pr_r = round(v_working_per_reactor, 4)
    v_vessel_r = round(v_vessel_m3, 4)
    diameter_m_r = round(diameter_m, 4)
    height_m_r = round(height_m, 4)
    t_pressure_mm_r = round(t_pressure_mm, 4)
    t_shell_mm_r = round(t_shell_mm, 3)
    shell_vol_m3_r = round(shell_vol_m3, 6)
    shell_mass_pr_r = round(shell_mass_kg_per_reactor, 2)

    worked = []
    if reactor_type == "pfr" and conv_used is not None and payload.get("residence_time_h") is None:
        worked.append(worked_calc(
            label="Residence time from conversion (PFR, 1st order)",
            formula="tau = -ln(1 - X) / k",
            values={"X": (conv_used, ""), "k": (float(k_per_h), "1/h")},
            result=tau_h_r, result_unit="h",
            assumptions=["plug flow, first-order irreversible kinetics (Levenspiel Eq. 5.20)"],
        ))
    elif reactor_type == "cstr" and conv_used is not None and payload.get("residence_time_h") is None:
        worked.append(worked_calc(
            label="Residence time from conversion (CSTR, 1st order)",
            formula="tau = X / (k x (1 - X))",
            values={"X": (conv_used, ""), "k": (float(k_per_h), "1/h")},
            result=tau_h_r, result_unit="h",
            assumptions=["ideal back-mixed CSTR, first-order irreversible kinetics (Levenspiel Eq. 5.11)"],
        ))
    worked.append(worked_calc(
        label="Reactor working volume (total)",
        formula="V_working = Q x tau",
        values={"Q": (q_m3_h_r, "m3/h"), "tau": (tau_h_r, "h")},
        result=v_working_r, result_unit="m3",
        assumptions=[f"throughput basis: {flow_basis}", "working (liquid) volume = flow x residence time"],
    ))
    if n_reactors > 1:
        worked.append(worked_calc(
            label="Working volume per reactor",
            formula="V_per = V_working / n_reactors",
            values={"V_working": (v_working_r, "m3"), "n_reactors": (n_reactors, "")},
            result=v_working_pr_r, result_unit="m3",
            assumptions=[f"{n_reactors} reactors in the train"],
        ))
    worked.append(worked_calc(
        label="Gross vessel volume (freeboard)",
        formula="V_vessel = V_per / fill_fraction",
        values={"V_per": (v_working_pr_r, "m3"), "fill_fraction": (fill_fraction, "")},
        result=v_vessel_r, result_unit="m3",
        assumptions=[f"fill fraction {fill_fraction} leaves freeboard for disengagement/agitation"],
    ))
    worked.append(worked_calc(
        label="Vessel diameter from aspect ratio",
        formula="D = (4 x V_vessel / (pi x L_over_D))^(1/3)",
        values={"V_vessel": (v_vessel_r, "m3"), "L_over_D": (l_to_d, "")},
        result=diameter_m_r, result_unit="m",
        assumptions=["vertical cylinder V = pi/4 D^2 L with L = (L/D) x D; heads ignored for first pass"],
    ))
    worked.append(worked_calc(
        label="Vessel tangent-to-tangent height",
        formula="L = L_over_D x D",
        values={"L_over_D": (l_to_d, ""), "D": (diameter_m_r, "m")},
        result=height_m_r, result_unit="m",
        assumptions=["L/D 2-3 typical for agitated vessels (Coulson & Richardson Vol 6)"],
    ))
    worked.append(worked_calc(
        label="Shell minimum thickness (hoop stress, internal pressure)",
        formula="t = P x D / (2 x S x E - 1.2 x P) + corr",
        values={"P": (round(p_design_mpa, 4), "MPa"), "D": (round(diameter_mm, 1), "mm"),
                "S": (round(s_allow_mpa, 2), "MPa"), "E": (weld_eff, ""), "corr": (corr_mm, "mm")},
        result=round(t_pressure_mm + corr_mm, 3), result_unit="mm",
        assumptions=["ASME VIII Div.1 UG-27 circumferential-stress form (BS EN 13445 equivalent)",
                     s_basis, f"+ {corr_mm} mm corrosion allowance",
                     f"adopted shell t = {t_shell_mm_r} mm (>= 5 mm practical handling minimum)"],
    ))
    worked.append(worked_calc(
        label="Shell mass (wall + 2 heads) per reactor",
        formula="m = (pi x (r_o^2 - r_i^2) x H + 2 x pi x r_o^2 x t) x rho / 1e9",
        values={"r_o": (round(r_outer_mm, 1), "mm"), "r_i": (round(r_inner_mm, 1), "mm"),
                "H": (round(height_mm, 1), "mm"), "t": (t_shell_mm_r, "mm"),
                "rho": (mat["density"], "kg/m3")},
        result=shell_mass_pr_r, result_unit="kg",
        assumptions=[f"material {material}", "flat-head approximation (conservative vs torispherical)",
                     "1e9 converts mm3 to m3"],
    ))

    return {
        "reactor_name": reactor_name,
        "reactor_type": reactor_type,
        "n_reactors": n_reactors,
        "volumetric_flow_m3_h": round(q_m3_h, 4),
        "residence_time_h": round(tau_h, 4),
        "residence_time_basis": tau_source,
        "target_conversion": conv_used,
        "working_volume_total_m3": round(v_working_m3, 4),
        "working_volume_per_reactor_m3": round(v_working_per_reactor, 4),
        "fill_fraction": fill_fraction,
        "vessel_gross_volume_m3": round(v_vessel_m3, 4),
        "vessel_diameter_m": round(diameter_m, 4),
        "vessel_height_m": round(height_m, 4),
        "length_to_diameter": l_to_d,
        "material": material,
        "design_pressure_barg": p_design_barg,
        "allowable_stress_mpa": round(s_allow_mpa, 2),
        "shell_thickness_mm": round(t_shell_mm, 3),
        "corrosion_allowance_mm": corr_mm,
        "shell_mass_kg_per_reactor": round(shell_mass_kg_per_reactor, 2),
        "shell_mass_kg_total": round(shell_mass_kg_total, 2),
        "worked": worked,
        "data_sources": [
            "Levenspiel, 'Chemical Reaction Engineering' 3rd ed. — CSTR/PFR design equations",
            "Coulson & Richardson 'Chemical Engineering' Vol 6 (Sinnott) ch.13 — vessel L/D + wall thickness",
            "ASME BPVC Section VIII Division 1 UG-27 / BS EN 13445 — shell hoop-stress thickness",
            "Perry's Chemical Engineers' Handbook 8th ed. — vessel design heuristics",
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
