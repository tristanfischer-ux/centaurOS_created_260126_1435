#!/usr/bin/env python3
"""DEC-EM-1 speed/stack options scored against the CORRECTED loss and thermal chain.

⭐⭐ WHY (Bar A 4, 2026-08-03). The combined-case options were measured and ranked
BEFORE two things were known:
  · iron loss was 45x understated (135.56 W -> 6035 W from the real M400-50A), and
  · the coupled thermal screen omitted conduction, reading 76 K optimistic.
So the existing ranking — "24,000 rpm / 130 mm is the best option at FoS 1.740" —
was chosen on a loss model that could not see what speed costs.

It costs a lot. Iron loss splits ~15% hysteresis (goes as f) and ~85% EDDY (goes
as f-SQUARED) on this deck at 1300 Hz. Raising to 27,000 rpm multiplies the eddy
term by 1.917 and the hysteresis by 1.385 — and a longer stack adds mass, which
scales the whole thing again. A speed/stack option that closes the TORQUE gap can
therefore open a THERMAL one, which is exactly the trade DEC-EM-1 has to make.

This scores every option on all four axes at once: torque ratio, rotor FoS, the
iron loss it implies, and the magnet temperature that follows. Deterministic —
pure arithmetic over measured inputs, no model, no tuned constant.

⚠ TORQUE RATIO AND FoS ARE MEASURED INPUTS, carried from the FE and CalculiX
sweeps. This module does NOT re-solve them; it re-scores the thermal consequence
that those sweeps never saw. Magnet temperature inherits the same open duty
question as everything else (Bar A 0), so it is reported at BOTH duty readings.

Usage:
    dec_em1_option_screen.py --twin <dir>
    dec_em1_option_screen.py --selftest
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

POLE_PAIRS = 4          # 8-pole machine: f_elec = rpm/60 * 4

# MEASURED options — torque ratio from the 37-position FE sweep at each geometry,
# rotor FoS from the CalculiX speed sweep. Not re-derived here.
OPTIONS = (
    # label,                       rpm,    stack_mm, torque_ratio, rotor_fos
    ("baseline 19,500 / 98.3",     19500.0, 98.33,   0.651,        2.635),
    ("24,000 / 120",               24000.0, 120.0,   0.987,        1.740),
    ("24,000 / 130",               24000.0, 130.0,   1.069,        1.740),
    ("27,000 / 110",               27000.0, 110.0,   1.018,        1.374),
    ("27,000 / 120",               27000.0, 120.0,   1.110,        1.374),
    ("30,000 / 97.6 (no change)",  30000.0, 97.6,    1.002,        1.113),
)


def _q(state: dict, key: str):
    q = ((state.get("orchestratorContract") or {}).get("quantities") or {})
    v = q.get(key)
    if isinstance(v, dict):
        v = v.get("value")
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def evaluate(state: dict) -> dict | None:
    from machine_lamination import lamination_from_grade, steinmetz_from_lamination

    grade = "M400-50A"
    gq = ((state.get("orchestratorContract") or {}).get("quantities") or {}).get(
        "lamination_grade")
    if isinstance(gq, dict) and gq.get("value"):
        grade = str(gq["value"])
    co = steinmetz_from_lamination(lamination_from_grade(grade))
    kh, ke, alpha = co.steinmetz_kh, co.steinmetz_ke, co.steinmetz_alpha

    tooth_b = _q(state, "stator_tooth_flux_t")
    yoke_b = _q(state, "stator_yoke_flux_t")
    iron_mass = _q(state, "stator_iron_mass_kg")
    base_stack = _q(state, "stack_length_mm")
    copper = _q(state, "mgu_copper_loss_w")
    limit = _q(state, "magnet_temp_limit_c") or 150.0
    inlet = _q(state, "coolant_inlet_c") or 60.0
    flow = _q(state, "coolant_flow_l_min")
    cp = _q(state, "coolant_cp_j_kgk") or 3503.0
    rho = _q(state, "coolant_density_kg_m3") or 1040.0
    inv = (_q(state, "inverter_dissipated_kw") or 0.0) * 1000.0
    r_wc = _q(state, "thermal_resistance_winding_to_coolant_k_per_w") or 0.01
    if None in (tooth_b, yoke_b, iron_mass, base_stack, copper) or not flow:
        return None
    regen, motoring = _q(state, "duty_regen_time_s"), _q(state, "duty_motoring_time_s")
    duty_vig = (regen / (regen + motoring)) if (regen and motoring) else None
    mdot = flow / 60000.0 * rho

    # Split the measured base mass between teeth and yoke in the FE deck's ratio.
    tooth_frac = 2.9595 / (2.9595 + 3.6623)
    rows = []
    for label, rpm, stack, ratio, fos in OPTIONS:
        f = rpm / 60.0 * POLE_PAIRS
        m_scale = stack / base_stack           # iron mass scales with active stack
        m_t = iron_mass * tooth_frac * m_scale
        m_y = iron_mass * (1.0 - tooth_frac) * m_scale
        iron = ((kh * f * tooth_b ** alpha + ke * f ** 2 * tooth_b ** 2) * m_t
                + (kh * f * yoke_b ** alpha + ke * f ** 2 * yoke_b ** 2) * m_y)
        q_machine = iron + copper
        q_total = q_machine + inv
        t_out = inlet + q_total / (mdot * cp)
        t_mag = t_out + q_machine * r_wc
        row = {
            "option": label, "rpm": rpm, "stack_mm": stack,
            "electrical_hz": round(f, 1),
            "torque_ratio": ratio, "rotor_fos": fos,
            "iron_loss_w": round(iron, 1),
            "machine_loss_w": round(q_machine, 1),
            "magnet_c_continuous": round(t_mag, 1),
            "magnet_margin_k_continuous": round(limit - t_mag, 1),
            "torque_ok": ratio >= 1.0,
            "fos_ok": fos >= 1.5,          # screening FoS floor; release FoS is Bar B
            "thermal_ok_continuous": t_mag <= limit,
        }
        if duty_vig:
            qm_v = q_machine * duty_vig
            t_out_v = inlet + (q_total * duty_vig) / (mdot * cp)
            t_mag_v = t_out_v + qm_v * r_wc
            row["magnet_c_vignette"] = round(t_mag_v, 1)
            row["thermal_ok_vignette"] = t_mag_v <= limit
        row["clears_all_continuous"] = (row["torque_ok"] and row["fos_ok"]
                                        and row["thermal_ok_continuous"])
        rows.append(row)
    winners = [r for r in rows if r["clears_all_continuous"]]
    return {
        "schema": "forgeos.machine.dec_em1_option_screen/v1",
        "lamination_grade": grade,
        "duty_vignette_fraction": round(duty_vig, 4) if duty_vig else None,
        "options": rows,
        "clears_all_on_continuous_duty": [r["option"] for r in winners],
        "verdict": ("NO OPTION clears torque + FoS + thermal on a CONTINUOUS duty"
                    if not winners else
                    f"{len(winners)} option(s) clear on a continuous duty"),
        "caveat": ("Torque ratio and rotor FoS are MEASURED inputs from the FE and "
                   "CalculiX sweeps and are not re-solved here. The thermal column "
                   "is the new information: it uses the corrected M400-50A iron "
                   "loss, which those sweeps never saw. Magnet temperature inherits "
                   "the open duty question (Bar A 0) and is shown at both readings. "
                   "FoS floor 1.5 is a SCREENING bar; release FoS is Bar B."),
    }


def _selftest() -> int:
    fails: list[str] = []

    def ck(name, ok, detail=""):
        if not ok:
            fails.append(f"{name}: {detail}")

    st = {"orchestratorContract": {"quantities": {k: {"value": v} for k, v in dict(
        stator_tooth_flux_t=1.7994, stator_yoke_flux_t=2.1036,
        stator_iron_mass_kg=6.6218, stack_length_mm=98.33,
        mgu_copper_loss_w=2180.49, magnet_temp_limit_c=150, coolant_inlet_c=60,
        coolant_flow_l_min=12, coolant_cp_j_kgk=3503, coolant_density_kg_m3=1040.49,
        inverter_dissipated_kw=4.318, duty_regen_time_s=24,
        duty_motoring_time_s=76).items()}}}
    r = evaluate(st)
    ck("built", r is not None and len(r["options"]) == len(OPTIONS), "option grid missing")

    base = r["options"][0]
    ck("baseline_reproduces_measured_iron_loss", abs(base["iron_loss_w"] - 6035.0) < 60.0,
       f"baseline iron loss {base['iron_loss_w']} should reproduce the measured 6035 W")

    # ⭐⭐ proveCatch: SPEED MUST COST. Eddy loss goes as f^2, so a faster option
    # at the SAME stack must show HIGHER iron loss. If this ever inverts, the
    # frequency scaling has been dropped and the whole screen is decorative.
    o24 = next(x for x in r["options"] if x["rpm"] == 24000 and x["stack_mm"] == 120)
    o27 = next(x for x in r["options"] if x["rpm"] == 27000 and x["stack_mm"] == 120)
    ck("speed_costs_iron_loss", o27["iron_loss_w"] > o24["iron_loss_w"] * 1.1,
       f"27k ({o27['iron_loss_w']} W) must exceed 24k ({o24['iron_loss_w']} W) at one stack")

    # ⭐ proveCatch: a longer stack at ONE speed must also cost more.
    a, b = (next(x for x in r["options"] if x["rpm"] == 24000 and x["stack_mm"] == s)
            for s in (120.0, 130.0))
    ck("stack_costs_iron_loss", b["iron_loss_w"] > a["iron_loss_w"],
       "a longer stack must raise iron loss (more mass)")

    ck("absent_inputs_abstain", evaluate({}) is None, "empty state produced options")

    for f in fails:
        print(f"  FAIL {f}")
    print("dec_em1_option_screen selftest: OK" if not fails
          else f"FAIL dec_em1_option_screen selftest ({len(fails)} failures)")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin required")
    state = json.loads((args.twin / "state.json").read_text())
    r = evaluate(state)
    if r is None:
        print("[dec-em1] inputs unavailable — nothing computed")
        return 0
    vig = r["duty_vignette_fraction"]
    print(f"[dec-em1] options scored on the CORRECTED {r['lamination_grade']} loss\n")
    hdr = (f"  {'option':<28}{'Hz':>6}{'T/Treq':>8}{'FoS':>7}{'iron W':>9}"
           f"{'magnet C':>10}{'margin':>8}")
    if vig:
        hdr += f"{'  magnet C @' + format(vig, '.0%'):>16}"
    print(hdr)
    for o in r["options"]:
        mark = "  <= clears all" if o["clears_all_continuous"] else ""
        line = (f"  {o['option']:<28}{o['electrical_hz']:>6.0f}{o['torque_ratio']:>8.3f}"
                f"{o['rotor_fos']:>7.3f}{o['iron_loss_w']:>9.0f}"
                f"{o['magnet_c_continuous']:>10.1f}{o['magnet_margin_k_continuous']:>8.1f}")
        if vig:
            line += f"{o.get('magnet_c_vignette', 0):>16.1f}"
        print(line + mark)
    print(f"\n  VERDICT: {r['verdict']}")
    (args.twin / "_motor_stack" / "dec_em1_option_screen.json").write_text(
        json.dumps(r, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
