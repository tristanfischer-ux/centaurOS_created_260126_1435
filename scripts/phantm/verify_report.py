"""PHANTM — deterministic report verifier (the report's own proveCatch).

Recomputes every hand-derivable number from first principles, reads every
FE-derived number from its governing artefact, and asserts the CURRENT report
text carries exactly those values — plus a STALE-STRING BLACKLIST so numbers
retired by earlier review rounds can never silently reappear ("no shifts over
time"). Also asserts the Blender model's constants match the analysed geometry.

Run:  ~/.venvs/phantm/bin/python verify_report.py     → exit 0 green.
Wired into selftest.py so it runs with every guard pass.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
MD = open(os.path.join(OUT, "PHANTM-ACTUATOR-REPORT.md")).read()

G = 9.80665
MU0 = 4e-7 * math.pi
FAILS = []


def check(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{'  — ' + detail if detail else ''}")
    if not ok:
        FAILS.append(name)


def contains(name, *needles):
    missing = [n for n in needles if n not in MD]
    check(name, not missing, f"missing: {missing}" if missing else "")


def absent(name, *needles):
    present = [n for n in needles if n in MD]
    check(name, not present, f"STALE strings present: {present}" if present else "")


# ---------------- closed-form recomputation --------------------------------
mt_kg = (1.549 * 1.55 * 12.5 - 52 * 0.465 * 0.232 * 1.55) * 1e-9 * 7400.0
fd_n = 5 * G * mt_kg
rc = 1.72e-8 * 0.063 / (math.pi * 25e-6**2)
i_inf = 1.0 / rc
check("Mt = 0.1577 g", abs(mt_kg * 1e3 - 0.1577) < 5e-4, f"{mt_kg*1e3:.4f}")
contains("Mt in report", "0.1577 g")
check("Fd = 7.735 mN", abs(fd_n * 1e3 - 7.735) < 0.01, f"{fd_n*1e3:.3f}")
contains("Fd in report", "7.73 mN")
check("Wm arithmetic", abs((1.704 - 1.549) / 2 - 0.0775) < 1e-9)
contains("Wm in report", "77.5 µm")
check("loop closure 2.634", abs(2 * 0.465 + 2 * 0.0775 + 1.549 - 2.634) < 1e-9)
check("stator extent 4.228", abs(3 * 1.16 + 2 * 0.374 - 4.228) < 1e-9)
check("stroke 8.27", abs(12.5 - 4.228 - 8.272) < 1e-3)
contains("stroke in report", "8.27 mm")
check("Rc = 0.552", abs(rc - 0.552) < 0.002, f"{rc:.4f}")
contains("Rc in report", "0.552 Ω")
check("I_inf = 1.81", abs(i_inf - 1.812) < 0.005, f"{i_inf:.3f}")
check("MMF ceiling 36.2", abs(20 * i_inf - 36.2) < 0.2)
check("V at 3.35 A = 1.85", abs(3.35 * rc - 1.85) < 0.01)
check("J at 3.35 A ≈ 1706 A/mm²", abs(3.35 / (math.pi * 0.025**2) - 1706) < 10)
e18 = 1.8**2 * rc * 1.5e-3
e335 = 3.35**2 * rc * 1.5e-3
m_cu = 8960 * math.pi * 25e-6**2 * 0.063
check("E(1.8A,1.5ms) = 2.68 mJ", abs(e18 * 1e3 - 2.68) < 0.03, f"{e18*1e3:.2f}")
check("dT(1.8A) ≈ 6.3 K", abs(e18 / (m_cu * 385) - 6.3) < 0.3)
check("E(3.35A,1.5ms) ≈ 9.3 mJ", abs(e335 * 1e3 - 9.3) < 0.2, f"{e335*1e3:.2f}")
check("dT(3.35A) ≈ 22 K", abs(e335 / (m_cu * 385) - 21.9) < 1.0)
contains("22 K in report", "22 K")
for f_ghz, deg in ((50, 18.61), (80, 29.78), (160, 59.56)):
    lam = 299.792458 / f_ghz
    val = math.degrees(4 * math.pi * 0.155 / lam)
    check(f"phase @{f_ghz} GHz = {deg}°", abs(val - deg) < 0.05, f"{val:.2f}")
check("offset 0.142", abs((1.16 + 0.374) - 3 * 0.464 - 0.142) < 1e-9)
check("exact spacing 386.7 (p464)", abs(3 * 0.464 + 0.464 / 3 - 1.16 - 0.3867) < 5e-4)
contains("386.7 in report", "386.7 µm")
check("Hc = 985 kA/m", abs(1.30 / (MU0 * 1.05) / 1e3 - 985) < 3)
check("envelope 4.50 mm²", abs(1.708 * 2.634 - 4.499) < 0.005)
check("ring freq ≈ 179 Hz", abs(math.sqrt(200 / mt_kg) / (2 * math.pi) - 179) < 4)
tau_fe = 0.6e-6 / rc
check("tau(FE 0.6µH) = 1.09 µs", abs(tau_fe * 1e6 - 1.087) < 0.02)
t14 = -tau_fe * math.log(1 - 1.4 / i_inf) * 1e6
check("t(1.4A) ≈ 1.6 µs (FE L)", abs(t14 - 1.61) < 0.1, f"{t14:.2f}")

# ---------------- artefact cross-checks ------------------------------------
fx = json.load(open(os.path.join(OUT, "fixed-design.json")))
check("Pm* artefact ≈ 243 µm", abs(fx["pm_mm"] * 1e3 - 243) < 2, f"{fx['pm_mm']*1e3:.1f}")
contains("Pm* in report", "243 µm")
check("breakaway artefact 7.72", abs(fx["breakaway_mn"] - 7.72) < 0.05)
check("Ic* artefact 3.35", abs(fx["ic_a"] - 3.352) < 0.01)
contains("Ic* in report", "3.35 A")
check("peak artefact 15.4", abs(fx["drive_peak_mn"] - 15.4) < 0.3)
check("stall artefact 4.7", abs(fx["stall_min_mn"] - 4.7) < 0.2)
check("Lc artefact 0.60", abs(fx["lc_uh"] - 0.60) < 0.05)
sw = json.load(open(os.path.join(OUT, "pm-ic-sweeps.json")))
b_pm = {r["pm_mm"]: r["breakaway_mn"] for r in sw["baseline"]["pm_sweep"]}
check("baseline 0.47 @ Pm 0.30", abs(b_pm[0.30] - 0.47) < 0.02, f"{b_pm[0.30]:.3f}")
check("baseline 0.52 @ Pm 0.45", abs(b_pm[0.45] - 0.52) < 0.02, f"{b_pm[0.45]:.3f}")
ratio15 = fd_n * 1e3 / b_pm[0.45]
check("×15 ratio", 14.0 <= ratio15 <= 16.0, f"{ratio15:.1f}")
b_ic = {r["ic_a"]: r["peak_mn"] for r in sw["baseline"]["ic_sweep"]}
check("baseline drive ≈2.5 @ 8 A", abs(b_ic[8.0] - 2.5) < 0.15, f"{b_ic[8.0]:.2f}")
ratio6 = 2 * fd_n * 1e3 / b_ic[8.0]
check("×6 ratio", 5.5 <= ratio6 <= 6.8, f"{ratio6:.1f}")
alt = json.load(open(os.path.join(OUT, "fix-alternatives.json")))
steps = alt["fixed_steps_um"]
check("steps 172.6/146.1/145.3", all(abs(a - b) < 0.3 for a, b in
      zip(sorted(steps, reverse=True), [172.6, 146.1, 145.3])),
      f"{[f'{s:.1f}' for s in steps]}")
contains("steps in report", "172.6")
jit = max(abs(s - 464.3 / 3) for s in steps)
check("jitter ±3.4° @80 GHz", abs(29.78 * jit / (464.3 / 3) - 3.4) < 0.3)
gap40 = alt["alt_gap40_deep_bridge15"]
check("alt fix rejected (≤4.3 mN, 1 basin)",
      max(v[0] for v in gap40.values()) < 4.5 and all(v[1] == 1 for v in gap40.values()))

f3 = json.load(open(os.path.join(OUT, "f3-registration-check.json")))
check("F3 detent 5.95 @ Pm 0.243 (exact thirds)", abs(f3["0.243"][0] - 5.95) < 0.1,
      f"{f3['0.243'][0]:.3f}")
check("F3 basins = 3 at all Pm", all(v[1] == 3 for v in f3.values()))
contains("F3 trade in report", "5.95 mN")

# ---------------- stale-string blacklist -----------------------------------
absent("no retired numbers", "400 A-turns", "×8 short", "7.92 mm",
       "not the force amplitudes",
       "0.151/0.162/0.151", "±1.4°", "4–7× below", "×16 however",
       "FE-proven fixes", "steps 173/146/145; Tony CAD reads 400 µm — reconcile)")
absent("no old title", "(v3)")

# ---------------- blender model constants ----------------------------------
bl = open(os.path.join(HERE, "blender_actuator.py")).read()
for pat, want in ((r"^SPACING = ([0-9.]+)", 0.374), (r"^G = ([0-9.]+)", 0.020),
                  (r"BR_AX, BR_TR = ([0-9.]+),", 0.348), (r"^PM_L = ([0-9.]+)", 0.243)):
    m = re.search(pat, bl, re.M)
    check(f"blender {pat.split('=')[0].strip('^ (r')} = {want}",
          m is not None and abs(float(m.group(1)) - want) < 1e-6,
          m.group(1) if m else "not found")

n_pass = MD.count("")  # noqa - summary below
print(f"\n{'ALL GREEN' if not FAILS else 'FAILURES: ' + str(FAILS)}")
sys.exit(1 if FAILS else 0)
