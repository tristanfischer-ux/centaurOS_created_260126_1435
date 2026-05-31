#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/qutip_qubit_dynamics.py

Layer-1 wrapper for qubit decoherence + single-qubit gate fidelity via QuTiP.

Replaces hand-coded trapped_ion_qubit dynamics block. Uses Lindblad master
equation `qutip.mesolve()` to integrate the qubit + bath system through a
single-qubit X(pi/2) gate. Outputs gate fidelity and identifies whether
the decoherence channel dominates the error budget.

Input:
    {
      "qubit_type": "transmon",        # transmon | trapped_ion_Yb171 | trapped_ion_Ca40 | photonic
      "T1_us": 80.0,                   # amplitude damping time (microseconds)
      "T2_us": 70.0,                   # dephasing time (microseconds)
      "gate_duration_ns": 20.0,        # X(pi/2) gate length (nanoseconds)
      "target_gate": "x_pi_2"          # x_pi_2 | x_pi | hadamard
    }

Output:
    {
      "gate_fidelity_pct": 99.97,
      "single_qubit_error_rate": 3e-4,
      "decoherence_dominated": false,
      "p1_at_gate_end": 0.5004,
      "purity_at_gate_end": 0.9994,
      "T1_dominated_error": 1.25e-4,
      "Tphi_dominated_error": 1.75e-4,
      "_provenance": {...},
      "_meta": {"wall_time_s": ...}
    }

Smoke test: transmon T1=80µs, T2=70µs, gate=20ns -> fidelity > 99.9%.

QuTiP: Johansson, Nation, Nori (2013), Computer Physics Communications.
License: BSD-3-Clause. Source: github.com/qutip/qutip
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "QuTiP (Quantum Toolbox in Python)",
    "tool_version": "5.2.3",
    "tool_license": "BSD-3-Clause",
    "tool_source_url": "https://qutip.org",
    "tool_paper": "Johansson J.R., Nation P.D., Nori F. (2012, 2013), 'QuTiP: An open-source Python framework for the dynamics of open quantum systems', Computer Physics Communications 183(8):1760-1772 and 184(4):1234-1240.",
    "tool_doi": "10.1016/j.cpc.2012.02.021",
    "physics_basis": "Lindblad master equation (Markovian open-system dynamics) with amplitude-damping (sigma_minus) and pure-dephasing (sigma_z) collapse operators. Gate fidelity computed as |<psi_target|rho_final|psi_target>|.",
    "confidence_class": "library",
    "embedded_constants": {
        "QUBIT_PARAMS": {
            "source": "Industry-typical T1/T2 ranges per qubit modality (Krantz Applied Physics Reviews 2019 for transmons; Bruzewicz 2019 for trapped ions; Slussarenko 2019 for photonic).",
            "confidence": "literature_review",
        },
    },
    "known_limitations": [
        "Single-qubit model only — does not account for crosstalk, leakage to higher levels, or non-Markovian noise (1/f).",
        "Gate driving is treated as ideal square-wave Rabi — real DRAG-shaped pulses give slightly different error structure.",
    ],
    "last_reviewed_date": "2026-05-22",
}

# Reference parameters per qubit modality (used if T1/T2 not provided)
QUBIT_PARAMS = {
    "transmon":          {"T1_us":  80.0, "T2_us":  70.0, "gate_ns":  20.0},
    "trapped_ion_Yb171": {"T1_us": 1e7,   "T2_us": 1e6,   "gate_ns":  10000.0},  # T1 effectively infinite
    "trapped_ion_Ca40":  {"T1_us": 1e6,   "T2_us": 5e5,   "gate_ns":  20000.0},
    "photonic":          {"T1_us": 1e9,   "T2_us": 1e9,   "gate_ns":  100.0},   # photons don't decay (in transit)
}


def compute(payload: dict) -> dict:
    import numpy as np
    import qutip as qt

    qtype = str(payload.get("qubit_type", "transmon")).strip()
    defaults = QUBIT_PARAMS.get(qtype, QUBIT_PARAMS["transmon"])

    T1_us = float(payload.get("T1_us", defaults["T1_us"]))
    T2_us = float(payload.get("T2_us", defaults["T2_us"]))
    gate_ns = float(payload.get("gate_duration_ns", defaults["gate_ns"]))
    target_gate = str(payload.get("target_gate", "x_pi_2")).strip()

    # Convert to SI (seconds)
    T1 = T1_us * 1e-6
    T2 = T2_us * 1e-6
    tg = gate_ns * 1e-9

    # T2 >= 2*T1 is unphysical (pure dephasing rate would be negative)
    if T2 > 2 * T1:
        T2 = 2 * T1  # clamp

    # Lindblad collapse operators
    # gamma1 = 1/T1, gamma_phi = 1/T2 - 1/(2*T1)
    gamma1 = 1.0 / T1
    gamma_phi = max(0.0, 1.0 / T2 - 1.0 / (2 * T1))

    sm = qt.sigmam()
    sz = qt.sigmaz()
    c_ops = [
        np.sqrt(gamma1) * sm,
        np.sqrt(2.0 * gamma_phi) * sz,
    ]

    # Drive Hamiltonian for X(theta) gate
    # H = (Omega/2) * sigma_x, with Omega chosen so that Omega*tg = theta
    if target_gate == "x_pi_2":
        theta = math.pi / 2
        target_state = (qt.basis(2, 0) - 1j * qt.basis(2, 1)).unit()
    elif target_gate == "x_pi":
        theta = math.pi
        target_state = qt.basis(2, 1)
    else:  # hadamard
        theta = math.pi
        target_state = (qt.basis(2, 0) + qt.basis(2, 1)).unit()

    Omega = theta / tg
    H = 0.5 * Omega * qt.sigmax()
    psi0 = qt.basis(2, 0)

    # Solve master equation
    tlist = np.linspace(0, tg, 50)
    result = qt.mesolve(H, psi0, tlist, c_ops, e_ops=[])
    rho_final = result.states[-1]

    # Gate fidelity = <psi_target | rho_final | psi_target>
    fid = float(qt.expect(target_state.proj(), rho_final))
    fid = max(0.0, min(1.0, fid))

    # Single qubit error rate
    error_rate = 1.0 - fid

    # Decomposition: T1 vs T_phi
    # In the small-error limit: error from T1 ≈ tg/(3*T1); error from T_phi ≈ tg/(2*T2) (approx)
    err_T1 = tg / (3.0 * T1)
    err_Tphi = tg / (2.0 * T2)
    decoherence_dominated = bool(err_T1 + err_Tphi > 0.5 * error_rate + 1e-12)

    # Purity of the final state
    purity = float((rho_final * rho_final).tr().real)
    p1 = float(qt.expect(qt.basis(2, 1).proj(), rho_final))

    out: dict = {
        "qubit_type": qtype,
        "T1_us": T1_us,
        "T2_us": T2_us,
        "gate_duration_ns": gate_ns,
        "target_gate": target_gate,
        "gate_fidelity_pct": round(fid * 100.0, 4),
        "single_qubit_error_rate": float(f"{error_rate:.3e}"),
        "decoherence_dominated": decoherence_dominated,
        "p1_at_gate_end": round(p1, 4),
        "purity_at_gate_end": round(purity, 4),
        "T1_dominated_error_est": float(f"{err_T1:.3e}"),
        "Tphi_dominated_error_est": float(f"{err_Tphi:.3e}"),
        "drive_rabi_rate_hz": round(Omega / (2 * math.pi), 2),
    }
    return out


def main() -> int:
    t0 = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2

    try:
        result = compute(payload)
    except Exception as exc:
        import traceback
        json.dump({
            "error": f"compute failed: {type(exc).__name__}: {exc}",
            "trace": traceback.format_exc().splitlines()[-3:],
        }, sys.stdout)
        return 3

    result["_provenance"] = PROVENANCE
    result["_meta"] = {"wall_time_s": round(time.time() - t0, 3)}
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
