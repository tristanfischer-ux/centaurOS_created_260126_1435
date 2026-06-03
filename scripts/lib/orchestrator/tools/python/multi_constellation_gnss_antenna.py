#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/multi_constellation_gnss_antenna.py

Multi-constellation / multi-band GNSS antenna performance — GPS L1/L2/L5,
Galileo E1/E5, BeiDou B1/B2, GLONASS L1/L2.

Companies served: Helix Geospace (UK), ANYWAVES (FR), TalysSat.

Input:
    {
      "frequencies_supported": ["L1", "L2", "L5", "E1", "E5"],
      "antenna_diameter_mm": 100.0
    }

Output:
    gain_per_band_dbi, axial_ratio_db, multipath_rejection_db,
    polarisation_purity_pct, _provenance.

Physics:
  Antenna gain proportional to log(area / lambda^2).
  Multipath rejection from circular polarisation (RHCP attenuates LHCP).
  Helix antenna: G = 10 + 10 log10(N D^2) where D = diameter / lambda.

References:
- Balanis, C.A., "Antenna Theory: Analysis and Design", 4th ed., Wiley 2016.
- Misra, P., Enge, P., "Global Positioning System: Signals, Measurements,
  and Performance", 2nd ed., Ganga-Jamuna Press 2006.
- ICD-GPS-200 (2023 rev) — frequency definitions.
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
    "tool_name": "multi_constellation_gnss_antenna (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Balanis (2016) 'Antenna Theory: Analysis and Design' 4th ed. Wiley; "
        "Misra & Enge (2006) 'Global Positioning System: Signals, Measurements, "
        "and Performance' 2nd ed. Ganga-Jamuna Press; "
        "ICD-GPS-200 (2023 rev); ICD GAL OS SIS V2.1 (2023)."
    ),
    "physics_basis": (
        "Multi-band patch / helical antenna gain: G = 10*log10(4 pi A / lambda^2). "
        "Right-hand circular polarisation rejects mirror-reflected LHCP. "
        "Axial-ratio gauges polarisation purity (3 dB = ~25% LHCP component)."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "GNSS_FREQUENCIES_MHZ": {
            "source": "ICD-GPS-200 / GAL OS / BeiDou ICD",
            "confidence": "standard",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# GNSS frequencies (MHz)
GNSS_FREQS = {
    "L1": 1575.42,      # GPS
    "L2": 1227.60,
    "L5": 1176.45,
    "E1": 1575.42,      # Galileo
    "E5a": 1176.45,
    "E5b": 1207.14,
    "E5": 1191.795,
    "E6": 1278.75,
    "B1": 1561.098,     # BeiDou
    "B2": 1207.14,
    "B3": 1268.52,
    "G1": 1602.0,       # GLONASS
    "G2": 1246.0,
    "L1_C_A": 1575.42,  # GPS C/A
    "QZSS_L1": 1575.42,
}


def compute(payload: dict) -> dict:
    freqs_supported = payload.get("frequencies_supported", ["L1", "L2", "L5"])
    antenna_diameter_mm = float(payload.get("antenna_diameter_mm", 100.0))
    antenna_type = str(payload.get("antenna_type", "patch"))

    # Antenna aperture
    A_m2 = math.pi * (antenna_diameter_mm * 1e-3 / 2.0) ** 2
    d_m = antenna_diameter_mm / 1000.0

    gain_per_band = {}
    for band in freqs_supported:
        if band not in GNSS_FREQS:
            continue
        f_mhz = GNSS_FREQS[band]
        lambda_m = 300.0 / f_mhz  # MHz to m

        # Antenna gain
        if antenna_type == "patch":
            # G_patch ~ 6 + 4 log10(D / lambda) dBi (small patch)
            if d_m > 0.5 * lambda_m:
                g_db = 10.0 * math.log10(4 * math.pi * A_m2 / (lambda_m ** 2))
            else:
                g_db = 4.0  # tiny patch
        elif antenna_type == "helix":
            # Axial helix: G = 10 + 10 log10(N * D^2)
            N_turns = 3
            g_db = 10.0 + 10.0 * math.log10(N_turns * (d_m / lambda_m) ** 2)
        else:
            g_db = 6.0  # default

        # Bound: most GNSS antennas 0-9 dBi
        g_db = max(min(g_db, 9.0), 0.0)
        gain_per_band[band] = round(g_db, 2)

    # Axial ratio (polarisation quality, lower=better)
    if antenna_type == "patch":
        axial_ratio_db = 3.0  # typical patch
    elif antenna_type == "helix":
        axial_ratio_db = 1.0
    else:
        axial_ratio_db = 5.0

    # Multipath rejection
    # RHCP rejection of LHCP (reflected signal): function of axial ratio
    # MP_rej = -20 * log10((AR-1)/(AR+1))
    ar_lin = 10.0 ** (axial_ratio_db / 20.0)
    multipath_rejection_db = -20.0 * math.log10((ar_lin - 1.0) / (ar_lin + 1.0)) if ar_lin > 1 else 30.0
    multipath_rejection_db = max(multipath_rejection_db, 5.0)

    # Polarisation purity
    # AR = 1 (0 dB) → 100% pure RHCP
    # AR = 3 dB → ~83% RHCP
    polarisation_purity_pct = 100.0 * (1.0 / (1.0 + ((ar_lin - 1.0) / (ar_lin + 1.0)) ** 2))

    # Worked calculations (2026-06-03): the per-band gain is a log-domain figure
    # (skipped), but the physical aperture area and the polarisation-purity fraction
    # are closed-form and hand-checkable. ar_lin = 10^(AR_dB/20) is surfaced as an
    # input so the purity arithmetic re-checks without a log.
    worked = [
        worked_calc(
            label="Antenna aperture area",
            formula="aperture_area = pi x (diameter / 2)^2",
            values={"diameter": (round(d_m, 4), "m")},
            result=round(A_m2, 6), result_unit="m2",
            assumptions=["circular aperture of the stated physical diameter"],
        ),
        worked_calc(
            label="Polarisation purity (RHCP fraction)",
            formula="polarisation_purity = 100 x (1 / (1 + ((ar_lin - 1) / (ar_lin + 1))^2))",
            values={"ar_lin": (round(ar_lin, 5), "")},
            result=round(polarisation_purity_pct, 1), result_unit="%",
            assumptions=[f"ar_lin = 10^(axial_ratio_dB/20) = 10^({axial_ratio_db}/20); AR=0 dB -> 100% pure RHCP"],
        ),
    ]

    return {
        "frequencies_supported": list(freqs_supported),
        "antenna_diameter_mm": antenna_diameter_mm,
        "antenna_type": antenna_type,
        "antenna_aperture_area_m2": round(A_m2, 6),
        "gain_per_band_dbi": gain_per_band,
        "average_gain_dbi": round(sum(gain_per_band.values()) / max(len(gain_per_band), 1), 2),
        "axial_ratio_db": axial_ratio_db,
        "multipath_rejection_db": round(multipath_rejection_db, 1),
        "polarisation_purity_pct": round(polarisation_purity_pct, 1),
        "num_bands_supported": len(gain_per_band),
        "worked": worked,
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
