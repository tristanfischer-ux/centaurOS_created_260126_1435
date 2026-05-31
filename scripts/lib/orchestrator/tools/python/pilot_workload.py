#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/pilot_workload.py

Cooper-Harper handling-qualities rating for eVTOL piloted operations.

Input:
    {
      "max_pitch_rate_deg_s": 25.0,
      "max_roll_rate_deg_s": 50.0,
      "control_force_n": 35.0,
      "response_time_ms": 250.0,
      "stability_margin_db": 6.0,
      "autonomy_level": "piloted"  // piloted | augmented | autonomous
    }

Output:
    {
      "cooper_harper_rating": 4,
      "MIL-STD-1797_pass": true,
      "handling_class": "satisfactory|adequate|deficient",
      ...
    }

Physics:
- ADS-33 / MIL-STD-1797A response-bandwidth criteria for rotorcraft.
- Cooper-Harper Scale (1969): 1-10, lower = better.
- Bandwidth criterion: ω_BW > 2.0 rad/s for Level 1 (CH ≤ 3.5).
- Control force limits: 35 N pitch, 25 N roll (MIL-STD-1797A).

References:
- Cooper & Harper (1969) NASA TN D-5153.
- ADS-33E-PRF "Handling Qualities Requirements for Military Rotorcraft."
- MIL-STD-1797A "Flying Qualities of Piloted Aircraft."
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "pilot_workload (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Cooper & Harper (1969) NASA TN D-5153; ADS-33E-PRF; MIL-STD-1797A",
    "physics_basis": "Empirical Cooper-Harper score from response bandwidth, control force, and stability margin per ADS-33 / MIL-STD-1797A.",
    "confidence_class": "standard",
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    pitch_rate = float(payload.get("max_pitch_rate_deg_s", 25.0))
    roll_rate = float(payload.get("max_roll_rate_deg_s", 50.0))
    force_n = float(payload.get("control_force_n", 35.0))
    response_ms = float(payload.get("response_time_ms", 250.0))
    stab_margin_db = float(payload.get("stability_margin_db", 6.0))
    autonomy = str(payload.get("autonomy_level", "piloted")).lower()

    # Response bandwidth approx: ω_BW = 1000 / response_ms × π/2 (rad/s)
    omega_BW = (1000.0 / max(50.0, response_ms)) * (math.pi / 2.0)

    # ADS-33 levels:
    # Level 1 (CH 1-3.5): ω_BW ≥ 2.0 rad/s, force ≤ 35 N (pitch), gain margin ≥ 6 dB
    # Level 2 (CH 3.5-6.5): ω_BW ≥ 1.5 rad/s, force ≤ 50 N, gain margin ≥ 4 dB
    # Level 3 (CH 6.5-9): ω_BW ≥ 1.0 rad/s, force ≤ 80 N
    # Loss-of-control (CH 10): below

    score = 1.0
    notes = []

    # Bandwidth contribution
    if omega_BW < 1.0:
        score += 7.0
        notes.append(f"bandwidth {omega_BW:.2f} rad/s < 1.0 (loss-of-control region)")
    elif omega_BW < 1.5:
        score += 4.5
        notes.append(f"bandwidth {omega_BW:.2f} rad/s < 1.5 (Level 3)")
    elif omega_BW < 2.0:
        score += 2.5
        notes.append(f"bandwidth {omega_BW:.2f} rad/s < 2.0 (Level 2)")
    elif omega_BW < 3.5:
        score += 0.5
        notes.append(f"bandwidth {omega_BW:.2f} rad/s (Level 1)")
    # else: above 3.5 → no penalty

    # Control force contribution
    if force_n > 80:
        score += 3.0
        notes.append(f"control force {force_n} N > 80 N MIL-STD limit")
    elif force_n > 50:
        score += 1.5
        notes.append(f"control force {force_n} N > 50 N (Level 2)")
    elif force_n > 35:
        score += 0.5
        notes.append(f"control force {force_n} N > 35 N (Level 1 limit)")

    # Stability margin contribution
    if stab_margin_db < 4.0:
        score += 2.0
        notes.append(f"gain margin {stab_margin_db} dB < 4 dB (poor)")
    elif stab_margin_db < 6.0:
        score += 1.0
        notes.append(f"gain margin {stab_margin_db} dB < 6 dB (marginal)")

    # Autonomy bonus: augmented + autonomous reduce pilot workload by 1.5-2.5 levels
    if autonomy == "augmented":
        score = max(1.0, score - 1.5)
    elif autonomy == "autonomous":
        score = max(1.0, score - 2.5)

    # Pitch/roll rate adequate? FAA Part 23 implicit minima
    rate_ok = pitch_rate >= 10.0 and roll_rate >= 30.0
    if not rate_ok:
        score += 1.0
        notes.append("pitch or roll rate below minimum maneouvering envelope")

    ch_rating = max(1, min(10, math.ceil(score)))

    if ch_rating <= 3:
        handling_class = "satisfactory"
        level = 1
    elif ch_rating <= 6:
        handling_class = "adequate"
        level = 2
    elif ch_rating <= 9:
        handling_class = "deficient"
        level = 3
    else:
        handling_class = "uncontrollable"
        level = 4

    mil_pass = ch_rating <= 3 and force_n <= 35 and omega_BW >= 2.0 and stab_margin_db >= 6.0

    return {
        "cooper_harper_rating": ch_rating,
        "MIL-STD-1797_pass": mil_pass,
        "ads_33_level": level,
        "handling_class": handling_class,
        "response_bandwidth_rad_s": round(omega_BW, 2),
        "control_force_n": force_n,
        "stability_margin_db": stab_margin_db,
        "pitch_rate_deg_s": pitch_rate,
        "roll_rate_deg_s": roll_rate,
        "rate_envelope_adequate": rate_ok,
        "autonomy_level": autonomy,
        "ratings_notes": notes,
        "pilot_workload": "low" if ch_rating <= 3 else "medium" if ch_rating <= 6 else "high",
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
