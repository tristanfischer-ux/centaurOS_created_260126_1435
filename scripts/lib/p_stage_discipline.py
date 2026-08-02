#!/usr/bin/env python3
"""P-STAGE DISCIPLINE DRIVER — the loop, as one command instead of a memory.

INTENT (Tristan 2026-08-02): "Make this STRUCTURAL, not remembered."

THE AUDIT THAT PROMPTED IT. capability_lookup_stage, stage_boundary_check,
council_precommit_review and calculation_guard all EXISTED and all had
--selftests. None of them was the loop. The live pre-commit hook was lint and
drift only — the structural block had been installed into a SIBLING checkout
because core.hooksPath pointed there. Councils were ad-hoc: no finish council
after the path-current fix, none after the baseline measurement. No stage
boundary artefact existed on the twin at all. The capability dossier was a
one-shot with both package lists empty. Every piece was built and nothing was
enforced, because running them depended on remembering to.

A discipline that depends on remembering is not a discipline. This driver makes
the loop a single command whose failure is an exit code:

    p_stage_discipline.py start  --stage-id X --intent "..." --plan-ref "..."
        -> plan fit (must cite an open plan item)
        -> capability refresh (--enforce; both package lists empty is a bug)
        -> calculation guard on the intended derivation (use the tool)
        -> START COUNCIL, advice recorded whether taken or rejected

    ... do the work ...

    p_stage_discipline.py finish --stage-id X --claim "..." --produced ...
        -> stage boundary (produced fresh? next stage's preconditions present?)
        -> FINISH COUNCIL on the staged diff and the numeric claim
        -> exit 49 unless every artefact exists and no seat blocks unrejected

Artefacts land in <twin>/_discipline/, so the record is on the twin next to the
work rather than in a session that gets compacted.

PROCEEDING AGAINST ADVICE IS ALLOWED. Silently ignoring it is not: finish
refuses while a seat's blocking finding is neither fixed nor recorded in
advice_rejected with a reason.

Exit 49 = discipline violation.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LIB = Path(__file__).resolve().parent
if str(LIB) not in sys.path:
    sys.path.insert(0, str(LIB))

EXIT_DISCIPLINE = 49
PY = os.environ.get("PY") or str(REPO_ROOT / ".venv" / "bin" / "python")


def _py() -> str:
    return PY if Path(PY).exists() else sys.executable


def discipline_dir(twin: Path) -> Path:
    d = Path(twin) / "_discipline"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _write(path: Path, payload: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return path


def _run(cmd: list[str], *, timeout: int = 900) -> tuple[int, str]:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=timeout, cwd=str(REPO_ROOT), check=False)
        return proc.returncode, (proc.stdout or "") + (proc.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, f"timed out after {timeout}s: {' '.join(cmd)}"


# ── plan fit ────────────────────────────────────────────────────────────────
def build_plan_fit(args) -> dict:
    """The stage must map to an OPEN plan item. 'While I'm here' is the enemy.

    Half this campaign's wasted effort was work nobody had asked for, started
    because it was adjacent to work someone had. A plan reference is cheap; a
    week spent on an unasked-for lane is not.
    """
    return {
        "schema": "forgeos.p_stage_discipline.plan_fit/v1",
        "stage_id": args.stage_id,
        "intent": args.intent,
        "maps_to_plan_item": args.plan_ref,
        "why_now": args.why_now,
        "explicitly_not_doing": list(args.not_doing or []),
        "depends_on": list(args.depends_on or []),
        "success_criteria": list(args.success_criteria or []),
        "ship_ok_unchanged": True,
        "twin": str(args.twin),
        "created_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


# ── council ─────────────────────────────────────────────────────────────────
START_QUESTION = (
    "This is a START council: the work has NOT been done yet. Given the plan "
    "fit and the capability dossier below, what would you challenge BEFORE it "
    "starts? Name (a) anything in the approach you believe is wrong, (b) any "
    "tool, solver, package or corpus row listed here that should be used "
    "instead of deriving something by hand, and (c) the single most likely way "
    "this stage produces a number that is confidently wrong. Reply as JSON "
    "with keys: blocking (bool), claims (list), missed (list)."
)


# Keys a seat's review uses for its findings. `blocking` is the verdict, not a
# finding; everything else that holds a list is something raised.
_NON_FINDING_KEYS = {"blocking"}


def count_findings(review: dict) -> int:
    """How many things this seat actually raised.

    A `claims` entry whose verdict is SUPPORTED is the seat AGREEING — it is not
    a finding and must not inflate the count, or an auditor that mostly agrees
    would be harder to satisfy than one that mostly objects.
    """
    total = 0
    for key, value in (review or {}).items():
        if key in _NON_FINDING_KEYS or not isinstance(value, list):
            continue
        for entry in value:
            verdict = (entry.get("verdict") if isinstance(entry, dict) else None)
            if isinstance(verdict, str) and verdict.strip().upper() == "SUPPORTED":
                continue
            total += 1
    return total


def unanswered_findings(panel: dict) -> dict:
    """Blocking seats whose findings are not all answered -> (raised, answered).

    ⭐⭐ ANSWERING IS PER FINDING, NOT PER SEAT (2026-08-02, found by an audit of
    this very function). The first version cleared a seat the moment ONE
    `advice_rejected` entry named it — so Sol could raise seven findings, have
    one rejected, and the other six passed in silence. That is the GATE INTENT
    failure reproduced inside the gate written to prevent it, and it had already
    let a real finding through: Grok's objection that the torque-scaling probe
    moved 0.4314x where halving the current predicts 0.5x went unanswered
    because an unrelated rejection had already ticked its seat.

    Deterministic and countable: a blocking seat must receive at least as many
    entries across advice_taken + advice_rejected as it raised findings. It does
    not verify WHICH finding each answer addresses — the council output carries
    no stable finding ids — but it makes silence on six of seven impossible.
    """
    # One root cause can genuinely explain several findings — MiniMax's six
    # "UNSUPPORTED" verdicts at the start council were all the same cause (the
    # council was handed no evidence). An entry may therefore declare
    # `covers: N`. That keeps every finding accounted for without demanding six
    # near-identical entries, and the count stays checkable by a reader.
    answers: dict = {}
    for bucket in ("advice_taken", "advice_rejected"):
        for entry in (panel.get(bucket) or []):
            seat = entry.get("seat")
            if not seat:
                continue
            # ⭐ Sol, third finish council: `{seat: "sol", covers: 99}` used to
            # clear every objection, and a rejection with no reason counted.
            # An answer must SAY something: a non-empty point, plus an action
            # (taken) or a why_rejected (rejected). `covers` is capped so one
            # entry cannot absorb an unbounded number of findings.
            point = str(entry.get("point") or "").strip()
            justification = str(entry.get("action")
                                or entry.get("why_rejected") or "").strip()
            if len(point) < 10 or len(justification) < 20:
                continue
            try:
                covers = max(1, int(entry.get("covers", 1)))
            except (TypeError, ValueError):
                covers = 1
            answers[seat] = answers.get(seat, 0) + min(covers, MAX_COVERS)
    # ⭐ Sol, third finish council: this iterated `blocking_seats` only, while
    # the docstring promised "every finding". A seat can return blocking=false
    # and still raise actionable items in `missed` or `generality_concerns`,
    # and those were passing in silence. Every RESPONDING seat's findings must
    # be answered, whatever its overall verdict.
    short: dict = {}
    responding = list(panel.get("seats_called")
                      or panel.get("blocking_seats") or [])
    for seat in responding:
        review = ((panel.get("seats") or {}).get(seat) or {}).get("review") or {}
        raised = count_findings(review)
        # A BLOCKING seat always needs at least one answer, even when its
        # review did not parse into countable findings — the block itself is
        # the finding. A non-blocking seat needs answers only for what it
        # actually raised, so a seat that agreed with everything is not a
        # bureaucratic obstacle.
        required = max(1, raised) if seat in (panel.get("blocking_seats") or []) \
            else raised
        given = answers.get(seat, 0)
        if given < required:
            short[seat] = (required, given)
    return short


DIFF_BUDGET_CHARS = 200_000
# One answer may account for several findings, but not for an unbounded number.
MAX_COVERS = 8


def build_review_body(claim: str, diff: str, *,
                      budget: int = DIFF_BUDGET_CHARS) -> str:
    """Assemble the diff a council sees — prioritised, and HONEST about cuts.

    ⭐⭐ SILENT TRUNCATION MADE THREE SEATS CONFIDENTLY WRONG (2026-08-02). This
    used to be `diff[:200000]`. A 278,443-char staged diff put
    `p_stage_discipline.py` at char 216,089 and the promoted flux-linkage sweeps
    at 269,582 — past the cut. All three seats then reported that the very
    changes the claim described were "not in the diff", and they were RIGHT
    about what they had been given. A review harness that quietly drops half the
    change manufactures false findings with total confidence, and costs a full
    council round to discover.

    Two fixes, both necessary:
      1. PRIORITISE. Files the claim actually names go first, so the evidence
         for the claim is never the part that gets cut.
      2. DECLARE. Whatever does not fit is listed by name and size, inside the
         prompt, so a seat can say "I cannot assess X" instead of "X is absent".
    """
    chunks: list[tuple[str, str]] = []
    current_file, buf = None, []
    for line in diff.splitlines(keepends=True):
        if line.startswith("diff --git "):
            if current_file is not None:
                chunks.append((current_file, "".join(buf)))
            current_file, buf = line.split(" b/")[-1].strip(), [line]
        else:
            buf.append(line)
    if current_file is not None:
        chunks.append((current_file, "".join(buf)))
    if not chunks:
        chunks = [("(diff)", diff)]

    lowered = claim.lower()
    def named_in_claim(path: str) -> int:
        stem = path.rsplit("/", 1)[-1]
        return 0 if (stem.lower() in lowered or path.lower() in lowered) else 1
    ordered = sorted(chunks, key=lambda c: (named_in_claim(c[0]), -len(c[1])))

    kept, dropped, used = [], [], 0
    for index, (path, body) in enumerate(ordered):
        if used + len(body) <= budget:
            kept.append(body)
            used += len(body)
        elif index == 0 and named_in_claim(path) == 0:
            # ⭐ Sol, third finish council: a single file the claim NAMES can
            # exceed the whole budget on its own, and dropping it defeats the
            # priority rule entirely. Show its head and tail with the cut
            # marked, rather than nothing.
            half = max(1, (budget - used) // 2)
            kept.append(
                body[:half]
                + f"\n… [{len(body) - 2 * half} chars of {path} elided from the "
                  f"MIDDLE of this file — it exceeds the review budget on its "
                  f"own; head and tail shown] …\n"
                + body[-half:])
            used = budget
        else:
            dropped.append((path, len(body)))

    header = ""
    if dropped:
        listing = "\n".join(f"  - {path}  ({size} chars)" for path, size in dropped)
        header = (
            "⚠ THIS DIFF IS INCOMPLETE. The following changed files did NOT fit "
            "and are NOT shown below. Do NOT report them as missing or absent "
            "from the change — you have simply not been given them. Say "
            "explicitly that you cannot assess them:\n"
            f"{listing}\n\n")
    return f"{header}DIFF:\n```diff\n{''.join(kept)}\n```"


def unrejected_blocking(panel: dict) -> list:
    """Blocking seats that are not fully answered, as a flat list of names."""
    return sorted(unanswered_findings(panel))


def call_council(claim: str, body: str, *, output: Path,
                 mode: str = "live") -> dict:
    """Run the standing seats. Records the panel whether or not it succeeded."""
    panel = {
        "schema": "forgeos.p_stage_discipline.council/v1",
        "claim": claim,
        "mode": mode,
        "called_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "seats": {},
        "seats_called": [],
        "blocking_seats": [],
        "advice_taken": [],
        "advice_rejected": [],
        "council_ok": False,
    }
    if mode == "offline":
        panel["note"] = ("council NOT called (offline mode) — a stage finished "
                         "under offline council is not reviewed and finish "
                         "will refuse it")
        _write(output, panel)
        return panel
    try:
        import council_precommit_review as cpr  # noqa: PLC0415
        import model_routing as mr  # noqa: PLC0415
        seats = {
            "grok45": (mr.DIAGNOSE.model, "corroborate"),
            "sol": (mr.PROPOSE.model, "propose"),
            "minimax_m3": (mr.AUDIT.model, "audit"),
        }
        results = cpr.review(claim, body, seats, cpr.load_api_key())
    except Exception as exc:  # noqa: BLE001 — record the failure, never crash
        panel["error"] = str(exc)
        _write(output, panel)
        return panel
    panel["seats"] = results
    panel["seats_called"] = sorted(s for s, r in results.items() if r.get("ok"))
    panel["blocking_seats"] = sorted(
        s for s, r in results.items()
        if r.get("ok") and (r.get("review") or {}).get("blocking"))
    # A council of one dead seat is not a council: maker != checker needs at
    # least two independent voices to mean anything.
    panel["council_ok"] = len(panel["seats_called"]) >= 2
    _write(output, panel)
    return panel


# ── start ───────────────────────────────────────────────────────────────────
def cmd_start(args) -> int:
    twin = Path(args.twin)
    if not twin.exists():
        print(f"[discipline] twin does not exist: {twin}")
        return EXIT_DISCIPLINE
    if not (args.plan_ref or "").strip():
        print("[discipline] --plan-ref is REQUIRED: name the open plan item "
              "this stage serves (handover section, DEC id, tracker row). "
              "Work that maps to nothing is the failure this blocks.")
        return EXIT_DISCIPLINE
    out = discipline_dir(twin)
    failures: list[str] = []

    plan_fit = build_plan_fit(args)
    plan_path = _write(out / f"{args.stage_id}-plan-fit.json", plan_fit)
    print(f"[discipline] plan fit   -> {plan_path}")

    code, log = _run([_py(), str(LIB / "capability_lookup_stage.py"),
                      "--twin", str(twin), "--enforce"])
    print(f"[discipline] capability -> exit {code}")
    if code != 0:
        failures.append(f"capability_lookup_stage exited {code}")
        print("\n".join(f"    {line}" for line in log.strip().splitlines()[-12:]))

    guard_intent = args.calculation or args.intent
    gcode, glog = _run([_py(), str(LIB / "calculation_guard.py"),
                        "--intent", guard_intent])
    print(f"[discipline] calc guard -> exit {gcode}")
    guard_lines = [line for line in glog.splitlines() if line.strip()]
    for line in guard_lines[:8]:
        print(f"    {line}")

    dossier_path = twin / "_capability" / "capability_dossier.json"
    dossier = {}
    if dossier_path.exists():
        try:
            dossier = json.loads(dossier_path.read_text())
        except Exception:  # noqa: BLE001
            dossier = {}
    capability_summary = {
        "n_solvers": dossier.get("n_solvers"),
        "n_tools": dossier.get("n_tools"),
        "packages_probed": dossier.get("packages_probed"),
        "packages_available": dossier.get("packages_available"),
        "packages_missing": dossier.get("packages_missing"),
        "corpus_tables": sorted((dossier.get("corpus") or {})
                                .get("tables", {}).keys()),
        "notes": dossier.get("notes"),
    }

    # ⭐⭐ PUT THE EVIDENCE IN FRONT OF THE COUNCIL (2026-08-02). The first live
    # start council returned three seats blocking, and MiniMax's entire audit
    # was "every claim in the intent is UNSUPPORTED" — correctly, because the
    # council was handed a plan and a capability dossier and asked to judge
    # claims whose measurements sat in artefacts it could not see. A council
    # that cannot see the evidence audits the prose. Any claim the intent
    # asserts must arrive with the artefact that backs it.
    evidence_blocks = []
    for path in (args.evidence or []):
        p = Path(path)
        if not p.exists():
            evidence_blocks.append(f"--- {p} (MISSING — claim is unbacked) ---")
            failures.append(f"evidence file does not exist: {p}")
            continue
        text = p.read_text(errors="replace")[:20000]
        evidence_blocks.append(f"--- {p} ---\n{text}")
    evidence_text = ("\n\n".join(evidence_blocks) if evidence_blocks
                     else "(none supplied — the intent must therefore assert "
                          "no measured numbers)")

    council_body = (
        f"EVIDENCE FOR CLAIMS MADE IN THE INTENT:\n{evidence_text}\n\n"
        f"PLAN FIT:\n{json.dumps(plan_fit, indent=2)}\n\n"
        f"CAPABILITY DOSSIER SUMMARY:\n"
        f"{json.dumps(capability_summary, indent=2)}\n\n"
        f"CALCULATION GUARD on {guard_intent!r}:\n"
        + "\n".join(guard_lines[:20]) + "\n\n"
        f"PROPOSED APPROACH:\n{args.approach or args.intent}\n\n"
        f"{START_QUESTION}\n")
    start_panel_path = out / f"{args.stage_id}-start-council.json"
    if getattr(args, "reuse_council", False) and start_panel_path.exists():
        panel = json.loads(start_panel_path.read_text())
        print("[discipline] start council -> reused recorded panel "
              "(answering advice must not re-bill the seats)")
    else:
        panel = call_council(
            f"START: {args.intent}", council_body,
            output=start_panel_path, mode=args.council_mode)
    print(f"[discipline] start council -> seats {panel['seats_called'] or '(none)'}"
          f"{' BLOCKING: ' + ', '.join(panel['blocking_seats']) if panel['blocking_seats'] else ''}")
    if not panel["council_ok"]:
        failures.append(
            "start council did not return at least two seats "
            f"({panel.get('error') or panel.get('note') or 'seats failed'})")
    # ⭐⭐ A START COUNCIL THAT DOES NOT BLOCK IS A LOG, NOT A GATE (Sol, finish
    # council 2026-08-02). The first version required only that two seats
    # RESPONDED, then printed "work may begin" — and the very first live run had
    # all three seats blocking and was waved through. That is the same shape as
    # every mechanism this driver was built to replace: the check ran, recorded
    # its objection, and changed nothing. Blocking seats must be answered
    # BEFORE the work, by the same mechanism `finish` uses: fix it, or record
    # the rejection with a reason.
    unrejected = unrejected_blocking(panel)
    if unrejected:
        failures.append(
            f"start council seats blocking with no recorded rejection: "
            f"{', '.join(unrejected)} — read "
            f"{out / f'{args.stage_id}-start-council.json'}, then either change "
            f"the approach or add an advice_rejected entry with a reason, and "
            f"re-run start")

    if failures:
        print("\n[discipline] START BLOCKED:")
        for f in failures:
            print(f"  - {f}")
        return EXIT_DISCIPLINE
    print("[discipline] start artefacts complete — work may begin")
    return 0


# ── finish ──────────────────────────────────────────────────────────────────
def cmd_finish(args) -> int:
    twin = Path(args.twin)
    out = discipline_dir(twin)
    failures: list[str] = []

    plan_path = out / f"{args.stage_id}-plan-fit.json"
    start_council = out / f"{args.stage_id}-start-council.json"
    if not plan_path.exists():
        failures.append(
            f"no plan fit for stage {args.stage_id!r} — this stage was never "
            f"started through the driver ({plan_path})")
    if not start_council.exists():
        failures.append(f"no start council for stage {args.stage_id!r}")
    else:
        # ⭐ Sol, third finish council: finish checked only that the start panel
        # EXISTED. An offline, failed, or hand-written stub in `_discipline`
        # therefore satisfied the start gate, and finish could then succeed on
        # work that was never reviewed before it began. The start panel must
        # meet the same bar as the finish panel.
        try:
            start_panel = json.loads(start_council.read_text())
        except Exception as exc:  # noqa: BLE001
            start_panel, exc_note = {}, str(exc)
            failures.append(f"start council for {args.stage_id!r} is unreadable:"
                            f" {exc_note}")
        if start_panel:
            if not start_panel.get("council_ok"):
                failures.append(
                    f"start council for {args.stage_id!r} was not a council "
                    "(fewer than two seats responded) — the work began "
                    "unreviewed")
            start_short = unanswered_findings(start_panel)
            if start_short:
                detail = ", ".join(f"{s} ({g} of {r})"
                                   for s, (r, g) in sorted(start_short.items()))
                failures.append(
                    f"start council for {args.stage_id!r} has unanswered "
                    f"findings: {detail}")

    produced = [str(p) for p in (args.produced or [])]
    if not produced:
        failures.append("--produced is REQUIRED: a stage that produced no "
                        "artefact produced no evidence")
    boundary_cmd = [_py(), str(LIB / "stage_boundary_check.py"),
                    "--did", args.stage_id, "--next", args.next or "(unnamed)"]
    if produced:
        boundary_cmd += ["--produced", *produced]
    if args.needs:
        boundary_cmd += ["--needs", *[str(p) for p in args.needs]]
    if args.tools:
        boundary_cmd += ["--tools", *[str(p) for p in args.tools]]
    if args.max_age_min:
        boundary_cmd += ["--max-age-min", str(args.max_age_min)]
    bcode, blog = _run(boundary_cmd)
    boundary_path = out / f"{args.stage_id}-boundary.json"
    verdict_line = next((line for line in reversed(blog.splitlines())
                         if line.strip().startswith("──")), "").strip("─ ")
    _write(boundary_path, {
        "schema": "forgeos.p_stage_discipline.boundary/v1",
        "stage_id": args.stage_id, "exit_code": bcode,
        "verdict": verdict_line, "log": blog,
        "produced": produced, "needs": [str(p) for p in (args.needs or [])],
        "checked_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    print(f"[discipline] boundary   -> {verdict_line or f'exit {bcode}'}")
    if bcode != 0 or verdict_line.upper().startswith("STOP"):
        failures.append(f"stage boundary says {verdict_line or bcode} — fix "
                        "before anything else")
        print("\n".join(f"    {line}" for line in blog.strip().splitlines()[-14:]))

    finish_path = out / f"{args.stage_id}-finish-council.json"
    if args.reuse_finish_council and finish_path.exists():
        panel = json.loads(finish_path.read_text())
        print("[discipline] finish council -> reused existing panel")
    else:
        diff_code, diff = _run(["git", "diff", "--cached"], timeout=120)
        if not diff.strip():
            diff_code, diff = _run(["git", "diff"], timeout=120)
        panel = call_council(
            args.claim, build_review_body(args.claim, diff),
            output=finish_path, mode=args.council_mode)
    print(f"[discipline] finish council -> seats "
          f"{panel.get('seats_called') or '(none)'}")
    if not panel.get("council_ok"):
        failures.append("finish council did not return at least two seats — "
                        "the claim has not been independently reviewed")
    unrejected = unrejected_blocking(panel)
    if unrejected:
        failures.append(
            f"seats blocking with no recorded rejection: {', '.join(unrejected)}"
            f" — fix the finding, or record it in advice_rejected with a "
            f"reason in {finish_path}")

    if failures:
        print("\n[discipline] FINISH BLOCKED:")
        for f in failures:
            print(f"  - {f}")
        return EXIT_DISCIPLINE
    print(f"[discipline] stage {args.stage_id} complete. Cite in the commit "
          f"body:\n  plan-fit: {plan_path}\n  start-council: {start_council}\n"
          f"  boundary: {boundary_path}\n  finish-council: {finish_path}")
    return 0


# ── selftest ────────────────────────────────────────────────────────────────
def _selftest() -> int:
    import tempfile
    fails: list[str] = []

    def ck(name: str, ok: bool, detail: str = "") -> None:
        if not ok:
            fails.append(f"{name}: {detail}")

    with tempfile.TemporaryDirectory(prefix="forge-discipline-") as tmp:
        twin = Path(tmp) / "twin"
        twin.mkdir()
        (twin / "state.json").write_text("{}")

        def start_args(**kw):
            return argparse.Namespace(
                stage_id=kw.get("stage_id", "t1"), twin=twin,
                intent="do a thing", plan_ref=kw.get("plan_ref", "HANDOVER §5.1"),
                why_now="because", not_doing=[], depends_on=[],
                success_criteria=["a number lands"], approach=None,
                calculation=None, council_mode="offline",
                evidence=kw.get("evidence", []))

        def finish_args(**kw):
            return argparse.Namespace(
                stage_id=kw.get("stage_id", "t1"), twin=twin,
                claim="X = 1.23", produced=kw.get("produced", []),
                next="next thing", needs=[], tools=[], max_age_min=None,
                council_mode="offline", reuse_finish_council=True)

        # ⭐ proveCatch: start WITHOUT a plan reference must fail. Work that
        # maps to no open item is the "while I'm here" failure mode.
        ck("start.without_plan_ref_fails",
           cmd_start(start_args(plan_ref="")) == EXIT_DISCIPLINE,
           "a stage with no plan reference was allowed to start")
        # ⭐ Grok, third finish council: this read `not X or True`, which is
        # ALWAYS TRUE — a test that cannot fail, sitting in a proveCatch block,
        # which is the decoration this whole layer exists to refuse. A start
        # that refuses for want of a plan reference must leave NO plan-fit
        # behind, or a later `finish` sees the artefact and believes the stage
        # was started properly.
        ck("start.plan_fit_not_written_on_failure",
           not (twin / "_discipline" / "t1-plan-fit.json").exists(),
           "a refused start still wrote its plan-fit")

        # ⭐ proveCatch: finish with NO start artefacts for that stage_id must
        # fail. This is the ad-hoc path the audit found — work done, claim
        # committed, no plan fit and no council anywhere on the twin.
        art = twin / "artefact.json"
        art.write_text(json.dumps({"value": 1.23, "padding": "x" * 64}))
        ck("finish.without_start_fails",
           cmd_finish(finish_args(stage_id="never-started",
                                  produced=[str(art)])) == EXIT_DISCIPLINE,
           "a stage finished without ever being started")

        # Lay down start artefacts by hand so the next cases isolate one cause.
        d = discipline_dir(twin)
        _write(d / "t2-plan-fit.json", {"stage_id": "t2"})
        _write(d / "t2-start-council.json",
               {"seats_called": ["a", "b"], "council_ok": True,
                "blocking_seats": []})

        # ⭐ proveCatch: a start panel that is a STUB must not satisfy finish.
        _write(d / "t3-plan-fit.json", {"stage_id": "t3"})
        _write(d / "t3-start-council.json", {"seats_called": [],
                                             "council_ok": False})
        _write(d / "t3-finish-council.json",
               {"seats_called": ["a", "b"], "council_ok": True,
                "blocking_seats": []})
        ck("finish.stub_start_council_fails",
           cmd_finish(finish_args(stage_id="t3", produced=[str(art)]))
           == EXIT_DISCIPLINE,
           "an offline/stub start council satisfied the start gate")

        # ⭐ proveCatch: finish with a MISSING produced artefact must fail.
        # "The file is there" has meant "from before" three times this campaign.
        ck("finish.missing_product_fails",
           cmd_finish(finish_args(stage_id="t2",
                                  produced=[str(twin / "absent.json")]))
           == EXIT_DISCIPLINE,
           "a stage finished while its own output was missing")

        # ⭐ proveCatch: finish with NO finish council must fail, even when the
        # boundary is clean. An unreviewed numeric claim is the whole gap.
        _write(d / "t2-finish-council.json",
               {"seats_called": [], "council_ok": False, "blocking_seats": []})
        ck("finish.without_council_fails",
           cmd_finish(finish_args(stage_id="t2", produced=[str(art)]))
           == EXIT_DISCIPLINE,
           "a claim was finished with no council panel")

        # ⭐ proveCatch: a BLOCKING seat with no recorded rejection must fail,
        # and the SAME panel with the rejection recorded must pass. Disagreeing
        # with the council is allowed; ignoring it silently is not.
        _write(d / "t2-finish-council.json",
               {"seats_called": ["grok45", "sol"], "council_ok": True,
                "blocking_seats": ["sol"], "advice_rejected": []})
        ck("finish.unrejected_block_fails",
           cmd_finish(finish_args(stage_id="t2", produced=[str(art)]))
           == EXIT_DISCIPLINE,
           "a blocking seat was silently ignored")
        _write(d / "t2-finish-council.json",
               {"seats_called": ["grok45", "sol"], "council_ok": True,
                "blocking_seats": ["sol"],
                "advice_rejected": [{"seat": "sol", "point": "the branch phasor check is a surrogate", "why_rejected": "necessary not sufficient, and it fails closed"}]})
        ck("finish.recorded_rejection_passes",
           cmd_finish(finish_args(stage_id="t2", produced=[str(art)])) == 0,
           "a recorded, reasoned rejection was not accepted")

        # ⭐ proveCatch: a blocking seat is unanswered until it is fixed or
        # rejected WITH A REASON — and this holds for START as well as finish.
        # The first live start council had all three seats blocking and printed
        # "work may begin", which made it a log rather than a gate.
        blocked = {"blocking_seats": ["sol", "grok45"], "advice_rejected": []}
        ck("council.blocking_seat_is_unanswered",
           unrejected_blocking(blocked) == ["grok45", "sol"],   # sorted
           f"blocking seats read as answered: {unrejected_blocking(blocked)}")
        half = {"blocking_seats": ["sol", "grok45"],
                "advice_rejected": [{"seat": "sol", "point": "the branch phasor check is a surrogate", "why_rejected": "necessary not sufficient, and it fails closed"}]}
        ck("council.partial_rejection_leaves_the_rest",
           unrejected_blocking(half) == ["grok45"],
           "rejecting one seat silenced another")
        answered = {"blocking_seats": ["sol"],
                    "advice_rejected": [{"seat": "sol", "point": "the branch phasor check is a surrogate", "why_rejected": "necessary not sufficient, and it fails closed"}]}
        ck("council.recorded_rejection_answers_the_seat",
           unrejected_blocking(answered) == [],
           "a reasoned rejection did not answer the seat")

        # ⭐⭐ proveCatch: answering is PER FINDING, not per seat. A seat that
        # raised seven findings and received one rejection is NOT answered —
        # the seat-level version let Grok's unexplained 0.4314x torque-probe
        # residual through because an unrelated rejection had ticked its seat.
        many = {"blocking_seats": ["sol"],
                "seats": {"sol": {"review": {"blocking": True,
                                             "missed": [1, 2, 3, 4],
                                             "generality_concerns": [5, 6, 7]}}},
                "advice_rejected": [{"seat": "sol", "point": "the branch phasor check is a surrogate", "why_rejected": "necessary not sufficient, and it fails closed"}]}
        ck("council.one_rejection_does_not_clear_seven_findings",
           unanswered_findings(many) == {"sol": (7, 1)},
           f"seven findings cleared by one answer: {unanswered_findings(many)}")
        many["advice_taken"] = [{"seat": "sol", "point": "the hook is not POSIX sh", "action": "rewritten with while-read and set -u; sh -n passes"}] * 6
        ck("council.answering_every_finding_clears_the_seat",
           unanswered_findings(many) == {},
           "a fully answered seat still blocked")
        # A SUPPORTED claim is the seat AGREEING and must not inflate the count,
        # or an auditor that mostly agrees is harder to satisfy than one that
        # mostly objects.
        agreeable = {"blocking": True, "claims": [
            {"verdict": "SUPPORTED"}, {"verdict": "SUPPORTED"},
            {"verdict": "OVERSTATED"}]}
        # An answer may declare that it accounts for several findings.
        covered = {"blocking_seats": ["sol"],
                   "seats": {"sol": {"review": {"blocking": True,
                                                "missed": [1, 2, 3, 4, 5]}}},
                   "advice_taken": [dict({"seat": "sol", "point": "the hook is not POSIX sh", "action": "rewritten with while-read and set -u; sh -n passes"}, covers=5)]}
        ck("council.one_answer_may_cover_several_findings",
           unanswered_findings(covered) == {},
           "a declared multi-finding answer was not accepted")
        undercovered = {**covered,
                        "advice_taken": [dict({"seat": "sol", "point": "the hook is not POSIX sh", "action": "rewritten with while-read and set -u; sh -n passes"}, covers=3)]}
        ck("council.covers_must_reach_the_finding_count",
           unanswered_findings(undercovered) == {"sol": (5, 3)},
           "an under-declared covers count passed")

        ck("council.supported_verdicts_are_not_findings",
           count_findings(agreeable) == 1,
           f"agreement counted as findings: {count_findings(agreeable)}")

        # ⭐⭐ proveCatch: the file a claim NAMES must survive the budget, and
        # anything cut must be declared. Silent truncation made three seats
        # report a present change as absent.
        big = "x" * 200_000     # must EXCEED the budget below, or nothing drops
        fake_diff = (f"diff --git a/z_filler.py b/z_filler.py\n{big}\n"
                     f"diff --git a/the_point.py b/the_point.py\n+real change\n")
        body = build_review_body("this change edits the_point.py", fake_diff,
                                 budget=160_000)
        ck("council.claimed_file_survives_the_budget",
           "+real change" in body,
           "the file the claim names was the one truncated away")
        ck("council.dropped_files_are_declared",
           "THIS DIFF IS INCOMPLETE" in body and "z_filler.py" in body,
           "a dropped file was not declared to the council")
        whole = build_review_body("anything", fake_diff, budget=10_000_000)
        ck("council.no_warning_when_nothing_is_cut",
           "THIS DIFF IS INCOMPLETE" not in whole,
           "an untruncated diff was labelled incomplete")

        # An offline council must never read as a passed council.
        panel = call_council("c", "b", output=d / "offline.json",
                             mode="offline")
        ck("council.offline_is_not_ok", not panel["council_ok"],
           "offline mode reported a healthy council")

    for f in fails:
        print(f"  FAIL {f}")
    print(f"{'FAIL' if fails else 'PASS'} p_stage_discipline selftest "
          f"({len(fails)} failures)")
    return 1 if fails else 0


def cmd_verify_panel(args) -> int:
    """Is this council panel a REAL review? For the pre-commit hook.

    ⭐ An mtime comparison alone (Sol, finish council 2026-08-02) is satisfiable
    by any freshly written panel — including one where every seat blocked and
    nothing was answered. This adds the cheap CONTENT check: at least two seats
    responded, and every finding they raised has an answer.
    """
    try:
        panel = json.loads(Path(args.panel).read_text())
    except Exception as exc:  # noqa: BLE001
        print(f"[discipline] unreadable panel {args.panel}: {exc}")
        return EXIT_DISCIPLINE
    if not panel.get("council_ok"):
        print(f"[discipline] {Path(args.panel).name}: fewer than two seats "
              "responded — not a council")
        return EXIT_DISCIPLINE
    short = unanswered_findings(panel)
    if short:
        detail = ", ".join(f"{s} ({g} of {r} answered)"
                           for s, (r, g) in sorted(short.items()))
        print(f"[discipline] {Path(args.panel).name}: unanswered findings — "
              f"{detail}")
        return EXIT_DISCIPLINE
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--selftest", action="store_true")
    sub = ap.add_subparsers(dest="cmd")

    s = sub.add_parser("start", help="plan fit + capability + guard + council")
    s.add_argument("--stage-id", required=True)
    s.add_argument("--twin", required=True, type=Path)
    s.add_argument("--intent", required=True)
    s.add_argument("--plan-ref", default="",
                   help="the OPEN plan item this serves (handover section, "
                        "DEC id, tracker row). Required.")
    s.add_argument("--why-now", default="")
    s.add_argument("--approach", default="")
    s.add_argument("--calculation", default="",
                   help="what you were about to derive; fed to calculation_guard")
    s.add_argument("--not-doing", nargs="*", default=[])
    s.add_argument("--depends-on", nargs="*", default=[])
    s.add_argument("--success-criteria", nargs="*", default=[])
    s.add_argument("--evidence", nargs="*", default=[],
                   help="artefacts backing any measured number the intent "
                        "asserts. A council that cannot see the evidence "
                        "audits the prose.")
    s.add_argument("--reuse-council", action="store_true",
                   help="reuse an already-recorded start-council panel — for "
                        "re-running start after answering its advice")
    s.add_argument("--council-mode", choices=("live", "offline"), default="live")

    f = sub.add_parser("finish", help="boundary + finish council")
    f.add_argument("--stage-id", required=True)
    f.add_argument("--twin", required=True, type=Path)
    f.add_argument("--claim", required=True)
    f.add_argument("--produced", nargs="*", default=[])
    f.add_argument("--next", default="")
    f.add_argument("--needs", nargs="*", default=[])
    f.add_argument("--tools", nargs="*", default=[])
    f.add_argument("--max-age-min", type=float)
    f.add_argument("--reuse-finish-council", action="store_true")
    f.add_argument("--council-mode", choices=("live", "offline"), default="live")

    v = sub.add_parser("verify-panel",
                       help="exit 0 only if a council panel is a real, fully "
                            "answered review (used by pre-commit)")
    v.add_argument("--panel", required=True)

    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if args.cmd == "verify-panel":
        return cmd_verify_panel(args)
    if args.cmd == "start":
        return cmd_start(args)
    if args.cmd == "finish":
        return cmd_finish(args)
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
