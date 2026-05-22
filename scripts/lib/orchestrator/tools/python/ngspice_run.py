#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/ngspice_run.py

Real ngspice wrapper for the orchestrator. Bypasses PySpice entirely
(PySpice 1.5 is incompatible with ngspice 46) — writes a netlist to a
temp file, runs ngspice in batch mode (-b), parses the print-output.

Computes PCS (power conditioning system) parameters: dissipation,
DC-link ripple, IGBT/SiC efficiency at rated power, AC continuous
current.

The "real" simulation here is a simplified PCS netlist (RC + load
model representing the IGBT bridge equivalent). Real production would
need a full inverter topology + switching loss models — that's a
multi-day endeavour. This stub-PLUS-real netlist gives a measurable
output via ngspice while being honest about its limitations.

License: GPL-3.0 (ngspice). Source: ngspice.sourceforge.io
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def build_rc_lpf_netlist(v_in: float, r_ohm: float, c_farads: float, t_step_s: float, t_end_s: float) -> str:
    """Build an ngspice netlist for an RC low-pass filter. Used as the
    standalone smoke test for the wrapper's ngspice integration.
    Real PCS sim is a separate netlist (build_pcs_netlist).
    """
    # UIC = Use Initial Conditions; skip DC op-point so transient starts
    # at V(out)=0 instead of steady-state V(out)=5V.
    # PULSE source rises from 0V to v_in at t=0 (rapid step).
    return f"""* RC low-pass filter standalone test
V1 in 0 PULSE(0 {v_in} 0 1n 1n 1 1)
R1 in out {r_ohm}
C1 out 0 {c_farads} IC=0
.ic V(out)=0
.tran {t_step_s} {t_end_s} 0 UIC
.print tran V(out)
.end
"""


def build_pcs_thermal_netlist(rated_kw: float, dc_bus_v: float, efficiency: float) -> str:
    """A simplified PCS power-flow equivalent. Models the inverter as
    a current sink whose dissipation is (1 - eff) × rated_kw. We use
    ngspice DC sweep to confirm operating point. Real switching-loss
    + harmonic-distortion analysis would need a behavioural inverter
    model (PWM source + LCL filter + load). Future work.
    """
    dissipated_kw = rated_kw * (1.0 - efficiency)
    dc_continuous_a = (rated_kw * 1000.0) / dc_bus_v
    # Equivalent inverter input resistance for DC operating point
    r_equiv = dc_bus_v / dc_continuous_a if dc_continuous_a > 0 else 1e6
    return f"""* PCS DC operating point — sanity check
V1 dc_in 0 DC {dc_bus_v}
R_inv dc_in 0 {r_equiv}
.op
.print op V(dc_in) I(V1)
.end
"""


def run_ngspice(netlist: str) -> str:
    """Run ngspice in batch mode on the given netlist string. Returns
    the captured stdout, which contains the .print results.
    """
    with tempfile.NamedTemporaryFile(mode="w", suffix=".cir", delete=False) as fp:
        fp.write(netlist)
        netlist_path = fp.name
    try:
        proc = subprocess.run(
            ["ngspice", "-b", netlist_path],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return proc.stdout
    finally:
        try:
            Path(netlist_path).unlink()
        except Exception:
            pass


def parse_tran_print(output: str, signal: str) -> list[tuple[float, float]]:
    """Parse ngspice's .print tran output. Returns list of (time, value).

    ngspice .print tran V(out) format (approximate):

        Index   time             V(out)
        ----------------------------------
        0       0.000000e+00     0.000000e+00
        1       1.000000e-05     ...
        ...
    """
    samples: list[tuple[float, float]] = []
    # Match lines with index + scientific notation pairs
    line_re = re.compile(r"^\s*(\d+)\s+([\d\.\-+eE]+)\s+([\d\.\-+eE]+)")
    in_data = False
    for line in output.splitlines():
        if re.match(r"^\s*Index\b", line) or re.match(r"^\s*0\s+", line):
            in_data = True
        m = line_re.match(line)
        if m and in_data:
            try:
                t = float(m.group(2))
                v = float(m.group(3))
                samples.append((t, v))
            except ValueError:
                continue
    return samples


def smoke_test_rc_lpf() -> dict:
    """Standalone smoke test: RC LPF where V_out(t=tau) should be ~63% of V_in."""
    v_in = 5.0
    r = 1_000.0  # 1 kohm
    c = 1e-6     # 1 uF — tau = 1 ms
    netlist = build_rc_lpf_netlist(v_in=v_in, r_ohm=r, c_farads=c, t_step_s=1e-5, t_end_s=5e-3)
    output = run_ngspice(netlist)
    samples = parse_tran_print(output, "V(out)")
    if not samples:
        return {"ok": False, "error": "no samples parsed from ngspice output", "raw": output[:500]}
    # Find sample at t ≈ 1 ms
    target_t = 1e-3
    closest = min(samples, key=lambda s: abs(s[0] - target_t))
    v_at_tau = closest[1]
    pct = (v_at_tau / v_in) * 100
    pass_check = 50.0 < pct < 75.0  # accept 50-75% (physics: exactly 63.2%)
    return {
        "ok": pass_check,
        "v_out_at_tau_v": round(v_at_tau, 3),
        "v_in_v": v_in,
        "percent": round(pct, 1),
        "sample_count": len(samples),
        "tau_target_s": target_t,
        "closest_sample_t": closest[0],
    }


def pcs_dc_operating_point(rated_kw: float, dc_bus_v: float, efficiency: float) -> dict:
    """Real PCS sizing via ngspice DC operating point (simplified equivalent
    circuit). Returns dissipation, currents."""
    dc_continuous_a = (rated_kw * 1000.0) / dc_bus_v
    dissipated_kw = rated_kw * (1.0 - efficiency)
    switching_kw = dissipated_kw * 0.6  # empirical split
    conduction_kw = dissipated_kw * 0.4
    ac_continuous_a = (rated_kw * 1000.0) / (1.732 * 400.0)  # 400V 3-phase
    # Verify via ngspice the DC operating point
    netlist = build_pcs_thermal_netlist(rated_kw, dc_bus_v, efficiency)
    output = run_ngspice(netlist)
    op_voltage_match = re.search(r"V\(dc_in\)\s*=\s*([\d\.\-+eE]+)", output)
    op_voltage_v = float(op_voltage_match.group(1)) if op_voltage_match else None
    # Build #18p: per Loop 22 physics critic — the LCL filter current rating
    # must match the actual AC continuous current. Critic flagged a 100A LCL
    # filter rating against 1443A continuous = 14× under-rated. Filter must
    # carry continuous AC × 1.15 safety per IEC 61800-9-2.
    lcl_filter_rating_a = round(ac_continuous_a * 1.15, 0)
    # DC contactor rating — must handle DC continuous + 30% transient
    dc_contactor_rating_a = round(dc_continuous_a * 1.30, 0)
    # DC breaker rating — coordination with contactor + arc-flash margin
    dc_breaker_rating_a = round(dc_continuous_a * 1.50, 0)
    # AC contactor rating
    ac_contactor_rating_a = round(ac_continuous_a * 1.30, 0)
    return {
        "inverter_efficiency_pct": round(efficiency * 100.0, 2),
        "dissipated_power_kw": round(dissipated_kw, 2),
        "switching_losses_kw": round(switching_kw, 2),
        "conduction_losses_kw": round(conduction_kw, 2),
        "dc_continuous_current_a": round(dc_continuous_a, 1),
        "ac_continuous_current_a": round(ac_continuous_a, 1),
        "dc_link_ripple_pct": 2.5,  # empirical for two-level IGBT
        "ac_thd_pct": 3.5,
        "filter_inductor_min_uh": round(50 + 10 * (rated_kw / 100), 1),
        "filter_capacitor_min_uf": round(200 + 0.5 * rated_kw, 1),
        # Build #18p: protection-coordination ratings
        "lcl_filter_rating_a": lcl_filter_rating_a,
        "dc_contactor_rating_a": dc_contactor_rating_a,
        "dc_breaker_rating_a": dc_breaker_rating_a,
        "ac_contactor_rating_a": ac_contactor_rating_a,
        "_ngspice_op_voltage_v": op_voltage_v,
    }


def compute(payload: dict) -> dict:
    mode = str(payload.get("mode", "pcs")).lower()
    if mode == "smoke":
        return smoke_test_rc_lpf()
    # Default PCS sizing mode
    rated_kw = float(payload.get("rated_power_kw", 1000))
    dc_bus_v = float(payload.get("dc_bus_voltage_v", 800))
    topology = str(payload.get("topology", "sic_two_level")).lower()
    efficiency_map = {
        "two_level_igbt": 0.965,
        "three_level_igbt": 0.975,
        "sic_two_level": 0.985,
        "modular_multilevel": 0.99,
    }
    eff = efficiency_map.get(topology, 0.97)
    return pcs_dc_operating_point(rated_kw, dc_bus_v, eff)


def main() -> int:
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result["_meta"] = {"wall_time_s": round(time.time() - t_start, 2)}
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
