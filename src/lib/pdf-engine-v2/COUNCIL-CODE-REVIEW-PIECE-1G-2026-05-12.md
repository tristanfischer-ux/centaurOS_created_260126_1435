# Council Code Review — Piece 1G: LLM Brief Overview Prose
**Date:** 2026-05-12  
**Scope:** `brief-overview-llm.ts` (new, 142 lines) + orchestrator wiring in `index.ts` + `BriefRequirementsPage` prose block in `7b-pdf-v3-radical-document.tsx` + `types.ts` field addition  
**Seats:** Grok 4.3 · Gemini 3.1 Pro · GLM 5.1 · MiMo v2.5 Pro

---

## Aggregate Verdict: NEEDS_MINOR

Gemini called NEEDS_MAJOR (no-merge) based primarily on error handling and few-shot bias. The other three seats called NEEDS_MINOR. Applying the seat-count rule: 3 seats rate NEEDS_MINOR; 1 seat rates NEEDS_MAJOR. The NEEDS_MAJOR seat's concerns are substantive but all addressable without architectural change. Aggregate: **NEEDS_MINOR** — three fixes required before merge.

---

## Per-Seat Scores

| Dimension | Grok 4.3 | Gemini 3.1 Pro | GLM 5.1 | MiMo v2.5 Pro | Consensus |
|---|---|---|---|---|---|
| **Verdict** | NEEDS_MINOR | NEEDS_MAJOR | NEEDS_MINOR | NEEDS_MINOR | **NEEDS_MINOR** |
| Prompt quality | WARN | WARN | WARN | WARN | **WARN** |
| Few-shot bias | FAIL | FAIL | WARN | WARN | **FAIL** |
| Error handling | WARN | FAIL | WARN | WARN | **WARN** |
| Renderer placement | PASS | WARN | PASS | WARN | **WARN** |
| Minimal state | PASS | PASS | PASS | PASS | **PASS** |
| Token budget | PASS | PASS | PASS | PASS | **PASS** |
| Backward compat | PASS | PASS | PASS | PASS | **PASS** |

---

## Required Fixes (NOTED by 2+ seats)

### Fix 1 — Resolve prompt contradiction: "specific numbers" vs "do NOT invent figures" (4/4 seats)

The system prompt requires "SPECIFIC numbers + dates + named entities throughout" and "at LEAST one specific data point and at LEAST one named source" in `why_now`. The user message fallback says "do NOT invent specific market figures". When `researchSynthesis` is absent (common in early pipeline runs), these instructions are in direct conflict. All four seats agree the system prompt's affirmative instruction wins, causing hallucinated figures.

**Fix:** Rewrite the system prompt to condition specificity on data availability:  
- Change style rule 1 to: "Use SPECIFIC numbers + named entities only when they appear in the provided brief or research synthesis. Where data is absent, write in qualified terms ('industry analysis suggests...', 'regulators are expected to...') rather than fabricating figures."  
- Change style rule 7 to: "Where research synthesis is provided, include at least one specific data point and one named source; otherwise use well-attributed qualitative statements."

**File:** `src/lib/pdf-engine-v2/radical/brief-overview-llm.ts`, `SYSTEM_PROMPT` constant.

---

### Fix 2 — Few-shot domain bias: add a second non-BESS/non-UK example (4/4 seats)

The single BESS / National Grid ESO / UK-grid-balancing few-shot is highly specific. All four seats flagged this will produce energy infrastructure terminology bleed for CGM patches, AUVs, drones, and non-UK products. Grok and Gemini rated this FAIL; GLM and MiMo rated WARN.

**Fix:** Add a second few-shot example for a clearly different domain (e.g., a wearable medical device, an autonomous underwater vehicle, or a drone payload). The example does not need market data — a structurally correct placeholder with the right tone and format is sufficient to break the domain anchoring. Label each example with its domain in the few-shot block.

**File:** `src/lib/pdf-engine-v2/radical/brief-overview-llm.ts`, `FEW_SHOT_BESS_OUTPUT` constant + `userContent` assembly.

---

### Fix 3 — Add fetch timeout + finish_reason check (3/4 seats)

No `AbortController` or `AbortSignal.timeout()` on the fetch call. If OpenRouter hangs, the pipeline stage blocks indefinitely (non-fatal path, but 30+ second hangs are user-visible). No `finish_reason` check — a `length`-truncated response produces invalid JSON that silently falls through to a `SyntaxError` in the outer catch with no signal about root cause.

**Fix:**
```ts
// Add before fetch:
const ctrl = new AbortController()
const timer = setTimeout(() => ctrl.abort(), 45_000)
try {
  const response = await fetch(url, { ...opts, signal: ctrl.signal })
  // ...
  const finishReason = json.choices?.[0]?.finish_reason
  if (finishReason === 'length') {
    throw new Error('Brief overview prose truncated (finish_reason=length) — increase max_tokens or reduce prompt')
  }
} finally {
  clearTimeout(timer)
}
```
Note: `AbortSignal.timeout()` is unreliable in Vercel server actions per existing MEMORY.md gotcha — use `AbortController` + `setTimeout` pattern above.

**File:** `src/lib/pdf-engine-v2/radical/brief-overview-llm.ts`, `fetch` call (line ~91).

---

## Advisory (Single-Seat, Non-Blocking)

**Renderer `(state as any)` cast** (Gemini + MiMo): `briefOverviewProse` is now typed on `PipelineState` in `types.ts`. The `(state as any).briefOverviewProse` cast in the renderer is now unnecessary — access directly as `state.briefOverviewProse`. Minor type hygiene only; does not affect runtime behaviour.

**Renderer section heading style** (MiMo): The four subsection headings use `fontFamily: 'Helvetica-Bold'` and `fontSize: 13` matching the BESS_NAVY colour — this is adequate. No action needed.

**Token budget** (all pass): 2048 tokens for ~600-word JSON output is adequate; the few-shot + brief content fits within context. No change needed.

**Backward compat** (all pass): `if (state.parsedBrief)` guard + `briefOverviewProse ?? null` in minimalState + renderer `{briefProse && (...)}` conditional all correctly handle legacy state with no `parsedBrief` and no `briefOverviewProse`. No change needed.

---

## Summary

Three targeted fixes — all in `brief-overview-llm.ts` — resolve every NOTED concern. The orchestrator wiring, minimalState persistence, types.ts field, renderer placement, token budget, and backward compat are all clean. No architectural change required.

**Estimated fix effort:** 45 minutes. No new files needed.
