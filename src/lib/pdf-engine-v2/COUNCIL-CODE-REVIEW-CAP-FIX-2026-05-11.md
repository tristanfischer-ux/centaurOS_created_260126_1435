# Coding Council — `pngs[:12]` Page-Cap Removal

**Date:** 2026-05-11
**Diff under review:** commit `c000c9ac` — `fix(eval-harness/scoring): remove pngs[:12] page cap`
**Follow-up commit:** adds `MAX_PAGES_PER_CALL = 40` guardrail in response to council
**Source script:** `scripts/score-radical-pdfs-multimodal.py`
**Investigation that surfaced the bug:** `src/lib/pdf-engine-v2/eval-harness/V6-BOM-INVESTIGATION-2026-05-11.md`

## What the diff does

Both message-builder functions (`build_messages` for OpenRouter, `build_messages_anthropic` for Anthropic direct) used to slice `pngs[:12]` before encoding the PDF pages. This silently masked any content past page 12 from the multimodal judges (Claude Opus 4.7, Gemini 2.5 Pro, Qwen3-VL-235B), causing two confirmed score regressions:

1. **V5 §E Appendix** (sat on pages 15–19) — judged ❌ across the 10/10 V5 batch despite being present and well-formed.
2. **V6 BoM** — a renderer reorder pushed the BoM block past page 11, so V6's improved BoM never reached the judges.

The diff replaces both `pngs[:12]` slices with full iteration over `pngs`. Each PDF in the current corpus is 17–22 pages.

## Council verdicts

| Seat | Model | Verdict | Key concern |
|---|---|---|---|
| Honest adversary | `x-ai/grok-4.3` | NEEDS_MINOR | "Permanent ~70-80% vision-token increase, no guardrails or monitoring added" |
| Schema enforcer | `z-ai/glm-5.1` | NEEDS_MINOR | "Removing a safety guardrail without replacement is risky — add a `MAX_PAGES` constant" |
| Cost / correctness anchor | `deepseek/deepseek-v4-flash` | OK | "Change is correct. Payload (~6.6 MB) is well within Anthropic Opus's 100-image and 5 MB-per-image limits. Cost rises ~1.83× per call but is justified by the accuracy gain" |

(Brief originally specified `x-ai/grok-4-fast`, `google/gemini-2.5-pro`, `z-ai/glm-5.1-air`. The MCP `ask_alt_llm` tool's pricing table only exposes `grok-4.3`, `gemini-3.1-pro-preview`, and `glm-5.1`. Gemini 3.1 Pro Preview behaved as a silent-reasoning model and burned its output budget without printing a verdict on three attempts; substituted `deepseek-v4-flash` as the third non-reasoning seat. All three seats reviewed the same diff and the same context.)

## Synthesis

Per `coding_council_seat_count_overrides_severity` rule: 2 NEEDS_MINOR + 0 NEEDS_MAJOR + 1 OK = **NEEDS_MINOR overall**. **Not a blocker.** No correctness defect identified; no real risk of hitting any provider hard limit at the current corpus size.

The two NEEDS_MINOR seats converged on the **same single concern**: removing the `[:12]` slice without replacing it with any explicit upper bound means the script has no defence against a future PDF arriving with a pathological page count (e.g., a 200-page document accidentally fed in). Today's corpus is fixed at 17–22 pages so the concern is theoretical, but the fix is cheap.

## Resolution

Follow-up commit adds `MAX_PAGES_PER_CALL = 40` near the top of the script and uses `pngs[:MAX_PAGES_PER_CALL]` in both message-builders. 40 leaves comfortable headroom (~2× the current longest PDF) while protecting against silent runaway. This addresses both NEEDS_MINOR seats' concern in one line.

## Cost impact estimate (DeepSeek-Flash + first-principles)

- Vision tokens scale roughly linearly with image count.
- Going 12 → ~17 average → up to 22 max pages = ~1.4× to ~1.83× more vision input per call.
- 30 multimodal calls per batch × 2 re-scoring batches (V5, V6) ≈ ~£40–60 additional spend vs the capped baselines.
- Within the autonomous over-£400 envelope.

## Decision

**Proceed with re-scoring.** Cap fix + `MAX_PAGES_PER_CALL = 40` guardrail are both committed before the V5-uncapped and V6-uncapped scoring runs are launched.
