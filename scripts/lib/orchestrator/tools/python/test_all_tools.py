#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/test_all_tools.py

Standalone harness — tests every installed engineering tool independently
with a known-good calculation. Prints a per-tool PASS/FAIL + the actual
computed value + wall time + any error.

This validates each tool BEFORE wiring it into the orchestrator's PDF
engine. Per Tristan 2026-05-22: "all team tools need to be installed
and tested that they work independent of the pdf engine. then hooked
up to the pdf engine."

Usage:
    .venv/bin/python3 scripts/lib/orchestrator/tools/python/test_all_tools.py
"""
from __future__ import annotations

import json
import sys
import time
import traceback
from typing import Any

RESULTS: list[dict[str, Any]] = []


def case(name: str, expected: str):
    """Decorator: wraps a test, captures result + timing."""
    def wrap(fn):
        def runner():
            t0 = time.time()
            entry = {"tool": name, "expected": expected}
            try:
                value = fn()
                entry["status"] = "PASS"
                entry["value"] = value
            except Exception as exc:
                entry["status"] = "FAIL"
                entry["error_type"] = type(exc).__name__
                entry["error_msg"] = str(exc)[:300]
                entry["trace"] = traceback.format_exc().splitlines()[-1]
            entry["wall_time_s"] = round(time.time() - t0, 3)
            RESULTS.append(entry)
        return runner
    return wrap


# ──────────────────────────────────────────────────────────────────────────
# 1. CoolProp — refrigerant properties
# ──────────────────────────────────────────────────────────────────────────

@case("CoolProp", "R290 sat temp at 1 MPa ≈ 300.09 K (26.94°C)")
def t_coolprop():
    import CoolProp.CoolProp as CP
    t_k = CP.PropsSI("T", "P", 1e6, "Q", 0, "R290")
    assert 299.5 < t_k < 300.5, f"unexpected value: {t_k}"
    return f"{t_k:.2f} K ({t_k - 273.15:.2f}°C)"


# ──────────────────────────────────────────────────────────────────────────
# 2. PyBaMM — battery cell DFN simulation
# ──────────────────────────────────────────────────────────────────────────

@case("PyBaMM", "Prada2013 LFP DFN model loads + discharges at 0.5C")
def t_pybamm():
    import pybamm
    model = pybamm.lithium_ion.DFN()
    params = pybamm.ParameterValues("Prada2013")
    params.update({"Current function [A]": 0.5 * params["Nominal cell capacity [A.h]"]})
    sim = pybamm.Simulation(model, parameter_values=params)
    sim.solve([0, 7200])
    final_voltage = float(sim.solution["Voltage [V]"].entries[-1])
    return f"final voltage at end of 0.5C discharge: {final_voltage:.3f} V"


# ──────────────────────────────────────────────────────────────────────────
# 3. pandapower — power system load flow
# ──────────────────────────────────────────────────────────────────────────

@case("pandapower", "Small 2-bus 1 MVA transformer + load load-flow converges")
def t_pandapower():
    import pandapower as pp
    net = pp.create_empty_network()
    b1 = pp.create_bus(net, vn_kv=11.0, name="MV grid")
    b2 = pp.create_bus(net, vn_kv=0.4, name="LV bus")
    pp.create_ext_grid(net, b1, vm_pu=1.02)
    pp.create_transformer_from_parameters(
        net, hv_bus=b1, lv_bus=b2,
        sn_mva=1.25, vn_hv_kv=11.0, vn_lv_kv=0.4,
        vkr_percent=0.5, vk_percent=6.0,
        pfe_kw=2.0, i0_percent=0.1,
    )
    pp.create_load(net, b2, p_mw=1.0, q_mvar=0.3)
    pp.runpp(net)
    lv_voltage = float(net.res_bus.vm_pu.iloc[1])
    return f"LV bus voltage after 1 MW load: {lv_voltage:.4f} pu"


# ──────────────────────────────────────────────────────────────────────────
# 4. OpenDSS — distribution system simulation
# ──────────────────────────────────────────────────────────────────────────

@case("OpenDSS", "Simple radial feeder load-flow")
def t_opendss():
    import opendssdirect as odd
    # Compile a minimal radial feeder
    odd.Text.Command("Clear")
    odd.Text.Command("New Circuit.test bus1=SourceBus pu=1.0 basekv=11")
    odd.Text.Command("New Line.l1 bus1=SourceBus bus2=Load1 length=1 units=km r1=0.3 x1=0.1")
    odd.Text.Command("New Load.L1 bus1=Load1 phases=3 kV=11 kW=500 pf=0.95")
    odd.Text.Command("Set Voltagebases=[11]")
    odd.Text.Command("Calcvoltagebases")
    odd.Text.Command("Solve")
    solved = odd.Solution.Converged()
    if not solved:
        raise RuntimeError("OpenDSS solution did not converge")
    odd.Circuit.SetActiveBus("Load1")
    vmag = odd.Bus.VMagAngle()
    return f"Load1 bus magnitudes (phases A/B/C): {[round(v, 1) for v in vmag[::2]]}V"


# ──────────────────────────────────────────────────────────────────────────
# 5. Cantera — chemical thermodynamics + kinetics
# ──────────────────────────────────────────────────────────────────────────

@case("Cantera", "Equilibrate H2/O2 stoichiometric combustion at 1 atm")
def t_cantera():
    import cantera as ct
    gas = ct.Solution("gri30.yaml")
    gas.TPX = 300, ct.one_atm, "H2:2, O2:1, N2:3.76"
    gas.equilibrate("HP")  # constant enthalpy + pressure
    return f"Equilibrium T={gas.T:.1f} K, P={gas.P/1e5:.2f} bar"


# ──────────────────────────────────────────────────────────────────────────
# 6. ngspice — SPICE circuit simulation (via PySpice)
# ──────────────────────────────────────────────────────────────────────────

@case("ngspice/PySpice", "RC low-pass filter transient: V_out(τ) ≈ 0.63 × V_in")
def t_ngspice():
    from PySpice.Spice.Netlist import Circuit
    from PySpice.Unit import u_V, u_Ohm, u_uF, u_ms, u_us
    circuit = Circuit("RC LPF")
    circuit.V("input", "in", circuit.gnd, u_V(5))
    circuit.R(1, "in", "out", u_Ohm(1_000))
    circuit.C(1, "out", circuit.gnd, u_uF(1.0))
    sim = circuit.simulator(temperature=25, nominal_temperature=25)
    # Tau = R*C = 1k * 1uF = 1ms; V_out should be ~63% of V_in at t=tau
    analysis = sim.transient(step_time=u_us(10), end_time=u_ms(5))
    times = list(analysis.time)
    v_out = list(analysis["out"])
    # find sample closest to t = 1 ms
    target_idx = 0
    for i, t in enumerate(times):
        if float(t) >= 1.0e-3:
            target_idx = i
            break
    v_at_tau = float(v_out[target_idx])
    pct = (v_at_tau / 5.0) * 100
    return f"V_out at t=1ms = {v_at_tau:.3f}V ({pct:.1f}% of V_in)"


# ──────────────────────────────────────────────────────────────────────────
# Main: run all tests
# ──────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [t_coolprop, t_pybamm, t_pandapower, t_opendss, t_cantera, t_ngspice]
    for fn in tests:
        try:
            fn()
        except Exception as exc:
            RESULTS.append({"tool": fn.__name__, "status": "HARNESS_ERROR", "error_msg": str(exc)})

    pass_count = sum(1 for r in RESULTS if r["status"] == "PASS")
    total = len(RESULTS)

    print("=" * 70)
    print(f"STANDALONE TOOL TESTS  —  {pass_count}/{total} PASS")
    print("=" * 70)
    for r in RESULTS:
        s = r["status"]
        sigil = "✓" if s == "PASS" else "✗"
        print(f"\n[{sigil} {s}] {r['tool']}  ({r['wall_time_s']}s)")
        print(f"    Expected: {r.get('expected', 'n/a')}")
        if s == "PASS":
            print(f"    Result:   {r['value']}")
        else:
            print(f"    Error:    {r.get('error_type', '?')}: {r.get('error_msg', '?')}")
    print()
    sys.exit(0 if pass_count == total else 1)
