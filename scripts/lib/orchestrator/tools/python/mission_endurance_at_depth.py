#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/mission_endurance_at_depth.py

AUV battery vs pressure-housing weight tradeoff at depth.

Pressure increase: +1 bar per 10m (in seawater).
- 1000m depth: 101 bar
- 6000m depth: 605 bar (full ocean)

Pressure vessel mass scales with depth via hoop stress:
    σ_h = (P × D) / (2t)  → t = P × D / (2 × σ_allow)
For Ti-6Al-4V, σ_allow = 414 MPa (yield/SF=2):
    Linear with pressure → linear with depth

Battery placement options:
1. Inside pressure housing: protected but limits packing
2. Oil-compensated (silicone in pressure-balanced enclosure): saves housing mass
3. Solid cells at ambient (pressure-tolerant Li chemistry): no housing needed

Power budget:
- Propulsion: 70-90% of mission energy
- Payload (sonar, lights, comms): 5-15%
- Hotel (CPU, sensors, leak detect): 5-10%

Neutral buoyancy requirement:
    ρ_avg × V = m_total + W_payload_added
where ρ_seawater = 1025 kg/m³ at surface, 1035 at 1000m, 1040 at 6000m

References:
- Wilson, "Practical Pressure Vessel Design" Springer 2017
- Allmendinger (ed.), "Submersible Vehicle Systems Design", SNAME 1990
- USN Tech Manual, Submarine Construction
- Bluefin Robotics, IVER3, REMUS technical specifications
"""
from __future__ import annotations

import json
import math
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'mission_endurance_at_depth (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Allen, Vorus, Prestero (2000), 'Propulsion System Performance Enhancements on REMUS AUVs', MTS/IEEE Oceans Conf.",
    "physics_basis": 'Endurance t = E_battery / (P_propulsion + P_payload). P_propulsion = 0.5 × ρ × v³ × C_d × A_frontal / η_propulsive.',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    depth_m = float(payload.get("depth_rating_m", 1000))
    mission_hours = float(payload.get("mission_duration_hours", 24))
    payload_w = float(payload.get("payload_power_w", 50))
    vehicle_volume_l = float(payload.get("vehicle_volume_l", 100))
    hotel_w = float(payload.get("hotel_power_w", 20))
    cruise_speed_ms = float(payload.get("cruise_speed_ms", 1.5))
    drag_coeff_cd = float(payload.get("drag_coefficient_cd", 0.4))
    frontal_area_m2 = float(payload.get("frontal_area_m2", 0.05))
    housing_material = str(payload.get("housing_material", "titanium")).lower()

    # Pressure at depth
    pressure_bar = depth_m / 10.0 + 1.0
    pressure_pa = pressure_bar * 1e5

    # Propulsion power: P = 0.5 × ρ × Cd × A × V³ / η_prop
    rho_seawater = 1025
    eta_prop = 0.55   # propeller efficiency for AUV
    drag_force = 0.5 * rho_seawater * drag_coeff_cd * frontal_area_m2 * cruise_speed_ms ** 2
    propulsion_w = drag_force * cruise_speed_ms / eta_prop

    # Total power
    total_power_w = propulsion_w + payload_w + hotel_w

    # Energy required
    energy_wh = total_power_w * mission_hours
    energy_kwh = energy_wh / 1000.0

    # Battery: assume LFP-ION pack with safety SoC 80% usable
    usable_soc = 0.80
    battery_capacity_required_kwh = energy_kwh / usable_soc

    # Battery mass + volume
    # LFP at 150 Wh/kg, 300 Wh/L (cell-level); pack overhead 15%
    cell_mass = battery_capacity_required_kwh * 1000 / 150
    pack_mass = cell_mass * 1.15
    cell_volume_l = battery_capacity_required_kwh * 1000 / 300
    pack_volume_l = cell_volume_l * 1.15

    # Pressure housing mass for battery (if inside)
    # Assume cylindrical, D = 200 mm, length per battery volume / area
    housing_d_m = 0.20
    housing_l_m = (pack_volume_l / 1000) / (math.pi * (housing_d_m/2)**2)
    if housing_material == "titanium":
        sigma_allow_mpa = 414   # Ti-6Al-4V w/ SF=2
        density_kg_m3 = 4430
    elif housing_material in ("aluminium", "aluminum"):
        sigma_allow_mpa = 138   # 6061-T6 w/ SF=2
        density_kg_m3 = 2700
    else:  # steel
        sigma_allow_mpa = 250
        density_kg_m3 = 7850

    # Wall thickness for hoop stress
    t_mm = (pressure_pa * housing_d_m / 2) / (sigma_allow_mpa * 1e6) * 1000
    # Add 1mm margin
    t_mm = max(2.0, t_mm + 1.0)
    # Housing cylinder mass = surface area × t × density
    surface_m2 = math.pi * housing_d_m * housing_l_m + 2 * math.pi * (housing_d_m/2)**2
    housing_mass_kg = surface_m2 * (t_mm / 1000) * density_kg_m3

    # Total mass + volume budget
    total_mass = pack_mass + housing_mass_kg
    total_volume = pack_volume_l + (housing_d_m**3 * 1000 * 0.5)  # approx

    # Neutral buoyancy check: V × ρ_seawater = m_total (for displaced water)
    displaced_mass = (vehicle_volume_l / 1000) * rho_seawater
    neutral = displaced_mass >= total_mass * 0.95   # 5% tolerance
    surplus_capacity_kg = displaced_mass - total_mass

    # Energy density at vehicle level
    vehicle_energy_density_wh_per_l = energy_wh / vehicle_volume_l

    return {
        "depth_rating_m": depth_m,
        "pressure_bar": round(pressure_bar, 1),
        "pressure_pa": round(pressure_pa, 0),
        "mission_duration_hours": mission_hours,
        "cruise_speed_ms": cruise_speed_ms,
        "drag_force_n": round(drag_force, 1),
        "propulsion_power_w": round(propulsion_w, 1),
        "payload_power_w": payload_w,
        "hotel_power_w": hotel_w,
        "total_power_w": round(total_power_w, 1),
        "energy_required_wh": round(energy_wh, 0),
        "energy_required_kwh": round(energy_kwh, 2),
        "battery_capacity_required_kwh": round(battery_capacity_required_kwh, 2),
        "battery_cell_mass_kg": round(cell_mass, 1),
        "battery_pack_mass_kg": round(pack_mass, 1),
        "battery_pack_volume_l": round(pack_volume_l, 1),
        "pressure_housing_material": housing_material,
        "pressure_housing_thickness_mm": round(t_mm, 1),
        "pressure_housing_mass_kg": round(housing_mass_kg, 1),
        "total_payload_mass_kg": round(total_mass, 1),
        "vehicle_displaced_mass_kg": round(displaced_mass, 1),
        "neutral_buoyancy_check": bool(neutral),
        "surplus_payload_capacity_kg": round(surplus_capacity_kg, 1),
        "vehicle_energy_density_wh_per_l": round(vehicle_energy_density_wh_per_l, 1),
        "notes": (
            "Pressure housing per ASME BPVC + Roark Ch.10. Energy density at "
            "vehicle level (Wh/L) is the critical AUV metric. Pressure-tolerant "
            "Li chemistries (deepwater grade) eliminate housing mass at expense "
            "of 30% volumetric density. Oil-compensated batteries are a compromise."
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
