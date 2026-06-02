#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/wireless_power_microwave.py

Space-Based Solar Power (SBSP) microwave power transmission — power-beaming
link from GEO satellite to ground rectenna.

Companies served: Space Solar (UK), CASSIOPeiA reference architecture,
ESA SOLARIS programme partners.

Input:
    {
      "transmit_power_mw": 1000.0,
      "frequency_ghz": 5.8,
      "transmit_array_size_km": 1.0,
      "distance_km": 36000.0,
      "rectenna_efficiency_pct": 80.0
    }

Output:
    rectenna_size_km, transmission_efficiency_pct, beam_divergence_arcmin,
    power_density_w_m2, receivable_power_mw, _provenance.

Physics:
  Rayleigh range (far field): R_F = D_tx^2 / lambda
  Beam half-angle: theta = lambda / D_tx
  Diffraction-limited spot at receiver: D_rx ~ 2 * theta * R + D_tx
  Power coupling: eta = pi * D_tx^2 * D_rx^2 / (16 * lambda^2 * R^2)  (Goubau)

References:
- Glaser, P.E., "Power from the Sun: Its Future", Science 162(3856):857-861,
  1968.
- Mankins, J.C., "The Case for Space Solar Power", Virginia Edition Publishing
  2014.
- ESA SOLARIS programme overview (2023).
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
    "tool_name": "wireless_power_microwave (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Glaser (1968) Science 162(3856):857 DOI:10.1126/science.162.3856.857; "
        "Mankins (2014) 'The Case for Space Solar Power'; "
        "ESA SOLARIS programme overview (2023); "
        "Goubau, G., Schwering, F. (1961) IRE Trans. Ant. Prop. 9(3):248."
    ),
    "physics_basis": (
        "Goubau-Schwering beam-waveguide formula for transmission efficiency. "
        "Transmit array (phased) creates Gaussian beam. Far-field receiver "
        "captures fraction defined by D_tx^2 * D_rx^2 / (lambda * R)^2 (tau parameter)."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "ITU_FREQUENCY_BANDS_SBSP": {
            "source": "ITU-R RR; ISM bands at 2.45 GHz and 5.8 GHz preferred for SBSP",
            "confidence": "standard",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    p_tx_mw = float(payload.get("transmit_power_mw", 1000.0))
    freq_ghz = float(payload.get("frequency_ghz", 5.8))
    d_tx_km = float(payload.get("transmit_array_size_km", 1.0))
    range_km = float(payload.get("distance_km", 36000.0))
    rectenna_eff_pct = float(payload.get("rectenna_efficiency_pct", 80.0))

    # Wavelength
    lambda_m = 0.2998 / freq_ghz

    # Transmit aperture diameter
    d_tx_m = d_tx_km * 1000.0
    range_m = range_km * 1000.0

    # Far-field (Rayleigh) distance
    r_F_m = 2.0 * d_tx_m ** 2 / lambda_m
    r_F_km = r_F_m / 1000.0

    # Beam divergence (half-angle)
    theta_half_rad = lambda_m / d_tx_m
    theta_full_arcmin = math.degrees(2.0 * theta_half_rad) * 60.0

    # Minimum rectenna diameter (where beam is fully captured)
    # For Gaussian beam: spot at receiver = 2 * theta * R + D_tx (geometric)
    d_rx_m = 2.0 * theta_half_rad * range_m + d_tx_m
    d_rx_km = d_rx_m / 1000.0

    # Goubau transmission efficiency parameter tau:
    # tau = pi * D_tx * D_rx / (4 * lambda * R)
    tau = math.pi * d_tx_m * d_rx_m / (4.0 * lambda_m * range_m)
    # efficiency: eta = 1 - exp(-tau^2)
    eta_goubau = 1.0 - math.exp(-tau ** 2)
    eta_pct = eta_goubau * 100.0

    # Power density at receiver (W/m^2)
    # Peak in Gaussian: P_peak = 2 * P_tx * eta / (pi * (d_rx/2)^2)
    a_rx_m2 = math.pi * (d_rx_m / 2.0) ** 2
    power_density_avg = (p_tx_mw * 1e6 * eta_goubau) / a_rx_m2
    power_density_peak = 2.0 * power_density_avg

    # Receivable power after rectenna efficiency
    receivable_power_w = p_tx_mw * 1e6 * eta_goubau * (rectenna_eff_pct / 100.0)
    receivable_power_mw = receivable_power_w / 1e6

    # Atmospheric attenuation at 5.8 GHz, clear sky: ~0.1 dB
    atm_loss_db = 0.1
    if freq_ghz > 10:
        atm_loss_db = freq_ghz * 0.05  # higher loss at Ka, Q bands

    # Rounded intermediates for chained worked calculations.
    lambda_r = round(lambda_m, 6)
    d_tx_m_r = round(d_tx_m, 2)
    range_m_r = round(range_m, 0)
    theta_r = round(theta_half_rad, 8)
    d_rx_m_r = round(d_rx_m, 2)
    tau_r = round(tau, 6)
    eta_r = round(eta_goubau, 6)
    a_rx_r = round(a_rx_m2, 2)
    p_density_r = round(power_density_avg, 4)
    recv_power_mw_r = round(receivable_power_mw, 4)

    worked = [
        worked_calc(
            label="Signal wavelength",
            formula="lambda = 0.2998 / freq_ghz",
            values={"freq_ghz": (freq_ghz, "GHz")},
            result=lambda_r, result_unit="m",
            assumptions=["0.2998 m/ns = speed of light / 1e9; freq in GHz"],
        ),
        worked_calc(
            label="Transmit aperture diameter in metres",
            formula="d_tx_m = d_tx_km x 1000",
            values={"d_tx_km": (d_tx_km, "km")},
            result=d_tx_m_r, result_unit="m",
            assumptions=[],
        ),
        worked_calc(
            label="Beam half-angle (diffraction limit)",
            formula="theta = lambda / d_tx_m",
            values={
                "lambda": (lambda_r, "m"),
                "d_tx_m": (d_tx_m_r, "m"),
            },
            result=theta_r, result_unit="rad",
            assumptions=["far-field diffraction: half-angle = lambda / aperture diameter"],
        ),
        worked_calc(
            label="Minimum rectenna diameter (geometric beam spread)",
            formula="d_rx_m = 2 x theta x range_m + d_tx_m",
            values={
                "theta": (theta_r, "rad"),
                "range_m": (range_m_r, "m"),
                "d_tx_m": (d_tx_m_r, "m"),
            },
            result=d_rx_m_r, result_unit="m",
            assumptions=["geometric spot size: beam spreads 2*theta*R, plus transmit aperture"],
        ),
        worked_calc(
            label="Goubau coupling parameter tau",
            formula="tau = pi x d_tx_m x d_rx_m / (4 x lambda x range_m)",
            values={
                "d_tx_m": (d_tx_m_r, "m"),
                "d_rx_m": (d_rx_m_r, "m"),
                "lambda": (lambda_r, "m"),
                "range_m": (range_m_r, "m"),
            },
            result=tau_r, result_unit="",
            assumptions=["Goubau-Schwering (1961) beam-waveguide coupling parameter; pi/4 prefactor"],
        ),
        worked_calc(
            label="Average power density at rectenna",
            formula="p_density = (p_tx_mw x 1e6 x eta) / a_rx",
            values={
                "p_tx_mw": (p_tx_mw, "MW"),
                "eta": (eta_r, ""),
                "a_rx": (a_rx_r, "m2"),
            },
            result=p_density_r, result_unit="W/m2",
            assumptions=[
                "p_tx_mw x 1e6 converts MW to W; eta = 1 - exp(-tau^2) (transcendental, not hand-checkable)",
                "a_rx = pi x (d_rx/2)^2",
            ],
        ),
        worked_calc(
            label="Receivable power after rectenna efficiency",
            formula="recv_power_mw = p_tx_mw x 1e6 x eta x (rectenna_eff_pct / 100) / 1e6",
            values={
                "p_tx_mw": (p_tx_mw, "MW"),
                "eta": (eta_r, ""),
                "rectenna_eff_pct": (rectenna_eff_pct, "%"),
            },
            result=recv_power_mw_r, result_unit="MW",
            assumptions=["result in MW (same units as transmit power); eta from Goubau formula"],
        ),
    ]

    return {
        "transmit_power_mw": p_tx_mw,
        "frequency_ghz": freq_ghz,
        "wavelength_m": round(lambda_m, 4),
        "transmit_array_size_km": d_tx_km,
        "distance_km": range_km,
        "rectenna_efficiency_pct": rectenna_eff_pct,
        "far_field_distance_km": round(r_F_km, 1),
        "in_far_field": range_m > r_F_m,
        "beam_divergence_arcmin": round(theta_full_arcmin, 3),
        "beam_divergence_full_urad": round(2.0 * theta_half_rad * 1e6, 1),
        "rectenna_size_km": round(d_rx_km, 2),
        "tau_parameter": round(tau, 3),
        "transmission_efficiency_pct": round(eta_pct, 2),
        "power_density_w_m2_avg": round(power_density_avg, 2),
        "power_density_w_m2_peak": round(power_density_peak, 2),
        "atmospheric_loss_db": atm_loss_db,
        "receivable_power_mw": round(receivable_power_mw, 1),
        "iso_safe_density_limit_w_m2": 100.0,  # ICNIRP 1998
        "exceeds_iso_safe_limit": power_density_peak > 100.0,
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
