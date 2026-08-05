#!/usr/bin/env python3
"""A twin write requires an OPEN stage — the discipline, moved to where the damage happens.

INTENT (Tristan, 2026-08-04: "Getting the council to do things needs to be more
locked in. At the moment, it still seems voluntary."). He was right, and the gap
is precise.

WHAT WAS ACTUALLY ENFORCED BEFORE THIS MODULE:

    git commit of scripts/lib/** or scripts/motor-stack/**
        -> requires a FINISH council whose sha256 matches the staged diff.   ✓

    everything else                                                          ✗

The START council was enforced NOWHERE. So the sequence "do all the work, then
run start, then run finish, then commit" passed every gate — which inverts the
entire purpose, because a start council exists to challenge an approach BEFORE
it is executed. And more than a dozen scripts write a twin's `state.json` with
no gate whatsoever; that is the surface where the real damage happens.

On 2026-08-04 I edited a customer twin's state five times in one session with no
open stage: restamps run ~15 times that destroyed the DEC-009 audit lineage, a
reconstructed `dec_009_baseline_reference`, and a reconstructed
`fpkConcentricGeometry` where I chose which field to omit. That last one is
exactly the judgement a start council exists to challenge — get the omission
wrong and DEC-009 silently reverts with no record that anyone decided to.

WHAT THIS DOES. Any writer touching a twin calls `assert_stage_open()` first. It
refuses unless the twin has a stage that is genuinely OPEN: a plan-fit and a
start council on disk, no finish council for that stage yet, and the start
recent enough to plausibly be this piece of work. The failure names the exact
command to fix it.

⭐ AN OVERRIDE EXISTS AND IT LEAVES A SCAR. `TWIN_WRITE_GUARD=off` proceeds — a
guard with no escape hatch gets deleted the first time it blocks something
urgent. But every override appends to `<twin>/_discipline/guard-overrides.jsonl`
with the writer, the time and the reason from `TWIN_WRITE_GUARD_REASON`, so
"we bypassed it" is a fact on the twin rather than a thing nobody remembers.

WHAT IT DELIBERATELY DOES NOT DO. It does not check that the stage's INTENT
matches the write — no static check can. It makes it impossible to write to a
twin without having declared, and had a panel challenge, what you are doing.
That is the difference between voluntary and structural.

Exit 49 (discipline violation), consistent with p_stage_discipline.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

SCHEMA = "forgeos.guard.twin_write/v1"
EXIT_DISCIPLINE = 49
# A start council older than this is probably a previous piece of work whose
# finish was never run, not a licence for whatever is being written now.
DEFAULT_MAX_AGE_H = 12.0


class TwinWriteRefused(RuntimeError):
    """Raised when a twin write is attempted with no open stage."""


def open_stages(twin_dir: Path, max_age_h: float = DEFAULT_MAX_AGE_H,
                now: float | None = None) -> list[dict]:
    """Stages with a start council, no finish council, and a recent start."""
    disc = Path(twin_dir) / "_discipline"
    if not disc.is_dir():
        return []
    now = time.time() if now is None else now
    out: list[dict] = []
    for start in sorted(disc.glob("*-start-council.json")):
        stage = start.name[: -len("-start-council.json")]
        finish = disc / f"{stage}-finish-council.json"
        age_h = (now - start.stat().st_mtime) / 3600.0
        # A finish NEWER than the start closes the stage. A finish OLDER than it
        # belongs to a previous cycle of the same stage-id — answering a council
        # means editing code and re-running start, so the stage is open again.
        closed = finish.is_file() and finish.stat().st_mtime >= start.stat().st_mtime
        if not closed and age_h <= max_age_h:
            out.append({"stage_id": stage, "age_h": round(age_h, 2),
                        "has_plan_fit": (disc / f"{stage}-plan-fit.json").is_file(),
                        "council_is_real": _council_is_real(start)})
    return out


def _council_is_real(panel: Path) -> bool:
    """Does this start-council file contain an actual answered review?

    ⭐⭐ EXISTENCE IS NOT CONTENT (Sol, start council 2026-08-05). The first
    version authorised a stage on FILENAMES AND MTIMES alone and never opened
    the JSON — so an empty `{}` minted an EARNED pass. My own selftest wrote
    exactly that and passed, which is the letter-versus-substance family this
    guard exists to prevent, reproduced inside the guard. A checkout or a
    `touch` would have been enough to manufacture authorisation.

    Deliberately shallow: this asks whether a panel HAPPENED and was answered,
    not whether the answers were good. p_stage_discipline.finish already owns
    the deep check, and duplicating it here would give two implementations of
    one rule — the other family this repo keeps paying for.
    """
    try:
        doc = json.loads(panel.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 — unparseable is not a real council
        return False
    if not isinstance(doc, dict):
        return False
    seats = doc.get("seats")
    if not isinstance(seats, dict) or not seats:
        return False
    # Every blocking seat must have been answered somewhere.
    # A council whose blocking_seats is a string, a number or a dict is malformed,
    # not authorising — and must fail closed rather than raise inside a writer
    # (Sol, finish council 2026-08-05).
    raw_blocking = doc.get("blocking_seats") or []
    if not isinstance(raw_blocking, (list, tuple, set)):
        return False
    blocking = [s for s in raw_blocking if isinstance(s, str)]
    if len(blocking) != len(raw_blocking):
        return False
    if blocking:
        answered = {e.get("seat") for bucket in ("advice_taken", "advice_rejected")
                    for e in (doc.get(bucket) or []) if isinstance(e, dict)}
        if not set(blocking).issubset(answered):
            return False
    return True


def evaluate(stages: list[dict], writer: str, override: bool) -> dict:
    """Pure decision: may this writer proceed?"""
    usable = [s for s in stages
              if s["has_plan_fit"] and s.get("council_is_real")]
    # ⭐⭐ AN OVERRIDE BUYS PASSAGE, NEVER THE GREEN FLAG (2026-08-05, fixing my
    # own defect). The first version returned `allowed: True, reason: "override"`
    # — the SAME shape a genuinely open stage returns, differing only in a string
    # nobody downstream reads. So a consumer branching on `allowed` could not
    # distinguish "a challenged stage authorised this" from "somebody set an env
    # var". Grok Build's equivalent gets this right: its `--force` lets Path B
    # run but NEVER sets `path_b_fe_coherent`, so the escape hatch cannot mint
    # the flag that means verified.
    #
    # `allowed` now means EARNED. An override sets `overridden` instead, leaves
    # `allowed` False, and carries `earned: False` so no consumer can read it as
    # clean by accident. The caller still proceeds — assert_stage_open does not
    # raise on an override — but the RESULT tells the truth about why.
    # ⭐ ONE SHAPE FOR EVERY OUTCOME (Sol). The previous version put
    # `partial_stages` only on refusals, so a consumer deserialising into a
    # fixed schema saw the contract change with the verdict — the same defect I
    # fixed in check_detached_geometry's abstain path and then rebuilt here.
    # `may_proceed` is the field a caller should gate on; `allowed` means EARNED
    # and is deliberately narrower, so no caller has to know the rule
    # "allowed or overridden".
    def _verdict(allowed, overridden, reason):
        return {"schema": SCHEMA, "allowed": allowed, "overridden": overridden,
                "earned": allowed, "may_proceed": allowed or overridden,
                "reason": reason, "writer": writer,
                "open_stages": usable if allowed else [],
                "partial_stages": partial_now}

    partial_now = [s for s in stages
                   if not (s["has_plan_fit"] and s.get("council_is_real"))]
    # ⭐ EARNED WINS OVER OVERRIDE (Sol, finish council 2026-08-05). I had the
    # override tested FIRST, so a globally-set TWIN_WRITE_GUARD=off downgraded a
    # genuinely earned pass into an override scar and reported open_stages: []
    # — false stage reporting, and it would have written a misleading scar line
    # for work that was properly authorised. An override is a fallback for when
    # there is no earned pass, never a replacement for one.
    if usable:
        return _verdict(True, False, "open stage with an answered start council")
    if override:
        return _verdict(False, True, "override — proceeds, but not an earned pass")
    # A start council with no plan-fit is not a started stage — plan-fit is what
    # refuses when no open plan item is cited, so skipping it skips the question
    # "should this be done at all".
    return _verdict(False, False,
                    ("a stage exists but its start council is empty or unanswered, "
                     "or it has no plan-fit" if partial_now else "no open stage"))


def assert_stage_open(twin_dir: str | Path, writer: str,
                      max_age_h: float = DEFAULT_MAX_AGE_H) -> dict:
    """Refuse the write unless a stage is open. Call this BEFORE touching a twin."""
    twin = Path(twin_dir)
    override = os.environ.get("TWIN_WRITE_GUARD", "").strip().lower() in (
        "off", "0", "false", "no")
    verdict = evaluate(open_stages(twin, max_age_h), writer, override)

    if override:
        disc = twin / "_discipline"
        disc.mkdir(parents=True, exist_ok=True)
        with (disc / "guard-overrides.jsonl").open("a", encoding="utf-8") as fh:
            fh.write(json.dumps({
                "utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "writer": writer,
                "reason": os.environ.get("TWIN_WRITE_GUARD_REASON")
                          or "NO REASON GIVEN — TWIN_WRITE_GUARD_REASON was unset",
                "had_open_stage": bool(verdict.get("open_stages")),
            }) + "\n")
        return verdict

    if not verdict["allowed"] and not verdict.get("overridden"):
        raise TwinWriteRefused(
            f"REFUSED: {writer} tried to write {twin.name} with {verdict['reason']}.\n"
            f"  A twin write needs a stage that has been started AND challenged.\n"
            f"  Run:\n"
            f"    .venv/bin/python scripts/lib/p_stage_discipline.py start \\\n"
            f"        --stage-id <id> --twin {twin} \\\n"
            f"        --plan-ref \"<the OPEN plan item this serves>\" \\\n"
            f"        --intent \"<what you are about to change, and why>\"\n"
            f"  Deliberate bypass: TWIN_WRITE_GUARD=off "
            f"TWIN_WRITE_GUARD_REASON=\"...\" (recorded on the twin).")
    return verdict


def _selftest() -> int:
    import tempfile
    failures: list[str] = []

    def ck(name: str, cond: bool, why: str) -> None:
        if not cond:
            failures.append(f"{name}: {why}")

    # ⭐ FIXTURES MUST BE REALISTIC, OR THEY TEST A WORLD THAT DOES NOT EXIST.
    # These wrote `{}` for every artefact, which passed the old filename-only
    # check and would now (correctly) fail the content check. A fixture that
    # cannot occur in production proves nothing about production — the same
    # "clean fixture" anti-pattern that let `dossier_audit` compare one key to
    # itself and then walked into the live Excel as Target==Achieved==PASS.
    REAL_COUNCIL = json.dumps({
        "schema": "forgeos.p_stage_discipline.council/v1",
        "seats": {"sol": {"seat": "sol", "ok": True},
                  "grok45": {"seat": "grok45", "ok": True}},
        "blocking_seats": ["sol"],
        "advice_taken": [{"seat": "sol", "point": "a real recorded point",
                          "action": "a real recorded action long enough to count"}],
        "advice_rejected": [],
    })

    def twin(_council: str = REAL_COUNCIL, **files) -> Path:
        d = Path(tempfile.mkdtemp()); (d / "_discipline").mkdir()
        for n, age_h in files.items():
            p = d / "_discipline" / n
            p.write_text(_council if "council" in n else "{}")
            t = time.time() - age_h * 3600
            os.utime(p, (t, t))
        return d

    # ⭐ proveCatch on the REAL 2026-08-04 failure: a twin with a COMPLETED stage
    # and nothing open, being written to anyway. That is what happened five times
    # in one session, including the restamp reruns that destroyed the DEC-009
    # lineage.
    closed = twin(**{"s-plan-fit.json": 2, "s-start-council.json": 2,
                     "s-finish-council.json": 1})
    ck("proveCatch.closed_stage_refuses",
       not evaluate(open_stages(closed), "restamp", False)["allowed"],
       "a twin whose only stage was already finished accepted a write")
    try:
        assert_stage_open(closed, "apply_dec_009_em_restamp")
        ck("proveCatch.raises", False, "assert_stage_open did not raise")
    except TwinWriteRefused as exc:
        ck("proveCatch.names_the_fix", "p_stage_discipline.py start" in str(exc),
           "the refusal did not tell the caller how to proceed")

    ck("no_discipline_dir_refuses",
       not evaluate(open_stages(Path(tempfile.mkdtemp())), "w", False)["allowed"],
       "a twin with no _discipline directory accepted a write")

    # NEGATIVE CONTROL — a genuinely open stage must proceed, or every writer
    # breaks and the guard is removed within the day.
    live = twin(**{"s-plan-fit.json": 1, "s-start-council.json": 1})
    ck("negative_control.open_stage_allows",
       evaluate(open_stages(live), "w", False)["allowed"],
       "a started, unfinished stage was refused")

    # A start council with no plan-fit is not a started stage: plan-fit is the
    # part that refuses when no open plan item is cited.
    # ⭐ proveCatch on the defect Sol found: an empty council must NOT authorise.
    empty = twin("{}", **{"s-plan-fit.json": 1, "s-start-council.json": 1})
    ck("empty_council_does_not_authorise",
       not evaluate(open_stages(empty), "w", False)["allowed"],
       "a start-council file containing {} minted an EARNED pass — existence is "
       "not content")
    unanswered = twin(json.dumps({"seats": {"sol": {}}, "blocking_seats": ["sol"],
                                  "advice_taken": [], "advice_rejected": []}),
                      **{"s-plan-fit.json": 1, "s-start-council.json": 1})
    ck("unanswered_blocking_seat_does_not_authorise",
       not evaluate(open_stages(unanswered), "w", False)["allowed"],
       "a council with an unanswered blocking seat authorised a write")

    ck("earned_beats_a_global_override",
       evaluate(open_stages(live), "w", True)["allowed"] is True,
       "a globally-set override downgraded a genuinely earned pass into a scar")
    for bad in ('{"seats":{"sol":{}},"blocking_seats":"sol"}',
                '{"seats":{"sol":{}},"blocking_seats":5}',
                '{"seats":{"sol":{}},"blocking_seats":{"a":1}}'):
        b = twin(bad, **{"s-plan-fit.json": 1, "s-start-council.json": 1})
        try:
            ok = not evaluate(open_stages(b), "w", False)["allowed"]
        except Exception as exc:  # noqa: BLE001
            ok = False
            print(f"    (raised: {type(exc).__name__})")
        ck(f"malformed_blocking_seats_fails_closed[{bad[28:44]}]", ok,
           "a malformed blocking_seats authorised a write or raised inside a writer")

    ck("start_without_plan_fit_refuses",
       not evaluate(open_stages(twin(**{"s-start-council.json": 1})), "w", False)["allowed"],
       "a start council with no plan-fit counted as an open stage")

    # A stale start is a previous piece of work, not a licence for this one.
    ck("stale_start_refuses",
       not evaluate(open_stages(twin(**{"s-plan-fit.json": 99,
                                        "s-start-council.json": 99})), "w", False)["allowed"],
       "a start council from days ago authorised a write today")

    # ⭐ RE-OPENING. Answering a finish council means editing code and re-running
    # start, so a start NEWER than its finish is open again — this happened
    # sixteen times in one session and must not read as closed.
    reopened = twin(**{"s-plan-fit.json": 1, "s-finish-council.json": 3,
                       "s-start-council.json": 1})
    ck("start_newer_than_finish_is_open",
       evaluate(open_stages(reopened), "w", False)["allowed"],
       "a stage re-started after its finish council was treated as closed")

    # The override proceeds AND leaves a scar.
    scarred = twin(**{"s-plan-fit.json": 2, "s-start-council.json": 2,
                      "s-finish-council.json": 1})
    os.environ["TWIN_WRITE_GUARD"] = "off"
    os.environ["TWIN_WRITE_GUARD_REASON"] = "selftest"
    assert_stage_open(scarred, "w")
    del os.environ["TWIN_WRITE_GUARD"], os.environ["TWIN_WRITE_GUARD_REASON"]
    log = scarred / "_discipline" / "guard-overrides.jsonl"
    ck("override_leaves_a_scar", log.is_file() and "selftest" in log.read_text(),
       "an override left no record on the twin")

    # ⭐ AND IT MUST NOT LOOK LIKE AN EARNED PASS.
    ov = evaluate(open_stages(scarred), "w", True)
    ck("override.is_not_allowed", ov["allowed"] is False,
       "an override returned allowed=True — indistinguishable from a real stage")
    ck("override.is_marked_overridden", ov["overridden"] is True,
       "an override was not marked as such")
    ck("override.is_not_earned", ov["earned"] is False,
       "an override claimed an earned pass")
    earned = evaluate(open_stages(live), "w", False)
    ck("earned_pass_is_distinguishable",
       earned["allowed"] is True and earned["earned"] is True
       and earned["overridden"] is False,
       "a genuinely open stage is not distinguishable from an override")
    ck("refusal_carries_the_same_fields",
       all(k in evaluate([], "w", False) for k in
           ("allowed", "overridden", "earned", "may_proceed", "partial_stages",
            "open_stages", "reason")),
       "a refusal omits fields the other verdicts provide, so the result shape "
       "changes with the outcome")

    for line in failures:
        print(f"  - {line}")
    print("twin_write_guard selftest:", "FAILED" if failures else "OK")
    return 1 if failures else 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin")
    ap.add_argument("--writer", default="cli")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args(argv)
    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin is required unless --selftest")
    try:
        v = assert_stage_open(args.twin, args.writer)
    except TwinWriteRefused as exc:
        print(exc)
        return EXIT_DISCIPLINE
    print(f"[twin-write-guard] allowed ({v['reason']}): "
          f"{[s['stage_id'] for s in v.get('open_stages') or []]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
