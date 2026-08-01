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
    rpm = float(getattr(inputs, "max_rotor_speed_rpm", 19500.0) or 19500.0)
    if e_ll_rms:
        omega_e = rpm * 2.0 * math.pi / 60.0 * pole_pairs
        lambda_pm = (e_ll_rms / math.sqrt(3.0)) * math.sqrt(2.0) / omega_e
    if not lambda_pm:
        print("back-EMF unavailable — cannot form the analytic reference",
              file=sys.stderr)
        return 2

    # The current angle that maximises q-axis current under this deck's own
    # convention. The angle screen showed torque zero at +/-90 and extremal near
    # 0, i.e. i_q ~ cos(gamma) — so gamma = 0 is the pure-q-axis drive.
    gamma_deg = 0.0

    rows = []
    for token in args.currents.split(","):
        i_peak = float(token)
        assumptions = m.loaded_point_assumptions(
            duty, inputs, current_angle_electrical_deg=gamma_deg)
        # Override the current directly; the twin-clamped design current cannot
        # reach the low values this probe needs.
        import dataclasses
        assumptions = dataclasses.replace(
            assumptions,
            **{
               "phase_current_peak_a": i_peak,
               "phase_current_rms_a": i_peak / math.sqrt(2.0),
               "phase_a_current_a": i_peak * math.cos(math.radians(gamma_deg)),
               "phase_b_current_a": i_peak * math.cos(
                   math.radians(gamma_deg) - 2.0 * math.pi / 3.0),
               "phase_c_current_a": i_peak * math.cos(
                   math.radians(gamma_deg) + 2.0 * math.pi / 3.0)})
        result = m.run_loaded_magnetic_point(
            geometry, solver, remanence_t=remanence, assumptions=assumptions)
        t_fe = abs(float(result.torque_nm))
        t_analytic = 1.5 * pole_pairs * lambda_pm * i_peak
        rows.append({
            "phase_current_peak_a": i_peak,
            "fe_torque_nm": round(t_fe, 4),
            "analytic_torque_nm": round(t_analytic, 4),
            "ratio_fe_over_analytic": (round(t_fe / t_analytic, 4)
                                       if t_analytic else None),
            "peak_airgap_flux_density_t": result.peak_airgap_flux_density_t,
        })
        print(f"  I={i_peak:7.1f} A pk   FE={t_fe:8.3f}   "
              f"analytic={t_analytic:8.3f}   ratio={t_fe / t_analytic:6.3f}   "
              f"Bgap_pk={result.peak_airgap_flux_density_t:.4f} T", flush=True)

    ratios = [r["ratio_fe_over_analytic"] for r in rows
              if r["ratio_fe_over_analytic"]]
    lowest = ratios[0] if ratios else None
    spread = (max(ratios) - min(ratios)) if len(ratios) > 1 else 0.0
    verdict = "INCONCLUSIVE"
    if lowest is not None:
        if spread > 0.15:
            verdict = (
                "SATURATION — the ratio MOVES with current, so the discrepancy "
                "is physical, not a fixed scale error. Compare only at the "
                "lowest current, where the ratio is "
                f"{lowest:.3f}.")
        elif abs(lowest - 2.0) < 0.15:
            verdict = ("SCALE ERROR 2x — the FE applies DOUBLE the ampere-turns. "
                       "With Npcp parallel paths each conductor carries "
                       "I_phase/Npcp, not I_phase.")
        elif abs(lowest - 0.5) < 0.08:
            verdict = "SCALE ERROR 0.5x — the FE applies HALF the ampere-turns."
        elif abs(lowest - 1.0) < 0.12:
            verdict = ("TORQUE PATH SCALED CORRECTLY — the design-current gap is "
                       "SATURATION and the machine is genuinely short.")
        else:
            verdict = (f"UNEXPLAINED CONSTANT FACTOR {lowest:.3f} — flat in "
                       "current, so a scale error, but not a familiar one. "
                       "Publish the turns/parallel-path table and re-derive.")

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
        "lambda_pm_wb_from_back_emf": round(lambda_pm, 6),
        "back_emf_line_line_rms_v": e_ll_rms,
        "current_angle_electrical_deg": gamma_deg,
        "points": rows,
        "ratio_spread": round(spread, 4),
        "verdict": verdict,
    }
    out = args.output or (twin / "_motor_stack" / "em_fia_torque_scaling_probe.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=2))
    print()
    print(f"  turns/slot applied = {turns_per_slot}   parallel paths = {npcp:g}")
    print(f"  lambda_pm (back-EMF) = {lambda_pm:.6f} Wb")
    print(f"  VERDICT: {verdict}")
    print(f"Artefact: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
