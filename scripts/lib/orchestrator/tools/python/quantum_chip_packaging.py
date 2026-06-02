#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/quantum_chip_packaging.py

Chip-integrated quantum photonics — cost, optical loss, thermal dissipation
for a packaged QKD or QPU chip.

Companies served: KETS Quantum Security (Bristol UK chip spinout), Q-Photon,
Quix Quantum, Ligentec (CH/EU silicon nitride photonics).

Input:
    {
      "chip_size_mm2": 25.0,
      "num_components": 100,
      "wafer_material": "Si" | "SiO2" | "SOI" | "InP" | "SiN" | "LiNbO3",
      "yield_pct": 70.0,
      "wafer_size_inch": 6.0,
      "wafer_cost_gbp": 5000.0,
      "components_per_chip": 100,
      "fibre_facet_count": 4
    }

Output:
    cost_per_chip_gbp, optical_loss_db_per_facet, thermal_dissipation_w,
    chips_per_wafer, yielded_chips_per_wafer, edge_emitter_count,
    _provenance.

Physics:
  Chips per wafer (Murphy's law, integrated yield):
    N_chip = pi * (D/2)^2 / A_chip
    yield = exp(-A_chip * D_defect / 100^2)
  Optical loss per facet ~ 0.5-3 dB (Si edge coupler ~ 1 dB)
  Cost = wafer_cost / (N_yielded) + packaging

References:
- Bogaerts, W. et al., "Silicon photonics design rules", J. Lightwave
  Tech. 33(6):1224-1240, 2015.
- Cheben, P. et al., "Subwavelength integrated photonics", Nature 560:
  565-572, 2018. DOI: 10.1038/s41586-018-0421-7
- Murphy, B.T., "Cost-size optima of monolithic integrated circuits",
  Proc. IEEE 52(12):1537-1545, 1964.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


PROVENANCE = {
    "tool_name": "quantum_chip_packaging (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Bogaerts et al. (2015) J. Lightwave Tech. 33(6):1224 "
        "DOI:10.1109/JLT.2015.2399156; "
        "Cheben et al. (2018) Nature 560:565 DOI:10.1038/s41586-018-0421-7; "
        "Murphy (1964) Proc. IEEE 52(12):1537."
    ),
    "physics_basis": (
        "Wafer yield from Murphy's law Y = ((1-exp(-AD))/(AD))^2 for "
        "compound defects. Coupler loss empirical from foundry PDKs. "
        "Cost = wafer + packaging / yielded chips."
    ),
    "confidence_class": "industry_typical",
    "embedded_constants": {
        "DEFECT_DENSITY_PER_CM2": {
            "source": "imec / GlobalFoundries PDK guides — D_defect ~ 0.5/cm^2 silicon photonics, 2/cm^2 InP",
            "confidence": "industry_typical",
        },
        "COUPLER_LOSS_DB": {
            "source": "imec SiPhoton PDK 2023: edge coupler 1.0 dB; grating coupler 3-5 dB; SiN 0.5 dB",
            "confidence": "datasheet",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Material properties: defect density (per cm^2) and per-facet loss (dB)
MATERIALS = {
    "Si":      {"defect_density_per_cm2": 0.5, "loss_per_facet_db": 1.0, "wafer_cost_factor": 1.0},
    "SOI":     {"defect_density_per_cm2": 0.6, "loss_per_facet_db": 1.5, "wafer_cost_factor": 1.5},
    "SiO2":    {"defect_density_per_cm2": 0.3, "loss_per_facet_db": 0.5, "wafer_cost_factor": 0.8},
    "InP":     {"defect_density_per_cm2": 2.0, "loss_per_facet_db": 2.5, "wafer_cost_factor": 3.0},
    "SiN":     {"defect_density_per_cm2": 0.4, "loss_per_facet_db": 0.5, "wafer_cost_factor": 1.2},
    "LiNbO3":  {"defect_density_per_cm2": 1.5, "loss_per_facet_db": 1.5, "wafer_cost_factor": 5.0},
    "GaAs":    {"defect_density_per_cm2": 1.0, "loss_per_facet_db": 2.0, "wafer_cost_factor": 2.5},
}

# Power per active component (mW, average heater/modulator/laser)
POWER_PER_COMPONENT_MW = 5.0  # 5 mW per phase shifter heater (typical)

PACKAGING_COST_GBP = 800.0  # per chip — fiber attach, wirebond, hermetic seal


def compute(payload: dict) -> dict:
    chip_mm2 = float(payload.get("chip_size_mm2", 25.0))
    num_components = int(payload.get("num_components", 100))
    material = str(payload.get("wafer_material", "Si"))
    base_yield_pct = float(payload.get("yield_pct", 70.0))
    wafer_size_inch = float(payload.get("wafer_size_inch", 6.0))
    wafer_cost_gbp = float(payload.get("wafer_cost_gbp", 5000.0))
    facet_count = int(payload.get("fibre_facet_count", 4))

    if material not in MATERIALS:
        raise ValueError(f"unknown material {material!r}; known: {list(MATERIALS)}")
    mat = MATERIALS[material]

    # Wafer area (cm^2)
    wafer_diameter_cm = wafer_size_inch * 2.54
    wafer_area_cm2 = math.pi * (wafer_diameter_cm / 2.0) ** 2
    # Edge exclusion (typical 5 mm)
    edge_exclusion_mm = 5.0
    usable_radius_mm = wafer_size_inch * 25.4 / 2.0 - edge_exclusion_mm
    usable_area_mm2 = math.pi * usable_radius_mm ** 2
    chip_per_wafer_geometric = math.floor(usable_area_mm2 / chip_mm2)

    # Yield from defect density (Murphy compound formula)
    chip_area_cm2 = chip_mm2 / 100.0  # mm^2 to cm^2
    AD = chip_area_cm2 * mat["defect_density_per_cm2"]
    if AD > 0:
        # Murphy: Y = ((1 - exp(-AD)) / AD)^2
        yield_murphy = ((1.0 - math.exp(-AD)) / AD) ** 2
    else:
        yield_murphy = 1.0
    yield_effective = min(yield_murphy, base_yield_pct / 100.0)
    yielded_chips = int(chip_per_wafer_geometric * yield_effective)

    # Cost per yielded chip
    wafer_cost_with_material = wafer_cost_gbp * mat["wafer_cost_factor"]
    cost_per_chip_silicon = wafer_cost_with_material / max(yielded_chips, 1)
    cost_per_chip_total = cost_per_chip_silicon + PACKAGING_COST_GBP

    # Optical loss per facet
    loss_per_facet_db = mat["loss_per_facet_db"]
    total_facet_loss_db = loss_per_facet_db * facet_count

    # Thermal dissipation
    thermal_dissipation_w = (num_components * POWER_PER_COMPONENT_MW) / 1000.0
    # Add laser power for active sources (assume 20% of components have laser/PD)
    if material in ("InP", "GaAs", "SOI"):
        laser_power_w = 0.5 * (num_components / 100.0)  # ~0.5 W per chip with hybrid lasers
        thermal_dissipation_w += laser_power_w

    # Component density
    component_density_per_mm2 = num_components / chip_mm2

    # Number of edge emitters / coupling sites
    edge_emitter_count = max(2, facet_count)

    # Worked calculations — clean arithmetic steps only.
    # Murphy yield involves exp() so is SKIPPED; its result is passed as an input
    # symbol to the cost step that chains from it.
    wafer_cost_r = round(wafer_cost_with_material, 2)
    cost_silicon_r = round(cost_per_chip_silicon, 2)
    cost_total_r = round(cost_per_chip_total, 2)
    total_facet_r = round(total_facet_loss_db, 2)
    thermal_r = round(thermal_dissipation_w, 3)
    worked = [
        worked_calc(
            label="Wafer cost adjusted for material factor",
            formula="wafer_cost_adj = wafer_cost_gbp x mat_cost_factor",
            values={
                "wafer_cost_gbp": (wafer_cost_gbp, "GBP"),
                "mat_cost_factor": (mat["wafer_cost_factor"], ""),
            },
            result=wafer_cost_r, result_unit="GBP",
            assumptions=[f"material cost factor for {material} from foundry PDK data"],
        ),
        worked_calc(
            label="Wafer cost apportioned per yielded chip",
            formula="cost_silicon = wafer_cost_adj / yielded_chips",
            values={
                "wafer_cost_adj": (wafer_cost_r, "GBP"),
                "yielded_chips": (yielded_chips, "chips"),
            },
            result=cost_silicon_r, result_unit="GBP",
            assumptions=["yielded_chips derived from Murphy compound-yield formula (transcendental — not expanded here)"],
        ),
        worked_calc(
            label="Total cost per chip including packaging",
            formula="cost_total = cost_silicon + packaging_cost",
            values={
                "cost_silicon": (cost_silicon_r, "GBP"),
                "packaging_cost": (PACKAGING_COST_GBP, "GBP"),
            },
            result=cost_total_r, result_unit="GBP",
            assumptions=["packaging = fibre attach + wirebond + hermetic seal (industry estimate)"],
        ),
        worked_calc(
            label="Total optical loss across all fibre facets",
            formula="total_facet_loss = loss_per_facet x facet_count",
            values={
                "loss_per_facet": (loss_per_facet_db, "dB"),
                "facet_count": (facet_count, ""),
            },
            result=total_facet_r, result_unit="dB",
            assumptions=[f"loss_per_facet = {loss_per_facet_db} dB for {material} (foundry PDK, e.g. imec SiPhoton 2023)"],
        ),
        # For materials with on-chip lasers the formula must include the laser
        # power term so the substitution reproduces thermal_r exactly.
        worked_calc(
            label="Chip thermal dissipation from active components",
            **({
                "formula": "thermal_w = num_components x power_per_component_mw / 1000 + laser_power_w",
                "values": {
                    "num_components": (num_components, ""),
                    "power_per_component_mw": (POWER_PER_COMPONENT_MW, "mW"),
                    "laser_power_w": (round(laser_power_w, 3), "W"),
                },
                "assumptions": [
                    "5 mW per phase-shifter heater (typical photonic integrated circuit)",
                    f"laser_power_w = 0.5 x (num_components / 100) for {material} "
                    "(hybrid laser sources: ~0.5 W per chip per 100 components)",
                ],
            } if material in ("InP", "GaAs", "SOI") else {
                "formula": "thermal_w = num_components x power_per_component_mw / 1000",
                "values": {
                    "num_components": (num_components, ""),
                    "power_per_component_mw": (POWER_PER_COMPONENT_MW, "mW"),
                },
                "assumptions": ["5 mW per phase-shifter heater (typical photonic integrated circuit)"],
            }),
            result=thermal_r, result_unit="W",
        ),
    ]

    return {
        "chip_size_mm2": chip_mm2,
        "num_components": num_components,
        "wafer_material": material,
        "wafer_size_inch": wafer_size_inch,
        "wafer_diameter_cm": round(wafer_diameter_cm, 2),
        "usable_wafer_area_mm2": round(usable_area_mm2, 1),
        "chips_per_wafer_geometric": chip_per_wafer_geometric,
        "yield_murphy_pct": round(yield_murphy * 100.0, 2),
        "yield_effective_pct": round(yield_effective * 100.0, 2),
        "yielded_chips_per_wafer": yielded_chips,
        "wafer_cost_gbp": round(wafer_cost_with_material, 2),
        "cost_per_chip_silicon_only_gbp": round(cost_per_chip_silicon, 2),
        "packaging_cost_gbp": PACKAGING_COST_GBP,
        "cost_per_chip_gbp": round(cost_per_chip_total, 2),
        "optical_loss_db_per_facet": loss_per_facet_db,
        "fibre_facet_count": facet_count,
        "total_facet_loss_db": round(total_facet_loss_db, 2),
        "thermal_dissipation_w": round(thermal_dissipation_w, 3),
        "component_density_per_mm2": round(component_density_per_mm2, 2),
        "edge_emitter_count": edge_emitter_count,
        "defect_density_per_cm2": mat["defect_density_per_cm2"],
        "worked": worked,
    }


def main() -> int:
    t0 = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t0, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
