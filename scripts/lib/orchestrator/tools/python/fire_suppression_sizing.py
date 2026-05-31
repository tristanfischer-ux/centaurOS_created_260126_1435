#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/fire_suppression_sizing.py

Clean agent fire suppression sizing per NFPA 2001 / ISO 14520.

Design concentrations + agent properties:
- Novec 1230 (FK-5-1-12): 4.2% min for Class A; 4.5% for Li-ion (UL approved).
  Density at 20°C: 1.6 kg/m³ in vapour phase.
  Liquid density: 1620 kg/m³.
- FM-200 (HFC-227ea): 6.25% min Class A; 7% adjusted for Li-ion.
  Vapour density 20°C: 1.5 kg/m³.
  Liquid density: 1407 kg/m³.
- Inert (IG-541 Inergen, IG-55, IG-100): 37.5-43% design concentration.
  No liquid - high-pressure compressed gas.

Mass calculation (NFPA 2001 Eq. 4.4.2.1.1):
    W = V/s × (C/(100-C))    in kg

where:
    V = protected volume (m³)
    s = specific volume of superheated agent (m³/kg, varies with temp)
    C = design concentration (%)

Typical specific volumes (s) at 20°C:
- Novec 1230: 0.0719 m³/kg
- FM-200: 0.1374 m³/kg
- IG-541: 0.66 m³/kg

Discharge time (NFPA 2001):
- Halocarbon agents: ≤10s for 95% of design concentration
- Inert: ≤60s (some allow 120s with special listing)

Retention time (concealed enclosures):
- Minimum 10 minutes per NFPA 2001 4.7.2

References:
- NFPA 2001:2022 Clean Agent Fire Extinguishing Systems
- ISO 14520-1:2023 Gaseous fire-extinguishing systems
- 3M Novec 1230 Engineering Manual
- DuPont FM-200 Design Manual
- UL EX1741 lithium-ion battery fire suppression (2024)
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'fire_suppression_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "NFPA 2001:2022 'Standard on Clean Agent Fire Extinguishing Systems'; UL EX1741 listing data",
    "physics_basis": 'Agent mass m = V_room × ρ_agent × (C_design / (100 - C_design)). Safety factor + leakage allowance per NFPA 2001.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Agent properties
AGENT_PROPS: dict[str, dict] = {
    "novec_1230": {
        "name": "Novec 1230 (FK-5-1-12)",
        "min_design_c_pct_class_a": 4.2,
        "design_c_pct_lithium_ion": 4.5,
        "specific_volume_m3_kg_at_20c": 0.0719,
        "liquid_density_kg_m3": 1620,
        "molecular_weight_kg_kmol": 316.0,
        "gwp": 1,
        "odp": 0,
        "discharge_time_max_s": 10,
        "cylinder_size_kg_typ": 64,
        "cost_gbp_per_kg": 65,
    },
    "fm-200": {
        "name": "FM-200 (HFC-227ea)",
        "min_design_c_pct_class_a": 6.25,
        "design_c_pct_lithium_ion": 7.0,
        "specific_volume_m3_kg_at_20c": 0.1374,
        "liquid_density_kg_m3": 1407,
        "molecular_weight_kg_kmol": 170.0,
        "gwp": 3220,
        "odp": 0,
        "discharge_time_max_s": 10,
        "cylinder_size_kg_typ": 64,
        "cost_gbp_per_kg": 28,
    },
    "inert_ig-541": {
        "name": "Inergen (IG-541, N2/Ar/CO2)",
        "min_design_c_pct_class_a": 37.5,
        "design_c_pct_lithium_ion": 43.0,
        "specific_volume_m3_kg_at_20c": 0.66,
        "liquid_density_kg_m3": 0,         # gas only
        "molecular_weight_kg_kmol": 34.0,
        "gwp": 0,
        "odp": 0,
        "discharge_time_max_s": 60,
        "cylinder_size_kg_typ": 80,
        "cost_gbp_per_kg": 12,
    },
    "inert_ig-100": {
        "name": "Nitrogen (IG-100)",
        "min_design_c_pct_class_a": 40.3,
        "design_c_pct_lithium_ion": 43.0,
        "specific_volume_m3_kg_at_20c": 0.86,
        "liquid_density_kg_m3": 0,
        "molecular_weight_kg_kmol": 28.0,
        "gwp": 0,
        "odp": 0,
        "discharge_time_max_s": 60,
        "cylinder_size_kg_typ": 80,
        "cost_gbp_per_kg": 8,
    },
}


def compute(payload: dict) -> dict:
    agent = str(payload.get("agent", "novec_1230")).lower().replace(" ", "_")
    # Map common aliases
    aliases = {
        "novec1230": "novec_1230", "novec": "novec_1230", "fk-5-1-12": "novec_1230",
        "fm200": "fm-200", "hfc-227ea": "fm-200",
        "ig541": "inert_ig-541", "inergen": "inert_ig-541",
        "n2": "inert_ig-100", "nitrogen": "inert_ig-100",
        "inert": "inert_ig-541",
    }
    agent = aliases.get(agent, agent)

    if agent not in AGENT_PROPS:
        return {"error": f"Unknown agent '{agent}'. Available: {list(AGENT_PROPS.keys())}"}

    props = AGENT_PROPS[agent]
    volume_m3 = float(payload.get("volume_m3", 100))
    design_c_pct = float(payload.get("design_concentration_pct", 0))

    # If no design_c specified, use lithium-ion default (since this tool
    # is BESS-class primary use case)
    if design_c_pct == 0:
        design_c_pct = props["design_c_pct_lithium_ion"]

    # NFPA 2001 mass: W = V/s × (C/(100-C))
    if design_c_pct >= 100:
        return {"error": "design_concentration_pct must be < 100"}
    s = props["specific_volume_m3_kg_at_20c"]
    mass_kg = (volume_m3 / s) * (design_c_pct / (100.0 - design_c_pct))

    # 10% safety factor
    mass_kg_with_sf = mass_kg * 1.10

    # Cylinder count
    cyl_typ = props["cylinder_size_kg_typ"]
    cylinder_count = math.ceil(mass_kg_with_sf / cyl_typ)
    actual_charge_kg = cylinder_count * cyl_typ

    # Retention time (minutes) - 10 min minimum per NFPA 2001 4.7.2
    # Real value depends on enclosure leakage (door fan test). Default 10 min.
    retention_minutes = 10.0

    # Cost estimate
    agent_cost_gbp = actual_charge_kg * props["cost_gbp_per_kg"]
    cylinder_hw_gbp = cylinder_count * 2500  # cylinder + valve + manifold + brackets
    pipe_nozzle_gbp = volume_m3 * 12          # rough £12/m³ for distribution piping
    detection_gbp = 8000                       # smoke/heat panel + AHJ acceptance
    total_install_gbp = agent_cost_gbp + cylinder_hw_gbp + pipe_nozzle_gbp + detection_gbp

    # Compliance summary
    is_lithium_design = design_c_pct >= props["design_c_pct_lithium_ion"]
    sufficient = mass_kg_with_sf >= (volume_m3 / s) * (props["design_c_pct_lithium_ion"] /
                                                        (100.0 - props["design_c_pct_lithium_ion"]))

    return {
        "agent": agent,
        "agent_name": props["name"],
        "volume_m3": volume_m3,
        "design_concentration_pct": design_c_pct,
        "agent_mass_kg": round(mass_kg, 1),
        "agent_mass_kg_with_safety_factor": round(mass_kg_with_sf, 1),
        "discharge_time_s": props["discharge_time_max_s"],
        "total_cylinder_count": cylinder_count,
        "cylinder_size_kg": cyl_typ,
        "actual_charge_kg": actual_charge_kg,
        "retention_time_minutes": retention_minutes,
        "agent_cost_gbp": round(agent_cost_gbp),
        "cylinder_hardware_gbp": round(cylinder_hw_gbp),
        "pipe_nozzle_gbp": round(pipe_nozzle_gbp),
        "detection_panel_gbp": round(detection_gbp),
        "total_installed_cost_gbp": round(total_install_gbp),
        "is_lithium_ion_design": is_lithium_design,
        "sufficient_for_lithium_ion": sufficient,
        "gwp": props["gwp"],
        "odp": props["odp"],
        "notes": (
            f"Mass per NFPA 2001 Eq. 4.4.2.1.1, 10% safety factor. "
            f"For Li-ion suppression, UL EX1741 requires {props['design_c_pct_lithium_ion']}% "
            f"design concentration (vs {props['min_design_c_pct_class_a']}% for Class A only). "
            f"Retention 10 min per NFPA 2001 4.7.2; verify via door fan test."
        ),
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
