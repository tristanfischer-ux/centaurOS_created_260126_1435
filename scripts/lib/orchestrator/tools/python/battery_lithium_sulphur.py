#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/battery_lithium_sulphur.py

Lithium-sulphur (Li-S) battery sizing for HAPS / aerospace.

Cell properties (production cells 2025-2026):
- Specific energy: 350-450 Wh/kg (vs LFP 150-180, NMC 220-280)
- Energy density: 350-450 Wh/L (vs LFP 320, NMC 600)
- Cell voltage: 2.1-2.2 V nominal (vs 3.2 LFP, 3.65 NMC)
- Cycle life: 200-500 cycles at 100% DoD (vs 6000+ LFP)
- Calendar life: 5-8 years (limited by polysulfide migration)
- C-rate: 0.2-0.5C typical (vs 1-3C NMC)

Capacity fade per cycle (LiS-specific):
- Polysulfide shuttle effect: ~0.15-0.30%/cycle
- Approximate empirical: SOH(N) = 1 - 0.0020 × N^0.85

Manufacturers: Oxis Energy (defunct), Sion Power, NEXTECH, Lyten,
LG Energy Solutions LiS R&D, SAFT.

Use cases:
- HAPS (BAE PHASA-35, Airbus Zephyr): primary use
- Aerospace UAV: secondary use
- Space (cubesat eclipse cycling): some interest

References:
- Wild et al, "Lithium sulfur batteries, a mechanistic review",
  Energy Environ Sci 2015
- Manthiram, Fu, Su, "Challenges and prospects of lithium-sulfur batteries",
  Acc Chem Res 2013
- Oxis Energy datasheets 2018-2020
- Sion Power LiCer datasheet 2024
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'battery_lithium_sulphur (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Manthiram, Fu, Su (2013), 'Challenges and Prospects of Lithium-Sulfur Batteries', Acc. Chem. Res. 46(5):1125-1134; OXIS Energy LiS datasheets (archived)",
    "physics_basis": 'LiS specific energy 350-500 Wh/kg (cell-level), 3× LFP. Voltage plateau ~2.1 V mean. Cycle life 100-500 cycles.',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


# Cell-level reference parameters
CELL_PARAMS = {
    "voltage_nominal_v": 2.10,
    "voltage_min_v": 1.50,
    "voltage_max_v": 2.50,
    "specific_energy_wh_kg": 400,
    "energy_density_wh_l": 400,
    "max_c_rate_discharge": 0.5,
    "max_c_rate_charge": 0.3,
    "cycle_count_at_80pct": 500,         # to 80% SoH
    "calendar_life_years": 7,
    "self_discharge_pct_month": 8,        # higher than Li-ion
}


def fade_function(cycles: int) -> float:
    """SOH percentage after N cycles (empirical for LiS)."""
    fade_pct = 0.20 * (cycles ** 0.85)   # ~0.20% per cycle equivalent
    return max(0.0, min(100.0, 100.0 - fade_pct))


def compute(payload: dict) -> dict:
    target_energy_kwh = float(payload.get("target_energy_kwh", 50))
    cell_voltage = float(payload.get("cell_voltage_v", CELL_PARAMS["voltage_nominal_v"]))
    cell_capacity_ah = float(payload.get("capacity_ah", 5.0))
    target_lifetime_cycles = int(payload.get("target_lifetime_cycles", 500))
    use_case = str(payload.get("use_case", "haps")).lower()

    # Total energy per cell (nominal)
    cell_energy_wh = cell_voltage * cell_capacity_ah

    # Number of cells (depth-of-discharge limit: typical LiS operates 80% DoD)
    usable_dod = 0.85
    cell_count_for_energy = math.ceil(target_energy_kwh * 1000 / (cell_energy_wh * usable_dod))

    # Pack mass: cell-level energy density + pack overhead (~12% for case, BMS)
    pack_overhead_factor = 1.12
    cell_mass_kg = cell_energy_wh / CELL_PARAMS["specific_energy_wh_kg"]
    pack_mass_kg = cell_count_for_energy * cell_mass_kg * pack_overhead_factor

    # Pack volume
    cell_volume_l = cell_energy_wh / CELL_PARAMS["energy_density_wh_l"]
    pack_volume_l = cell_count_for_energy * cell_volume_l * pack_overhead_factor

    # Series/parallel arrangement for typical voltage targets
    target_pack_v = {"haps": 48, "drone": 48, "aerospace": 28, "ev": 400, "default": 48}.get(use_case, 48)
    cells_series = math.ceil(target_pack_v / cell_voltage)
    cells_parallel = math.ceil(cell_count_for_energy / cells_series)
    actual_cell_count = cells_series * cells_parallel
    actual_pack_voltage = cells_series * cell_voltage
    actual_pack_capacity_ah = cells_parallel * cell_capacity_ah
    actual_pack_energy_kwh = actual_pack_voltage * actual_pack_capacity_ah / 1000.0

    # Lifetime predictions
    cycle_count_lifetime = CELL_PARAMS["cycle_count_at_80pct"]
    soh_at_target_cycles = fade_function(target_lifetime_cycles)
    soh_at_500_cycles = fade_function(500)
    capacity_fade_at_500 = 100 - soh_at_500_cycles

    # Specific energy of full pack
    pack_specific_energy = (actual_pack_energy_kwh * 1000) / max(0.1, pack_mass_kg)

    # Compare to alternatives
    alternative_lfp_mass = target_energy_kwh * 1000 / 170   # LFP @ 170 Wh/kg
    alternative_nmc_mass = target_energy_kwh * 1000 / 260   # NMC @ 260 Wh/kg
    mass_advantage_vs_lfp_pct = (alternative_lfp_mass - pack_mass_kg) / alternative_lfp_mass * 100
    mass_advantage_vs_nmc_pct = (alternative_nmc_mass - pack_mass_kg) / alternative_nmc_mass * 100

    # Cost estimate (LiS ~$300-500/kWh vs $130/kWh LFP, $180/kWh NMC)
    cost_per_kwh_gbp = 350
    pack_cost_gbp = target_energy_kwh * cost_per_kwh_gbp

    return {
        "target_energy_kwh": target_energy_kwh,
        "cell_voltage_v": cell_voltage,
        "cell_capacity_ah": cell_capacity_ah,
        "cell_energy_wh": round(cell_energy_wh, 1),
        "usable_dod_pct": usable_dod * 100,
        "cell_count_for_energy": cell_count_for_energy,
        "cells_series": cells_series,
        "cells_parallel": cells_parallel,
        "actual_cell_count": actual_cell_count,
        "actual_pack_voltage_v": round(actual_pack_voltage, 1),
        "actual_pack_capacity_ah": round(actual_pack_capacity_ah, 2),
        "actual_pack_energy_kwh": round(actual_pack_energy_kwh, 2),
        "pack_mass_kg": round(pack_mass_kg, 1),
        "pack_volume_l": round(pack_volume_l, 1),
        "pack_specific_energy_wh_kg": round(pack_specific_energy, 1),
        "cycle_count_lifetime_to_80pct_soh": cycle_count_lifetime,
        "soh_at_target_cycles_pct": round(soh_at_target_cycles, 1),
        "soh_at_500_cycles_pct": round(soh_at_500_cycles, 1),
        "capacity_fade_at_500_cycles_pct": round(capacity_fade_at_500, 1),
        "target_lifetime_cycles": target_lifetime_cycles,
        "use_case": use_case,
        "alternative_lfp_mass_kg": round(alternative_lfp_mass, 1),
        "alternative_nmc_mass_kg": round(alternative_nmc_mass, 1),
        "mass_advantage_vs_lfp_pct": round(mass_advantage_vs_lfp_pct, 1),
        "mass_advantage_vs_nmc_pct": round(mass_advantage_vs_nmc_pct, 1),
        "pack_cost_gbp_estimate": round(pack_cost_gbp),
        "calendar_life_years": CELL_PARAMS["calendar_life_years"],
        "self_discharge_pct_month": CELL_PARAMS["self_discharge_pct_month"],
        "max_c_rate_discharge": CELL_PARAMS["max_c_rate_discharge"],
        "warning_low_cycle_life": (target_lifetime_cycles > 500),
        "notes": (
            "LiS specific energy 2-3× higher than LFP/NMC at cell level; ideal for "
            "HAPS where mass matters more than cycle life. Polysulfide shuttle limits "
            "to ~500 cycles. Avoid full discharge (Li dendrite risk). Use 1.5-2.5V "
            "operating window. Cost premium ~2× LFP per kWh; offset by lighter platform."
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
