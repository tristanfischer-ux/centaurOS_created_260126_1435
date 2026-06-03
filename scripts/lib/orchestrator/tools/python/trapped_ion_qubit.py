#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/trapped_ion_qubit.py

Trapped-ion qubit physics — coherence times, gate fidelity, scalability.
Models RF/Penning Paul trap with single-species ion clouds.

Companies served: Oxford Ionics (Oxford, UK), Universal Quantum
(Brighton, UK), AQT (Innsbruck), IonQ-equivalents.

Input:
    {
      "ion_species": "Yb171" | "Ca40" | "Sr88" | "Ba137",
      "trap_frequency_mhz": 1.0,
      "magnetic_field_gauss": 5.0,
      "laser_power_mw": 1.0,
      "trap_geometry": "linear_rf" | "surface_electrode" | "penning",
      "trap_depth_ev": 0.1,
      "heating_rate_quanta_per_s": 100.0
    }

Output:
    T1_coherence_s, T2_dephasing_s, gate_fidelity_pct, qubits_per_chip,
    rabi_frequency_khz, motional_decoherence_s, _provenance.

Physics:
  Carrier Rabi frequency (electric quadrupole): Omega = Gamma * sqrt(I/I_sat) * eta
  T2 dephasing from magnetic-field noise (Zeeman shift):
    1/T2 = (g_F m_F mu_B / hbar) * sigma_B
  Two-qubit Mølmer-Sørensen gate fidelity (Sorensen-Mølmer 1999):
    F = 1 - (n_heating * t_gate + (Omega * t_gate - 2 pi)^2 / ...)

References:
- Cirac, J.I., Zoller, P., "Quantum computations with cold trapped ions",
  Phys. Rev. Lett. 74(20):4091-4094, 1995. DOI: 10.1103/PhysRevLett.74.4091
- Leibfried, D., Blatt, R., Monroe, C., Wineland, D., "Quantum dynamics of
  single trapped ions", Rev. Mod. Phys. 75:281-324, 2003.
  DOI: 10.1103/RevModPhys.75.281
- Bruzewicz, C.D., Chiaverini, J., McConnell, R., Sage, J.M., "Trapped-ion
  quantum computing: Progress and challenges", Applied Phys. Rev. 6:021314,
  2019. DOI: 10.1063/1.5088164
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
    "tool_name": "trapped_ion_qubit (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Cirac & Zoller (1995) PRL 74:4091 DOI:10.1103/PhysRevLett.74.4091; "
        "Leibfried et al. (2003) Rev. Mod. Phys. 75:281 DOI:10.1103/RevModPhys.75.281; "
        "Bruzewicz et al. (2019) Appl. Phys. Rev. 6:021314 DOI:10.1063/1.5088164."
    ),
    "physics_basis": (
        "Paul trap secular motion. Cirac-Zoller / Mølmer-Sørensen two-qubit "
        "gate. T2 dephasing from B-field noise via Zeeman shift. Doppler "
        "cooling limit T_D = hbar Gamma / 2 kB. Anomalous heating rate "
        "from electrode noise."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "ION_PROPERTIES": {
            "source": "Steck Alkali D-line data + Wineland 1998 RMP Tables (NIST 1487)",
            "confidence": "textbook",
        },
        "BOHR_MAGNETON": {
            "source": "CODATA 2018: mu_B = 9.2740100783e-24 J/T",
            "confidence": "library",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Ion qubit properties
# - mass_amu: atomic mass units
# - linewidth_mhz: natural linewidth Gamma/2pi
# - qubit_type: "hyperfine" or "optical" or "Zeeman"
# - g_F_eff: effective Lande g-factor (dimensionless)
IONS = {
    "Yb171": {"mass_amu": 171.0, "linewidth_mhz": 19.7, "qubit_type": "hyperfine",
              "g_F_eff": 0.0, "transition_ghz": 12642.81, "doppler_temp_mK": 0.47},
    "Ca40":  {"mass_amu": 40.0,  "linewidth_mhz": 22.4, "qubit_type": "optical",
              "g_F_eff": 0.0, "transition_ghz": 411000.0, "doppler_temp_mK": 0.54},
    "Sr88":  {"mass_amu": 88.0,  "linewidth_mhz": 21.5, "qubit_type": "Zeeman",
              "g_F_eff": 1.0, "transition_ghz": 0.005, "doppler_temp_mK": 0.52},
    "Ba137": {"mass_amu": 137.0, "linewidth_mhz": 15.1, "qubit_type": "hyperfine",
              "g_F_eff": 0.0, "transition_ghz": 8037.0, "doppler_temp_mK": 0.36},
    "Mg25":  {"mass_amu": 25.0,  "linewidth_mhz": 41.8, "qubit_type": "hyperfine",
              "g_F_eff": 0.0, "transition_ghz": 1789.0, "doppler_temp_mK": 1.0},
}

MU_B = 9.274e-24  # J/T (Bohr magneton)
HBAR = 1.0545718e-34  # J*s
AMU = 1.66054e-27  # kg


def compute(payload: dict) -> dict:
    species = str(payload.get("ion_species", "Yb171"))
    trap_freq_mhz = float(payload.get("trap_frequency_mhz", 1.0))
    b_field_gauss = float(payload.get("magnetic_field_gauss", 5.0))
    laser_mw = float(payload.get("laser_power_mw", 1.0))
    geometry = str(payload.get("trap_geometry", "linear_rf"))
    trap_depth_ev = float(payload.get("trap_depth_ev", 0.1))
    heating_rate = float(payload.get("heating_rate_quanta_per_s", 100.0))

    if species not in IONS:
        raise ValueError(f"unknown ion species {species!r}; known: {list(IONS)}")
    ion = IONS[species]

    mass_kg = ion["mass_amu"] * AMU
    gamma_hz = ion["linewidth_mhz"] * 1e6

    # T1: spontaneous emission lifetime (off-resonant scattering at trap depth)
    # For hyperfine qubits, T1 ~ years (state-of-art) — set by scattering at idle
    # For optical qubits, T1 = 1/gamma_spontaneous_decay
    if ion["qubit_type"] == "hyperfine":
        T1_s = 1000.0  # >1000s typical for hyperfine clock states
    elif ion["qubit_type"] == "optical":
        # Metastable D5/2 state lifetime in Ca40 ~ 1.17s
        T1_s = 1.17 if species == "Ca40" else 30.0
    else:
        T1_s = 100.0

    # T2 dephasing from magnetic-field noise
    # For Zeeman qubits: 1/T2 = 2pi * (g_F * mu_B / h) * sigma_B
    # sigma_B for unshielded lab: ~1 mGauss = 1e-7 T
    sigma_B_t = b_field_gauss * 1e-4 * 1e-3  # 0.1% relative noise
    if ion["g_F_eff"] != 0:
        dnu_dB_hz_per_t = ion["g_F_eff"] * MU_B / (2.0 * math.pi * HBAR)
        T2_s_zeeman = 1.0 / (2.0 * math.pi * dnu_dB_hz_per_t * sigma_B_t)
    else:
        T2_s_zeeman = 100.0  # clock states have ~ no first-order B-field sensitivity

    # T2 from heating: motional decoherence at carrier coupling
    # For pure-electronic qubits, motional decoherence doesn't directly hit T2_carrier
    # But for entangling gates, it does. Use it for gate fidelity.
    T2_s = min(T2_s_zeeman, T1_s)

    # Carrier Rabi frequency (assuming carrier dipole transition)
    # Omega = sqrt(I/I_sat) * Gamma
    # I (W/m^2) at the ion: laser_mw / spot_area, spot ~ 30 um waist
    spot_radius_m = 30e-6
    I_w_m2 = (laser_mw * 1e-3) / (math.pi * spot_radius_m ** 2)
    I_sat_w_m2 = math.pi * HBAR * 2 * math.pi * (gamma_hz / (2 * math.pi)) ** 2 * 1.0 / (3 * 6.626e-34)
    I_sat_w_m2 = max(I_sat_w_m2, 10.0)  # typical Doppler cooling saturation ~50 W/m^2
    s_param = I_w_m2 / I_sat_w_m2
    omega_rabi_hz = gamma_hz * math.sqrt(s_param / 2.0)
    omega_rabi_khz = omega_rabi_hz / 1000.0
    # Cap at trap frequency (resolved sideband limit)
    omega_rabi_khz = min(omega_rabi_khz, trap_freq_mhz * 1e3 / 2.0)

    # Single-qubit gate time: pi-pulse t_pi = pi / Omega
    if omega_rabi_khz > 0:
        t_pi_us = math.pi / (omega_rabi_khz * 1e3) * 1e6
    else:
        t_pi_us = 1000.0

    # Single-qubit gate fidelity (limited by SQ T2 and laser noise)
    F_single = math.exp(-t_pi_us * 1e-6 / T2_s) * 0.9999  # plus laser-pulse-shape limit
    F_single = max(0.0, min(0.99999, F_single))

    # Two-qubit Mølmer-Sørensen gate time and fidelity
    # t_gate ~ (omega_trap / Omega^2) * resolved-sideband factor (~10x slower than carrier)
    t_gate_us = max(t_pi_us * 10.0, 50.0)
    # Fidelity loss from heating: ~ n_heating * t_gate (Sorensen-Mølmer infidelity)
    inf_heating = heating_rate * t_gate_us * 1e-6
    inf_dephasing = (t_gate_us * 1e-6) / T2_s
    inf_total = inf_heating + inf_dephasing
    F_two = max(0.5, 1.0 - inf_total)
    gate_fidelity_pct = F_two * 100.0

    # Scalability — qubits per chip
    if geometry == "linear_rf":
        # 1D chain max ~50 ions before crosstalk
        qubits_per_chip = 50
    elif geometry == "surface_electrode":
        # 2D arrays scale with electrode count: ~100-1000 qubits
        qubits_per_chip = 1000
    elif geometry == "penning":
        # Penning trap 2D crystal: ~100-1000 qubits
        qubits_per_chip = 500
    else:
        qubits_per_chip = 10

    # Motional decoherence: 1/n_heating gives quanta-coherence time
    motional_decoherence_s = 1.0 / max(heating_rate, 0.01)

    # Worked calculations (2026-06-03): the Rabi frequency, T2 and gate fidelity
    # involve saturation intensity, Zeeman sensitivity and clamped infidelity sums
    # (not single-line closed forms). The two clean, hand-checkable derived outputs
    # are the motional-coherence time (inverse heating rate) and the single-qubit
    # pi-pulse duration (pi / Rabi frequency).
    worked = [
        worked_calc(
            label="Motional decoherence time",
            formula="motional_decoherence = 1 / heating_rate",
            values={"heating_rate": (heating_rate, "quanta/s")},
            result=round(motional_decoherence_s, 4), result_unit="s",
            assumptions=["time to absorb one motional quantum at the anomalous heating rate"],
        ),
        worked_calc(
            label="Single-qubit pi-pulse time",
            formula="pi_pulse = pi / rabi_frequency x 1000",
            values={"rabi_frequency": (round(omega_rabi_khz, 2), "kHz")},
            result=round(t_pi_us, 3), result_unit="us",
            assumptions=["t_pi = pi / Omega; Rabi frequency in kHz, x1000 gives microseconds",
                         "Rabi frequency capped at the resolved-sideband limit (trap_frequency/2)"],
        ),
    ]

    return {
        "ion_species": species,
        "ion_mass_amu": ion["mass_amu"],
        "qubit_type": ion["qubit_type"],
        "transition_ghz": ion["transition_ghz"],
        "trap_frequency_mhz": trap_freq_mhz,
        "magnetic_field_gauss": b_field_gauss,
        "laser_power_mw": laser_mw,
        "T1_coherence_s": T1_s,
        "T2_dephasing_s": round(T2_s, 4),
        "T2_from_zeeman_s": round(T2_s_zeeman, 4),
        "rabi_frequency_khz": round(omega_rabi_khz, 2),
        "single_qubit_gate_pi_pulse_us": round(t_pi_us, 3),
        "single_qubit_gate_fidelity_pct": round(F_single * 100.0, 4),
        "two_qubit_gate_time_us": round(t_gate_us, 2),
        "gate_fidelity_pct": round(gate_fidelity_pct, 3),
        "motional_decoherence_s": round(motional_decoherence_s, 4),
        "heating_rate_quanta_per_s": heating_rate,
        "trap_geometry": geometry,
        "qubits_per_chip": qubits_per_chip,
        "doppler_cooling_limit_mK": ion["doppler_temp_mK"],
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
