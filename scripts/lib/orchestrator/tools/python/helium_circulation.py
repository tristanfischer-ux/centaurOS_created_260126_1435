#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/helium_circulation.py

3He/4He recirculation system: pumping, gas handling, inventory.

Input:
    {
      "dilution_rate_mol_s": 6e-4,
      "vacuum_chamber_volume_l": 100.0,
      "pumping_speed_l_s": 30.0
    }

Output:
    {
      "3He_inventory_required_l": ...,
      "gas_handling_pressure_bar": ...,
      "leak_tightness_required_mbar_l_s": ...,
      ...
    }

Physics:
- 3He inventory ≈ 20-30 L STP for 600 µmol/s typical (Pobell §7.5).
- Gas handling pressure: typically 50-200 mbar in still line, 100-500 mbar
  in condenser line.
- Leak rate must be << inventory loss per year: e.g. 10 L/year acceptable
  for 30 L charge = 30% inventory loss.

Reference: Pobell §7.5-7.6; Bluefors gas-handling system manuals.
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
    "tool_name": "helium_circulation (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Pobell (2007) §7.5-7.6; Bluefors gas-handling manual",
    "physics_basis": "Inventory scaling with n_3 flow rate; PV = nRT for gas handling pressure; leak rate budget.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    n3_mol_s = float(payload.get("dilution_rate_mol_s", 6e-4))
    V_chamber_l = float(payload.get("vacuum_chamber_volume_l", 100.0))
    S_pump_l_s = float(payload.get("pumping_speed_l_s", 30.0))

    # 3He inventory: typical rule-of-thumb is residence time × molar volume
    # Residence time τ in mixing chamber ≈ 1-2 s for high-cooling fridges.
    # n3_in_chamber = n3_dot × τ (mol)
    # Total inventory ~10× this for entire loop (concentrated + dilute streams,
    # condenser, still pot, lines, traps).
    tau_residence = 1.5  # s, typical
    n3_in_mc_mol = n3_mol_s * tau_residence
    total_inventory_mol = n3_in_mc_mol * 10
    # STP volume at 22.4 L/mol
    inventory_l_STP = total_inventory_mol * 22.4

    # Gas handling system pressure:
    # Condenser line input pressure ≈ p_still × T_3K / T_still
    # p_still ≈ 10 mbar (sat. vapour pressure of 3He at 0.7K)
    p_still_mbar = 10.0
    p_condenser_mbar = p_still_mbar * (300 / 0.7)  # ~4200 mbar — too high
    # In practice GHS regulates at 200-500 mbar
    p_GHS_mbar = 300.0  # typical

    # Pumping at room temp: throughput = p × S
    throughput_mbar_l_s = p_GHS_mbar * S_pump_l_s
    # Mass throughput: n_dot = throughput / (R × T) where R = 83.14 mbar·L/mol·K
    mass_flow_mol_s = throughput_mbar_l_s / (83.14 * 300)

    # Leak rate budget: typical acceptable 1e-9 mbar·L/s per joint, total
    # cryostat ~1e-7 mbar·L/s.
    leak_total_mbar_l_s = 1e-7
    # Per year: 1e-7 × 3.15e7 s = 3.15 mbar·L lost annually
    leak_mbar_l_year = leak_total_mbar_l_s * 3.15e7
    inventory_loss_pct_year = (leak_mbar_l_year / max(0.01, inventory_l_STP * 1013)) * 100

    # Worked calculations — each step chains from the prior rounded value.
    n3_in_mc_r = round(n3_in_mc_mol, 6)
    total_inv_r = round(total_inventory_mol, 4)
    # Derive inv_stp_r from the same rounded total_inv_r shown in the substitution so
    # that total_inventory_r x 22.4 reproduces the stated result exactly.
    inv_stp_r = round(total_inv_r * 22.4, 4)
    throughput_r = round(throughput_mbar_l_s, 1)
    mass_flow_r = round(mass_flow_mol_s, 6)
    worked = [
        worked_calc(
            label="3He in mixing chamber (steady state)",
            formula="n3_in_mc = n3_dot x tau_residence",
            values={
                "n3_dot": (n3_mol_s, "mol/s"),
                "tau_residence": (tau_residence, "s"),
            },
            result=n3_in_mc_r, result_unit="mol",
            assumptions=["Residence time tau = 1.5 s (typical high-cooling dilution fridge, Pobell §7.5)"],
        ),
        worked_calc(
            label="Total 3He inventory in circulation loop",
            formula="total_inventory = n3_in_mc x 10",
            values={
                "n3_in_mc": (n3_in_mc_r, "mol"),
            },
            result=total_inv_r, result_unit="mol",
            assumptions=["10x loop factor accounts for concentrated + dilute streams, condenser, still, lines, traps (Pobell §7.6)"],
        ),
        worked_calc(
            label="Inventory volume at STP",
            formula="inventory_STP = total_inventory x 22.4",
            values={
                "total_inventory": (total_inv_r, "mol"),
            },
            result=inv_stp_r, result_unit="L",
            assumptions=["Molar volume at STP = 22.4 L/mol (ideal gas, 273 K, 1 atm)"],
        ),
        worked_calc(
            label="Gas-handling system throughput",
            formula="throughput = p_GHS x S_pump",
            values={
                "p_GHS": (p_GHS_mbar, "mbar"),
                "S_pump": (S_pump_l_s, "L/s"),
            },
            result=throughput_r, result_unit="mbar.L/s",
            assumptions=["p_GHS = 300 mbar typical regulated pressure; pump speed from input"],
        ),
        worked_calc(
            label="Mass flow from pump throughput at room temperature",
            formula="mass_flow = throughput / (R_gas x T)",
            values={
                "throughput": (throughput_r, "mbar.L/s"),
                "R_gas": (83.14, "mbar.L/mol/K"),
                "T": (300.0, "K"),
            },
            result=mass_flow_r, result_unit="mol/s",
            assumptions=["Ideal gas; R = 83.14 mbar.L/mol/K; room temperature T = 300 K"],
        ),
    ]

    return {
        "dilution_rate_mol_s": n3_mol_s,
        "dilution_rate_umol_s": round(n3_mol_s * 1e6, 1),
        "3He_inventory_required_l": round(inventory_l_STP, 1),
        "3He_inventory_required_mol": round(total_inventory_mol, 4),
        "gas_handling_pressure_bar": round(p_GHS_mbar / 1000.0, 3),
        "gas_handling_pressure_mbar": round(p_GHS_mbar, 1),
        "still_pressure_mbar": p_still_mbar,
        "mass_flow_mol_s": round(mass_flow_mol_s, 6),
        "throughput_mbar_l_s": round(throughput_mbar_l_s, 1),
        "leak_tightness_required_mbar_l_s": leak_total_mbar_l_s,
        "annual_inventory_loss_pct": round(inventory_loss_pct_year, 3),
        "residence_time_s": tau_residence,
        "vacuum_chamber_volume_l": V_chamber_l,
        "pumping_speed_l_s": S_pump_l_s,
        "3He_cost_estimate_gbp": round(inventory_l_STP * 25000, 0),  # ~£25k/L 3He (2024 prices)
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
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
