#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/electrospray_thruster.py

Electrospray thruster — ionic-liquid-fed propulsion for small spacecraft.
Computes thrust, Isp, lifetime for ESI/iEPS thrusters.

Companies served: ION-X (FR), Accion Systems (US/EU customers),
Enpulsion partners.

Input:
    {
      "emitter_count": 480,
      "voltage_kv": 1.5,
      "ionic_liquid_type": "EMI-BF4" | "EMI-IM",
      "flow_rate_pl_s": 1.0
    }

Output:
    thrust_un, isp_s, lifetime_hours, power_w, _provenance.

Physics:
  Per-emitter thrust: F = I * sqrt(2 * (V_inject - V_extr) * m_ion / q)
  Ionic-liquid mass = 100-300 amu typically
  Lifetime limited by emitter wear, ~1000 hr typical

References:
- Lozano, P., Martinez-Sanchez, M., "Ionic liquid ion sources: characterization
  of externally wetted emitters", J. Colloid Interface Sci. 282(2):415-421, 2005.
- Krejci, D., Lozano, P., "Space Propulsion Technology for Small Spacecraft",
  Proc. IEEE 106(3):362-378, 2018.
- Accion Systems TILE 2 / TILE 3 product datasheets.
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "electrospray_thruster (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Lozano & Martinez-Sanchez (2005) J. Colloid Interface Sci. 282(2):415 "
        "DOI:10.1016/j.jcis.2004.08.061; "
        "Krejci & Lozano (2018) Proc. IEEE 106(3):362 DOI:10.1109/JPROC.2017.2778747; "
        "Accion Systems TILE 2 datasheet."
    ),
    "physics_basis": (
        "Per-emitter ionic-liquid electrospray. Ion mass ~100-300 amu. "
        "Thrust per emitter ~ 1 uN. Lifetime limited by emitter wear "
        "(~1000-5000 hours)."
    ),
    "confidence_class": "datasheet",
    "embedded_constants": {
        "IONIC_LIQUID_PROPERTIES": {
            "source": "Lozano 2005 + Krejci 2018 — EMI-BF4: 197 amu, EMI-IM: 391 amu",
            "confidence": "textbook",
        },
        "EMITTER_LIFETIME": {
            "source": "Accion TILE 2 datasheet — 4000+ hours nominal lifetime",
            "confidence": "datasheet",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


IONIC_LIQUIDS = {
    "EMI-BF4":  {"mass_amu": 197.0, "form": "ionic_liquid"},
    "EMI-IM":   {"mass_amu": 391.0, "form": "ionic_liquid"},
    "EMI-Im":   {"mass_amu": 391.0, "form": "ionic_liquid"},
    "BMI-IM":   {"mass_amu": 419.0, "form": "ionic_liquid"},
    "BMI-BF4":  {"mass_amu": 226.0, "form": "ionic_liquid"},
}

AMU_KG = 1.66054e-27
Q_ELEMENTARY = 1.602e-19
G_0 = 9.80665


def compute(payload: dict) -> dict:
    emitter_count = int(payload.get("emitter_count", 480))
    voltage_kv = float(payload.get("voltage_kv", 1.5))
    ionic_liquid = str(payload.get("ionic_liquid_type", "EMI-BF4"))
    flow_rate_pl_s = float(payload.get("flow_rate_pl_s", 1.0))

    if ionic_liquid not in IONIC_LIQUIDS:
        ionic_liquid = "EMI-BF4"
    il = IONIC_LIQUIDS[ionic_liquid]

    m_ion_kg = il["mass_amu"] * AMU_KG

    # Convert voltage
    voltage_v = voltage_kv * 1000.0

    # Per-emitter mass flow (pl/s to kg/s, assuming density ~1.3 g/cm^3)
    density_g_cm3 = 1.3
    m_dot_per_emitter_kg_s = flow_rate_pl_s * 1e-12 * density_g_cm3 * 1e-3 / 1e-6
    # 1 pL = 1e-12 L = 1e-15 m^3; 1.3 g/cm^3 = 1300 kg/m^3
    m_dot_per_emitter_kg_s = flow_rate_pl_s * 1e-15 * 1300.0

    # Total mass flow
    m_dot_total_kg_s = m_dot_per_emitter_kg_s * emitter_count

    # Discharge current per emitter
    # I = (m_dot * q) / m_ion (purely ionic emission)
    i_per_emitter_a = m_dot_per_emitter_kg_s * Q_ELEMENTARY / m_ion_kg
    i_total_a = i_per_emitter_a * emitter_count

    # Exhaust velocity
    v_exhaust_m_s = math.sqrt(2 * Q_ELEMENTARY * voltage_v / m_ion_kg)

    # Apply thrust efficiency
    eta_thrust = 0.85  # typical ESI
    thrust_n = eta_thrust * m_dot_total_kg_s * v_exhaust_m_s
    thrust_un = thrust_n * 1e6

    # Isp
    isp_s = (thrust_n / m_dot_total_kg_s) / G_0

    # Power
    power_w = i_total_a * voltage_v

    # Lifetime (Accion TILE 2: ~4000 hours, scales with emitter quality)
    lifetime_hours = 4000.0
    if emitter_count > 1000:
        # Larger arrays have more redundancy → effective lifetime longer
        lifetime_hours = 5000.0

    return {
        "emitter_count": emitter_count,
        "voltage_kv": voltage_kv,
        "ionic_liquid_type": ionic_liquid,
        "ion_mass_amu": il["mass_amu"],
        "flow_rate_pl_s": flow_rate_pl_s,
        "mass_flow_per_emitter_ng_s": m_dot_per_emitter_kg_s * 1e12,
        "total_mass_flow_ug_s": m_dot_total_kg_s * 1e9,
        "current_per_emitter_nA": i_per_emitter_a * 1e9,
        "total_current_uA": i_total_a * 1e6,
        "exhaust_velocity_km_s": round(v_exhaust_m_s / 1000.0, 1),
        "thrust_un": round(thrust_un, 2),
        "thrust_uN_per_emitter": round(thrust_un / emitter_count, 3),
        "isp_s": round(isp_s, 0),
        "power_w": round(power_w, 3),
        "lifetime_hours": lifetime_hours,
        "thrust_efficiency_pct": round(eta_thrust * 100.0, 1),
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
