#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/magnetics_coil_rl.py

Micro-coil electrical parameters — resistance, inductance, rise time and the
voltage-limited MMF ceiling for a coil driving a magnetic circuit.

Input:
    {
      "n_turns": 20,
      "wire_diameter_mm": 0.050,          # bare copper
      "mean_turn_length_mm": 3.15,
      "supply_v": 1.0,
      "circuit_permeance_nh": 890.0,      # total magnetic-circuit permeance seen
                                          # by the coil, nH (= nWb/At); from a
                                          # reluctance model or FE dλ/di / N²
      "target_current_a": 1.4,            # optional: report time-to-target
      "temp_c": 20.0                      # default 20
    }

Output:
    {
      "resistance_ohm": ..., "inductance_uh": ..., "tau_us": ...,
      "i_infinity_a": ..., "t63_us": ..., "t_to_target_us": ...|null,
      "target_reachable": true|false,
      "mmf_ceiling_at": ...,              # N·I∞ — INDEPENDENT of N (R ∝ N)
      "wire_length_mm": ..., "warnings": [...]
    }

Key design fact this tool exists to surface (PHANTM 2026-07-24): at a fixed
winding window and supply voltage, the achievable MMF N·I∞ = N·V/R is
INDEPENDENT of the turns count, because R scales with N — the SUPPLY VOLTAGE,
not the winding design, caps the drive. First-order L model (dλ/di constant);
back-emf of ms-scale motion neglected over a µs-scale rise (stated).
"""
from __future__ import annotations

import json
import math
import sys

RHO20 = 1.72e-8
ALPHA = 0.00393
HARD = ["n_turns", "wire_diameter_mm", "mean_turn_length_mm", "supply_v",
        "circuit_permeance_nh"]


def solve(inp):
    missing = [k for k in HARD if k not in inp]
    if missing:
        raise ValueError(f"missing required inputs: {missing}")
    warnings = []
    n = int(inp["n_turns"])
    d = inp["wire_diameter_mm"] * 1e-3
    mtl = inp["mean_turn_length_mm"] * 1e-3
    v = float(inp["supply_v"])
    perm = inp["circuit_permeance_nh"] * 1e-9
    temp = float(inp.get("temp_c", 20.0))
    length = n * mtl
    area = math.pi * (d / 2.0) ** 2
    r = RHO20 * (1.0 + ALPHA * (temp - 20.0)) * length / area
    l_h = n * n * perm
    tau = l_h / r
    i_inf = v / r
    t63 = -tau * math.log(1 - 0.632)
    tgt = inp.get("target_current_a")
    reachable, t_tgt = None, None
    if tgt is not None:
        reachable = tgt < i_inf
        t_tgt = (-tau * math.log(1 - tgt / i_inf) * 1e6) if reachable else None
        if not reachable:
            warnings.append(
                f"target {tgt} A exceeds I∞ = {i_inf:.2f} A on {v} V — raise the "
                f"supply; more turns cannot help (MMF ceiling N·V/R is "
                f"independent of N)")
    return {
        "resistance_ohm": r,
        "inductance_uh": l_h * 1e6,
        "tau_us": tau * 1e6,
        "i_infinity_a": i_inf,
        "t63_us": t63 * 1e6,
        "t_to_target_us": t_tgt,
        "target_reachable": reachable,
        "mmf_ceiling_at": n * i_inf,
        "wire_length_mm": length * 1e3,
        "warnings": warnings,
    }


def _selftest():
    # PHANTM coil: 20t of 50 µm, MTL ≈ 3.15 mm → Rc ≈ 0.55 Ω; I∞(1 V) ≈ 1.8 A;
    # FE dλ/di ≈ 0.6 µH → permeance 0.6e-6/400 = 1.5 nH
    out = solve({"n_turns": 20, "wire_diameter_mm": 0.050,
                 "mean_turn_length_mm": 3.15, "supply_v": 1.0,
                 "circuit_permeance_nh": 1.5, "target_current_a": 3.35})
    assert 0.50 <= out["resistance_ohm"] <= 0.60, out
    assert 1.6 <= out["i_infinity_a"] <= 2.0, out
    assert out["target_reachable"] is False and out["warnings"], out
    # MMF ceiling invariance: double the turns (same window → same MTL scale-up
    # is second-order; hold MTL) → N·I∞ unchanged
    out2 = solve({"n_turns": 40, "wire_diameter_mm": 0.050,
                  "mean_turn_length_mm": 3.15, "supply_v": 1.0,
                  "circuit_permeance_nh": 1.5})
    assert abs(out2["mmf_ceiling_at"] - out["mmf_ceiling_at"]) < 1e-9, (out, out2)
    print("magnetics_coil_rl selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        sys.exit(0)
    print(json.dumps(solve(json.load(sys.stdin))))
