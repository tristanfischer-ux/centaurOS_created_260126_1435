# Decision: defer the autonomous hill-climbing (self-rewriting) loop

**Date:** 2026-06-24
**Decision:** We are **not** building the nightly autonomous "hill-climbing" loop that reads run traces across the corpus and rewrites the engine's own prompts/code without a human. We are deferring it deliberately, with the reasoning below, until the engine — not customers — is the binding constraint.
**Status:** Deferred (revisit trigger defined at the end).

---

## Context — the prompt for this decision

We reviewed the LangChain "4 loops that quietly killed prompt engineering" framework:

1. **Agent loop** — model calls a tool, reads the result, calls another, until "done".
2. **Verification loop** — a grader scores the output against a rubric; under the bar → feedback goes back in and it retries, no human clicking retry.
3. **Event-driven loop** — no human invocation; a webhook / Slack message / cron kicks it off; it runs at scale.
4. **Hill-climbing loop** — every run leaves a trace; an analysis agent reads the traces, spots recurring failures, and **rewrites the prompt + tool config of Loop 1**. The pitch: "1% better every night compounds to 37× in a year."

A file-level audit of the ForgeOS codebase was run to see where we actually sit.

## Where ForgeOS actually sits (audited, with evidence)

- **Loop 1 (Agent):** Have it — but as a *fixed pipeline with an LLM planner at one node* (`orchestrate.ts` / `auto-planner.ts` / `composeToolGraph`), not an open `create_agent` call-read-call loop. **Intentional.** For an auditable engineering deliverable where every part must be traceable (gate 23 forbids LLM-invented part numbers), determinism is the product. Not a gap.
- **Loop 2 (Verification):** **Mature, and ahead of the article.** 26 deterministic gates (exit codes 10–35) + a quality loop that re-invokes the chain until every section ≥8 with zero human clicks (`serial-design-chain-v2.tsx` `computeScorecard` / quality-loop driver) + a deterministic-vs-advisory split that defeats LLM-judge flake (`scorecard-floor.ts`) + a Physics-Critic that *auto-corrects* a failing part rather than only flagging it (`physics-critic-autocorrect.ts`).
- **Loop 3 (Event-driven):** **Half-built.** The execution half is solid — a Mac Studio LaunchAgent worker (`pdf-engine-worker.mjs`) polls the `pdf_engine_runs` queue, atomically claims a run, spawns the chain, no human. The **intake** half is missing — nothing watches a sheet/webhook/inbox and *creates* a run; a human still submits (`api/pdf-engine-v2/submit/route.ts`, auth-gated).
- **Loop 4 (Hill-climbing):** **Partial — and ahead of the article on the hard part.** There is already an *in-run* code-fix loop: on a 3×-recurring section failure the chain calls GLM to read the defect + the relevant source files, dual-reviews the patch, **writes it to the live source tree** (`applyCodeFix`), and restarts the run. That *is* "the return arrow that edits the agent itself." What is missing is only the **cross-run** version — a scheduled agent that reads `failure-ledger.jsonl` + `actions.jsonl` across all runs and auto-promotes a recurring failure into an enforced invariant or a prompt edit. The cross-run lesson-loop currently stops at a *drafted stub awaiting a human* (`lesson-loop.ts` `draftInvariantStub`).

So the missing piece is **orchestration, not capability** — every part exists (traces, cross-run ledger, recurrence counter, the in-run code-rewrite trio, the regression harness); only the nightly agent that joins them is absent.

## Why we are NOT building it now

Two reasons, in priority order.

### 1. The compounding we need this quarter is DEMAND, not engine quality.
We have a **mature engine and zero paying customers.** Loop 4 compounds *engine quality*; the binding constraint right now is *customers*. The "1% better every night" that actually matters this quarter is **customer feedback** — sell the first dossiers, learn what a real hardtech founder needs, feed that back — not autonomous self-improvement of an engine that already clears its ≥8 floor. Building Loop 4 now optimises the thing that isn't the bottleneck.

### 2. A deterministic-gate hill-climber cannot deliver the article's 37×.
A self-improving loop built on **deterministic gates** can only ever get better at **not repeating a *known* deterministic failure.** It cannot, by construction, discover a *new* quality dimension — "this dossier reads thin," "the physics is subtly wrong in a way no gate checks," "the prose is incoherent." Those are the fuzzy signals the article's compounding assumes. ForgeOS deliberately demotes its LLM-judge (the semantic self-audit) to *advisory, non-gating* — the right call for trustworthy shipping — which means an automated hill-climber here would **asymptote at "never repeats a known bug," not compound to 37×.** Getting true compounding would require promoting the LLM-judge to a learning signal, which reintroduces exactly the judge-flake we engineered out. That is a deliberate ceiling, not an oversight.

### 3. Cost and safety.
A nightly LLM agent that analyses traces and commits code is the classic LLM-cron cost trap (~£300–600/day of model spend for a check-in loop — see cost-discipline notes), and an unattended agent committing to `serial-design-chain-v2.tsx` is genuinely dangerous on a trunk-based workflow. The right version (if ever built) opens a PR/branch for a 30-second human glance — it never pushes to `main`.

## What we WOULD keep (the cheap, safe slice) — but only when the engine is the bottleneck again

If/when we return to this, the only part worth banking first is the **deterministic half**: auto-promote a recurring gate failure into a regression-harness invariant from the gate's *already-structured* output (score + expected + actual). No LLM, env-flagged, only ever *adds* a check (worst case = a false-positive harness failure caught immediately). A few hours of hardening, zero ongoing cost, closes the lesson-loop's last inch for the *deterministic* failures — the part that compounds safely. Files: `lesson-loop.ts` (`recordGateFailure` auto-promote path behind `LESSON_LOOP_AUTOPROMOTE=1`), `regression-harness.tsx`.

We are **not** doing the LLM trace-analysis / source-rewrite agent (the expensive, risky part) at all for now.

## Revisit trigger

Reopen this decision when **both** are true:
1. The dossier engine (not customer acquisition) is the binding constraint on growth — i.e. we have repeat paying demand and the limiter is engine quality/throughput; AND
2. We have accumulated enough cross-run failure history (`failure-ledger.jsonl`) that a recurring-family pattern is visibly costing real rework.

Until then: compound demand, not the engine.
