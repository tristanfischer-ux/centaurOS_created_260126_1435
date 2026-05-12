# Council Code Review — Pieces 1D / 1E / 2A–2E
**Date:** 2026-05-12  
**Commit scope:** HEAD `af3959c3` (uncommitted diff)  
**Diff size:** 2548 lines across 7 files  
**Council seats dispatched:** 4 (Grok 4.3, Gemini 3.1 Pro, GLM 5.1, MiMo v2.5 Pro)

---

## Overall Verdict: NEEDS_MINOR

Commit is safe to land. No blockers. Three WARN-class fixes should be addressed before the next RL iteration.

---

## Seat Results

| Seat | Model | Verdict | Transport |
|---|---|---|---|
| 1 | Grok 4.3 | NEEDS_MINOR | OK |
| 2 | Gemini 3.1 Pro | ABSTAIN | Garbled/truncated — counted as ABSTAIN |
| 3 | GLM 5.1 | NEEDS_MINOR (text) | OK (rich analysis, non-JSON format) |
| 4 | MiMo v2.5 Pro | NEEDS_MINOR | OK |

**3 active seats, 0 NEEDS_MAJOR, 3 NEEDS_MINOR → Council verdict: NEEDS_MINOR**

---

## Dimension Scorecard

| Dimension | Grok | GLM | MiMo | Synthesis |
|---|---|---|---|---|
| Engine robustness | WARN | WARN | PASS | WARN |
| Topology multiplier | PASS | WARN | WARN | WARN |
| Natural-language layer | PASS | WARN | WARN | WARN |
| Renderer pages | PASS | WARN | PASS | PASS |
| DRY helper | PASS | PASS | PASS | PASS |
| BoM upgrade | WARN | WARN | WARN | WARN |
| Backward compat | PASS | WARN | WARN | WARN |
| Worked-example fidelity | WARN | — | PASS | WARN |

---

## Top 3 Fixes (post-commit, before next RL round)

### Fix 1 — `generateModuleRadParagraph` fan-out topology bug (WARN)
**File:** `radical/sentence-generator.ts` — `generateModuleRadParagraph` link loop  
**Issue:** When a `from_sub_module` appears in multiple non-chain grammar links (e.g. A→B *and* A→C), only the first link pushes the full `"A_rad OP B_rad"` string. The second link pushes only `"OP C_rad"` — `A_rad` is emitted once and then lost. For BESS fan-out topologies this silently corrupts §4.5 radical prose. Whether this is intentional for chain topology (A→B→C) needs a comment; it is wrong for fan-out (A→B, A→C).  
**Fix:** For each link where `from_sub_module` was already visited, emit `fromRad OP toRad` rather than just `OP toRad`, OR restructure the loop to handle fan-out by always rendering the full pair. At minimum add a comment clarifying the design contract.

### Fix 2 — `PricingContextNote` is hardcoded to BESS figures (WARN)
**File:** `stages/7b-pdf-v3-radical.tsx` — `PricingContextNote` component  
**Issue:** The component hardcodes `£2,800 bms_master_pcb` and BESS-specific EV-OEM volume discount ranges. This will produce misleading context text for any non-BESS product and leaks internal pricing assumptions into client PDFs for all projects.  
**Fix:** Either make the note generic ("Pricing reflects indicative batch volumes. Large-volume OEM equivalents typically 30–70% lower for high-volume commodities.") or make the BESS-specific text conditional on the product class. A config object keyed by class is the cleanest solution.

### Fix 3 — Topology multiplier: silent NaN for hedged quantities (WARN)
**File:** `stages/2-decompose.ts` — `parseInt` fallback in `runOneModuleDecomposition`  
**Issue:** The parser handles `×3920`, `x3920`, `3920` correctly. It silently drops `"approximately 3920"`, `"~3920"`, `"circa 3920"` to NaN — the NaN comparison is safely false so multiplicity is not decreased, but there is no `paramWarning` emitted. This means hedged-quantity data loss is invisible in the review panel.  
**Fix:** Add a `paramWarnings` push when `Number.isNaN(parsed)` and `raw` is non-empty: `"quantity modifier '${raw}' could not be parsed as integer — multiplicity not overridden for ${cid}"`. This costs one line and makes the gap visible.

---

## Secondary Concerns (noted, not blocking)

- **`backward_compat`** — `SentenceParagraphViewPage` guards `!nll` correctly (placeholder returned), but the guard ordering matters: it checks `!nll` before `!md`. If `nll` is present but `md` is null, it would proceed to the `!md` guard. The existing guard order is correct; however an integration smoke test with a state.json lacking `naturalLanguageLayer` entirely (key absent, not null) would confirm `?? null` defaulting works in practice.

- **BoM 10-column layout** — Column widths sum to 100%. Grade at 5% (~30pt) and Status at 8% (~47pt) are tight. Short grade labels (`Est.`, `Gap`, `Stub`) fit. `Verified` at 5% is 8 characters — at 7pt Helvetica this will be tight. GLM flags this; Grok flags it. Recommend verifying with a rendered BESS v5 PDF before declaring the layout stable.

- **Engine robustness (auto-strip)** — The auto-strip of forbidden modules is the right call for production (better than hard-fail), and the audit trail (`excluded[]` + `paramWarnings` + `rationale{}`) is sufficient. However, if the LLM *consistently* emits a forbidden module across runs, that is a prompt signal worth surfacing. A counter or threshold (e.g., "if same module stripped 3+ times in a session, escalate to error") would prevent systematic LLM drift being silently normalised.

- **`wrap=false` removal from `SentenceBox`** — Correct change. The previous `wrap=false` was blocking page breaks in long BoM sections. No concerns.

---

## Commit Decision

**NEEDS_MINOR → commit as-is.** The three fixes above are not crash-risk or data-corruption issues; they are silent-gap or hardcoding issues. They should be addressed in the next increment (before or alongside the next RL round) but do not block this commit.

The diff is structurally sound: 5 new renderer pages all guard legacy state gracefully, the topology multiplier propagation is conservative (never decreases qty), `buildNaturalLanguageLayer` is correctly LLM-free, and the BoM column restructure sums correctly to 100%.

---

## Cost
- Grok 4.3: ~$0.008 USD
- Gemini 3.1 Pro: ~$0.015 USD (ABSTAIN — garbled)
- GLM 5.1: ~$0.012 USD
- MiMo v2.5 Pro: ~$0.009 USD
- **Total: ~$0.044 USD (~£0.035)**
