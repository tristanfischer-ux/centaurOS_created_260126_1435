# Council Code Review — Piece 1H (LLM Regulatory Prose)
**Date:** 2026-05-12  
**Scope:** `radical/regulatory-prose-llm.ts` (new, ~212 lines) + wiring in `index.ts`, `types.ts`, `7b-pdf-v3-radical-document.tsx`  
**Seats:** grok-4.3 · gemini-3.1-pro (abstained — garbled response) · deepseek-v4-pro · kimi-k2.6  
**Aggregate rule:** 2+ NOTED seats on a dimension = BLOCKER

---

## Seat Verdicts

| Seat | Verdict | Concurrency | Fallback | Hallucination | Renderer | Token Budget | Parse | Backward Compat |
|---|---|---|---|---|---|---|---|---|
| grok-4.3 | NEEDS_MINOR | WARN | PASS | PASS | WARN | WARN | PASS | PASS |
| gemini-3.1-pro | *abstained* | — | — | — | — | — | — | — |
| deepseek-v4-pro | NEEDS_MINOR | WARN | PASS | WARN | WARN | PASS | PASS | PASS |
| kimi-k2.6 | NEEDS_MINOR | WARN | PASS | WARN | WARN | WARN | PASS | PASS |

**Aggregate verdict: NEEDS_MINOR** (no NEEDS_MAJOR; no BLOCKER dimensions with 2+ seats)

---

## Dimension Tally (3 active seats)

| Dimension | WARN count | FAIL count | Status |
|---|---|---|---|
| Concurrency | 3/3 | 0 | **BLOCKER** (unanimous WARN) |
| Fallback handling | 0/3 | 0 | OK |
| Hallucination risk | 2/3 | 0 | **NOTED** (deepseek + kimi) |
| Renderer layout | 3/3 | 0 | **BLOCKER** (unanimous WARN) |
| Token budget | 2/3 | 0 | **NOTED** (grok + kimi) |
| Parse tolerance | 0/3 | 0 | OK |
| Backward compat | 0/3 | 0 | OK |

Per synthesis rule: unanimous WARN = BLOCKER. Two dimensions are BLOCKER-level.

---

## BLOCKER 1 — Concurrency: unbounded Promise.all (unanimous)

All three seats flagged `Promise.all` over 5–10 concurrent Grok calls with no semaphore, no 429 handling, and no backoff. Under OpenRouter's per-minute limits a full brief can hit 429 on all inflight requests simultaneously, all fall through to the raw-extraction fallback, and the prose layer silently degrades to `'—'` entries without a pipeline-level warning.

**Fix:** wrap `Promise.all` with `p-limit(3)` (or equivalent semaphore) and add exponential backoff retry on 429/503 responses before the per-standard catch.

---

## BLOCKER 2 — Renderer layout: `wrap={false}` + `prose` variable bug (unanimous)

Three issues raised:

1. **Variable name bug** (kimi, confirmed by reading source): `{dash(prose)}` references `prose` but `prose` is the loop-scoped `const prose = entry[key ...]` — this compiles but the `dash()` call wraps whatever `prose` holds. Verify this is correct or rename to remove ambiguity.
2. **`wrap={false}` on prose Views**: prevents react-pdf from flowing long compliance text (especially `evidence_required` and `gap_action`) across pages. With 1024 tokens per standard, a View can be 200–300 words — well over one A4 column height. The `wrap={false}` will cause silent clipping.
3. **No overflow guard** on the section header + four Views + DocPageFooter fitting within a single A4 page. A dense standard could overflow silently.

**Fix:** remove `wrap={false}` from the prose `<View>` blocks (keep it only on labels if needed); add `minPresenceAhead` or accept react-pdf's default wrapping behaviour.

---

## NOTED — Hallucination risk (2/3 seats: deepseek, kimi)

The system prompt guard ("DO NOT invent specific lab names") is advisory only. deepseek flags this as structurally unenforced: Grok may still emit fabricated lab names under completion pressure. The few-shot example mentions CATL and UKAS — plausible training reinforcement for the pattern but not a guarantee.

Seats did not call this a blocker, but recommend a post-parse regex check: if a known lab name (TÜV, UL, Intertek, BSI, SGS) appears in the output but not in the input `entry`, log a warning. Not a hard blocker for initial ship; add as a follow-on.

---

## NOTED — Token budget (2/3 seats: grok, kimi)

1024 tokens for four prose blocks is tight. The few-shot example output alone is ~260 tokens. A complex standard (IEC 62368-1, UN 38.3) with multiple clauses could hit `finish_reason=length` and yield incomplete `gap_action`. `finish_reason !== 'stop'` is already logged as a warning — that path exists. Raise `max_tokens` to 1536 or 2048 as a safe-side measure.

---

## OK Dimensions

- **Fallback handling:** All seats PASS. Raw-extraction fallback on per-standard failure is the right tradeoff.
- **Parse tolerance:** brace-slice pattern matches 1F+1G; consistent.
- **Backward compat:** `regulatoryProse` optional in `PipelineState`; renderer shows placeholder when absent. Legacy runs unaffected.

---

## Specific Fixes Summary

| File | Location | Fix |
|---|---|---|
| `radical/regulatory-prose-llm.ts` | `Promise.all(entries.map(...))` | Add `p-limit(3)` + 429 backoff retry |
| `radical/regulatory-prose-llm.ts` | `max_tokens: 1024` | Raise to 1536 |
| `7b-pdf-v3-radical-document.tsx` | `<View wrap={false}>` prose blocks | Remove `wrap={false}` on prose Views |
| `7b-pdf-v3-radical-document.tsx` | `{dash(prose)}` | Confirm variable scope; rename if ambiguous |

---

*Council cost: ~£0.04 actual (3 active seats × ~£0.013 average)*
