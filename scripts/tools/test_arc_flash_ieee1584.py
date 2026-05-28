#!/usr/bin/env python3
"""
scripts/tools/test_arc_flash_ieee1584.py

Validation harness for arc_flash_ieee1584.py.

Reference cases are the TWO official worked examples in IEEE 1584-2018
Annex D (the standard's own examples). Expected values are transcribed from
the standard, page-cited by the D.x equation number. They were independently
confirmed against the MIT-licensed LiaungYip/arcflash reference implementation
(verified vs IEEE's official calculator across 144,000 cases to within 0.1 %).

  Annex D.1 — medium voltage 4.16 kV VCB:
      Ibf=15 kA, G=104 mm, D=914.4 mm, box 1143x762x508 mm.
      full:    I_arc=12.979 kA, E=12.152 J/cm2 (2.904 cal/cm2), AFB=1606 mm  [D.17/D.32/D.42]
      reduced: I_arc=12.675 kA, E=13.343 J/cm2 (3.189 cal/cm2), AFB=1704 mm  [D.51/D.62/D.72]
      CF=1.284 [D.22], VarCF=0.047 [D.43]  -> reduced governs (higher E)

  Annex D.2 — low voltage 0.48 kV VCB:
      Ibf=45 kA, G=32 mm, D=609.6 mm, box 610x610x254 mm.
      full:    I_arc=28.793 kA, E=11.585 J/cm2, AFB=1029 mm  [D.84/D.91/D.95]
      reduced: I_arc=25.244 kA, E=53.156 J/cm2, AFB=2669 mm  [D.99/D.103/D.106]
      CF=1.085 [D.89], VarCF=0.247 [D.96]  -> reduced governs (HUGELY higher E)

Run: .venv/bin/python3 scripts/tools/test_arc_flash_ieee1584.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import arc_flash_ieee1584 as af  # noqa: E402

VENV_PY = os.path.join(HERE, "..", "..", ".venv", "bin", "python3")
SCRIPT = os.path.join(HERE, "arc_flash_ieee1584.py")

RESULTS: list[dict] = []


def check(name: str, got: float, expected: float, tol: float, unit: str = "") -> None:
    ok = abs(got - expected) <= tol
    RESULTS.append({
        "case": name, "status": "PASS" if ok else "FAIL",
        "computed": round(got, 4), "reference": expected, "tol": tol, "unit": unit,
    })


# ── Annex D.1 — medium voltage (use the internal full/reduced analyse) ──────
d1 = dict(voltage_v=4160, ibf_ka=15.0, config="VCB", gap_mm=104.0,
          working_distance_mm=914.4, clearing_time_ms=197.0,
          enclosure_h_mm=1143, enclosure_w_mm=762, enclosure_d_mm=508)
d1_full = af.analyse(d1["voltage_v"], d1["ibf_ka"], d1["config"], d1["gap_mm"],
                     d1["working_distance_mm"], 197.0, d1["enclosure_h_mm"],
                     d1["enclosure_w_mm"], d1["enclosure_d_mm"], "full")
d1_red = af.analyse(d1["voltage_v"], d1["ibf_ka"], d1["config"], d1["gap_mm"],
                    d1["working_distance_mm"], 223.0, d1["enclosure_h_mm"],
                    d1["enclosure_w_mm"], d1["enclosure_d_mm"], "reduced")
check("D.1 CF (enclosure)", d1_full["enclosure_cf"], 1.284, 0.002)
check("D.1 VarCF", d1_full["var_cf"], 0.047, 0.001)
check("D.1 full I_arc", d1_full["arcing_current_ka"], 12.979, 0.01, "kA")
check("D.1 full E", d1_full["incident_energy_j_cm2"], 12.152, 0.05, "J/cm2")
check("D.1 full AFB", d1_full["arc_flash_boundary_mm"], 1606, 2, "mm")
check("D.1 reduced I_arc", d1_red["arcing_current_ka"], 12.675, 0.01, "kA")
check("D.1 reduced E", d1_red["incident_energy_j_cm2"], 13.343, 0.05, "J/cm2")
check("D.1 reduced AFB", d1_red["arc_flash_boundary_mm"], 1704, 2, "mm")

# ── Annex D.2 — low voltage ─────────────────────────────────────────────────
d2 = dict(voltage_v=480, ibf_ka=45.0, config="VCB", gap_mm=32.0,
          working_distance_mm=609.6, enclosure_h_mm=610,
          enclosure_w_mm=610, enclosure_d_mm=254)
d2_full = af.analyse(d2["voltage_v"], d2["ibf_ka"], d2["config"], d2["gap_mm"],
                     d2["working_distance_mm"], 61.3, d2["enclosure_h_mm"],
                     d2["enclosure_w_mm"], d2["enclosure_d_mm"], "full")
d2_red = af.analyse(d2["voltage_v"], d2["ibf_ka"], d2["config"], d2["gap_mm"],
                    d2["working_distance_mm"], 319.0, d2["enclosure_h_mm"],
                    d2["enclosure_w_mm"], d2["enclosure_d_mm"], "reduced")
check("D.2 CF (enclosure)", d2_full["enclosure_cf"], 1.085, 0.002)
check("D.2 VarCF", d2_full["var_cf"], 0.247, 0.001)
check("D.2 full I_arc", d2_full["arcing_current_ka"], 28.793, 0.01, "kA")
check("D.2 full E", d2_full["incident_energy_j_cm2"], 11.585, 0.05, "J/cm2")
check("D.2 full AFB", d2_full["arc_flash_boundary_mm"], 1029, 2, "mm")
check("D.2 reduced I_arc", d2_red["arcing_current_ka"], 25.244, 0.01, "kA")
check("D.2 reduced E", d2_red["incident_energy_j_cm2"], 53.156, 0.1, "J/cm2")
check("D.2 reduced AFB", d2_red["arc_flash_boundary_mm"], 2669, 3, "mm")

# ── JSON contract: subprocess round-trip on the LV example ──────────────────
# NB: a single physical protective device has ONE clearing time. The standard's
# Annex D.2 uses DIFFERENT times for the full (61.3 ms) and reduced (319 ms)
# cases only to illustrate the protection-curve sensitivity. The tool's contract
# takes one clearing_time_ms (fed from the protection-coordination tool) and
# correctly evaluates both arc-current cases AT THAT SAME TIME, taking the worse.
# At a fixed 319 ms, the full arc current (28.793 kA) yields more energy than the
# reduced (25.244 kA), so "full" governs and E = 60.3 J/cm2 = 14.4 cal/cm2.
proc = subprocess.run([VENV_PY, SCRIPT], input=json.dumps({
    "voltage_v": 480, "prospective_fault_current_ka": 45.0,
    "electrode_config": "VCB", "gap_mm": 32.0, "working_distance_mm": 609.6,
    "clearing_time_ms": 319.0,
    "enclosure_height_mm": 610, "enclosure_width_mm": 610, "enclosure_depth_mm": 254,
}), capture_output=True, text=True)
contract_ok = proc.returncode == 0
out = json.loads(proc.stdout) if contract_ok else {}
RESULTS.append({
    "case": "JSON contract: exit 0 + parseable",
    "status": "PASS" if contract_ok and out else "FAIL",
    "computed": proc.returncode, "reference": 0, "tol": 0, "unit": "exit",
})
# Cross-check the subprocess full-case figure against the internal full analyse
# at 319 ms (same inputs) — this is a self-consistency anchor, not an Annex value.
d2_full_at_319 = af.analyse(480, 45.0, "VCB", 32.0, 609.6, 319.0, 610, 610, 254, "full")
check("JSON governing E (cal/cm2)", out.get("incident_energy_cal_cm2", -1),
      round(d2_full_at_319["incident_energy_cal_cm2"], 3), 0.05, "cal/cm2")
RESULTS.append({
    "case": "JSON governing_case == full @319ms",
    "status": "PASS" if out.get("governing_case") == "full" else "FAIL",
    "computed": out.get("governing_case"), "reference": "full", "tol": 0, "unit": "",
})
# 14.4 cal/cm2 falls in the 8-25 band -> PPE Cat 3.
RESULTS.append({
    "case": "JSON ppe_category == 3",
    "status": "PASS" if out.get("ppe_category") == 3 else "FAIL",
    "computed": out.get("ppe_category"), "reference": 3, "tol": 0, "unit": "cat",
})


if __name__ == "__main__":
    passed = sum(1 for r in RESULTS if r["status"] == "PASS")
    total = len(RESULTS)
    print("=" * 74)
    print(f"ARC FLASH IEEE 1584-2018  —  {passed}/{total} PASS")
    print("=" * 74)
    for r in RESULTS:
        sig = "OK " if r["status"] == "PASS" else "XX "
        print(f"[{sig}] {r['case']:<34} computed={r['computed']} "
              f"ref={r['reference']} (+/-{r['tol']}) {r['unit']}")
    print()
    sys.exit(0 if passed == total else 1)
