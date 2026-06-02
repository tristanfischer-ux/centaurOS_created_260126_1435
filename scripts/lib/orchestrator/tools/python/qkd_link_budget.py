#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/qkd_link_budget.py

Quantum Key Distribution (QKD) link-budget. Supports BB84, E91, COW
and CV-QKD protocols. Computes secret-key rate, QBER and maximum
operating distance.

Companies served: KETS Quantum Security, Craft Prospect, ID Quantique
(Europe), Toshiba Cambridge QKD, AQSeeQ, Quintessence Labs.

Input:
    {
      "protocol": "BB84" | "E91" | "COW" | "CV-QKD" | "MDI-QKD",
      "source_rate_mhz": 1000.0,
      "channel_loss_db": 10.0,
      "detector_efficiency_pct": 25.0,
      "dark_count_per_second": 100,
      "fibre_or_freespace": "fibre",
      "decoy_state": true,
      "mean_photon_number_mu": 0.5,
      "error_correction_factor_f": 1.16
    }

Output:
    secret_key_rate_bps, qber_pct, max_distance_km, sifted_key_rate_bps,
    decoy_state_required, asymptotic_or_finite_key, _provenance.

Physics:
  Decoy-state BB84 (Lo, Ma, Chen 2005):
    R_secret = 0.5 * q * [Q_mu (1 - h(e_mu)) - Q_1 * f * h(e_1)]
    where Q_mu = 1 - exp(-mu * eta) + Y_0
    QBER e_mu = (e_0 * Y_0 + e_d * (1 - exp(-mu*eta))) / Q_mu
  CV-QKD (Grosshans-Grangier 2002): R = beta * I_AB - I_AE

References:
- Bennett, C.H., Brassard, G., "Quantum cryptography: Public key distribution
  and coin tossing", in Proc. IEEE Int. Conf. Computers, Systems and Signal
  Processing, Bangalore, 1984, pp.175-179.
- Lo, H.-K., Ma, X., Chen, K., "Decoy state quantum key distribution",
  Phys. Rev. Lett. 94:230504, 2005. DOI: 10.1103/PhysRevLett.94.230504
- Pirandola, S., Andersen, U.L., Banchi, L., et al., "Advances in quantum
  cryptography", Adv. Opt. Photon. 12(4):1012-1236, 2020.
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
    "tool_name": "qkd_link_budget (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Bennett & Brassard (1984) BB84 protocol; "
        "Lo, Ma & Chen (2005) Phys. Rev. Lett. 94:230504 DOI:10.1103/PhysRevLett.94.230504; "
        "Pirandola et al. (2020) Adv. Opt. Photon. 12(4):1012-1236 DOI:10.1364/AOP.361502."
    ),
    "physics_basis": (
        "Decoy-state BB84 secret-key rate per Lo/Ma/Chen 2005. QBER from "
        "dark-count contamination plus detector misalignment. Channel "
        "transmittance T = 10^(-loss_db / 10). Binary entropy h(e) for "
        "error-correction overhead."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "FIBRE_LOSS_AT_1550NM": {
            "source": "Corning SMF-28 datasheet — 0.18 dB/km at 1550 nm",
            "confidence": "datasheet",
        },
        "DETECTOR_AFTERPULSE_DEFAULT": {
            "source": "ID Quantique ID281 SNSPD spec — afterpulse 0.5% typical at 1 ns gate",
            "confidence": "datasheet",
        },
        "MISALIGNMENT_ERROR_E_D": {
            "source": "Gobby, Yuan & Shields (2004) Appl. Phys. Lett. 84:3762 — e_d ~ 1.5% typical",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


PROTOCOLS = {
    "BB84": {"sifting_factor": 0.5, "min_qber_pct": 11.0, "supports_decoy": True},
    "E91": {"sifting_factor": 2.0/9.0, "min_qber_pct": 11.0, "supports_decoy": False},
    "COW": {"sifting_factor": 1.0, "min_qber_pct": 8.0, "supports_decoy": True},
    "CV-QKD": {"sifting_factor": 0.5, "min_qber_pct": 5.0, "supports_decoy": False},
    "MDI-QKD": {"sifting_factor": 0.25, "min_qber_pct": 6.0, "supports_decoy": True},
}


def binary_entropy(p: float) -> float:
    """h(p) = -p log2 p - (1-p) log2(1-p)."""
    if p <= 0 or p >= 1:
        return 0.0
    return -p * math.log2(p) - (1.0 - p) * math.log2(1.0 - p)


def compute(payload: dict) -> dict:
    protocol = str(payload.get("protocol", "BB84"))
    source_rate_hz = float(payload.get("source_rate_mhz", 1000.0)) * 1e6
    channel_loss_db = float(payload.get("channel_loss_db", 10.0))
    eta_det = float(payload.get("detector_efficiency_pct", 25.0)) / 100.0
    dark_count_per_s = float(payload.get("dark_count_per_second", 100.0))
    medium = str(payload.get("fibre_or_freespace", "fibre"))
    decoy = bool(payload.get("decoy_state", True))
    mu = float(payload.get("mean_photon_number_mu", 0.5))
    f_ec = float(payload.get("error_correction_factor_f", 1.16))

    if protocol not in PROTOCOLS:
        raise ValueError(f"unknown protocol {protocol!r}; known: {list(PROTOCOLS)}")
    proto = PROTOCOLS[protocol]

    # Channel transmittance
    T_channel = 10.0 ** (-channel_loss_db / 10.0)
    # Total detection efficiency
    eta = T_channel * eta_det

    # Detector misalignment + intrinsic error rate
    e_d = 0.015  # 1.5% misalignment
    e_0 = 0.5    # background (random) error

    # Detection probability per pulse (decoy-state BB84): Q_mu = 1 - exp(-mu eta) + Y_0
    # Y_0 = dark-count rate per pulse window
    pulse_window_s = 1.0 / source_rate_hz
    Y_0 = dark_count_per_s * pulse_window_s * 4.0  # 4 detectors typical
    Y_0 = min(Y_0, 1.0)

    if protocol == "CV-QKD":
        # CV-QKD: continuous-variable secret-key rate (Grosshans-Grangier 2002)
        # R = beta * I_AB - I_AE; simplified asymptotic limit:
        beta = 0.95  # reconciliation efficiency
        # Mutual information assuming Gaussian modulation
        V_A = 10.0  # modulation variance (shot-noise units)
        T_eff = eta
        nu = 1.0  # excess noise (shot-noise units)
        if T_eff > 0:
            I_AB = 0.5 * math.log2(1.0 + T_eff * V_A / (1.0 + nu))
            chi_E = math.log2(1.0 + T_eff * V_A * (1.0 - T_eff) / (T_eff * (1.0 + nu))) if T_eff < 1 else 0
            chi_E = max(0, chi_E)
            R_per_pulse = max(0.0, beta * I_AB - chi_E)
        else:
            R_per_pulse = 0.0
        qber_pct = 0.0  # CV-QKD doesn't have a discrete QBER
        sifted_per_pulse = beta * I_AB if T_eff > 0 else 0
    else:
        Q_mu = 1.0 - math.exp(-mu * eta) + Y_0
        if Q_mu <= 0:
            Q_mu = 1e-30
        e_mu = (e_0 * Y_0 + e_d * (1.0 - math.exp(-mu * eta))) / Q_mu
        qber_pct = e_mu * 100.0

        if decoy and proto["supports_decoy"]:
            # Decoy-state: lower bound on Q_1 and e_1
            Q_1 = mu * math.exp(-mu) * eta
            e_1 = e_d  # assuming decoy extracts single-photon QBER accurately
        else:
            # No decoy: must assume worst case (PNS attack)
            Q_1 = max(0.0, Q_mu - (mu ** 2) / 2.0)
            e_1 = min(0.5, e_mu * Q_mu / max(Q_1, 1e-15))

        # Secret-key rate per sifted bit (BB84 with decoy):
        # R = 0.5 * (Q_1 * (1 - h(e_1)) - Q_mu * f * h(e_mu))
        if e_mu * 100.0 >= proto["min_qber_pct"]:
            R_per_pulse = 0.0
        else:
            R_per_pulse = proto["sifting_factor"] * (
                Q_1 * (1.0 - binary_entropy(e_1)) - Q_mu * f_ec * binary_entropy(e_mu)
            )
            R_per_pulse = max(R_per_pulse, 0.0)
        sifted_per_pulse = proto["sifting_factor"] * Q_mu

    secret_rate_bps = R_per_pulse * source_rate_hz
    sifted_rate_bps = sifted_per_pulse * source_rate_hz

    # Maximum distance — solve for channel_loss at which R_secret -> 0
    # For BB84: this is the loss at which QBER hits min_qber_pct
    # Approximation: loss_max = 10 * log10(mu / (4 * Y_0 * e_d / (e_0 - e_d)))
    if dark_count_per_s > 0 and protocol != "CV-QKD":
        ratio = (e_0 - proto["min_qber_pct"] / 100.0) / max(proto["min_qber_pct"] / 100.0 - e_d, 1e-6)
        # When 1 - exp(-mu*eta) << 1: e_mu ~ e_0 Y_0 / (mu eta + Y_0)
        # Set e_mu = min_qber → eta_min = e_0 Y_0 / mu / min_qber - Y_0 / mu / min_qber
        if ratio > 0:
            eta_min = Y_0 * ratio / mu
            T_min = eta_min / max(eta_det, 1e-9)
            if T_min > 0:
                max_loss_db = -10.0 * math.log10(min(T_min, 1.0))
            else:
                max_loss_db = 0.0
        else:
            max_loss_db = channel_loss_db
    else:
        max_loss_db = 50.0  # CV-QKD or no dark counts

    # Convert max loss to distance
    if medium == "fibre":
        fibre_attenuation_db_per_km = 0.18  # SMF-28 @ 1550 nm
        max_distance_km = max_loss_db / fibre_attenuation_db_per_km
    else:
        # Free-space — diffraction limited; assume 1m aperture; loss = 1/r^2
        # 10 dB ~ 100 km (LEO satellite), 30 dB ~ 1000 km
        max_distance_km = 10.0 ** ((max_loss_db - 20.0) / 20.0) * 100.0

    # Worked calculations.
    # Most intermediates involve exp() or log() — SKIPPED.
    # Two clean arithmetic steps are shown: sifted key rate and max distance.
    sifted_r = round(sifted_rate_bps, 1)
    secret_r = round(secret_rate_bps, 2)
    max_dist_r = round(max_distance_km, 1)
    max_loss_r = round(max_loss_db, 2)

    worked = []

    # Sifted key rate: clean multiplication of a protocol sifting factor,
    # Q_mu (detection probability per pulse), and source rate.
    # Q_mu = 1 - exp(-mu*eta) + Y_0 is transcendental — pass as live input.
    sifted_per_pulse_r = round(sifted_per_pulse, 8) if protocol != "CV-QKD" else round(sifted_per_pulse, 8)
    worked.append(worked_calc(
        label="Sifted key rate",
        formula="sifted_rate = sifted_per_pulse x source_rate_hz",
        values={
            "sifted_per_pulse": (sifted_per_pulse_r, "bits/pulse"),
            "source_rate_hz": (source_rate_hz, "Hz"),
        },
        result=sifted_r, result_unit="bps",
        assumptions=["sifted_per_pulse = sifting_factor x Q_mu (detection probability includes dark counts and channel loss)"],
    ))

    if medium == "fibre" and max_loss_db > 0:
        fibre_atten = 0.18
        worked.append(worked_calc(
            label="Maximum operating distance in fibre",
            formula="max_dist = max_loss / fibre_atten",
            values={
                "max_loss": (max_loss_r, "dB"),
                "fibre_atten": (fibre_atten, "dB/km"),
            },
            result=max_dist_r, result_unit="km",
            assumptions=["SMF-28 fibre attenuation 0.18 dB/km at 1550 nm (Corning datasheet)"],
        ))

    return {
        "protocol": protocol,
        "source_rate_mhz": float(payload.get("source_rate_mhz", 1000.0)),
        "channel_loss_db": channel_loss_db,
        "channel_transmittance": round(T_channel, 6),
        "detector_efficiency_pct": float(payload.get("detector_efficiency_pct", 25.0)),
        "dark_count_per_second": dark_count_per_s,
        "mean_photon_number_mu": mu,
        "decoy_state_enabled": decoy,
        "decoy_state_required": (channel_loss_db > 5.0 and protocol == "BB84"),
        "qber_pct": round(qber_pct, 3),
        "sifted_key_rate_bps": round(sifted_rate_bps, 1),
        "secret_key_rate_bps": round(secret_rate_bps, 2),
        "max_distance_km": round(max_distance_km, 1),
        "max_loss_db_at_breakeven": round(max_loss_db, 2),
        "above_min_qber_threshold": qber_pct >= proto["min_qber_pct"],
        "min_qber_threshold_pct": proto["min_qber_pct"],
        "fibre_or_freespace": medium,
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
