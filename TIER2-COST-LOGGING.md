# Tier 2 cost logging — `logLlmUsage` wiring

Wired `logLlmUsage` into every Tier 2 LLM call site listed in `LLM-CALL-SITES.md`. Each site logs three states (success, error from `!response.ok`, error from network throw) so the line counts below are higher than the call-site counts.

## Files touched (14)

| File | Call sites instrumented | `void logLlmUsage(...)` invocations | Notes |
| --- | ---: | ---: | --- |
| `src/app/api/health/ai/route.ts` | 3 (Anthropic, OpenAI, Gemini) | 6 | Each provider has 1 success + 1 throw branch (no separate `!ok` for these because they read JSON and check shape). MiniMax stays as key-existence check, not instrumented. |
| `src/app/api/suppliers/match/route.ts` | 1 helper, 2 providers (DeepSeek + Anthropic Haiku fallback) | 6 | `callHaiku` now takes `{ foundryId, userId }` context; threaded through from POST handler via `user.id` + `foundryId`. |
| `src/app/api/investors/match/route.ts` | 2 helpers (`callHaiku` + `callOpus`), 3 providers total | 9 | Both helpers extended with context; threaded from `user.id` + active `foundryId`. Opus fallback to Haiku preserved (passes context through). |
| `src/app/api/outreach/generate/route.ts` | 1 streaming Anthropic call | 4 | Stream parser captures `tokensIn`/`tokensOut` from `message_start` + `message_delta`. Logs success after stream closes; error on throw, on `!ok`, and on inner stream-loop catch. |
| `src/actions/task-delegation.ts` | 1 Anthropic call | 3 | `taskDelegationModel` resolved before fetch so error paths have it. |
| `src/actions/xray.ts` | 1 Opus call inside `runConceptResearchAction` | 3 | Added `({ user, foundryId })` destructure to the existing `withAIGate` callback (was empty `()`). |
| `src/actions/outreach.ts` | 1 helper used by 2 sites (research + sequence) | 3 | `callClaude` now accepts `{ foundryId, userId }`; both call sites updated to pass `{ foundryId: foundry_id, userId: user.id }`. |
| `src/actions/specialist-page-insights.ts` | 6 sites | 18 | Action slugs: `page_insights_today` (Cal Today briefing), `page_insights_strategy`, `page_insights_objectives`, `page_insights_tasks`, `page_insights_<specialistId>` for `generatePageBriefing`, and `page_insights_<surface ?? specialistId>` for `callModelForInsights` (the generic insights helper now accepts an optional `surface` parameter — no current callers pass it, so the slug currently defaults to `page_insights_<specialistId>`). All 6 sites log success + 2 error paths. |
| `src/lib/reports/summary-generator.ts` | 1 Anthropic Haiku call | 3 | No auth context available (utility called from various contexts); `foundryId`/`userId` left undefined. |
| `src/app/api/recruits/match/route.ts` | 1 DeepSeek call | 3 | `callHaiku` extended with context; passed `{ foundryId, userId: user.id }` from POST handler. |
| `src/actions/investor-outreach.ts` | 1 DeepSeek call | 3 | Already had `withAIGate({ supabase, user, foundryId, trackUsage })` — added `logLlmUsage` alongside existing `trackUsage` so the new admin-cost dashboard sees the row immediately while legacy `trackUsage` keeps working. |
| `src/actions/stage-briefings.ts` | 1 DeepSeek call | 3 | Logs `userId` only (no foundry context derived in this action). `specialistId` set to `mapping.specialistId`. |
| `src/actions/cad-lab-classify.ts` | 1 DeepSeek call | 3 | Pulled `({ user, foundryId })` from `withAIGate` callback (was empty `()`). |
| `src/actions/company-review.ts` | 1 DeepSeek call | 3 | Logs `userId` only — this action checks auth via `getUser()` directly without `withAIGate`/`withAuth`, so `foundryId` not in scope. |
| **Total** | **22 call sites** | **70 `logLlmUsage` invocations** | |

## Action slugs used

Anthropic surface:
- `health_check_anthropic`, `health_check_openai`, `health_check_gemini`
- `supplier_match`, `investor_match`, `recruit_match`
- `outreach_generate`, `outreach_compose`
- `task_delegation`
- `xray`
- `report_summary`
- `page_insights_today`, `page_insights_strategy`, `page_insights_objectives`, `page_insights_tasks`, `page_insights_<specialistId>`

DeepSeek surface:
- `supplier_match`, `investor_match`, `recruit_match` (same slug as Anthropic equivalents — different `modelUsed` differentiates)
- `investor_outreach`, `stage_briefings`, `cad_lab_classify`, `company_review`

## Quirks worth flagging

1. **`generatePageBriefing` action slug uses the specialist id** (`page_insights_<specialistId>`), so on Cal's Today / Sage's Strategy etc. you'll see the same `page_insights_chief-of-staff` / `page_insights_strategist` slug from both this generic function and the page-specific functions. The explicit page-specific slugs (`page_insights_today`, `page_insights_strategy`, `page_insights_objectives`, `page_insights_tasks`) override that for those four surfaces. If granularity matters per page, future callers of `generatePageBriefing` can pass the surface in via a new arg, but no current code does.
2. **`callModelForInsights` got an optional `surface` parameter**. The current `callInsights(...)` wrapper does not pass it, so the slug defaults to `page_insights_<specialistId>` (parameterised, not "generic"). All 18 surfaces that go through this helper today share that pattern.
3. **`investor-outreach.ts` keeps the legacy `trackUsage(...)` call.** The brief said never modify the existing call shape — `trackUsage` still runs, the new `logLlmUsage` is additive. Once `trackUsage` is fully retired the old call can be deleted.
4. **`outreach/generate/route.ts` is a streaming endpoint** — token counts come from Anthropic SSE `message_start` (input) and `message_delta` (output) events. Mid-stream errors log with the partial counts captured up to that point, never with bogus zero output tokens.
5. **`investors/match` `request: Request` parameter is unused but pre-existing** — left untouched per "Existing callers must compile without changes".
6. **`request: Request` parameter** is unused on `outreach/generate` POST and pre-existed; no change.
7. **No foundry context for `report_summary`, `stage_briefings`, `company_review`** — these helpers don't pull foundry context. Logged with `foundryId` undefined (allowed by the wrapper interface).

## Untouched call sites with reasons

- **`api/health/ai/route.ts:117` (Qwen DashScope)** — not in the brief's Tier 2 list, so left as-is. Easy to add later if Qwen becomes a permanent provider.
- **`api/health/ai/route.ts:142` (MiniMax)** — file does not actually call MiniMax; only checks for the API key. Nothing to log.
- **`actions/xray.ts:2543` (Gemini google-search call)** — also a search retrieval call inside `runConceptResearchAction`, not in Tier 2 list. Leaving for a follow-up if Tristan wants Gemini search costs tracked separately.

## Type-check + tests

```
NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit \
  | grep -E "src/actions/(cad-lab-classify|company-review|investor-outreach|outreach|specialist-page-insights|stage-briefings|task-delegation|xray)\.ts|src/app/api/(health/ai|investors/match|outreach/generate|recruits/match|suppliers/match)/route\.ts|src/lib/reports/summary-generator\.ts"
# (no output — clean for all 14 modified files)

npx jest src/lib/security/__tests__/rate-limit-regression.test.ts
# Tests:       38 passed, 38 total
```

Pre-existing tsc errors in `src/actions/plan/*`, `__tests__/tasks.test.ts`, `.next/types/validator.ts` are untouched and unrelated.

## Files NOT modified (per parallel-terminal lockout)

`src/lib/agents/specialists-config.ts`, `src/lib/agents/failover.ts`, `src/lib/ai-providers/types.ts`, `src/lib/ai-providers/usage-tracking.ts` (file is `src/lib/ai/usage-tracking.ts` per `git status` — same restriction, not touched), `src/lib/ai/models.ts`, `src/lib/agents/sweep-orchestrator.ts`, `src/app/(platform)/agents/brief-specialist-dialog.tsx`. None of my Tier 2 sites lived in those files anyway.
