#!/usr/bin/env python3
"""Headless regression tests for convergence_loop.py.

Run:  python3 convergence_loop_test.py   (exit 0 = all pass)

Most checks need NO venv (they exercise the pure couplings + the iteration with
hand-built specs). The two real-schedule checks are skipped gracefully if the
sizing tools / artifacts are unavailable.

Invariants:
  C1  feeder_current_a — 3-phase P/(√3·V·pf) and DC P/(V·pf), hand-checked
  C2  cable_loss_kw — paths·I²·(ρL/(A·n)), hand-checked to the watt
  C3  PUMP-LOAD UNIT GUARD — a kW-unit (thermal-duty) spec gives 0 pump load
      (the 778 kW-read-as-778 m³/s phantom-load bug must stay fixed)
  C4  pump-load on a real flow unit is positive + matches ΔP·Q/η
  C5  the loop CONVERGES within max_iters on a contraction map
  C6  parasitic_kw ≥ 0 (loads only ADD; never a negative correction)
  C7  contraction_ratio < 1 (the iteration IS a contraction)
  C8  ECONOMIC COUPLING — optimise_conductors=True ends at demand ≤ the
      un-optimised run (fatter copper → less loss → less cooling)
  C9  determinism — identical inputs → identical trajectory
  C10 the pathological long-heavy bus shows a MATERIAL parasitic (loop earns it)
  C11 branches_from_schedule routes pipes→fluid, cables→electrical (real data)
"""
from __future__ import annotations

import json
import math
import os
import sys

import convergence_loop as cl
import connection_sizing as cs

_FAILS: list[str] = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        _FAILS.append(msg)
        print(f"  FAIL: {msg}")
    else:
        print(f"  ok:   {msg}")


# --------------------------------------------------------------------------
print("COUPLINGS")

# C1 — feeder current.
i3 = cl.feeder_current_a(1500.0, 400.0, is_dc=False, power_factor=0.95)
check(abs(i3 - 1500e3 / (math.sqrt(3) * 400 * 0.95)) < 1e-6,
      f"C1 3-ph feeder current = {i3:.1f} A (P/(√3·V·pf))")
idc = cl.feeder_current_a(1500.0, 690.0, is_dc=True, power_factor=1.0)
check(abs(idc - 1500e3 / 690.0) < 1e-6,
      f"C1 DC feeder current = {idc:.1f} A (P/(V·pf))")

# C2 — cable loss hand-check. csa 400, n_par 2, I 2000 A, L 300 m, DC bus (2 paths).
spec_bus = cs._spec(kind="cable", mechanism="electrical_bus", carried_rating=2000.0,
                    carried_unit="A", csa_mm2=400.0, n_parallel=2,
                    system_voltage_v=690.0)
loss = cl.cable_loss_kw_from_spec(spec_bus, 300.0)
r_path = cl.RHO_CU_20C * 300.0 / (400.0 * 2)        # 0.00645 Ω
expect = 2 * (2000.0 ** 2) * r_path / 1000.0         # 2 paths → 51.6 kW
check(abs(loss - expect) < 1e-6,
      f"C2 cable loss = {loss:.2f} kW (hand-check {expect:.2f} kW)")

# C3 — UNIT GUARD: a thermal-duty pipe (kW) must yield ZERO pump load.
spec_thermal = cs._spec(kind="pipe", mechanism="thermal", carried_rating=778.55,
                        carried_unit="kW", dp_kpa=0.76, phase="steam",
                        density_kg_m3=880.0)
check(cl.pump_load_kw_from_fluid_spec(spec_thermal) == 0.0,
      "C3 kW-unit thermal pipe → 0 pump load (no phantom 591 kW)")
# also a unit-less / bogus unit → 0
spec_bogus = cs._spec(kind="pipe", carried_rating=500.0, carried_unit="widgets",
                      dp_kpa=10.0, density_kg_m3=25.0)
check(cl.pump_load_kw_from_fluid_spec(spec_bogus) == 0.0,
      "C3 unrecognised unit → 0 pump load (no fall-through)")

# C4 — a real flow unit gives a positive pump load = ΔP·Q/η.
spec_gas = cs._spec(kind="pipe", mechanism="fluid_loop", carried_rating=0.3333,
                    carried_unit="kg/s", dp_kpa=14.15, phase="gas",
                    density_kg_m3=25.0)
p = cl.pump_load_kw_from_fluid_spec(spec_gas)
q = 0.3333 / 25.0
expect_p = (14.15 * 1000.0 * q) / (cl.DEFAULT_COMPRESSOR_EFF * cl.DEFAULT_MOTOR_EFF) / 1000.0
check(p > 0 and abs(p - expect_p) < 1e-4,
      f"C4 gas-line pump load = {p:.4f} kW (hand-check {expect_p:.4f} kW)")

# --------------------------------------------------------------------------
print("\nITERATION")

# C5–C7 — a synthetic plant with one heavy bus converges + is a contraction.
elec = [{"edge": {"constraint_kind": "current_rating", "mechanism": "electrical_bus",
                  "material_context": "690 V dc bus"},
         "length_m": 200.0, "carried": 1500.0}]
rep = cl.run_convergence(2000.0, [], elec, main_feeder_voltage_v=690.0,
                         main_feeder_is_dc=True, main_feeder_length_m=80.0,
                         optimise_conductors=False)
check(rep["converged"] and rep["iterations"] <= cl.DEFAULT_MAX_ITERS,
      f"C5 converges in {rep['iterations']} iters (≤{cl.DEFAULT_MAX_ITERS})")
check(rep["parasitic_kw"] >= -1e-9,
      f"C6 parasitic {rep['parasitic_kw']:.2f} kW ≥ 0 (loads only add)")
check(rep["contraction_ratio"] is None or rep["contraction_ratio"] < 1.0,
      f"C7 contraction ratio {rep['contraction_ratio']} < 1 (it IS contracting)")

# C8 — ECONOMIC COUPLING: optimising the conductors lowers (or holds) the fixed
# point, because fatter copper loses less heat → less cooling load. Use a run
# where the thermal-min is below the ladder top so an upsize is possible.
elec8 = [{"edge": {"constraint_kind": "current_rating", "mechanism": "electrical_feeder",
                   "material_context": "400 V ac feeder"},
          "length_m": 150.0, "carried": 300.0}]
opt_off = cl.run_convergence(1000.0, [], elec8, main_feeder_voltage_v=400.0,
                             main_feeder_length_m=60.0, optimise_conductors=False,
                             cooled_fraction_of_losses=1.0)
opt_on = cl.run_convergence(1000.0, [], elec8, main_feeder_voltage_v=400.0,
                            main_feeder_length_m=60.0, optimise_conductors=True,
                            cooled_fraction_of_losses=1.0)
check(opt_on["final_demand_kw"] <= opt_off["final_demand_kw"] + 1e-6,
      f"C8 economic sizing lowers/holds demand "
      f"{opt_off['final_demand_kw']:.2f} → {opt_on['final_demand_kw']:.2f} kW")
check(opt_on["optimisation"]["economic_lifetime_saving_gbp"] >= 0.0,
      f"C8 economic lifetime saving £{opt_on['optimisation']['economic_lifetime_saving_gbp']:.0f} ≥ 0")

# C9 — determinism.
rep_a = cl.run_convergence(2000.0, [], elec, main_feeder_voltage_v=690.0,
                           main_feeder_is_dc=True, main_feeder_length_m=80.0,
                           optimise_conductors=False)
check(rep_a["trajectory"] == rep["trajectory"] and rep_a["final_demand_kw"] == rep["final_demand_kw"],
      "C9 deterministic — identical trajectory on re-run")

# C10 — the pathological case shows a material parasitic (the loop EARNS its keep).
check(rep["parasitic_pct"] > 0.3,
      f"C10 long-heavy bus parasitic {rep['parasitic_pct']:.2f}% is material (loop earns it)")

# --------------------------------------------------------------------------
print("\nREAL-DATA WIRING (skipped if artifacts/tools absent)")

repo = os.path.abspath(os.path.join(cl._THIS_DIR, os.pardir, os.pardir))
sched_path = os.path.join(repo, "out", "oxccu-saf-v21", "connection-schedule.json")
if os.path.exists(sched_path):
    sched = json.load(open(sched_path))
    fluid, elecr = cl.branches_from_schedule(sched)
    check(len(fluid) >= 1 and len(elecr) >= 1,
          f"C11 branches_from_schedule → {len(fluid)} fluid + {len(elecr)} electrical")
    check(all(b.get("spec") is not None for b in fluid + elecr),
          "C11 every real branch carries its already-sized spec")
else:
    print("  skip: no real connection-schedule.json on disk")

# --------------------------------------------------------------------------
print()
if _FAILS:
    print(f"FAILED {len(_FAILS)} check(s):")
    for f in _FAILS:
        print("  -", f)
    sys.exit(1)
print("ALL convergence_loop tests PASS")
sys.exit(0)
