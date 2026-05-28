#!/usr/bin/env python3
"""
scripts/tools/test_g99_dynamic_compliance.py

Validation harness for g99_dynamic_compliance.py.

Reference values are transcribed VERBATIM from ENA EREC G99 (NESO published
copy, extracted directly from the PDF text):

  * Type classification (G99 §6, lines 1139-1157): Type A < 1 MW; Type B = 1 MW
    to < 10 MW; Type C = 10 to < 50 MW; Type D >= 50 MW. A 1 MW BESS = Type B.
  * LVRT Type B Power Park Module (§12.3 Table 12.2): Uret=0.10 pu, tclear=0.14 s;
    Urec2=0.85 pu at trec2=0.14 s; recovery by trec3=2.2 s.
  * Frequency (§11/LFSM, lines 5290-5395): continuous 49.0-51.0 Hz; LFSM-O at
    50.4 Hz; widest time-limited band 47.0-52.0 Hz.
  * Reactive (§12.4, line 6007): 0.95 PF lagging to 0.95 PF leading.

The checks are deterministic, so validation = (a) the hardcoded envelope equals
the standard's values, (b) classification is right, (c) a compliant design PASSES,
(d) each non-compliant design FAILS the correct individual check (proving the
checker can fail, not rubber-stamp), (e) JSON contract round-trips.

Run: .venv/bin/python3 scripts/tools/test_g99_dynamic_compliance.py
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import g99_dynamic_compliance as g99  # noqa: E402

VENV_PY = os.path.join(HERE, "..", "..", ".venv", "bin", "python3")
SCRIPT = os.path.join(HERE, "g99_dynamic_compliance.py")

RESULTS: list[dict] = []


def expect(name: str, got, expected) -> None:
    RESULTS.append({"case": name, "status": "PASS" if got == expected else "FAIL",
                    "computed": got, "reference": expected})


def expect_close(name: str, got: float, expected: float, tol: float) -> None:
    RESULTS.append({"case": name, "status": "PASS" if abs(got - expected) <= tol else "FAIL",
                    "computed": round(got, 5), "reference": expected})


# ── A. Hardcoded envelope equals the standard ───────────────────────────────
expect("A. LVRT Type-B-PPM Uret floor = 0.10 pu", g99.G99_LVRT_TYPE_B_PPM[0][0], 0.10)
expect("A. LVRT Type-B-PPM tclear = 0.14 s", g99.G99_LVRT_TYPE_B_PPM[1][1], 0.14)
expect("A. LVRT Type-B-PPM Urec2 = 0.85 pu", g99.G99_LVRT_TYPE_B_PPM[2][0], 0.85)
expect("A. LVRT Type-B-PPM trec3 = 2.2 s", g99.G99_LVRT_TYPE_B_PPM[3][1], 2.2)
expect("A. LFSM-O trigger = 50.4 Hz", g99.G99_LFSM_O_TRIGGER_HZ, 50.4)
expect("A. continuous freq band = 49.0-51.0", (g99.G99_CONT_FREQ_MIN_HZ, g99.G99_CONT_FREQ_MAX_HZ), (49.0, 51.0))
expect("A. ride-through band = 47.0-52.0", (g99.G99_RIDE_FREQ_MIN_HZ, g99.G99_RIDE_FREQ_MAX_HZ), (47.0, 52.0))
expect("A. reactive PF = 0.95", g99.G99_POWER_FACTOR, 0.95)
expect_close("A. Q/Pmax at 0.95 PF = 0.3287", g99.G99_Q_PMAX, 0.32868, 0.0005)

# ── B. Type classification ──────────────────────────────────────────────────
expect("B. 1 MW @ 11 kV -> Type B", g99.classify_type(1000.0, 11.0), "B")
expect("B. 0.8 MW @ 0.4 kV -> Type A", g99.classify_type(800.0, 0.4), "A")
expect("B. 25 MW @ 33 kV -> Type C", g99.classify_type(25000.0, 33.0), "C")
expect("B. 1 MW @ 132 kV -> Type D (>=110kV)", g99.classify_type(1000.0, 132.0), "D")

# ── C. Compliant design (L52 BESS values) PASSES all four ───────────────────
compliant = dict(
    rated_power_kw=1000.0, connection_voltage_kv=11.0,
    design_lvrt_floor_pu=0.0, design_lvrt_floor_duration_s=0.15,
    design_hvrt_ceiling_pu=1.20,
    design_lfsm_o_trigger_hz=50.4, design_droop_pct=4.0,
    design_continuous_freq_min_hz=49.0, design_continuous_freq_max_hz=51.0,
    design_freq_ride_min_hz=47.0, design_freq_ride_max_hz=52.0,
    design_power_factor=0.95,
)
rc = g99.compute(compliant)
expect("C. compliant g99_type == B", rc["g99_type"], "B")
expect("C. compliant lvrt_ok", rc["lvrt_ok"], True)
expect("C. compliant hvrt_ok", rc["hvrt_ok"], True)
expect("C. compliant freq_response_ok", rc["freq_response_ok"], True)
expect("C. compliant reactive_capability_ok", rc["reactive_capability_ok"], True)
expect("C. compliant all_ok", rc["all_ok"], True)
expect("C. compliant zero violations", len(rc["violations"]), 0)

# ── D. Each non-compliant design FAILS the correct check ────────────────────
# D1 LVRT too shallow (only rides to 0.5 pu)
bad = dict(compliant); bad["design_lvrt_floor_pu"] = 0.5
r = g99.compute(bad)
expect("D1. shallow LVRT -> lvrt_ok False", r["lvrt_ok"], False)
expect("D1. shallow LVRT -> others still True",
       (r["hvrt_ok"], r["freq_response_ok"], r["reactive_capability_ok"]), (True, True, True))

# D2 HVRT ceiling too low (1.1 pu)
bad = dict(compliant); bad["design_hvrt_ceiling_pu"] = 1.10
r = g99.compute(bad)
expect("D2. low HVRT -> hvrt_ok False", r["hvrt_ok"], False)

# D3 droop out of range (15%)
bad = dict(compliant); bad["design_droop_pct"] = 15.0
r = g99.compute(bad)
expect("D3. droop 15% -> freq_response_ok False", r["freq_response_ok"], False)

# D4 LFSM-O trigger too high (50.8 Hz)
bad = dict(compliant); bad["design_lfsm_o_trigger_hz"] = 50.8
r = g99.compute(bad)
expect("D4. LFSM-O 50.8Hz -> freq_response_ok False", r["freq_response_ok"], False)

# D5 continuous band too narrow (49.5-50.5)
bad = dict(compliant)
bad["design_continuous_freq_min_hz"] = 49.5
bad["design_continuous_freq_max_hz"] = 50.5
r = g99.compute(bad)
expect("D5. narrow continuous band -> freq_response_ok False", r["freq_response_ok"], False)

# D6 reactive PF too narrow (0.98)
bad = dict(compliant); bad["design_power_factor"] = 0.98
r = g99.compute(bad)
expect("D6. PF 0.98 -> reactive_capability_ok False", r["reactive_capability_ok"], False)

# ── E. JSON contract round-trip ─────────────────────────────────────────────
proc = subprocess.run([VENV_PY, SCRIPT], input=json.dumps(compliant),
                      capture_output=True, text=True)
contract_ok = proc.returncode == 0
out = json.loads(proc.stdout) if contract_ok else {}
expect("E. JSON contract exit 0 + parseable", contract_ok and bool(out), True)
expect("E. JSON all_ok True", out.get("all_ok"), True)
expect("E. JSON g99_type B", out.get("g99_type"), "B")
for key in ("lvrt_ok", "hvrt_ok", "freq_response_ok", "reactive_capability_ok", "violations"):
    expect(f"E. JSON has '{key}'", key in out, True)


if __name__ == "__main__":
    passed = sum(1 for r in RESULTS if r["status"] == "PASS")
    total = len(RESULTS)
    print("=" * 74)
    print(f"G99 DYNAMIC COMPLIANCE (EREC G99)  —  {passed}/{total} PASS")
    print("=" * 74)
    for r in RESULTS:
        sig = "OK " if r["status"] == "PASS" else "XX "
        print(f"[{sig}] {r['case']:<46} computed={r['computed']} ref={r['reference']}")
    print()
    sys.exit(0 if passed == total else 1)
