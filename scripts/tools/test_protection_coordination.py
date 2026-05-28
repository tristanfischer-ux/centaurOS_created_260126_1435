#!/usr/bin/env python3
"""
scripts/tools/test_protection_coordination.py

Validation harness for protection_coordination.py.

Reference cases:

  A. IEC 60909 PCC fault (11 kV) — grid-strength limited. Hand-calc:
        Ik'' = S_sc / (sqrt3 * U) = 250 MVA / (sqrt3 * 11 kV) = 13.12 kA.
     pandapower must return within ~5 %.

  B. Task-brief hand-calc: an 11 kV, 1 MVA transformer at 6 % impedance fed
     from a strong grid limits the LV through-fault. With c=1.1 and the grid
     impedance in series, pandapower's LV Ik'' is ~24-26 kA. The pure
     transformer-only hand-calc (ignoring grid Z) is the UPPER bound:
        Ik''_LV(xfmr only, c=1.1) = c*U / (sqrt3 * Zt),  Zt = vk*U^2/S
                                  = 1.1*400 / (sqrt3 * 0.096) = 26.46 kA.
     pandapower returns slightly less (grid Z in series) -> must be < the
     upper bound and within ~10 % of it.

  C. DC bus fault: 800 V bus, 15 mohm pack + 2 mohm bus -> 800/0.017 = 47.06 kA.

  D. Selectivity (council acceptance case): at a 5 kA fault, the 200 A gPV
     rack fuse clears in single-digit ms while the 2500 A ACB long-time band
     (I/Ir=2.0) trips in tens of seconds -> downstream clears first, margin
     >> 50 ms, selectivity_ok == True.

  E. Anti-selectivity guard: at a fault where the upstream ACB instantaneous
     band would beat the fuse, selectivity_ok must be False (sanity that the
     check can FAIL, not just always pass).

Run: .venv/bin/python3 scripts/tools/test_protection_coordination.py
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import protection_coordination as pc  # noqa: E402

VENV_PY = os.path.join(HERE, "..", "..", ".venv", "bin", "python3")
SCRIPT = os.path.join(HERE, "protection_coordination.py")

RESULTS: list[dict] = []


def check(name: str, got, expected, tol: float, unit: str = "") -> None:
    if isinstance(got, bool) or isinstance(expected, bool) or got is None:
        ok = got == expected
    else:
        ok = abs(got - expected) <= tol
    RESULTS.append({
        "case": name, "status": "PASS" if ok else "FAIL",
        "computed": round(got, 4) if isinstance(got, (int, float)) and not isinstance(got, bool) else got,
        "reference": expected, "tol": tol, "unit": unit,
    })


# ── A. PCC fault current vs hand-calc ───────────────────────────────────────
ac = pc.ac_fault_currents(pcc_voltage_kv=11.0, transformer_kva=1000.0,
                          transformer_impedance_pct=6.0, grid_sc_mva=250.0)
pcc_hand = 250.0 / (math.sqrt(3) * 11.0)  # 13.12 kA
check("A. PCC Ik'' (11kV) vs hand", ac["pcc_fault_ka"], pcc_hand,
      0.05 * pcc_hand, "kA")

# ── B. LV through-fault: below the transformer-only upper bound, within 10% ─
zt = 0.06 * (0.4 ** 2) / 1.0
lv_upper_bound = 1.1 * 0.4 / (math.sqrt(3) * zt)  # 26.46 kA (xfmr only, c=1.1)
RESULTS.append({
    "case": "B. LV Ik'' < xfmr-only upper bound",
    "status": "PASS" if ac["lv_fault_ka"] < lv_upper_bound else "FAIL",
    "computed": round(ac["lv_fault_ka"], 3), "reference": f"< {lv_upper_bound:.2f}",
    "tol": 0, "unit": "kA",
})
check("B. LV Ik'' within 10% of bound", ac["lv_fault_ka"], lv_upper_bound,
      0.10 * lv_upper_bound, "kA")

# ── C. DC bus fault ─────────────────────────────────────────────────────────
dc = pc.dc_bus_fault(v_bus=800.0, r_pack_ohm=0.015, r_bus_ohm=0.002)
check("C. DC bus fault (800V/17mohm)", dc, 800.0 / 0.017 / 1000.0, 0.05, "kA")

# ── D. Selectivity at 5 kA: fuse clears before ACB ──────────────────────────
i5 = 5000.0
t_fuse = pc.device_op_time_ms(pc.DEFAULT_DEVICES["rack_fuse_gPV_200A"], i5)
t_acb = pc.device_op_time_ms(pc.DEFAULT_DEVICES["main_acb_E2.2_2500A"], i5)
RESULTS.append({
    "case": "D. fuse clears in single-digit ms",
    "status": "PASS" if 2.0 <= t_fuse <= 12.0 else "FAIL",
    "computed": round(t_fuse, 3), "reference": "2-12", "tol": 0, "unit": "ms",
})
RESULTS.append({
    "case": "D. ACB LT trips in seconds (>1000ms)",
    "status": "PASS" if t_acb > 1000.0 else "FAIL",
    "computed": round(t_acb, 1), "reference": "> 1000", "tol": 0, "unit": "ms",
})
RESULTS.append({
    "case": "D. fuse faster than ACB (selective)",
    "status": "PASS" if t_fuse < t_acb else "FAIL",
    "computed": round(t_acb - t_fuse, 1), "reference": "> 0", "tol": 0, "unit": "ms margin",
})

# ── E. Anti-selectivity guard: construct a pair that MUST fail ──────────────
# An upstream ACB with a very low instantaneous pickup (Ir=200A, I-band at 2x)
# clears in 30 ms, beating a slow downstream fuse -> NOT selective.
bad_devices = {
    "fast_acb": {"type": "acb", "ir_a": 200.0, "i_pickup_mult": 2.0, "i_clear_ms": 30.0,
                 "s_pickup_mult": 1.5, "s_delay_ms": 50.0},
    "slow_fuse": {"type": "fuse", "rated_a": 400.0, "melt_k": 6.0e4, "melt_n": 2.0,
                  "min_clear_ms": 100.0},
}
res_bad = pc.compute({
    "devices": bad_devices,
    "coordination_pairs": [{"upstream": "fast_acb", "downstream": "slow_fuse",
                            "fault_ka": 5.0, "margin_ms": 50.0}],
})
RESULTS.append({
    "case": "E. anti-selectivity correctly FAILS",
    "status": "PASS" if res_bad["selectivity_ok"] is False else "FAIL",
    "computed": res_bad["selectivity_ok"], "reference": False, "tol": 0, "unit": "",
})

# ── F. JSON contract: subprocess round-trip, default BESS case ──────────────
proc = subprocess.run([VENV_PY, SCRIPT], input=json.dumps({}),
                      capture_output=True, text=True)
contract_ok = proc.returncode == 0
out = json.loads(proc.stdout) if contract_ok else {}
RESULTS.append({
    "case": "F. JSON contract: exit 0 + parseable",
    "status": "PASS" if contract_ok and out else "FAIL",
    "computed": proc.returncode, "reference": 0, "tol": 0, "unit": "exit",
})
RESULTS.append({
    "case": "F. JSON selectivity_ok == True",
    "status": "PASS" if out.get("selectivity_ok") is True else "FAIL",
    "computed": out.get("selectivity_ok"), "reference": True, "tol": 0, "unit": "",
})
for key in ("pcc_fault_ka", "dc_bus_fault_ka", "coordination_pairs"):
    RESULTS.append({
        "case": f"F. JSON has '{key}'",
        "status": "PASS" if key in out else "FAIL",
        "computed": key in out, "reference": True, "tol": 0, "unit": "",
    })


if __name__ == "__main__":
    passed = sum(1 for r in RESULTS if r["status"] == "PASS")
    total = len(RESULTS)
    print("=" * 74)
    print(f"PROTECTION COORDINATION (IEC 60909 + TCC)  —  {passed}/{total} PASS")
    print("=" * 74)
    for r in RESULTS:
        sig = "OK " if r["status"] == "PASS" else "XX "
        print(f"[{sig}] {r['case']:<40} computed={r['computed']} "
              f"ref={r['reference']} {r['unit']}")
    print()
    sys.exit(0 if passed == total else 1)
