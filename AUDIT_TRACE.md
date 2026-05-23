# AUDIT_TRACE — End-to-End Pipeline (2026-05-23)

Code-verified trace of every stage from `user pastes brief` → `clicks Go` → `PDF lands`. Every claim cites file:line. Source evidence: `/tmp/audit-seat-{A,B,C,D,E}.md` + `/tmp/audit-stage-map.md`.

## Front door (web)

| # | Stage | File:line | Input | Transformation | Output | Goes to |
|---|---|---|---|---|---|---|
| 0a | User opens form | `src/app/(platform)/the-forge-v2/new-v2/page.tsx` | URL nav | render React form | `<NewBriefForm>` | user input |
| 0b | Client submit | `src/app/(platform)/the-forge-v2/new-v2/new-brief-form.tsx:21,31-42` | `brief` (≥60 chars), optional project_name + variations | `POST /api/pdf-engine-v2/submit` | HTTP body | API route |
| 0c | API: validate + insert | `src/app/api/pdf-engine-v2/submit/route.ts:42-192` | zod-validated body (brief 20-20,000 chars, project_id uuid optional, variations max 5) | Auth via `withUser`, foundry membership check, insert `pdf_engine_runs` row(s) status='pending' | `{ job_id, project_id, variation_job_ids[] }` | `pdf_engine_runs` table |
| 0d | User redirected to wait | `wait/page.tsx` → polls `/api/pdf-engine-v2/status/[id]` | job_id | poll every Ns | `{ status, pdf_url? }` | UI |

## Worker layer (Mac Studio LaunchAgent)

| # | Stage | File:line | Input | Transformation | Output | Goes to |
|---|---|---|---|---|---|---|
| 0e | Worker polls | `scripts/pdf-engine-worker.mjs:151-216` | Supabase `pdf_engine_runs` table | Atomic claim: `UPDATE … SET status='processing' WHERE id=$1 AND status='pending'` (optimistic concurrency) | Claimed row | spawn chain |
| 0f | Worker spawns chain | `scripts/pdf-engine-worker.mjs:306` | `briefPath`, `jobDir` | `spawn('npx', ['tsx', 'scripts/serial-design-chain-v2.tsx', briefPath, jobDir])` | child process | chain main() |
| 0g | Chain runs (~40-60 min) | `scripts/serial-design-chain-v2.tsx` `main()` (line 1772-4058) | brief.md + outDir | 50 stages below | `chain-v2.pdf` + `state.json` | upload step |
| 0h | Worker uploads PDF | `pdf-engine-worker.mjs` (Supabase Storage) | `chain-v2.pdf` | `readFileSync` → Storage upload | URL | `pdf_engine_runs.pdf_url` |
| 0i | Worker stamps status | `pdf-engine-worker.mjs` | child exit code | `UPDATE pdf_engine_runs SET status='ready' WHERE id=$1` (or 'failed') | row updated | user polling sees `ready` |

## Chain main() — 50 stages

Bracketed line numbers are within `scripts/serial-design-chain-v2.tsx` unless stated.

### Phase 0 — Brief ingestion + refinement

| # | Stage | Lines | Trigger | Input | Output | Goes to |
|---|---|---|---|---|---|---|
| 1 | Init + arg parse + log + read brief | 1773-1789 | unconditional | argv | `brief`, `outDir`, `0-original-brief.md` | every stage |
| 2 | Brief parsing (Gemini 3.1 Pro) | 1792-1796 (calls `runBriefParsing` in `src/lib/pdf-engine-v2/stages/0-brief-generation.ts:285`) | unconditional | brief string | `parsedResultOriginal.data` (StructuredBriefJSON) + `1-parsed-brief-original.json` | classify, refinement loop |
| 3 | Product classification | 1798-1800 | unconditional | brief | `classificationOriginal.{productClass, confidence}` (det) | `currentProductClass` |
| 4 | Phase 0 refinement loop (×3) | 1806-1942 | `briefIter < MAX_BRIEF_ITERS=3` | currentBriefText | mutated currentBriefText, revisionHistory[] | briefBlock |
| 4a | (loop) plausibility critic (FLASH_3_5) | 1216-1220 | per iter | brief + product class | `possible: bool, contradictions[]` | revision picker |
| 4b | (loop) revision rewrite (FLASH_3_5) | inside loop | conditional | brief + chosen revision | rewritten brief | re-parse |
| 4c | (loop) MAX_RELAX_FACTOR guard | 1823 | `factor > 3` → break | revision factor | break | exit loop |
| 5 | Build briefBlock | 1944-1973 | unconditional | revisionHistory, parsedResultOriginal, currentParsed | `2-brief-block.json` | state.brief, halt path |
| 6 | Fatal halt check | 1975-1989 | `!plausibility.possible && any contradiction ratio >5×` | plausibility | `process.exit(2)` if halt | process exits |
| 7 | Promote refined brief to working set | 1991-1995 | unconditional | currentParsed | `parsedResult`, `productClass`, `classification`, `1-parsed-brief.json` | all downstream |

### Phase 1 — Contract + research + orchestrator

| # | Stage | Lines | Trigger | Input | Output | Goes to |
|---|---|---|---|---|---|---|
| 8 | Engineering Contract build | 1997-2035 (calls `buildContractForChain` in `scripts/lib/engineering-contract.ts:181-225`) | unconditional | productClass, parsedResult.data | `engineeringContract` (per-archetype) + `0.5-engineering-contract.json` | orchestrator gate, deterministic emitter, LLM generator system prompt |
| 9 | G0 physics ledger | 2037-2065 (calls `runPhysicsLedger` in `src/lib/pdf-engine-v2/stages/0.1-physics-ledger.ts`) | unconditional | currentBriefText, parsedResult.data, productClass | `physicsLedger` (zero LLM) | state.physicsLedger; manual-review badge |
| 10 | G1b compliance gate | 2067-2085 (calls `runComplianceGate` in `src/lib/pdf-engine-v2/stages/3.5-compliance-gate.ts`) | unconditional | parsedResult.data, productClass, brief | `complianceGate.{verdict, mandatory_covered, jurisdictions_detected, gaps}` | state.complianceGate; Stage 38, 48 |
| 11 | Research synthesis (MiMo V2.5 Pro) | 2087-2091 (calls `runResearchSynthesis` in `src/lib/pdf-engine-v2/stages/1-research.ts`) | unconditional | parsedResult.data, productClass | `research` + `3-research.json` | LLM Generator, all reviewers |
| 12 | keyMetrics = null (DEFERRED — known bug) | 2096-2102 | unconditional | nothing | `keyMetrics=null` | **passed-as-null** to Stages 15/18/19/20/22/24/25 |
| 13 | Universal Orchestrator | 2148-2308 (calls `orchestrateDesign` in `scripts/lib/orchestrator/orchestrate.ts`) | env: `ORCHESTRATOR=1` AND engineeringContract | parsedConstraints + engineeringContract | `design`, `toolOutputsBlock`, `orchestratorRan=true` + 4 JSON files | skips Stages 14+15; feeds Stages 18+; sets `state.orchestratorContract` |
| 13a | (sub) envelope detection | `orchestrate.ts:59-70` | inside Stage 13 | parsedConstraints | `BriefEnvelope \| null` | plan selection |
| 13b | (sub) plan selection | `orchestrate.ts:72-79` | inside Stage 13 | envelope | `ClassToolPlan \| null` | tool execution |
| 13c | (sub) tool execution (fixed-point) | `executor.ts:88-98` | inside Stage 13 | plan, contract | tool_results, **silent warn if max_iter** | aggregator |
| 13d | (sub) consistency verifier | `verifier.ts` | inside Stage 13 | contract, tool_results | pass/fail | aggregator |
| 13e | (sub) aggregator → assembler (per-class emitter) | `assembler.ts:99-147` + `submodule-splitter.ts` (universal post-emit) | inside Stage 13 | contract, envelope | DesignJSON (split if density<2.0) | output of Stage 13 |
| 14 | Deterministic emitter (BESS only) | 2309-2332 (calls `emitBessDesign`) | env: `DETERMINISTIC_EMITTER=1` AND `canEmitBess` | engineeringContract | `design` | Stage 16 |
| 15 | LLM Generator (Gemini 3.1 Pro, best-of-N=3) | 2333-2432 | else-fallback when 13+14 don't fire | brief, parsed, research, keyMetrics(null), engineeringContract | `design` (best of N) | Stage 16 |

### Phase 1.5 — Constraint propagation + design validation

| # | Stage | Lines | Trigger | Input | Output | Goes to |
|---|---|---|---|---|---|---|
| 16 | Propagate brief constraints → design.derived_parameters | 2434-2445 | unconditional | design, parsedResult.data | mutated design | Phase 2 |
| 17 | Contract proposal validation (`__contractMisses`) | 2447-2504 | `macro_assembly_prices.length > 0` | design.modules, macros | `(design.modules as any).__contractMisses` | reviewer prompts (line 1675) |

### Phase 4 — Skeleton critic

| # | Stage | Lines | Trigger | Input | Output | Goes to |
|---|---|---|---|---|---|---|
| 18 | PHASE 4 skeleton physics critic (LLM) | 2506-2545 | unconditional | design, parsed (keyMetrics=null) | `skeletonCritique`, `skeletonFailFast` (**dead** — set but never branched on) + `4-5-skeleton-critique.json` | R1 systemAppend |

### Phase 5 — Reviewer cascade

| # | Stage | Lines | Trigger | Input | Output | Goes to |
|---|---|---|---|---|---|---|
| 19 | STEP 5 — R1 reviewer (Grok 4.3, fallback Qwen 3.6 Max) | 2558-2565 | unconditional | brief, parsed, research, design, keyMetrics(null), toolOutputs+skeletonCritic | mutated design + 5-r1-grok.{json,raw.txt} | Stage 20 |
| 20 | STEP 7.5 physics critic (post-R3) | 2567-2600 | unconditional | design, parsed, keyMetrics(null), productClass | `critique` + `7-5-physics-critique.json` | Stage 21, 25, state, Stage 38, 48 |
| 21 | Build criticAppend | 2607-2613 | `critique.issues.length > 0` | critique.issues | string | Stage 22 |
| 22 | STEP 8 — R4 Flash-Lite review | 2620-2632 | unconditional | brief, parsed, research, design, keyMetrics(null), R4_FACTCHECK_APPEND+criticAppend | mutated design + 8-r4-flashlite.{json,raw.txt} | Stage 23 |
| 23 | Canonical product_class override | 2634-2656 | `design.product_class !== currentProductClass` | both | mutated design.product_class | Stage 24 |
| 24 | STEP 8.5 — Specialist R4.5 | 2658-2710 | env: `CHAIN_SKIP_SPECIALIST !== '1'` AND specialist exists | brief, parsed, research, design, keyMetrics(null) | mutated design + 8-5-specialist.{json,raw.txt} | Stage 25 |
| 25 | Physics repair LOOP (×4) | 2712-2773 | `critique && (hasHighSev OR lowPlaus)` | design, critique, keyMetrics(null) | mutated design + overwritten critique = post-repair | state.physicsRepair, Stage 38, 48 |

### Phase 2 — Translate + gates + repair

| # | Stage | Lines | Trigger | Input | Output | Goes to |
|---|---|---|---|---|---|---|
| 26 | Pre-Phase-2 dedup modifiers | 2775-2784 | unconditional | design.modules | mutated | Phase 2 loop |
| 27 | Pre-Phase-2 sub-module prose pre-fill | 2786-2794 | unconditional | design.modules | mutated | Phase 2 loop |
| 28 | G0.5 brief-target reconciliation | 2796-2836 | unconditional | parsed, design | `reconciliation`; HALT → `exit(3)` if scale mismatch | state.briefTargetReconciliation |
| 29 | Phase 2 translate + arith + grammar + repair LOOP (×18) | 2838-2928 | unconditional | design.modules, parsed, apiKey | mutated design + allPassed, finalArith, finalGrammar | Stage 30, 32, 36b, 37 |
| 30 | Post-Phase-2 prose + dedup | 2930-2950 | unconditional | design.modules | mutated | Stage 31+ |
| 31 | K10 shadow validation | 2952-3074 | unconditional | design.product_class, design.cross_module_grammar_links | `design.k10ShadowResult` | state.moduleDecomposition.k10ShadowResult |
| 32 | **Headline derivation (populates keyMetrics)** | 3076-3094 (calls `deriveHeadlineFromModules`) | unconditional | design.modules, parsed, productClass, brief | `keyMetrics` populated + `9-headline-derived.json` | state.keyMetrics |

> **CROSS-CUT 10 (RED):** Stage 32 populates keyMetrics AFTER Stages 15/18/19/20/22/24/25 have already run with `keyMetrics=null`.

### Phase 6 — Part verification + pricing + suppliers

| # | Stage | Lines | Trigger | Input | Output | Goes to |
|---|---|---|---|---|---|---|
| 33 | Part verification per-item (Flash-Lite) | 3096-3110 | unconditional | design.modules | partVerifications[] | Stage 34, 35, 37, G2, G3 |
| 34 | G5 catalogue RAG enrichment | 3112-3131 | env: `CHAIN_SKIP_G5_RAG !== '1'` | design, partVerifications | partVerifications mutated | Stage 37, renderer |
| 35 | Strip unverified parts + replacements | 3133-3160 | `strippedParts.stripped > 0` | design, partVerifications | partRecommendations[] + 10-part-verifications.json | state |
| 36 | Design Decisions resolver (LLM) | 3166-3185 | unconditional | design.modules, brief | designDecisions[] + 10-design-decisions.json | Stage 36b, 38 |
| 36b | Route failed structural gates → designDecisions | 3187-3278 | `!allPassed && finalFailedGates.length>0` | finalFailedGates | designDecisions[] extended | state, Stage 38 |
| 37 | Manual-review badges (G4 + G5) | 3280-3326 | unconditional | partVerifications, finalFailedGates | g5UnverifiedParts, design.g4ManualReview | state, renderer |
| 38 | Acceptance-status compute | 3328-3374 | unconditional | allPassed, complianceGate, g5ManualReview, g4, critique, designDecisions | `acceptanceStatus` ∈ {blocked, accepted_clean, accepted_with_decisions, not_accepted} | state.acceptanceStatus |

### Phase 7 — Persist state + subprocesses

| # | Stage | Lines | Trigger | Input | Output | Goes to |
|---|---|---|---|---|---|---|
| 39 | Build NL layer + save state.json | 3376-3502 (calls `buildNaturalLanguageLayer`, `buildPerformanceCard`, `buildDesignDecisionsReview`) | unconditional | all stage outputs | **`state.json`** | Stages 40-48 subprocesses |
| 39a | **stripWordSuffixFromDesign no-op** | 3499 — `stripWordSuffixFromDesign((state as any).design)` | unconditional | state | **NO-OP** (state has no `.design`, only `.moduleDecomposition`) | nothing |
| 40 | Engine B subprocess (estimate-missing-prices) | 3504-3525 | env: `CHAIN_SKIP_ENGINE_B !== '1'` | state.json on disk | mutated state.json | Stages 41-48 |
| 41 | Engine C subprocess (reference-product anchor) | 3527-3548 | env: `CHAIN_SKIP_ENGINE_C !== '1'` | state.json | mutated state.json | Stages 42-48 |
| 42 | Cost Repair LOOP subprocess (Grok 4.3) | 3550-3571 | env: `CHAIN_SKIP_COST_REPAIR !== '1'` | state.json | mutated state.json (sets `cost_repair_excluded_from_subtotal` flag — see WIRING_GAPS #9) | Stages 43-48 |
| 43 | Engine D (suppliers — Brave+corpus+Flash-Lite) | 3573-3597 | env: `CHAIN_SKIP_SUPPLIERS !== '1'` | state.json | state.suppliers + state.suppliers_provenance | Stage 44, G3, renderer |
| 44 | Supplier contact validation | 3599-3620 | env: `CHAIN_SKIP_SUPPLIER_VALIDATION !== '1'` | state.json | mutated state.json | renderer |
| 45a | Hero image (Blender → Gemini i2i) | 3644-3661 | env: `CHAIN_SKIP_IMAGE_GEN !== '1'` | state.json | `cover.png` + state.brief_hero_image_path | Stage 45b, renderer |
| 45b | Per-module images (Gemini i2i) | 3663-3679 | `heroSucceeded === true` | state.json with hero path | `module-<id>.png` per module | renderer |
| 46 | Deployment envelope persistence | 3684-3767 | unconditional | state.json re-read | state.deploymentEnvelope | renderer |
| 47 | Re-stamp + G2 cost-reality + G3 review-completeness | 3769-4024 | unconditional | state.json re-read, complianceGate | mutated state.json (`cost_reality_band/status/verdict`, `g3ManualReview`, `g3_review_gaps[]`) | renderer |

### Phase 8 — Render PDF

| # | Stage | Lines | Trigger | Input | Output | Goes to |
|---|---|---|---|---|---|---|
| 48 | **Render PDF subprocess** | 4026-4040 (calls `scripts/render-minimal-pdf.tsx`) | unconditional | state.json | **`chain-v2.pdf`** | worker upload |
| 49 | Open PDF locally (dev only) | 4041-4053 | env: `PDF_ENGINE_WORKER !== '1'` AND `RENDER_NO_OPEN !== '1'` | pdfPath | open Preview | human eyes |
| 50 | Final log line | 4054-4055 | unconditional | acceptanceStatus, allPassed, designDecisions | stderr + actions.jsonl | console |

> **GROK'S MISSING STAGE 48.5 (post-render integrity check):** No `statSync(pdfPath).size > 0`, no `%PDF-` header sniff, no page-count probe. A 0-byte file or JSON-as-PDF could ship as `status='ready'`. See IMPROVEMENT_PLAN P1.

## Exit codes (per Cross-cut 18)

| Code | Site | Meaning |
|---|---|---|
| 0 | normal | success |
| 1 | line 1776 + 4061 | **OVERLOADED**: brief refinement halt OR main() catch-all error |
| 2 | line 1987 | Phase 0 fatal halt (hard contradictions remain after MAX_BRIEF_ITERS) |
| 3 | line 2831 | G0.5 brief-target reconciliation HALT |

Worker / cron cannot distinguish "retry" from "give up" because code 1 is ambiguous.

## Data-flow risks called out

1. **Stage 8 fallback to LLM-only** — if `buildContractForChain` throws (caught at 2033), `engineeringContract` stays null → Stage 13 silently skipped → Stage 15 LLM Generator runs with no contract.
2. **Stage 12 → 32 keyMetrics gap** — every reviewer/critic between gets null. See CROSS-CUT 10.
3. **Stage 17 `__contractMisses`** — attached to `design.modules` via `as any`; read at chain line 1675 only (inside reviewer-prompt builder). Persists in state.json but no other consumer.
4. **Stages 40-44 disk-only mutation** — chain parent's in-memory `state` is stale from line 3501 to 3691. Re-reads at 3691 + 3774 (`liveState`). Future patch adding `state.X` access in that band silently reads stale data.
5. **Stage 18 `skeletonFailFast`** — set when plausibility ≤2 but **never branched on** (logged only). Comment intentional but misleading variable name.
6. **Stage 39a no-op** — `stripWordSuffixFromDesign((state as any).design)` reads non-existent field. The two earlier strips at 2176 + 2412 are the only ones that actually run.

## Source files audited (8 primary + many supporting)

- `scripts/serial-design-chain-v2.tsx` (4060 lines, the orchestrator script)
- `scripts/pdf-engine-worker.mjs` (590 lines, the worker)
- `src/app/api/pdf-engine-v2/submit/route.ts` (269 lines, web entry)
- `src/lib/pdf-engine-v2/stages/0-brief-generation.ts` (brief parser)
- `src/lib/pdf-engine-v2/stages/0.1-physics-ledger.ts`
- `src/lib/pdf-engine-v2/stages/3.5-compliance-gate.ts`
- `src/lib/pdf-engine-v2/stages/1.8-brief-target-reconciliation.ts`
- `src/lib/pdf-engine-v2/stages/1-research.ts`
- `scripts/lib/engineering-contract.ts` (3700+ lines, 35 archetype builders)
- `scripts/lib/orchestrator/*.ts` (orchestrator, planner, executor, assembler, verifier, splitter, normaliser)
- `scripts/lib/orchestrator/emitters/*.ts` (36 per-class emitters)
- `scripts/lib/orchestrator/tools/python/*.py` (229 tool wrappers)
- `scripts/render-minimal-pdf.tsx` (6000+ lines, renderer)
- `scripts/{estimate-missing-prices,enrich-state-with-reference-anchor,cost-repair,enrich-state-with-suppliers,validate-supplier-contacts}.tsx` (subprocess engines)
- `src/lib/pdf-engine-v2/class-cost-structure.ts` (cost-stack ratios)
- `src/lib/pdf-engine-v2/class-price-bands.ts` (price-band table)
- `src/lib/pdf-engine-v2/performance-card.ts` (headline + cover panel)
