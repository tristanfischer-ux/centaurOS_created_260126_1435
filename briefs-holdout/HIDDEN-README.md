# Sealed Hidden Holdout Set — DO NOT OPEN BEFORE FINAL ACCEPTANCE

These three briefs (`hidden-1.md`, `hidden-2.md`, `hidden-3.md`) are the **frozen hidden eval set**
for the Anvil Universal Loop. They are sealed under governance rule **G5** of
`ANVIL-UNIVERSAL-LOOP-PLAN.md`.

## The seal rule (G5, verbatim from the plan)

> **G5. Frozen hidden eval.** The 3 named holdouts are the WORKING set; a second set of 3 unseen briefs
> stays frozen and unused by any writeback/learning until final acceptance (anti-overfit). Scoreboard
> green requires working set AND hidden set.

## What this means operationally

- **Never run** the hidden briefs through the chain during iteration. They are not part of the
  per-iteration GENERATE step.
- **Never used by any writeback/learning** — no candidate sizing module, scene script, spec/standard/
  supplier/part row, or any other artefact may be derived from, tuned against, or validated on these
  briefs until final acceptance.
- They exist to detect overfit: if the working set goes green only because the engine was iterated
  against it, the hidden set will expose that at acceptance time.
- The hidden archetypes are deliberately distinct from the working set and from every registered
  archetype (confirmed non-covered in `scripts/lib/orchestrator/class-plans/` and
  `scripts/blender-templates/` at authoring time).

## When the seal lifts

Only at **final acceptance** — when the working set (8 registered archetypes exit 0 + the 3 working
holdouts + HAPS-cold) is green twice consecutively. Acceptance requires the hidden set to ALSO pass
**cold**, having never informed any learning.
