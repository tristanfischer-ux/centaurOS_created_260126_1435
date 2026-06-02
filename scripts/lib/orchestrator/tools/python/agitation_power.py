#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/agitation_power.py

Agitation power for stirred-tank bioreactor. Reads JSON from stdin,
writes JSON to stdout.

Input:
    {
      "impeller_diameter_m": 0.3,
      "rpm": 200,
      "fluid_density_kg_m3": 1000.0,
      "impeller_type": "rushton",      # rushton | pitched_blade | marine | hydrofoil
      "fluid_viscosity_pa_s": 0.001,
      "tank_diameter_m": 0.9,           # T = 3 × D typical
      "gassed": false,                  # if true, applies gas-flow derating
      "qg_vvm": 0.5                     # gas flow vvm (vol gas / vol liquid / min)
    }

Output:
    {
      "power_w": 350.0,
      "reynolds_impeller": ...,
      "power_number": 5.0,
      "tip_speed_m_s": ...,
      ...
    }

Power consumption (ungassed): P = Np × ρ × N³ × D⁵
where Np = power number (function of Reynolds & impeller geometry).

Reference: Doran "Bioprocess Engineering Principles" 2nd ed., Ch. 8;
Bates, Fondy, Corpstein (1963) for power-number correlations;
Michel & Miller (1962) for gassed-power correlation.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'agitation_power (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Bates, Fondy, Corpstein (1963), 'An Examination of Some Geometric Parameters of Impeller Power', Ind. Eng. Chem. Process Des. Dev. 2(4):310-314; Doran (2013) Bioprocess Engineering Principles 2nd ed. Ch.8",
    "physics_basis": "Newton's law for stirred tanks: P = N_p × ρ × N³ × D⁵. Rushton turbine N_p ≈ 5 in turbulent regime (Re > 10000).",
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Fully turbulent (Re > 10⁴) power numbers per impeller (single impeller,
# baffled tank, D/T ≈ 1/3). For unbaffled tanks Np drops ~3×.
NP_TURBULENT = {
    "rushton": 5.0,             # Six-blade flat-blade disc turbine
    "pitched_blade": 1.3,       # 45° pitched-blade turbine, 4 blades
    "marine": 0.35,             # 3-blade marine propeller
    "hydrofoil": 0.30,          # Lightnin A310 / Chemineer HE-3 type
    "smith_concave": 4.5,       # Concave-blade Smith turbine
}


def compute(payload: dict) -> dict:
    d_imp_m = float(payload.get("impeller_diameter_m", 0.3))
    rpm = float(payload.get("rpm", 200))
    rho = float(payload.get("fluid_density_kg_m3", 1000.0))
    impeller_type = str(payload.get("impeller_type", "rushton")).lower()
    viscosity = float(payload.get("fluid_viscosity_pa_s", 0.001))
    tank_d_m = float(payload.get("tank_diameter_m", d_imp_m * 3.0))
    gassed = bool(payload.get("gassed", False))
    qg_vvm = float(payload.get("qg_vvm", 0.0))

    if impeller_type not in NP_TURBULENT:
        raise ValueError(
            f"unknown impeller_type {impeller_type!r}; supported: {list(NP_TURBULENT.keys())}"
        )

    n_per_s = rpm / 60.0  # rev/s
    tip_speed_m_s = math.pi * d_imp_m * n_per_s

    # Impeller Reynolds number: Re = ρ × N × D² / μ
    re_imp = (rho * n_per_s * (d_imp_m ** 2)) / max(1e-12, viscosity)

    # Power number — flow regime dependent
    np_turb = NP_TURBULENT[impeller_type]
    if re_imp < 10:
        # Laminar regime: P = K_L × μ × N² × D³ (Np ≈ K_L / Re)
        K_L = {"rushton": 70, "pitched_blade": 47, "marine": 41,
               "hydrofoil": 41, "smith_concave": 65}.get(impeller_type, 70)
        n_power = K_L / max(1e-6, re_imp)
    elif re_imp < 10_000:
        # Transitional: linear interpolation between laminar and turbulent
        K_L = 70
        np_lam = K_L / max(1e-6, re_imp)
        # Smooth interpolation log-log
        log_re_low = 1.0   # log10(10)
        log_re_high = 4.0  # log10(10000)
        frac = (math.log10(re_imp) - log_re_low) / (log_re_high - log_re_low)
        n_power = np_lam * (1 - frac) + np_turb * frac
    else:
        n_power = np_turb

    # Ungassed power: P_ug = Np × ρ × N³ × D⁵
    power_w_ungassed = n_power * rho * (n_per_s ** 3) * (d_imp_m ** 5)

    # Gassed power correction (Michel & Miller 1962):
    # P_g / P_ug = 0.706 × (P_ug² × N × D³ / Q_g^0.56)^0.45 / P_ug
    # Simplified: P_g/P_ug = 0.5 + 0.5/(1 + 2.5 × N_a), where N_a = Q_g / (N × D³)
    if gassed and qg_vvm > 0:
        # Convert vvm to m³/s gas flow given tank volume
        # Tank volume (cylindrical, H = T): V_t = π/4 × T² × T = π/4 × T³
        # but typical H = T so V_t = π/4 × T² × T. Use payload if given.
        v_tank_m3 = (math.pi / 4.0) * (tank_d_m ** 2) * tank_d_m
        qg_m3_s = qg_vvm * v_tank_m3 / 60.0
        Na = qg_m3_s / max(1e-9, (n_per_s * d_imp_m ** 3))
        pg_over_pu = 1.0 / (1.0 + 2.5 * Na)
        pg_over_pu = max(0.4, pg_over_pu)  # typically not less than ~40%
        power_w = power_w_ungassed * pg_over_pu
    else:
        power_w = power_w_ungassed
        pg_over_pu = 1.0

    # Volumetric power input
    v_tank = (math.pi / 4.0) * (tank_d_m ** 2) * tank_d_m
    pv_w_m3 = power_w / max(1e-6, v_tank)

    # Worked calculations — pure arithmetic steps only.
    # Power number n_power is a table lookup or piecewise interpolation
    # (not hand-checkable), so it is passed as a live input to the
    # ungassed-power step.  The gassed correction uses min/max clamping, skipped.
    n_per_s_r = round(n_per_s, 4)
    tip_r = round(tip_speed_m_s, 3)
    re_r = round(re_imp, 1)
    np_r = round(n_power, 3)
    pu_r = round(power_w_ungassed, 2)
    # Use the actual power applied (gassed or ungassed) so the volumetric
    # power substitution reproduces the stated result for both branches.
    pw_r = round(power_w, 2)
    v_tank_r = round(v_tank, 4)
    pv_r = round(pw_r / max(1e-6, v_tank), 2)
    worked = [
        worked_calc(
            label="Impeller rotational speed",
            formula="N = rpm / 60",
            values={"rpm": (rpm, "rpm")},
            result=n_per_s_r, result_unit="rev/s",
            assumptions=["converts rpm to revolutions per second for SI power formula"],
        ),
        worked_calc(
            label="Impeller tip speed",
            formula="v_tip = pi x D x N",
            values={"D": (d_imp_m, "m"), "N": (n_per_s_r, "rev/s")},
            result=tip_r, result_unit="m/s",
            assumptions=["circumferential tip velocity; indicator of shear stress on cells"],
        ),
        worked_calc(
            label="Impeller Reynolds number",
            formula="Re = rho x N x D^2 / mu",
            values={
                "rho": (rho, "kg/m^3"),
                "N": (n_per_s_r, "rev/s"),
                "D": (d_imp_m, "m"),
                "mu": (viscosity, "Pa.s"),
            },
            result=re_r, result_unit="",
            assumptions=["Re > 10000 = fully turbulent; Re < 10 = laminar (Doran Ch.8)"],
        ),
        worked_calc(
            label="Ungassed agitation power",
            formula="P_ug = Np x rho x N^3 x D^5",
            values={
                "Np": (np_r, ""),
                "rho": (rho, "kg/m^3"),
                "N": (n_per_s_r, "rev/s"),
                "D": (d_imp_m, "m"),
            },
            result=pu_r, result_unit="W",
            assumptions=[
                "Np from Bates-Fondy-Corpstein turbulent power numbers; piecewise for transitional Re",
                "single impeller, baffled tank, D/T ~ 1/3",
            ],
        ),
        worked_calc(
            label="Volumetric power input",
            formula="P_V = P_w / V_tank",
            # P_w is gassed power when gassed=True, ungassed otherwise — mirrors
            # the same branch the code takes when computing pv_w_m3.
            values={"P_w": (pw_r, "W"), "V_tank": (v_tank_r, "m^3")},
            result=pv_r, result_unit="W/m^3",
            assumptions=[
                "cylindrical tank assumed H = T; V_tank = pi/4 x T^3",
                "P_w = gassed power when gassed=True (Michel & Miller correction applied upstream)",
            ],
        ),
    ]

    return {
        "impeller_diameter_m": d_imp_m,
        "rpm": rpm,
        "fluid_density_kg_m3": rho,
        "fluid_viscosity_pa_s": viscosity,
        "impeller_type": impeller_type,
        "tank_diameter_m": tank_d_m,
        "tip_speed_m_s": round(tip_speed_m_s, 3),
        "reynolds_impeller": round(re_imp, 1),
        "power_number": round(n_power, 3),
        "gassed": gassed,
        "qg_vvm": qg_vvm,
        "gassed_power_ratio": round(pg_over_pu, 3),
        "power_ungassed_w": round(power_w_ungassed, 2),
        "power_w": round(power_w, 2),
        "power_volumetric_w_m3": round(pv_w_m3, 2),
        "tank_volume_m3_assumed": round(v_tank, 4),
        "worked": worked,
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
