#!/usr/bin/env python3
"""LOW-CURRENT LINEARITY PROBE — is the FE torque path scaled correctly?

THE QUESTION. After the excitation fault was closed (async harmonics 53.65/80.17
-> 0.01/0.01 N.m), the FE still reports ~48.8 N.m where two independent analytic
routes agree on 127-131 N.m. A ~2.6x gap. Candidates:

  (a) SATURATION — real physics, and the analytic routes are linear upper bounds.
  (b) A SCALING ERROR in the ampere-turns the FE actually applies (turns per
      slot, parallel paths, circuit current definition).

These demand opposite responses, and at the design current they are
indistinguishable: both look like "FE below analytic".

THE TEST. Drive the machine at a SMALL current. Below the knee the iron does not
saturate, so (a) vanishes and the machine must obey

    T = 1.5 * p * lambda_pm * I_q_peak                       [linear, exact]

with lambda_pm taken from the deck's OWN measured back-EMF, so no new assumption
enters. Then:

    FE/analytic ~= 1.00  -> the torque path is scaled right; the design-current
                            gap is SATURATION and the machine is genuinely short.
    FE/analytic ~= 2.00  -> the FE applies DOUBLE the ampere-turns (the parallel-
                            path division is missing: with Npcp=2 each conductor
                            carries I_phase/2, not I_phase).
    FE/analytic ~= 0.50  -> the FE applies HALF.

A ratio that is a clean small rational number is a SCALING BUG. A ratio near 1.0
that degrades as current rises is SATURATION. Nothing else distinguishes them.

RUN AT SEVERAL CURRENTS. One point cannot tell a scale error from a coincidence;
a LINE through the origin whose slope is the error can. Torque must be linear in
current while the iron is unsaturated, so a departure from linearity marks the
knee and tells you where the analytic comparison stops being valid.

Usage:
    em_fia_torque_scaling_probe.py --twin <dir> [--currents 50,100,200,400]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "motor-stack"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, required=True)
    ap.add_argument("--currents", default="50,100,200,400",
                    help="PEAK phase currents (A) to probe")
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()

    import em_fia_front_kit_case as m

    twin = args.twin.resolve()
    state = json.loads((twin / "state.json").read_text())
    q = (state.get("orchestratorContract") or {}).get("quantities") or {}
    inputs = m.inputs_from_sections(q, {})
    geometry = m.derive_fia_geometry(inputs)
    duty = m.analytical_duty_check(inputs)
    solver = m._solver_path()
    machine = m.load(str(m.MATERIAL_MACHINE_PATH))
    remanence = float(machine.rotor.hole[0].magnet_0.mat_type.mag.Brm20)

    pole_pairs = m.ROTOR_POLES // 2
    turns_per_slot = m.effective_turns_per_slot_from_twin(inputs)
    npcp = max(1.0, float(inputs.winding_parallel_paths))

    # lambda_pm from the deck's OWN back-EMF — no new assumption.
    fw = twin / "_motor_stack" / "em_fia_voltage_fw_screen.json"
    lambda_pm = None
    e_ll_rms = None
    if fw.exists():
        def _find(o, *names):
            if isinstance(o, dict):
                for k, v in o.items():
                    if k in names and isinstance(v, (int, float)):
                        return float(v)
                    r = _find(v, *names)
                    if r is not None:
                        return r
            elif isinstance(o, list):
                for i in o:
                    r = _find(i, *names)
                    if r is not None:
                        return r
            return None
        e_ll_rms = _find(json.loads(fw.read_text()),
                         "estimated_back_emf_line_line_rms_v",
                         "back_emf_line_line_rms_v",
                         "open_circuit_line_line_rms_v")
    # ⭐ PREFER THE MEASURED FUNDAMENTAL over the 1-D transform (2026-08-01).
    # The voltage/FW screen derives back-EMF ANALYTICALLY from open-circuit
    # airgap RMS B, which on this machine overstates lambda_pm by 11x because
    # the flux linkage is 3rd-harmonic dominated (3rd = 1.90x the fundamental,
    # THD 198%) and a magnitude-based transform cannot see that. If a measured
    # open-circuit flux-linkage sweep exists, IT is the reference.
    # Sol (pre-commit council): "the sweep file is trusted solely by field name;
    # its machine identity, electrical-period coverage and sample count are not
    # checked" — and "invalid numeric values are not robustly rejected". Both
    # are real: a sweep from a DIFFERENT machine, or a partial-period one, would
    # be adopted silently as the reference that every ratio is judged against.
    # ⭐ THE REFERENCE MUST TRACK THE GEOMETRY (found mid-measurement
    # 2026-08-01). When the magnet override is active the machine is NOT the
    # one the baseline sweep describes, so comparing against the baseline
    # lambda_pm silently reports a ratio for a machine that does not exist.
    # Prefer a REBALANCED sweep when the override is set; refuse to fall back
    # to the baseline, because a wrong reference is worse than none.
    _override = (os.environ.get("FIA_MAGNET_THICKNESS_MM")
                 or os.environ.get("FIA_MAGNET_LENGTH_MM"))
    lam_name = ("oc_flux_linkage_sweep_REBALANCED.json" if _override
                else "oc_flux_linkage_sweep.json")
    lam_sweep = twin / "_motor_stack" / lam_name
    measured_lambda = None
    measured_reject = ""
    if lam_sweep.exists():
        try:
            sweep = json.loads(lam_sweep.read_text())
            raw = sweep.get("lambda_pm_fundamental_wb")
            n = int(sweep.get("n_samples", 0))
            span = float(sweep.get("electrical_period_mech_deg", 0.0))
            expected_span = 360.0 / pole_pairs
            if not isinstance(raw, (int, float)) or isinstance(raw, bool):
                measured_reject = f"lambda is {raw!r}, not a number"
            elif not math.isfinite(float(raw)) or float(raw) <= 0.0:
                measured_reject = f"lambda is {raw!r} (must be finite and > 0)"
            elif n < 8:
                measured_reject = f"only {n} samples — too few to resolve a fundamental"
            elif abs(span - expected_span) > 1e-6:
                measured_reject = (
                    f"sweep spans {span:g} deg mech but ONE electrical period at "
                    f"p={pole_pairs} is {expected_span:g} deg — this sweep does "
                    "not describe this machine")
            else:
                measured_lambda = float(raw)
        except (json.JSONDecodeError, TypeError, ValueError, OSError) as exc:
            measured_reject = f"{type(exc).__name__}: {exc}"
        if measured_reject:
            print(f"  [reference] REJECTED the measured sweep — {measured_reject}",
                  file=sys.stderr)

    rpm = float(getattr(inputs, "max_rotor_speed_rpm", 19500.0) or 19500.0)
    if e_ll_rms:
        omega_e = rpm * 2.0 * math.pi / 60.0 * pole_pairs
        lambda_pm = (e_ll_rms / math.sqrt(3.0)) * math.sqrt(2.0) / omega_e
    reference_source = ("1-D transform of open-circuit airgap RMS B"
                        + (" [WARNING: a magnet override is active but no "
                           "rebalanced sweep was found — this reference "
                           "describes a DIFFERENT machine]" if _override else ""))
    if measured_lambda:
        lambda_pm = measured_lambda
        reference_source = ("MEASURED open-circuit flux-linkage fundamental "
                            "(full electrical period)")
    if not lambda_pm:
        print("no reference lambda_pm available",
              file=sys.stderr)
        return 2

    # The current angle that maximises q-axis current under this deck's own
    # convention. The angle screen showed torque zero at +/-90 and extremal near
    # 0, i.e. i_q ~ cos(gamma) — so gamma = 0 is the pure-q-axis drive.
    gamma_deg = 0.0

    # ⭐ COGGING MUST BE CANCELLED HERE TOO (learned the hard way, twice).
    # The FIRST version of this probe solved at rotor position 0, exactly the
    # bug just fixed in select_best_loaded_point. Cogging is a large fixed
    # offset, so it swamps a 4 N.m reading at 50 A and barely dents a 62 N.m
    # one at 400 A — which manufactured a ratio that RISES with current
    # (0.427 -> 0.874) and looks like neither saturation nor a scale error.
    # Averaging three positions a third of a slot pitch apart annihilates the
    # cogging fundamental and its 2nd harmonic exactly, same as the angle screen.
    import dataclasses
    slot_pitch_deg = 360.0 / max(1, m.stator_slots_from_twin(inputs))
    probe_positions = [f * slot_pitch_deg for f in (0.0, 1.0 / 3.0, 2.0 / 3.0)]

    def _solve(i_peak: float, position_deg: float):
        assumptions = m.loaded_point_assumptions(
            duty, inputs,
            current_angle_electrical_deg=m.rotor_frame_current_angle_deg(
                gamma_deg,
                rotor_position_mechanical_deg=position_deg,
                stator_slots=m.stator_slots_from_twin(inputs),
                rotor_poles=m.ROTOR_POLES),
            rotor_position_mechanical_deg=position_deg)
        # Override the current; the twin-clamped design current cannot reach the
        # low values this probe needs. `--currents` are TERMINAL peaks.
        #
        # ⭐⭐ (2026-08-02) This block used to build the three phase currents
        # itself, straight from i_peak — which bypassed the path-current
        # division and reintroduced the very bug that reversed DEC-EM-1, in a
        # file nobody was looking at. It now goes through the deck's single
        # excitation function, so the probe cannot excite differently from the
        # case it is probing.
        terminal_rms = i_peak / math.sqrt(2.0)
        path_rms, path_peak, i_a, i_b, i_c = m.fe_phase_currents_from_terminal(
            terminal_rms, gamma_deg, assumptions.winding_parallel_paths)
        assumptions = dataclasses.replace(
            assumptions,
            **{
               "phase_current_peak_a": i_peak,
               "phase_current_rms_a": terminal_rms,
               "path_current_rms_a": path_rms,
               "path_current_peak_a": path_peak,
               "phase_a_current_a": i_a,
               "phase_b_current_a": i_b,
               "phase_c_current_a": i_c})
        return m.run_loaded_magnetic_point(
            geometry, solver, remanence_t=remanence, assumptions=assumptions)

    rows = []
    for token in args.currents.split(","):
        i_peak = float(token)
        solved = [_solve(i_peak, pos) for pos in probe_positions]
        t_fe = abs(sum(float(r.torque_nm) for r in solved) / len(solved))
        result = solved[0]
        t_analytic = 1.5 * pole_pairs * lambda_pm * i_peak
        rows.append({
            "phase_current_peak_a": i_peak,
            "fe_torque_nm": round(t_fe, 4),
            "analytic_torque_nm": round(t_analytic, 4),
            "ratio_fe_over_analytic": (round(t_fe / t_analytic, 4)
                                       if t_analytic else None),
            "peak_airgap_flux_density_t": result.peak_airgap_flux_density_t,
            "positions_averaged_mech_deg": [round(p, 4) for p in probe_positions],
            "single_position_torque_nm": round(abs(float(result.torque_nm)), 4),
        })
        print(f"  I={i_peak:7.1f} A pk   FE={t_fe:8.3f}   "
              f"analytic={t_analytic:8.3f}   ratio={t_fe / t_analytic:6.3f}   "
              f"Bgap_pk={result.peak_airgap_flux_density_t:.4f} T", flush=True)

    ratios = [r["ratio_fe_over_analytic"] for r in rows
              if r["ratio_fe_over_analytic"]]
    currents = [r["phase_current_peak_a"] for r in rows]
    torques = [r["fe_torque_nm"] for r in rows]
    lowest = ratios[0] if ratios else None
    spread = (max(ratios) - min(ratios)) if len(ratios) > 1 else 0.0
    rising = bool(len(ratios) > 1 and ratios[-1] > ratios[0])

    # Separate the PM (linear in I) and RELUCTANCE (quadratic in I) terms by
    # least squares: T = a*I + b*I^2. The PM slope `a` gives the torque-derived
    # flux linkage, which is the machine's REAL PM capability as the FE sees it.
    a_pm = b_rel = lam_torque = None
    if len(rows) >= 3:
        n = len(currents)
        s11 = sum(i ** 2 for i in currents)
        s12 = sum(i ** 3 for i in currents)
        s22 = sum(i ** 4 for i in currents)
        t1 = sum(i * t for i, t in zip(currents, torques))
        t2 = sum(i * i * t for i, t in zip(currents, torques))
        det = s11 * s22 - s12 * s12
        if abs(det) > 0:
            a_pm = (t1 * s22 - t2 * s12) / det
            b_rel = (s11 * t2 - s12 * t1) / det
            lam_torque = a_pm / (1.5 * pole_pairs)

    # ⭐ THE DIRECTION OF THE RATIO IS THE DIAGNOSIS, and the first version of
    # this file got it backwards. SATURATION drives FE torque BELOW linear as
    # current rises, so the ratio FALLS. A ratio that RISES means torque is
    # SUPERLINEAR — the reluctance term (quadratic in I) is carrying the machine
    # while the PM term is far weaker than the reference assumes.
    verdict = "INCONCLUSIVE"
    if lowest is not None:
        if rising and spread > 0.05:
            # The DIRECTION of the ratio says reluctance-dominated either way,
            # but the wording must not assert "below the reference" when the
            # measurement is ABOVE it. With a MEASURED lambda_pm the PM-only
            # prediction is a floor, and FE torque exceeding it is the expected
            # result, not a fault; with an OVERSTATED 1-D reference the same
            # physics reads as FE falling short. Same diagnosis, opposite sign.
            # TWO ROUTES TO THE PM SHARE, AND THEY DISAGREE. Report BOTH as a
            # range rather than picking the one that suits the narrative:
            #   (a) the curve fit's linear term — but it also absorbs
            #       cross-saturation, so it OVERSTATES pure PM;
            #   (b) 1.5*p*lambda_pm*I from the measured OPEN-CIRCUIT linkage —
            #       but loading changes lambda, so it is not the loaded value.
            # On the live machine these give 62% and 28%. Both say reluctance is
            # substantial and the PM circuit is weak, which is what the fix
            # depends on; neither is precise enough to quote alone.
            share = ""
            if a_pm and torques[-1]:
                fit_pm = a_pm * currents[-1]
                ref_pm = 1.5 * pole_pairs * lambda_pm * currents[-1]
                lo, hi = sorted((fit_pm / torques[-1], ref_pm / torques[-1]))
                share = (f" PM share is between {lo * 100:.0f}% and "
                         f"{hi * 100:.0f}% of the measured {torques[-1]:.1f} N.m "
                         f"(curve fit {fit_pm:.1f} N.m vs measured-lambda "
                         f"{ref_pm:.1f} N.m — these DISAGREE by "
                         f"{max(fit_pm, ref_pm) / min(fit_pm, ref_pm):.2f}x and "
                         "the disagreement is unresolved), so reluctance carries "
                         f"{(1 - hi) * 100:.0f}-{(1 - lo) * 100:.0f}%.")
            verdict = (
                "RELUCTANCE-DOMINATED. The ratio RISES with current "
                f"({ratios[0]:.2f} -> {ratios[-1]:.2f}), so torque is "
                "SUPERLINEAR — the OPPOSITE of saturation, which would make it "
                "fall. The quadratic reluctance term is carrying the machine "
                "while the PM term is weak." + share +
                " Fix the PM circuit (pole arc / flux focusing), not the "
                "winding or the integration.")
        elif spread > 0.15:
            verdict = ("SATURATION — the ratio FALLS with current, so the "
                       "discrepancy is physical. Compare only at the lowest "
                       f"current, where the ratio is {lowest:.3f}.")
        elif abs(lowest - 2.0) < 0.15:
            verdict = ("SCALE ERROR 2x — the FE applies DOUBLE the ampere-turns. "
                       "With Npcp parallel paths each conductor carries "
                       "I_phase/Npcp, not I_phase.")
        elif abs(lowest - 0.5) < 0.08:
            verdict = "SCALE ERROR 0.5x — the FE applies HALF the ampere-turns."
        elif abs(lowest - 1.0) < 0.12:
            verdict = ("TORQUE PATH SCALED CORRECTLY — any design-current gap is "
                       "SATURATION and the machine is genuinely short.")
        else:
            verdict = (f"UNEXPLAINED CONSTANT FACTOR {lowest:.3f} — flat in "
                       "current, so a scale error, but not a familiar one.")

    res = {
        "schema": "forgeos.motor_stack.torque_scaling_probe/v1",
        "winding": {
            "turns_per_slot_applied": turns_per_slot,
            "winding_parallel_paths": npcp,
            "note": ("FEMM MMF per slot = turns x circuit current. If the "
                     "circuit current is the PHASE current while the conductors "
                     "sit in Npcp parallel paths, the applied ampere-turns are "
                     "Npcp times too large."),
        },
        "lambda_pm_wb_reference": round(lambda_pm, 6),
        "lambda_pm_reference_source": reference_source,
        "lambda_pm_reference_rejected": measured_reject or None,
        # Kept for schema back-compatibility: renaming a published key breaks
        # every consumer that reads it (Sol, pre-commit council).
        "lambda_pm_wb_from_back_emf": round(lambda_pm, 6),
        "back_emf_line_line_rms_v": e_ll_rms,
        "current_angle_electrical_deg": gamma_deg,
        "points": rows,
        "ratio_spread": round(spread, 4),
        "ratio_rising_with_current": rising,
        "fit_T_equals_a_I_plus_b_I2": {
            "a_pm_nm_per_a": (round(a_pm, 6) if a_pm else None),
            "b_reluctance_nm_per_a2": (f"{b_rel:.4e}" if b_rel else None),
            "lambda_pm_from_torque_wb": (round(lam_torque, 6) if lam_torque else None),
            "lambda_pm_from_reference_wb": round(lambda_pm, 6),
            "disagreement_x": (round(lambda_pm / lam_torque, 3)
                               if lam_torque else None),
            "note": ("The reference lambda_pm comes from the voltage/FW screen, "
                     "which derives back-EMF ANALYTICALLY from the FE's "
                     "open-circuit airgap RMS B via a 1-D sinusoidal-flux "
                     "relation. It is NOT an independent FE measurement of "
                     "back-EMF, so it must not be presented as a second "
                     "witness agreeing with the analytic design-flux route."),
        },
        "verdict": verdict,
    }
    out = args.output or (twin / "_motor_stack" / "em_fia_torque_scaling_probe.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=2))
    print()
    print(f"  turns/slot applied = {turns_per_slot}   parallel paths = {npcp:g}")
    print(f"  lambda_pm reference = {lambda_pm:.6f} Wb  [{reference_source}]")
    print(f"  VERDICT: {verdict}")
    print(f"Artefact: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
