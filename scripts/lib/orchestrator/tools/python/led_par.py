#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/led_par.py

LED Photosynthetically Active Radiation (PAR) efficacy + PPFD/DLI
calculator for vertical-farm horticulture. Reads JSON from stdin,
writes JSON to stdout.

Input:
    {
      "led_type": "red",                  # red | blue | white | far_red | uv | mixed_full_spectrum
      "input_watts": 100.0,                # electrical input to fixture
      "photoperiod_hours": 16.0,           # hours/day light on
      "growing_area_m2": 5.0,
      "driver_efficiency": 0.94            # optional, default 0.94
    }

Output:
    {
      "led_type": "red",
      "input_watts": 100.0,
      "wall_plug_efficacy_umol_per_j": 2.5,
      "ppf_umol_s": 235.0,                 # total photon flux from fixture
      "ppfd_umol_m2_s": 47.0,              # at growing surface
      "dli_mol_m2_day": 2.71,              # Daily Light Integral
      "par_watts": ...,
      ...
    }

Efficacy values from horticultural LED manufacturer datasheets
(Cree, Samsung, Osram) plus academic reviews (e.g. Kusuma et al. 2020,
"From physics to fixtures to food: current and potential LED efficacy").

Use: vertical-farm lighting design + DLI matching to crop needs.
"""
from __future__ import annotations

import json
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'led_par (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "physics_basis": 'Photon energy E_photon = hc/λ; PPF [μmol/s] = (P_optical / E_photon) × Avogadro. PPFD = PPF / area. DLI = PPFD × seconds × 1e-6.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Wall-plug efficacy [μmol photons per Joule of electrical input]
# Single-colour LEDs (660nm red, 450nm blue) are most efficient because
# every photon emitted is within PAR (400-700 nm). White LEDs lose ~30%
# to photons outside PAR.
# Far-red (700-780 nm) is technically outside PAR but contributes to
# photosynthesis via the Emerson enhancement effect; we report it
# separately and INCLUDE it in PPF as an extension.
EFFICACY_UMOL_PER_J = {
    "red": 2.8,                # 660 nm red LED — best efficacy class
    "deep_red": 2.7,           # 730 nm — between red & far-red
    "blue": 2.1,               # 450 nm — lower because deeper energy per photon
    "white": 2.3,              # 3500-5000K phosphor-converted white
    "warm_white": 2.4,         # 2700-3000K
    "cool_white": 2.2,         # 5000-6500K
    "far_red": 2.5,            # 730 nm — not PAR strictly but useful
    "uv": 1.2,                 # UV-A 380 nm — very inefficient, used in low %
    "mixed_full_spectrum": 2.5,  # typical 660R/450B/white blend
}


def compute(payload: dict) -> dict:
    led_type = str(payload.get("led_type", "mixed_full_spectrum")).lower()
    input_watts = float(payload.get("input_watts", 100.0))
    photoperiod_hours = float(payload.get("photoperiod_hours", 16.0))
    growing_area_m2 = float(payload.get("growing_area_m2", 5.0))
    driver_eff = float(payload.get("driver_efficiency", 0.94))

    if led_type not in EFFICACY_UMOL_PER_J:
        raise ValueError(
            f"unknown led_type {led_type!r}; supported: {list(EFFICACY_UMOL_PER_J.keys())}"
        )
    if growing_area_m2 <= 0:
        raise ValueError("growing_area_m2 must be > 0")

    efficacy = EFFICACY_UMOL_PER_J[led_type]

    # Driver / power supply losses
    led_input_w = input_watts * driver_eff
    # Photon flux = electrical input × efficacy
    ppf_umol_s = led_input_w * efficacy
    # PPFD = PPF / area (assumes uniform distribution + no canopy/fixture losses)
    ppfd_umol_m2_s = ppf_umol_s / growing_area_m2
    # DLI = PPFD × photoperiod × 3600 s/h × 1e-6 mol/μmol = PPFD × hours × 0.0036
    dli_mol_m2_day = ppfd_umol_m2_s * photoperiod_hours * 0.0036

    # Approximate PAR watts (Planck conversion @ peak wavelength)
    # Rough: 1 μmol/s at 555 nm ≈ 0.216 W. For 660 nm red, scale by 555/660 = 0.84
    # Use weighted average for simplicity: ~ 0.22 W per μmol/s of mixed PAR
    peak_lambda_nm = {
        "red": 660, "deep_red": 700, "blue": 450, "white": 555,
        "warm_white": 580, "cool_white": 540, "far_red": 735, "uv": 380,
        "mixed_full_spectrum": 555,
    }.get(led_type, 555)
    par_watts = ppf_umol_s * (peak_lambda_nm / 555.0) * 0.216 * 1e-3  # W to MW? no
    # Actually: 1 mol of 555-nm photons = 216 kJ; 1 μmol = 216 μJ; 1 μmol/s = 216 μJ/s = 0.216 mW.
    # So for 1 μmol/s at 555 nm = 0.216 mW = 2.16e-4 W. Scale by lambda/555 for other wavelengths.
    par_watts = ppf_umol_s * (peak_lambda_nm / 555.0) * 2.16e-4

    return {
        "led_type": led_type,
        "input_watts": input_watts,
        "photoperiod_hours": photoperiod_hours,
        "growing_area_m2": growing_area_m2,
        "driver_efficiency": driver_eff,
        "wall_plug_efficacy_umol_per_j": efficacy,
        "led_input_w_after_driver": round(led_input_w, 2),
        "ppf_umol_s": round(ppf_umol_s, 2),
        "ppfd_umol_m2_s": round(ppfd_umol_m2_s, 2),
        "dli_mol_m2_day": round(dli_mol_m2_day, 3),
        "par_watts": round(par_watts, 3),
        "peak_wavelength_nm": peak_lambda_nm,
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
