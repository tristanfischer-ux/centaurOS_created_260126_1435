#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/reflector_surface_rms.py

Reflector antenna surface accuracy via the Ruze equation.

A parabolic / mesh reflector antenna loses gain when its reflecting surface
deviates from the ideal paraboloid: random surface errors scatter energy out
of the main beam. The Ruze equation gives the gain-loss factor as a function
of the RMS surface error eps_rms relative to wavelength. The classic design
rule is eps_rms < lambda/20 for under ~1 dB of loss; the boresight gain of an
aperture of diameter D with aperture efficiency eta_ap is then degraded by the
Ruze factor.

Governing physics (Ruze (1966), "Antenna tolerance theory — a review",
Proc. IEEE 54(4); Balanis "Antenna Theory"):

  Ruze gain-loss factor (correlated-error / standard form):
      eta_ruze = exp( -(4*pi*eps_rms / lambda)^2 )
  Ruze loss in dB:
      L_ruze_dB = -10*log10(eta_ruze)
              = 685.81 * (eps_rms / lambda)^2          [dB, exact algebra]
  Ideal (no-error) boresight gain of a circular aperture:
      G0 = eta_ap * (pi*D / lambda)^2
  Net realised gain:
      G = 10*log10(G0) + 10*log10(eta_ruze)
        = G0_dBi - L_ruze_dB
  Wavelength:
      lambda = c / f

Input:
    {
      "aperture_diameter_m": 3.0,      # D [m]
      "frequency_ghz": 12.0,           # f [GHz]  (X/Ku)
      "surface_rms_m": 0.0005,         # eps_rms [m]  (0.5 mm)
      "aperture_efficiency": 0.65      # eta_ap (illumination + spillover etc.)
    }
    (lambda may be given directly as "wavelength_m" instead of frequency_ghz.)

Output (flat, declared output_keys):
    {
      "surface_rms_mm": ...,           # eps_rms [mm]
      "ruze_loss_db": ...,             # L_ruze [dB]
      "effective_gain_dbi": ...,       # G [dBi]
      ...
    }

References:
- Ruze (1966), "Antenna tolerance theory — a review", Proc. IEEE 54(4).
- Balanis (2016), "Antenna Theory: Analysis and Design", 4th ed.
- Baars (2007), "The Paraboloidal Reflector Antenna in Radio Astronomy".
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
    "tool_name": 'reflector_surface_rms (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Ruze (1966), 'Antenna tolerance theory — a review', Proc. IEEE 54(4)",
    "physics_basis": 'Ruze: eta = exp(-(4 pi eps_rms/lambda)^2); G0 = eta_ap (pi D/lambda)^2; G = G0_dBi - L_ruze_dB.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-06-10",
}

C_LIGHT = 299_792_458.0            # speed of light [m/s]


def compute(payload: dict) -> dict:
    D = float(payload.get("aperture_diameter_m", 3.0))
    eps_rms = float(payload.get("surface_rms_m", 0.0005))
    eta_ap = float(payload.get("aperture_efficiency", 0.65))

    if "wavelength_m" in payload and payload["wavelength_m"]:
        lam = float(payload["wavelength_m"])
        f_ghz = (C_LIGHT / lam) / 1e9
    else:
        f_ghz = float(payload.get("frequency_ghz", 12.0))
        lam = C_LIGHT / (f_ghz * 1e9)

    if D <= 0 or lam <= 0 or eps_rms < 0:
        raise ValueError("aperture_diameter_m, wavelength must be > 0 and surface_rms_m >= 0")
    if not (0.0 < eta_ap <= 1.0):
        raise ValueError("aperture_efficiency must be in (0, 1]")

    # Ruze gain-loss factor.
    x = 4.0 * math.pi * eps_rms / lam
    eta_ruze = math.exp(-(x ** 2))
    ruze_loss_db = -10.0 * math.log10(eta_ruze)

    # Ideal aperture gain.
    g0_lin = eta_ap * (math.pi * D / lam) ** 2
    g0_dbi = 10.0 * math.log10(g0_lin)

    # Net realised gain.
    eff_gain_dbi = g0_dbi - ruze_loss_db

    # Design-rule check: eps_rms vs lambda/20.
    lam_over_20 = lam / 20.0
    meets_rule = eps_rms <= lam_over_20
    # Half-power beamwidth (deg), HPBW ~= 70 * lambda / D (uniform-ish illum).
    hpbw_deg = 70.0 * lam / D

    lam_r = round(lam, 6)
    eps_mm = round(eps_rms * 1000.0, 4)
    eta_ruze_r = round(eta_ruze, 6)
    loss_r = round(ruze_loss_db, 4)
    g0_r = round(g0_dbi, 3)
    eff_r = round(eff_gain_dbi, 3)

    worked = [
        worked_calc(
            label="Wavelength",
            formula="lambda = c / f",
            values={"c": (C_LIGHT, "m/s"), "f": (f_ghz * 1e9, "Hz")},
            result=lam_r,
            result_unit="m",
        ),
        worked_calc(
            label="Ruze gain-loss factor",
            formula="eta_ruze = exp(-(4 x pi x eps_rms / lambda)^2)",
            values={"pi": (math.pi, ""), "eps_rms": (eps_rms, "m"), "lambda": (lam_r, "m")},
            result=eta_ruze_r,
            result_unit="",
            assumptions=["random correlated surface errors (Ruze 1966); phase-front degradation"],
        ),
        worked_calc(
            label="Ruze loss",
            formula="L_ruze_dB = -10 x log10(eta_ruze)",
            values={"eta_ruze": (eta_ruze_r, "")},
            result=loss_r,
            result_unit="dB",
            assumptions=["design rule: eps_rms < lambda/20 keeps L_ruze < ~1 dB"],
        ),
        worked_calc(
            label="Ideal aperture gain",
            formula="G0_dBi = 10 x log10(eta_ap x (pi x D / lambda)^2)",
            values={"eta_ap": (eta_ap, ""), "pi": (math.pi, ""), "D": (D, "m"), "lambda": (lam_r, "m")},
            result=g0_r,
            result_unit="dBi",
            assumptions=["circular aperture; eta_ap folds illumination + spillover + blockage"],
        ),
        worked_calc(
            label="Effective (realised) gain",
            formula="G = G0_dBi - L_ruze_dB",
            values={"G0_dBi": (g0_r, "dBi"), "L_ruze_dB": (loss_r, "dB")},
            result=eff_r,
            result_unit="dBi",
        ),
    ]

    return {
        "aperture_diameter_m": D,
        "frequency_ghz": f_ghz,
        "wavelength_m": lam_r,
        "aperture_efficiency": eta_ap,
        "surface_rms_m": eps_rms,
        "surface_rms_mm": eps_mm,
        "lambda_over_20_m": round(lam_over_20, 6),
        "meets_lambda_over_20_rule": meets_rule,
        "ruze_efficiency": eta_ruze_r,
        "ruze_loss_db": loss_r,
        "ideal_gain_dbi": g0_r,
        "effective_gain_dbi": eff_r,
        "hpbw_deg": round(hpbw_deg, 4),
        "worked": worked,
        "data_sources": [
            "Ruze (1966), 'Antenna tolerance theory — a review', Proc. IEEE 54(4)",
            "Balanis (2016), 'Antenna Theory: Analysis and Design', 4th ed.",
            "Baars (2007), 'The Paraboloidal Reflector Antenna in Radio Astronomy', Springer",
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

    # ---- Self-test: 3 m dish, 12 GHz (Ku), 0.5 mm RMS, eta_ap 0.65 ----
    # lambda = 0.025 m. lambda/20 = 1.25 mm; 0.5 mm < 1.25 mm -> meets rule.
    # 4 pi eps/lam = 4*pi*5e-4/0.025 = 0.251; eta = exp(-0.063) = 0.939;
    # L_ruze = 0.27 dB. G0 = 0.65*(pi*3/0.025)^2 -> ~49 dBi; net ~48.7 dBi.
    payload_default = {
        "aperture_diameter_m": 3.0,
        "frequency_ghz": 12.0,
        "surface_rms_m": 0.0005,
        "aperture_efficiency": 0.65,
    }
    result = compute(payload_default)

    _sink = _sys.stdout if _sys.stdin.isatty() else _sys.stderr
    json.dump(result, _sink, indent=2)
    print(file=_sink)

    errors = []
    loss = result["ruze_loss_db"]
    if not (0.0 <= loss <= 1.0):
        errors.append(f"FAIL: ruze_loss_db={loss} expected < ~1 dB for eps<lambda/20")
    else:
        print(f"PASS: ruze_loss_db = {loss} dB (< 1 dB for eps<lambda/20)", file=_sys.stderr)

    g = result["effective_gain_dbi"]
    if not (30.0 <= g <= 70.0):
        errors.append(f"FAIL: effective_gain_dbi={g} not in [30, 70] dBi for a 3 m Ku dish")
    else:
        print(f"PASS: effective_gain_dbi = {g} dBi", file=_sys.stderr)

    if not result["meets_lambda_over_20_rule"]:
        errors.append("FAIL: 0.5 mm RMS at 12 GHz should meet lambda/20 rule")
    else:
        print("PASS: meets lambda/20 rule", file=_sys.stderr)

    # Net gain must be below ideal by exactly the Ruze loss.
    expected_eff = result["ideal_gain_dbi"] - result["ruze_loss_db"]
    if abs(result["effective_gain_dbi"] - expected_eff) > 1e-3:
        errors.append(f"FAIL: effective_gain_dbi != ideal - loss ({result['effective_gain_dbi']} vs {expected_eff})")
    else:
        print("PASS: effective = ideal - Ruze loss", file=_sys.stderr)

    # Degrade the surface 10x -> loss must grow ~100x (quadratic in eps).
    bad = compute({**payload_default, "surface_rms_m": 0.005})
    if not (bad["ruze_loss_db"] > result["ruze_loss_db"] * 50.0):
        errors.append(f"FAIL: 10x RMS should grow loss ~100x ({result['ruze_loss_db']} -> {bad['ruze_loss_db']})")
    else:
        print(f"PASS: 10x RMS grows loss quadratically ({result['ruze_loss_db']} -> {bad['ruze_loss_db']} dB)", file=_sys.stderr)

    if errors:
        for e in errors:
            print(e, file=_sys.stderr)
        _sys.exit(1)
    print("ALL REFLECTOR-RMS SELF-TESTS PASSED", file=_sys.stderr)
    if not _sys.stdin.isatty():
        _sys.exit(main())
