# Tier 1.A — Streaming Provider Registry Cost Logging

**Date:** 2026-04-25
**File touched:** `src/lib/ai-providers/registry.ts`
**Pattern source:** `src/lib/ai/claude-client.ts`, `src/lib/embeddings.ts` (commit `56af2e60`)

---

## What changed

### 1. Module-level additions (top of file)

- New import: `logLlmUsage`, `LlmUsageStatus` from `@/lib/cost-logging/llm-usage`.
- New helper `classifyStreamError(err, httpStatus?) -> LlmUsageStatus` — maps HTTP status codes (429/529 -> `rate_limited`, 408/504 -> `timeout`) and message keywords (`overloaded`, `rate limit`, `timed out`, `aborted`) to the four allowed `llm_usage.status` values. Used inside every `stream*` catch.
- New helper `estimateTokens(text) -> number` — char-count / 4 fallback for providers whose streaming chunks do not carry a `usage` block.
- Both helpers are file-private (no `export`).

### 2. `StreamingTextOptions` extended

Four optional fields added at the end of the interface, each with JSDoc:

```ts
actionSlug?: string      // e.g. "agent_execute", "specialist_chat", "sweep_<id>"
foundryId?: string       // TEXT (foundries.id is text), not UUID
userId?: string          // auth.users.id
specialistId?: string    // e.g. "strategist", "cto"
```

No existing field signatures were changed. All four are optional, so existing callers compile unchanged.

### 3. Per-function instrumentation

| Function | Lines changed | Usage source on success | Notes |
|---|---|---|---|
| `streamOpenAI` | ~30 | **Estimator** (chunks/4) | OpenAI streaming API does not emit `usage` unless you opt in via `stream_options.include_usage`. Kept opt-in disabled to preserve existing semantics. |
| `streamAnthropic` | ~50 | **`stream.finalMessage().usage`** (real) — falls back to estimator if `finalMessage()` throws | Cache reads + cache writes summed into `tokensIn` so the cost dashboard never under-reports. Cache-aware pricing tracked as future enhancement. |
| `streamAnthropicWithWebSearch` | ~40 | **`response.usage`** (real, summed across pause_turn loops) | `pause_turn` continuation loops accumulate token totals; even on error the partial totals are still logged so we don't lose billed work. |
| `streamGoogle` | ~50 | **`result.response.usageMetadata`** (real) — falls back to estimator if missing | `promptTokenCount` -> `tokensIn`, `candidatesTokenCount` -> `tokensOut`. Wrapped in inner try/catch since some Gemini variants don't populate `usageMetadata`. |
| `streamMiniMax` | ~30 | **Estimator** (chunks/4) | OpenAI-compatible endpoint; same caveat as `streamOpenAI`. |
| `streamDeepSeek` | ~30 | **Estimator** (chunks/4) | OpenAI-compatible endpoint; same caveat as `streamOpenAI`. The DeepSeek `max_tokens` clamp at 32768 stays untouched. |

All success paths fire `void logLlmUsage({...status:'success'...})` after the stream completes. All catch blocks fire `void logLlmUsage({...status: classifyStreamError(err)..., errorMessage: errorMessage.slice(0, 200)...})` before calling `opts.onError`.

The web-search path is special: it can fail mid-pause-turn-loop after partial billing. The catch path passes `tokensIn: totalTokensIn, tokensOut: totalTokensOut` (the running totals from completed loops) instead of zero, so the cost dashboard reflects what was actually billed.

### 4. Out-of-scope (per the brief)

- `streamTogether`, `streamQwen`, `streamQwenLocal` — not in the LLM-CALL-SITES.md Tier 1.A list; left untouched.
- `generateOpenAIImage`, `generateStabilityImage`, `generateGoogleImage`, `generateReplicateImage`, `generateMiniMaxImage` (line 812 area), `generateOpenAIAudio`, `generateElevenLabsAudio`, `generateMiniMaxAudio` (line 857 area), `generateMiniMaxVideo`, `generateReplicateVideo` (line 944 area) — image/audio/video assets; per-asset billing handled separately.

---

## Provider-specific quirks

- **Anthropic streaming gives real usage** via `stream.finalMessage().usage` — this is the gold standard. Cache reads and writes are summed into `tokensIn` so the dashboard sees full input volume even when prompt caching is hot. The existing cache-metrics console.info log is preserved for observability.
- **Anthropic web_search beta is non-streaming under the hood** — the existing implementation simulates streaming by chunking the final response. Token totals are summed across `pause_turn` loops (max 5). On error we log partial totals (not zero) because those loops were already billed.
- **Google's SDK exposes `result.response`** — a Promise that resolves to the aggregated final response with `usageMetadata`. We `await` it AFTER the streaming for-loop completes (so it doesn't block streaming UX). Falls back to estimator if `usageMetadata` is missing on some Gemini variants.
- **OpenAI / MiniMax / DeepSeek streaming chunks do NOT include usage by default**. Passing `stream_options: { include_usage: true }` would surface a final usage chunk, but adding it now risks behavioral change to existing chat flows. We use the char-count/4 estimator and tag the row in code with `// estimated, no usage block from provider` so a future agent can flip the opt-in once Tristan signs off on the (very small) extra-chunk overhead.

## Estimator accuracy

The 4-chars-per-token heuristic is the standard GPT/Claude rule of thumb, off by ~25% on average. For cost dashboards (the consumer here) that's well within tolerance — the dashboard exists to catch order-of-magnitude problems and show trend, not to bill customers. Tristan's call if he wants to upgrade the OpenAI-compatible providers to real usage tracking later.

---

## Caller compat

No `route.ts` callers were touched. All four new fields are optional, so:

- `getTextProvider(providerId)(opts)` from `src/app/api/agents/execute/route.ts`, `src/lib/agents/sweep-orchestrator.ts`, and `src/lib/telegram/specialist-chat.ts` all compile unchanged.
- New rows will appear in `llm_usage` immediately, but with `action='<provider>_unknown'` (the `?? 'openai_unknown'` fallback) until callers are updated to pass real `actionSlug` / `foundryId` / `userId` / `specialistId`.

The next agent's task is to walk those three callers and thread the metadata through. That work is sequential per the parent brief's guidance.

---

## Verification

### TypeScript

```bash
NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit 2>&1 | grep -E "ai-providers/registry|cost-logging" | head -10
# (no output — zero errors in touched files)
```

Other repo-wide TypeScript errors exist (in `.next/types/validator.ts` from a stale cache, in `src/actions/plan/*` from unrelated `Json` type issues, in `src/actions/__tests__/tasks.test.ts`) — all pre-existing, not introduced by this change.

### Security regression test

```bash
npx jest src/lib/security/__tests__/rate-limit-regression.test.ts 2>&1 | tail -8
```

Result: `Test Suites: 1 passed, 1 total / Tests: 38 passed, 38 total` — clean.

---

## What the next agent should do

1. Thread `actionSlug` / `foundryId` / `userId` / `specialistId` through the three Tier 1.A callers:
   - `src/app/api/agents/execute/route.ts` — pass `actionSlug: 'agent_execute'` (plus any specialist context).
   - `src/lib/agents/sweep-orchestrator.ts` — pass `actionSlug: 'sweep_<specialist>'` and `specialistId`.
   - `src/lib/telegram/specialist-chat.ts` — pass `actionSlug: 'specialist_chat'`, `specialistId`, and the resolved `foundryId` / `userId` from the message author.
2. Once that lands, hit one specialist chat in production, then `select count(*), action from llm_usage where created_at > now() - interval '1 hour' group by action;` — should show real action slugs replacing `*_unknown`.
3. Decommission `src/lib/ai/usage-tracking.ts` and the legacy `ai_usage_log` / `ai_usage_monthly` plumbing per Step 6 of `COST-LOGGING-HANDOVER.md`.
