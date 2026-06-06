#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/storage_tank_liquid_fuel.py

storage-tank:liquid-fuel — FIRST-PRINCIPLES sizing of the product liquid-fuel
storage farm: the required working volume from a days-of-storage basis, the
number of tanks once a single-tank volume cap is applied, a real cylindrical
tank size (diameter x height from an H/D aspect ratio) and the shell-course
thickness + steel mass from the API 650 1-foot method.

WHAT IT DOES
    Given a daily production rate and a days-of-storage policy, it sizes the farm:

      V_req   = daily_production x days_storage / fill_fraction   (gross volume)
      n_tanks = max(1, ceil(V_req / max_tank_m3))                 (volume cap)
      V_each  = V_req / n_tanks                                   (per-tank volume)
      from H = (H/D) x D and V_each = (pi/4) D^2 H:
          D = (4 V_each / (pi x (H/D)))^(1/3)
          H = (H/D) x D
      shell course thickness (API 650 1-foot method, design condition):
          t = 4.9 x D x (H - 0.3) x SG / (S x E) + corrosion allowance
          t = max(t, 6 mm)   <- API 650 Table 5.6a practical minimum plate
      shell mass  = pi x D x H x (t/1000) x 7850                  (lateral wall)
      floor mass  = (pi/4) D^2 x (t_floor/1000) x 7850           (bottom plate)
      roof mass   = 1.05 x (pi/4) D^2 x (t_roof/1000) x 7850     (cone roof)
      fittings    = +12% (nozzles, stairs, clips, wind girder)
      shell mass (total, dry) = (shell + floor + roof) x 1.12     <- PHYSICAL dry mass

WHY (e-fuel synthesis plant): the synthetic liquid fuel (methanol, FT syncrude,
    e-kerosene) must be tanked before truck/pipeline export. The product tank
    farm is a NOVEL bespoke item with no catalogue part — a SIZED tank (count +
    D x H + shell mass) IS the BoM line item. Previously LLM-guessed.

INPUT (JSON on stdin)
    {
      "daily_production_m3": 5.7,        # REQUIRED — fuel produced per day
      "days_storage": 14.0,             # days of buffer storage (default 14)
      "fill_fraction": 0.9,             # working volume / gross tank (default 0.9)
      "product_density_kg_m3": 800.0,   # fuel density (default 800)
      "max_tank_m3": 1000.0,            # single-tank volume cap (default 1000)
      "corrosion_allow_mm": 3.0,        # corrosion allowance (default 3)
      "allow_stress_mpa": 160.0,        # allowable design stress (default 160)
      "joint_eff": 0.85,                # weld joint efficiency E (default 0.85)
      "h_over_d": 0.8                    # height-to-diameter aspect (default 0.8)
    }

OUTPUT (JSON on stdout)
    Tank count, per-tank D x H, shell thickness + mass each, the total stored
    volume, plus a worked[] array (each line hand-checkable) and a _provenance
    block.

LICENCE: tool wrapper internal. Correlation cited inline (API 650 1-foot
method) — NO fabricated constants.
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
    "tool_name": "storage_tank_liquid_fuel (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "API Standard 650 'Welded Tanks for Oil Storage' — the 1-foot method "
        "for shell-course minimum thickness (clause 5.6.3): "
        "t = 4.9 D (H - 0.3) G / (S E) + CA, with D in m, H the design liquid "
        "height in m, G the product specific gravity, S the allowable stress "
        "in MPa, E the joint efficiency and CA the corrosion allowance."
    ),
    "physics_basis": (
        "Working volume from days-of-storage: V_req = daily_production x "
        "days_storage / fill_fraction (the fill fraction leaves ullage / "
        "overfill margin). Tank count from a single-tank volume cap. Per-tank "
        "cylinder geometry from V = (pi/4) D^2 H with H = (H/D) x D, giving "
        "D = (4 V / (pi (H/D)))^(1/3). Shell-course minimum thickness from the "
        "API 650 1-foot method (the membrane-hoop design condition evaluated "
        "0.3 m / 1 foot above the course bottom): t = 4.9 D (H - 0.3) G / (S E) "
        "+ corrosion allowance, FLOORED at the API 650 Table 5.6a practical "
        "minimum nominal plate thickness (6 mm for D <= 50 m) because the "
        "membrane-hoop design thickness on a squat low-SG product tank is far "
        "below what is fabricable / weldable / stable under wind + vacuum. "
        "DRY (empty) tank mass = cylindrical shell wall + flat bottom (annular) "
        "plate + cone roof (~1.05x plan area for slope + structural rafters) all "
        "x carbon-steel density 7850 kg/m3, then x 1.12 for nozzles / stairs / "
        "handrails / clips / a wind girder. A lateral-shell-only mass (the "
        "previous behaviour) understates the dry mass by ~2-3x and implies an "
        "impossible sub-millimetre average wall to a downstream physics critic."
    ),
    "confidence_class": "engineering_correlation",
    "last_reviewed_date": "2026-06-05",
}

STEEL_DENSITY_KG_M3 = 7850.0   # API 650 carbon-steel plate density
# API 650 1-foot method numeric coefficient (clause 5.6.3.2) for SI inputs
# (D in m, H in m, S in MPa): t[mm] = 4.9 x D x (H - 0.3) x G / (S x E) + CA.
API650_1FOOT_COEFF = 4.9
API650_1FOOT_OFFSET_M = 0.3    # the "1 foot" (~0.3 m) design-height offset
# API 650 Table 5.6a nominal-plate minimum: 6 mm for D <= 50 m (5 mm < 15 m in
# code, but 6 mm is the practical fabrication/weld/handling floor for a product
# tank). The membrane-hoop design thickness on a squat low-SG fuel tank can fall
# below 1 mm; flooring at this minimum is what makes the dry mass physical.
API650_MIN_SHELL_THICKNESS_MM = 6.0
ROOF_AREA_FACTOR = 1.05        # cone-roof plate area vs plan area (slope + rafters)
FITTINGS_MASS_FACTOR = 1.12    # +12% nozzles, stairs, handrails, clips, wind girder


def compute(payload: dict) -> dict:
    # ---- Required input ----
    if payload.get("daily_production_m3") is None:
        raise ValueError("daily_production_m3 is required")
    daily_production_m3 = float(payload["daily_production_m3"])

    days_storage = float(payload.get("days_storage", 14.0))
    fill_fraction = float(payload.get("fill_fraction", 0.9))
    product_density_kg_m3 = float(payload.get("product_density_kg_m3", 800.0))
    max_tank_m3 = float(payload.get("max_tank_m3", 1000.0))
    corrosion_allow_mm = float(payload.get("corrosion_allow_mm", 3.0))
    allow_stress_mpa = float(payload.get("allow_stress_mpa", 160.0))
    joint_eff = float(payload.get("joint_eff", 0.85))
    h_over_d = float(payload.get("h_over_d", 0.8))

    if daily_production_m3 <= 0:
        raise ValueError("daily_production_m3 must be > 0")
    if days_storage <= 0:
        raise ValueError("days_storage must be > 0")
    if not 0.1 <= fill_fraction <= 1.0:
        raise ValueError("fill_fraction must be in [0.1, 1.0]")
    if product_density_kg_m3 <= 0:
        raise ValueError("product_density_kg_m3 must be > 0")
    if max_tank_m3 <= 0:
        raise ValueError("max_tank_m3 must be > 0")
    if allow_stress_mpa <= 0:
        raise ValueError("allow_stress_mpa must be > 0")
    if not 0.0 < joint_eff <= 1.0:
        raise ValueError("joint_eff must be in (0, 1]")
    if h_over_d <= 0:
        raise ValueError("h_over_d must be > 0")

    # ---- Required storage volume + tank count ----
    v_req_m3 = daily_production_m3 * days_storage / fill_fraction
    tank_count = max(1, math.ceil(v_req_m3 / max_tank_m3))
    v_each_m3 = v_req_m3 / tank_count

    # ---- Per-tank cylinder geometry from H/D ----
    # V = (pi/4) D^2 H, H = (H/D) D  ->  V = (pi/4)(H/D) D^3
    #   -> D = (4 V / (pi (H/D)))^(1/3)
    diameter_m = (4.0 * v_each_m3 / (math.pi * h_over_d)) ** (1.0 / 3.0)
    height_m = h_over_d * diameter_m

    # ---- API 650 1-foot-method shell-course thickness ----
    sg = product_density_kg_m3 / 1000.0    # specific gravity (water = 1000 kg/m3)
    t_design_mm = API650_1FOOT_COEFF * diameter_m * (height_m - API650_1FOOT_OFFSET_M) * sg \
        / (allow_stress_mpa * joint_eff)
    t_membrane_mm = t_design_mm + corrosion_allow_mm
    # API 650 Table 5.6a practical minimum plate (6 mm for D <= 50 m). The
    # membrane-hoop thickness on a squat low-SG fuel tank is sub-millimetre; the
    # tank is governed by the fabrication/weld/wind floor, NOT membrane stress.
    t_mm = max(t_membrane_mm, API650_MIN_SHELL_THICKNESS_MM)

    # ---- Dry (empty) tank mass per tank ----
    # PHYSICAL rule: the dry mass is the cylindrical shell wall PLUS the flat
    # bottom (annular) plate PLUS the cone roof, then +12% for nozzles / stairs /
    # handrails / clips / wind girder. Lateral-shell-only (the previous formula)
    # understates by ~2-3x and implied a sub-millimetre wall to the physics critic.
    floor_area_m2 = math.pi / 4.0 * diameter_m ** 2
    shell_lateral_kg = math.pi * diameter_m * height_m * (t_mm / 1000.0) * STEEL_DENSITY_KG_M3
    floor_kg = floor_area_m2 * (t_mm / 1000.0) * STEEL_DENSITY_KG_M3
    roof_kg = ROOF_AREA_FACTOR * floor_area_m2 * (t_mm / 1000.0) * STEEL_DENSITY_KG_M3
    shell_mass_kg_each = (shell_lateral_kg + floor_kg + roof_kg) * FITTINGS_MASS_FACTOR

    # ===================== worked[] — chained off rounded intermediates ====
    v_req_r = round(v_req_m3, 3)
    v_each_r = round(v_each_m3, 3)
    diameter_m_r = round(diameter_m, 4)
    height_m_r = round(height_m, 4)
    sg_r = round(sg, 4)
    t_design_mm_r = round(t_design_mm, 4)
    t_membrane_mm_r = round(t_membrane_mm, 4)
    t_mm_r = round(t_mm, 3)
    shell_lateral_r = round(shell_lateral_kg, 2)
    floor_kg_r = round(floor_kg, 2)
    roof_kg_r = round(roof_kg, 2)
    shell_mass_r = round(shell_mass_kg_each, 2)

    worked = []
    worked.append(worked_calc(
        label="Required gross storage volume",
        formula="V_req = daily_production x days_storage / fill_fraction",
        values={"daily_production": (daily_production_m3, "m3/day"),
                "days_storage": (days_storage, "day"),
                "fill_fraction": (fill_fraction, "")},
        result=v_req_r, result_unit="m3",
        assumptions=[f"{days_storage} days of buffer storage",
                     f"fill fraction {fill_fraction} leaves ullage / overfill margin"],
    ))
    worked.append(worked_calc(
        label="Number of tanks (single-tank volume cap)",
        formula="n_tanks = ceil(V_req / max_tank)",
        values={"V_req": (v_req_r, "m3"), "max_tank": (max_tank_m3, "m3")},
        result=tank_count, result_unit="",
        assumptions=[f"single-tank volume capped at {max_tank_m3} m3", "minimum 1 tank"],
    ))
    worked.append(worked_calc(
        label="Volume per tank",
        formula="V_each = V_req / n_tanks",
        values={"V_req": (v_req_r, "m3"), "n_tanks": (tank_count, "")},
        result=v_each_r, result_unit="m3",
        assumptions=["required volume split evenly across the tank farm"],
    ))
    worked.append(worked_calc(
        label="Tank diameter from aspect ratio",
        formula="D = (4 x V_each / (pi x H_over_D))^(1/3)",
        values={"V_each": (v_each_r, "m3"), "H_over_D": (h_over_d, "")},
        result=diameter_m_r, result_unit="m",
        assumptions=["vertical cylinder V = (pi/4) D^2 H with H = (H/D) x D"],
    ))
    worked.append(worked_calc(
        label="Tank height",
        formula="H = H_over_D x D",
        values={"H_over_D": (h_over_d, ""), "D": (diameter_m_r, "m")},
        result=height_m_r, result_unit="m",
        assumptions=[f"H/D = {h_over_d} (squat atmospheric storage tank)"],
    ))
    worked.append(worked_calc(
        label="Shell-course thickness (API 650 1-foot method, floored at min plate)",
        formula="t = max( 4.9 x D x (H - 0.3) x SG / (S x E) + corr , t_min )",
        values={"D": (diameter_m_r, "m"), "H": (height_m_r, "m"), "SG": (sg_r, ""),
                "S": (allow_stress_mpa, "MPa"), "E": (joint_eff, ""),
                "corr": (corrosion_allow_mm, "mm"),
                "t_min": (API650_MIN_SHELL_THICKNESS_MM, "mm")},
        result=t_mm_r, result_unit="mm",
        assumptions=["API 650 clause 5.6.3 1-foot method (design condition, 0.3 m above course bottom)",
                     f"specific gravity SG = {sg_r} (product / water)",
                     f"membrane thickness {t_membrane_mm_r} mm (= design {t_design_mm_r} mm + {corrosion_allow_mm} mm corrosion)",
                     f"floored at API 650 Table 5.6a minimum plate {API650_MIN_SHELL_THICKNESS_MM} mm (squat low-SG tank is fabrication/weld/wind governed, not membrane-stress governed)"],
    ))
    worked.append(worked_calc(
        label="Dry tank mass per tank (shell + floor + roof + fittings)",
        formula="m = (pi x D x H + (1 + 1.05)(pi/4)D^2) x (t/1000) x rho x 1.12",
        values={"D": (diameter_m_r, "m"), "H": (height_m_r, "m"), "t": (t_mm_r, "mm"),
                "rho": (STEEL_DENSITY_KG_M3, "kg/m3")},
        result=shell_mass_r, result_unit="kg",
        assumptions=[f"lateral shell {shell_lateral_r} kg + flat bottom plate {floor_kg_r} kg + cone roof {roof_kg_r} kg (roof 1.05x plan area for slope + rafters)",
                     "x1.12 for nozzles / stairs / handrails / clips / wind girder",
                     "carbon-steel density 7850 kg/m3",
                     "(was lateral-shell-only before 2026-06-05 fix — understated dry mass ~2-3x and implied a sub-mm wall to the physics critic)"],
    ))

    return {
        "tank_count": tank_count,
        "tank_diameter_m": round(diameter_m, 4),
        "tank_height_m": round(height_m, 4),
        "shell_thickness_mm": round(t_mm, 3),
        "shell_mass_kg_each": round(shell_mass_kg_each, 2),
        "total_volume_m3": round(v_req_m3, 3),
        "days_storage": days_storage,
        "volume_per_tank_m3": round(v_each_m3, 3),
        "shell_mass_kg_total": round(shell_mass_kg_each * tank_count, 2),
        "product_density_kg_m3": product_density_kg_m3,
        "fill_fraction": fill_fraction,
        "worked": worked,
        "data_sources": [
            "API Standard 650 'Welded Tanks for Oil Storage' clause 5.6.3 — 1-foot-method shell thickness",
            "API 650 — carbon-steel plate density 7850 kg/m3 for shell mass",
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
