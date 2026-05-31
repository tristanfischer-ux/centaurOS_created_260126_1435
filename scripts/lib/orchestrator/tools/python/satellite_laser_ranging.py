#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/satellite_laser_ranging.py

Satellite Laser Ranging (SLR) link-budget — millimetre-precision ranging
to retroreflector-equipped satellites.

Companies served: Lumi Space (UK), Foundational Space (UK), Fugro
Space (NL), Lighthouse OGS (DE).

Input:
    {
      "target_satellite_altitude_km": 500.0,
      "laser_pulse_energy_mj": 100.0,
      "repetition_rate_hz": 1000.0,
      "telescope_aperture_mm": 1000.0,
      "target_retroreflector_size_mm": 100.0,
      "wavelength_nm": 532.0,
      "atmospheric_loss_one_way_db": 1.0,
      "pulse_duration_ps": 50.0,
      "rx_efficiency_pct": 30.0
    }

Output:
    range_precision_mm, max_range_km, photons_returned_per_pulse,
    atmosphere_loss_db, link_signal_to_noise, _provenance.

Physics:
  Two-way SLR link equation:
    N_return = (E_pulse / h_nu) * (eta_tx * eta_atm^2 * eta_rx)
            * (sigma_cube / (4 pi R^2)) * (A_tel / (4 pi R^2))
  Range precision: sigma_R = c * pulse_duration / (2 * sqrt(N))

References:
- Degnan, J.J., "Millimeter accuracy satellite laser ranging: A review",
  AGU Geodynamics Series 25:133-162, 1993.
- Pearlman, M.R. et al., "International Laser Ranging Service:
  Implementation, mission, and future", J. Geodesy 93(11):2161-2180, 2019.
  DOI: 10.1007/s00190-019-01287-1
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "satellite_laser_ranging (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Degnan (1993) AGU Geodynamics Series 25:133; "
        "Pearlman et al. (2019) J. Geodesy 93(11):2161 DOI:10.1007/s00190-019-01287-1; "
        "Wilkinson et al. (2019) J. Geodesy 93(11):2363 (ILRS network)."
    ),
    "physics_basis": (
        "Two-way SLR radar-equivalent link budget. N_return = E_pulse/(h*nu) "
        "* eta_tx * eta_atm^2 * eta_rx * sigma_cube/(4 pi R^2) * "
        "A_telescope/(4 pi R^2). Range precision = c*tau / (2 sqrt(N))."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "RETROREFLECTOR_CROSS_SECTIONS": {
            "source": "Degnan 1993; corner-cube optical RCS = (pi^4 D^4)/(4 lambda^2). "
                      "Active sats like LARES: ~100 m^2 effective sigma_optical",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


C_LIGHT = 2.998e8
H_PLANCK = 6.626e-34


def compute(payload: dict) -> dict:
    alt_km = float(payload.get("target_satellite_altitude_km", 500.0))
    e_pulse_mj = float(payload.get("laser_pulse_energy_mj", 100.0))
    rep_rate_hz = float(payload.get("repetition_rate_hz", 1000.0))
    tel_aperture_mm = float(payload.get("telescope_aperture_mm", 1000.0))
    retro_mm = float(payload.get("target_retroreflector_size_mm", 100.0))
    wavelength_nm = float(payload.get("wavelength_nm", 532.0))
    atm_loss_one_way_db = float(payload.get("atmospheric_loss_one_way_db", 1.0))
    pulse_ps = float(payload.get("pulse_duration_ps", 50.0))
    rx_eff = float(payload.get("rx_efficiency_pct", 30.0)) / 100.0
    tx_eff = float(payload.get("tx_efficiency_pct", 50.0)) / 100.0
    detector_qe = float(payload.get("detector_quantum_efficiency_pct", 30.0)) / 100.0

    # Range (slant) — approximate altitude as range
    R_m = alt_km * 1000.0
    wavelength_m = wavelength_nm * 1e-9

    # Photon energy
    photon_energy_j = H_PLANCK * C_LIGHT / wavelength_m

    # Photons in transmit pulse
    e_pulse_j = e_pulse_mj * 1e-3
    n_tx_photons = e_pulse_j / photon_energy_j

    # Telescope aperture area
    tel_aperture_m = tel_aperture_mm / 1000.0
    A_tel_m2 = math.pi * (tel_aperture_m / 2.0) ** 2

    # Retroreflector optical cross section
    # For a perfect single corner cube: sigma_opt = (pi^4 * D^4) / (4 * lambda^2)
    D_retro_m = retro_mm / 1000.0
    sigma_cube_m2 = (math.pi ** 4) * (D_retro_m ** 4) / (4.0 * (wavelength_m ** 2))

    # Atmospheric transmission (one-way), two-way passes
    atm_one_way = 10.0 ** (-atm_loss_one_way_db / 10.0)
    atm_two_way = atm_one_way ** 2

    # Beam divergence — diffraction-limited from transmit telescope (assume same aperture)
    # Or use a separate beam expander; assume tx_div = 5 arcsec typical
    tx_div_arcsec = float(payload.get("transmit_beam_divergence_arcsec", 5.0))
    tx_div_rad = tx_div_arcsec * (math.pi / 180.0) / 3600.0
    # Spot diameter at target
    spot_diameter_m = 2.0 * R_m * tx_div_rad
    spot_area_m2 = math.pi * (spot_diameter_m / 2.0) ** 2

    # Fraction of beam hitting retroreflector (point-target on uniform spot)
    A_retro_m2 = math.pi * (D_retro_m / 2.0) ** 2
    fraction_on_retro = min(1.0, A_retro_m2 / spot_area_m2)

    # Link equation: N_return = N_tx * tx_eff * atm_one_way * sigma_cube/(4 pi R^2) * A_tel/(4 pi R^2) * rx_eff * atm_one_way * qe
    # Use a simplified product:
    omega_retro_to_telescope = A_tel_m2 / (R_m ** 2)
    omega_retro_emission = 4.0 * math.pi  # isotropic if cube is full-sphere; but typically very narrow

    # Per Degnan eq.3: N_return = N_tx * eta_total * sigma_eff * A_tel / (pi^2 R^4 theta_div^2)
    # eta_total = tx_eff * rx_eff * qe * atm_one_way^2
    eta_total = tx_eff * rx_eff * detector_qe * atm_two_way
    # Substituting the spot-area form:
    n_return = n_tx_photons * eta_total * sigma_cube_m2 * A_tel_m2 / (spot_area_m2 * (4.0 * math.pi * R_m ** 2))

    # Range precision
    pulse_s = pulse_ps * 1e-12
    if n_return > 0:
        sigma_r_m = C_LIGHT * pulse_s / (2.0 * math.sqrt(max(n_return, 0.1)))
    else:
        sigma_r_m = float("inf")
    sigma_r_mm = sigma_r_m * 1000.0

    # Maximum range (when N_return = 1 photon — detection threshold)
    # n_return = c/R^4 → R_max = (c / 1)^(1/4)
    # We solve: 1 = n_return(R_max)
    # ratio: R_max^4 = R^4 * n_return / 1 → R_max = R * n_return^(1/4)
    if n_return > 1:
        r_max_m = R_m * (n_return) ** (1.0 / 4.0)
    else:
        r_max_m = R_m
    r_max_km = r_max_m / 1000.0

    # Signal-to-noise
    # Background noise: solar background on detector
    # Typical SLR at night: 1-10 background photons/pulse
    background_photons_per_pulse = 1.0
    snr_lin = n_return / max(math.sqrt(background_photons_per_pulse + n_return), 1)
    snr_db = 10.0 * math.log10(max(snr_lin, 1e-3))

    return {
        "target_satellite_altitude_km": alt_km,
        "wavelength_nm": wavelength_nm,
        "laser_pulse_energy_mj": e_pulse_mj,
        "repetition_rate_hz": rep_rate_hz,
        "telescope_aperture_mm": tel_aperture_mm,
        "target_retroreflector_size_mm": retro_mm,
        "transmit_beam_divergence_arcsec": tx_div_arcsec,
        "spot_diameter_at_target_m": round(spot_diameter_m, 2),
        "fraction_on_retro": fraction_on_retro,
        "retroreflector_cross_section_m2": round(sigma_cube_m2, 4),
        "atmospheric_transmission_two_way": round(atm_two_way, 4),
        "tx_photons_per_pulse": n_tx_photons,
        "photons_returned_per_pulse": round(n_return, 3),
        "range_precision_mm": round(sigma_r_mm, 3),
        "max_range_km": round(r_max_km, 0),
        "link_signal_to_noise_db": round(snr_db, 1),
        "background_photons_per_pulse_assumed": background_photons_per_pulse,
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
