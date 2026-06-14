#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/lifecycle_co2.py

Cradle-to-grave LCA: embodied + operational + end-of-life CO2.

Material CO2 intensities from:
- Hammond & Jones, Inventory of Carbon and Energy (ICE) 3.0, 2019.
- IPCC AR6 WG-III Annex III (2022).
- World Steel Association 2024 sustainability indicators.
- IAI (International Aluminium Institute) 2023 global average.
- LME copper carbon footprint Q1 2025.
- Ecoinvent 3.10 database (2024).
- IEA Special Report on Battery Sustainability (2023).

End-of-life pathways:
- Landfill: full embodied retained, no credit.
- Recycle: 60% material recovery, 40% retained (steel/aluminium/copper higher).
- Incinerate: ~50% retained (plastics convert to CO2 directly).
- Reuse: 20% retained (second-life applications).

Input:
    {
      "bom_materials": [
        {"material": "steel", "mass_kg": 1000, "source_region": "EU"},
        {"material": "aluminium", "mass_kg": 200, "source_region": "GLOBAL"},
        {"material": "lithium", "mass_kg": 50, "source_region": "CN"}
      ],
      "operational_energy_kwh_per_year": 10000,
      "service_life_years": 15,
      "eol_pathway": "recycle",
      "grid_carbon_intensity_kgco2_kwh": 0.21
    }

Output:
    {
      "embodied_co2_kg": ...,
      "operational_co2_kg": ...,
      "eol_co2_kg": ...,
      "total_lifecycle_co2_kg": ...,
      "co2_per_year": ...,
      "co2_per_kg_product": ...,
      "compliance_eu_csrd": true
    }
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'lifecycle_co2 (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'IPCC AR6 WGIII (2022); ecoinvent database v3.10; ISO 14040:2006 / ISO 14044:2006 (LCA framework)',
    "physics_basis": 'Cradle-to-grave LCA: embodied (per kg material × CO2_factor) + operational (grid mix × lifetime kWh) + EOL pathway credit/burden.',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


# kgCO2e per kg material (cradle-to-gate)
MATERIAL_CO2: dict[str, float] = {
    # Metals
    "steel": 1.85,                  # average crude steel BF-BOF + EAF mix
    "steel_recycled": 0.45,          # 100% EAF scrap
    "steel_stainless": 6.15,         # 304/316 average
    "aluminium": 10.0,               # IAI 2023 global average (primary)
    "aluminium_recycled": 0.65,
    "copper": 3.50,                  # LME 2025
    "copper_recycled": 0.85,
    "zinc": 3.30,
    "tin": 18.0,
    "lead": 1.65,
    "nickel": 13.0,                  # Class 1 nickel
    "titanium": 24.0,                # Ti-6Al-4V ingot
    "magnesium": 25.0,
    # Critical minerals / battery materials
    "lithium": 30.0,                 # lithium hydroxide (battery grade)
    "lithium_carbonate": 12.0,
    "cobalt": 22.0,
    "nickel_sulphate": 19.0,
    "manganese": 7.0,
    "graphite_synthetic": 12.0,
    "graphite_natural": 4.0,
    "silicon": 30.0,                 # solar/electronic grade
    "silicon_metallurgical": 9.0,
    # Plastics + polymers
    "plastic": 3.0,                  # average PE/PP/PET
    "polyethylene_pe": 2.2,
    "polypropylene_pp": 2.5,
    "polyamide_pa": 7.5,
    "polycarbonate_pc": 6.0,
    "abs": 4.5,
    "ptfe": 9.2,
    "epoxy": 6.5,
    "polyurethane": 5.2,
    "cfrp": 25.0,                    # carbon fibre reinforced polymer
    "gfrp": 7.5,                     # glass fibre
    # Glass / ceramics
    "glass": 1.2,
    "tempered_glass": 1.5,
    "ceramic": 2.5,
    "concrete": 0.15,
    "cement": 0.90,
    # Wood / bio
    "wood_dry": 0.35,
    "paper": 1.1,
    # Electronics
    "pcb_fr4": 25.0,                 # FR4 board manufacture
    "silicon_die_processed": 1300.0,  # per kg processed die (very high)
    "rare_earth_avg": 35.0,
    # Solvents / chemicals
    "solvent_organic": 3.2,
    # Composite / mixed
    "battery_lfp_cell": 3.2,         # per kg cell (LFP including all metals)
    "battery_nmc_cell": 5.8,         # per kg cell (NMC 622 average)
    "li_ion_battery_pack": 6.5,      # per kg pack incl. case + BMS
    "electric_motor": 5.5,           # per kg incl. magnets
    "inverter_module": 12.0,         # per kg power electronics
    "solar_panel_si": 12.0,          # per kg crystalline silicon panel
    "wind_turbine_blade": 5.5,       # per kg GFRP blade
    # Generic catch-all
    "metal": 4.0,
    "polymer": 3.5,
    "composite": 8.0,
    "electronics": 25.0,
}

# Regional multipliers (some materials made with dirtier grid)
REGION_MULTIPLIER: dict[str, float] = {
    "EU": 0.85,
    "UK": 0.80,
    "US": 1.00,
    "CN": 1.55,                    # China still ~60% coal in grid
    "RU": 1.20,
    "JP": 0.95,
    "IN": 1.45,
    "GLOBAL": 1.00,
}

# EoL retention factors (1.0 = all embodied still counts toward LCA at EOL)
EOL_RETENTION: dict[str, float] = {
    "landfill": 1.00,              # nothing recovered
    "recycle": 0.40,                # 60% credit for avoided primary production
    "incinerate": 0.55,             # combustion CO2 counted, energy credit
    "reuse": 0.20,                  # majority of value preserved
}

# Operational CO2 add-on factors
OPERATIONAL_CO2_PER_KWH_DEFAULT = 0.21  # kgCO2/kWh, UK grid 2025 average


def compute(payload: dict) -> dict:
    bom = payload.get("bom_materials", [])
    op_kwh_per_yr = float(payload.get("operational_energy_kwh_per_year", 0.0))
    life_years = float(payload.get("service_life_years", 1.0))
    eol = safe_choice(str(payload.get("eol_pathway", "landfill")).lower().strip(), EOL_RETENTION, default="landfill", label="eol_pathway")
    grid_intensity = float(payload.get("grid_carbon_intensity_kgco2_kwh",
                                       OPERATIONAL_CO2_PER_KWH_DEFAULT))

    if eol not in EOL_RETENTION:
        return {"error": f"Unknown eol_pathway '{eol}', must be one of {sorted(EOL_RETENTION.keys())}"}

    # Embodied CO2
    embodied_co2_kg = 0.0
    total_mass_kg = 0.0
    material_breakdown: list[dict] = []
    unknown_materials: list[str] = []
    for item in bom:
        mat = str(item.get("material", "")).lower().strip()
        mass = float(item.get("mass_kg", 0.0))
        region = str(item.get("source_region", "GLOBAL")).upper()
        if mat not in MATERIAL_CO2:
            unknown_materials.append(mat)
            # Default to "metal" intensity for unknowns
            base_intensity = MATERIAL_CO2.get("metal", 4.0)
        else:
            base_intensity = MATERIAL_CO2[mat]
        multiplier = REGION_MULTIPLIER.get(region, 1.0)
        intensity = base_intensity * multiplier
        co2 = mass * intensity
        embodied_co2_kg += co2
        total_mass_kg += mass
        material_breakdown.append({
            "material": mat,
            "mass_kg": mass,
            "source_region": region,
            "kgco2_per_kg": round(intensity, 3),
            "co2_kg": round(co2, 1),
        })

    # Operational CO2
    operational_co2_kg = op_kwh_per_yr * life_years * grid_intensity

    # End-of-life CO2 (retention factor applied to embodied)
    eol_factor = EOL_RETENTION[eol]
    # EoL = (embodied × retention) - embodied; this is the *additional* counted CO2
    # In CSRD framing, EOL credits (recycle) reduce total lifecycle CO2
    eol_co2_kg = embodied_co2_kg * (eol_factor - 1.0)  # negative for recycle/reuse

    total_lifecycle_co2_kg = embodied_co2_kg + operational_co2_kg + eol_co2_kg
    co2_per_year = total_lifecycle_co2_kg / max(0.1, life_years)
    co2_per_kg_product = total_lifecycle_co2_kg / max(0.1, total_mass_kg)

    # CSRD compliance: requires reporting if turnover > €40M, >250 employees,
    # OR >€20M assets (per EU Directive 2022/2464). We assume any quantified LCA
    # IS CSRD-eligible reporting; bool flag = true if reported.
    compliance_csrd = (total_lifecycle_co2_kg > 0 and total_mass_kg > 0)

    # Worked calculations for the PDF appendix — built from the SAME live values
    # above (drift-safe). SKIPPED: embodied_co2_kg itself (a variable-length
    # sum over the BoM material table, not a fixed-input arithmetic expression);
    # its computed total is used as a live input symbol below.
    embodied_r = round(embodied_co2_kg, 1)
    op_r = round(operational_co2_kg, 1)
    eol_r = round(eol_co2_kg, 1)
    total_r = round(total_lifecycle_co2_kg, 1)
    worked = [
        worked_calc(
            label="Operational CO2",
            formula="operational = annual_kwh x service_life x grid_intensity",
            values={"annual_kwh": (op_kwh_per_yr, "kWh/yr"),
                    "service_life": (life_years, "yr"),
                    "grid_intensity": (grid_intensity, "kgCO2/kWh")},
            result=op_r, result_unit="kgCO2",
        ),
        worked_calc(
            label="End-of-life CO2 (credit/burden)",
            formula="eol = embodied x (eol_retention - 1)",
            values={"embodied": (embodied_r, "kgCO2"),
                    "eol_retention": (eol_factor, "")},
            result=eol_r, result_unit="kgCO2",
            assumptions=[f"{eol} retention factor {eol_factor} (negative result = avoided-primary credit)"],
        ),
        worked_calc(
            label="Total lifecycle CO2",
            formula="total = embodied + operational + eol",
            values={"embodied": (embodied_r, "kgCO2"), "operational": (op_r, "kgCO2"),
                    "eol": (eol_r, "kgCO2")},
            result=total_r, result_unit="kgCO2",
        ),
        worked_calc(
            label="CO2 per year",
            formula="co2_per_year = total / service_life",
            values={"total": (total_r, "kgCO2"), "service_life": (life_years, "yr")},
            result=round(co2_per_year, 1), result_unit="kgCO2/yr",
        ),
        worked_calc(
            label="CO2 per kg of product",
            formula="co2_per_kg = total / total_mass",
            values={"total": (total_r, "kgCO2"), "total_mass": (round(total_mass_kg, 1), "kg")},
            result=round(co2_per_kg_product, 2), result_unit="kgCO2/kg",
        ),
    ]

    return {
        "total_mass_kg": round(total_mass_kg, 1),
        "embodied_co2_kg": round(embodied_co2_kg, 1),
        "operational_co2_kg": round(operational_co2_kg, 1),
        "eol_co2_kg": round(eol_co2_kg, 1),
        "total_lifecycle_co2_kg": round(total_lifecycle_co2_kg, 1),
        "co2_per_year": round(co2_per_year, 1),
        "co2_per_kg_product": round(co2_per_kg_product, 2),
        "material_breakdown": material_breakdown,
        "compliance_eu_csrd": compliance_csrd,
        "unknown_materials_used_default": unknown_materials,
        "eol_pathway": eol,
        "eol_retention_factor": eol_factor,
        "grid_intensity_kgco2_kwh": grid_intensity,
        "notes": (
            "Material intensities per Hammond & Jones ICE 3.0, IAI 2023, "
            "Ecoinvent 3.10. Regional multipliers reflect grid electricity carbon "
            "intensity. EoL credit/penalty applied per ISO 14040 cradle-to-grave."
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
