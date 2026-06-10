#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/tdoa_fdoa_geolocation.py

TDOA/FDOA emitter geolocation accuracy (passive RF-SIGINT payload).

A passive geolocation payload (constellation or multi-receiver) locates a
ground RF emitter by measuring Time-Difference-Of-Arrival (TDOA) and
Frequency-Difference-Of-Arrival (FDOA) of the same signal at spatially
separated sensors. The achievable position accuracy is set by the timing
measurement error, the sensor-baseline geometry (GDOP — Geometric Dilution
of Precision), and, for FDOA, the relative-velocity / frequency error.

Governing physics (Cramér-Rao lower bound for TDOA/FDOA; Torrieri (1984),
"Statistical theory of passive location systems", IEEE T-AES; Stein (1981),
"Algorithms for ambiguity function processing", IEEE T-ASSP):

  A single TDOA defines a hyperbola; the time error maps to a range error:
      sigma_range = c * sigma_t
  The position error is that range error amplified by the geometry:
      sigma_pos(TDOA) ~= c * sigma_t * GDOP
  An FDOA measurement adds a (generally independent) cross-track constraint
  from the Doppler geometry:
      sigma_pos(FDOA) ~= (c / f) * sigma_f * v_rel^-1 * GDOP    [order-of-mag]
  combined (independent errors add in quadrature):
      sigma_pos = 1 / sqrt( 1/sigma_pos_tdoa^2 + 1/sigma_pos_fdoa^2 )
  Circular Error Probable (Rayleigh, isotropic):
      CEP ~= 1.1774 * sigma_pos

GDOP improves (decreases) with more sensors and good angular spread; a
useful first-order model is GDOP ~= GDOP_pair / sqrt(n_sensors - 1) for
n_sensors well-spread independent baselines, floored at a good-geometry
limit. The TDOA timing error relates to bandwidth + SNR via
sigma_t ~= 1 / (2*pi*B*sqrt(SNR)) when not supplied directly.

Input:
    {
      "timing_error_s": 3.0e-8,        # sigma_t [s]  (e.g. 30 ns)
      "n_sensors": 4,                  # number of receiving sensors
      "emitter_range_km": 800.0,       # slant range to emitter [km]
      "gdop_pair": 3.0,                # 2-sensor baseline GDOP (geometry)
      "freq_hz": 1.5e9,                # carrier [Hz] (for FDOA)
      "fdoa_error_hz": 1.0,            # sigma_f [Hz]
      "relative_velocity_ms": 7500.0,  # v_rel sensor<->emitter [m/s]
      "bandwidth_hz": null,            # optional: derive sigma_t from B+SNR
      "snr_db": null                   # optional
    }

Output (flat, declared output_keys):
    {
      "geolocation_accuracy_m": ...,   # sigma_pos combined [m]
      "gdop": ...,                     # effective GDOP
      "cep_m": ...,                    # circular error probable [m]
      ...
    }

References:
- Torrieri (1984), "Statistical theory of passive location systems", IEEE T-AES 20(2).
- Stein (1981), "Algorithms for ambiguity function processing", IEEE T-ASSP 29(3).
- Ho & Chan (1993), "Solution and performance analysis of geolocation by TDOA", IEEE T-AES.
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
    "tool_name": 'tdoa_fdoa_geolocation (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Torrieri (1984), 'Statistical theory of passive location systems', IEEE T-AES; Stein (1981) FDOA",
    "physics_basis": 'CRLB: sigma_pos(TDOA) ~ c*sigma_t*GDOP; FDOA cross term ~ (c/f)*sigma_f/v_rel*GDOP; CEP = 1.1774*sigma_pos.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-06-10",
}

C_LIGHT = 299_792_458.0            # speed of light [m/s]
CEP_FACTOR = 1.1774               # Rayleigh CEP / sigma (50% radius)
GDOP_FLOOR = 1.0                  # ideal-geometry lower bound


def compute(payload: dict) -> dict:
    sigma_t = payload.get("timing_error_s", None)
    n_sensors = int(payload.get("n_sensors", 4))
    emitter_range_km = float(payload.get("emitter_range_km", 800.0))
    gdop_pair = float(payload.get("gdop_pair", 3.0))
    freq_hz = float(payload.get("freq_hz", 1.5e9))
    fdoa_error_hz = float(payload.get("fdoa_error_hz", 1.0))
    v_rel = float(payload.get("relative_velocity_ms", 7500.0))
    bandwidth_hz = payload.get("bandwidth_hz", None)
    snr_db = payload.get("snr_db", None)

    if n_sensors < 2:
        raise ValueError("n_sensors must be >= 2 for TDOA geolocation")

    # Derive timing error from bandwidth + SNR if not supplied directly.
    sigma_t_derived = None
    if sigma_t is None:
        if bandwidth_hz is None or snr_db is None:
            raise ValueError("provide timing_error_s OR (bandwidth_hz AND snr_db)")
        b = float(bandwidth_hz)
        snr_lin = 10.0 ** (float(snr_db) / 10.0)
        sigma_t = 1.0 / (2.0 * math.pi * b * math.sqrt(snr_lin))
        sigma_t_derived = sigma_t
    else:
        sigma_t = float(sigma_t)
    if sigma_t <= 0:
        raise ValueError("timing_error_s must be positive")

    # Effective GDOP improves with more well-spread baselines.
    gdop = max(GDOP_FLOOR, gdop_pair / math.sqrt(max(1, n_sensors - 1)))

    # TDOA position accuracy.
    sigma_range_m = C_LIGHT * sigma_t
    sigma_pos_tdoa = sigma_range_m * gdop

    # FDOA position accuracy (order-of-magnitude cross-track term).
    if freq_hz > 0 and v_rel > 0 and fdoa_error_hz > 0:
        cross_range_m = (C_LIGHT / freq_hz) * fdoa_error_hz / (2.0 * math.pi) * (emitter_range_km * 1000.0) / v_rel
        sigma_pos_fdoa = cross_range_m * gdop
    else:
        sigma_pos_fdoa = float("inf")

    # Combine independent errors in quadrature (information adds).
    inv = 1.0 / (sigma_pos_tdoa ** 2)
    if math.isfinite(sigma_pos_fdoa) and sigma_pos_fdoa > 0:
        inv += 1.0 / (sigma_pos_fdoa ** 2)
    sigma_pos = 1.0 / math.sqrt(inv)

    cep_m = CEP_FACTOR * sigma_pos

    gdop_r = round(gdop, 4)
    sigma_range_r = round(sigma_range_m, 3)
    tdoa_r = round(sigma_pos_tdoa, 3)
    fdoa_r = round(sigma_pos_fdoa, 3) if math.isfinite(sigma_pos_fdoa) else None
    pos_r = round(sigma_pos, 3)
    cep_r = round(cep_m, 3)

    worked = [
        worked_calc(
            label="Effective GDOP (multi-sensor)",
            formula="gdop = gdop_pair / sqrt(n_sensors - 1)",
            values={"gdop_pair": (gdop_pair, ""), "n_sensors": (n_sensors, "")},
            result=gdop_r,
            result_unit="",
            assumptions=["well-spread independent baselines; floored at ideal-geometry GDOP = 1.0"],
        ),
        worked_calc(
            label="TDOA range error",
            formula="sigma_range = c x sigma_t",
            values={"c": (C_LIGHT, "m/s"), "sigma_t": (sigma_t, "s")},
            result=sigma_range_r,
            result_unit="m",
            assumptions=["a TDOA defines a hyperbola; timing error maps to range error (Torrieri 1984)"],
        ),
        worked_calc(
            label="TDOA position accuracy (CRLB)",
            formula="sigma_pos_tdoa = sigma_range x gdop",
            values={"sigma_range": (sigma_range_r, "m"), "gdop": (gdop_r, "")},
            result=tdoa_r,
            result_unit="m",
            assumptions=["range error amplified by sensor-baseline geometry (GDOP)"],
        ),
        worked_calc(
            label="Combined TDOA+FDOA position accuracy",
            formula="sigma_pos = 1 / sqrt(1/sigma_tdoa^2 + 1/sigma_fdoa^2)",
            values={"sigma_tdoa": (tdoa_r, "m"), "sigma_fdoa": ((fdoa_r if fdoa_r is not None else 0.0), "m")},
            result=pos_r,
            result_unit="m",
            assumptions=["independent TDOA + FDOA errors add in quadrature (information sum)"],
        ),
        worked_calc(
            label="Circular Error Probable",
            formula="CEP = 1.1774 x sigma_pos",
            values={"sigma_pos": (pos_r, "m")},
            result=cep_r,
            result_unit="m",
            assumptions=["Rayleigh/isotropic 50% radius (CEP factor 1.1774)"],
        ),
    ]

    out = {
        "timing_error_s": sigma_t,
        "n_sensors": n_sensors,
        "emitter_range_km": emitter_range_km,
        "gdop_pair": gdop_pair,
        "freq_hz": freq_hz,
        "fdoa_error_hz": fdoa_error_hz,
        "relative_velocity_ms": v_rel,
        "gdop": gdop_r,
        "tdoa_range_error_m": sigma_range_r,
        "geolocation_accuracy_tdoa_m": tdoa_r,
        "geolocation_accuracy_fdoa_m": fdoa_r,
        "geolocation_accuracy_m": pos_r,
        "cep_m": cep_r,
        "worked": worked,
        "data_sources": [
            "Torrieri (1984), 'Statistical theory of passive location systems', IEEE T-AES 20(2)",
            "Stein (1981), 'Algorithms for ambiguity function processing', IEEE T-ASSP 29(3)",
            "Ho & Chan (1993), 'Solution and performance analysis of geolocation by TDOA', IEEE T-AES",
        ],
    }
    if sigma_t_derived is not None:
        out["timing_error_derived_from_bw_snr"] = True
    return out


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

    # ---- Self-test: 30 ns timing, 4 sensors, 1.5 GHz, 800 km range ----
    # sigma_range = 3e8 * 3e-8 = 9 m. gdop = 3/sqrt(3) = 1.732.
    # sigma_pos_tdoa = 9 * 1.732 ~ 15.6 m. FDOA tightens it somewhat.
    # Expected combined geolocation accuracy ~ a few-to-tens of metres,
    # CEP a similar order — realistic for a multi-sat TDOA/FDOA fix.
    payload_default = {
        "timing_error_s": 3.0e-8,
        "n_sensors": 4,
        "emitter_range_km": 800.0,
        "gdop_pair": 3.0,
        "freq_hz": 1.5e9,
        "fdoa_error_hz": 1.0,
        "relative_velocity_ms": 7500.0,
    }
    result = compute(payload_default)

    _sink = _sys.stdout if _sys.stdin.isatty() else _sys.stderr
    json.dump(result, _sink, indent=2)
    print(file=_sink)

    errors = []
    acc = result["geolocation_accuracy_m"]
    if not (1.0 <= acc <= 5000.0):
        errors.append(f"FAIL: geolocation_accuracy_m={acc} not in plausible [1, 5000] m")
    else:
        print(f"PASS: geolocation_accuracy_m = {acc:.2f} m", file=_sys.stderr)

    cep = result["cep_m"]
    if not (cep >= acc * 1.0):   # CEP = 1.1774*sigma >= sigma
        errors.append(f"FAIL: cep_m={cep} should be >= sigma_pos={acc}")
    else:
        print(f"PASS: cep_m = {cep:.2f} m (>= sigma_pos)", file=_sys.stderr)

    gdop = result["gdop"]
    if not (1.0 <= gdop <= 50.0):
        errors.append(f"FAIL: gdop={gdop} out of [1, 50]")
    else:
        print(f"PASS: gdop = {gdop}", file=_sys.stderr)

    # TDOA range error must equal c*sigma_t.
    sr_expected = C_LIGHT * payload_default["timing_error_s"]
    if abs(result["tdoa_range_error_m"] - sr_expected) > 1e-3:
        errors.append(f"FAIL: tdoa_range_error_m={result['tdoa_range_error_m']} != c*sigma_t={sr_expected}")
    else:
        print(f"PASS: tdoa_range_error_m = {result['tdoa_range_error_m']} m (= c*sigma_t)", file=_sys.stderr)

    # Combined accuracy must be <= TDOA-only (adding FDOA can only help).
    if result["geolocation_accuracy_m"] > result["geolocation_accuracy_tdoa_m"] + 1e-6:
        errors.append("FAIL: combined accuracy worse than TDOA-only")
    else:
        print("PASS: combined <= TDOA-only (FDOA info helps)", file=_sys.stderr)

    if errors:
        for e in errors:
            print(e, file=_sys.stderr)
        _sys.exit(1)
    print("ALL TDOA/FDOA SELF-TESTS PASSED", file=_sys.stderr)
    if not _sys.stdin.isatty():
        _sys.exit(main())
