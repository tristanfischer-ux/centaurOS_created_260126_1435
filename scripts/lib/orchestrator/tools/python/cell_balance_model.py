#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/cell_balance_model.py

Battery cell balancing energy loss + balancing time, passive vs active.

Passive balancing (shunt resistor across cells):
- Cell with higher SoC is dissipated through resistor
- Energy lost = ΔSoC × Q_cell × V_cell (J)
- Balancing time: depends on shunt current I_b
- t_balance = (ΔSoC × Q_cell) / I_b   (hours when Q in Ah, I in A)

Active balancing (capacitor or inductor charge transfer):
- Energy transferred between cells with 70-92% efficiency
- Loss = ΔSoC × Q_cell × V_cell × (1 - η)
- Much faster: I_b can be 1-5A (vs 50-200mA passive)
- More expensive: ~£0.50-2/cell for IC + caps vs £0.05/cell shunt

References:
- Daowd et al, "Passive and Active Battery Balancing for Lithium-Ion Battery Storage",
  IEEE Energytech 2011
- Cao et al, "Battery Balancing Methods: A Comprehensive Review", Energies 2008
- Hannan et al, "A review of lithium-ion battery state of charge estimation and
  management system in EV applications", Renewable Energy 2018
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'cell_balance_model (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Daowd, Omar, Verbrugge, Van Mierlo, Lataire (2011), 'Passive and active battery balancing comparison based on MATLAB simulation', IEEE VPPC; Andrea (2010) 'Battery Management Systems for Large Lithium-Ion Battery Packs', Artech House",
    "physics_basis": 'Passive balancing: shunt resistor dissipates ΔV²/R × t. Active balancing efficiency ~80-95% via charge-shuttle DC-DC.',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


# Balancing topology defaults
BALANCING_PROPS: dict[str, dict] = {
    "passive_shunt": {
        "efficiency": 0.0,            # all energy dissipated
        "typical_current_ma": 100,
        "cost_gbp_per_cell": 0.05,
        "complexity": "low",
    },
    "active_capacitor": {
        "efficiency": 0.85,
        "typical_current_ma": 2000,
        "cost_gbp_per_cell": 0.80,
        "complexity": "medium",
    },
    "active_inductor": {
        "efficiency": 0.92,
        "typical_current_ma": 3000,
        "cost_gbp_per_cell": 1.20,
        "complexity": "high",
    },
    "active_transformer": {
        "efficiency": 0.90,
        "typical_current_ma": 5000,
        "cost_gbp_per_cell": 1.80,
        "complexity": "high",
    },
}

# Cell-level chemistry defaults
CELL_VOLTAGE: dict[str, float] = {
    "lfp": 3.2,
    "nmc": 3.65,
    "nca": 3.65,
    "lto": 2.4,
    "li_s": 2.2,
    "lmfp": 3.5,
}


def compute(payload: dict) -> dict:
    cell_count = int(payload.get("cell_count", 100))
    cell_capacity_ah = float(payload.get("cell_capacity_ah", 100))
    initial_imbalance_pct = float(payload.get("cell_imbalance_pct_initial", 5.0))
    bal_type = str(payload.get("balancing_type", "passive_shunt")).lower()
    bal_current_ma = float(payload.get("balancing_current_ma", 0))   # 0 = use default
    chemistry = str(payload.get("chemistry", "lfp")).lower()

    if bal_type not in BALANCING_PROPS:
        return {"error": f"Unknown balancing_type. Use one of {list(BALANCING_PROPS.keys())}"}

    props = BALANCING_PROPS[bal_type]
    if bal_current_ma <= 0:
        bal_current_ma = props["typical_current_ma"]
    bal_current_a = bal_current_ma / 1000.0

    cell_voltage = CELL_VOLTAGE.get(chemistry, 3.3)

    # Convert initial imbalance to ΔSoC (assuming imbalance ≈ SoC spread between min and max cells)
    delta_soc = initial_imbalance_pct / 100.0

    # Charge to be moved/dissipated to equalise: ΔSoC × Q_cell
    charge_to_balance_ah = delta_soc * cell_capacity_ah

    # Balancing time per cell
    # For passive: time = ΔSoC × Q / I_shunt
    # For active: time is HALF (charge moves between high and low cell simultaneously)
    if bal_type == "passive_shunt":
        t_balance_hours_per_cell = charge_to_balance_ah / bal_current_a
    else:
        t_balance_hours_per_cell = charge_to_balance_ah / (2 * bal_current_a)

    # Energy loss per balancing cycle
    energy_to_move_wh = charge_to_balance_ah * cell_voltage
    # For passive: ALL energy lost. For active: (1 - η) × energy lost.
    if bal_type == "passive_shunt":
        energy_lost_per_cycle_wh = energy_to_move_wh
    else:
        energy_lost_per_cycle_wh = energy_to_move_wh * (1.0 - props["efficiency"])

    # Pack-level totals
    # Assume only ~10% of cells need full balancing per cycle (others already balanced)
    cells_balancing_per_cycle = max(1, int(cell_count * 0.10))
    energy_lost_pack_wh = energy_lost_per_cycle_wh * cells_balancing_per_cycle
    energy_lost_pack_kwh = energy_lost_pack_wh / 1000.0

    # Recommend balancing frequency: cell drift typically <0.5% per cycle so balance every ~10 cycles
    # For passive (slow), balance once per week of full cycling
    # For active, can rebalance continuously
    recommended_period_hours = {
        "passive_shunt": 24 * 7,        # weekly
        "active_capacitor": 24,         # daily
        "active_inductor": 24,
        "active_transformer": 24,
    }[bal_type]

    # Pack cost
    pack_balancing_hardware_cost_gbp = cell_count * props["cost_gbp_per_cell"]

    # Worked calculations — cells_balancing_per_cycle uses int() truncation (pass as
    # an opaque input); t_balance uses a branch (pass as opaque input).
    # All remaining steps are simple closed-form arithmetic.
    delta_soc_r = round(delta_soc, 4)
    charge_r = round(charge_to_balance_ah, 2)
    energy_move_r = round(energy_to_move_wh, 2)
    energy_lost_cell_r = round(energy_lost_per_cycle_wh, 1)
    energy_lost_pack_r = round(energy_lost_pack_wh, 1)
    energy_lost_kwh_r = round(energy_lost_pack_kwh, 3)
    hw_cost_r = round(pack_balancing_hardware_cost_gbp, 2)
    t_balance_r = round(t_balance_hours_per_cell, 2)

    worked = [
        worked_calc(
            label="SoC imbalance as fraction",
            formula="delta_soc = initial_imbalance_pct / 100",
            values={"initial_imbalance_pct": (initial_imbalance_pct, "%")},
            result=delta_soc_r, result_unit="fraction",
            assumptions=["SoC spread between most-charged and least-charged cell"],
        ),
        worked_calc(
            label="Charge to balance per cell",
            formula="charge_to_balance = delta_soc x cell_capacity_ah",
            values={
                "delta_soc": (delta_soc_r, ""),
                "cell_capacity_ah": (cell_capacity_ah, "Ah"),
            },
            result=charge_r, result_unit="Ah",
            assumptions=[],
        ),
        worked_calc(
            label="Energy to move per cell",
            formula="energy_to_move = charge_to_balance x cell_voltage",
            values={
                "charge_to_balance": (charge_r, "Ah"),
                "cell_voltage": (cell_voltage, "V"),
            },
            result=energy_move_r, result_unit="Wh",
            assumptions=[f"cell chemistry: {chemistry}, nominal voltage {cell_voltage} V"],
        ),
        worked_calc(
            label="Energy lost per balancing cycle (per cell)",
            formula="energy_lost_cell = energy_to_move x (1 - eta)"
                    if bal_type != "passive_shunt"
                    else "energy_lost_cell = energy_to_move x 1",
            values={
                "energy_to_move": (energy_move_r, "Wh"),
                **({"eta": (props["efficiency"], "")} if bal_type != "passive_shunt" else {}),
            },
            result=energy_lost_cell_r, result_unit="Wh",
            assumptions=[
                f"balancing type: {bal_type}",
                f"efficiency eta = {props['efficiency']} (passive = 0, all energy dissipated)",
            ],
        ),
        worked_calc(
            label="Pack energy lost per cycle (10% of cells balancing)",
            formula="energy_lost_pack = energy_lost_cell x cells_balancing",
            values={
                "energy_lost_cell": (energy_lost_cell_r, "Wh"),
                "cells_balancing": (cells_balancing_per_cycle, ""),
            },
            result=energy_lost_pack_r, result_unit="Wh",
            assumptions=[
                "cells_balancing = max(1, int(cell_count x 0.10))",
                "only ~10% of cells typically require full balancing per cycle",
            ],
        ),
        worked_calc(
            label="Pack energy lost per cycle in kWh",
            formula="energy_lost_kwh = energy_lost_pack / 1000",
            values={"energy_lost_pack": (energy_lost_pack_r, "Wh")},
            result=energy_lost_kwh_r, result_unit="kWh",
            assumptions=[],
        ),
        worked_calc(
            label="Balancing hardware cost for full pack",
            formula="hw_cost = cell_count x cost_per_cell",
            values={
                "cell_count": (cell_count, ""),
                "cost_per_cell": (props["cost_gbp_per_cell"], "GBP"),
            },
            result=hw_cost_r, result_unit="GBP",
            assumptions=[f"balancing type: {bal_type}; cost per cell from industry survey"],
        ),
    ]

    return {
        "cell_count": cell_count,
        "cell_capacity_ah": cell_capacity_ah,
        "cell_imbalance_pct_initial": initial_imbalance_pct,
        "balancing_type": bal_type,
        "balancing_current_ma": bal_current_ma,
        "balancing_efficiency": props["efficiency"],
        "balancing_time_hours_per_cell": round(t_balance_hours_per_cell, 2),
        "balancing_time_hours_pack_serial": round(t_balance_hours_per_cell * cell_count, 1),
        "balancing_time_hours_pack_parallel": round(t_balance_hours_per_cell, 2),
        "energy_lost_per_cycle_wh": round(energy_lost_per_cycle_wh, 1),
        "energy_lost_pack_wh": round(energy_lost_pack_wh, 1),
        "energy_lost_per_cycle_kwh": round(energy_lost_pack_kwh, 3),
        "charge_moved_ah": round(charge_to_balance_ah, 2),
        "cells_balancing_per_cycle_estimate": cells_balancing_per_cycle,
        "recommended_balancing_period_hours": recommended_period_hours,
        "balancing_hardware_cost_gbp": round(pack_balancing_hardware_cost_gbp, 2),
        "chemistry": chemistry,
        "cell_voltage_v": cell_voltage,
        "complexity": props["complexity"],
        "notes": (
            f"Energy loss per cycle = ΔSoC × Q × V × (1-η). Passive dissipates "
            f"all; active recovers ~85-92%. For BESS warranty, target <0.3% "
            f"capacity drift per month. Passive sufficient for slow-cycling; "
            f"active mandatory for high-C-rate or asymmetric cycling."
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
