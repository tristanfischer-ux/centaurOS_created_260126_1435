#!/usr/bin/env python3
"""SOLVER RESULTS -> CONTRACT QUANTITIES. The missing link. UNIVERSAL.

⭐⭐ WHY THIS EXISTS (2026-08-03). The engine has TWO disconnected universes on
the same twin:

    workbook / drawings / renders   145.746 N·m   inverter:current-voltage-envelope
    finite-element solvers           81.558 N·m   xfemm, 37-point rotor sweep

A 1.79x disagreement, and the deliverables are built ENTIRELY on the analytic
side. Motor-stack solvers write to `_motor_stack/*.json` and NOTHING carries
those results back into `orchestratorContract.quantities`, which is what the
Excel, the drawings and the renders read. Verified on the live twin: not one
contract quantity cites a motor-stack artefact, and a full chain re-run
reproduced the analytic figure unchanged.

That is the "model fix that never reached the BoM" pathology at whole-engine
scale: a day of finite-element work that cannot reach the deliverable.

⭐ IT DOES NOT SILENTLY OVERWRITE. A previous failure on this engine was a
physics tree that quietly re-based four contract quantities and moved every
downstream number with no record. So this records a DIVERGENCE — both values,
both provenances, the ratio — and only promotes the solver value when the
caller asks for it. A disagreement between an analytic estimate and a measured
solve is INFORMATION, not an error to paper over.

UNIVERSAL: the map below is keyed by artefact filename and dotted key path, not
by product class. Any twin with motor-stack artefacts gets this for free; a
quantity whose artefact is absent is simply skipped.

Usage:
    fe_contract_writeback.py --twin <dir>                 # report divergences
    fe_contract_writeback.py --twin <dir> --promote       # write solver values in
    fe_contract_writeback.py --selftest
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

EXIT_DIVERGENCE = 50


@dataclass(frozen=True)
class Binding:
    """One solver result and the contract quantity it should govern.

    ⭐⭐ `basis` and `operating_point` are LOAD-BEARING, not labels. The first
    version of this module matched analytic and solver quantities by NAME and
    produced three "divergences" of which only ONE was real (2026-08-03,
    caught by Sol and Grok independently at the start council):

      - it compared an inverter-envelope PEAK (145.746) against a 37-point
        rotor-position MEAN (81.558) and called it a 1.79x divergence. Compared
        peak-to-peak against the MTPA screen it is 1.06x — they AGREE.
      - it compared `mgu_shaft_torque_max_nm` (334 N·m, peak at the
        constant-power corner near 10,000 rpm) against an MTPA peak measured at
        19,500 rpm and called it 2.43x. 350 kW at 10,000 rpm through the
        efficiency chain is 341.8 N·m, so 334 is CORRECT for what it describes.
        Different operating points are not comparable at all.

    A comparison across bases or across operating points is not a weak
    comparison, it is a MEANINGLESS one, and it manufactures alarming ratios
    from correct numbers.
    """

    quantity: str                  # contract quantity name
    artefact: str                  # filename under _motor_stack/
    key_path: str                  # dotted path inside the artefact
    unit: str
    basis: str = "measured"        # peak | continuous | measured
    operating_point: str = ""      # e.g. "19500rpm/477Arms" — must MATCH to compare
    note: str = ""


# The registry. Each entry says: this contract quantity SHOULD come from this
# solver result. Extend it rather than special-casing a product.
BINDINGS: tuple[Binding, ...] = (
    Binding("mgu_fe_shaft_torque_nm",
            "em_fia_front_kit_case.json",
            "rotor_position_sweep.summary.torque_magnitude_mean_nm",
            "Nm", basis="continuous", operating_point="19500rpm/477Arms",
            note="37-point rotor sweep, magnitude mean"),
    Binding("mgu_fe_torque_peak_nm",
            "em_fia_mtpa_screen.json",
            "summary.peak_torque_magnitude_nm",
            "Nm", basis="peak", operating_point="19500rpm/477Arms",
            note="MTPA screen peak"),
    Binding("mgu_fe_lambda_pm_wb",
            "oc_flux_linkage_sweep.json",
            "lambda_pm_fundamental_wb",
            "Wb", note="open-circuit flux linkage fundamental"),
    Binding("mgu_fe_airgap_peak_t",
            "em_fia_front_kit_case.json",
            "open_circuit_result.peak_airgap_flux_density_t",
            "T", note="open-circuit peak airgap flux density"),
    Binding("rotor_fe_max_principal_stress_mpa",
            "calculix_fia_rotor_screen.json",
            "screening_results.max_principal_stress_mpa",
            "MPa", note="CalculiX centrifugal screen"),
    Binding("rotor_fe_screening_fos",
            "calculix_fia_rotor_screen.json",
            "screening_results.screening_fos_vs_yield",
            "-", note="screening FoS vs assumed yield"),
)

# Analytic quantities the solver result should be COMPARED against. A missing
# counterpart is not an error — it means nothing analytic claimed that number.
# Each entry declares the analytic counterpart AND the basis/operating point it
# must share. A counterpart whose basis or operating point differs is NOT
# compared — it is reported as incomparable, with the reason.
COMPARISONS: dict[str, tuple[dict, ...]] = {
    "mgu_fe_shaft_torque_nm": (
        {"quantity": "mgu_shaft_torque_nm", "basis": "continuous",
         "operating_point": "19500rpm/477Arms"},
        # envelope_mgu_torque_nm is basis=PEAK — deliberately NOT compared here;
        # it belongs against the MTPA peak below, where the two agree to 6%.
    ),
    "mgu_fe_torque_peak_nm": (
        {"quantity": "envelope_mgu_torque_nm", "basis": "peak",
         "operating_point": "19500rpm/477Arms"},
        # mgu_shaft_torque_max_nm is a ~10,000 rpm constant-power CORNER figure.
        # No FE solve exists at that speed, so it is incomparable, not divergent.
        {"quantity": "mgu_shaft_torque_max_nm", "basis": "peak",
         "operating_point": "10000rpm/corner"},
    ),
}

DIVERGENCE_RATIO = 1.10          # 10% — below this the two agree well enough


def dig(blob, dotted: str):
    """Fetch a dotted path, walking dicts and list indices."""
    cur = blob
    for part in dotted.split("."):
        if isinstance(cur, list):
            try:
                cur = cur[int(part)]
                continue
            except (ValueError, IndexError):
                return None
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def _quantity_value(quantities: dict, name: str):
    entry = quantities.get(name)
    if isinstance(entry, dict):
        return entry.get("value")
    return entry if isinstance(entry, (int, float)) else None


def collect(twin: Path) -> dict:
    """Read every bound solver result and compare it to its analytic counterpart."""
    state_path = Path(twin) / "state.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    quantities = ((state.get("orchestratorContract") or {}).get("quantities")
                  or {})
    stack = Path(twin) / "_motor_stack"

    found, missing, divergences = [], [], []
    agreements, incomparable = [], []
    for b in BINDINGS:
        path = stack / b.artefact
        if not path.exists():
            missing.append({"quantity": b.quantity, "artefact": b.artefact,
                            "reason": "artefact absent"})
            continue
        try:
            value = dig(json.loads(path.read_text()), b.key_path)
        except (json.JSONDecodeError, OSError) as exc:
            missing.append({"quantity": b.quantity, "artefact": b.artefact,
                            "reason": f"unreadable: {exc}"})
            continue
        if not isinstance(value, (int, float)):
            missing.append({"quantity": b.quantity, "artefact": b.artefact,
                            "reason": f"key {b.key_path!r} is not numeric"})
            continue
        value = abs(float(value)) if b.unit == "Nm" else float(value)
        record = {"quantity": b.quantity, "value": value, "unit": b.unit,
                  "basis": b.basis, "artefact": b.artefact,
                  "key_path": b.key_path, "note": b.note}
        found.append(record)

        for spec in COMPARISONS.get(b.quantity, ()):
            counterpart = spec["quantity"]
            analytic = _quantity_value(quantities, counterpart)
            if not isinstance(analytic, (int, float)) or analytic == 0:
                continue
            entry = quantities.get(counterpart) or {}
            prov = entry.get("provenance") or {}
            # ⭐ REFUSE the comparison when basis or operating point differ. A
            # ratio between a peak and a mean, or between two speeds, is not a
            # weak signal — it is a manufactured one.
            # ⭐⭐ READ THE BASIS FROM THE QUANTITY, do not assert it (Sol, Grok
            # — second council). The first version declared the counterpart's
            # basis and operating point in the COMPARISONS map and never checked
            # the contract entry, so my map's opinion silently overrode what the
            # quantity actually said. Worse, an UNSTATED operating point was
            # treated as a match: `envelope_mgu_torque_nm` carries basis='peak'
            # and condition=None, so the 1.06x "agreement" I reported was
            # asserted, not established. An unstated condition is now UNKNOWN,
            # and unknown never compares.
            actual_basis = str(entry.get("basis") or "").strip().lower()
            actual_condition = entry.get("condition")
            reasons = []
            if spec.get("basis"):
                if not actual_basis:
                    reasons.append("the analytic quantity states no basis")
                elif actual_basis != spec["basis"]:
                    reasons.append(f"contract basis {actual_basis!r} is not the "
                                   f"{spec['basis']!r} this pairing requires")
            if spec.get("basis") and spec["basis"] != b.basis:
                reasons.append(f"basis {spec['basis']!r} vs solver {b.basis!r}")
            if spec.get("operating_point") and not actual_condition:
                reasons.append("the analytic quantity states no operating point "
                               "(condition is null), so like-for-like cannot be "
                               "established")
            if (spec.get("operating_point") and b.operating_point
                    and spec["operating_point"] != b.operating_point):
                reasons.append(f"operating point {spec['operating_point']!r} "
                               f"vs solver {b.operating_point!r}")
            if reasons:
                incomparable.append({
                    "solver_quantity": b.quantity, "solver_value": value,
                    "analytic_quantity": counterpart, "analytic_value": analytic,
                    "analytic_source": prov.get("tool_id") or entry.get("source"),
                    "reason": "; ".join(reasons),
                    "verdict": ("NOT COMPARED — these describe different things. "
                                "A ratio here would be meaningless."),
                })
                continue
            ratio = max(value, analytic) / min(value, analytic)
            record = {
                "solver_quantity": b.quantity, "solver_value": value,
                "solver_source": f"{b.artefact}::{b.key_path}",
                "analytic_quantity": counterpart, "analytic_value": analytic,
                "analytic_source": prov.get("tool_id") or entry.get("source"),
                "basis": b.basis, "operating_point": b.operating_point,
                "ratio": round(ratio, 4), "unit": b.unit,
            }
            if ratio >= DIVERGENCE_RATIO:
                record["verdict"] = ("the deliverable is built on the ANALYTIC "
                                     "value; the solver measured something "
                                     "different at the SAME basis and operating "
                                     "point")
                divergences.append(record)
            else:
                record["verdict"] = "agree within threshold"
                agreements.append(record)
    return {"schema": "forgeos.fe_contract_writeback/v1",
            "twin": str(twin), "found": found, "missing": missing,
            "divergences": divergences,
            "agreements": agreements,
            "incomparable": incomparable,
            "divergence_ratio_threshold": DIVERGENCE_RATIO}


def promote(twin: Path, report: dict) -> int:
    """Write solver results into the contract as NEW, clearly-sourced quantities.

    Deliberately ADDITIVE: solver values land under their own `*_fe_*` names
    with solver provenance, and the analytic quantities are left untouched. That
    keeps the disagreement visible instead of erasing one side of it — the
    decision about which governs a deliverable belongs to whoever reads the
    divergence, not to this script.
    """
    state_path = Path(twin) / "state.json"
    state = json.loads(state_path.read_text())
    contract = state.setdefault("orchestratorContract", {})
    quantities = contract.setdefault("quantities", {})
    written = 0
    for rec in report["found"]:
        quantities[rec["quantity"]] = {
            "value": rec["value"],
            "unit": rec["unit"],
            "basis": rec["basis"],
            "scope": "module",
            "source": f"solver:{rec['artefact']}",
            "source_detail": (f"{rec['note']} — read from "
                              f"_motor_stack/{rec['artefact']} at "
                              f"{rec['key_path']}"),
            "provenance": {"source": f"solver:{rec['artefact']}",
                           "artefact": f"_motor_stack/{rec['artefact']}",
                           "key_path": rec["key_path"]},
        }
        written += 1
    state["feContractWriteback"] = {
        "divergences": report["divergences"],
        "found": len(report["found"]), "missing": len(report["missing"]),
        "note": ("Solver values are ADDITIVE and carry solver provenance. "
                 "Analytic quantities are untouched so the disagreement stays "
                 "visible."),
    }
    state_path.write_text(json.dumps(state, indent=2))
    return written


def _selftest() -> int:
    import tempfile
    fails: list[str] = []

    def ck(name: str, ok: bool, detail: str = "") -> None:
        if not ok:
            fails.append(f"{name}: {detail}")

    with tempfile.TemporaryDirectory() as td:
        twin = Path(td) / "twin"
        (twin / "_motor_stack").mkdir(parents=True)
        (twin / "_motor_stack" / "em_fia_front_kit_case.json").write_text(
            json.dumps({"rotor_position_sweep": {"summary": {
                "torque_magnitude_mean_nm": 81.558081}}}))
        # The CONTINUOUS analytic counterpart — the one genuinely comparable to
        # a 37-point rotor-position mean at the same operating point.
        (twin / "state.json").write_text(json.dumps({"orchestratorContract": {
            "quantities": {"mgu_shaft_torque_nm": {
                "value": 119.7, "unit": "Nm", "basis": "continuous",
                "condition": "T = P_shaft/omega at 19500 rpm",
                "provenance": {"tool_id": "front_fpk_power_reconcile"}}}}}))

        rep = collect(twin)
        ck("reads.solver_value",
           any(abs(f["value"] - 81.558081) < 1e-6 for f in rep["found"]),
           f"solver value not read: {rep['found']}")

        # ⭐ proveCatch: the 1.79x disagreement that motivated this module must
        # be REPORTED, not silently resolved either way.
        ck("proveCatch.divergence_is_reported",
           any(abs(d["ratio"] - 1.4677) < 0.01 for d in rep["divergences"]),
           f"the analytic/solver divergence was not flagged: {rep['divergences']}")
        ck("divergence.names_both_sources",
           all(d.get("analytic_source") and d.get("solver_source")
               for d in rep["divergences"]),
           "a divergence did not name both provenances")

        # ⭐ proveCatch: promotion must be ADDITIVE — the analytic quantity is
        # left intact so the disagreement cannot be erased by running this.
        promote(twin, rep)
        after = json.loads((twin / "state.json").read_text())
        q = after["orchestratorContract"]["quantities"]
        ck("promote.adds_solver_quantity",
           abs(q["mgu_fe_shaft_torque_nm"]["value"] - 81.558081) < 1e-6,
           "solver quantity not written")
        ck("promote.does_not_overwrite_analytic",
           abs(q["mgu_shaft_torque_nm"]["value"] - 119.7) < 1e-6,
           "the analytic quantity was overwritten — the disagreement was erased")
        ck("promote.records_divergence_on_state",
           bool(after.get("feContractWriteback", {}).get("divergences")),
           "the divergence was not recorded on the twin")
        ck("promote.solver_provenance",
           q["mgu_fe_shaft_torque_nm"]["source"].startswith("solver:"),
           "solver quantity does not carry solver provenance")

        # Agreement inside the threshold must NOT be reported as a divergence.
        (twin / "state.json").write_text(json.dumps({"orchestratorContract": {
            "quantities": {"mgu_shaft_torque_nm": {
                "value": 82.0, "basis": "continuous",
                "condition": "at 19500 rpm"}}}}))
        ck("no_false_divergence", not collect(twin)["divergences"],
           "values within 10% were reported as diverging")

        # A missing artefact is skipped, never invented.
        (twin / "_motor_stack" / "em_fia_front_kit_case.json").unlink()
        rep3 = collect(twin)
        ck("missing_artefact_is_skipped",
           not rep3["found"] and any(m["reason"] == "artefact absent"
                                     for m in rep3["missing"]),
           "a missing artefact did not degrade cleanly")

        # ⭐⭐ proveCatch for the error this module made on its first run: a
        # PEAK analytic value against a CONTINUOUS solver value, and a
        # 10,000 rpm corner against a 19,500 rpm solve, must be refused
        # outright — not turned into a ratio. Both produced alarming numbers
        # (1.79x and 2.43x) from figures that were individually correct.
        (twin / "state.json").write_text(json.dumps({"orchestratorContract": {
            "quantities": {
                "mgu_shaft_torque_nm": {"value": 119.7, "unit": "Nm",
                    "basis": "continuous", "condition": "at 19500 rpm"},
                # basis=peak but NO condition — operating point unstated
                "envelope_mgu_torque_nm": {"value": 145.746, "unit": "Nm",
                    "basis": "peak", "condition": None},
                "mgu_shaft_torque_max_nm": {"value": 334.0, "unit": "Nm",
                    "basis": "max", "condition": None}}}}))
        # Restore the case artefact — an earlier check deletes it to prove
        # missing artefacts degrade cleanly, and this block needs it back.
        (twin / "_motor_stack" / "em_fia_front_kit_case.json").write_text(
            json.dumps({"rotor_position_sweep": {"summary": {
                "torque_magnitude_mean_nm": 81.558081}}}))
        (twin / "_motor_stack" / "em_fia_mtpa_screen.json").write_text(
            json.dumps({"summary": {"peak_torque_magnitude_nm": 137.641562}}))
        rep2 = collect(twin)
        ck("proveCatch.refuses_cross_operating_point",
           any(i["analytic_quantity"] == "mgu_shaft_torque_max_nm"
               for i in rep2["incomparable"]),
           "a 10,000 rpm corner figure was compared against a 19,500 rpm solve")
        ck("proveCatch.no_ratio_for_incomparable",
           not any(d["analytic_quantity"] == "mgu_shaft_torque_max_nm"
                   for d in rep2["divergences"]),
           "an incomparable pair still produced a divergence ratio")
        # ⭐ An UNSTATED operating point must be refused, not assumed to match.
        # I reported a 1.06x "agreement" on this pair; the analytic quantity
        # carries condition=None, so like-for-like was never established.
        ck("proveCatch.unstated_condition_is_refused",
           any(i["analytic_quantity"] == "envelope_mgu_torque_nm"
               and "no operating point" in i["reason"]
               for i in rep2["incomparable"]),
           f"an unstated operating point was treated as a match: {rep2['incomparable']}")
        ck("proveCatch.no_agreement_without_evidence",
           not any(a["analytic_quantity"] == "envelope_mgu_torque_nm"
                   for a in rep2["agreements"]),
           "an agreement was claimed on a pair whose operating point is unstated")
        ck("proveCatch.continuous_divergence_survives",
           any(d["analytic_quantity"] == "mgu_shaft_torque_nm"
               and abs(d["ratio"] - 1.4677) < 0.01 for d in rep2["divergences"]),
           "the REAL continuous divergence was lost")


    for f in fails:
        print(f"  FAIL {f}")
    print(f"{'FAIL' if fails else 'PASS'} fe_contract_writeback selftest "
          f"({len(fails)} failures)")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path)
    ap.add_argument("--promote", action="store_true",
                    help="write solver values into the contract (additive)")
    ap.add_argument("--enforce", action="store_true",
                    help=f"exit {EXIT_DIVERGENCE} when a divergence is found")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin required")

    report = collect(args.twin)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"solver results bound: {len(report['found'])} "
              f"({len(report['missing'])} unavailable)")
        for f in report["found"]:
            print(f"  {f['quantity']:38s} {f['value']:>12.5f} {f['unit']:4s} "
                  f"<- {f['artefact']}")
        if report["divergences"]:
            print(f"\n⚠ {len(report['divergences'])} DIVERGENCE(S) — the "
                  f"deliverable and the solver disagree:")
            for d in report["divergences"]:
                print(f"  {d['analytic_quantity']} = {d['analytic_value']} "
                      f"({d['analytic_source']})")
                print(f"  {d['solver_quantity']} = {d['solver_value']} "
                      f"({d['solver_source']})")
                print(f"     ratio {d['ratio']}x — {d['verdict']}\n")
        for m in report["missing"]:
            print(f"  (skipped {m['quantity']}: {m['reason']})")

    if args.promote:
        n = promote(args.twin, report)
        print(f"\npromoted {n} solver quantities into the contract "
              f"(additive; analytic values untouched)")
    if args.enforce and report["divergences"]:
        return EXIT_DIVERGENCE
    return 0


if __name__ == "__main__":
    sys.exit(main())
