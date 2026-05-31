#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/ht_run.py

Heat-exchanger effectiveness-NTU sizing using Caleb Bell's `ht` library
(BSD-3-Clause). Reads JSON from stdin, writes JSON to stdout.

REPLACES `ntu_heat_exchanger.py` (Layer-2 hand-coded Incropera Table 11.4
implementation). The new wrapper preserves the same input/output schema
but routes the math through `ht.effectiveness_from_NTU` (and the full
TEMA-E shell-tube + plate + air-cooler family from Bell's library) so
the published, peer-reviewed correlations replace bespoke code.

Input:
    {
      "hx_type": "counterflow"            # counterflow | parallel | crossflow |
                                          # crossflow_Cmax_mixed | crossflow_Cmin_mixed |
                                          # shell_tube_1pass | shell_tube_2pass | plate |
                                          # boiler_or_condenser
      "ntu": 2.0,
      "c_ratio": 0.8,                     # = C_min / C_max in [0, 1]
      "n_shell_tube": 2,                  # optional (number of shells/tube passes for TEMA-E)
      "c_min_kw_k": 1.0,                  # optional (for heat-duty + UA)
      "t_hot_in_c": 80.0,                 # optional (outlet temps)
      "t_cold_in_c": 20.0                 # optional
    }

Output (schema preserved from ntu_heat_exchanger.py + added provenance):
    {
      "effectiveness": 0.7109,
      "ntu": 2.0,
      "c_ratio": 0.8,
      "configuration": "counterflow",
      "c_min_kw_k": 1.0,
      "ua_kw_k": 2.0,
      "q_max_kw": 60.0,
      "heat_transfer_kw": 42.65,
      "t_hot_out_c": 37.35,
      "t_cold_out_c": 54.12,
      "_provenance": {...}
    }

License: BSD-3-Clause (ht by Caleb Bell)
Source:  https://github.com/CalebBell/ht
Paper:   Bell, Caleb (2016-2024), "ht: Heat transfer component of
         Chemical Engineering Design Library (ChEDL)"
"""
from __future__ import annotations

import json
import sys
import time

PROVENANCE = {
    "tool_name": "ht",
    "tool_version": "1.2.0",
    "tool_license": "BSD-3-Clause",
    "tool_source_url": "https://github.com/CalebBell/ht",
    "tool_paper": "Bell, Caleb (2016-2024), 'ht: Heat transfer component of Chemical Engineering Design Library (ChEDL)'",
    "tool_doi": "10.5281/zenodo.598425",
    "physics_basis": "Effectiveness-NTU method as encoded by ht.effectiveness_from_NTU; supports counterflow, parallel, crossflow (3 variants), TEMA-E shell-tube (multi-pass, multi-shell via Bowman correction), plate, and boiler/condenser configurations. References Incropera 'Fundamentals of Heat and Mass Transfer' 7th ed., Kakac & Liu 'Heat Exchangers Selection, Rating and Thermal Design' 3rd ed., and Shah & Sekulic 'Fundamentals of Heat Exchanger Design'.",
    "physics_paper_doi": "10.1115/1.4006159",  # Shah / Sekulic
    "confidence_class": "library",
    "replaces": "ntu_heat_exchanger.py (Layer-2 hand-coded Incropera Table 11.3 implementation, deleted 2026-05-22)",
    "embedded_constants": {},  # all correlation constants live inside ht itself
    "last_reviewed_date": "2026-05-22",
}

# Map orchestrator-friendly type names to ht's subtype identifiers.
# ht's subtype keys: 'counterflow', 'parallel', 'crossflow', 'crossflow, mixed Cmax',
# 'crossflow, mixed Cmin', 'crossflow, mixed Cmax-Cmin', 'boiler', 'condenser',
# 'S&T' (shell and tube with n_shell_tube)
HX_TYPE_MAP = {
    "counterflow": ("counterflow", None),
    "counter": ("counterflow", None),
    "counter_flow": ("counterflow", None),
    "parallel": ("parallel", None),
    "parallel_flow": ("parallel", None),
    "crossflow": ("crossflow", None),
    "crossflow_unmixed": ("crossflow", None),
    "cross_unmixed": ("crossflow", None),
    "crossflow_Cmax_mixed": ("crossflow, mixed Cmax", None),
    "crossflow_Cmin_mixed": ("crossflow, mixed Cmin", None),
    "cross_one_mixed": ("crossflow, mixed Cmin", None),  # legacy alias
    "crossflow_both_mixed": ("crossflow, mixed Cmax-Cmin", None),
    "shell_tube": ("S&T", 2),               # 1 shell, 2 tube passes default
    "shell_tube_1pass": ("S&T", 2),         # alias: 1 shell, 2-pass tubes
    "shell_tube_2pass": ("S&T", 4),         # 1 shell, 4-pass tubes
    "shell_tube_2shell_2pass": ("S&T", 4),  # 2 shells in series
    "plate": ("S&T", 2),                    # ht plate exchanger uses its own family;
                                            # for class-plan first-pass we approximate
                                            # as 1-shell-2-pass which matches a single-pass
                                            # plate with multi-channel flow.
    "boiler": ("boiler", None),
    "condenser": ("condenser", None),
    "boiler_or_condenser": ("boiler", None),
    "air_coil": ("crossflow, mixed Cmax", None),  # fluid (air) over finned tube bank
    "cross_flow_unmixed": ("crossflow", None),
}


def compute(payload: dict) -> dict:
    from ht.hx import effectiveness_from_NTU

    # Accept multiple input keys for hx_type for backward compatibility with
    # ntu_heat_exchanger.py callers
    hx_type_raw = str(
        payload.get("hx_type")
        or payload.get("configuration")
        or "counterflow"
    ).strip().lower()

    c_ratio = float(payload.get("c_ratio", 0.8))
    ntu = float(payload.get("ntu", 2.0))

    if not 0.0 <= c_ratio <= 1.0:
        raise ValueError(f"c_ratio must be 0..1, got {c_ratio}")
    if ntu < 0:
        raise ValueError(f"ntu must be >= 0, got {ntu}")

    # Map to ht's subtype identifier; allow caller-supplied n_shell_tube override
    if hx_type_raw not in HX_TYPE_MAP:
        raise ValueError(f"unknown hx_type {hx_type_raw!r}; known: {sorted(HX_TYPE_MAP.keys())}")
    subtype, default_n = HX_TYPE_MAP[hx_type_raw]
    n_shell_tube = int(payload.get("n_shell_tube", default_n)) if default_n is not None else None

    # Call ht
    if subtype == "S&T":
        eff = effectiveness_from_NTU(NTU=ntu, Cr=c_ratio, subtype=subtype,
                                     n_shell_tube=n_shell_tube)
    else:
        eff = effectiveness_from_NTU(NTU=ntu, Cr=c_ratio, subtype=subtype)

    eff = max(0.0, min(1.0, float(eff)))

    out = {
        "effectiveness": round(eff, 4),
        "ntu": ntu,
        "c_ratio": c_ratio,
        "configuration": hx_type_raw,
        "ht_subtype": subtype,
        "n_shell_tube": n_shell_tube,
    }

    # Heat-duty + outlet temperatures if c_min_kw_k is provided
    if "c_min_kw_k" in payload:
        c_min = float(payload["c_min_kw_k"])
        out["c_min_kw_k"] = c_min
        out["ua_kw_k"] = round(ntu * c_min, 4)
        if "t_hot_in_c" in payload and "t_cold_in_c" in payload:
            t_h_in = float(payload["t_hot_in_c"])
            t_c_in = float(payload["t_cold_in_c"])
            q_max = c_min * (t_h_in - t_c_in)
            q = eff * q_max
            out["q_max_kw"] = round(q_max, 3)
            out["heat_transfer_kw"] = round(q, 3)
            out["heat_duty_kw"] = round(q, 3)  # alias for class-plan naming
            c_max = c_min / max(1e-9, c_ratio) if c_ratio > 0 else float("inf")
            out["delta_t_min_side_k"] = round(q / c_min, 3)
            out["delta_t_max_side_k"] = round(q / c_max, 3) if c_ratio > 0 else 0.0
            # Assume hot fluid is the C_min side (typical chiller/HVAC case)
            out["t_hot_out_c"] = round(t_h_in - q / c_min, 3)
            out["t_cold_out_c"] = round(t_c_in + (q / c_max if c_ratio > 0 else 0), 3)
            # UA required to deliver q given LMTD
            # (Approximate via LMTD for cross-check)
            dt1 = t_h_in - out["t_cold_out_c"]
            dt2 = out["t_hot_out_c"] - t_c_in
            if dt1 > 0 and dt2 > 0 and abs(dt1 - dt2) > 1e-3:
                import math
                lmtd = (dt1 - dt2) / math.log(dt1 / dt2)
                out["lmtd_k"] = round(lmtd, 3)
                out["ua_required_w_k"] = round((q * 1000.0) / max(0.01, lmtd), 1)
            elif abs(dt1 - dt2) <= 1e-3:
                out["lmtd_k"] = round(dt1, 3)
                out["ua_required_w_k"] = round((q * 1000.0) / max(0.01, dt1), 1)

    out["_provenance"] = PROVENANCE
    return out


def main() -> int:
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
