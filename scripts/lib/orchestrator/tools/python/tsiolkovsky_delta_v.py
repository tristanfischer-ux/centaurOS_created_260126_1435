#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/tsiolkovsky_delta_v.py

Tsiolkovsky rocket equation solver — delta-V from mass ratio and specific impulse.

Input:
    {
      "dry_mass_kg": 100.0,
      "propellant_mass_kg": 50.0,
      "specific_impulse_s": 220.0,
      "g0": 9.80665
    }

  OR (equivalently):
    {
      "dry_mass_kg": 100.0,
      "final_mass_kg": 150.0,        # = initial mass after propellant burn (must be > dry_mass)
      "specific_impulse_s": 220.0
    }

Output:
    {
      "delta_v_ms": ...,
      "mass_ratio": ...,
      "propellant_mass_fraction": ...,
      ...
    }

Physics:
  ΔV = Isp × g0 × ln(m_initial / m_final)
  where m_initial = m_dry + m_propellant, m_final = m_dry

Reference:
- Tsiolkovsky, K. E., "The Exploration of Cosmic Space by Means of Reaction
  Devices", 1903.
- Brown, C. D., "Spacecraft Propulsion", AIAA Education Series 1996, §2.1.
- Sutton & Biblarz, "Rocket Propulsion Elements", 9th ed., 2017, §2.4.
"""
from __future__ import annotations

import json
import math
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'tsiolkovsky_delta_v (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Tsiolkovsky (1903), 'Issledovanie mirovykh prostranstv reaktivnymi priborami' (Investigation of outer space by means of rocket devices)",
    "physics_basis": 'ΔV = I_sp × g0 × ln(m_initial / m_final). Lossless rocket equation; gravity/atmosphere losses added separately.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    dry_mass_kg = float(payload.get("dry_mass_kg", 100.0))
    isp_s = float(payload.get("specific_impulse_s", 220.0))
    g0 = float(payload.get("g0", 9.80665))

    if "propellant_mass_kg" in payload:
        prop_mass_kg = float(payload["propellant_mass_kg"])
        m_initial = dry_mass_kg + prop_mass_kg
        m_final = dry_mass_kg
    elif "final_mass_kg" in payload:
        # Alternative parameterization: final mass after burn (= dry mass typically)
        m_final = float(payload["final_mass_kg"])
        if m_final < dry_mass_kg:
            raise ValueError(
                f"final_mass_kg ({m_final}) cannot be below dry_mass_kg ({dry_mass_kg})"
            )
        m_initial = dry_mass_kg + (m_final - dry_mass_kg) * 2  # treat as initial > final
        prop_mass_kg = m_initial - m_final
    else:
        raise ValueError(
            "must provide either propellant_mass_kg or final_mass_kg"
        )

    if m_initial <= m_final or m_final <= 0:
        raise ValueError(
            f"invalid mass ratio: m_initial={m_initial}, m_final={m_final}"
        )

    mass_ratio = m_initial / m_final
    ve_ms = isp_s * g0   # effective exhaust velocity
    delta_v_ms = ve_ms * math.log(mass_ratio)

    prop_mass_fraction = prop_mass_kg / m_initial

    return {
        "dry_mass_kg": dry_mass_kg,
        "propellant_mass_kg": prop_mass_kg,
        "initial_mass_kg": m_initial,
        "final_mass_kg": m_final,
        "specific_impulse_s": isp_s,
        "g0": g0,
        "exhaust_velocity_ms": round(ve_ms, 2),
        "mass_ratio": round(mass_ratio, 5),
        "propellant_mass_fraction": round(prop_mass_fraction, 5),
        "delta_v_ms": round(delta_v_ms, 2),
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
