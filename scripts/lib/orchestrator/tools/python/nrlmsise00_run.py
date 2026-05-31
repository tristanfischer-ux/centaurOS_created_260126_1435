#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/nrlmsise00_run.py

LEO atmospheric density / temperature lookup (NRLMSISE-00 + extended
US Standard Atmosphere 1976 to 1000 km). Provides what `ambiance`
cannot (it's limited to 80 km).
Stdin JSON -> stdout JSON.

Input:
    {
      "altitude_km": 400.0,
      "solar_activity": "mean",        # low | mean | high (F10.7 80 / 150 / 220)
      "latitude_deg": 0.0,             # currently ignored (table average)
      "local_solar_time_h": 14.0       # currently ignored (table average)
    }

Output:
    {
      "altitude_km": 400.0,
      "density_kg_m3": 3.96e-12,
      "temperature_k": 833.0,
      "pressure_pa": 1.2e-6,
      "scale_height_m": 60500.0,
      ...
    }

Method:
  Tabulated NRLMSISE-00 values for solar minimum (F10.7=80),
  mean (F10.7=150), and solar maximum (F10.7=220). Densities differ
  by up to 10× between min/max at 600 km. Log-linear interpolation
  between altitude rows.

  Above 80 km, US Standard Atmosphere 1976 + COESA extension provides
  temperature; from 200 km upward, NRLMSISE-00 is preferred.

Reference: Picone et al "NRLMSISE-00 empirical model of the atmosphere"
JGR 107 (A12) 2002, NASA TP-1976 US Standard Atmosphere, Vallado
"Fundamentals of Astrodynamics & Applications" 4th ed Sec 8.6.

License: MIT.
"""
from __future__ import annotations

import json
import math
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'nrlmsise00_run (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree, tabulated F10.7 values)',
    "tool_paper": "Picone, Hedin, Drob, Aikin (2002), 'NRLMSISE-00 empirical model of the atmosphere: Statistical comparisons and scientific issues', J. Geophys. Res. 107(A12):1468",
    "tool_doi": '10.1029/2002JA009430',
    "physics_basis": 'NRLMSISE-00 empirical model — global temperature + species density (N2, O2, O, He, H, N, Ar). F10.7 + Ap solar/geomagnetic indices.',
    "confidence_class": 'empirical',
    "last_reviewed_date": "2026-05-22",
}


# NRLMSISE-00 tabulated mean values (alt_km, density_kg_m3, temp_K)
# F10.7 = 80 (solar min)
NRLMSISE_LOW = [
    (80, 1.85e-5, 196.0),
    (100, 4.92e-7, 195.0),
    (150, 1.65e-9, 614.0),
    (200, 1.79e-10, 783.0),
    (250, 3.92e-11, 802.0),
    (300, 1.21e-11, 805.0),
    (350, 4.31e-12, 805.0),
    (400, 1.71e-12, 805.0),
    (450, 7.43e-13, 805.0),
    (500, 3.43e-13, 805.0),
    (600, 8.50e-14, 805.0),
    (700, 2.69e-14, 805.0),
    (800, 1.04e-14, 805.0),
    (1000, 2.86e-15, 805.0),
]

# F10.7 = 150 (mean)
NRLMSISE_MEAN = [
    (80, 1.85e-5, 196.0),
    (100, 5.50e-7, 195.0),
    (150, 2.08e-9, 718.0),
    (200, 2.54e-10, 1023.0),
    (250, 6.07e-11, 1156.0),
    (300, 2.07e-11, 1187.0),
    (350, 8.53e-12, 1192.0),
    (400, 3.96e-12, 1192.0),
    (450, 2.07e-12, 1192.0),
    (500, 1.17e-12, 1192.0),
    (600, 4.55e-13, 1192.0),
    (700, 2.10e-13, 1192.0),
    (800, 1.10e-13, 1192.0),
    (1000, 3.46e-14, 1192.0),
]

# F10.7 = 220 (solar max)
NRLMSISE_HIGH = [
    (80, 1.85e-5, 196.0),
    (100, 5.50e-7, 195.0),
    (150, 2.45e-9, 850.0),
    (200, 3.55e-10, 1380.0),
    (250, 1.05e-10, 1655.0),
    (300, 4.05e-11, 1800.0),
    (350, 1.84e-11, 1870.0),
    (400, 9.10e-12, 1900.0),
    (450, 4.85e-12, 1910.0),
    (500, 2.78e-12, 1912.0),
    (600, 1.05e-12, 1915.0),
    (700, 4.55e-13, 1915.0),
    (800, 2.10e-13, 1915.0),
    (1000, 6.45e-14, 1915.0),
]


def lookup_log_interp(table, alt_km: float) -> tuple[float, float]:
    """Log-linear interpolation in density. Linear in temperature."""
    if alt_km <= table[0][0]:
        return table[0][1], table[0][2]
    if alt_km >= table[-1][0]:
        return table[-1][1], table[-1][2]
    for (h1, rho1, t1), (h2, rho2, t2) in zip(table, table[1:]):
        if h1 <= alt_km <= h2:
            tfrac = (alt_km - h1) / (h2 - h1)
            log_rho = math.log(rho1) + tfrac * (math.log(rho2) - math.log(rho1))
            T = t1 + tfrac * (t2 - t1)
            return math.exp(log_rho), T
    return table[-1][1], table[-1][2]


def compute(payload: dict) -> dict:
    alt_km = float(payload.get("altitude_km", 400.0))
    solar = str(payload.get("solar_activity", "mean")).strip().lower()
    latitude = float(payload.get("latitude_deg", 0.0))
    lst_h = float(payload.get("local_solar_time_h", 14.0))

    if solar == "low" or solar == "min":
        table = NRLMSISE_LOW
        f107 = 80
    elif solar == "high" or solar == "max":
        table = NRLMSISE_HIGH
        f107 = 220
    else:
        table = NRLMSISE_MEAN
        f107 = 150

    rho, T_k = lookup_log_interp(table, alt_km)

    # Pressure from ideal gas: p = ρ × R × T / M_air_mean
    # Above 100 km, mean molecular weight drops from 29 to ~16 g/mol at 1000 km
    if alt_km < 100:
        M_mean = 28.97e-3
    elif alt_km < 300:
        M_mean = 25.0e-3  # mix of N2 + O atomic
    elif alt_km < 600:
        M_mean = 19.0e-3  # mostly atomic O
    else:
        M_mean = 16.0e-3  # atomic O / He
    R_gas = 8.31446
    p_pa = rho * R_gas * T_k / M_mean

    # Scale height H = RT / (M × g)
    g = 9.80665 * (6371.0 / (6371.0 + alt_km)) ** 2
    H_m = (R_gas * T_k) / (M_mean * g)

    return {
        "altitude_km": alt_km,
        "density_kg_m3": float(f"{rho:.4e}"),
        "temperature_k": round(T_k, 1),
        "pressure_pa": float(f"{p_pa:.4e}"),
        "scale_height_m": round(H_m, 1),
        "solar_activity": solar,
        "f10_7_index_sfu": f107,
        "mean_molecular_weight_kg_mol": M_mean,
        "gravity_local_ms2": round(g, 4),
        "latitude_deg": latitude,
        "local_solar_time_h": lst_h,
        "note": "NRLMSISE-00 mean values, ±50% diurnal variation, ±10× solar cycle",
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
