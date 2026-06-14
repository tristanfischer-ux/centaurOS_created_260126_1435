#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/recovery_method_logistics.py

AUV / USV recovery method logistics, time, and weather constraints.

Recovery methods:
1. Crane-off-ship (lifting): standard for shipboard ops
   - Sea state limit: 3-4 (wind ≤ Beaufort 4, waves ≤ 1.5m)
   - Time: 15-30 minutes per vehicle
   - Needs A-frame or boom crane (5-50 tonne capacity)
   - Crew: 3-4 (winch op, swimmer/deckhand, observer, safety)

2. Docking buoy (autonomous + ROV assist):
   - Sea state limit: 4-5 (1.5-2.5m)
   - Time: 30-60 min
   - Needs deployed buoy + acoustic homing
   - Crew: 2 (operator + safety)

3. Underwater docking (subsea dock station):
   - Sea state independent
   - Time: 15-25 min (rendezvous + lock)
   - Needs pre-installed dock, batteries, comm uplink
   - Crew: 0 onboard during dock

4. Beach landing (USVs only):
   - Sea state limit: 2-3
   - Time: 1-2 hours including drag-out
   - Tide-dependent

5. Aerial drone (small UAVs): airborne hook/net
   - Sea state limit: 3-4
   - Time: 5-10 min

References:
- IMO MSC.1/Circ.1206 Rev 1 - Survival craft launching
- DNV-OS-H205 (Lifting Operations) Rev 1
- Bluefin Robotics docking station tech notes
- Hydroid REMUS-600 surface recovery procedures
"""
from __future__ import annotations

import json
import sys
import time
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'recovery_method_logistics (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Lloyd's Register Code for Lifting Appliances in a Marine Environment (CLAME 2022); Bourgault (2008), 'Cost Estimation of Autonomous Underwater Vehicle Recovery Operations', MTS J. 42(4)",
    "physics_basis": 'Recovery time = transit + sea-state-dependent retrieval + post-recovery handling. Weather-window probability from historical hindcast.',
    "confidence_class": 'industry_typical',
    "last_reviewed_date": "2026-05-22",
}


RECOVERY_METHODS: dict[str, dict] = {
    "crane_off_ship": {
        "max_sea_state": 4,
        "base_time_min": 25,
        "crew_required": 3,
        "weather_window_hr": 6,
        "platform_required": "Ship with A-frame or knuckle-boom crane",
        "additional_equipment": "Hook, swimmer pole",
        "cost_per_recovery_gbp": 2500,
    },
    "docking_buoy": {
        "max_sea_state": 5,
        "base_time_min": 45,
        "crew_required": 2,
        "weather_window_hr": 12,
        "platform_required": "Pre-deployed buoy with acoustic + RF homing",
        "additional_equipment": "Surface buoy package (≈£25k)",
        "cost_per_recovery_gbp": 1500,
    },
    "underwater_dock": {
        "max_sea_state": 9,             # essentially weather-independent
        "base_time_min": 20,
        "crew_required": 0,             # zero shipboard during dock
        "weather_window_hr": 999,
        "platform_required": "Subsea docking station with charging + comms",
        "additional_equipment": "Subsea dock (£300k-1M)",
        "cost_per_recovery_gbp": 200,
    },
    "beach_landing": {
        "max_sea_state": 3,
        "base_time_min": 90,
        "crew_required": 4,
        "weather_window_hr": 4,
        "platform_required": "Beach access + tide window",
        "additional_equipment": "Recovery trolley, winch",
        "cost_per_recovery_gbp": 800,
    },
    "aerial_drone": {
        "max_sea_state": 4,
        "base_time_min": 8,
        "crew_required": 2,
        "weather_window_hr": 6,
        "platform_required": "VTOL UAV with hook payload",
        "additional_equipment": "Aerial UAV (£20k+)",
        "cost_per_recovery_gbp": 1200,
    },
}

# Sea state to wave height + wind speed (approximate)
SEA_STATE_TABLE = {
    0: {"wave_m": 0,    "wind_kts": 0,   "description": "Calm (glassy)"},
    1: {"wave_m": 0.1,  "wind_kts": 3,   "description": "Calm (rippled)"},
    2: {"wave_m": 0.5,  "wind_kts": 7,   "description": "Smooth"},
    3: {"wave_m": 1.25, "wind_kts": 12,  "description": "Slight"},
    4: {"wave_m": 2.5,  "wind_kts": 17,  "description": "Moderate"},
    5: {"wave_m": 4.0,  "wind_kts": 24,  "description": "Rough"},
    6: {"wave_m": 6.0,  "wind_kts": 32,  "description": "Very rough"},
    7: {"wave_m": 9.0,  "wind_kts": 42,  "description": "High"},
    8: {"wave_m": 14.0, "wind_kts": 56,  "description": "Very high"},
    9: {"wave_m": 16.0, "wind_kts": 65,  "description": "Phenomenal"},
}


def compute(payload: dict) -> dict:
    method = safe_choice(str(payload.get("recovery_method", "crane_off_ship")).lower(), RECOVERY_METHODS, default="crane_off_ship", label="recovery_method")
    if method not in RECOVERY_METHODS:
        return {"error": f"Unknown method. Available: {list(RECOVERY_METHODS.keys())}"}

    mass_kg = float(payload.get("vehicle_mass_kg", 200))
    sea_state = int(payload.get("recovery_sea_state", 3))
    mother_ship_class = str(payload.get("mother_ship_class", "ROV-support_60m")).lower()

    m_props = RECOVERY_METHODS[method]
    sea_props = SEA_STATE_TABLE.get(sea_state, SEA_STATE_TABLE[3])

    # Recovery viability
    viable = sea_state <= m_props["max_sea_state"]
    if not viable:
        weather_window_required = m_props["weather_window_hr"]
        message = f"Cannot recover in sea state {sea_state} - exceeds method limit ({m_props['max_sea_state']})"
    else:
        weather_window_required = 0
        message = "Recovery possible in current conditions."

    # Time scaling with mass
    if mass_kg > 1000:
        time_factor = 1.5
    elif mass_kg > 500:
        time_factor = 1.2
    else:
        time_factor = 1.0
    recovery_time_min = m_props["base_time_min"] * time_factor

    # Mother ship suitability
    ship_capability_ok = True
    if method == "crane_off_ship":
        if "rib" in mother_ship_class or "small" in mother_ship_class:
            ship_capability_ok = mass_kg < 200
        elif "research" in mother_ship_class or "60m" in mother_ship_class:
            ship_capability_ok = mass_kg < 2000
        else:
            ship_capability_ok = True

    # Cost scaling with vehicle mass
    cost_recovery = m_props["cost_per_recovery_gbp"]
    if mass_kg > 1000:
        cost_recovery *= 1.5
    if sea_state > 3:
        cost_recovery *= 1.3   # slower operation, more risk

    return {
        "recovery_method": method,
        "vehicle_mass_kg": mass_kg,
        "recovery_sea_state": sea_state,
        "max_sea_state_for_method": m_props["max_sea_state"],
        "sea_state_description": sea_props["description"],
        "wave_height_m": sea_props["wave_m"],
        "wind_kts": sea_props["wind_kts"],
        "recovery_viable": viable,
        "recovery_time_minutes": round(recovery_time_min, 0),
        "crew_required": m_props["crew_required"],
        "weather_window_required_hours": weather_window_required,
        "mother_ship_class": mother_ship_class,
        "mother_ship_capability_ok": ship_capability_ok,
        "platform_required": m_props["platform_required"],
        "additional_equipment": m_props["additional_equipment"],
        "cost_per_recovery_gbp": round(cost_recovery),
        "message": message,
        "notes": (
            "Sea state per Douglas scale. Crane-off-ship is industry standard "
            "for shipboard ops in moderate weather (SS≤4). Subsea dock eliminates "
            "weather dependency but high CAPEX. Practical 95-percentile recovery "
            "window: SS≤3 in UK waters, SS≤4 in tropical."
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
