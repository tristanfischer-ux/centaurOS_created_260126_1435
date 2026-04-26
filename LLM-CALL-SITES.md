# LLM Call Sites — Integration Map for `logLlmUsage`

This is the catalogue every Tier -1 cost-logging integration needs to cover. Generated 2026-04-25 by grepping the `src/` tree for direct LLM HTTP fetches, SDK clients, and helper wrappers. **Do not** treat the line numbers as stable — re-run the greps in this file when picking up the work, since the codebase moves daily.

The integration plan is: for each call site, after the LLM response (success or error) is received, fire `void logLlmUsage({ ... })` with the right `action`, `modelUsed`, `tokensIn`, `tokensOut`, optional `foundryId` / `userId` from the surrounding auth context, and `status: 'error' | 'timeout' | 'rate_limited'` on failure paths.

---

## Tier 1 — Centralized wrappers (do these first; one change covers many call sites)

These three locations together cover the majority of LLM traffic. Wiring `logLlmUsage` into them is the single highest-leverage change.

### A. Streaming provider registry (specialist chat, /api/agents/execute, sweep)
File: `src/lib/ai-providers/registry.ts`
- `streamOpenAI` — line 135
- `streamAnthropic` — line 169
- `streamAnthropicWithWebSearch` — line 268
- `streamGoogle` — line 371
- `streamMiniMax` — line 594
- `streamDeepSeek` — line 633
- Ollama (OpenAI-compat) is routed through `streamOpenAI` with `OLLAMA_BASE_URL` (line 775); model id is `qwen-local` etc.

Plumbing: each `stream*` already receives `opts: StreamingTextOptions`. Add a final `await logLlmUsage({...})` in the `onDone` path of each function once the final `usage` block is parsed. For chunked streams without a usage delta, accumulate `tokensOut` from chunk counts (already estimated) and read `tokensIn` from the final SSE event. The `action` slug must be threaded in — extend `StreamingTextOptions` with `actionSlug`, `foundryId?`, `userId?`, `specialistId?` and let `getTextProvider` callers pass them.

Public entrypoint: `getTextProvider(providerId)` (registry.ts:1123). Callers: `src/app/api/agents/execute/route.ts`, `src/lib/agents/sweep-orchestrator.ts`, `src/lib/telegram/specialist-chat.ts`.

### B. Centralized non-streaming Claude client
File: `src/lib/ai/claude-client.ts`
- `callClaudeCentral` — line 91 (the only external function)

Plumbing: extend `ClaudeCallOptions` with `actionSlug: string`, `foundryId?: string`, `userId?: string`, `specialistId?: string`. Inside `makeRequest`, after parsing `data.usage`, fire `void logLlmUsage({...})`. On the `throw new Error(...)` path before the await of `withRetry`, also log with `status: 'error'` and `tokensIn: 0, tokensOut: 0`.

Callers: `src/lib/cad-lab/api-helpers.ts:118` is the lazy-imported wrapper. Everything that calls `callClaude()` from `cad-lab/api-helpers.ts` is then automatically logged via Tier 1.B once the centralized client is wired.

### C. Embedding wrappers
File: `src/lib/embeddings.ts` — `openai.embeddings.create()` at line 32
File: `src/lib/search/semantic-search.ts` — `client.embeddings.create()` at line 99
File: `src/lib/search/nomic-embed.ts` — local Ollama nomic-embed-text path (read the file when wiring; uses fetch to localhost:11434)

Plumbing: log with `tokensOut: 0`, `modelUsed: 'text-embedding-3-small' | 'text-embedding-3-large' | 'nomic-embed-text'`, `action: 'embedding_<purpose>'`. The semantic search and embedding helpers are heavy callers — the price map already has these models.

---

## Tier 2 — Direct `fetch()` to provider URLs (each needs in-place logging)

Each of these owns its own HTTP call to a provider. Wrap them in-place rather than refactoring through Tier 1, because they often have bespoke parameter shapes.

### Anthropic Messages API (`https://api.anthropic.com/v1/messages`)
- `src/app/api/health/ai/route.ts:41` — `action: 'health_check_anthropic'`
- `src/app/api/suppliers/match/route.ts:50` — `action: 'supplier_match'`
- `src/app/api/investors/match/route.ts:55` — `action: 'investor_match'` (first call)
- `src/app/api/investors/match/route.ts:82` — `action: 'investor_match'` (second call)
- `src/app/api/outreach/generate/route.ts:102` — `action: 'outreach_generate'`
- `src/actions/task-delegation.ts:258` — `action: 'task_delegation'`
- `src/actions/xray.ts:2629` — `action: 'xray'`
- `src/actions/outreach.ts:539` — `action: 'outreach_compose'`
- `src/actions/specialist-page-insights.ts:97` — `action: 'page_insights_<surface>'`
- `src/actions/specialist-page-insights.ts:281`
- `src/actions/specialist-page-insights.ts:564`
- `src/actions/specialist-page-insights.ts:663`
- `src/actions/specialist-page-insights.ts:756`
- `src/actions/specialist-page-insights.ts:1429`
- `src/lib/reports/summary-generator.ts:58` — `action: 'report_summary'`

### DeepSeek (`https://api.deepseek.com/chat/completions`)
- `src/app/api/health/ai/route.ts` (search for `api.deepseek.com` if added)
- `src/app/api/suppliers/match/route.ts:30`
- `src/app/api/investors/match/route.ts:32`
- `src/app/api/recruits/match/route.ts:29`
- `src/actions/investor-outreach.ts:117`
- `src/actions/stage-briefings.ts:97`
- `src/actions/cad-lab-classify.ts:118`
- `src/actions/company-review.ts:197`

### OpenAI (`https://api.openai.com/v1/chat/completions`)
- `src/app/api/health/ai/route.ts:67` — `action: 'health_check_openai'`

### Google Gemini (`https://generativelanguage.googleapis.com/...`)
- `src/app/api/health/ai/route.ts:93` — `action: 'health_check_gemini'`

### MiniMax (image / audio / video — out of scope for token logging but log spend differently)
- `src/lib/ai-providers/registry.ts:812` — image generation
- `src/lib/ai-providers/registry.ts:857` — text-to-audio
- `src/lib/ai-providers/registry.ts:944` — video generation

These are billed per-asset, not per-token. Suggest passing `tokensIn=0, tokensOut=0, costUsdOverride=<known-asset-cost>`.

---

## Tier 3 — Anthropic SDK clients (`new Anthropic({ apiKey })` + `client.messages.create / stream`)

Each call site instantiates the SDK directly. There are 35 of these — wrap each one's `.messages.create()` / `.messages.stream()` return path. Token counts are on `response.usage.input_tokens` / `output_tokens`.

- `src/app/(platform)/the-forge/services/cad-generator.ts:328` (action: `cad_lab_generate`)
- `src/app/(platform)/the-forge/services/structural-brief.ts:176` (action: `structural_brief`)
- `src/app/api/analyze-objectives/route.ts:93` (action: `objectives_analysis`)
- `src/app/api/marketplace/ai-search/route.ts:31` (action: `marketplace_ai_search`)
- `src/app/api/agents/execute/route.ts:1710` (action: `agent_execute_anthropic`) — secondary path; primary path goes via streaming registry
- `src/app/api/cron/morning-digest/route.ts:101` (action: `morning_digest`)
- `src/app/api/reports/generate-document/route.ts:159` (action: `report_generation`, streaming)
- `src/actions/cad-lab-reference-documents.ts:299` (action: `cad_lab_reference_docs`)
- `src/actions/analyze.ts:278` (action: `analyze`)
- `src/actions/cad-lab-reviews.ts:251` (action: `cad_lab_review_<module>`)
- `src/actions/cad-lab-reviews.ts:499`
- `src/actions/cad-lab-reviews.ts:718`
- `src/actions/cad-lab-reviews.ts:1062`
- `src/actions/cad-lab-reviews.ts:1244`
- `src/actions/money-thesis.ts:283` (action: `money_thesis`)
- `src/actions/investor-intel.ts:201` (action: `investor_intel`)
- `src/actions/buy-part-search.ts:290` (action: `buy_part_search`)
- `src/actions/buy-part-search.ts:534`
- `src/actions/buy-part-search.ts:634`
- `src/actions/bom.ts:207` (action: `bom_<phase>`)
- `src/actions/bom.ts:355`
- `src/actions/bom.ts:565`
- `src/actions/document-questions.ts:101` (action: `document_questions`)
- `src/actions/design-iteration-generator.ts:269` (action: `design_iteration`)
- `src/actions/products.ts:795` (action: `products_<phase>`)
- `src/actions/products.ts:1020`
- `src/actions/products.ts:1549`
- `src/actions/products.ts:1735`
- `src/actions/products.ts:2029` — `client.messages.create` synthesis
- `src/actions/products.ts:2187`
- `src/actions/products.ts:2374`
- `src/lib/agents/knowledge-compiler.ts:213` (action: `knowledge_compile`)
- `src/lib/cad-lab/multi-model-consensus.ts` (`callClaude` local helper at line 47 — refactor to use Tier 1.B)

---

## Tier 4 — OpenAI SDK clients (`openai.chat.completions.create / parse`)

There are 21+ of these. Each has `response.usage.prompt_tokens` and `response.usage.completion_tokens`.

- `src/app/(platform)/the-forge/services/fea-generator.ts:164`
- `src/app/(platform)/the-forge/services/convergence-controller.ts:281`
- `src/app/(platform)/the-forge/services/thermal-generator.ts:102`
- `src/app/(platform)/the-forge/services/scan.ts:266`
- `src/app/(platform)/the-forge/services/scan.ts:374`
- `src/app/(platform)/the-forge/services/scan.ts:563`
- `src/app/(platform)/the-forge/services/cfd-generator.ts:119`
- `src/app/actions/analyze-business-plan.ts:76` (action: `business_plan_analysis`)
- `src/app/api/voice-to-task/route.ts:160` (action: `voice_to_task`)
- `src/app/api/marketplace/compare/route.ts:182` (action: `comparison_assistant`)
- `src/app/api/marketplace/ai-search/route.ts:314` (action: `marketplace_ai_search_followup`)
- `src/app/api/marketplace/talent-match/route.ts:128` (action: `talent_match`)
- `src/app/api/marketplace/forge-match/route.ts:201` (action: `forge_match`)
- `src/app/api/rfq/voice/route.ts:114` (action: `voice_to_rfq`)
- `src/app/api/team/compare/route.ts:238`
- `src/actions/canvas.ts:1804` (action: `canvas`)
- `src/actions/strategic-planner.ts:364` (action: `strategic_planner`)
- `src/actions/transcript-to-strategy.ts:321` (action: `transcript_to_strategy`)
- `src/actions/assess-coverage.ts:116` (action: `coverage_assessment`)
- `src/actions/assess-coverage.ts:223`

---

## Out of scope for Tier -1 (do NOT log here)

- **Whisper transcription** — billed per-second of audio, not per-token. Add a separate `audio_seconds` column later if Tristan wants STT cost auditing.
- **OpenAI Realtime / HeyGen / Simli / Tavus** — billed per-minute of session. Already tracked separately in `realtime-voice-engine.ts`. Do NOT log via `llm_usage` (would double-count).
- **Test fixtures** under `__tests__/` — `src/actions/__tests__/cad-lab-report.test.ts` mocks `trackAIUsage`; ignore.

---

## Summary

| Tier | Files affected | Approx. coverage of production traffic |
|------|----------------|----------------------------------------|
| 1.A — streaming registry | 1 | Specialist chat + agent-execute + sweep — likely > 50% of total spend |
| 1.B — `callClaudeCentral` | 1 (covers ~20+ CAD Lab call sites via `cad-lab/api-helpers.ts`) | All non-streaming Claude usage routed centrally |
| 1.C — embeddings | 3 | All embedding spend |
| 2 — direct fetch | 22 sites across 13 files | Sub-10% of cost but still must log |
| 3 — Anthropic SDK direct | 35 sites across 19 files | High-cost (Opus + Sonnet) — biggest single bucket |
| 4 — OpenAI SDK direct | 21+ sites across 16 files | Mid-cost (gpt-5.4 / gpt-4.1-mini) |

**Recommended order of integration: Tier 1 first (3 files, ~80% coverage), then Tier 3 (highest cost), then Tier 4, then Tier 2.**
