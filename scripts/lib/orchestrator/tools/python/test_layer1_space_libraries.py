#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/test_layer1_space_libraries.py

Smoke tests for the 10 Layer-1 peer-reviewed library wrappers added
2026-05-22 for the ForgeOS space-sector toolkit:

  1. rocketcea_combustion             — NASA CEA (rocketcea, Apache-2.0)
  2. qutip_qubit_dynamics             — QuTiP (BSD-3)
  3. qutip_cold_atom_interferometer   — QuTiP + atom interferometry
  4. pyrcs_radar_cross_section        — Knott RCS textbook (PyPI pyrcs misnamed)
  5. mintpy_insar_processing          — MintPy decorrelation (Caltech BSD)
  6. pyne_rtg_radioisotope            — NIST nuclear data (PyPI pyne misnamed)
  7. opencv_machine_vision_inspection — OpenCV 4.13 (Apache-2.0)
  8. pybullet_robotic_arm_capture     — Yoshida space-robotics textbook (pybullet Py3.14 fail)
  9. spectral_hyperspectral_imager    — Spectral Python (MIT)
 10. hapsira_orbit_chaser_target      — astropy + Vallado Lambert (hapsira Py3.14 fail)

Each test runs the wrapper with a known-good input and asserts the
output sits in a published / textbook-supported range.

Usage:
    .venv/bin/python3 scripts/lib/orchestrator/tools/python/test_layer1_space_libraries.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import traceback
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent
PYTHON = str(HERE.parents[4] / ".venv" / "bin" / "python3")

RESULTS: list[dict[str, Any]] = []


def case(name: str, expected: str, kind: str = "library"):
    def wrap(fn):
        def runner():
            t0 = time.time()
            entry: dict[str, Any] = {"tool": name, "expected": expected, "kind": kind}
            try:
                value = fn()
                entry["status"] = "PASS"
                entry["value"] = value
            except AssertionError as exc:
                entry["status"] = "FAIL"
                entry["error_type"] = "AssertionError"
                entry["error_msg"] = str(exc)[:300]
                entry["trace"] = traceback.format_exc().splitlines()[-1]
            except Exception as exc:
                entry["status"] = "ERROR"
                entry["error_type"] = type(exc).__name__
                entry["error_msg"] = str(exc)[:300]
                entry["trace"] = traceback.format_exc().splitlines()[-1]
            entry["wall_time_s"] = round(time.time() - t0, 3)
            RESULTS.append(entry)
        return runner
    return wrap


def run_wrapper(script_name: str, payload: dict) -> dict:
    path = HERE / script_name
    proc = subprocess.run(
        [PYTHON, str(path)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"{script_name} exit {proc.returncode}: stderr={proc.stderr[:300]} stdout={proc.stdout[:200]}"
        )
    # Strip leading "USER_HOME_DIR=..." lines from RocketCEA
    raw = proc.stdout
    # Find first {
    idx = raw.find('{')
    if idx > 0:
        raw = raw[idx:]
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{script_name} returned non-JSON: {proc.stdout[:200]} (err={exc})")


# ============================================================================
# 1. RocketCEA — LOX/CH4 vacuum Isp must match published Raptor-like data
# ============================================================================

@case("rocketcea_combustion",
      "LOX/CH4 Pc=300 bar OF=3.5 eps=40 -> vacuum Isp 365-380s, Tc 3500-3850 K",
      kind="library")
def t_rocketcea():
    r = run_wrapper("rocketcea_combustion.py", {
        "oxidiser": "LOX",
        "fuel": "CH4",
        "of_ratio": 3.5,
        "chamber_pressure_bar": 300.0,
        "expansion_ratio": 40.0,
    })
    isp = r["vacuum_isp_s"]
    tc = r["chamber_temp_k"]
    cstar = r["c_star_m_s"]
    assert 365 < isp < 380, f"vacuum Isp out of range: {isp} s"
    assert 3500 < tc < 3850, f"Tc out of range: {tc} K"
    assert 1700 < cstar < 1950, f"c* out of range: {cstar} m/s"
    assert r["_provenance"]["confidence_class"] == "library"
    return f"Isp_vac={isp} s, Tc={tc} K, c*={cstar} m/s"


# ============================================================================
# 2. QuTiP qubit dynamics — transmon fidelity must exceed 99.9%
# ============================================================================

@case("qutip_qubit_dynamics",
      "Transmon T1=80us T2=70us gate=20ns -> fidelity > 99.9%",
      kind="library")
def t_qutip_qubit():
    r = run_wrapper("qutip_qubit_dynamics.py", {
        "qubit_type": "transmon",
        "T1_us": 80.0,
        "T2_us": 70.0,
        "gate_duration_ns": 20.0,
        "target_gate": "x_pi_2",
    })
    fid = r["gate_fidelity_pct"]
    err = r["single_qubit_error_rate"]
    assert fid > 99.9, f"fidelity below 99.9%: {fid}%"
    assert err < 1e-3, f"error rate too high: {err}"
    assert r["_provenance"]["confidence_class"] == "library"
    return f"fid={fid}%, err={err}"


# ============================================================================
# 3. QuTiP cold atom interferometer — Rb87 sensitivity ~1e-8 g/sqrt(Hz)
# ============================================================================

@case("qutip_cold_atom_interferometer",
      "Rb87 T=100ms N=1e6 C=0.5 -> sensitivity 1e-10 to 1e-7 g/sqrt(Hz)",
      kind="library")
def t_qutip_atom():
    r = run_wrapper("qutip_cold_atom_interferometer.py", {
        "atom_species": "Rb87",
        "interrogation_time_ms": 100.0,
        "atom_number": 1.0e6,
        "fringe_contrast": 0.5,
    })
    sens = r["sensitivity_g_per_sqrthz"]
    k_eff = r["k_eff_per_m"]
    assert 1e-11 < sens < 1e-7, f"sensitivity out of range: {sens} g/sqrt(Hz)"
    assert 1.5e7 < k_eff < 1.7e7, f"k_eff wrong for Rb87 D2: {k_eff} /m"
    assert r["_provenance"]["confidence_class"] == "library"
    return f"sens={sens} g/sqrt(Hz), k_eff={k_eff} /m"


# ============================================================================
# 4. Radar cross section — 1m aluminium sphere @ 10 GHz -> -1.05 dBsm
# ============================================================================

@case("pyrcs_radar_cross_section",
      "1m aluminium sphere @ 10 GHz -> RCS = pi*r^2 = 0.785 m^2 (-1.05 dBsm)",
      kind="textbook")
def t_pyrcs():
    r = run_wrapper("pyrcs_radar_cross_section.py", {
        "object_geometry": "sphere",
        "characteristic_size_m": 1.0,
        "frequency_ghz": 10.0,
        "polarisation": "VV",
        "material": "aluminium",
    })
    rcs = r["rcs_m2"]
    dbsm = r["rcs_dbsm"]
    ka = r["ka_parameter"]
    assert 0.75 < rcs < 0.82, f"sphere RCS off: {rcs} m^2"
    assert -1.5 < dbsm < -0.5, f"sphere dBsm off: {dbsm}"
    assert ka > 10, f"sphere should be in optical regime: ka={ka}"
    # PyPI pyrcs is wrong package — confidence class is textbook
    assert r["_provenance"]["confidence_class"] == "textbook"
    return f"RCS={rcs} m^2, {dbsm} dBsm (ka={ka})"


# ============================================================================
# 5. MintPy InSAR — urban C-band 30-scene stack -> coh>0.7, mm precision
# ============================================================================

@case("mintpy_insar_processing",
      "30 SAR scenes Sentinel-1 C-band urban 30-day -> coherence>0.7 mm precision",
      kind="library")
def t_mintpy():
    r = run_wrapper("mintpy_insar_processing.py", {
        "temporal_baseline_days": 30,
        "perpendicular_baseline_m": 100,
        "ground_type": "urban",
        "stack_count": 30,
        "wavelength_band": "C",
        "looks_L": 32,
    })
    coh = r["total_coherence"]
    los_mm = r["los_precision_mm_per_acq"]
    assert coh > 0.7, f"coherence too low: {coh}"
    assert los_mm < 5.0, f"LOS precision worse than 5mm: {los_mm} mm"
    assert r["mm_precision_achievable"] is True
    assert r["_provenance"]["confidence_class"] == "library"
    return f"coh={coh}, LOS_precision={los_mm} mm/acq"


# ============================================================================
# 6. RTG (pyne textbook) — Pu-238 1 kg -> 540 W thermal initial
# ============================================================================

@case("pyne_rtg_radioisotope",
      "Pu-238 1kg PuO2 -> 540 W thermal initial (NASA MMRTG datum)",
      kind="textbook")
def t_pyne_rtg():
    r = run_wrapper("pyne_rtg_radioisotope.py", {
        "isotope": "Pu-238",
        "fuel_mass_g": 1000.0,
        "mission_duration_years": 14.0,
    })
    p_init = r["thermal_power_w_initial"]
    p_eol = r["thermal_power_w_eol"]
    half_life = r["half_life_years"]
    assert 500 < p_init < 580, f"Pu-238 thermal power off: {p_init} W"
    assert 0.85 * p_init < p_eol < p_init, f"EOL power wrong: {p_eol} W vs {p_init} W"
    assert 87 < half_life < 88, f"Pu-238 half life wrong: {half_life} yr"
    # PyPI pyne misnamed — textbook confidence
    assert r["_provenance"]["confidence_class"] == "textbook"
    return f"P_init={p_init} W, P_eol={p_eol} W, t_1/2={half_life} yr"


# ============================================================================
# 7. OpenCV machine vision — 10mm defect @ 5m daylight -> P_det > 0.9
# ============================================================================

@case("opencv_machine_vision_inspection",
      "10mm defect at 5m, 1000 W/m^2, Canny -> P_det > 0.9 with high SNR",
      kind="library")
def t_opencv():
    r = run_wrapper("opencv_machine_vision_inspection.py", {
        "image_size_mp": 12.0,
        "target_distance_m": 5.0,
        "illumination_w_m2": 1000.0,
        "defect_size_mm": 10.0,
        "algorithm": "canny",
    })
    pd = r["detection_probability"]
    snr = r["snr_per_pixel"]
    assert pd > 0.9, f"detection probability too low: {pd}"
    assert snr > 50, f"per-pixel SNR too low: {snr}"
    assert r["_provenance"]["confidence_class"] == "library"
    return f"P_det={pd}, SNR={snr}, pixels={r['defect_pixel_size_px']}"


# ============================================================================
# 8. PyBullet robotic capture (textbook) — 3m arm 100kg payload 0.1 rad/s
# ============================================================================

@case("pybullet_robotic_arm_capture",
      "3m arm, 100kg payload, 0.1 rad/s tumble -> capture window 10-30s",
      kind="textbook")
def t_pybullet():
    r = run_wrapper("pybullet_robotic_arm_capture.py", {
        "arm_reach_m": 3.0,
        "arm_dof": 7,
        "payload_mass_kg": 100.0,
        "target_tumbling_rad_s": 0.1,
        "joint_max_torque_nm": 50.0,
    })
    win = r["capture_window_seconds"]
    tau = r["max_motor_torque_required_nm"]
    assert 10 < win < 30, f"capture window out of range: {win} s"
    assert tau < 50, f"torque exceeds joint limit: {tau} Nm"
    assert r["torque_feasible"] is True
    # pybullet does not build on Py3.14 — textbook confidence
    assert r["_provenance"]["confidence_class"] == "textbook"
    return f"window={win} s, torque={tau} Nm"


# ============================================================================
# 9. Spectral hyperspectral — VNIR 400-1000nm, 30 bands -> SNR > 50 at 700nm
# ============================================================================

@case("spectral_hyperspectral_imager",
      "VNIR 400-1000nm 30 bands 30ms int -> SNR > 50 at 700nm band",
      kind="library")
def t_spectral():
    r = run_wrapper("spectral_hyperspectral_imager.py", {
        "wavelength_start_nm": 400.0,
        "wavelength_end_nm": 1000.0,
        "num_bands": 30,
        "spectral_resolution_nm": 10.0,
        "sensor_NETD_or_NER": 1.0e-5,
        "integration_time_ms": 30.0,
    })
    snrs = r["snr_per_band"]
    # Find the band closest to 700nm
    closest_key = min(snrs.keys(), key=lambda k: abs(int(k.split('_')[0]) - 700))
    snr_700 = snrs[closest_key]
    assert snr_700 > 50, f"SNR at ~700nm too low: {snr_700} ({closest_key})"
    assert r["max_snr_value"] > snr_700  # max should be higher than 700nm
    assert r["_provenance"]["confidence_class"] == "library"
    return f"SNR at {closest_key} = {snr_700} (min={r['min_snr_value']}, max={r['max_snr_value']})"


# ============================================================================
# 10. hapsira/astropy chaser-target — 500 km -> 510 km, 2 hr -> ~5-10 m/s
# ============================================================================

@case("hapsira_orbit_chaser_target",
      "500 km circ -> 510 km circ, 2 hr transfer -> dv 4-15 m/s (Hohmann ~5.5 m/s)",
      kind="library")
def t_hapsira_chaser():
    r = run_wrapper("hapsira_orbit_chaser_target.py", {
        "chaser_orbit_elements": {"altitude_km": 500, "inclination_deg": 51.6, "eccentricity": 0.0},
        "target_orbit_elements": {"altitude_km": 510, "inclination_deg": 51.6, "eccentricity": 0.0},
        "transfer_time_hours": 2.0,
        "propulsion_type": "monoprop",
    })
    dv = r["delta_v_required_ms"]
    a_t = r["transfer_orbit_elements"]["semi_major_axis_km"]
    assert 4 < dv < 15, f"chaser dv out of range: {dv} m/s"
    assert 6870 < a_t < 6900, f"transfer SMA wrong: {a_t} km"
    assert r["_provenance"]["confidence_class"] == "library"
    return f"dV={dv} m/s, a_transfer={a_t} km"


# ============================================================================
# Runner
# ============================================================================

def main() -> int:
    tests = [
        t_rocketcea,
        t_qutip_qubit,
        t_qutip_atom,
        t_pyrcs,
        t_mintpy,
        t_pyne_rtg,
        t_opencv,
        t_pybullet,
        t_spectral,
        t_hapsira_chaser,
    ]
    t0 = time.time()
    for test in tests:
        test()

    print(f"\nLayer-1 Space Library Wrapper Smoke Tests — {len(tests)} cases")
    print("=" * 78)
    for entry in RESULTS:
        status = entry["status"]
        marker = "PASS" if status == "PASS" else "FAIL"
        kind = entry.get("kind", "?")
        line = f"[{marker}] {entry['tool']:<40} ({kind})  {entry['wall_time_s']}s"
        print(line)
        print(f"        expected: {entry['expected']}")
        if status == "PASS":
            print(f"        value:    {entry['value']}")
        else:
            print(f"        error:    {entry.get('error_type', '?')}: {entry.get('error_msg', '')[:150]}")
        print()

    n_pass = sum(1 for r in RESULTS if r["status"] == "PASS")
    n_total = len(RESULTS)
    print(f"Summary: {n_pass}/{n_total} PASS in {round(time.time() - t0, 2)}s")

    return 0 if n_pass == n_total else 1


if __name__ == "__main__":
    sys.exit(main())
