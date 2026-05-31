#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/debris_impact_detector.py

Orbital debris impact detector (ODIN-class nano-sensor) — detection
efficiency, particle flux estimation.

Companies served: ODIN Space (UK), DLR PIRA, ESA debris monitoring partners.

Input:
    {
      "detection_area_cm2": 100.0,
      "particle_size_range_um": [5, 500],
      "impact_velocity_km_s": 10.0,
      "sensor_thickness_um": 10.0
    }

Output:
    detection_efficiency_pct, particle_flux_measurement_uncertainty,
    impacts_per_year, mass_kg, _provenance.

Physics:
  Particle impact at hypervelocity creates plasma + acoustic signal
  Threshold: energy E = 0.5 * m * v^2 > E_min (PVDF film detection)
  ESA MASTER-8 debris flux model

References:
- Klinkrad, H. et al., "Space Debris: Models and Risk Analysis", Springer 2006.
- ESA MASTER-8 debris model (2020 release).
- Stansbery, E.G. et al., "Detection of micrometeoroid and orbital debris
  impacts using piezoelectric sensors", AIAA SciTech 2018.
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "debris_impact_detector (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Klinkrad et al. (2006) 'Space Debris: Models and Risk Analysis' Springer; "
        "ESA MASTER-8 debris model (2020); "
        "Stansbery et al. (2018) AIAA SciTech."
    ),
    "physics_basis": (
        "Hypervelocity impact deposits energy E = 0.5 m v^2 into sensor. "
        "PVDF / PZT acoustic detection threshold ~10 nJ. ESA MASTER-8 "
        "debris flux power-law spectrum."
    ),
    "confidence_class": "library",
    "embedded_constants": {
        "MASTER_FLUX_POWER_LAW": {
            "source": "ESA MASTER-8 2020 + Krisko, P. (2014) NASA Orbital Debris Quarterly News",
            "confidence": "library",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# ESA MASTER-8 cumulative flux power-law (impacts / m^2 / year for particles > d)
# At 500 km circular orbit, average solar
MASTER_FLUX_POWER_LAW = {
    "exponent": -2.5,  # F(>d) ~ d^-2.5 cumulative flux
    "reference_flux_per_m2_yr_at_1mm": 8.0,
}


def compute(payload: dict) -> dict:
    area_cm2 = float(payload.get("detection_area_cm2", 100.0))
    size_range = payload.get("particle_size_range_um", [5, 500])
    v_impact_km_s = float(payload.get("impact_velocity_km_s", 10.0))
    sensor_thickness_um = float(payload.get("sensor_thickness_um", 10.0))
    sensor_type = str(payload.get("sensor_type", "PVDF"))

    d_min_um = float(size_range[0])
    d_max_um = float(size_range[1])

    # Detection efficiency vs particle size
    # Small particles: lower kinetic energy → undetected
    # Large particles: penetrate sensor → escape detection
    threshold_energy_j = 1e-8  # 10 nJ typical PVDF
    # Min mass for detection at v
    v_m_s = v_impact_km_s * 1000.0
    m_min_kg = 2.0 * threshold_energy_j / (v_m_s ** 2)
    # Density of aluminum (typical debris) = 2700 kg/m^3
    rho_debris_kg_m3 = 2700
    # d_min for detection (sphere): m = (4/3) pi r^3 rho
    r_min_m = ((3.0 * m_min_kg) / (4.0 * math.pi * rho_debris_kg_m3)) ** (1.0 / 3.0)
    d_min_detectable_um = r_min_m * 2 * 1e6

    # Saturation upper bound — sensor punctured, can't differentiate
    d_max_detectable_um = sensor_thickness_um * 50.0

    # Detection efficiency = fraction of range that is detectable
    detect_range_lo = max(d_min_um, d_min_detectable_um)
    detect_range_hi = min(d_max_um, d_max_detectable_um)
    if detect_range_hi > detect_range_lo:
        detect_eff_pct = ((detect_range_hi - detect_range_lo) / (d_max_um - d_min_um)) * 100.0
    else:
        detect_eff_pct = 0.0

    # Impacts per year for the detector area
    area_m2 = area_cm2 / 1e4
    # F(>d_min) = ref_flux * (1mm / d_min_mm)^2.5
    d_min_mm = max(detect_range_lo, 0.01) / 1000.0
    flux_per_m2_yr = MASTER_FLUX_POWER_LAW["reference_flux_per_m2_yr_at_1mm"] * (1.0 / d_min_mm) ** abs(MASTER_FLUX_POWER_LAW["exponent"])
    impacts_per_year = flux_per_m2_yr * area_m2 * (detect_eff_pct / 100.0)

    # Flux measurement uncertainty (Poisson statistics)
    n_impacts = max(1, impacts_per_year)
    flux_uncertainty_pct = 100.0 / math.sqrt(n_impacts)

    # Mass of detector
    # PVDF film: 1 mg/cm^2 for 10 um thick
    pvdf_density_g_cm2 = sensor_thickness_um / 10.0 * 0.001  # ~1 mg/cm^2 per 10 um
    sensor_mass_g = pvdf_density_g_cm2 * area_cm2
    # Plus electronics / housing: 50 g typical for nanosensor
    total_mass_g = sensor_mass_g + 50.0
    total_mass_kg = total_mass_g / 1000.0

    return {
        "detection_area_cm2": area_cm2,
        "particle_size_range_um": size_range,
        "impact_velocity_km_s": v_impact_km_s,
        "sensor_type": sensor_type,
        "sensor_thickness_um": sensor_thickness_um,
        "detection_threshold_energy_J": threshold_energy_j,
        "min_detectable_particle_um": round(d_min_detectable_um, 2),
        "max_detectable_particle_um": round(d_max_detectable_um, 0),
        "detection_efficiency_pct": round(detect_eff_pct, 1),
        "impacts_per_year": round(impacts_per_year, 3),
        "particle_flux_measurement_uncertainty_pct": round(flux_uncertainty_pct, 1),
        "flux_per_m2_yr_above_min": round(flux_per_m2_yr, 1),
        "sensor_mass_g": round(sensor_mass_g, 2),
        "mass_kg": round(total_mass_kg, 3),
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
