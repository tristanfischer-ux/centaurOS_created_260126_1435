#!/usr/bin/env python3
"""Model routing for second opinions, physics escalation, and claim auditing.

CODIFIED FROM TRISTAN'S BENCHMARK READ (2026-08-01). Verbatim premises:

  * CritPt (research-level physics reasoning) TOPS OUT AT 32%. The best model
    in the world gets roughly two-thirds of research-level physics wrong.
  * GPQA Diamond is SATURATED — ten models sit at 92-94%, so it no longer
    discriminates. Picking a model on GPQA is picking on noise.
  * THEREFORE: no model is a VALIDATOR for magnetics or electromagnetics. They
    are hypothesis generators and method reviewers. Validation stays with
    xfemm, the solvers, and the gate registry. This is not a hedge; it is what
    a 32% ceiling means.
  * The two abilities needed are ANTI-CORRELATED. The model best at physics is
    close to worst at admitting when it does not know.

That last point is not abstract. On 2026-08-01 a Sol/Grok/Kimi panel returned
three confident faults on this engine's FE front MGU. All three were
implemented. The advance-sign one now looks WRONG — the evidence used to pick
the sign was aliased, and the panel's confidence carried it through anyway. The
slot-opening change is still an unvalidated model fix sitting in the deck. That
is precisely the predicted failure mode: "a confident, sophisticated, wrong
answer on slot opening".

THE TRIAD — maker != checker across three lineages. REVISED 2026-08-01 from
the in-anger record (see the block above the Seat definitions); the original
benchmark-only routing is kept there for provenance.

    DIAGNOSE  Grok 4.5     $2.67  standing second opinion; 3/3 returned and it
                                  named the campaign-defining fault
    PROPOSE   GPT-5.6 Sol  $9.17  CODE REVIEW; found every pre-commit defect
    AUDIT     MiniMax-M3   $0.45  is this claim supported by what was given?

Usage rules, from the record and the numbers:

  1. Grok 4.5 is the STANDING SECOND OPINION for diagnosis — cheapest reliable
     seat, and the only one that was right about the defining fault before it
     was measured. It REPLACES GLM-5.2, which returned only 2 of 4 times.
  2. Sol is the CODE-REVIEW seat, not the domain-advice seat. It found all four
     pre-commit defects; it also produced the worst domain advice of the day
     (a slot-opening change true of real machines and wrong for this deck).
     Never accept its domain reasoning unchecked — ~18% non-hallucination.
  3. MiniMax-M3 CANNOT do the physics (CritPt 4%). Do not ask it to. Ask it the
     different question: is this claim actually supported by what was given?
  4. Swap the auditor to Qwen3.7 Max ($1.84, 77%) for long-context checks.
  5. Avoid gpt-5.5-pro: 31% CritPt at $48.75 blended — 5.3x Sol to score one
     point lower. (Was written as "six times" against Sol's older $8.12; Grok
     caught the stale ratio when Sol's blended price was corrected to $9.17.)
  6. Kimi K3 is DROPPED: 1 of 3 returned, dying on its token cap.

Model IDs are read from the LIVE OpenRouter list, never inferred from a
nickname (memory: model-ids-sol-is-gpt56-sol).
"""

from __future__ import annotations

from dataclasses import dataclass

CRITPT_CEILING_PCT = 32.0


@dataclass(frozen=True)
class Seat:
    role: str
    model: str
    critpt_pct: float
    non_hallucination_pct: float
    blended_usd_per_m: float
    note: str


# ⭐ REVISED 2026-08-01 FROM THE IN-ANGER RECORD, not from the benchmark table.
# One session, 12 council runs. Return rate and what each seat actually caught:
#
#   grok45     3/3 returned, 3 flagged, $2.67 blended
#              CORRECT on: the excitation sign fault (the campaign-defining bug,
#              before it was measured); a 45deg=180deg-electrical error in my own
#              brief; "the machine is not a 3.75 N.m machine"; and it named the
#              missing turns/parallel-path table as THE blocker. One miss
#              (poles-vs-pole-pairs), offered as a testable hypothesis.
#   sol        3/4 returned, $9.17 blended. Found ALL FOUR pre-commit CODE
#              defects (a PM multiplier applied to reluctance torque; a
#              single-sample flux linkage passed off as lambda_pm; three
#              fail-open paths; an unvalidated reference artefact). But also
#              produced the WORST advice of the day — a slot-opening change that
#              was true of real machines and wrong for this deck — because it
#              reasoned from general knowledge without reading what the
#              parameter built.
#   glm52      2/4 returned. Unfit for a STANDING role at that reliability,
#              whatever its honesty score.
#   kimi_k3    1/3 returned (token-cap deaths). Dropped.
#
# THE SPLIT THAT FALLS OUT: Grok DIAGNOSES (reasons about a system from
# evidence); Sol REVIEWS CODE (finds defects in what was just written). Those
# are different jobs and were previously conflated.
#
# CAVEAT, stated because it matters: there is NO CritPt or non-hallucination
# figure for Grok 4.5 — it was absent from the benchmark table. This routing
# rests on a 12-run in-anger sample, which is small. Revisit if it regresses.

DIAGNOSE = Seat(
    "diagnose", "x-ai/grok-4.5", 0.0, 0.0, 2.67,
    "STANDING SECOND OPINION — 3/3 returned, caught the defining fault; "
    "benchmark figures unknown, ranked on the in-anger record")
PROPOSE = Seat(
    "propose", "openai/gpt-5.6-sol", 32.0, 18.0, 9.17,
    "CODE REVIEW seat — found every pre-commit defect; NEVER accept its "
    "domain advice unchecked (it produced the slot-opening error)")
CORROBORATE = Seat(
    "corroborate", "z-ai/glm-5.2", 21.0, 74.0, 1.03,
    "demoted from standing first call: returned only 2 of 4 times")
AUDIT = Seat(
    "audit", "minimax/minimax-m3", 4.0, 84.0, 0.45,
    "cannot do physics; ask only 'is this claim supported by what was given?'")
# Tristan 2026-08-01: "get DeepSeek V4 Flash 0731 used all the time — it is so
# incredibly cheap that it is worth having just as another backup voice." At
# $0.49 blended a fourth lineage costs about a fifth of the audit seat. It
# returned 1/1 with a CORRECT independent call on the excitation sign. NOTE: the
# benchmark table lists DeepSeek V4 PRO at ~11% non-hallucination, so this seat
# is a BACKUP VOICE and must never hold the auditor role.
BACKUP = Seat(
    "backup", "deepseek/deepseek-v4-flash-0731", 0.0, 0.0, 0.49,
    "always-on cheap fourth lineage; 1/1 returned with a correct independent "
    "call; NEVER the auditor (the V4 Pro line scores ~11% non-hallucination)")
AUDIT_LONG_CONTEXT = Seat(
    "audit", "qwen/qwen3.7-max", 13.0, 77.0, 1.84,
    "auditor for long-context honesty checks")

# Diagnose first (cheap, reliable), code-review second, audit always.
TRIAD = (DIAGNOSE, PROPOSE, AUDIT, BACKUP)

# Kept for provenance: seats used before this routing existed. Grok 4.5 and
# Kimi K3 are legitimate additional lineages; DeepSeek V4 Pro is listed at ~11%
# non-hallucination and must NOT be given an auditor role.
LEGACY_SEATS = {
    "grok45": "x-ai/grok-4.5",
    "kimi_k3": "moonshotai/kimi-k3",
}
DO_NOT_USE_AS_AUDITOR = {
    "deepseek/deepseek-v4-pro": "~11% non-hallucination",
    "deepseek/deepseek-v4-flash-0731": "same lineage as V4 Pro (~11%) — backup voice only",
    "x-ai/grok-4.5": "no non-hallucination figure exists; unproven as an auditor",
    "openai/gpt-5.6-sol": "~18% non-hallucination — it is the PROPOSER",
}


def seats_for(task: str) -> tuple[Seat, ...]:
    """Route a task to seats. `physics` gets the full triad."""
    t = task.lower()
    if any(k in t for k in ("physic", "magnet", "electromagnet", "thermal",
                            "structural", "fluid")):
        return TRIAD
    if "review" in t or "commit" in t or "diff" in t:
        return (PROPOSE, AUDIT, BACKUP)
    if "audit" in t or "check" in t:
        return (AUDIT,)
    # DEFAULT is the diagnose seat, not the demoted corroborator. Leaving GLM as
    # the fallback would have quietly kept it as the standing call despite the
    # demotion (Sol, pre-commit council).
    return (DIAGNOSE, BACKUP)


VALIDATION_DISCLAIMER = (
    "MODEL OUTPUT IS A HYPOTHESIS, NOT A VALIDATION. CritPt tops out at "
    f"{CRITPT_CEILING_PCT:.0f}%, so the best model available gets about "
    "two-thirds of research-level physics wrong. Nothing here clears a gate. "
    "Validation belongs to xfemm, the solvers, and the gate registry."
)


def _selftest() -> int:
    failures: list[str] = []

    def check(name: str, cond: bool, detail: str = "") -> None:
        if not cond:
            failures.append(f"{name}: {detail}")

    # The auditor must NOT be the proposer — that is the maker/checker rule, and
    # it is the whole reason the triad spans three lineages.
    check("triad.maker_is_not_checker", PROPOSE.model != AUDIT.model,
          "proposer and auditor are the same model")
    # The invariant is INDEPENDENCE, not a head count: every seat must come
    # from a DIFFERENT lineage, so no two seats share a failure mode. Written as
    # "== 3" it broke the moment a fourth seat was added, which is the selftest
    # doing its job — but the fixed number was never the point.
    lineages = [s.model.split("/")[0] for s in TRIAD]
    check("triad.every_seat_a_distinct_lineage",
          len(set(lineages)) == len(lineages),
          f"seats share a lineage: {lineages}")
    check("triad.at_least_three_lineages", len(set(lineages)) >= 3,
          f"only {len(set(lineages))} lineages — too few for maker != checker")

    # The anti-correlation the routing exists to exploit: the code-review seat
    # must be WORSE at honesty than the audit seat, or the split buys nothing.
    check("triad.anticorrelation_holds",
          PROPOSE.non_hallucination_pct < AUDIT.non_hallucination_pct,
          "the code-review seat is not less honest than the auditor")
    check("triad.audit_seat_cannot_do_physics",
          AUDIT.critpt_pct < CORROBORATE.critpt_pct,
          "the auditor scores physics above the corroborator; roles are wrong")
    # A seat ranked on the in-anger record rather than benchmarks must SAY so,
    # or a future reader will assume figures exist that do not.
    check("triad.unbenchmarked_seat_is_flagged",
          DIAGNOSE.critpt_pct == 0.0 and "in-anger" in DIAGNOSE.note,
          "the diagnose seat carries benchmark numbers it does not have")

    # Cost discipline: the standing first call must be far cheaper than the
    # escalation, or "escalate only when out of depth" has no bite.
    check("triad.first_call_is_cheap",
          DIAGNOSE.blended_usd_per_m * 3 < PROPOSE.blended_usd_per_m,
          f"diagnose seat {DIAGNOSE.blended_usd_per_m} is not << "
          f"code-review seat {PROPOSE.blended_usd_per_m}")

    # A model on the do-not-audit list must never hold the audit seat.
    check("triad.auditor_not_blacklisted",
          AUDIT.model not in DO_NOT_USE_AS_AUDITOR,
          f"{AUDIT.model} is blacklisted as an auditor")
    # The cheap backup voice must never drift into the auditor seat: it shares a
    # lineage with DeepSeek V4 Pro, listed at ~11% non-hallucination.
    check("backup.is_blacklisted_as_auditor",
          BACKUP.model in DO_NOT_USE_AS_AUDITOR,
          "the backup voice is not blacklisted from the auditor role")
    # The justification for an ALWAYS-ON extra lineage is that it is nearly
    # free relative to the seats doing the real work. (It is NOT the cheapest
    # seat outright — the auditor is, at $0.45 — so assert what actually
    # matters: it must be a small fraction of the expensive seat.)
    check("backup.is_nearly_free",
          BACKUP.blended_usd_per_m * 10 < PROPOSE.blended_usd_per_m,
          f"backup {BACKUP.blended_usd_per_m} is not << code-review seat "
          f"{PROPOSE.blended_usd_per_m}; an always-on seat must be cheap")

    check("routing.physics_gets_triad",
          seats_for("magnetics excitation review") == TRIAD,
          "a physics task did not route to the full triad")
    check("routing.audit_gets_auditor",
          seats_for("check this claim") == (AUDIT,),
          "an audit task did not route to the auditor")

    check("disclaimer.states_the_ceiling", "32%" in VALIDATION_DISCLAIMER,
          "the disclaimer does not state the CritPt ceiling")

    for f in failures:
        print(f"  FAIL {f}")
    print(f"{'FAIL' if failures else 'PASS'} model_routing selftest "
          f"({len(failures)} failures)")
    return 1 if failures else 0


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        raise SystemExit(_selftest())
    print(VALIDATION_DISCLAIMER)
    print()
    for s in TRIAD:
        print(f"  {s.role:12s} {s.model:24s} CritPt {s.critpt_pct:4.0f}%  "
              f"honesty {s.non_hallucination_pct:4.0f}%  "
              f"${s.blended_usd_per_m}/M — {s.note}")
