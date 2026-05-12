# Council Code Review — Piece 1F (LLM-augmented module paragraphs)
**Date:** 2026-05-12  
**Scope:** `module-paragraph-llm.ts` (new), `sentence-generator.ts`, `index.ts`, `7b-pdf-v3-radical-document.tsx`  
**Seats:** Grok-4.3 · Gemini-3.1-Pro · GLM-5.1 · MiMo-v2.5-Pro  
**Council cost:** ~$0.04 (£0.031)

---

## Seat Verdicts

| Seat | Verdict | prompt_quality | error_handling | concurrency | token_budget | renderer_integration | cost_efficiency | few_shot_generalisation |
|------|---------|---------------|----------------|-------------|--------------|----------------------|-----------------|------------------------|
| Grok-4.3 | NEEDS_MINOR | PASS | PASS | PASS | PASS | PASS | PASS | **WARN** |
| Gemini-3.1-Pro | OK | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| GLM-5.1 | NEEDS_MINOR | PASS | **WARN** | WARN | WARN | PASS | PASS | **WARN** |
| MiMo-v2.5-Pro | NEEDS_MINOR | PASS | **WARN** | PASS | PASS | PASS | PASS | **WARN** |

**Aggregate verdict: NEEDS_MINOR** (3/4 seats, no NEEDS_MAJOR)

---

## Synthesis — Findings by Seat Count

### 3-seat findings (NOTED = BLOCKER per synthesis rule)

**F1 — Single BESS few-shot biases non-energy modules** *(Grok, GLM, MiMo)*  
The sole worked example is `energy_storage_source` on a 3.5 MWh BESS. When the pipeline generates paragraphs for structurally different modules (CGM, AUV, firmware stack, propulsion), Grok may import BESS-domain metaphors ("cells", "busbars", "BMS chain") or force the energy-source → conversion → distribution signal-flow template onto domains where it is meaningless. The deterministic paragraph anchor provides some grounding, but single-shot anchoring bias is well-documented.

**Recommended fix:**  
Add a second contrasting few-shot example (mechanical assembly or software-stack module), paired with an explicit instruction in the system prompt: *"Match the STRUCTURE of the example, not its domain vocabulary."* Alternatively, strip the BESS content to a purely structural exemplar.

---

### 2-seat findings (NOTED)

**F2 — No fetch timeout (AbortSignal)** *(GLM, MiMo)*  
`fetch()` on line 81 has no timeout. If OpenRouter queues the request or a Grok inference worker hangs, the per-module `try/catch` never resolves, stalling the sequential loop indefinitely (no pipeline timeout is visible in this diff). Add `signal: AbortSignal.timeout(30_000)` to the fetch options. Note from MEMORY.md: `AbortSignal.timeout()` is unreliable in some Vercel server actions — a `Promise.race` with a manual setTimeout may be safer.

```typescript
// Safer Vercel-compatible timeout:
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 30_000)
const response = await fetch('...', { signal: controller.signal })
clearTimeout(timer)
```

**F3 — No `finish_reason` check; truncated paragraph passes length guard** *(GLM, MiMo)*  
`max_tokens=1024` is adequate for median output, but a paragraph that hits the token limit mid-sentence produces a truncated string of ≥100 characters, which passes the current guard. The `choices[0].finish_reason` field would expose this. Add:

```typescript
const finishReason = json.choices?.[0]?.finish_reason
if (finishReason && finishReason !== 'stop') {
  throw new Error(`Grok finish_reason="${finishReason}" for module=${moduleSpec.module} — possible truncation`)
}
```

This causes the per-module fallback to fire cleanly rather than emitting a cut-off paragraph.

---

### 1-seat findings (NOTED)

**F4 — Hard-coded model name, no fallback chain** *(Grok)*  
`'x-ai/grok-4.3'` is hard-coded. If Grok is temporarily unavailable on OpenRouter, every module falls back to deterministic, which is acceptable in the short run but could degrade output silently for an entire pipeline run without a flag. Low-priority given the per-module fallback already handles this gracefully.

**F5 — Controlled concurrency (2–3 parallel) could halve wall-clock** *(GLM)*  
The sequential rationale ("Grok rate limit isn't generous enough for parallel") is reasonable but conservative. A 2-slot `p-limit` or manual concurrency of 2 would roughly halve the 30–40s wall time without saturating most tier-1 rate limits. Acceptable to defer.

---

## Raw Seat Outputs

### Seat 1 — Grok-4.3
```json
{
  "seat_name": "grok-4.3",
  "verdict": "NEEDS_MINOR",
  "prompt_quality": "PASS",
  "error_handling": "PASS",
  "concurrency": "PASS",
  "token_budget": "PASS",
  "renderer_integration": "PASS",
  "cost_efficiency": "PASS",
  "few_shot_generalisation": "WARN",
  "top_3_concerns": [
    "BESS-specific few-shot ending biases non-energy modules toward cell/rack/semicolon summary phrasing",
    "No explicit length guard or retry on truncated 1024-token outputs near sentence boundary",
    "Hard-coded model name and no fallback chain if grok-4.3 is temporarily unavailable"
  ],
  "specific_fixes": [
    {
      "file": "src/lib/pdf-engine-v2/radical/module-paragraph-llm.ts",
      "line_hint": "FEW_SHOT_BESS...OUTPUT",
      "fix": "Replace BESS-only example with a shorter, domain-neutral worked example or two contrasting shots (electrical vs mechanical)"
    },
    {
      "file": "src/lib/pdf-engine-v2/radical/module-paragraph-llm.ts",
      "line_hint": "after raw.length < 100",
      "fix": "Also throw if final sentence does not end with '.' or if paragraph ends mid-list"
    }
  ],
  "blocker_summary": ""
}
```

### Seat 2 — Gemini-3.1-Pro
```json
{
  "seat_name": "Seat 2 (Gemini-3.1-Pro)",
  "verdict": "OK",
  "prompt_quality": "PASS",
  "error_handling": "PASS",
  "concurrency": "PASS",
  "token_budget": "PASS",
  "renderer_integration": "PASS",
  "cost_efficiency": "PASS",
  "few_shot_generalisation": "PASS"
}
```
*(Response truncated at max_tokens; verdict and all field ratings captured.)*

### Seat 3 — GLM-5.1
*(Token limit hit mid-response; extracted positions from narrative.)*

Key positions extracted:
- `few_shot_generalisation`: WARN — single BESS shot creates anchoring bias
- `error_handling`: WARN — no `finish_reason` check, response.json() can throw if body is non-JSON, no fetch timeout
- `concurrency`: WARN — pure-sequential is conservative; 2–3 concurrent would halve wall time
- `token_budget`: WARN — max_tokens adequate but no truncation guard
- `renderer_integration`: PASS — optional-chain logic handles legacy state correctly
- `verdict`: NEEDS_MINOR (inferred from WARN counts)

### Seat 4 — MiMo-v2.5-Pro
```json
{
  "seat_name": "MiMo-v2.5-pro",
  "verdict": "NEEDS_MINOR",
  "prompt_quality": "PASS",
  "error_handling": "WARN",
  "concurrency": "PASS",
  "token_budget": "PASS",
  "renderer_integration": "PASS",
  "cost_efficiency": "PASS",
  "few_shot_generalisation": "WARN",
  "top_3_concerns": [
    "Single BESS-domain few-shot will bias Grok toward energy-storage narratology for CGM/AUV/firmware/software modules — needs either per-domain shots or a domain-agnostic example with explicit 'match structure not domain' instruction",
    "No AbortController/timeout on fetch — hung OpenRouter inference stalls the sequential loop indefinitely",
    "Truncated-response guard (raw.length < 100) passes mid-sentence cut-offs; add terminal-punctuation check or finish_reason guard"
  ],
  "specific_fixes": [
    {
      "file": "src/lib/pdf-engine-v2/radical/module-paragraph-llm.ts",
      "line_hint": "fetch() call",
      "fix": "Add AbortSignal.timeout(30_000) or Promise.race timeout to fetch options"
    },
    {
      "file": "src/lib/pdf-engine-v2/radical/module-paragraph-llm.ts",
      "line_hint": "after raw.length < 100 check",
      "fix": "Check finish_reason !== 'stop' and throw to trigger per-module fallback"
    }
  ],
  "blocker_summary": ""
}
```

---

## Decision

**NEEDS_MINOR — safe to proceed with fixes.**

No NEEDS_MAJOR verdict. No blocker raised. Three fixes recommended before merge:

1. **(F1 — 3-seat NOTED)** Add a second contrasting few-shot example or add explicit domain-neutrality instruction to the system prompt.
2. **(F2 — 2-seat NOTED)** Add fetch timeout (Promise.race preferred over AbortSignal.timeout per Vercel gotcha in MEMORY.md).
3. **(F3 — 2-seat NOTED)** Check `finish_reason !== 'stop'` after response parse; throw to fire per-module fallback on truncated output.

Fixes 2 and 3 are single-line changes. Fix 1 requires a prompt edit (10–20 lines). None require architectural change.
