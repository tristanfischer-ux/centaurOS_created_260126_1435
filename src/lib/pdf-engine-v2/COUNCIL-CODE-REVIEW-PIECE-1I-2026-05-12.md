# Council Code Review — Piece 1I (LLM FMEA Risk Prose)
**Date:** 2026-05-12 | **Scope:** `radical/fmea-risk-llm.ts`, renderer additions in `7b-pdf-v3-radical-document.tsx`, orchestrator block in `index.ts`, type additions in `types.ts`

---

## Seat Verdicts

| Seat | Model | Verdict | Concurrency | Top-N | Layout | Few-shot | Type Safety | Fallback | Compat |
|------|-------|---------|-------------|-------|--------|----------|-------------|----------|--------|
| 1 | grok-4.3 | NEEDS_MINOR | WARN | WARN | PASS | WARN | PASS | PASS | PASS |
| 2 | gemini-3.1-pro | NEEDS_MAJOR | FAIL | WARN | WARN | WARN | WARN | PASS | PASS |
| 3 | deepseek-v4-pro | NEEDS_MINOR | WARN | WARN | PASS | WARN | WARN | PASS | PASS |
| 4 | deepseek-v4-flash | NEEDS_MAJOR | FAIL | WARN | WARN | WARN | WARN | PASS | PASS |

---

## Aggregate Synthesis

**Overall verdict: NEEDS_MAJOR**

Per synthesis rule: a dimension with 2+ seats NOTED = BLOCKER.

| Dimension | Seats flagging | Aggregate | Blocker? |
|-----------|---------------|-----------|----------|
| Concurrency | 4/4 (2×WARN, 2×FAIL) | **FAIL** | **YES** |
| Top-N filter | 4/4 WARN | WARN | No |
| Renderer layout | 2/4 WARN | WARN | No |
| Few-shot bias | 4/4 WARN | WARN | No |
| Type safety | 2/4 WARN | WARN | No |
| Fallback path | 4/4 PASS | PASS | No |
| Backward compat | 4/4 PASS | PASS | No |

---

## Blocker (must fix before merge)

**BLOCKER — Concurrency: unbatched `Promise.all` for 20 OpenRouter calls.**

This is the same bug Piece 1H fixed before it was merged: `Promise.all` firing 20 simultaneous OpenRouter requests will hit rate limits, causing partial or total FMEA prose failure silently caught by the per-risk fallback. The fallback degrades gracefully to raw FMEA fields, so the pipeline does not crash, but the LLM prose layer will be empty for most risks under any real-world rate limit. Piece 1H already contains the correct 3-concurrent-batch pattern — `fmea-risk-llm.ts` must adopt the same fix.

**Fix:** Replace `Promise.all(sorted.map(...))` with a 3-at-a-time batch loop, identical to the pattern in `radical/regulatory-prose-llm.ts`.

---

## Non-blocking Concerns (fix in follow-up)

1. **Few-shot bias (4/4 WARN):** The hardcoded BESS thermal-runaway example biases prose style and terminology for all non-battery product classes. Add 2 additional product-neutral examples (e.g. drone motor bearing failure, EV charger arc fault) or select the few-shot example conditionally by `productClass`. File: `fmea-risk-llm.ts`, `FEW_SHOT_EXAMPLE_INPUT`.

2. **Top-N cutoff (4/4 WARN):** 20 risks × 4 prose blocks × ~1 LLM call each is the upper bound; 10 may be more cost-effective for typical FMEA tables (< 15 risks). Consider making the cap configurable (default 10) or documenting a cost/latency budget for the 20-risk case. File: `fmea-risk-llm.ts`, `.slice(0, 20)`.

3. **Renderer layout overflow (2/4 WARN):** `wrap={false}` on each 4-block section means a long LLM paragraph that exceeds the remaining A4 height will overflow or clip rather than reflowing. Remove `wrap={false}` or add a max-chars guard (≈400 chars per block at font-size 10 / lineHeight 1.55 fits one A4 comfortably). File: `7b-pdf-v3-radical-document.tsx`, `FmeaRiskProsePage` SUB_LABELS map.

4. **Type safety (2/4 WARN):** `(state as any).fmea` in the orchestrator is an untyped cast. `fmeaRiskProse` was correctly added to `PipelineState` in `types.ts`; `fmea: RiskRow[]` should be added alongside it. The `as any` path also lacks an `Array.isArray` guard. File: `types.ts` + `index.ts` orchestrator guard.

---

## Passing Dimensions

- **Fallback path (4/4 PASS):** Detection fallback as `"Detection score: N/10"` is correct and consistent — it surfaces the numeric RiskRow score when LLM prose is unavailable, which is informative rather than empty.
- **Backward compat (4/4 PASS):** The `if ((state as any).fmea && ...)` guard in `index.ts` correctly skips the entire call when `fmea` is absent; `FmeaRiskProsePage` shows a single placeholder page when `fmeaRiskProse` is undefined. No regression risk for existing pipeline runs.

---

## Specific Fixes Summary

| File | Line hint | Fix |
|------|-----------|-----|
| `radical/fmea-risk-llm.ts` | `Promise.all(sorted.map` | Replace with 3-at-a-time batch loop (copy pattern from `regulatory-prose-llm.ts`) |
| `radical/fmea-risk-llm.ts` | `FEW_SHOT_EXAMPLE_INPUT` | Add 2 non-BESS few-shot examples or select by `productClass` |
| `radical/fmea-risk-llm.ts` | `.slice(0, 20)` | Make cap configurable; default 10 |
| `stages/7b-pdf-v3-radical-document.tsx` | `wrap={false}` in `FmeaRiskProsePage` | Remove or add max-chars guard to prevent prose overflow |
| `types.ts` | `PipelineState` | Add `fmea?: RiskRow[]` alongside `fmeaRiskProse` |

---

*Council cost: ~£0.028 total (4 seats × ~£0.007 avg). Read-only review — no code modified.*
