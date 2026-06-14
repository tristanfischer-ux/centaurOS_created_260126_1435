#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/corrosion_anode_sizing.py

Sacrificial anode sizing for AUV / marine structure cathodic protection.

Faraday's law:
    m_anode = (i × t × M_at) / (n × F × efficiency)
where:
    i = protection current density (A/m²)
    t = service life (s)
    M_at = atomic mass (Zn 65.4, Al 27.0, Mg 24.3)
    n = valence (Zn 2, Al 3, Mg 2)
    F = Faraday constant 96485 C/mol

Practical: capacity in A-hr/kg:
- Zinc: 780 A-hr/kg (theoretical 820)
- Aluminium-Zn-In (Al-Zn-In): 2600 A-hr/kg
- Magnesium: 1230 A-hr/kg (high but excessive in seawater)

Protection current densities (DNV-RP-B401):
- Painted seawater steel: 5-15 mA/m² (cathodic boundary)
- Bare steel seawater: 100-150 mA/m²
- Stainless steel: 1-3 mA/m²
- Aluminium alloys: 5-15 mA/m²
- Cu alloys (Ni-Al-Bronze): 5-10 mA/m²
- High-salinity polar (Arctic): 25-40 mA/m²

Anode selection:
- Zn: low driving voltage (-1.05 V), safe for Al hulls
- Al-Zn-In: highest capacity, current marine standard
- Mg: highest driving voltage (-1.50 V), overprotects (H embrittlement)

References:
- DNV-RP-B401 (2021) Cathodic Protection Design
- NACE SP0176-2007 Corrosion Control of Submerged Areas
- Ashworth & Booker, "Cathodic Protection: Theory and Practice", 2007
- Wilson, "Cathodic protection for ships" Birmingham U PhD 2001
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'corrosion_anode_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "DNV-RP-B401 'Cathodic protection design' (2017)",
    "physics_basis": 'Anode mass m = (I_avg × t_design × 8760) / (E × u). Currents per protected area × current density per DNV-RP-B401 Table A-4.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Anode properties (capacity, density, cost)
ANODE_MATERIAL: dict[str, dict] = {
    "zinc":               {"capacity_ahkg": 780,  "density_kg_m3": 7140, "cost_gbp_kg": 3.50,
                            "driving_v": -1.05, "alloy": "MIL-A-18001K"},
    "aluminium_zinc_indium": {"capacity_ahkg": 2600, "density_kg_m3": 2750, "cost_gbp_kg": 4.20,
                            "driving_v": -1.10, "alloy": "Al-Zn-In (NACE)"},
    "magnesium":          {"capacity_ahkg": 1230, "density_kg_m3": 1740, "cost_gbp_kg": 4.80,
                            "driving_v": -1.50, "alloy": "AZ-63"},
}

# Protection current density by hull material and environment (mA/m²)
PROTECTION_CURRENT_MA_M2: dict[str, dict] = {
    # hull_material -> environment -> mA/m²
    "carbon_steel": {"normal": 100, "polar": 40, "tropical": 130, "shallow_dynamic": 150},
    "stainless_316": {"normal": 3, "polar": 5, "tropical": 5, "shallow_dynamic": 8},
    "aluminium_5083": {"normal": 10, "polar": 15, "tropical": 15, "shallow_dynamic": 20},
    "ni_al_bronze": {"normal": 6, "polar": 10, "tropical": 8, "shallow_dynamic": 12},
    "titanium": {"normal": 0, "polar": 0, "tropical": 0, "shallow_dynamic": 0},   # CP not needed
    "painted_steel": {"normal": 10, "polar": 5, "tropical": 15, "shallow_dynamic": 25},
}

# Anode efficiency factors
ANODE_EFFICIENCY: dict[str, float] = {
    "zinc": 0.90,
    "aluminium_zinc_indium": 0.85,
    "magnesium": 0.55,    # less efficient due to self-corrosion
}


def compute(payload: dict) -> dict:
    hull_material = safe_choice(str(payload.get("hull_material", "aluminium_5083")).lower(), PROTECTION_CURRENT_MA_M2, default="aluminium_5083", label="hull_material")
    hull_area_m2 = float(payload.get("hull_area_m2", 5.0))
    salinity = float(payload.get("salinity_ppt", 35))
    water_temp = float(payload.get("water_temp_c", 10))
    mission_life_years = float(payload.get("mission_life_years", 5))
    anode_material = safe_choice(str(payload.get("anode_material", "aluminium_zinc_indium")).lower(), ANODE_MATERIAL, default="aluminium_zinc_indium", label="anode_material")

    if hull_material not in PROTECTION_CURRENT_MA_M2:
        return {"error": f"Unknown hull_material. Available: {list(PROTECTION_CURRENT_MA_M2.keys())}"}
    if anode_material not in ANODE_MATERIAL:
        return {"error": f"Unknown anode_material. Available: {list(ANODE_MATERIAL.keys())}"}

    # Determine environment (cold polar / normal / tropical)
    if water_temp < 5:
        env = "polar"
    elif water_temp > 22:
        env = "tropical"
    elif salinity < 30:
        env = "shallow_dynamic"   # brackish (estuary) treated as harsh
    else:
        env = "normal"

    current_density_ma_m2 = PROTECTION_CURRENT_MA_M2[hull_material][env]
    if current_density_ma_m2 == 0:
        return {
            "hull_material": hull_material,
            "anode_mass_kg": 0,
            "anode_count": 0,
            "replacement_interval_years": 999,
            "notes": "Titanium hull - no cathodic protection required.",
            "current_density_ma_m2": 0,
        }

    # Total protection current
    total_current_ma = current_density_ma_m2 * hull_area_m2
    total_current_a = total_current_ma / 1000.0
    # Total charge for mission life
    service_hours = mission_life_years * 8760
    total_charge_ah = total_current_a * service_hours

    # Anode capacity (effective)
    anode_props = ANODE_MATERIAL[anode_material]
    effective_capacity = anode_props["capacity_ahkg"] * ANODE_EFFICIENCY[anode_material]

    # Anode mass required
    anode_mass_kg = total_charge_ah / effective_capacity

    # Worked calculations — built from the same live variables above.
    # Anode count selection and replacement interval are branchy — skipped.
    total_current_a_r = round(total_current_a, 3)
    service_hours_r = round(service_hours, 0)
    total_charge_ah_r = round(total_charge_ah, 0)
    effective_capacity_r = round(effective_capacity, 0)
    # Derive anode_mass_kg_r from the same rounded inputs shown in the substitution so
    # that Q_total_r / C_eff_r reproduces the stated result exactly.
    anode_mass_kg_r = round(total_charge_ah_r / effective_capacity_r, 4)
    worked = [
        worked_calc(
            label="Total protection current",
            formula="I_total = i_density x A_hull / 1000",
            values={
                "i_density": (current_density_ma_m2, "mA/m2"),
                "A_hull": (hull_area_m2, "m2"),
            },
            result=total_current_a_r, result_unit="A",
            assumptions=[
                f"current density from DNV-RP-B401 Table A-4 for {hull_material} in {env} environment",
                "divide by 1000 converts mA to A",
            ],
        ),
        worked_calc(
            label="Service hours for mission life",
            formula="t_service = life_years x 8760",
            values={"life_years": (mission_life_years, "yr")},
            result=service_hours_r, result_unit="hr",
            assumptions=["8760 hr/yr (365 days x 24 h)"],
        ),
        worked_calc(
            label="Total charge required",
            formula="Q_total = I_total x t_service",
            values={
                "I_total": (total_current_a_r, "A"),
                "t_service": (service_hours_r, "hr"),
            },
            result=total_charge_ah_r, result_unit="A-hr",
            assumptions=["constant current draw over full service life"],
        ),
        worked_calc(
            label="Effective anode capacity",
            formula="C_eff = C_rated x efficiency",
            values={
                "C_rated": (anode_props["capacity_ahkg"], "A-hr/kg"),
                "efficiency": (ANODE_EFFICIENCY[anode_material], ""),
            },
            result=effective_capacity_r, result_unit="A-hr/kg",
            assumptions=[f"anode material {anode_material}; efficiency accounts for self-corrosion losses"],
        ),
        worked_calc(
            label="Anode mass required",
            formula="m_anode = Q_total / C_eff",
            values={
                "Q_total": (total_charge_ah_r, "A-hr"),
                "C_eff": (effective_capacity_r, "A-hr/kg"),
            },
            result=anode_mass_kg_r, result_unit="kg",
            assumptions=["Faraday-law equivalent; anode count and size selected from standard sizes (branchy — not shown)"],
        ),
    ]

    # Typical anode sizes: 5, 10, 15, 25 kg
    standard_sizes = [2, 5, 10, 15, 25, 40, 60]
    # Pick smallest size that gives whole multiples
    anode_count = max(1, int(anode_mass_kg / 10) + 1)   # use 10kg as base
    if anode_count > 6:
        anode_size = 25
    elif anode_count > 3:
        anode_size = 15
    elif anode_count > 1:
        anode_size = 10
    else:
        anode_size = 5
    anode_count = max(1, int(anode_mass_kg / anode_size + 1))
    actual_mass_kg = anode_count * anode_size

    # Replacement interval (when anode 80% consumed)
    consumption_per_year_kg = anode_mass_kg / mission_life_years
    replacement_interval_years = mission_life_years
    if actual_mass_kg > anode_mass_kg:
        # Anode oversized → lasts longer
        replacement_interval_years = mission_life_years * (actual_mass_kg / max(0.1, anode_mass_kg)) * 0.8

    # Cost
    anode_cost_gbp = actual_mass_kg * anode_props["cost_gbp_kg"]
    install_cost_gbp = anode_count * 50  # £50 per attach (weld or bolt)

    return {
        "hull_material": hull_material,
        "hull_area_m2": hull_area_m2,
        "environment": env,
        "salinity_ppt": salinity,
        "water_temp_c": water_temp,
        "current_density_ma_m2": current_density_ma_m2,
        "total_current_required_a": total_current_a_r,
        "total_charge_required_ah": total_charge_ah_r,
        "anode_material": anode_material,
        "anode_alloy": anode_props["alloy"],
        "anode_capacity_ahkg": anode_props["capacity_ahkg"],
        "anode_efficiency": ANODE_EFFICIENCY[anode_material],
        "anode_effective_capacity_ahkg": effective_capacity_r,
        "anode_mass_kg_calculated": anode_mass_kg_r,
        "anode_count": anode_count,
        "anode_size_kg_each": anode_size,
        "anode_mass_kg_actual_installed": actual_mass_kg,
        "replacement_interval_years": round(replacement_interval_years, 1),
        "mission_life_years": mission_life_years,
        "anode_consumption_kg_per_year": round(consumption_per_year_kg, 2),
        "anode_cost_gbp": round(anode_cost_gbp, 0),
        "install_cost_gbp": round(install_cost_gbp, 0),
        "total_cost_gbp": round(anode_cost_gbp + install_cost_gbp, 0),
        "driving_voltage_v": anode_props["driving_v"],
        "notes": (
            "Anode mass per DNV-RP-B401. Al-Zn-In has highest capacity per kg "
            "and lowest mass for given service life. Zinc safer for Al hulls. "
            "Mg over-protects steel - can cause hydrogen embrittlement. "
            "Replace at 80% consumption to maintain protection margin."
        ),
        "worked": worked,
    }


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
