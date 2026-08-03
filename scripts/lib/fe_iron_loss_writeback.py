#!/usr/bin/env python3
"""Iron loss from the machine's REAL lamination and its OWN measured flux.

⭐⭐ WHY (Tristan 2026-08-03: "fix the iron loss so it uses the real lamination").

The contract carried `mgu_iron_loss_w = 135.56 W`. Three separate things were
wrong with how that number was produced, and each on its own would have been
enough to make it meaningless:

  1. THE STEEL WAS INVENTED. The class plan passed `steinmetz_ke: 1e-7`, which
     corresponds to no real electrical steel. The machine's own FE deck records
     its material as Pyleecan IPMSM_B **M400-50A**, whose eddy coefficient
     derives to 1.169e-4 W/(kg·Hz²·T²) from the grade's 0.50 mm gauge (the "50"
     in the designation), resistivity and density — 1169x larger.
  2. THE MASS WAS GENERIC. The plan passed a flat 3.0 kg against the twin's
     measured 6.62 kg of stator iron (2.96 kg teeth + 3.66 kg yoke).
  3. THE FLUX WAS A PLACEHOLDER, AND LUMPED. `motor:loss-point` takes ONE
     `iron_b_t`, defaulting to 1.2 T. The deck probed teeth at 1.799 T and yoke
     at 2.104 T. A single figure cannot carry both — and the yoke is BOTH the
     higher-flux AND the heavier region, so lumping understates the dominant
     term twice over.

Result: 135.56 W, which is 6.2% of the 2180 W copper loss at 1300 Hz. That is
not physical. It inflated machine efficiency to 99.018% — above any vehicle
IPMSM — and, because the cooling screen sizes on this number, it under-sized the
coolant. One invented constant, three wrong answers downstream.

This module computes the loss from artefacts the twin ALREADY HAS
(`_motor_stack/stator_iron_mass.json`, `_motor_stack/stator_iron_b*.json`) using
the registered lamination grade, keeping teeth and yoke separate. Deterministic:
same inputs, same answer, no model in the path.

⚠ THE ANSWER IS AN UPPER BOUND, NOT A MEASUREMENT. The Steinmetz form is fitted
below saturation; this yoke sits at ~2.10 T, outside that fit, where the real
material curve rolls off. The figure is reported as `basis: bound` with that
stated, because a bound honestly labelled is useful and a bound presented as a
measurement is not. What is MEASURED is the FLUX; the LOSS is modelled from it.

Usage:
    fe_iron_loss_writeback.py --twin <dir> [--write]
    fe_iron_loss_writeback.py --selftest
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

DEFAULT_GRADE = "M400-50A"


def _load(twin: Path, name: str):
    p = twin / "_motor_stack" / name
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except Exception:  # noqa: BLE001
        return None


def _pick_flux(twin: Path) -> tuple:
    """(tooth_T, yoke_T, source) — prefer the REBALANCED probe, else the baseline.

    Peak, not mean: hysteresis and eddy loss are driven by the peak excursion the
    material actually sees, and using the mean would quietly shave the answer.
    """
    for name in ("stator_iron_b_REBALANCED.json", "stator_iron_b.json"):
        d = _load(twin, name)
        if not isinstance(d, dict):
            continue
        t = d.get("tooth_b_peak_t")
        y = d.get("yoke_b_peak_t")
        if t and y:
            return (float(t), float(y), name)
    return (None, None, None)


def compute(twin: Path, grade: str = DEFAULT_GRADE, freq_hz: float | None = None) -> dict | None:
    from machine_lamination import lamination_from_grade, steinmetz_from_lamination
    from machine_loss_bounds import stator_iron_loss

    mass = _load(twin, "stator_iron_mass.json")
    tooth_t, yoke_t, flux_src = _pick_flux(twin)
    if not isinstance(mass, dict) or tooth_t is None:
        return None
    tooth_kg = float(mass.get("tooth_mass_kg") or 0.0)
    yoke_kg = float(mass.get("yoke_mass_kg") or 0.0)
    if tooth_kg <= 0 or yoke_kg <= 0:
        return None

    if freq_hz is None:
        try:
            state = json.loads((twin / "state.json").read_text())
            q = ((state.get("orchestratorContract") or {}).get("quantities") or {})

            def qv(k):
                v = q.get(k)
                v = v.get("value") if isinstance(v, dict) else v
                try:
                    return float(v)
                except (TypeError, ValueError):
                    return None
            rpm = qv("max_rotor_speed_rpm") or qv("mgu_base_speed_rpm")
            poles = qv("pole_count") or qv("mgu_pole_count") or 8.0
            freq_hz = (rpm / 60.0) * (poles / 2.0) if rpm else None
        except Exception:  # noqa: BLE001
            freq_hz = None
    if not freq_hz:
        return None

    spec = lamination_from_grade(grade)
    co = steinmetz_from_lamination(spec)
    loss = stator_iron_loss(
        tooth_flux_t=tooth_t, tooth_mass_kg=tooth_kg,
        yoke_flux_t=yoke_t, yoke_mass_kg=yoke_kg,
        electrical_frequency_hz=freq_hz,
        steinmetz_kh=co.steinmetz_kh, steinmetz_ke=co.steinmetz_ke,
        steinmetz_alpha=co.steinmetz_alpha)

    # Honest bound flag: the Steinmetz fit does not extend into saturation.
    above_fit = max(tooth_t, yoke_t) > 1.8
    return {
        "schema": "forgeos.fe.iron_loss_from_lamination/v1",
        "iron_loss_w": loss["total_w"],
        "tooth_loss_w": loss["tooth_loss_w"],
        "yoke_loss_w": loss["yoke_loss_w"],
        "dominant_region": loss["dominant_region"],
        "basis": "bound" if above_fit else "modelled",
        "lamination_grade": grade,
        "steinmetz_kh": round(co.steinmetz_kh, 6),
        "steinmetz_ke": co.steinmetz_ke,
        "steinmetz_alpha": co.steinmetz_alpha,
        "electrical_frequency_hz": round(freq_hz, 1),
        "tooth_flux_t": tooth_t, "yoke_flux_t": yoke_t,
        "tooth_mass_kg": round(tooth_kg, 4), "yoke_mass_kg": round(yoke_kg, 4),
        "flux_source": flux_src,
        "caveat": (
            "UPPER BOUND, not a measurement. The Steinmetz form is fitted below "
            f"saturation; the yoke sits at {yoke_t:.2f} T, outside that fit, where "
            "the real material curve rolls off. FLUX is FE-measured; LOSS is "
            "modelled from it through the grade's derived coefficients."
        ) if above_fit else (
            "Modelled from FE-measured flux through coefficients derived from the "
            "stated lamination grade."
        ),
    }


def _selftest() -> int:
    fails: list[str] = []

    def ck(name, ok, detail=""):
        if not ok:
            fails.append(f"{name}: {detail}")

    from machine_lamination import lamination_from_grade, steinmetz_from_lamination
    from machine_loss_bounds import stator_iron_loss
    co = steinmetz_from_lamination(lamination_from_grade("M400-50A"))

    # ⭐ proveCatch: the derived coefficients must be the STEEL's, not the plan's
    # invented pair. ke=1e-7 was ~1169x too small.
    ck("grade_beats_invented_ke", co.steinmetz_ke > 1e-5,
       f"M400-50A ke derived as {co.steinmetz_ke:.3e}, no better than the 1e-7 literal")

    # ⭐ proveCatch: teeth and yoke must stay SEPARATE. Lumping the twin's real
    # numbers into one average understates the total, because the heavier region
    # is also the higher-flux one.
    sep = stator_iron_loss(tooth_flux_t=1.799, tooth_mass_kg=2.96,
                           yoke_flux_t=2.104, yoke_mass_kg=3.66,
                           electrical_frequency_hz=1300.0,
                           steinmetz_kh=co.steinmetz_kh, steinmetz_ke=co.steinmetz_ke,
                           steinmetz_alpha=co.steinmetz_alpha)["total_w"]
    avg_b = (1.799 * 2.96 + 2.104 * 3.66) / 6.62
    lumped = stator_iron_loss(tooth_flux_t=avg_b, tooth_mass_kg=6.62,
                              yoke_flux_t=0.0, yoke_mass_kg=0.0,
                              electrical_frequency_hz=1300.0,
                              steinmetz_kh=co.steinmetz_kh, steinmetz_ke=co.steinmetz_ke,
                              steinmetz_alpha=co.steinmetz_alpha)["total_w"]
    ck("lumping_understates", sep > lumped,
       f"separated {sep} W did not exceed lumped {lumped} W — the split is pointless")
    ck("yoke_dominates",
       stator_iron_loss(tooth_flux_t=1.799, tooth_mass_kg=2.96, yoke_flux_t=2.104,
                        yoke_mass_kg=3.66, electrical_frequency_hz=1300.0,
                        steinmetz_kh=co.steinmetz_kh, steinmetz_ke=co.steinmetz_ke,
                        steinmetz_alpha=co.steinmetz_alpha)["dominant_region"] == "yoke",
       "the heavier, higher-flux yoke did not come out dominant")

    # ⭐ proveCatch: the answer must clear the iron-loss-defaulted check that the
    # 135.56 W figure failed — otherwise this fix does not actually fix anything.
    import physics_plausibility as pp
    st = {"orchestratorContract": {"quantities": {
        "mgu_iron_loss_w": {"value": sep}, "mgu_copper_loss_w": {"value": 2180.49},
        "max_rotor_speed_rpm": {"value": 19500}}}}
    fired = {f["check"] for f in pp.evaluate(st)["findings"]}
    ck("clears_defaulted_steinmetz_check", "iron_loss_defaulted" not in fired,
       f"the derived loss still trips iron_loss_defaulted (fired: {sorted(fired)})")

    # ⭐ proveCatch: a saturated yoke must be labelled a BOUND, never a measurement.
    ck("saturation_is_labelled_a_bound", 2.104 > 1.8,
       "fixture no longer exercises the above-fit path")

    # Missing artefacts must abstain, not invent.
    import tempfile
    ck("absent_artefacts_abstain", compute(Path(tempfile.mkdtemp())) is None,
       "an empty twin produced an iron-loss number out of nothing")

    for f in fails:
        print(f"  FAIL {f}")
    print("fe_iron_loss_writeback selftest: OK" if not fails
          else f"FAIL fe_iron_loss_writeback selftest ({len(fails)} failures)")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path)
    ap.add_argument("--grade", default=DEFAULT_GRADE)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin required")
    res = compute(args.twin, args.grade)
    if res is None:
        print("[iron-loss] stator mass / flux artefacts absent — nothing derived")
        return 0
    print(f"[iron-loss] {res['lamination_grade']}: kh={res['steinmetz_kh']} "
          f"ke={res['steinmetz_ke']:.4e} at {res['electrical_frequency_hz']} Hz")
    print(f"   teeth {res['tooth_loss_w']} W ({res['tooth_flux_t']:.3f} T, "
          f"{res['tooth_mass_kg']} kg)")
    print(f"   yoke  {res['yoke_loss_w']} W ({res['yoke_flux_t']:.3f} T, "
          f"{res['yoke_mass_kg']} kg)  <- {res['dominant_region']} dominates")
    print(f"   TOTAL {res['iron_loss_w']} W   basis={res['basis']}")
    print(f"   {res['caveat']}")
    (args.twin / "_motor_stack" / "stator_iron_loss_from_lamination.json").write_text(
        json.dumps(res, indent=2))
    if args.write:
        sp = args.twin / "state.json"
        state = json.loads(sp.read_text())
        q = state.setdefault("orchestratorContract", {}).setdefault("quantities", {})
        q["mgu_iron_loss_w"] = {
            "value": res["iron_loss_w"], "unit": "W", "family": "power",
            "basis": res["basis"], "scope": "module", "uncertainty_pct": 40,
            "condition": f"{res['electrical_frequency_hz']} Hz electrical",
            "provenance": {
                "source": "tool:fe:iron-loss-from-lamination",
                "tool_id": "fe:iron-loss-from-lamination",
                "detail": (f"{res['lamination_grade']} derived Steinmetz on FE-probed "
                           f"tooth/yoke flux and measured stator iron mass"),
                "caveat": res["caveat"],
            },
        }
        q["lamination_grade"] = {"value": res["lamination_grade"], "unit": "",
                                 "family": "text", "basis": "stated", "scope": "module"}
        q["stator_iron_mass_kg"] = {
            "value": round(res["tooth_mass_kg"] + res["yoke_mass_kg"], 4),
            "unit": "kg", "family": "mass", "basis": "measured", "scope": "module"}
        q["stator_tooth_flux_t"] = {"value": res["tooth_flux_t"], "unit": "T",
                                    "family": "flux_density", "basis": "measured",
                                    "scope": "module"}
        q["stator_yoke_flux_t"] = {"value": res["yoke_flux_t"], "unit": "T",
                                   "family": "flux_density", "basis": "measured",
                                   "scope": "module"}
        # ⭐⭐ EFFICIENCY MUST FOLLOW THE LOSS (2026-08-03). Correcting the iron
        # loss and leaving `mgu_efficiency` at the value computed FROM the wrong
        # loss would leave the contract self-contradictory — and the deterministic
        # efficiency_loss_mismatch check catches exactly that, as it did here the
        # moment the loss was fixed. Recomputed from the same tally the checker
        # uses, so the two agree by construction rather than by luck.
        def _qn(key):
            v = q.get(key)
            v = v.get("value") if isinstance(v, dict) else v
            try:
                return float(v)
            except (TypeError, ValueError):
                return None
        shaft_kw = _qn("mgu_shaft_power_kw") or _qn("peak_mechanical_power_kw")
        copper_w = _qn("mgu_copper_loss_w") or 0.0
        magnet_w = _qn("mgu_magnet_loss_w") or 0.0
        if shaft_kw and shaft_kw > 0:
            losses_w = copper_w + magnet_w + res["iron_loss_w"]
            eta = (shaft_kw * 1000.0) / (shaft_kw * 1000.0 + losses_w)
            prev = _qn("mgu_efficiency")
            q["mgu_efficiency"] = {
                "value": round(eta, 5), "unit": "", "family": "dimensionless",
                "basis": "derived", "scope": "module", "uncertainty_pct": 20,
                "condition": f"{res['electrical_frequency_hz']} Hz electrical",
                "provenance": {
                    "source": "tool:fe:iron-loss-from-lamination",
                    "tool_id": "fe:iron-loss-from-lamination",
                    "detail": (f"shaft/(shaft+losses) with iron loss from the "
                               f"{res['lamination_grade']} lamination; supersedes the "
                               f"motor:loss-point value {prev} computed from an "
                               f"invented Steinmetz pair"),
                    "caveat": res["caveat"],
                },
            }
            q["mgu_total_loss_w"] = {
                "value": round(losses_w, 1), "unit": "W", "family": "power",
                "basis": res["basis"], "scope": "module",
                "provenance": {"source": "tool:fe:iron-loss-from-lamination",
                               "tool_id": "fe:iron-loss-from-lamination"}}
            print(f"   efficiency {prev} -> {eta:.5f} "
                  f"(losses {losses_w:.0f} W over {shaft_kw:.1f} kW)")
        sp.write_text(json.dumps(state, indent=2))
        print("   written to state.orchestratorContract.quantities "
              "(+ lamination_grade, stator_iron_mass_kg, tooth/yoke flux)")
        # ⚠ DO NOT silently restate a thermal result nobody re-solved.
        prev_diss = _qn("total_dissipated_kw_continuous")
        if prev_diss:
            print(f"\n   ⚠ THERMAL SCREEN IS NOW STALE. total_dissipated_kw_continuous "
                  f"= {prev_diss} kW was computed on the OLD iron loss; the corrected "
                  f"machine losses alone are {losses_w/1000:.2f} kW. The cooling "
                  f"network/thermal screens must be RE-RUN — this writeback deliberately "
                  f"does not overwrite a thermal result it has not re-solved.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
