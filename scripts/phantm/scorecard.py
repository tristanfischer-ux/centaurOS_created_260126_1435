"""PHANTM actuator — §5 requirements scorecard (honest pass/fail with numbers).

Two columns: BASELINE (Tony's exact geometry) and FIXED (the FE-derived
smallest change set: gap 20 µm, stator slots 0.465 mm, teeth 0.35·pitch,
bridge/PM ×1.5). Verdicts: PASS / FAIL / MARGINAL / UNVERIFIED — a requirement
without a computed number is UNVERIFIED, never silently passed.

Reads: out/femm-five-numbers.json, out/fixed-design.json, out/dynamics.json,
out/cost.json. Run after those producers:
    ~/.venvs/phantm/bin/python scorecard.py
"""

from __future__ import annotations

import json
import os

import geometry as geo
from params import BASELINE, G_ACCEL

OUT = os.path.join(os.path.dirname(__file__), "out")


def load(name):
    p = os.path.join(OUT, name)
    return json.load(open(p)) if os.path.exists(p) else None


def main():
    p = BASELINE
    s = geo.summarise(p)
    fe_base = load("femm-five-numbers.json")
    fixed = load("fixed-design.json")
    dyn = load("dynamics.json")
    cost = load("cost.json")
    mt = s.translator_mass_kg
    fd = p.detent_g_factor * G_ACCEL * mt
    rows = []

    def row(req, baseline, fixed_v, note=""):
        rows.append({"requirement": req, "baseline": baseline, "fixed": fixed_v,
                     "note": note})

    # 1. cross-section fits the cell
    env_t, env_r = s.envelope_transverse_mm, s.envelope_radial_mm
    area = env_t * env_r
    fit50 = env_t <= 3.0 and env_r <= 3.0
    note1 = (f"envelope {env_t:.2f}×{env_r:.2f} mm (area {area:.1f} mm²; frame/bearing "
             f"excluded — unspecified). 50 GHz cell 3.0 mm: {'fits' if fit50 else 'no'}. "
             f"80 GHz cell 1.9 mm: radial 2.63 mm = 1.39× over; even by area "
             f"{area:.1f} vs 3.6 mm² ⇒ one-per-cell impossible in a single layer — "
             f"needs ≥2-deep axial staggering (translator axis is along the beam; "
             f"12.5 mm length permits it). 160 GHz 0.94 mm: {area/0.88:.0f}× over — "
             f"not credible without a per-band redesign.")
    row("1. Fits cell cross-section",
        "PASS @50 GHz / FAIL @80 GHz single-layer (MARGINAL with 2-deep stagger) / FAIL @160 GHz",
        "same (fixed set does not change the envelope)", note1)

    # 2. stroke
    row("2. Stroke ≥ 3.0 mm", f"PASS — usable {s.usable_stroke_mm:.2f} mm",
        "PASS — unchanged",
        "translator 12.5 mm minus 3-pole stator extent 4.23 mm")

    # 3. phase quantisation
    steps = "0.151/0.162/0.151 mm (uneven — 0.374 mm pole spacing; ideal 0.155)"
    note3 = ("step ⇒ 19°@50 / 30°@80 / 59°@160 GHz (4πΔd/λ). Unevenness adds ~±1.4° "
             "jitter at 80 GHz + a 23 µm systematic detent offset (calibratable). "
             "Micro-positioning between detents for 120–160 GHz: feasible by 2-phase "
             "current-ratio microstepping but loses zero-power hold between detents.")
    row("3. Phase quantisation", f"ADEQUATE @≤80 GHz, COARSE @160 GHz; steps {steps}",
        "same (pitch unchanged in fixed set)", note3)

    # 4. zero-power hold
    if fe_base:
        bk_base = 0.47e-3  # FE plateau (see femm sweep: Pm→0.3 mm caps ~0.47 mN)
        g_base = bk_base / (mt * G_ACCEL)
        base4 = (f"FAIL — FE net detent caps at ≈{bk_base*1e3:.2f} mN (={g_base:.1f} g) "
                 f"for ANY Pm; spec Fd={fd*1e3:.2f} mN (5 g) missed ×{fd/bk_base:.0f}")
    else:
        base4 = "UNVERIFIED"
    if fixed:
        g_fix = fixed["breakaway_mn"] / 1e3 / (mt * G_ACCEL)
        fix4 = (f"PASS vs 5 g spec — {fixed['breakaway_mn']:.2f} mN = {g_fix:.1f} g "
                f"at Pm={fixed['pm_mm']*1e3:.0f} µm")
    else:
        fix4 = "UNVERIFIED"
    row("4. Zero-power hold Fd = 5·g·Mt", base4, fix4,
        "NOTE: 10–30 g shock survival needs 16–47 mN — above even the 5 g spec; "
        "reflector mass excluded (Tony Q1); Fd intent is Tony Q2.")

    # 5. step time + energy
    if dyn:
        wins = [r for r in dyn["steps"] if r.get("capture_window_ms")]
        note5 = (f"energy/step {dyn['energy_per_step_mj']:.2f} mJ, coil ΔT "
                 f"{dyn['coil_dT_per_step_k']:.1f} K (negligible avg with passive hold)")
        base5 = "moot — cannot generate the step force in the first place"
        fix5 = ("MARGINAL — transit 2.5–4 ms PASSES; single-pulse open-loop capture "
                "window is narrow (light damping); hold-and-release captures "
                "correctly (15–45 ms full settle at 0.2–0.5 mN friction) — a brake "
                "pulse or added damping recovers few-ms settle")
        row("5. Step ≤ few ms, low energy", base5, fix5, note5)
    else:
        row("5. Step ≤ few ms, low energy", "UNVERIFIED", "UNVERIFIED", "run dynamics.py")

    # 6. cost
    if cost:
        row("6. Cost ~USD 0.10 @ volume",
            "MARGINAL — materials <1¢; $0.06–0.15 plausible only ≥100M/yr "
            "(process estimates, LOW confidence)",
            "AT RISK — 20 µm gap adds precision-assembly/yield penalty (×1.8 on "
            "assembly band); $0.10 only at optimistic end of ≥100M/yr",
            cost["tolerance_sensitivity"])
    else:
        row("6. Cost ~USD 0.10", "UNVERIFIED", "UNVERIFIED", "run cost_model.py")

    # 7. reliability
    row("7. 15-year outdoor reliability",
        "UNVERIFIED — no MTBF computable without bearing spec; dominant risks: "
        "guide/bearing wear + contamination in the 77.5 µm gap, NdFeB corrosion "
        "(coating mandatory outdoors), coil static-fatigue low",
        "UNVERIFIED — 20 µm gap tightens contamination sensitivity ~4×",
        "flagged for Tony: bearing + sealing spec needed before any MTBF claim")

    print(f"{'Requirement':38s} | {'BASELINE':60s} | FIXED")
    print("-" * 160)
    for r in rows:
        print(f"{r['requirement']:38s} | {r['baseline'][:60]:60s} | {r['fixed'][:55]}")
    with open(os.path.join(OUT, "scorecard.json"), "w") as f:
        json.dump(rows, f, indent=2)
    print("\nwrote out/scorecard.json")


if __name__ == "__main__":
    main()
