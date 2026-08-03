#!/usr/bin/env python3
"""Two stores, and the consumer reads the stale one — made impossible.

INTENT (S9, verify-2 2026-08-03). This is the single most-repeated defect
family in the FE front campaign — six instances by the time this module was
written, in six unrelated subsystems:

  1. parts manifest vs ontology map — twelve motor parts reported "genuinely
     absent" while 194 meshes existed
  2. state.suppliers vs partVerifications
  3. pcb-stage.json vs state.pcb
  4. measured flux/mass in _motor_stack never reaching the contract
  5. drawing-gates.json green vs state.drawingGates failing
  6. out/<twin>/pcb-stage.json (bespoke, 22 parts, NOT_FABRICATION_READY) vs
     out/<twin>/pcb/pcb-stage.json (cots-modules, 4 parts, no pipeline) —
     reading the nested one alone yields a false COTS story with no boards

Each was found by hand, each after it had already misled something. The shape
is always the same: one logical fact, two files, no rule that they agree.

WHAT THIS DOES. For each registered store family, find every copy inside a twin
and assert that all copies agree on the fields that carry meaning. It does not
care which copy is right — DISAGREEMENT IS THE DEFECT, because whichever a
consumer happens to read is then a coin toss.

WHAT IT DELIBERATELY DOES NOT DO (Sol + Grok45, start council 2026-08-03):
it does not delete, mirror or rewrite any store. Declaring one file canonical
without migrating its readers is how a stale copy keeps being read; the fix for
a fired finding is a single-writer authority decided by a human who has
enumerated the readers, and this check exists to make that decision necessary
rather than to pre-empt it.

A copy explicitly marked superseded (`superseded_by` present) is excluded — that
is the documented retirement path, and honouring it is what lets a fired finding
actually be closed.

Exit 0 clean · exit 1 report-only · exit 13 when enforcing and divergent.
`STORE_DIVERGENCE_ENFORCING=off` downgrades to report-only.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from fnmatch import fnmatch
from pathlib import Path
from typing import Any

SCHEMA = "forgeos.check.store_divergence/v1"
EXIT_DIVERGENT = 13

# Store families: a filename glob, and the fields whose disagreement is a lie
# rather than a formatting difference. Keyed by meaning, not by product — adding
# a family here covers every twin the engine will ever produce.
STORE_FAMILIES: dict[str, dict[str, Any]] = {
    "pcb_stage": {
        "glob": "pcb-stage*.json",
        "fields": ("disposition", "electronicPartCount", "NOT_FABRICATION_READY",
                   "isPcbBearing", "supplierGerbers"),
        "why": "the PCB disposition and readiness a reader would quote",
    },
    "drawing_gates": {
        "glob": "drawing-gates*.json",
        "fields": ("all_pass", "n_failing", "n_gates"),
        "why": "whether the drawing set passed",
    },
    "bar_b_readiness": {
        "glob": "*BAR-B-READINESS*.json",
        "fields": ("ship_ok",),
        "why": "the homologation ship decision",
    },
}

# A field present in one copy and absent in another is NOT a disagreement — an
# older schema simply did not record it. Only two present-and-different values
# are a divergence; silence is not a claim.
_ABSENT = object()


def _successor_exists(path: Path, successor: Any, glob: str,
                      twin_dir: Path | None = None) -> bool:
    """True only when `superseded_by` names a DIFFERENT, existing store of the
    SAME family.

    ⭐ Sol, guards council 2026-08-03: requiring merely that the pointer resolve
    was not enough. `{"superseded_by": "pcb-stage.json"}` let a file exempt
    ITSELF, and `../../any-existing-file` let it point at something unrelated —
    so a divergent store could still opt out of the guard while readers kept
    opening it. Retirement means "read that one instead", which is only
    meaningful if the successor is a real member of this store family.
    """
    if not isinstance(successor, str) or not successor.strip():
        return False
    target = (path.parent / successor).resolve()
    if not target.is_file() or target == path.resolve():
        return False
    if not fnmatch(target.name, glob):
        return False
    # ⭐ AND IT MUST STAY INSIDE THE TWIN (Sol, guards council 2026-08-03).
    # `_successor_exists` resolved an arbitrary relative path, so `../../..`
    # could point a retirement at a same-named file in a completely different
    # run — exempting a divergent store by borrowing another twin's history.
    if twin_dir is not None:
        try:
            target.relative_to(twin_dir.resolve())
        except ValueError:
            return False
    # ⭐ AND THE SUCCESSOR MUST NOT ITSELF BE RETIRED (Sol, guards council
    # 2026-08-03). Rejecting the self-pointer left a two-file cycle: A names B,
    # B names A, and each exempts the other while readers still open either one.
    # Retirement has to terminate at a LIVE store, or it is not a retirement.
    try:
        successor_doc = json.loads(target.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return False
    if isinstance(successor_doc, dict) and successor_doc.get("superseded_by"):
        return False
    return True


def _load(path: Path) -> dict | None:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None
    return doc if isinstance(doc, dict) else None


def collect(twin_dir: Path) -> dict[str, list[dict]]:
    """Every copy of every registered store family inside the twin."""
    found: dict[str, list[dict]] = {}
    for family, spec in STORE_FAMILIES.items():
        copies: list[dict] = []
        for path in sorted(twin_dir.rglob(spec["glob"])):
            # A version-stamped design pack is a FROZEN snapshot of what was
            # shipped that day. Its contents are supposed to differ from today's
            # twin — that is what a release is — so comparing them here would
            # report every historical pack as a divergence and the check would
            # be tuned out. A pack's internal consistency is a different
            # question, answered by check_deliverable_coherence.py.
            if any("design-pack" in part for part in path.relative_to(twin_dir).parts[:-1]):
                continue
            doc = _load(path)
            if doc is None:
                # ⭐ AN UNREADABLE STORE IS A FINDING, NOT A SKIP (Sol, guards
                # council 2026-08-03). Dropping it let the guard certify that
                # the remaining copies agree while a consumer opening the
                # omitted file gets a parse failure — precisely the two-store
                # hazard this module exists to remove.
                copies.append({"path": str(path.relative_to(twin_dir)),
                               "superseded": False, "unreadable": True,
                               "values": {f: _ABSENT for f in spec["fields"]}})
                continue
            copies.append({
                "path": str(path.relative_to(twin_dir)),
                # ⭐ A RETIREMENT POINTER MUST POINT SOMEWHERE (Sol, guards
                # council 2026-08-03). Any truthy `superseded_by` exempted a
                # file from the guard, so a stale store could self-exempt with
                # a made-up successor while readers kept opening it.
                "superseded": _successor_exists(path, doc.get("superseded_by"),
                                               spec["glob"], twin_dir),
                "values": {f: doc.get(f, _ABSENT) for f in spec["fields"]},
            })
        if copies:
            found[family] = copies
    return found


def evaluate(collected: dict[str, list[dict]]) -> dict:
    """Pure decision — no filesystem."""
    findings: list[dict] = []
    for family, copies in sorted(collected.items()):
        spec = STORE_FAMILIES[family]
        for broken in [c for c in copies if c.get("unreadable")]:
            findings.append({
                "check": "store_unreadable", "severity": "high",
                "family": family, "field": "(whole file)",
                "why_it_matters": spec["why"],
                "path": broken["path"],
                "evidence": (f"{broken['path']} matches this store family but could "
                             f"not be parsed — a consumer opening it gets a failure "
                             f"or a stale answer, and its agreement with the others "
                             f"cannot be established"),
            })
        live = [c for c in copies if not c["superseded"] and not c.get("unreadable")]
        if len(live) < 2:
            continue
        for field in spec["fields"]:
            stated = [(c["path"], c["values"][field]) for c in live
                      if c["values"][field] is not _ABSENT]
            distinct = {json.dumps(v, sort_keys=True, default=str) for _, v in stated}
            # ⭐ ABSENCE IS NOT A DIVERGENCE, BUT IT IS NOT NOTHING EITHER (Sol,
            # guards council 2026-08-03). Ignoring it entirely was too generous:
            # a reader of the copy that HAS NOT_FABRICATION_READY=true and a
            # reader of the copy that lacks the key do behave differently, even
            # though neither file contradicts the other. Reported as a MEDIUM
            # schema gap so it is visible, without firing HIGH on every older
            # schema in the repo — which is what made the first version
            # unusable.
            _absent = [c["path"] for c in live if c["values"][field] is _ABSENT]
            if _absent and len(stated) >= 1 and len(distinct) == 1:
                findings.append({
                    "check": "store_schema_gap", "severity": "medium",
                    "family": family, "field": field,
                    "why_it_matters": spec["why"],
                    "missing_from": _absent,
                    "evidence": (f"{len(_absent)} live copy/copies do not carry "
                                 f"{family}.{field} at all — they do not contradict "
                                 f"the others, but a consumer reading one of them "
                                 f"gets no answer where another gets one"),
                })
            if len(distinct) > 1:
                findings.append({
                    "check": "store_divergence", "severity": "high",
                    "family": family, "field": field,
                    "why_it_matters": spec["why"],
                    "stated": [{"path": p, "value": v} for p, v in stated],
                    "evidence": (f"{len(distinct)} different values for "
                                 f"{family}.{field} across {len(stated)} live "
                                 f"copies — a consumer's answer depends on which "
                                 f"file it happened to open"),
                })
    return {
        "schema": SCHEMA,
        "families_seen": sorted(collected),
        "findings": findings,
        # `ok` tracks CONTRADICTIONS only. A schema gap is worth showing and is
        # not a reason to fail a run: the copies still agree wherever they both
        # speak.
        "ok": not any(f["severity"] == "high" for f in findings),
    }


def _selftest() -> int:
    failures: list[str] = []

    def ck(name: str, cond: bool, why: str) -> None:
        if not cond:
            failures.append(f"{name}: {why}")

    # ⭐ proveCatch on the REAL 2026-08-03 defect, not a synthetic fixture: the
    # root store said bespoke / 22 parts / NOT_FABRICATION_READY while the
    # nested store said cots-modules / 4 parts and had never heard of a board.
    real = {"pcb_stage": [
        {"path": "pcb-stage.json", "superseded": False,
         "values": {"disposition": "bespoke", "electronicPartCount": 22,
                    "NOT_FABRICATION_READY": True, "isPcbBearing": True,
                    "supplierGerbers": False}},
        {"path": "pcb/pcb-stage.json", "superseded": False,
         "values": {"disposition": "cots-modules", "electronicPartCount": 4,
                    "NOT_FABRICATION_READY": _ABSENT, "isPcbBearing": True,
                    "supplierGerbers": _ABSENT}},
    ]}
    res = evaluate(real)
    # Only DIVERGENCE findings count for these assertions — a schema gap now
    # names the same field at a lower severity, and conflating the two would
    # make the negative control pass for the wrong reason.
    fields = {f["field"] for f in res["findings"] if f["check"] == "store_divergence"}
    ck("proveCatch.disposition", "disposition" in fields,
       "bespoke vs cots-modules did not fire")
    ck("proveCatch.part_count", "electronicPartCount" in fields,
       "22 vs 4 electronic parts did not fire")

    # ⭐ SILENCE IS NOT A CLAIM. The nested copy has no NOT_FABRICATION_READY at
    # all; treating absent-vs-True as a disagreement would flag every older
    # schema in the repo and the check would be ignored within a week.
    ck("absent_field_is_not_divergence", "NOT_FABRICATION_READY" not in fields,
       "a field present in one copy and absent in the other was called a divergence")
    # …but it must still be VISIBLE as a schema gap, at a lower severity.
    _gaps = [f for f in res["findings"] if f["check"] == "store_schema_gap"]
    ck("absent_field_is_reported_as_a_gap",
       any(f["field"] == "NOT_FABRICATION_READY" for f in _gaps),
       "a field missing from one live copy was silently ignored")
    ck("schema_gap_is_not_high",
       all(f["severity"] == "medium" for f in _gaps),
       "a schema gap was raised at the same severity as a real contradiction")

    # NEGATIVE CONTROL — agreeing copies stay silent.
    agree = {"pcb_stage": [
        {"path": "a.json", "superseded": False,
         "values": {"disposition": "bespoke", "electronicPartCount": 22,
                    "NOT_FABRICATION_READY": True, "isPcbBearing": True,
                    "supplierGerbers": False}},
        {"path": "b/a.json", "superseded": False,
         "values": {"disposition": "bespoke", "electronicPartCount": 22,
                    "NOT_FABRICATION_READY": True, "isPcbBearing": True,
                    "supplierGerbers": False}},
    ]}
    ck("negative_control.agreeing_copies_silent", evaluate(agree)["ok"],
       "two identical stores were flagged")

    # A single store can never diverge from itself.
    ck("single_store_silent",
       evaluate({"pcb_stage": [real["pcb_stage"][0]]})["ok"],
       "one lone store was flagged")

    # ⭐ THE RETIREMENT PATH MUST WORK, or a fired finding can never be closed
    # and the check becomes something people route around.
    retired = {"pcb_stage": [dict(real["pcb_stage"][0]),
                             dict(real["pcb_stage"][1], superseded=True)]}
    ck("superseded_copy_excluded", evaluate(retired)["ok"],
       "a copy marked superseded_by still counted as a live store")

    # ⭐ The retirement pointer is validated on disk, so prove it end to end:
    # a self-pointer, a cycle and a foreign target must all FAIL to exempt.
    import tempfile as _tf2  # noqa: PLC0415
    _d = Path(_tf2.mkdtemp())
    (_d / "pcb-stage.json").write_text(json.dumps({"disposition": "bespoke"}))
    (_d / "other.json").write_text("{}")
    _cases = {
        "self": {"superseded_by": "pcb-stage-b.json"},
        "cycle": {"superseded_by": "pcb-stage.json"},
        "foreign": {"superseded_by": "other.json"},
    }
    ck("retirement.self_pointer_does_not_exempt",
       not _successor_exists(_d / "pcb-stage-b.json",
                             _cases["self"]["superseded_by"], "pcb-stage*.json"),
       "a store naming itself as its own successor exempted itself")
    (_d / "pcb-stage.json").write_text(json.dumps(
        {"disposition": "bespoke", "superseded_by": "pcb-stage-b.json"}))
    ck("retirement.cycle_does_not_exempt",
       not _successor_exists(_d / "pcb-stage-b.json",
                             _cases["cycle"]["superseded_by"], "pcb-stage*.json"),
       "A->B and B->A exempted each other; retirement must end at a live store")
    ck("retirement.foreign_target_does_not_exempt",
       not _successor_exists(_d / "pcb-stage-b.json",
                             _cases["foreign"]["superseded_by"], "pcb-stage*.json"),
       "a pointer at an unrelated file exempted a divergent store")

    ck("deterministic",
       json.dumps(evaluate(real), sort_keys=True, default=str)
       == json.dumps(evaluate(real), sort_keys=True, default=str),
       "two runs over one input disagreed")

    # ⭐⭐ THE CLI IS PART OF THE CHECK (Sol, guards council 2026-08-03). The
    # schema-gap finding shipped with a KeyError on the default text path and
    # every assertion above still passed, because they all call evaluate() and
    # none of them calls main(). A guard that crashes while reporting is a guard
    # that does not report. Drive the real entrypoint over a real directory.
    import subprocess, sys as _sys, tempfile as _tf  # noqa: PLC0415
    _d = Path(_tf.mkdtemp()); (_d / "pcb").mkdir()
    (_d / "pcb-stage.json").write_text(json.dumps(
        {"disposition": "bespoke", "electronicPartCount": 22,
         "NOT_FABRICATION_READY": True}))
    (_d / "pcb" / "pcb-stage.json").write_text(json.dumps(
        {"disposition": "cots-modules", "electronicPartCount": 4}))
    _r = subprocess.run([_sys.executable, str(Path(__file__).resolve()),
                         "--twin", str(_d)], capture_output=True, text=True)
    ck("cli.text_mode_does_not_crash", "Traceback" not in _r.stderr,
       f"the default CLI raised while reporting: {_r.stderr.strip()[-200:]}")
    ck("cli.reports_the_divergence", "store_divergence" in _r.stdout or
       "disposition" in _r.stdout,
       f"the CLI did not report the divergence it found: {_r.stdout.strip()[:200]}")
    _rj = subprocess.run([_sys.executable, str(Path(__file__).resolve()),
                          "--twin", str(_d), "--json"], capture_output=True, text=True)
    ck("cli.json_mode_does_not_crash", "Traceback" not in _rj.stderr,
       f"--json raised while reporting: {_rj.stderr.strip()[-200:]}")

    for line in failures:
        print(f"  - {line}")
    print("store_divergence selftest:", "FAILED" if failures else "OK")
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
    (twin / "store-divergence.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8")

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"[store-divergence] {len(result['families_seen'])} family(ies) · "
              f"{len(result['findings'])} finding(s) · ok={result['ok']}")
        for f in result["findings"]:
            print(f"  [{f['severity']}] {f['family']}.{f['field']}: {f['evidence']}")
            # ⭐ A SCHEMA GAP HAS NO `stated` LIST (Sol, guards council
            # 2026-08-03). This loop indexed it unconditionally, so the very
            # finding type added in the previous revision crashed the default
            # CLI with a KeyError after writing its result file. The selftest
            # did not catch it because it exercises evaluate() and never main() —
            # a pure-function test cannot see a reporting bug.
            for s in f.get("stated") or []:
                print(f"        {s['path']}: {s['value']!r}")
            for miss in f.get("missing_from") or []:
                print(f"        {miss}: (field absent)")

    if result["ok"]:
        return 0
    enforcing = os.environ.get("STORE_DIVERGENCE_ENFORCING", "").strip().lower()
    if args.enforce and enforcing not in ("off", "0", "false", "no", "shadow"):
        return EXIT_DIVERGENT
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
