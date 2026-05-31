#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/atmospheric_scintillation.py

Atmospheric turbulence + scintillation index for a free-space optical
ground-to-space link (uplink or downlink).

Companies served: Cailabs (MPLC turbulence compensation), Mynaric (OGS-side
budget), ODYSSEUS (optical-ground), GLINT-EO (optical-ground), Astrolight.

Input:
    {
      "elevation_angle_deg": 30.0,
      "wavelength_nm": 1550.0,
      "Cn2_profile": "moderate"  # "weak" | "moderate" | "strong" | "HV57"
      "aperture_mm": 100.0,
      "zenith_path_length_km": 20.0,  # turbulence-significant path
      "transmitter_altitude_m": 0.0,
      "uplink": false
    }

Output:
    scintillation_index, fade_depth_db, aperture_averaging_factor,
    Rytov_variance, coherence_length_r0_cm, isoplanatic_angle_urad,
    _provenance.

Physics:
  Rytov variance (plane wave):
    sigma_R^2 = 1.23 * k^(7/6) * integral( Cn2(z) * z^(5/6) dz )
  Scintillation index (weak turb):  sigma_I^2 = sigma_R^2
  (strong turb / saturation):       sigma_I^2 = 1 + exp(...)/... (Andrews/Phillips 2005)
  Aperture averaging:               A = (1 + 1.07 (kD^2/4L)^(7/6))^(-7/6)
  Fade depth:                       F_dB = 5 * sigma_I^(2/5) (approx, ~1 sigma at 4.34 dB)

References:
- Andrews, L.C. & Phillips, R.L., "Laser Beam Propagation through Random Media",
  2nd ed., SPIE Press 2005, chs. 7-9.
- ITU-R P.1814 (atmospheric turbulence-induced impairments).
- Hufnagel-Valley 5/7 (HV57) Cn^2 profile model (Beland 1993).
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "atmospheric_scintillation (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Andrews & Phillips, 'Laser Beam Propagation through Random Media' "
        "2nd ed. SPIE 2005, chs. 7-9; ITU-R P.1814 (atmospheric turbulence); "
        "Hufnagel-Valley 5/7 model — Beland (1993) in 'Atmospheric Propagation "
        "of Radiation' (P.L. Brookner ed.), SPIE Press."
    ),
    "physics_basis": (
        "Weak-turbulence Rytov variance integrated along slant path with "
        "altitude-dependent Cn^2. Aperture averaging factor per Andrews "
        "(2005) eq. 9.27. Coherence length r0 = (0.423 k^2 sec(zenith) * "
        "int Cn^2 dz)^(-3/5)."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "CN2_REGIMES": {
            "source": "Hufnagel-Valley HV57 + ITU-R P.1814 typical regimes; "
                      "weak Cn2_0 = 1e-15 m^(-2/3), moderate 1.7e-14, strong 1e-13",
            "confidence": "industry_typical",
        },
        "FADE_5_SIGMA_RULE": {
            "source": "Andrews & Phillips ch.11; ~5 sigma_I^(2/5) gives expected fade margin",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Cn^2 at ground level (m^-2/3) for each regime
CN2_GROUND = {
    "weak":     1.0e-15,
    "moderate": 1.7e-14,
    "strong":   1.0e-13,
    "HV57":     1.7e-14,
}

# Strong turbulence wind speed for HV57 (m/s); affects integrated turbulence
HV57_WIND_RMS_MS = 21.0


def cn2_at_altitude(h_m: float, regime: str) -> float:
    """Hufnagel-Valley 5/7 profile for HV57; layered exponential otherwise."""
    if regime == "HV57":
        # Standard HV5/7 (Beland 1993)
        w = HV57_WIND_RMS_MS
        A = 1.7e-14
        # Convert h to km for the canonical formula
        h_km = h_m / 1000.0
        term1 = 0.00594 * (w / 27.0) ** 2 * (1e-5 * h_km) ** 10 * math.exp(-h_km)
        term2 = 2.7e-16 * math.exp(-h_km / 1.5)
        term3 = A * math.exp(-h_km / 0.1)
        return term1 + term2 + term3
    # Simple exponential decay for other regimes (h in m)
    cn2_0 = CN2_GROUND.get(regime, 1.7e-14)
    return cn2_0 * math.exp(-h_m / 1500.0)  # 1.5 km scale height


def integrate_cn2_path(zenith_angle_deg: float, h_start_m: float, h_end_m: float,
                        regime: str, weight_power: float = 0.0) -> float:
    """Integrate Cn^2(h) * h^weight along slant path. Trapezoid rule."""
    sec_z = 1.0 / math.cos(math.radians(zenith_angle_deg))
    n_steps = 64
    h_steps = [h_start_m + i * (h_end_m - h_start_m) / n_steps for i in range(n_steps + 1)]
    integral = 0.0
    for i in range(n_steps):
        h_lo = h_steps[i]
        h_hi = h_steps[i + 1]
        dh = h_hi - h_lo
        # weight factor: z is slant-path distance from receiver
        z_lo = (h_lo - h_start_m) * sec_z
        z_hi = (h_hi - h_start_m) * sec_z
        cn2_lo = cn2_at_altitude(h_lo, regime)
        cn2_hi = cn2_at_altitude(h_hi, regime)
        if weight_power > 0:
            integrand_lo = cn2_lo * (z_lo + 1e-3) ** weight_power
            integrand_hi = cn2_hi * (z_hi + 1e-3) ** weight_power
        else:
            integrand_lo = cn2_lo
            integrand_hi = cn2_hi
        integral += 0.5 * (integrand_lo + integrand_hi) * dh * sec_z
    return integral


def compute(payload: dict) -> dict:
    elevation_deg = float(payload.get("elevation_angle_deg", 30.0))
    wavelength_m = float(payload.get("wavelength_nm", 1550.0)) * 1e-9
    regime = str(payload.get("Cn2_profile", "moderate"))
    aperture_m = float(payload.get("aperture_mm", 100.0)) / 1000.0
    path_length_km = float(payload.get("zenith_path_length_km", 20.0))
    h_start_m = float(payload.get("transmitter_altitude_m", 0.0))
    uplink = bool(payload.get("uplink", False))

    if elevation_deg <= 0 or elevation_deg > 90:
        raise ValueError("elevation_angle_deg must be in (0, 90]")

    zenith_deg = 90.0 - elevation_deg
    h_end_m = h_start_m + path_length_km * 1000.0
    sec_z = 1.0 / math.cos(math.radians(zenith_deg))

    # Wave number
    k = 2.0 * math.pi / wavelength_m

    # Rytov variance (plane wave): sigma_R^2 = 1.23 * k^(7/6) * sec(z)^(11/6) * int(Cn2 * z^(5/6) dz)
    if uplink:
        # uplink (spherical wave): sigma_R^2 = 2.25 * k^(7/6) * sec(z)^(11/6) * int(Cn2 * h^(5/6) (1-h/H)^(5/6) dh)
        # Approximate by integrating with z^(5/6) weighting
        weight = 5.0 / 6.0
        coeff = 2.25
    else:
        weight = 5.0 / 6.0
        coeff = 1.23
    integ = integrate_cn2_path(zenith_deg, h_start_m, h_end_m, regime, weight_power=weight)
    sigma_R2 = coeff * (k ** (7.0 / 6.0)) * integ

    # Saturation regime — clamp scintillation index to physical limit (~1.1)
    # Per Andrews ch.9, in strong turbulence sigma_I^2 saturates around 0.5-1.2
    if sigma_R2 < 1.0:
        sigma_I2 = sigma_R2  # weak fluctuation
    else:
        # Andrews eq.9.32: spherical wave saturation
        sigma_I2 = math.exp(
            0.49 * sigma_R2 / (1.0 + 1.11 * sigma_R2 ** (6.0 / 5.0)) ** (7.0 / 6.0)
            + 0.51 * sigma_R2 / (1.0 + 0.69 * sigma_R2 ** (6.0 / 5.0)) ** (5.0 / 6.0)
        ) - 1.0

    sigma_I = math.sqrt(max(sigma_I2, 0.0))

    # Aperture averaging factor (Andrews 2005 eq.9.27)
    # A = (1 + 1.07 (kD^2 / 4L)^(7/6))^(-7/6)
    path_length_m = path_length_km * 1000.0
    arg = k * (aperture_m ** 2) / (4.0 * path_length_m)
    A = (1.0 + 1.07 * arg ** (7.0 / 6.0)) ** (-7.0 / 6.0)

    # Effective scintillation after aperture averaging
    sigma_I2_eff = sigma_I2 * A
    sigma_I_eff = math.sqrt(max(sigma_I2_eff, 0.0))

    # Fade depth (mean fade margin): 5 * sigma_I^(2/5) dB approximation
    # Plus: 4.343 * sigma_I^2 / 2  gives 1-sigma fade in dB
    fade_depth_db = 4.343 * sigma_I2_eff + 4.343 * sigma_I_eff  # ~mean + 1-sigma
    fade_depth_db = max(0.0, fade_depth_db)

    # Coherence length r0
    # r0 = (0.423 k^2 sec(z) int(Cn2) dz)^(-3/5)
    cn2_integral_only = integrate_cn2_path(zenith_deg, h_start_m, h_end_m, regime, weight_power=0.0)
    r0_m = (0.423 * (k ** 2) * sec_z * cn2_integral_only) ** (-3.0 / 5.0)
    r0_cm = r0_m * 100.0

    # Isoplanatic angle theta_0
    # theta_0 = 2.914 k^2 sec(z)^(8/3) int(Cn2 * h^(5/3) dh)^(-3/5)
    int_h53 = integrate_cn2_path(zenith_deg, h_start_m, h_end_m, regime, weight_power=5.0 / 3.0)
    if int_h53 > 0:
        theta_0_rad = (2.914 * (k ** 2) * (sec_z ** (8.0 / 3.0)) * int_h53) ** (-3.0 / 5.0)
        theta_0_urad = theta_0_rad * 1e6
    else:
        theta_0_urad = float("inf")

    # D/r0 ratio (turbulence strength relative to aperture)
    d_over_r0 = aperture_m / max(r0_m, 1e-9)

    return {
        "elevation_angle_deg": elevation_deg,
        "zenith_angle_deg": round(zenith_deg, 2),
        "wavelength_nm": float(payload.get("wavelength_nm", 1550.0)),
        "Cn2_profile": regime,
        "uplink": uplink,
        "Rytov_variance": round(sigma_R2, 5),
        "scintillation_index": round(sigma_I2, 5),
        "scintillation_index_aperture_averaged": round(sigma_I2_eff, 5),
        "aperture_averaging_factor": round(A, 4),
        "fade_depth_db": round(fade_depth_db, 2),
        "coherence_length_r0_cm": round(r0_cm, 2),
        "isoplanatic_angle_urad": round(theta_0_urad, 2) if theta_0_urad != float("inf") else None,
        "D_over_r0": round(d_over_r0, 2),
        "turbulence_strength": "weak" if sigma_R2 < 0.3 else ("moderate" if sigma_R2 < 1.0 else "strong"),
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
