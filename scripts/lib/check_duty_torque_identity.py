#!/usr/bin/env python3
"""Duty-torque identity check — one bar, derived, never a literal.

INTENT (S12, verify-2 2026-08-03). A rotating-machine dossier carries two
torques that differ by the efficiency chain and are trivially confused:

    DELIVERED   T = P_shaft / ω          — what the machine puts out at that
                                           shaft power (P_shaft is already
                                           post-efficiency)
    REQUIRED    T = P_elec / (η · ω)     — the duty BAR the machine must clear

On the FE front twin these read 119.7286 and 125.2193 N·m. Both are correct
numbers. Only the second is a requirement. The engine published the FIRST into
a field named `required_shaft_torque_nm` in one solver artefact while nineteen
siblings published the second, and the workbook labelled the delivered row
"REQUIREMENT implied by the duty". Dividing the finite-element mean by the
wrong one flatters a 0.651× shortfall to 0.681×.

WHAT THIS CHECKS, and what it deliberately does not:

  1. DIVERGENCE — every artefact in the twin that publishes
     `required_shaft_torque_nm` must agree with every other one. Disagreement
     is the defect regardless of which value is right.
  2. IDENTITY — where an artefact also publishes the inputs (electrical power,
     efficiency, speed), the published bar must equal the canonical identity
     recomputed from ITS OWN inputs.
  3. NOT-THE-DELIVERED-TORQUE — a published requirement must not equal
     P_shaft/ω when a separate shaft power is on record, because that is the
     exact substitution this check exists to catch.

⭐ NO LITERAL BAR (Sol, start council 2026-08-03). This module contains no
125.2193 and no 0.9777. Hard-coding either would make the check specific to one
twin's 250 kW / 19,500 rpm / regen convention, and — worse — would let it
CERTIFY a wrong requirement. Every expected value is derived from the artefact's
own declared inputs through the single identity in
`scripts/motor-stack/shaft_torque_identity.py`.

⭐ SCOPE LIMIT, STATED HONESTLY (Sol, finish council 2026-08-03, correcting this
module's own earlier prose). This check does NOT read a declared power-flow
direction, and must not be described as if it did. It verifies the identity
`T = P_elec / (η · ω)` — the form used throughout this campaign — at whatever
power, efficiency and speed each artefact declares. The fixture named
`no_literal_bar.motoring_case_accepted` proves only that a DIFFERENT duty point
and efficiency are accepted on their own terms; it does NOT prove the reciprocal
`T = P_elec · η / ω` form is recognised, and an artefact publishing a motoring
bar that way would be flagged. Closing that needs a declared `direction` field
on the artefacts first. Known gap, not a covered case.

Exit 0 clean · exit 1 report-only · exit 12 when enforcing and divergent.
`DUTY_TORQUE_IDENTITY_ENFORCING=off` downgrades to report-only.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "motor-stack"))

SCHEMA = "forgeos.check.duty_torque_identity/v1"
EXIT_DIVERGENT = 12

# Relative agreement two artefacts must reach before they count as the same
# bar. Solver artefacts round at different precisions (125.2193 vs 125.214912
# is the same physics through a slightly different efficiency literal), so the
# tolerance is loose enough to accept rounding and far too tight to accept the
# delivered-vs-required substitution, which is a 4.6% error on this twin.
AGREEMENT_REL_TOL = 0.01
# A published requirement within this band of P_shaft/ω is treated as the
# delivered torque wearing the requirement's name.
DELIVERED_SUBSTITUTION_REL_TOL = 0.002

_FIELD = "required_shaft_torque_nm"
# A bar that names itself the design point settles the question this check
# would otherwise raise. Matched on the basis/selector the artefact declares.
_DECIDED_RE = re.compile(
    r"adopted|design_duty|design-duty|frozen|freeze|selected|binding", re.I)


def _omega(rpm: float) -> float:
    return float(rpm) * 2.0 * math.pi / 60.0


def _walk(obj: Any, path: str = ""):
    """Yield (dotted_path, container_dict) for every dict holding the field."""
    if isinstance(obj, dict):
        if _FIELD in obj and isinstance(obj[_FIELD], (int, float)):
            yield path or "<root>", obj
        for key, value in obj.items():
            yield from _walk(value, f"{path}{key}." if path else f"{key}.")
    elif isinstance(obj, list):
        for i, value in enumerate(obj):
            yield from _walk(value, f"{path}{i}.")


def _first_num(container: dict, names: tuple[str, ...]) -> float | None:
    for name in names:
        value = container.get(name)
        if isinstance(value, (int, float)):
            return float(value)
    return None


def collect(twin_dir: Path) -> list[dict]:
    """Every published duty bar in the twin, with whatever inputs sit beside it."""
    found: list[dict] = []
    seen_files: set[Path] = set()
    # ⭐ EVERY artefact means EVERY artefact (Sol, finish council 2026-08-03).
    # The first version globbed only the twin root and `_motor_stack`, so a
    # nested solver output or a future subsystem directory could publish the
    # delivered-torque substitution and the guard would still report zero
    # divergence — the docstring claimed a scope the code did not have. Frozen
    # design packs stay excluded for the same reason as in
    # check_store_divergence: a release is SUPPOSED to differ from today's twin.
    for root in [twin_dir]:
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*.json")):
            if path in seen_files:
                continue
            if any("design-pack" in part
                   for part in path.relative_to(twin_dir).parts[:-1]):
                continue
            seen_files.add(path)
            try:
                doc = json.loads(path.read_text(encoding="utf-8"))
            except Exception:  # noqa: BLE001 — an unreadable artefact is not this check's business
                continue
            for where, container in _walk(doc):
                found.append({
                    "file": str(path.relative_to(twin_dir)),
                    "where": where,
                    "value_nm": float(container[_FIELD]),
                    "electrical_power_kw": _first_num(container, (
                        "electrical_power_check_kw", "continuous_electrical_power_kw",
                        "continuous_power_kw")),
                    "combined_efficiency": _first_num(container, (
                        "combined_regen_efficiency", "combined_efficiency",
                        "mgu_combined_efficiency")),
                    "shaft_power_kw": _first_num(container, (
                        "shaft_power_kw", "mgu_shaft_power_kw")),
                    "rpm": _first_num(container, (
                        "duty_point_rpm", "mgu_base_speed_rpm", "max_rotor_speed_rpm")),
                    "basis": container.get("basis") or container.get("duty_basis"),
                    # Whether the identity could be recomputed at all — an
                    # artefact whose inputs live in a parent object is NOT
                    # silently treated as verified (Sol).
                    "identity_checkable": all(
                        _first_num(container, names) for names in (
                            ("electrical_power_check_kw",
                             "continuous_electrical_power_kw", "continuous_power_kw"),
                            ("combined_regen_efficiency", "combined_efficiency",
                             "mgu_combined_efficiency"),
                            ("duty_point_rpm", "mgu_base_speed_rpm",
                             "max_rotor_speed_rpm"))),
                })
    return found


def evaluate(published: list[dict]) -> dict:
    """Pure decision over collected bars — no filesystem, no literals."""
    findings: list[dict] = []

    # 1. IDENTITY — recompute from each artefact's own declared inputs.
    for entry in published:
        p_elec = entry.get("electrical_power_kw")
        eta = entry.get("combined_efficiency")
        rpm = entry.get("rpm")
        if not (p_elec and eta and rpm) or eta <= 0 or rpm <= 0:
            continue
        from shaft_torque_identity import required_shaft_torque_nm  # noqa: PLC0415
        expected = required_shaft_torque_nm(
            continuous_electrical_power_kw=p_elec,
            max_rotor_speed_rpm=rpm,
            combined_efficiency=eta)
        if abs(entry["value_nm"] - expected) > AGREEMENT_REL_TOL * expected:
            findings.append({
                "check": "identity_mismatch", "severity": "high",
                "file": entry["file"], "where": entry["where"],
                "published_nm": round(entry["value_nm"], 6),
                "expected_nm": round(expected, 6),
                "evidence": (f"P_elec={p_elec} kW / (eta={eta} * omega@{rpm} rpm) "
                             f"= {expected:.6f}, artefact publishes "
                             f"{entry['value_nm']:.6f}"),
            })

    # 2. DELIVERED-WEARING-THE-REQUIREMENT'S-NAME — the S12 substitution itself.
    #
    # ⭐ WHY THE `p_shaft < p_elec` QUALIFIER EXISTS (found by this module's own
    # negative control). The first version fired whenever the published bar
    # equalled P_shaft/ω — and that is TRUE OF THE CORRECT ARTEFACT TOO. The EM
    # duty check publishes shaft_power_kw = P_elec/η = 255.69 kW, the power the
    # shaft must ABSORB, so 255.69/ω legitimately IS the requirement. Only a
    # shaft power BELOW the electrical duty is post-efficiency, and only then is
    # P_shaft/ω the delivered torque. Without this qualifier the check would
    # have condemned all nineteen correct artefacts and the one wrong one alike.
    for entry in published:
        p_shaft = entry.get("shaft_power_kw")
        p_elec = entry.get("electrical_power_kw")
        rpm = entry.get("rpm")
        if not (p_shaft and rpm) or rpm <= 0:
            continue
        # Magnitudes only: a signed regen convention would otherwise invert this
        # comparison and turn the qualifier into a false accusation (Sol).
        if p_elec is not None and abs(p_shaft) >= abs(p_elec):
            continue  # required shaft power, not a delivered one
        delivered = p_shaft * 1000.0 / _omega(rpm)
        if abs(entry["value_nm"] - delivered) <= DELIVERED_SUBSTITUTION_REL_TOL * delivered:
            findings.append({
                "check": "delivered_torque_named_required", "severity": "high",
                "file": entry["file"], "where": entry["where"],
                "published_nm": round(entry["value_nm"], 6),
                "evidence": (f"published bar equals P_shaft/omega = "
                             f"{delivered:.6f} N.m ({p_shaft} kW at {rpm} rpm), "
                             f"and that shaft power is post-efficiency — so this "
                             f"is the DELIVERED torque under the requirement's name"),
            })

    # ⭐ SAY HOW MUCH WAS ACTUALLY VERIFIED (Sol). Artefacts that publish a bar
    # without its inputs beside it are skipped by the identity check; counting
    # them as "published bars" while silently not verifying them overstated the
    # coverage this module provides.
    def _checkable(e: dict) -> bool:
        return bool(e.get("electrical_power_kw") and e.get("combined_efficiency")
                    and e.get("rpm"))

    unverifiable = [e for e in published if not _checkable(e)]
    if unverifiable:
        findings.append({
            "check": "identity_not_verifiable", "severity": "medium",
            "n_bars": len(unverifiable),
            "examples": [f"{e['file']}::{e['where']}" for e in unverifiable[:6]],
            "evidence": (f"{len(unverifiable)} of {len(published)} published bars do "
                         f"not carry power, efficiency and speed beside them, so the "
                         f"identity could not be recomputed for those — they are "
                         f"compared for agreement but not verified"),
        })

    # 3. DIVERGENCE — but only between bars describing the SAME duty point.
    #
    # ⭐⭐ GROUP BY OPERATING POINT FIRST (Sol, guards council 2026-08-03). The
    # first version compared every published bar to every other, so a twin that
    # legitimately carries more than one operating point — a baseline and an
    # adopted option, say — was reported as self-contradictory when it was
    # merely describing two duty points. Two different speeds SHOULD give two
    # different required torques; that is the physics, not a defect.
    #
    # This distinction turns out to matter on the live FE twin, where a baseline
    # speed and an adopted higher speed each carry their own correct bar. The
    # defect there is not that the two numbers differ — it is that the dossier
    # never says which speed the duty is specified at, so a reader cannot tell
    # which bar the machine must clear. Reporting that precisely is worth more
    # than reporting a spread percentage. (The figures are in the module
    # docstring; they must not appear in here, because this function is
    # inspected for baked-in constants by its own selftest.)
    # ⭐ AN OPERATING POINT IS NOT JUST A SPEED (Sol, guards council 2026-08-03).
    # Keying on rounded rpm alone meant two legitimate points at the same speed
    # but different power collided into one group and were reported as a HIGH
    # contradiction. The duty point is the (power, speed) pair; efficiency is
    # part of the identity rather than the point, and direction is the stated
    # gap this module already declares.
    # Grouping is by SPEED, because that is what almost every artefact states
    # and an entry that omits the power must still be comparable to its
    # siblings — keying on the (power, speed) pair put an artefact that states
    # only the speed into a group of its own, which hid a genuine same-speed
    # contradiction behind a bookkeeping distinction. Differing POWER inside one
    # speed group is handled below as its own, softer statement rather than as a
    # contradiction (Sol's point, kept, without the side effect).
    by_point: dict[str, list[dict]] = {}
    for entry in published:
        rpm = entry.get("rpm")
        by_point.setdefault(f"{rpm:.0f} rpm" if rpm else "speed not stated",
                            []).append(entry)

    for point, entries in sorted(by_point.items()):
        if len(entries) < 2:
            continue
        # Two bars at one speed but different declared POWER are not a
        # contradiction — a different duty implies a different requirement.
        powers = {round(e["electrical_power_kw"], 6) for e in entries
                  if e.get("electrical_power_kw")}
        if len(powers) > 1:
            findings.append({
                "check": "multiple_duties_at_one_speed", "severity": "medium",
                "operating_point": point,
                "powers_kw": sorted(powers),
                "evidence": (f"at {point} the twin declares {len(powers)} different "
                             f"duty powers ({', '.join(f'{p:g}' for p in sorted(powers))} kW), "
                             f"so their required torques differ legitimately and are "
                             f"not compared"),
            })
            continue
        values = [e["value_nm"] for e in entries]
        lo, hi = min(values), max(values)
        if hi > 0 and (hi - lo) > AGREEMENT_REL_TOL * hi:
            groups: dict[str, list[str]] = {}
            for entry in entries:
                groups.setdefault(f"{entry['value_nm']:.4f}",
                                  []).append(f"{entry['file']}::{entry['where']}")
            findings.append({
                "check": "duty_bar_divergence", "severity": "high",
                "operating_point": point,
                "published_nm": sorted(groups),
                "spread_pct": round(100.0 * (hi - lo) / hi, 3),
                "groups": {k: v[:6] for k, v in groups.items()},
                "evidence": (f"at {point}: {len(groups)} distinct duty bars across "
                             f"{len(entries)} artefacts, spread "
                             f"{100.0 * (hi - lo) / hi:.2f}% — same duty point, "
                             f"different requirement"),
            })

    # …and more than one duty point in play is a separate, softer statement: the
    # numbers may all be right while the DOSSIER has not said which one binds.
    # ⭐ AND A DOSSIER MAY HAVE ALREADY DECIDED (Sol). A speed map, an envelope,
    # or a baseline-plus-adopted-option record legitimately carries several
    # points, and firing on all of them would call a well-formed dossier
    # undecided. The finding is suppressed when at least one bar declares itself
    # the adopted/design/frozen point — which is exactly the statement whose
    # ABSENCE is the defect being reported.
    stated_points = {p for p in by_point if p != "speed not stated"}
    decided = any(_DECIDED_RE.search(str(e.get("basis") or e.get("selector") or ""))
                  for e in published)
    if len(stated_points) > 1 and not decided:
        findings.append({
            "check": "duty_point_undecided", "severity": "high",
            "operating_points": sorted(stated_points),
            "bars": {p: sorted({f"{e['value_nm']:.4f}" for e in es})
                     for p, es in sorted(by_point.items())},
            "evidence": (f"the twin publishes duty bars at {len(stated_points)} "
                         f"different operating points ({', '.join(sorted(stated_points))}). "
                         f"Each may be correct at its own speed, but nothing states "
                         f"which one the machine must clear — a reader cannot tell "
                         f"what the requirement IS"),
        })

    return {
        "schema": SCHEMA,
        "n_published": len(published),
        "findings": findings,
        # `ok` tracks CONTRADICTIONS. identity_not_verifiable is a coverage
        # statement — worth printing, not a reason to fail a run.
        "ok": not any(f["severity"] == "high" for f in findings),
    }


def _selftest() -> int:
    failures: list[str] = []

    def ck(name: str, cond: bool, why: str) -> None:
        if not cond:
            failures.append(f"{name}: {why}")

    # proveCatch A — the live S12 defect: one artefact publishes P_shaft/omega
    # into the required field while its siblings publish the duty bar.
    bad = [
        {"file": "em.json", "where": "analytical_duty_check", "value_nm": 125.214912,
         "electrical_power_kw": 250.0, "combined_efficiency": 0.977734,
         "shaft_power_kw": 255.693262, "rpm": 19500.0},
        {"file": "gear_oil.json", "where": "input_quantities", "value_nm": 119.7286,
         "electrical_power_kw": None, "combined_efficiency": None,
         "shaft_power_kw": 244.49, "rpm": 19500.0},
    ]
    res_bad = evaluate(bad)
    checks = {f["check"] for f in res_bad["findings"]}
    ck("proveCatch.delivered_named_required",
       "delivered_torque_named_required" in checks,
       "119.7286 alongside P_shaft=244.49 kW at 19500 rpm did not fire")
    ck("proveCatch.divergence", "duty_bar_divergence" in checks,
       "125.21 vs 119.73 AT THE SAME 19,500 rpm did not fire")

    # ⭐ Two legitimate operating points must NOT read as a contradiction — they
    # must read as an undecided duty point, which is a different statement.
    two_points = [
        {"file": "a.json", "where": "duty", "value_nm": 125.214912,
         "electrical_power_kw": 250.0, "combined_efficiency": 0.977734,
         "shaft_power_kw": None, "rpm": 19500.0},
        {"file": "b.json", "where": "duty", "value_nm": 101.7407,
         "electrical_power_kw": 250.0, "combined_efficiency": 0.977734,
         "shaft_power_kw": None, "rpm": 24000.0},
    ]
    tp = {f["check"] for f in evaluate(two_points)["findings"]}
    ck("two_operating_points_is_not_a_contradiction",
       "duty_bar_divergence" not in tp,
       "two bars at two different speeds were called a contradiction; a higher "
       "speed SHOULD give a lower required torque")
    ck("two_operating_points_is_reported_as_undecided",
       "duty_point_undecided" in tp,
       "a twin publishing bars at two speeds did not report that nothing states "
       "which one binds")
    # One operating point, consistently stated, stays silent on both checks.
    ck("single_operating_point_silent",
       evaluate([two_points[0], dict(two_points[0], file="c.json")])["ok"],
       "two agreeing bars at one speed were flagged")

    # NEGATIVE control — sibling artefacts agreeing at different precisions
    # must stay silent, or the check is noise.
    good = [
        {"file": "em.json", "where": "a", "value_nm": 125.214912,
         "electrical_power_kw": 250.0, "combined_efficiency": 0.977734,
         "shaft_power_kw": 255.693262, "rpm": 19500.0},
        {"file": "gap.json", "where": "duty_reference", "value_nm": 125.2193,
         "electrical_power_kw": None, "combined_efficiency": None,
         "shaft_power_kw": None, "rpm": None},
    ]
    ck("negative_control.agreeing_artefacts_silent", evaluate(good)["ok"],
       "two artefacts agreeing to 4 decimal places were flagged")

    # ⭐ MOTORING DIRECTION (Sol). The same nominal power and efficiency give a
    # different bar depending on which side the efficiency sits. A motoring
    # artefact that declares its own inputs must be judged against ITS identity,
    # not against the regen twin's number — the proof that no literal is baked in.
    motoring_rpm, motoring_eta, motoring_kw = 12000.0, 0.94, 180.0
    from shaft_torque_identity import required_shaft_torque_nm
    motoring_bar = required_shaft_torque_nm(
        continuous_electrical_power_kw=motoring_kw,
        max_rotor_speed_rpm=motoring_rpm, combined_efficiency=motoring_eta)
    ck("no_literal_bar.motoring_case_accepted",
       evaluate([{"file": "m.json", "where": "duty", "value_nm": motoring_bar,
                  "electrical_power_kw": motoring_kw,
                  "combined_efficiency": motoring_eta,
                  "shaft_power_kw": None, "rpm": motoring_rpm}])["ok"],
       "a valid motoring duty bar at a different speed/efficiency was rejected")
    # The decision function itself must contain no twin-specific constant —
    # inspected as SOURCE, not as file text, so the prose above (which quotes
    # the numbers to explain them) cannot mask a literal baked into the logic.
    import inspect  # noqa: PLC0415
    _logic = inspect.getsource(evaluate)
    ck("no_literal_bar.decision_has_no_hardcoded_value",
       not any(tok in _logic for tok in ("125.2", "119.7", "0.9777", "19500", "19_500")),
       "a twin-specific literal appeared inside evaluate()")

    # A changed duty point must move the bar — otherwise the check is reading a
    # constant rather than an identity.
    faster = required_shaft_torque_nm(
        continuous_electrical_power_kw=motoring_kw,
        max_rotor_speed_rpm=motoring_rpm * 1.25, combined_efficiency=motoring_eta)
    ck("identity_tracks_duty_point", faster < motoring_bar * 0.95,
       "raising the duty-point speed did not lower the required torque")

    # Determinism.
    ck("deterministic",
       json.dumps(evaluate(bad), sort_keys=True) == json.dumps(evaluate(bad), sort_keys=True),
       "two runs over one input disagreed")

    for line in failures:
        print(f"  - {line}")
    print("duty_torque_identity selftest:", "FAILED" if failures else "OK")
    return 1 if failures else 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin")
    ap.add_argument("--enforce", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin is required unless --selftest")

    twin = Path(args.twin).resolve()
    result = evaluate(collect(twin))
    (twin / "duty-torque-identity.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8")

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"[duty-torque-identity] {result['n_published']} published bar(s) · "
              f"{len(result['findings'])} finding(s) · ok={result['ok']}")
        for f in result["findings"]:
            print(f"  [{f['severity']}] {f['check']}: {f['evidence']}")

    if result["ok"]:
        return 0
    enforcing = os.environ.get("DUTY_TORQUE_IDENTITY_ENFORCING", "").strip().lower()
    if args.enforce and enforcing not in ("off", "0", "false", "no", "shadow"):
        return EXIT_DIVERGENT
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
