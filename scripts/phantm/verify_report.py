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

tg = json.load(open(os.path.join(OUT, "tony-gap-check.json")))
check("gap100 detent 0.67 mN", abs(tg["gap100_pm0.3"] - 0.673) < 0.03)
check("gap150 detent 0.48 mN", abs(tg["gap150_pm0.3"] - 0.482) < 0.03)
contains("gap ruling in report", "0.43/0.31 g")
contains("ladder in report", "20–30 g")

# ---------------- stale-string blacklist -----------------------------------
absent("no retired numbers", "400 A-turns", "×8 short", "7.92 mm",
       "not the force amplitudes",
       "0.151/0.162/0.151", "±1.4°", "4–7× below", "×16 however",
       "FE-proven fixes", "steps 173/146/145; Tony CAD reads 400 µm — reconcile)")
absent("no old title", "(v3)", "(v3.1", "(v4 — 24 Jul feedback incorporated")
absent("no strikethrough tildes", "~")
# round-3 retractions (Tony 24 Jul 09:00-09:14) — the old claims must never reappear
absent("coil closed-ring claim retired", "nothing can wind",
       "pre-wound, because the loop closes", "closed ring: nothing")
absent("in-situ magnetisation as mandate retired", "**Magnetise in-situ**")
contains("round-3 responses present", "open horseshoe", "monolithic", "Route A",
         "37,000", "flux-diffusion", "magnetise-after-assembly")
absent("no v4.3 title", "(v4.3 — 24 Jul feedback rounds")
# reflector bound: 2x2 mm x 20 um Cu = 0.716 mg < 0.5% of Mt; +2 mg plastic < 2%
m_foil = 8960 * 2e-3 * 2e-3 * 20e-6 * 1e6  # mg
check("reflector foil bound 0.72 mg", abs(m_foil - 0.717) < 0.01, f"{m_foil:.3f}")
check("reflector <2% of Mt", (m_foil + 2.0) / (mt_kg * 1e6) < 0.02,
      f"{(m_foil + 2.0)/(mt_kg*1e6):.3%}")
contains("reflector bound in report", "0.72 mg")

# ---------------- honeycomb (§8.9) -----------------------------------------
# STL forensics: walls at 3.25 mm pitch → 3.10 is the INTERIOR aperture
AF, T_HC, DEP = 3.1, 0.15, 7.75
PITCH = AF + T_HC
check("hex side 1.790", abs(AF / math.sqrt(3) - 1.790) < 2e-3)
check("interior area 8.32", abs(math.sqrt(3) / 2 * AF**2 - 8.32) < 0.01)
check("tiling area 9.15", abs(math.sqrt(3) / 2 * PITCH**2 - 9.15) < 0.01)
check("rel density 0.090", abs(1 - (AF / PITCH) ** 2 - 0.090) < 1e-3)
wall_v = math.sqrt(3) / 2 * (PITCH**2 - AF**2) * DEP
check("wall vol 6.40", abs(wall_v - 6.40) < 0.01)
check("cell mass 7.9 (printed)", abs(wall_v * 1.24 - 7.93) < 0.05)
check("sub-array lattice asymptote 0.190 g @24", abs(24 * wall_v * 1.24 / 1000 - 0.190) < 0.002)
# measured ground truth from Tony's STLs (the artefacts themselves re-measured every run)
try:
    import struct
    import numpy as np

    def _stl_measure(fname):
        raw = open(os.path.join(OUT, fname), "rb").read()
        n = struct.unpack("<I", raw[80:84])[0]
        tris = (np.frombuffer(raw[84:84 + n * 50], dtype=np.uint8).reshape(n, 50)[:, 12:48]
                .copy().view("<f4").reshape(n, 3, 3).astype(float))
        vol = abs(float(np.einsum("ij,ij->i", tris[:, 0],
                                  np.cross(tris[:, 1], tris[:, 2])).sum() / 6.0))
        return vol, float(tris[..., 2].max() - tris[..., 2].min())

    for fname, cells, want_vol, want_edge, want_mass in (
            ("tony-24hex-subarray.stl", 24, 192.25, (1.22, 1.29), 0.238),
            ("tony-7hex-subarray.stl", 7, 64.53, (1.40, 1.48), 0.080)):
        _vol, _depth = _stl_measure(fname)
        check(f"STL {cells}-hex volume {want_vol}", abs(_vol - want_vol) < 0.5, f"{_vol:.2f}")
        check(f"STL {cells}-hex depth 7.75", abs(_depth - 7.75) < 0.01, f"{_depth:.3f}")
        check(f"STL {cells}-hex edge factor", want_edge[0] < _vol / (cells * wall_v) < want_edge[1],
              f"{_vol/(cells*wall_v):.3f}")
        check(f"STL {cells}-hex mass {want_mass} g printed",
              abs(_vol * 1.24 / 1000 - want_mass) < 0.002)
except FileNotFoundError as e:
    check("STL artefacts present", False, str(e))
wfit = (2 * AF - 2.634) / math.sqrt(3)
check("fit width 2.06 ≥ 1.708", abs(wfit - 2.059) < 2e-3 and wfit >= 1.708)
check("no fit @1.9 cell", 2.634 > 1.9)
ssv = 2 * (1.16 * 1.708 * 0.465 - 3 * 0.155 * 0.232 * 1.708)
brv = 0.348 * 1.162 * 2.634
act_mg = mt_kg * 1e6 + 3 * ((ssv + brv) * 7.4 + 0.348 * 1.162 * 0.243 * 7.5 + 1.108)
check("actuator total ≈220 mg", abs(act_mg - 219.7) < 1.5, f"{act_mg:.1f}")
check("sub-array actuators 5.3 g", abs(24 * act_mg / 1000 - 5.27) < 0.1)
contains("§8.9 present", "8.9 Honeycomb", "7.75 mm", "24-hex", "7-hex", "150 µm",
         "2.06 mm", "192.2 mm³", "64.5 mm³", "0.238 g printed", "0.080 g printed",
         "3.10 mm is the INTERIOR")

# ---------------- hex cell (§9) ---------------------------------------------
hx = json.load(open(os.path.join(OUT, "hexcell.json")))
check("hexcell fc 53.56 GHz", abs(hx["cutoff"]["fc_ghz"] - 53.56) < 0.06,
      str(hx["cutoff"]["fc_ghz"]))
check("hexcell λc 5.598 mm", abs(hx["cutoff"]["lam_c_mm"] - 5.598) < 0.006)
check("equiv-circle within 1%", abs(hx["cutoff"]["fc_equiv_circle_ghz"] /
                                    hx["cutoff"]["fc_ghz"] - 1) < 0.01)
bt = {r["f_ghz"]: r for r in hx["band_table"]}
check("50 GHz below cutoff", bt[50]["lamg_mm"] is None)
check("λg @70 = 6.651", abs(bt[70]["lamg_mm"] - 6.651) < 0.01)
check("stroke need @60 = 5.542", abs(bt[60]["stroke_need_mm"] - 5.542) < 0.01)
check("single group covers 60 GHz", bt[60]["stroke_need_mm"] < 8.27)
check("two-group fails 60, passes 70", bt[60]["stroke_need_mm"] > 3.7 > bt[70]["stroke_need_mm"])
check("levels floor @75 = 18", bt[75]["phase_levels_per_2pi"] == 18)
contains("sol round-2 fixes", "57.4–58.0 GHz", "≈67.2", "1.07 V", "0.60 Ω")
check("phase/step @70 = 16.7°", abs(bt[70]["phase_per_ideal_step_deg"] - 16.7) < 0.15)
contains("§9 present", "## 9. The hex-cell wave conformer", "φ = 4π·d/λg",
         "53.56 GHz", "5.598 mm", "≈57 GHz upward", "≥67 GHz", "BELOW CUTOFF",
         "## 10. The optimisation campaign", "## 12. Traceability",
         "## 13. Supplier outreach")

# ---------------- firmware gate: compile + run BOTH configs -----------------
import subprocess as _sp
_fwd = os.path.join(HERE, "firmware")
for _flags, _lab in (([], "unipolar"), (["-DALLOW_DUAL_DRIVE=1"], "dual")):
    _r = _sp.run(["cc", "-std=c99", "-Wall", "-Wextra", "-Werror", "-O2", *_flags,
                  "phantm_fw.c", "test_fw.c", "-o", f"/tmp/phantm_test_{_lab}"],
                 cwd=_fwd, capture_output=True, text=True)
    check(f"firmware compiles ({_lab})", _r.returncode == 0, _r.stderr[-160:] if _r.returncode else "")
    if _r.returncode == 0:
        _t = _sp.run([f"/tmp/phantm_test_{_lab}"], capture_output=True, text=True, timeout=120)
        check(f"firmware tests pass ({_lab})", _t.returncode == 0
              and "ALL FIRMWARE TESTS PASS" in _t.stdout)
contains("§9.5c present", "9.5c Drive electronics implementation",
         "demagnetisation gate is a compile-time flag", "VERIFY",
         "thermally PACED", "atopile")

# ---------------- option ledgers (Tristan 25 Jul: kills on the record) ------
ol = json.load(open(os.path.join(OUT, "opt", "options-ledger.json")))
check("actuator ledger 66 options, 36 kills", ol["counts"].get("KILL") == 36
      and sum(ol["counts"].values()) == 66)
co = json.load(open(os.path.join(OUT, "opt", "cell-options.json")))
po = json.load(open(os.path.join(OUT, "opt", "pcb-options.json")))
check("cell ledger 16 options, 4 kills", sum(co["counts"].values()) == 16
      and co["counts"].get("KILL") == 4)
check("pcb ledger 11 options, 5 kills + open demag gate",
      sum(po["counts"].values()) == 11 and po["counts"].get("KILL") == 5
      and po["counts"].get("OPEN") == 1)
for d_name in ("damper.json", "damper-balanced.json"):
    dj = json.load(open(os.path.join(OUT, "opt", d_name)))
    check(f"{d_name} scheme_table + air spring recorded",
          len(dj.get("scheme_table", [])) == 6
          and abs(dj["k_air_sealed_n_per_m"] - 296) < 2)
# RF-efficacy audit (§9.8): the hole-leak bound recomputed here
import math as _m
_fc_hole = 1.8412 * 299.792458 / (_m.pi * 0.15)
check("vent-hole cutoff 1.17 THz", abs(_fc_hole - 1171) < 5, f"{_fc_hole:.0f} GHz")
check("Bethe leak −58 dB", abs(10 * _m.log10((0.15 / 4.283) ** 4) + 58.3) < 0.5)
contains("§9.8 present", "9.8 The RF-efficacy audit", "INVARIANT — untouched by all 93 options",
         "1.17 THz", "−58 dB", "electromagnetically SILENT",
         "must be SPECIFIED, not assumed")
contains("§10.1b/9.5b/9.7/§11 present", "### 10.1b The complete options ledger",
         "### 9.5b The drive/PCB options ledger", "### 9.7 The hex-cell options ledger",
         "## 11. Making the SYSTEM easy to manufacture",
         "66 actuator/drive/damper options", "36 were killed",
         "MASS-NORMALISED Pareto choice", "FULL H-BRIDGE",
         "demagnetisation FE", "PROTOTYPE-NOW", "EASIEST BUILD")
absent("council5 corrected claims retired",
       "The optimum is ROBUST across both registrations",
       "half the max-force set's step energy",
       "(+7% to 0.7 mm)")

# ---------------- §10 optimisation campaign ---------------------------------
o3 = json.load(open(os.path.join(OUT, "opt", "opt-sweeps-3.json")))
o4 = json.load(open(os.path.join(OUT, "opt", "opt-sweeps-4.json")))
r_bal = next(r for r in o3["rows"] if r["name"] == "win sslot2x")
check("balanced 14.6/11.0 g", abs(r_bal["margin_g_drawn"] - 14.60) < 0.05
      and abs(r_bal["margin_g_exact"] - 10.99) < 0.05)
r_max = next(r for r in o4["rows"] if r["name"] == "d40 stack N52 Pm0.50")
check("max-force 19.1/14.3 g", abs(r_max["margin_g_drawn"] - 19.06) < 0.05
      and abs(r_max["margin_g_exact"] - 14.34) < 0.05)
r_g30 = next(r for r in o3["rows"] if r["name"] == "g30 stack N52")
check("gap-30 11.3/7.7 g, 3 basins", abs(r_g30["margin_g_drawn"] - 11.33) < 0.05
      and r_g30["basins_drawn"] == 3 and r_g30["basins_exact"] == 3)
rc_ = json.load(open(os.path.join(OUT, "opt", "opt-recentre.json")))
v2r = rc_["winners"]["V2-d40-t150-g40-N52"]
check("gap-40 killed (1 basin as-drawn, all Pm)",
      all(r["basins_drawn"] == 1 for r in v2r["pm_rows"]))
dmp = json.load(open(os.path.join(OUT, "opt", "damper.json")))
dmpb = json.load(open(os.path.join(OUT, "opt", "damper-balanced.json")))
check("damper Ø0.15 both sets", dmp["recommended"]["vent"] == "Ø0.15"
      and dmpb["recommended"]["vent"] == "Ø0.15")
check("balanced k 415", abs(dmpb["k_det"] - 415) < 2)
check("max k 544", abs(dmp["k_det"] - 544) < 2)
check("hold ≥3 ms both", dmp["recommended"]["hold_ms"] == 3.0
      and dmpb["recommended"]["hold_ms"] == 3.0)
e_bal = 2 * 3.35**2 * 0.552 * 3e-3 * 1e3
e_max = 2 * 5.0**2 * 0.552 * 3e-3 * 1e3
check("energy 37/83 mJ", abs(e_bal - 37.2) < 0.3 and abs(e_max - 82.8) < 0.3)
contains("§10 content", "BALANCED set is the recommendation", "DUAL ±3.35 A",
         "DUAL ±5 A", "Ø0.15 mm vent", "0.35 mN guide friction",
         "half-bridge per coil", "basin count is", "Goodhart trap")
contains("v5.1 title", "(v5.1 — 25 Jul")
absent("v4.5 title retired", "(v4.5 — 24 Jul")
# U-band prototype scaling: 55 GHz at the production 70-GHz operating point
_ratio = 70.0 / hx["cutoff"]["fc_ghz"]
_fc_p = 55.0 / _ratio
_af_p = 3.10 * hx["cutoff"]["fc_ghz"] / _fc_p
check("proto cell ≈3.95 mm", abs(_af_p - 3.945) < 0.01, f"{_af_p:.3f}")
_l0p, _lcp = 299.792458 / 55.0, 299.792458 / _fc_p
_lgp = _l0p / math.sqrt(1 - (_l0p / _lcp) ** 2)
check("proto λg/2 @55 = 4.23", abs(_lgp / 2 - 4.23) < 0.02, f"{_lgp/2:.3f}")
contains("proto sizing in report", "≈3.95 mm")

# ---------------- §9.5 drive electronics + §9.6 cells ----------------------
de = json.load(open(os.path.join(OUT, "drive-electronics.json")))
p8 = next(r for r in de["parallelism_trade"] if r["parallel_cells"] == 8)
check("8-par FULL pulse 53.6 W", abs(p8["full_drive"]["pulse_w"] - 53.6) < 0.1)
check("8-par STEP pulse 15.4 W", abs(p8["stepping"]["pulse_w"] - 15.4) < 0.1)
check("8-par rail 26.8 A (full)", abs(p8["full_drive"]["rail_a"] - 26.8) < 0.1)
check("tile re-point 0.12 s", abs(p8["tile_repoint_s"] - 0.12) < 0.01)
check("panel energy 29.3 J (step)", abs(de["aperture_10cm"]["energy_j_stepping"] - 29.3) < 0.1)
check("panel energy 101.6 J (full)", abs(de["aperture_10cm"]["energy_j_full"] - 101.6) < 0.2)
check("64-parallel 0.72 s", abs(de["aperture_10cm"]["parallel_64"]["repoint_s"] - 0.72) < 0.01)
check("idle 0 W", de["aperture_10cm"]["idle_w"] == 0.0)
check("unipolar topology recorded", "UNIPOLAR" in de["topology"]["chosen"])
for f_ in ("drawing-D5-cell-integration.png", "drawing-D6-pcb.png",
           "render-3d-hexcell.png", "drive-electronics.json"):
    check(f"artefact {f_} exists", os.path.exists(os.path.join(OUT, f_)))
check("cell aspect ≈52:1", abs(7.75 / 0.15 - 51.7) < 0.1)
check("fc sensitivity 17 MHz/µm", abs(hx["cutoff"]["fc_ghz"] / 3.1 - 17.3) < 0.1)
contains("§9.5 present", "9.5 CAD", "drawing-D5-cell-integration.png", "drawing-D6-pcb.png",
         "render-3d-hexcell.png", "53.6 W pulses", "15.4 W", "29.3 J", "UNIPOLAR",
         "≤5 mΩ", "10 × 10 cm panel", "rail voltage IS the current control")
absent("rejected H-bridge architecture not presented as chosen",
       "so the phase bridges are full-H", "dual select-FET per cell (10–20 mΩ, negligible")
absent("no mixed-regime power claim", "57.6 W burst (26.8 A on the rail) for 0.12 s")
contains("§9.6 present", "9.6 How to make the cells", "17 MHz per µm", "52:1",
         "Thomas Keating", "Vitesse", "SWISSto12", "electroless copper",
         "Annex E", "K.Pike@terahertz.co.uk", "Sales@custommicrowave.com")
absent("no stale cutoff-request", "needs the cell's cutoff to pin down")
absent("old 7-cluster reading retired", "7-cell clusters", "7 × 19")

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
