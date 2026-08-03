#!/usr/bin/env python3
"""Does the magnet breach — and under WHICH assumptions? A deterministic grid.

⭐⭐ WHY (Bar A items 2 and 3, 2026-08-03). The dossier reports a magnet breach:
159.35 C against a 150 C limit, a 9.3 K miss. But that single number sits on TWO
unresolved assumptions, and each moves the answer by more than the breach itself:

  DUTY BASIS (Bar A 0). The contract rates 250 kW as `basis=continuous` while its
  own vignette runs 24 s regen in 100 s — a 24% duty. Worth ~60 K.

  IRON LOSS (Bar A 2). 6035 W is a SCREENING ESTIMATE, not a bound: the Steinmetz
  fit over-predicts above saturation (-25 to -40% on hysteresis) while missing
  PWM/slotting harmonics (+30 to +70%), yoke rotational flux (+20 to +50%) and a
  build factor (x1.4 to x1.8) all push the other way. Range ~3.9 to ~8.5 kW.

Reporting "the magnets breach by 9.3 K" as a fact overstates what is known. So
does reporting "it depends" and stopping. This module computes the margin at
every corner of the grid, so the reader sees WHICH assumption decides it and by
how much — and so the ask to Jack is a number, not a worry.

DETERMINISTIC: pure arithmetic over the twin's own quantities. No model, no
tuned constant, same answer every run.

⚠ It does NOT pick a duty or a loss figure. Both are genuinely open, and adopting
either to make the grid resolve would be the fabrication this whole campaign has
been correcting.

Usage:
    magnet_margin_sensitivity.py --twin <dir>
    magnet_margin_sensitivity.py --selftest
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Iron-loss corners, from the council's term-by-term decomposition. Named, not
# tuned: each is the stated direction of a physical effect, not a fitted number.
IRON_LOSS_CORNERS = (
    ("low  (saturation roll-off dominates)", 0.65),
    ("mid  (as computed)", 1.00),
    ("high (harmonics + rotational + build factor)", 1.40),
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


def _decided_by(rows: list, duty_vignette) -> str:
    """Name the assumption(s) that actually gate the breach."""
    cont = [r for r in rows if r["duty"].startswith("continuous")]
    vign = [r for r in rows if not r["duty"].startswith("continuous")]
    if not any(r["breach"] for r in rows):
        return "neither — no case breaches"
    if all(r["breach"] for r in rows):
        return "neither — every case breaches"
    duty_clears = bool(vign) and not any(r["breach"] for r in vign)
    loss_clears = bool(cont) and not cont[0]["breach"]
    if duty_clears and loss_clears:
        return ("BOTH must hold — the breach needs a continuous duty AND at least "
                "the mid iron-loss figure; either assumption alone clears it")
    if duty_clears:
        return "duty basis"
    if loss_clears:
        return "iron-loss figure"
    return "both"


def evaluate(state: dict) -> dict | None:
    iron = _q(state, "mgu_iron_loss_w")
    copper = _q(state, "mgu_copper_loss_w")
    limit = _q(state, "magnet_temp_limit_c") or 150.0
    inlet = _q(state, "coolant_inlet_c") or 60.0
    r_wc = _q(state, "thermal_resistance_winding_to_coolant_k_per_w") or 0.01
    flow_lpm = _q(state, "coolant_flow_l_min")
    cp = _q(state, "coolant_cp_j_kgk") or 3503.0
    rho = _q(state, "coolant_density_kg_m3") or 1040.0
    inv = (_q(state, "inverter_dissipated_kw") or 0.0) * 1000.0
    if iron is None or copper is None or not flow_lpm:
        return None
    regen = _q(state, "duty_regen_time_s")
    motoring = _q(state, "duty_motoring_time_s")
    duty_vignette = (regen / (regen + motoring)) if (regen and motoring) else None

    mdot = flow_lpm / 60000.0 * rho          # kg/s
    rows = []
    for duty_label, duty in (("continuous (as screened)", 1.0),
                             *([(f"vignette {duty_vignette:.0%} duty", duty_vignette)]
                               if duty_vignette else [])):
        for corner_label, factor in IRON_LOSS_CORNERS:
            q_machine = (iron * factor + copper) * duty
            q_total = q_machine + inv * duty
            # coolant leaves warmer as total heat rises
            rise = q_total / (mdot * cp) if mdot > 0 else 0.0
            t_coolant_out = inlet + rise
            t_magnet = t_coolant_out + q_machine * r_wc
            rows.append({
                "duty": duty_label,
                "iron_loss_corner": corner_label,
                "iron_loss_w": round(iron * factor, 1),
                "machine_loss_w": round(q_machine, 1),
                "coolant_out_c": round(t_coolant_out, 1),
                "magnet_c": round(t_magnet, 1),
                "margin_k": round(limit - t_magnet, 1),
                "breach": t_magnet > limit,
            })
    breaches = [r for r in rows if r["breach"]]
    return {
        "schema": "forgeos.machine.magnet_margin_sensitivity/v1",
        "magnet_limit_c": limit,
        "rows": rows,
        "breach_count": len(breaches),
        "total_cases": len(rows),
        "verdict": ("BREACHES IN EVERY CASE" if len(breaches) == len(rows)
                    else "NO BREACH IN ANY CASE" if not breaches
                    else "CONDITIONAL — the open assumptions decide it"),
        # Which open assumption actually decides it: if flipping ONE of them
        # clears every case, that one is the lever; if both must hold for the
        # breach to occur, say so rather than implying a single culprit.
        "decided_by": _decided_by(rows, duty_vignette),
        "caveat": ("Neither the duty basis nor the iron-loss figure is resolved. "
                   "This grid does NOT pick one — it shows which one decides the "
                   "answer, so the ask can be a number rather than a worry."),
    }


def _selftest() -> int:
    fails: list[str] = []

    def ck(name, ok, detail=""):
        if not ok:
            fails.append(f"{name}: {detail}")

    def st(**kw):
        return {"orchestratorContract": {"quantities":
                {k: {"value": v} for k, v in kw.items()}}}

    base = dict(mgu_iron_loss_w=6035.1, mgu_copper_loss_w=2180.49,
                magnet_temp_limit_c=150, coolant_inlet_c=60, coolant_flow_l_min=12,
                coolant_cp_j_kgk=3503, coolant_density_kg_m3=1040.49,
                inverter_dissipated_kw=4.318, duty_regen_time_s=24,
                duty_motoring_time_s=76)
    r = evaluate(st(**base))
    ck("grid_built", r is not None and r["total_cases"] == 6,
       f"expected 6 cases (2 duties x 3 corners), got {r and r['total_cases']}")

    # ⭐ proveCatch: the answer must come out CONDITIONAL on the live numbers —
    # continuous breaches, the vignette does not. If this ever reports a single
    # verdict, an open assumption has been silently adopted.
    ck("live_case_is_conditional", r["verdict"].startswith("CONDITIONAL"),
       f"expected CONDITIONAL, got {r['verdict']!r} — an assumption may have been adopted")
    cont = [x for x in r["rows"] if x["duty"].startswith("continuous")]
    vign = [x for x in r["rows"] if not x["duty"].startswith("continuous")]
    # ⭐ I ASSERTED "continuous breaches at every loss corner" AND THE CODE PROVED
    # ME WRONG (2026-08-03). At the LOW corner (3923 W) continuous duty gives
    # 135.3 C — a +14.7 K margin. So the breach needs BOTH a continuous duty AND
    # at least the mid loss figure; either assumption alone clears it. That is a
    # more useful answer than the one I expected, and it is why the assertion now
    # encodes the measured structure rather than my prior.
    ck("continuous_low_corner_clears", not cont[0]["breach"],
       f"continuous + low iron loss should CLEAR (135.3 C): {cont[0]}")
    ck("continuous_mid_and_high_breach", all(x["breach"] for x in cont[1:]),
       f"continuous + mid/high iron loss should breach: {cont[1:]}")
    ck("vignette_does_not_breach", not any(x["breach"] for x in vign),
       f"the 24% vignette should clear at every loss corner: {vign}")

    # A machine with no duty vignette must not invent one.
    r2 = evaluate(st(**{k: v for k, v in base.items()
                        if k not in ("duty_regen_time_s", "duty_motoring_time_s")}))
    ck("no_vignette_means_continuous_only", r2["total_cases"] == 3,
       f"without a vignette expected 3 cases, got {r2['total_cases']}")
    ck("absent_inputs_abstain", evaluate({}) is None,
       "an empty state produced a sensitivity grid")

    for f in fails:
        print(f"  FAIL {f}")
    print("magnet_margin_sensitivity selftest: OK" if not fails
          else f"FAIL magnet_margin_sensitivity selftest ({len(fails)} failures)")
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
        print("[magnet-margin] inputs unavailable — nothing computed")
        return 0
    print(f"[magnet-margin] limit {r['magnet_limit_c']:g} C — "
          f"{r['breach_count']}/{r['total_cases']} cases breach\n")
    print(f"  {'duty':<26}{'iron loss':<12}{'machine W':>10}{'magnet C':>10}{'margin K':>10}")
    for x in r["rows"]:
        mark = "  BREACH" if x["breach"] else ""
        print(f"  {x['duty']:<26}{x['iron_loss_w']:>9.0f} W {x['machine_loss_w']:>9.0f}"
              f"{x['magnet_c']:>10.1f}{x['margin_k']:>10.1f}{mark}")
    print(f"\n  VERDICT: {r['verdict']}  (decided by: {r['decided_by']})")
    (args.twin / "_motor_stack" / "magnet_margin_sensitivity.json").write_text(
        json.dumps(r, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
