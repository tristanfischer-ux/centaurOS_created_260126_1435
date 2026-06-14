#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/launch_vibration.py

Launch random + sine vibration response — payload dynamic loading.

Input:
    {
      "launch_vehicle": "Falcon_9",       # see LV_PROFILES
      "payload_mass_kg": 100.0,
      "first_natural_frequency_hz": 80.0,
      "damping_ratio": 0.03,
      "axis": "lateral"                    # lateral | longitudinal
    }

Output:
    {
      "random_grms_input": ...,
      "random_grms_response": ...,
      "sine_peak_g_input": ...,
      "sine_peak_g_response": ...,
      "fatigue_cycles_lifetime": ...,
      "peak_load_factor": ...,
      ...
    }

Physics (Wijker, "Mechanical Vibrations in Spacecraft Design", Springer 2004):
  Single-DoF amplification at resonance: Q = 1/(2ζ)
  Random vibration grms response: g_rms_resp = sqrt(π/2 × Q × f_n × W(f_n))
    where W(f_n) is PSD at the natural frequency [g²/Hz]
  Miles' equation: g_response = sqrt(π/2 × f_n × Q × W(f_n))
  Sine peak: g_peak_resp = Q × g_peak_input

Launch vehicle profiles (from user's guides):
  Falcon 9 (USFL 2024):  random PSD plateau 0.04 g²/Hz, 80-500 Hz, lateral
                         sine 0.5 g 5-100 Hz lateral, 2 g longitudinal
  Falcon Heavy:          random 0.05 g²/Hz, similar bandwidth
  Ariane 6 (UM ver 1):   0.03 g²/Hz plateau, 30 g longitudinal QSL
  Vega-C (VEGA ver 9):   0.06 g²/Hz, higher sine 1.5 g lateral 1-60 Hz
  Long March 3B:         0.05 g²/Hz
  Soyuz (Arianespace):   0.025 g²/Hz, 30 g longitudinal
  Electron:              0.10 g²/Hz, smaller bandwidth
  Antares:               0.05 g²/Hz
  Atlas V:               0.03 g²/Hz, broader PSD

References:
- Wijker, J.J., "Mechanical Vibrations in Spacecraft Design", Springer 2004.
- Miles, J.W., "On Structural Fatigue Under Random Loading", JAS 1954.
- SpaceX Falcon 9 Payload User's Guide, Rev. June 2024.
- Arianespace Ariane 6 User's Manual, Issue 1 Rev. 0, 2021.
- Rocket Lab Electron Payload User's Guide, 7.0, 2023.
- NASA-GEVS GSFC-STD-7000 Rev B (test specifications).
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _fail_soft import safe_choice  # noqa: E402  (FAIL-SOFT: never crash on off-vocab categorical)
from _worked import worked_calc  # noqa: E402


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'launch_vibration (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Wijker (2004), 'Mechanical Vibrations in Spacecraft Design', Springer; Miles (1954), 'On Structural Fatigue Under Random Loading', J. Aerosp. Sci.; SpaceX F9 Payload User's Guide (2024); Arianespace A6 User Manual",
    "physics_basis": 'grms via mass-loading-corrected PSD per LV envelope. Sine response Q × g_input at resonance. Miles equation for random response.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# (psd_lateral_g2_hz, sine_peak_lateral_g, sine_peak_long_g)
# PSD is the plateau between 80 and 500 Hz in g²/Hz (typical generic vehicle envelope).
LV_PROFILES = {
    "Falcon_9":      {"psd_lateral_g2_hz": 0.04, "sine_lat_g": 0.5, "sine_long_g": 2.0, "qsl_long_g": 8.5},
    "Falcon_Heavy":  {"psd_lateral_g2_hz": 0.05, "sine_lat_g": 0.5, "sine_long_g": 3.0, "qsl_long_g": 9.0},
    "Ariane_6":      {"psd_lateral_g2_hz": 0.03, "sine_lat_g": 1.0, "sine_long_g": 4.5, "qsl_long_g": 30.0},
    "Vega_C":        {"psd_lateral_g2_hz": 0.06, "sine_lat_g": 1.5, "sine_long_g": 4.0, "qsl_long_g": 7.5},
    "Long_March_3B": {"psd_lateral_g2_hz": 0.05, "sine_lat_g": 1.0, "sine_long_g": 3.5, "qsl_long_g": 6.0},
    "Soyuz":         {"psd_lateral_g2_hz": 0.025,"sine_lat_g": 0.8, "sine_long_g": 4.0, "qsl_long_g": 30.0},
    "Electron":      {"psd_lateral_g2_hz": 0.10, "sine_lat_g": 1.2, "sine_long_g": 5.5, "qsl_long_g": 9.0},
    "Antares":       {"psd_lateral_g2_hz": 0.05, "sine_lat_g": 1.0, "sine_long_g": 4.5, "qsl_long_g": 6.5},
    "Atlas_V":       {"psd_lateral_g2_hz": 0.03, "sine_lat_g": 0.8, "sine_long_g": 3.0, "qsl_long_g": 7.0},
}

# Vibration test duration (s) — random qual: 60s typical per axis
RANDOM_TEST_DURATION_S = 60.0


def compute(payload: dict) -> dict:
    lv = safe_choice(str(payload.get("launch_vehicle", "Falcon_9")), LV_PROFILES, default="Falcon_9", label="launch_vehicle")
    mass_kg = float(payload.get("payload_mass_kg", 100.0))
    fn_hz = float(payload.get("first_natural_frequency_hz", 80.0))
    damping = float(payload.get("damping_ratio", 0.03))
    axis = safe_choice(str(payload.get("axis", "lateral")), ("lateral", "axial", "thrust"), default="lateral", label="axis")

    if lv not in LV_PROFILES:
        raise ValueError(f"unknown launch_vehicle {lv!r}; known: {list(LV_PROFILES)}")
    if axis not in ("lateral", "longitudinal"):
        raise ValueError("axis must be 'lateral' or 'longitudinal'")
    if damping <= 0 or damping >= 1:
        raise ValueError("damping_ratio must be 0 < ζ < 1")

    p = LV_PROFILES[lv]

    # Mass-derate PSD for large payloads (NASA practice: -1 dB per decade above 50 kg)
    if mass_kg > 50:
        derate_db = 1.0 * math.log10(mass_kg / 50.0)
        derate_factor = 10.0 ** (-derate_db / 10.0)
    else:
        derate_factor = 1.0

    # Random PSD input at f_n (use plateau value, derated)
    psd_at_fn = p["psd_lateral_g2_hz"] * derate_factor

    # grms input — integrate PSD over the plateau (80-500 Hz typical, 420 Hz BW)
    plateau_bw_hz = 420.0
    grms_input = math.sqrt(psd_at_fn * plateau_bw_hz)

    # Amplification: Q = 1/(2ζ)
    q = 1.0 / (2.0 * damping)

    # Miles equation grms response at fn:
    # g_rms_resp = sqrt(π/2 × f_n × Q × W(f_n))
    grms_resp = math.sqrt((math.pi / 2.0) * fn_hz * q * psd_at_fn)

    # Sine
    if axis == "lateral":
        sine_input_g = p["sine_lat_g"]
    else:
        sine_input_g = p["sine_long_g"]
    sine_resp_g = q * sine_input_g

    # Fatigue cycles: at fn for 60 s qualification test
    fatigue_cycles = fn_hz * RANDOM_TEST_DURATION_S
    # Plus typical launch duration ~ 500 s
    fatigue_cycles_launch = fn_hz * 500.0
    fatigue_cycles_lifetime = fatigue_cycles + fatigue_cycles_launch

    # Peak load factor — combination of QSL longitudinal + sine_resp + 3-sigma random
    qsl_long = p["qsl_long_g"]
    if axis == "longitudinal":
        peak_load = qsl_long + sine_resp_g + 3.0 * grms_resp
    else:
        peak_load = sine_resp_g + 3.0 * grms_resp

    # Rounded display values that chain through the worked calculations.
    q_r = round(q, 3)
    sine_resp_r = round(sine_resp_g, 3)
    grms_resp_r = round(grms_resp, 3)
    fatigue_qual_r = round(fatigue_cycles, 0)
    fatigue_launch_r = round(fatigue_cycles_launch, 0)

    # Worked calculations (hand-checkable, closed-form steps only).
    # derate_factor, grms_input, grms_resp use log10/sqrt — SKIP those.
    worked = [
        worked_calc(
            label="Amplification factor Q",
            formula="Q = 1 / (2 x damping)",
            values={"damping": (damping, "")},
            result=q_r, result_unit="",
            assumptions=["single-DoF resonance amplification (Wijker 2004 §4)"],
        ),
        worked_calc(
            label="Sine peak response acceleration",
            formula="sine_resp = Q x sine_input",
            values={"Q": (q_r, ""), "sine_input": (sine_input_g, "g")},
            result=sine_resp_r, result_unit="g",
            assumptions=["sine sweep through resonance; worst-case alignment"],
        ),
        worked_calc(
            label="Fatigue cycles — qualification test",
            formula="N_qual = f_n x t_test",
            values={"f_n": (fn_hz, "Hz"), "t_test": (RANDOM_TEST_DURATION_S, "s")},
            result=fatigue_qual_r, result_unit="cycles",
            assumptions=["60 s random vibration qualification test per axis (NASA-GEVS)"],
        ),
        worked_calc(
            label="Fatigue cycles — launch phase",
            formula="N_launch = f_n x t_launch",
            values={"f_n": (fn_hz, "Hz"), "t_launch": (500.0, "s")},
            result=fatigue_launch_r, result_unit="cycles",
            assumptions=["typical 500 s powered ascent"],
        ),
        worked_calc(
            label="Fatigue cycles — lifetime (qualification + launch)",
            formula="N_total = N_qual + N_launch",
            values={"N_qual": (fatigue_qual_r, "cycles"), "N_launch": (fatigue_launch_r, "cycles")},
            result=round(fatigue_cycles_lifetime, 0), result_unit="cycles",
            assumptions=["sum of qualification and launch fatigue"],
        ),
        # Branch-mirror: longitudinal axis adds QSL quasi-static term (CRITIC-high 2026-06-02)
        *(
            [worked_calc(
                label="Peak combined load factor (longitudinal axis)",
                formula="peak_load = qsl_long + sine_resp + 3 x grms_resp",
                values={
                    "qsl_long": (qsl_long, "g"),
                    "sine_resp": (sine_resp_r, "g"),
                    "grms_resp": (grms_resp_r, "g"),
                },
                result=round(peak_load, 3), result_unit="g",
                assumptions=[
                    "3-sigma random response + sine peak + quasi-static longitudinal (conservative combination)",
                    "longitudinal axis: QSL term added (Wijker 2004 §6)",
                ],
            )]
            if axis == "longitudinal"
            else
            [worked_calc(
                label="Peak combined load factor (lateral axis)",
                formula="peak_load = sine_resp + 3 x grms_resp",
                values={"sine_resp": (sine_resp_r, "g"), "grms_resp": (grms_resp_r, "g")},
                result=round(peak_load, 3), result_unit="g",
                assumptions=[
                    "3-sigma random response added linearly to sine peak (conservative combination)",
                    "lateral axis: QSL longitudinal not included",
                ],
            )]
        ),
    ]

    return {
        "launch_vehicle": lv,
        "payload_mass_kg": mass_kg,
        "first_natural_frequency_hz": fn_hz,
        "damping_ratio": damping,
        "axis": axis,
        "amplification_factor_Q": q_r,
        "mass_derate_factor": round(derate_factor, 4),
        "psd_input_g2_hz": round(psd_at_fn, 5),
        "random_grms_input": round(grms_input, 3),
        "random_grms_response": grms_resp_r,
        "sine_peak_g_input": sine_input_g,
        "sine_peak_g_response": sine_resp_r,
        "fatigue_cycles_qualification": fatigue_qual_r,
        "fatigue_cycles_launch": fatigue_launch_r,
        "fatigue_cycles_lifetime": round(fatigue_cycles_lifetime, 0),
        "quasi_static_long_g": qsl_long,
        "peak_load_factor": round(peak_load, 3),
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
