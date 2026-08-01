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

THE TRIAD — maker != checker across three lineages, ~$0.13 per consult:

    PROPOSE     GPT-5.6 Sol      CritPt 32% (#1), ITBench root-cause 56%
    CORROBORATE GLM-5.2          CritPt 21%, non-hallucination 74%, $0.96/M
    AUDIT       MiniMax-M3       non-hallucination 84%, instruction-following 83%

Usage rules that follow from the numbers, not from taste:

  1. GLM-5.2 is the STANDING FIRST CALL, not an escalation. It is the only model
     with both usable physics and high honesty, at an eighth of Sol's price
     (~$0.012 on a 10k-in/2k-out consult).
  2. Escalate to Sol only when GLM-5.2 is out of its depth, and NEVER accept its
     output unchecked — the ~18% non-hallucination is the whole point.
  3. MiniMax-M3 CANNOT do the physics (CritPt 4%). Do not ask it to. Ask it the
     different question: is this claim actually supported by what was given? At
     $0.41 blended it can run on every load-bearing claim.
  4. Swap the auditor to Qwen3.7 Max ($1.84, 77%) when the honesty check has to
     span a long context.
  5. Avoid gpt-5.5-pro despite its 31% CritPt: at $48.75 blended it costs six
     times Sol to score one point lower.

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


PROPOSE = Seat(
    "propose", "openai/gpt-5.6-sol", 32.0, 18.0, 8.12,
    "top of CritPt and ITBench root-cause; NEVER accept unchecked")
CORROBORATE = Seat(
    "corroborate", "z-ai/glm-5.2", 21.0, 74.0, 0.96,
    "STANDING FIRST CALL — only model with usable physics AND high honesty")
AUDIT = Seat(
    "audit", "minimax/minimax-m3", 4.0, 84.0, 0.41,
    "cannot do physics; ask only 'is this claim supported by what was given?'")
AUDIT_LONG_CONTEXT = Seat(
    "audit", "qwen/qwen3.7-max", 13.0, 77.0, 1.84,
    "auditor for long-context honesty checks")

TRIAD = (PROPOSE, CORROBORATE, AUDIT)

# Kept for provenance: seats used before this routing existed. Grok 4.5 and
# Kimi K3 are legitimate additional lineages; DeepSeek V4 Pro is listed at ~11%
# non-hallucination and must NOT be given an auditor role.
LEGACY_SEATS = {
    "grok45": "x-ai/grok-4.5",
    "kimi_k3": "moonshotai/kimi-k3",
}
DO_NOT_USE_AS_AUDITOR = {
    "deepseek/deepseek-v4-pro": "~11% non-hallucination",
    "openai/gpt-5.6-sol": "~18% non-hallucination — it is the PROPOSER",
}


def seats_for(task: str) -> tuple[Seat, ...]:
    """Route a task to seats. `physics` gets the full triad."""
    t = task.lower()
    if any(k in t for k in ("physic", "magnet", "electromagnet", "thermal",
                            "structural", "fluid")):
        return TRIAD
    if "audit" in t or "check" in t:
        return (AUDIT,)
    return (CORROBORATE,)


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
    lineages = {s.model.split("/")[0] for s in TRIAD}
    check("triad.three_lineages", len(lineages) == 3,
          f"expected 3 distinct lineages, got {lineages}")

    # The anti-correlation the routing exists to exploit: the physics seat must
    # be WORSE at honesty than the audit seat, or the split buys nothing.
    check("triad.anticorrelation_holds",
          PROPOSE.non_hallucination_pct < AUDIT.non_hallucination_pct,
          "the proposer is not less honest than the auditor — re-derive the roles")
    check("triad.audit_seat_cannot_do_physics",
          AUDIT.critpt_pct < CORROBORATE.critpt_pct,
          "the auditor scores physics above the corroborator; roles are wrong")

    # Cost discipline: the standing first call must be far cheaper than the
    # escalation, or "escalate only when out of depth" has no bite.
    check("triad.first_call_is_cheap",
          CORROBORATE.blended_usd_per_m * 4 < PROPOSE.blended_usd_per_m,
          f"corroborator {CORROBORATE.blended_usd_per_m} is not << "
          f"proposer {PROPOSE.blended_usd_per_m}")

    # A model on the do-not-audit list must never hold the audit seat.
    check("triad.auditor_not_blacklisted",
          AUDIT.model not in DO_NOT_USE_AS_AUDITOR,
          f"{AUDIT.model} is blacklisted as an auditor")

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
