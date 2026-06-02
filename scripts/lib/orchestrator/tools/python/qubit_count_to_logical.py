#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/qubit_count_to_logical.py

Surface-code / BB code error-correction overhead for quantum computers.

Input:
    {
      "physical_qubit_count": 1000,
      "physical_error_rate": 1e-3,
      "target_logical_error_rate": 1e-12,
      "code_distance": 11,        // optional; auto-derived if absent
      "code_type": "surface"      // surface | BB_72_12_6 | colour
    }

Output:
    {
      "logical_qubit_count": ...,
      "overhead_ratio": ...,
      "threshold_required_pct": 1.0,
      "code_distance_required": ...,
      ...
    }

Physics (Fowler 2012; Litinski 2019; IBM BB code 2024):
- Surface code on a code distance d uses d² + (d-1)² ≈ 2d² physical qubits
  per logical qubit (rotated surface code: d² data + d²-1 measure ≈ 2d²-1).
- Logical error rate p_L ≈ 0.1 × (p/p_th)^((d+1)/2) where p_th ≈ 1% threshold.
- BB (bivariate bicycle) [[72,12,6]] code (IBM 2024) ratio 6:1, halves overhead.

References:
- Fowler, Mariantoni, Martinis, Cleland (2012) "Surface codes: Towards
  practical large-scale quantum computation," PRA 86, 032324.
- IBM Quantum (2024) "High-threshold and low-overhead fault-tolerant quantum
  memory," Nature 627, 778-782.
- Litinski (2019) "A Game of Surface Codes," Quantum 3, 128.
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
    "tool_name": "qubit_count_to_logical (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Fowler et al. (2012) PRA 86 032324; IBM Quantum (2024) Nature 627 778-782",
    "physics_basis": "Threshold theorem: p_L ≈ A × (p/p_th)^((d+1)/2). Surface code uses 2d² physical qubits per logical; BB code halves this.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    n_phys = int(payload.get("physical_qubit_count", 1000))
    p_phys = float(payload.get("physical_error_rate", 1e-3))
    target_pL = float(payload.get("target_logical_error_rate", 1e-12))
    code_type = str(payload.get("code_type", "surface")).lower()

    # Surface code threshold
    if code_type == "surface":
        p_th = 1.0e-2  # ~1%
        A = 0.1
    elif code_type in ("bb_72_12_6", "bb", "bicycle"):
        p_th = 7.0e-3  # IBM 2024 paper reports 0.7-1% threshold
        A = 0.1
    elif code_type == "colour":
        p_th = 5.0e-3
        A = 0.1
    else:
        p_th = 1.0e-2
        A = 0.1

    # Solve for d: p_L = A × (p/p_th)^((d+1)/2)
    if p_phys >= p_th:
        # Below threshold — increasing d makes error WORSE
        d_required = 99
        suppression_per_d = 0.0
        feasible_below_threshold = False
    else:
        ratio = p_phys / p_th
        log_target = math.log(target_pL / A)
        log_ratio = math.log(ratio)
        # (d+1)/2 = log_target / log_ratio
        d_required = max(3, int(math.ceil(2 * log_target / log_ratio - 1)))
        # Must be odd
        if d_required % 2 == 0:
            d_required += 1
        suppression_per_d = math.log10(ratio)
        feasible_below_threshold = True

    # Allow override
    d = int(payload.get("code_distance", d_required))
    if d % 2 == 0:
        d += 1

    # Physical qubits per logical
    if code_type == "surface":
        phys_per_logical = 2 * d * d - 1
    elif code_type in ("bb_72_12_6", "bb", "bicycle"):
        # IBM BB [[72,12,6]] at d=6: 72 physical → 12 logical (6:1)
        # Scaling for higher d: roughly d² physical per logical
        phys_per_logical = max(6, d * d)
    elif code_type == "colour":
        phys_per_logical = (3 * d * d - 1) // 2  # triangular colour code
    else:
        phys_per_logical = 2 * d * d - 1

    logical_count = n_phys // phys_per_logical
    overhead_ratio = phys_per_logical

    # Actual achievable logical error rate at this d
    if feasible_below_threshold:
        actual_pL = A * (p_phys / p_th) ** ((d + 1) / 2.0)
    else:
        actual_pL = p_phys * d  # above threshold; bigger d worsens

    # Worked calculations — clean arithmetic only.
    # d_required is derived from log/ceiling (transcendental) so is SKIPPED;
    # the code_distance_used (d) is passed as input to the downstream steps.
    # The formula for phys_per_logical differs by code_type — mirror the branch.
    if code_type in ("bb_72_12_6", "bb", "bicycle"):
        # d is always >= 3, so d^2 >= 9 > 6; the max(6, ...) floor never binds.
        _ppl_formula = "phys_per_logical = d^2"
        _ppl_values = {"d": (d, "")}
        _ppl_assumptions = [
            "IBM BB [[72,12,6]] code: ~d^2 physical qubits per logical (floor 6, never binding for d >= 3)",
            "d must be odd for standard syndrome extraction",
        ]
    elif code_type == "colour":
        _ppl_formula = "phys_per_logical = (3 x d^2 - 1) / 2"
        _ppl_values = {"d": (d, "")}
        _ppl_assumptions = [
            "triangular colour code: (3d^2 - 1) / 2 physical qubits per logical qubit",
            "integer division; d must be odd",
        ]
    else:
        # surface code (default)
        _ppl_formula = "phys_per_logical = 2 x d^2 - 1"
        _ppl_values = {"d": (d, "")}
        _ppl_assumptions = [
            "rotated surface code: d^2 data qubits + (d^2 - 1) ancilla qubits",
            "d must be odd for standard syndrome extraction",
        ]
    worked = [
        worked_calc(
            label="Physical qubits per logical qubit (surface code)",
            formula=_ppl_formula,
            values=_ppl_values,
            result=phys_per_logical, result_unit="physical qubits",
            assumptions=_ppl_assumptions,
        ),
        worked_calc(
            label="Number of logical qubits from physical budget",
            formula="logical_count = n_phys / phys_per_logical",
            values={
                "n_phys": (n_phys, "physical qubits"),
                "phys_per_logical": (phys_per_logical, "physical/logical"),
            },
            result=round(n_phys / phys_per_logical, 4),
            result_unit="logical qubits (floor to integer gives final count)",
            assumptions=["integer division — remainder physical qubits cannot form a complete logical qubit"],
        ),
    ]

    return {
        "physical_qubit_count": n_phys,
        "physical_error_rate": p_phys,
        "target_logical_error_rate": target_pL,
        "threshold_required_pct": round(p_th * 100.0, 3),
        "below_threshold": feasible_below_threshold,
        "code_type": code_type,
        "code_distance_required": d_required,
        "code_distance_used": d,
        "physical_qubits_per_logical": phys_per_logical,
        "logical_qubit_count": logical_count,
        "overhead_ratio": overhead_ratio,
        "actual_logical_error_rate": float(f"{actual_pL:.3e}"),
        "suppression_per_distance_increase_log10": round(suppression_per_d, 2),
        "threshold_pct": round(p_th * 100.0, 3),
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
