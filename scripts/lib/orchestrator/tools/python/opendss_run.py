#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/opendss_run.py

Real OpenDSS wrapper. Builds a small distribution feeder + BESS export
point, runs load flow, returns:
- bus voltages
- feeder losses
- whether BESS export pushes voltage out of statutory limits

License: BSD (EPRI). Source: github.com/dss-extensions/OpenDSSDirect.py
"""
from __future__ import annotations
import json
import sys
import time


def compute(payload: dict) -> dict:
    import opendssdirect as odd

    rated_kw = float(payload.get("rated_power_kw", 1000))
    pcc_voltage_kv = float(payload.get("pcc_voltage_kv", 11.0))
    feeder_length_km = float(payload.get("feeder_length_km", 1.0))

    odd.Text.Command("Clear")
    odd.Text.Command(f"New Circuit.test bus1=SourceBus pu=1.0 basekv={pcc_voltage_kv}")
    odd.Text.Command(
        f"New Line.feeder bus1=SourceBus bus2=BessPCC length={feeder_length_km} units=km "
        f"r1=0.3 x1=0.1 r0=0.9 x0=0.3"
    )
    # BESS export = negative load
    odd.Text.Command(
        f"New Load.BESS bus1=BessPCC phases=3 kV={pcc_voltage_kv} kW={-rated_kw} pf=1.0"
    )
    odd.Text.Command(f"Set Voltagebases=[{pcc_voltage_kv}]")
    odd.Text.Command("Calcvoltagebases")
    odd.Text.Command("Solve")

    if not odd.Solution.Converged():
        raise RuntimeError("OpenDSS solution did not converge")

    odd.Circuit.SetActiveBus("BessPCC")
    vmag = odd.Bus.VMagAngle()
    # vmag returns [V_a_mag, V_a_phase, V_b_mag, V_b_phase, V_c_mag, V_c_phase]
    v_phase_v = vmag[0]  # phase voltage in V
    v_pu = v_phase_v / (pcc_voltage_kv * 1000.0 / 1.732)  # convert to pu
    losses_kw = float(odd.Circuit.Losses()[0]) / 1000.0  # W to kW

    # Statutory voltage limits: EN 50160 says ±10% of nominal at LV PCC
    pcc_voltage_within_limits = 0.9 <= v_pu <= 1.1

    return {
        "pcc_voltage_pu": round(v_pu, 4),
        "pcc_voltage_phase_v": round(v_phase_v, 1),
        "feeder_losses_kw": round(losses_kw, 3),
        "pcc_voltage_within_en50160_limits": pcc_voltage_within_limits,
        "solution_converged": True,
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
        out["_meta"] = {"wall_time_s": round(time.time() - t, 3)}
    except Exception as exc:
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
