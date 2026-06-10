#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/deployable_boom.py

Deployable boom — cantilever stiffness, first natural frequency, stow ratio.

A deployable boom (coilable/STEM/tape-spring/articulated mast) supports a tip
payload (antenna feed, magnetometer, solar sail spar, gravity-gradient mass)
at the end of a long slender member that stows compactly and extends on orbit.
The two design-critical quantities are the static tip deflection under a tip
load and the first cantilever bending mode (which must clear the ADCS control
bandwidth and avoid resonance with reaction-wheel / thruster excitation).

Governing physics (Euler-Bernoulli cantilever; Blevins "Formulas for Natural
Frequency and Mode Shape" 1979; Roark's "Formulas for Stress and Strain"):

  Static tip deflection of a cantilever, point load F at the free tip:
      delta = F * L^3 / (3 * E * I)
  First (fundamental) cantilever bending natural frequency:
      f1 = (1.875^2 / (2*pi)) * sqrt( E*I / (rho * A * L^4) )
  where 1.875 is the first eigenvalue (beta1*L) of the clamped-free beam,
  E the modulus, I the second moment of area, rho the density, A the
  cross-section area, L the deployed length. For a thin circular tube of
  outer radius r_o and wall t:
      A = pi*(r_o^2 - r_i^2),  I = (pi/4)*(r_o^4 - r_i^4),  r_i = r_o - t.
  Stowed/deployed ratio (packaging efficiency):
      ratio = L_stowed / L_deployed

A tip mass m_tip lowers f1; this tool includes the standard tip-mass
correction f1_tip = f1 * sqrt( m_beam_eff / (m_beam_eff + m_tip) ) using the
clamped-free effective modal mass m_beam_eff = 0.2235 * rho*A*L.

Input:
    {
      "deployed_length_m": 5.0,        # L [m]
      "outer_radius_m": 0.02,          # r_o [m]  (thin tube)
      "wall_thickness_m": 0.0003,      # t  [m]
      "youngs_modulus_pa": 7.0e10,     # E [Pa] (default Al alloy 70 GPa)
      "density_kg_m3": 2700.0,         # rho [kg/m3]
      "tip_load_n": 5.0,               # F [N] static tip load
      "tip_mass_kg": 0.5,              # m_tip [kg] (for f1 correction)
      "stowed_length_m": 0.3           # L_stowed [m] (for stow ratio)
    }

Output (flat, declared output_keys):
    {
      "tip_deflection_mm": ...,        # delta [mm]
      "first_mode_hz": ...,            # f1 (with tip mass) [Hz]
      "deployed_length_m": ...,        # L [m]
      "stowed_length_m": ...,          # L_stowed [m]
      ...
    }

References:
- Blevins (1979), "Formulas for Natural Frequency and Mode Shape", Van Nostrand.
- Young & Budynas (2002), "Roark's Formulas for Stress and Strain", 7th ed.
- Pellegrino (2001), "Deployable Structures", CISM/Springer.
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
    "tool_name": 'deployable_boom (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Blevins (1979), 'Formulas for Natural Frequency and Mode Shape'; Roark's Formulas (cantilever)",
    "physics_basis": 'Euler-Bernoulli cantilever: delta = F L^3/(3 E I); f1 = (1.875^2/2pi) sqrt(E I/(rho A L^4)).',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-06-10",
}

BETA1 = 1.875104                    # first clamped-free eigenvalue (beta1*L)
MODAL_MASS_FRAC = 0.2235          # clamped-free effective modal mass fraction


def compute(payload: dict) -> dict:
    L = float(payload.get("deployed_length_m", 5.0))
    r_o = float(payload.get("outer_radius_m", 0.02))
    t = float(payload.get("wall_thickness_m", 0.0003))
    E = float(payload.get("youngs_modulus_pa", 7.0e10))
    rho = float(payload.get("density_kg_m3", 2700.0))
    F = float(payload.get("tip_load_n", 5.0))
    m_tip = float(payload.get("tip_mass_kg", 0.5))
    L_stowed = float(payload.get("stowed_length_m", 0.3))

    if L <= 0 or r_o <= 0 or E <= 0 or rho <= 0:
        raise ValueError("deployed_length_m, outer_radius_m, modulus, density must be positive")
    if not (0 < t < r_o):
        raise ValueError("require 0 < wall_thickness_m < outer_radius_m")

    r_i = r_o - t
    # Thin circular tube section properties.
    A = math.pi * (r_o ** 2 - r_i ** 2)
    I = (math.pi / 4.0) * (r_o ** 4 - r_i ** 4)
    EI = E * I

    # Static tip deflection (point load at free tip).
    delta_m = F * L ** 3 / (3.0 * EI)
    delta_mm = delta_m * 1000.0

    # First cantilever bending frequency (bare beam).
    f1_bare = (BETA1 ** 2 / (2.0 * math.pi)) * math.sqrt(EI / (rho * A * L ** 4))

    # Tip-mass correction (effective modal mass of clamped-free beam).
    m_beam = rho * A * L
    m_beam_eff = MODAL_MASS_FRAC * m_beam
    f1_tip = f1_bare * math.sqrt(m_beam_eff / (m_beam_eff + m_tip)) if (m_beam_eff + m_tip) > 0 else f1_bare

    stow_ratio = L_stowed / L if L > 0 else float("inf")
    packaging_efficiency = L / L_stowed if L_stowed > 0 else float("inf")

    I_r = I
    EI_r = round(EI, 4)
    delta_r = round(delta_mm, 4)
    f1_bare_r = round(f1_bare, 4)
    f1_tip_r = round(f1_tip, 4)
    A_r = A

    worked = [
        worked_calc(
            label="Second moment of area (thin tube)",
            formula="I = (pi/4) x (r_o^4 - r_i^4)",
            values={"pi": (math.pi, ""), "r_o": (r_o, "m"), "r_i": (r_i, "m")},
            result=I_r,
            result_unit="m^4",
            assumptions=["thin circular tube; r_i = r_o - wall_thickness"],
        ),
        worked_calc(
            label="Static tip deflection (cantilever, tip load)",
            formula="delta = F x L^3 / (3 x E x I)",
            values={"F": (F, "N"), "L": (L, "m"), "E": (E, "Pa"), "I": (I_r, "m^4")},
            result=round(delta_m, 8),
            result_unit="m",
            assumptions=["Euler-Bernoulli cantilever, point load at free tip (Roark Table 8.1)"],
        ),
        worked_calc(
            label="Tip deflection in mm",
            formula="delta_mm = delta_m x 1000",
            values={"delta_m": (round(delta_m, 8), "m")},
            result=delta_r,
            result_unit="mm",
        ),
        worked_calc(
            label="First cantilever bending frequency (bare beam)",
            formula="f1 = (1.875^2 / (2 x pi)) x sqrt(E x I / (rho x A x L^4))",
            values={"E": (E, "Pa"), "I": (I_r, "m^4"), "rho": (rho, "kg/m^3"), "A": (A_r, "m^2"), "L": (L, "m")},
            result=f1_bare_r,
            result_unit="Hz",
            assumptions=["clamped-free beam, beta1*L = 1.875104 (Blevins 1979 Table 8-1)"],
        ),
        worked_calc(
            label="First mode with tip mass",
            formula="f1_tip = f1 x sqrt(m_beam_eff / (m_beam_eff + m_tip))",
            values={"f1": (f1_bare_r, "Hz"), "m_beam_eff": (round(m_beam_eff, 5), "kg"), "m_tip": (m_tip, "kg")},
            result=f1_tip_r,
            result_unit="Hz",
            assumptions=["effective modal mass m_beam_eff = 0.2235 x rho x A x L (clamped-free)"],
        ),
        worked_calc(
            label="Stowed/deployed ratio",
            formula="ratio = L_stowed / L",
            values={"L_stowed": (L_stowed, "m"), "L": (L, "m")},
            result=round(stow_ratio, 5),
            result_unit="",
            assumptions=["packaging efficiency = 1/ratio = deployed/stowed length"],
        ),
    ]

    return {
        "deployed_length_m": L,
        "stowed_length_m": L_stowed,
        "outer_radius_m": r_o,
        "wall_thickness_m": t,
        "youngs_modulus_pa": E,
        "density_kg_m3": rho,
        "tip_load_n": F,
        "tip_mass_kg": m_tip,
        "section_area_m2": A_r,
        "second_moment_area_m4": I_r,
        "bending_stiffness_ei_nm2": EI_r,
        "tip_deflection_mm": delta_r,
        "first_mode_bare_hz": f1_bare_r,
        "first_mode_hz": f1_tip_r,
        "boom_mass_kg": round(m_beam, 4),
        "stow_ratio": round(stow_ratio, 5),
        "packaging_efficiency": round(packaging_efficiency, 3),
        "worked": worked,
        "data_sources": [
            "Blevins (1979), 'Formulas for Natural Frequency and Mode Shape', Van Nostrand (Table 8-1 cantilever)",
            "Young & Budynas (2002), 'Roark's Formulas for Stress and Strain', 7th ed. (cantilever deflection)",
            "Pellegrino (2001), 'Deployable Structures', CISM/Springer",
        ],
    }


def main() -> int:
    t = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse: {exc}"}, sys.stdout)
        return 2
    try:
        out = compute(payload)
        out["_provenance"] = PROVENANCE
        out.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t, 3)
    except Exception as exc:  # noqa: BLE001 — surface any failure as structured error
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    import sys as _sys

    # ---- Self-test: 5 m Al boom, 20 mm OD x 0.3 mm wall, 0.5 kg tip, 5 N ----
    # Thin tube: A ~ 3.7e-5 m^2, I ~ 7.4e-9 m^4, EI ~ 0.52 N.m^2.
    # delta = 5*125/(3*0.52) ~ 400 mm (slender boom — large but finite).
    # f1 bare ~ a fraction of a Hz to a few Hz; with 0.5 kg tip it drops.
    # Sanity: f1_tip in (0, 50] Hz; deflection positive + finite.
    payload_default = {
        "deployed_length_m": 5.0,
        "outer_radius_m": 0.02,
        "wall_thickness_m": 0.0003,
        "youngs_modulus_pa": 7.0e10,
        "density_kg_m3": 2700.0,
        "tip_load_n": 5.0,
        "tip_mass_kg": 0.5,
        "stowed_length_m": 0.3,
    }
    result = compute(payload_default)

    _sink = _sys.stdout if _sys.stdin.isatty() else _sys.stderr
    json.dump(result, _sink, indent=2)
    print(file=_sink)

    errors = []
    f1 = result["first_mode_hz"]
    if not (0.0 < f1 <= 50.0):
        errors.append(f"FAIL: first_mode_hz={f1} not in (0, 50] Hz for a slender boom")
    else:
        print(f"PASS: first_mode_hz = {f1} Hz", file=_sys.stderr)

    delta = result["tip_deflection_mm"]
    if not (0.0 < delta < 5000.0):
        errors.append(f"FAIL: tip_deflection_mm={delta} not in (0, 5000) mm")
    else:
        print(f"PASS: tip_deflection_mm = {delta} mm", file=_sys.stderr)

    # f1 with tip mass must be <= bare-beam f1.
    if result["first_mode_hz"] > result["first_mode_bare_hz"] + 1e-9:
        errors.append("FAIL: tip-mass f1 should be <= bare f1")
    else:
        print(f"PASS: f1_tip ({result['first_mode_hz']}) <= f1_bare ({result['first_mode_bare_hz']})", file=_sys.stderr)

    # Deflection sanity: delta = F L^3/(3 E I).
    EI = result["bending_stiffness_ei_nm2"]
    delta_expected_mm = payload_default["tip_load_n"] * payload_default["deployed_length_m"] ** 3 / (3.0 * EI) * 1000.0
    if abs(delta - delta_expected_mm) > 1e-3 * max(1.0, delta):
        errors.append(f"FAIL: tip_deflection_mm={delta} != F L^3/(3EI)={delta_expected_mm}")
    else:
        print(f"PASS: tip_deflection_mm matches F L^3/(3 E I)", file=_sys.stderr)

    # Stow ratio < 1 (boom must pack down).
    if not (0.0 < result["stow_ratio"] < 1.0):
        errors.append(f"FAIL: stow_ratio={result['stow_ratio']} should be in (0,1)")
    else:
        print(f"PASS: stow_ratio = {result['stow_ratio']} (packs down)", file=_sys.stderr)

    if errors:
        for e in errors:
            print(e, file=_sys.stderr)
        _sys.exit(1)
    print("ALL DEPLOYABLE-BOOM SELF-TESTS PASSED", file=_sys.stderr)
    if not _sys.stdin.isatty():
        _sys.exit(main())
