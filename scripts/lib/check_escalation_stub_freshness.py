#!/usr/bin/env python3
"""Escalation stubs that outlived the failure they escalated.

INTENT (S11, verify-2 2026-08-03). When a drawing gate fails repeatedly the
harness writes `tasks/harness-stubs/ESCALATE__<class>__<gate>.md` saying the
gate "has now failed 3x — dispatch a coding-council on the fix-stage ...".
Nothing ever retracts it. Fix the gate, watch all 23 go green, and the stub sits
there telling the next agent to reopen a solved problem. Four such stubs were
deleted by hand on 2026-08-03; three more were still open at verify-2 while
their gates read all_pass=true, n_failing=0.

This is the same snapshot-artefact family as the stale readiness register and
the stale motor-stack screens: an artefact that records a CONCLUSION and has no
mechanism to invalidate itself.

⭐ WHY THIS REPORTS AND DOES NOT DELETE (Sol + Grok45, start council 2026-08-03).
"The gate is green now" is NOT sufficient evidence to retract an escalation. The
gate result can be older than the stub, belong to a different twin or revision,
be non-enforced, or — the case that actually matters here — the gate may not
have RUN, because its drawing was skipped as out of scope. A green tick from a
gate that never executed is precisely the failure mode this campaign has paid
for most often, and auto-retracting on it would turn an auditable escalation
record into a volatile status cache. So a stub is only ever reported as
RETRACTABLE, with the evidence printed, and a human or a follow-up commit
archives it.

Three outcomes per stub, never two:
  LIVE          the gate is still failing — the escalation stands
  RETRACTABLE   all gates pass, the artefact is newer than the stub, and the
                twin matches — safe to archive, with the evidence shown
  UNVERIFIABLE  no gate artefact, an older one, or a twin that does not match —
                the stub stays, and the reason it could not be cleared is stated

Exit 0 clean · exit 1 report-only · exit 14 when enforcing and stubs are stale.
`STUB_FRESHNESS_ENFORCING=off` downgrades to report-only.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = "forgeos.check.escalation_stub_freshness/v1"
EXIT_STALE = 14
STUB_DIR = REPO_ROOT / "tasks" / "harness-stubs"
_STUB_RE = re.compile(r"^ESCALATE__(?P<cls>.+?)__(?P<gate>.+)\.md$")
_TWIN_RE = re.compile(r"Latest:\s*(?P<twin>\S+)")


def _rel(path: Path) -> str:
    """Repo-relative when possible, absolute otherwise — never raises."""
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def collect(stub_dir: Path, twin_dir: Path | None) -> list[dict]:
    """Every escalation stub, paired with the live gate artefact when reachable."""
    stubs: list[dict] = []
    if not stub_dir.is_dir():
        return stubs
    for path in sorted(stub_dir.glob("ESCALATE__*.md")):
        m = _STUB_RE.match(path.name)
        if not m:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        named = _TWIN_RE.search(text)
        # ⭐ FULL PATH, NOT BASENAME (Sol, guards council 2026-08-03). Reducing
        # `Latest:` to Path(...).name meant two different runs whose directories
        # share a basename were treated as the same twin, so a green artefact
        # from one run could retract a stub raised against another.
        named_twin_path = str(Path(named.group("twin")).resolve()) if named else None
        named_twin = Path(named.group("twin")).name if named else None
        gates_doc = None
        gates_path = None
        if twin_dir is not None and (twin_dir / "drawing-gates.json").is_file():
            gates_path = twin_dir / "drawing-gates.json"
            try:
                gates_doc = json.loads(gates_path.read_text(encoding="utf-8"))
            except Exception:  # noqa: BLE001
                gates_doc = None
        stubs.append({
            # ⭐ --stub-dir is advertised as configurable, so it must work
            # outside the repo (CI sandboxes, temp dirs). relative_to() raised
            # ValueError on any such path (Sol, guards council 2026-08-03).
            "stub": _rel(path),
            "product_class": m.group("cls"),
            "gate": m.group("gate"),
            # ⭐ FULL RESOLUTION (Sol). int() threw away the sub-second part, so an
            # artefact written 200 ms AFTER the stub compared equal and was
            # rejected as not-strictly-newer. The truncation was mine, not the
            # filesystem's, and it made normal rapid CI writes permanently
            # UNVERIFIABLE.
            "stub_mtime": path.stat().st_mtime,
            "named_twin": named_twin,
            "named_twin_path": named_twin_path,
            "live_twin": twin_dir.name if twin_dir else None,
            "live_twin_path": str(twin_dir.resolve()) if twin_dir else None,
            "gates": gates_doc,
            "gates_mtime": gates_path.stat().st_mtime if gates_path else None,
        })
    return stubs


def classify(stub: dict) -> dict:
    """Pure decision for ONE stub — LIVE | RETRACTABLE | UNVERIFIABLE."""
    gates = stub.get("gates")
    if not isinstance(gates, dict):
        return {**_hdr(stub), "state": "UNVERIFIABLE",
                "why": "no drawing-gates.json was reachable for this twin"}
    # ⭐ AN UNIDENTIFIED TWIN IS WEAKER EVIDENCE THAN A WRONG ONE (Sol, guards
    # council 2026-08-03). The first version only rejected a MISMATCHED twin, so
    # a legacy or malformed stub with no parseable `Latest:` line silently paired
    # with whatever twin happened to be passed on the command line.
    if not stub.get("named_twin"):
        return {**_hdr(stub), "state": "UNVERIFIABLE",
                "why": ("the stub names no twin, so no gate artefact can be shown "
                        "to be about the failure it escalated")}
    _np, _lp = stub.get("named_twin_path"), stub.get("live_twin_path")
    if _np and _lp and _np != _lp:
        return {**_hdr(stub), "state": "UNVERIFIABLE",
                "why": (f"the stub escalated on {_np} but the gate artefact "
                        f"belongs to {_lp} — same basename is not the same twin")}
    if stub.get("live_twin") and stub["named_twin"] != stub["live_twin"]:
        return {**_hdr(stub), "state": "UNVERIFIABLE",
                "why": (f"the stub escalated on twin {stub['named_twin']} but the "
                        f"gate artefact belongs to {stub['live_twin']} — a green "
                        f"gate on a different twin proves nothing about this one")}
    # ⭐ STRICTLY NEWER, NOT MERELY NOT-OLDER (Sol). mtime is second-resolution on
    # these filesystems, so a gate result written in the same second as the
    # escalation — or just before it — compared equal and was accepted as proof.
    if stub.get("gates_mtime") is not None and stub["gates_mtime"] <= stub["stub_mtime"]:
        return {**_hdr(stub), "state": "UNVERIFIABLE",
                "why": ("the gate artefact is not strictly newer than the escalation "
                        "(mtime resolution is one second) — it cannot be evidence "
                        "about a failure recorded at or after it was written")}
    # ⭐ A SCHEMA-MALFORMED ARTEFACT IS UNVERIFIABLE, NOT A CRASH (Sol, guards
    # council 2026-08-03). `drawings` was assumed to be a dict of dicts; a list,
    # a string, or entries that are not objects raised instead of producing one
    # of the three promised outcomes.
    _drawings = gates.get("drawings")
    if not isinstance(_drawings, dict) or not all(
            isinstance(v, dict) for v in _drawings.values()):
        return {**_hdr(stub), "state": "UNVERIFIABLE",
                "why": ("the gate artefact does not carry a well-formed `drawings` "
                        "map, so no evidence about this gate can be read from it")}
    # ⭐ A VACUOUS PASS IS NOT A PASS (Sol, guards council 2026-08-03).
    # `{"all_pass": true, "n_gates": 0, "drawings": {}}` is trivially true and
    # would have retracted a live escalation on the strength of a run in which
    # nothing executed — the purest form of the green-tick-that-cannot-go-red
    # defect this campaign has been chasing all day.
    _evaluated = [d for d, v in _drawings.items() if v.get("status") != "skipped"]
    if not gates.get("n_gates") or not _evaluated:
        return {**_hdr(stub), "state": "UNVERIFIABLE",
                "why": (f"the gate run evaluated nothing "
                        f"(n_gates={gates.get('n_gates')}, "
                        f"{len(_evaluated)} drawing(s) not skipped) — an all_pass "
                        f"over an empty run is vacuous, not evidence")}
    failing = [d for d, v in _drawings.items() if v.get("failing_gates")]
    if not gates.get("all_pass") or gates.get("n_failing"):
        # ⭐ THE LIMIT IS SYMMETRIC (Sol, guards council 2026-08-03). If an
        # all-pass aggregate cannot prove THIS gate ran, a red aggregate cannot
        # prove THIS gate is the one failing. LIVE is the safe direction — an
        # escalation staying open costs nothing — but the caveat has to be
        # stated or the asymmetry is just a bias dressed as a rule.
        return {**_hdr(stub), "state": "LIVE",
                "why": (f"drawing gates still failing "
                        f"(n_failing={gates.get('n_failing')}, drawings={failing})"),
                "caveat": (f"the artefact enumerates drawings, not gate ids, so this "
                           f"shows SOME gate is failing — not necessarily "
                           f"'{stub.get('gate')}'. The escalation stays open because "
                           f"that is the direction that cannot do harm")}
    # ⭐⭐ A GREEN AGGREGATE IS NOT PROOF THAT *THIS* GATE RAN (Sol — the deepest
    # of the three). all_pass says every gate that EXECUTED passed. It cannot
    # distinguish "the escalated gate ran and passed" from "the gate catalogue
    # changed", "the gate was renamed", or "its scope no longer includes this
    # drawing". Retracting on that is the same class of error as reading a
    # skipped drawing as a covered one. So: unless the artefact NAMES the gate
    # this stub escalated, the honest answer is that we cannot tell.
    #
    # My first attempt at this returned UNVERIFIABLE whenever the artefact did
    # not name the gate — and that was wrong in a way worth recording, because
    # it would have made the check useless. `drawing-gates.json` is keyed by
    # DRAWING, and gate names appear only inside `failing_gates`. On an all-pass
    # artefact NO gate is ever named, so that rule made every single retraction
    # unverifiable. The limit is real; refusing to answer is not the way to
    # state it. So RETRACTABLE still exists, and it now carries the limit
    # explicitly: what is established is "no gate failed", NOT "this gate ran".
    skipped = sorted(d for d, v in _drawings.items()
                     if v.get("status") == "skipped")
    caveats = [
        (f"the artefact enumerates drawings, not gate ids, so what is established "
         f"is that NO gate failed — not that '{stub.get('gate')}' itself ran. A "
         f"renamed, rescoped or dropped gate would look identical here"),
    ]
    if skipped:
        caveats.append(
            f"{len(skipped)} drawing(s) were skipped as out of scope "
            f"({', '.join(skipped)}) — gates scoped to those did not run")
    return {**_hdr(stub), "state": "RETRACTABLE",
            "why": (f"all {gates.get('n_gates')} gates pass with 0 failing on this "
                    f"twin, and the artefact is strictly newer than the stub"),
            "caveat": "; ".join(caveats)}


def _hdr(stub: dict) -> dict:
    return {k: stub[k] for k in ("stub", "product_class", "gate")}


def evaluate(stubs: list[dict]) -> dict:
    results = [classify(s) for s in stubs]
    retractable = [r for r in results if r["state"] == "RETRACTABLE"]
    return {
        "schema": SCHEMA,
        "n_stubs": len(results),
        "results": results,
        "n_retractable": len(retractable),
        "n_live": sum(1 for r in results if r["state"] == "LIVE"),
        "n_unverifiable": sum(1 for r in results if r["state"] == "UNVERIFIABLE"),
        # A retractable stub IS the defect: it is a live instruction to redo
        # closed work. Silence about it is how the last four survived.
        "ok": not retractable,
    }


def _selftest() -> int:
    failures: list[str] = []

    def ck(name: str, cond: bool, why: str) -> None:
        if not cond:
            failures.append(f"{name}: {why}")

    green = {"all_pass": True, "n_gates": 23, "n_failing": 0,
             "drawings": {"renders": {"status": "pass", "failing_gates": []}}}
    base = {"stub": "s.md", "product_class": "formula_e_front_mgu",
            "gate": "drawing_material_diversity", "stub_mtime": 100,
            "named_twin": "twin-a", "live_twin": "twin-a",
            "gates": green, "gates_mtime": 200}

    # ⭐ proveCatch on the REAL 2026-08-03 stubs: gates green, stub still open.
    ck("vacuous_all_pass_does_not_retract",
       classify(dict(base, gates={"all_pass": True, "n_gates": 0,
                                  "drawings": {}}))["state"] == "UNVERIFIABLE",
       "an all_pass over a run that evaluated nothing was accepted as proof")
    ck("all_skipped_does_not_retract",
       classify(dict(base, gates={"all_pass": True, "n_gates": 23, "n_failing": 0,
                                  "drawings": {"pid": {"status": "skipped",
                                                       "failing_gates": []}}}
                     ))["state"] == "UNVERIFIABLE",
       "a run in which every drawing was skipped was accepted as proof")
    ck("proveCatch.green_gate_stale_stub_fires",
       classify(base)["state"] == "RETRACTABLE",
       "a stub whose gate now passes was not reported retractable")
    ck("proveCatch.evaluate_not_ok", not evaluate([base])["ok"],
       "a retractable stub did not make the run fail")

    # NEGATIVE CONTROL — a genuinely failing gate keeps its escalation.
    red = dict(green, all_pass=False, n_failing=2,
               drawings={"renders": {"status": "fail",
                                     "failing_gates": ["material_diversity"]}})
    ck("negative_control.failing_gate_stays_live",
       classify(dict(base, gates=red))["state"] == "LIVE",
       "a still-failing gate was offered for retraction")

    # ⭐ The three ways a green tick is NOT evidence (start council).
    ck("older_artefact_is_not_evidence",
       classify(dict(base, gates_mtime=50))["state"] == "UNVERIFIABLE",
       "a gate result older than the escalation was accepted as proof")
    ck("other_twin_is_not_evidence",
       classify(dict(base, live_twin="twin-b"))["state"] == "UNVERIFIABLE",
       "a green gate on a different twin was accepted as proof")
    ck("missing_artefact_is_not_evidence",
       classify(dict(base, gates=None))["state"] == "UNVERIFIABLE",
       "an absent gate artefact was treated as a pass")

    # A skipped drawing must be DISCLOSED, not silently counted as coverage.
    skipped = dict(green, drawings=dict(green["drawings"],
                                        pid={"status": "skipped", "failing_gates": []}))
    ck("skipped_drawings_disclosed",
       classify(dict(base, gates=skipped)).get("caveat") is not None,
       "a skipped drawing was not disclosed on a retraction recommendation")

    ck("deterministic",
       json.dumps(evaluate([base]), sort_keys=True)
       == json.dumps(evaluate([base]), sort_keys=True),
       "two runs over one input disagreed")

    # ⭐ THE ADVERTISED FLAG MUST WORK WHERE IT IS ADVERTISED (Sol + MiniMax,
    # guards council 2026-08-03). --stub-dir is documented as configurable but
    # crashed on path.relative_to(REPO_ROOT) for any directory outside the repo,
    # and the "verified against /tmp" claim existed only in a commit message.
    import subprocess, sys as _sys, tempfile as _tf  # noqa: PLC0415
    _sd = Path(_tf.mkdtemp())
    (_sd / "ESCALATE__demo_class__drawing_material_diversity.md").write_text(
        "# ESCALATE: recurring loss\n\nLatest: /somewhere/twin-x @ abc123\n")
    _twin = Path(_tf.mkdtemp())
    (_twin / "drawing-gates.json").write_text(json.dumps(
        {"all_pass": True, "n_gates": 23, "n_failing": 0, "drawings": {}}))
    _r = subprocess.run([_sys.executable, str(Path(__file__).resolve()),
                         "--stub-dir", str(_sd), "--twin", str(_twin)],
                        capture_output=True, text=True)
    ck("cli.stub_dir_outside_repo_does_not_crash", "Traceback" not in _r.stderr,
       f"an out-of-repo --stub-dir raised: {_r.stderr.strip()[-200:]}")
    ck("cli.every_state_prints_its_reason",
       "UNVERIFIABLE" in _r.stdout and "twin" in _r.stdout,
       f"a non-retractable stub printed no reason in text mode: "
       f"{_r.stdout.strip()[:200]}")

    for line in failures:
        print(f"  - {line}")
    print("escalation_stub_freshness selftest:", "FAILED" if failures else "OK")
    return 1 if failures else 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin")
    ap.add_argument("--stub-dir", default=str(STUB_DIR))
    ap.add_argument("--enforce", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    if args.selftest:
        return _selftest()

    twin = Path(args.twin).resolve() if args.twin else None
    result = evaluate(collect(Path(args.stub_dir), twin))
    if twin is not None:
        (twin / "escalation-stub-freshness.json").write_text(
            json.dumps(result, indent=2) + "\n", encoding="utf-8")

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"[stub-freshness] {result['n_stubs']} stub(s) · "
              f"{result['n_live']} live · {result['n_retractable']} retractable · "
              f"{result['n_unverifiable']} unverifiable")
        # ⭐ EVERY STATE PRINTS ITS REASON (Sol, guards council 2026-08-03). The
        # first version printed only RETRACTABLE, so the promise that an
        # UNVERIFIABLE stub always states why it could not be cleared was true
        # of the JSON and false of the output a human or CI actually reads.
        for r in result["results"]:
            print(f"  [{r['state']}] {r['stub']}")
            print(f"       {r['why']}")
            if r.get("caveat"):
                print(f"       caveat: {r['caveat']}")

    if result["ok"]:
        return 0
    enforcing = os.environ.get("STUB_FRESHNESS_ENFORCING", "").strip().lower()
    if args.enforce and enforcing not in ("off", "0", "false", "no", "shadow"):
        return EXIT_STALE
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
