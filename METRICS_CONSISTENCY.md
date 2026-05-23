# METRICS_CONSISTENCY — keyMetrics / briefBlock / designDecisions flow (2026-05-23)

Per Grok's plan-review addition: where do the three durable cross-stage objects come from, who reads them, and is each consumer reading the AUTHORITATIVE source or recomputing?

## `keyMetrics` — the cover-page headline

### Source
- **Initialised:** `scripts/serial-design-chain-v2.tsx:2102` — `let keyMetrics: KeyMetrics | null = null  // populated AFTER Phase 2 by headline-deriver`
- **First population:** `serial-design-chain-v2.tsx:3085` — `keyMetrics = derived as KeyMetrics` (inside Stage 32 `deriveHeadlineFromModules` call at lines 3076-3094)
- **File written:** `9-headline-derived.json` at line 3093

### Schema
Defined in `src/lib/pdf-engine-v2/types/module-decomposition.ts` (`KeyMetrics`). Contains the cover-page headline fields the renderer prints:
- `nameplate_capacity` / `working_volume` / equivalent scale metric for the class
- `installed_asp_gbp` / cost-stack outputs
- `efficiency` / `power_density` / other class-specific KPIs
- Source field per metric (brief / derived / class_default)

### Consumers (in execution order)

| # | Consumer | Line | What it does with keyMetrics | Authoritative? |
|---|---|---|---|---|
| 1 | LLM Generator (Stage 15) | 2354 (passes to `formatKeyMetricsBlock`) | Injects into Gemini 3.1 Pro system prompt | 🔴 **NULL — Stage 32 hasn't run** |
| 2 | PHASE 4 skeleton critic (Stage 18) | 2520 | Reviewer prompt block | 🔴 **NULL** |
| 3 | R1 single reviewer Grok 4.3 (Stage 19) | 2563 | Reviewer prompt block | 🔴 **NULL** |
| 4 | STEP 7.5 physics critic (Stage 20) | 2582 | Critic prompt | 🔴 **NULL** |
| 5 | R4 Flash-Lite (Stage 22) | 2628 | Reviewer prompt | 🔴 **NULL** |
| 6 | Specialist R4.5 (Stage 24) | 2695 | Reviewer prompt | 🔴 **NULL** |
| 7 | Physics repair loop (Stage 25) | 2745 | Repair prompt | 🔴 **NULL** |
| 8 | `deriveHeadlineFromModules` POPULATES | 3085 | Sets `keyMetrics` for the first time | n/a — write site |
| 9 | Performance card builder (Stage 39 sub) | inside `buildPerformanceCard` | Reads `state.keyMetrics` | ✓ ok (Stage 32 has run) |
| 10 | G2 cost-reality gate (Stage 47) | 3793-3982 | Reads `state.keyMetrics.product_class` | ✓ ok |
| 11 | Renderer cover panel | `render-minimal-pdf.tsx:1217-1232, 2186-2254` | Reads costStack + bomTotals via keyMetrics product_class | ✓ ok |

### Source-vs-recompute status

🔴 **BROKEN: 7 of 11 consumers see null** because Stage 32 runs AFTER Stages 15/18/19/20/22/24/25.

The reviewer prompt builder (`runReviewerStep` at line 1665) calls `formatKeyMetricsBlock(opts.keyMetrics ?? null)`. With null input, the block formats as an empty placeholder. Reviewers cannot ground their critique on the cover-page numbers because those numbers don't exist yet.

### Fix (trivial)
Move Stage 32 (deriveHeadlineFromModules) earlier in the chain — before Stage 18 (skeleton critic). The function needs:
- `design.modules` ✓ available by line 2435 (Stage 16)
- `parsedResult.data` ✓ available from Stage 7
- `productClass` ✓ available from Stage 7
- `currentBriefText` ✓ available from Stage 4

Run Stage 32 once after Stage 16, then OPTIONALLY re-run after Phase 2 mutations (line 2928) if needed. The first population unblocks all 7 reviewers; the re-run keeps the cover-page numbers current after Phase 2.

---

## `briefBlock` — the parsed-brief envelope

### Source
- **Built:** `serial-design-chain-v2.tsx:1944-1973` (Stage 5)
- **File written:** `2-brief-block.json` at line 1971
- **Schema:** assembled inline from `revisionHistory`, `brief`, `parsedResultOriginal.data`, `currentBriefText`, `currentParsed`

### Consumers

| # | Consumer | Line | Reads | Authoritative? |
|---|---|---|---|---|
| 1 | Halt path | 1985 | `haltState.brief = briefBlock` | ✓ |
| 2 | Final state assembly | inside Stage 39 (line 3376-3502) | `state.brief = briefBlock` | ✓ |
| 3 | Renderer brief page | `render-minimal-pdf.tsx` (search `state.brief`) | reads from state.json | ✓ |
| 4 | Reviewer prompt builder | `serial-design-chain-v2.tsx:1665+` | does NOT read briefBlock directly; uses `parsedBrief` (= currentParsed) and `brief` (raw text) instead | ✓ (different source, both authoritative) |

### Source-vs-recompute status

🟩 **GREEN.** `briefBlock` is built once at line 1944-1973 from authoritative sources, persisted to disk, and read consistently from state.json downstream. No recomputation drift.

### Risk
- The `briefBlock` shape (revisionHistory + originalParsed + finalParsed) is bundled at line 1944, but the renderer reads individual sub-fields (`state.brief.revisionHistory`, `state.brief.parsed_original`, etc.). If the renderer expects a field name that the bundler didn't write, silent absence.

---

## `designDecisions` — the design-decision register

### Source
- **First populated:** `serial-design-chain-v2.tsx:3166-3185` (Stage 36) — `designDecisions = await resolveDesignDecisions(...)` (LLM call)
- **File written:** `10-design-decisions.json` at line 3184
- **Extended:** Stage 36b at lines 3187-3278 — routes failed structural gates → designDecisions

### Schema
`Array<DesignDecision>` where each entry has:
- `module_id`, `sub_module_id`, `word_id` (locator)
- `decision_kind` (`'unrepaired_gate' | 'design_choice' | 'manual_review'`)
- `description`, `rationale`, `recommendation`
- `severity` (`'info' | 'warn' | 'fatal'`)

### Consumers

| # | Consumer | Line | What it does | Authoritative? |
|---|---|---|---|---|
| 1 | Stage 38 acceptance-status compute | 3328-3374 | `designDecisions.length` feeds `acceptanceStatus ∈ {accepted_clean, accepted_with_decisions, ...}` | ✓ |
| 2 | Stage 39 build NL layer / save state | 3376-3502 | `state.designDecisions = designDecisions` | ✓ |
| 3 | `buildDesignDecisionsReview(state)` | inside Stage 39 (dynamic import) | Builds `state.designDecisionsReview` summary block | ✓ |
| 4 | Renderer §6 design-decisions list | `render-minimal-pdf.tsx` (search `designDecisions`) | Reads from state.json | ✓ |
| 5 | Final log line | 4054 | `design_decisions=${designDecisions.length}` | ✓ |

### Source-vs-recompute status

🟩 **GREEN.** Single source of truth at Stage 36; extended by Stage 36b; written to state; read consistently. No recomputation.

### Risk
- Stage 36b extends the list by appending; if a subsequent stage filters or reorders, the renderer's order may not match the chain's verdict. No filtering observed in code today.

---

## Cross-object risks

### Risk 1: `keyMetrics.product_class` vs `state.moduleDecomposition.product_class` divergence

`buildPerformanceCard` (`src/lib/pdf-engine-v2/performance-card.ts:483-485`) reads:
```ts
const productClass =
  state?.moduleDecomposition?.product_class
  ?? state?.parsedBrief?.product_class
  ?? '';
```

But Stage 23 (canonical product_class override at line 2634-2656) updates `design.product_class`. If `design.product_class` differs from `parsedBrief.product_class` (e.g. brief says "battery", classifier says "bess"), the performance card uses the overridden value. The renderer cover panel uses `keyMetrics.product_class` which is `state.moduleDecomposition.product_class` — same source. **OK.**

### Risk 2: `keyMetrics.installed_asp_gbp` vs cost-stack `costStack.installed_asp_gbp` divergence

The cover-page cost stack is computed at RENDER TIME via `class-cost-structure.ts:computeCostStack(bomTotals.grandTotal_gbp, ratios, class_key)` — NOT stored in `keyMetrics`. The renderer at line 1227-1228 uses `costStack.installed_asp_gbp`. Two paths exist:
- `bomTotals` is computed from partVerifications + macros at render time
- `costStack` is the cascade applied to bomTotals.grandTotal

If `keyMetrics` had been populated BEFORE Stage 47 (G2 cost-reality), and if `keyMetrics.installed_asp_gbp` is ever stored, they could diverge. Today `keyMetrics` does NOT store `installed_asp_gbp` directly (only the brief-target capacity). **OK — no divergence observed.**

### Risk 3: `briefBlock.parsed_original` vs `state.parsedBrief`

Stage 5 puts `parsedResultOriginal.data` (the ORIGINAL, pre-refinement parse) into `briefBlock.parsed_original` (line 1944-1973). Stage 7 promotes `currentParsed` (the post-refinement parse) into `parsedResult.data`. The renderer reads `state.parsedBrief` which is... where?

Looking at Stage 39 state assembly (line 3376-3502): `parsedBrief: currentParsed` is stored. So the renderer's `state.parsedBrief` IS the post-refinement version. **OK.**

But `briefBlock.parsed_original` is also persisted to state. Renderer could read either; they differ. If a renderer block uses `state.parsedBrief` and another uses `state.brief.parsed_original`, the brief constraints displayed could mismatch the design constraints used. **Risk — verify which the renderer reads in each block.**

### Risk 4: `designDecisions` ordering between G3 review-completeness and renderer

G3 (Stage 47) computes `g3_review_gaps[]` independently of `designDecisions`. Both render in the PDF. If a manual-review badge fires from G3 but not from designDecisions (or vice versa), the reader sees inconsistent flags. **Risk — verify cross-consistency in renderer.**

---

## Summary

| Object | Source-vs-recompute status | Action needed |
|---|---|---|
| **keyMetrics** | 🔴 **BROKEN — 7 of 11 consumers see null** | **Move Stage 32 before Stage 18 (trivial reorder)** |
| **briefBlock** | 🟩 GREEN | Verify renderer reads which version (post-refinement is correct) |
| **designDecisions** | 🟩 GREEN | Verify cross-consistency with G3 gaps in renderer |

The single highest-impact fix is **moving Stage 32 earlier**. It unblocks every reviewer in the cascade to see the cover-page numbers their critique is grounding against. Today they critique blind.
