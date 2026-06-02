#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/electro_absorption_modulator.py

Electro-absorption modulator (EAM) sizing for high-speed optical links.
InP or Si-based EAM model; provides extinction ratio, insertion loss,
3-dB bandwidth and V-pi for a given device geometry.

Companies served: aXenic (UK InP/Si EAM), Vector Photonics' downstream
customers, optical comms integrators.

Input:
    {
      "wavelength_nm": 1550.0,
      "modulator_length_um": 200.0,
      "applied_voltage_v": 2.0,
      "bias_voltage_v": -1.0,
      "material": "InGaAsP" | "GaAs" | "Si",
      "active_region_thickness_nm": 200.0,
      "confinement_factor": 0.3
    }

Output:
    extinction_ratio_db, insertion_loss_db, three_db_bandwidth_ghz,
    v_pi_v, chirp_parameter_alpha, _provenance.

Physics:
  Quantum-confined Stark effect (QCSE) absorption shift:
    Delta_alpha ~ alpha_0 * (V_applied / V_typ)^2  (for low fields)
  Extinction ratio:  ER (dB) = 4.343 * Gamma * Delta_alpha * L
  Insertion loss:    IL (dB) = residual absorption + propagation losses
  3-dB BW:           BW = 1 / (2 pi R C)   where C ~ epsilon * L * w / t

References:
- Wood, T.H., "Multiple quantum well (MQW) waveguide modulators",
  J. Lightwave Tech. 6(6):743-757, 1988.
- Liu, J. et al., "Silicon Electro-Absorption Modulator", Nature Photonics 2:
  433-437, 2008.
- Kuo, Y.-H. et al., "Strong quantum-confined Stark effect in germanium",
  Nature 437:1334-1336, 2005.
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
    "tool_name": "electro_absorption_modulator (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Wood (1988) J. Lightwave Tech. 6(6):743-757; "
        "Liu et al. (2008) Nature Photonics 2:433 DOI:10.1038/nphoton.2008.99; "
        "Kuo et al. (2005) Nature 437:1334."
    ),
    "physics_basis": (
        "Quantum-confined Stark effect (QCSE) absorption shift. Extinction "
        "ratio = 4.343 * confinement_factor * delta_alpha * L. Bandwidth = "
        "1/(2 pi RC) where C = epsilon * w * L / t."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "QCSE_ABSORPTION_COEFFS": {
            "source": "Wood 1988 Table I; InGaAsP MQW: ~5000 cm^-1 peak shift per 100 kV/cm",
            "confidence": "textbook",
        },
        "MATERIAL_PERMITTIVITY": {
            "source": "Bhattacharya, Semiconductor Optoelectronic Devices 2nd ed. (Pearson 1996) — InP 12.5, GaAs 13.1, Si 11.7",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


# Material properties
# alpha_qcse_max: max QCSE absorption coefficient shift per unit field (cm^-1 per kV/cm)
# eps_r: relative permittivity
# residual_loss_cm: residual absorption + propagation loss in OFF state
MATERIALS = {
    "InGaAsP": {"alpha_qcse_per_field": 50.0, "eps_r": 12.5, "residual_loss_cm_1": 5.0, "alpha_chirp": 0.3},
    "InGaAs":  {"alpha_qcse_per_field": 80.0, "eps_r": 13.9, "residual_loss_cm_1": 8.0, "alpha_chirp": 0.4},
    "GaAs":    {"alpha_qcse_per_field": 40.0, "eps_r": 13.1, "residual_loss_cm_1": 3.0, "alpha_chirp": 0.2},
    "Si":      {"alpha_qcse_per_field": 15.0, "eps_r": 11.7, "residual_loss_cm_1": 1.0, "alpha_chirp": -0.1},
    "Ge":      {"alpha_qcse_per_field": 90.0, "eps_r": 16.0, "residual_loss_cm_1": 10.0, "alpha_chirp": 0.5},
}


def compute(payload: dict) -> dict:
    wavelength_nm = float(payload.get("wavelength_nm", 1550.0))
    length_um = float(payload.get("modulator_length_um", 200.0))
    v_applied = float(payload.get("applied_voltage_v", 2.0))
    v_bias = float(payload.get("bias_voltage_v", -1.0))
    material = str(payload.get("material", "InGaAsP"))
    thickness_nm = float(payload.get("active_region_thickness_nm", 200.0))
    confinement = float(payload.get("confinement_factor", 0.3))
    width_um = float(payload.get("waveguide_width_um", 2.0))
    contact_resistance_ohm = float(payload.get("contact_resistance_ohm", 25.0))

    if material not in MATERIALS:
        raise ValueError(f"unknown material {material!r}; known: {list(MATERIALS)}")
    mat = MATERIALS[material]

    # Field across active region (kV/cm) — note 1 V across 200 nm = 50 kV/cm
    total_voltage = abs(v_applied + v_bias)
    field_kv_per_cm = (total_voltage * 1000.0) / (thickness_nm * 1e-7 * 1e3)  # V to kV, nm to cm
    # Convert properly: field V/m = V / (t_nm * 1e-9); then to kV/cm = field * 1e-5
    field_v_per_m = total_voltage / (thickness_nm * 1e-9)
    field_kv_per_cm = field_v_per_m * 1e-5

    # Absorption shift (cm^-1)
    delta_alpha_cm_1 = mat["alpha_qcse_per_field"] * field_kv_per_cm
    # Length in cm
    L_cm = length_um * 1e-4

    # Extinction ratio (dB): power ratio = exp(Gamma * delta_alpha * L)
    extinction_ratio_db = 4.343 * confinement * delta_alpha_cm_1 * L_cm

    # Insertion loss: residual loss × length × confinement (dB)
    insertion_loss_db = 4.343 * confinement * mat["residual_loss_cm_1"] * L_cm
    # Plus 1-2 dB coupling loss per facet (typical InP EAM)
    facet_coupling_loss_db = 2.0
    total_insertion_loss_db = insertion_loss_db + facet_coupling_loss_db

    # Junction capacitance: C = eps0 * eps_r * w * L / t
    eps_0 = 8.854e-12  # F/m
    width_m = width_um * 1e-6
    length_m = length_um * 1e-6
    thickness_m = thickness_nm * 1e-9
    C_junction_f = eps_0 * mat["eps_r"] * width_m * length_m / thickness_m
    C_junction_pf = C_junction_f * 1e12

    # 3-dB bandwidth: assume 50 ohm load + contact_resistance
    R_total = 50.0 + contact_resistance_ohm
    f_3db_hz = 1.0 / (2.0 * math.pi * R_total * C_junction_f)
    f_3db_ghz = f_3db_hz / 1e9

    # V_pi (voltage to swing from ER=0 to ER=10 dB)
    # 10 dB = 4.343 * Gamma * delta_alpha(V) * L => delta_alpha = 10 / (4.343 * Gamma * L)
    delta_alpha_for_10dB = 10.0 / (4.343 * confinement * L_cm)
    field_for_10dB_kv_cm = delta_alpha_for_10dB / mat["alpha_qcse_per_field"]
    v_pi_v = field_for_10dB_kv_cm * 1e5 * thickness_m  # back to V

    # Chirp parameter (Henry's alpha): material-dependent
    chirp_alpha = mat["alpha_chirp"]

    # Drive power (back-of-envelope): P = 0.5 * C * V^2 * f
    f_design_ghz = float(payload.get("design_data_rate_ghz", min(f_3db_ghz, 50.0)))
    drive_power_mw = 0.5 * C_junction_f * (total_voltage ** 2) * f_design_ghz * 1e9 * 1000.0

    # Rounded intermediates for chained display.
    field_r = round(field_kv_per_cm, 2)
    delta_alpha_r = round(delta_alpha_cm_1, 1)
    L_cm_r = round(L_cm, 6)
    er_r = round(extinction_ratio_db, 2)
    il_r = round(insertion_loss_db, 2)
    C_pf_r = round(C_junction_pf, 3)
    R_total_r = round(R_total, 1)
    bw_r = round(f_3db_ghz, 2)

    worked = [
        worked_calc(
            label="Electric field across active region",
            formula="E_field = V_total / (t_nm x 1e-9) x 1e-5",
            values={
                "V_total": (round(total_voltage, 3), "V"),
                "t_nm": (thickness_nm, "nm"),
            },
            result=field_r, result_unit="kV/cm",
            assumptions=[
                "total_voltage = |v_applied + v_bias|",
                "1e-9 converts nm to m; 1e-5 converts V/m to kV/cm",
            ],
        ),
        worked_calc(
            label="QCSE absorption shift",
            formula="d_alpha = alpha_qcse x E_field",
            values={
                "alpha_qcse": (mat["alpha_qcse_per_field"], "cm^-1 per kV/cm"),
                "E_field": (field_r, "kV/cm"),
            },
            result=delta_alpha_r, result_unit="cm^-1",
            assumptions=["quantum-confined Stark effect linear approximation (Wood 1988)"],
        ),
        worked_calc(
            label="Extinction ratio",
            formula="ER_dB = 4.343 x Gamma x d_alpha x L_cm",
            values={
                "Gamma": (confinement, ""),
                "d_alpha": (delta_alpha_r, "cm^-1"),
                "L_cm": (L_cm_r, "cm"),
            },
            result=er_r, result_unit="dB",
            assumptions=[
                "4.343 = 10/ln(10); L_cm = modulator_length_um x 1e-4",
            ],
        ),
        worked_calc(
            label="Intrinsic insertion loss (residual absorption)",
            formula="IL_dB = 4.343 x Gamma x loss_cm x L_cm",
            values={
                "Gamma": (confinement, ""),
                "loss_cm": (mat["residual_loss_cm_1"], "cm^-1"),
                "L_cm": (L_cm_r, "cm"),
            },
            result=il_r, result_unit="dB",
            assumptions=["residual absorption in OFF state; excludes facet coupling loss"],
        ),
        worked_calc(
            label="Junction capacitance",
            formula="C_j = eps0 x eps_r x w_m x L_m / t_m x 1e12",
            values={
                "eps0": (8.854e-12, "F/m"),
                "eps_r": (mat["eps_r"], ""),
                "w_m": (round(width_m, 9), "m"),
                "L_m": (round(length_m, 9), "m"),
                "t_m": (round(thickness_m, 12), "m"),
            },
            result=C_pf_r, result_unit="pF",
            assumptions=["parallel-plate capacitor approximation; x 1e12 converts F to pF"],
        ),
        worked_calc(
            label="3-dB modulation bandwidth",
            formula="BW = 1 / (2 x pi x R_total x C_j_F) / 1e9",
            values={
                "R_total": (R_total_r, "Ohm"),
                "C_j_F": (round(C_junction_f, 15), "F"),
            },
            result=bw_r, result_unit="GHz",
            assumptions=["R_total = 50 Ohm load + contact_resistance; / 1e9 converts Hz to GHz"],
        ),
    ]

    return {
        "wavelength_nm": wavelength_nm,
        "modulator_length_um": length_um,
        "material": material,
        "applied_voltage_v": v_applied,
        "bias_voltage_v": v_bias,
        "total_voltage_v": round(total_voltage, 3),
        "field_kv_per_cm": field_r,
        "absorption_shift_cm_1": delta_alpha_r,
        "extinction_ratio_db": er_r,
        "insertion_loss_db": il_r,
        "facet_coupling_loss_db": facet_coupling_loss_db,
        "total_insertion_loss_db": round(total_insertion_loss_db, 2),
        "junction_capacitance_pf": C_pf_r,
        "three_db_bandwidth_ghz": bw_r,
        "v_pi_v": round(v_pi_v, 3),
        "chirp_parameter_alpha": chirp_alpha,
        "drive_power_mw_at_design": round(drive_power_mw, 2),
        "confinement_factor": confinement,
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
