# Cost-Logging (Tier -1) Handover

**Date:** 2026-04-25
**Status:** Foundation complete. Integration into call sites is the next step.

---

## What's done

### 1. Database

- New table `public.llm_usage` applied to production Supabase (`jyarhvinengfyrwgtskq`) with one row per LLM call.
  - Columns: `id`, `foundry_id`, `anon_id`, `user_id`, `action`, `specialist_id`, `model_used`, `tokens_in`, `tokens_out`, `cost_usd`, `status`, `error_message`, `ip_address`, `created_at`.
  - Indexes: `(foundry_id, created_at desc)`, `(anon_id, created_at desc) WHERE anon_id IS NOT NULL`, `(action, created_at desc)`, `(ip_address, created_at desc)`.
  - RLS: enabled, with a single `service_role` policy (table is audit-only, never client-readable).
- Migration file: `supabase/migrations/20260425042944_llm_usage_table.sql`.
- Applied via the Supabase MCP `apply_migration` tool because `npx supabase db push` was blocked by an unrelated migration-history mismatch (76 remote-only versions). The MCP path is idempotent and bypasses the local migration tracker.
- Types regenerated: `npx supabase gen types typescript --linked > src/types/database.types.ts`. `llm_usage` is now in `Database['public']['Tables']`.

### 2. Wrapper module

- New file: `src/lib/cost-logging/llm-usage.ts`.
- Exports:
  - `logLlmUsage(params: LogLlmUsageParams): Promise<void>` — fire-and-forget, never throws, writes one row using `createAdminClient()` (service-role key).
  - `MODEL_COSTS_PER_1M_TOKENS: Record<string, { input: number; output: number }>` — Apr 2026 USD prices for Anthropic / OpenAI / DeepSeek / Google / MiniMax / OpenAI-embeddings / nomic-embed-text. Unknown models fall back to gpt-5.4 pricing with a `console.warn`.
  - `computeCostUsd(model, tokensIn, tokensOut)` — pure helper if a caller needs the price without writing a row.
  - `LogLlmUsageParams`, `LlmUsageStatus` types.
- Compiles cleanly under `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit` (no errors on the new file).

### 3. Diagnosis of the broken legacy system

The current `[AIUsageTracking] Failed to track usage: TypeError: fetch failed` symptom in production logs comes from `src/lib/ai/usage-tracking.ts` calling the `increment_ai_usage` Postgres RPC via the **user-scoped** Supabase client created by `createClient()` from `src/lib/supabase/server`. Two contributing causes:

1. The user-scoped server client is built from the request's cookies. When `trackAIUsage` is fired-and-forgotten (e.g. `.catch()` in `with-ai-gate.ts`), it can outlive the request lifecycle that owned those cookies, causing the inner `fetch` to fail with a context-discarded error in Vercel's runtime.
2. Fire-and-forget RPC inside Server Actions sometimes hits Vercel's `after()` silent-drop trap (see memory file `forgeos_vercel_after_silent_drop.md`).

The new wrapper **uses the admin client** (which has no cookie/lifecycle dependency) and writes a plain `INSERT` rather than going through an RPC. Both root causes are bypassed.

The old system is **left in place untouched**. It still maintains `ai_usage_log` + `ai_usage_monthly` for the existing tier-limit gate. The new `llm_usage` table is additive; the next agent can decommission the old tables once `/admin/cost` is reading from the new one.

### 4. Call-site map

- New file: `LLM-CALL-SITES.md` at repo root.
- Catalogues every direct LLM HTTP fetch, SDK client, and helper wrapper in `src/`. 4 tiers, ~80 distinct call sites.
- Tier 1 (3 files) covers ~80% of production traffic. Wire those first.

---

## What the next agent needs to do

### Step 1 — Tier 1 wiring (highest leverage, smallest blast radius)

Wire `logLlmUsage` into the three central wrappers:

1. **`src/lib/ai-providers/registry.ts`** — extend `StreamingTextOptions` with `actionSlug: string`, `foundryId?: string`, `userId?: string`, `specialistId?: string`. Inside each `stream*` function, log on the `onDone` path with the final `usage` block. On `onError`, log with `status: 'error'` + the error message.

2. **`src/lib/ai/claude-client.ts`** — extend `ClaudeCallOptions` with `actionSlug`, `foundryId?`, `userId?`, `specialistId?`. Log inside `makeRequest` after `data.usage` is parsed; log with `status: 'error'` if `withRetry` rethrows.

3. **`src/lib/embeddings.ts`** + **`src/lib/search/semantic-search.ts`** + **`src/lib/search/nomic-embed.ts`** — add `actionSlug` parameter, log with `tokensOut: 0`.

After Step 1, every caller of `getTextProvider(...)` and `callClaudeCentral(...)` automatically logs without further changes. Verify by hitting `/api/agents/execute` once and checking the `llm_usage` table for new rows.

### Step 2 — Tier 3 (Anthropic SDK direct calls — highest cost)

35 call sites across 19 files in `LLM-CALL-SITES.md`. For each, add a `void logLlmUsage({...})` after the `client.messages.create / stream` returns. Token counts come from `response.usage.input_tokens` / `output_tokens`. Pick distinct `action` slugs per file (catalogued in the call-sites doc).

**Risky areas — sequential, not parallel:**
- `src/actions/products.ts` (8 call sites, hot path)
- `src/actions/cad-lab-reviews.ts` (5 call sites, complex specialist routing)

Tristan's Parallel Sub-Agent Safety Rules apply — these need one-at-a-time edits.

### Step 3 — Tier 4 (OpenAI SDK direct calls)

21+ call sites in 16 files. Mid-cost. Same pattern as Step 2 — token counts on `response.usage.prompt_tokens` / `completion_tokens`.

### Step 4 — Tier 2 (direct `fetch()` to provider URLs)

22 sites. Smallest spend bucket. Anthropic / DeepSeek / OpenAI / Google direct fetches — each parses its own JSON response, so add the log call right after that.

### Step 5 — Verification gate before claiming done

1. SQL: `select count(*) from public.llm_usage where created_at > now() - interval '1 hour';` from the Supabase SQL editor — should be > 0 after a single user session.
2. Cross-check: hit one Tier 1 call (e.g. open the Strategist chat, send a message), then one Tier 3 call (e.g. the BOM action), confirm both produced a row with the correct `action` slug.
3. Cost sanity: for a Haiku call producing ~500 input / ~1000 output tokens, `cost_usd` should be roughly `(500/1e6) * 1.0 + (1000/1e6) * 5.0 = 0.0055`. If it's far off, check the model id matches a price-map entry.

### Step 6 — Decommission the broken legacy system (after `/admin/cost` reads from new table)

- Delete `src/lib/ai/usage-tracking.ts`.
- Update `src/lib/ai/with-ai-gate.ts` and `src/lib/ai/guard.ts` to use `logLlmUsage` instead of `trackAIUsage`.
- Drop `ai_usage_log` and `ai_usage_monthly` tables in a future migration, plus the `increment_ai_usage` and `get_ai_usage_current_month` RPCs.

### Step 7 — Build `/admin/cost` (separate task)

Read aggregates from `llm_usage` server-side using the admin client. Parent task brief specifies this as an explicit follow-up.

---

## What is NOT done (and why)

- **No call sites are integrated yet.** Per the parent brief, integration is too risky to parallelize and must be done sequentially by the main thread.
- **No git commit.** Per the parent brief, do not commit; the main thread will pick up.
- **Old `trackAIUsage` system left in place.** Removing it would break the existing tier-limit gate before the new `/admin/cost` page can replace its readers.
- **Whisper / Realtime / Avatar costs not in scope.** Those are billed per-second / per-minute and already have separate tracking. The `llm_usage` table is token-only.

---

## Key file paths (absolute)

- Migration: `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/supabase/migrations/20260425042944_llm_usage_table.sql`
- Wrapper module: `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/lib/cost-logging/llm-usage.ts`
- Call-site map: `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/LLM-CALL-SITES.md`
- This handover: `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/COST-LOGGING-HANDOVER.md`
- Generated types (now contains `llm_usage`): `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/types/database.types.ts`

---

## Verification commands

```bash
# 1. Confirm the table exists in production
#    (run via Supabase MCP execute_sql on project jyarhvinengfyrwgtskq)
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='llm_usage' order by ordinal_position;

# 2. Type-check the new wrapper
NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit

# 3. Smoke import (fast)
node -e "console.log(require('./src/lib/cost-logging/llm-usage.ts'))"  # only works after build, illustrative
```
