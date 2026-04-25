# Brainstorming Team-Meeting LLM Fallback Chain — Plan

## 1. Files & Functions

| Role | Path | Symbol |
|---|---|---|
| Per-specialist call site (brainstorming) | `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/app/(platform)/agents/team-meeting-dialog.tsx` | `executeSpecialist()` lines 886-985 — single client-side fetch |
| Wrap-up call site | same file | lines 1264-1275 |
| Server entry | `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/app/api/agents/execute/route.ts` | `POST()` lines 205-1389 |
| Tool-aware streaming (Claude tier — has the bug) | same file | `handleToolAwareStreaming()` lines 1663-2005 |
| Plain-text streaming (cascades correctly) | same file | `handleTextStreaming()` lines 1412-1622 |
| Speculative streaming (non-Claude) | same file | `handleSpeculativeStreaming()` line 2007+ |
| Cascade chains | same file | `FALLBACK_CHAINS` lines 124-173 |
| Error classifier | `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/lib/agents/error-classification.ts` | `isRetryableError`, `classifyStreamError` |
| Specialist config | `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/lib/agents/specialists-config.ts` | `SPECIALISTS[]`, `modelTier` field |
| Huddle config | `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/src/app/(platform)/agents/huddle-config.ts` | unchanged |

## 2. Current Model Per Specialist (from specialists-config.ts)

| ID | Name | modelTier | Primary model (chain[0]) |
|---|---|---|---|
| strategist | Sage | google | gemini-3.1-pro-preview |
| cto | Max | deepseek | deepseek-chat |
| vp-engineering | Jian | deepseek | deepseek-chat |
| vp-manufacturing | Fang | deepseek | deepseek-chat |
| vp-supply-chain | Chase | google | gemini-3.1-pro-preview |
| product-lead | Priya | deepseek | deepseek-chat |
| growth-marketer | Mia | google | gemini-3.1-pro-preview |
| sales-lead | Sal | openai | gpt-5.4 |
| chief-of-staff | Cal | claude | claude-opus-4-7 |
| finance-lead | Finn | deepseek | deepseek-chat |
| fundraising-advisor | Fiona | openai | gpt-5.4 |
| hiring-team | Harper | deepseek | deepseek-chat |
| legal-counsel | Leo | claude | claude-opus-4-7 |

## 3. Root Cause of the P0

Two distinct bugs compound:

1. **Client overrides every specialist to claude-opus-4-7.** `team-meeting-dialog.tsx:907-909` and `:1270-1272` hardcode `providerId: "anthropic"`, `modelId: "claude-opus-4-7"`, `modelTier: "claude"` for ALL specialists. Priya should be on DeepSeek; she was routed to overloaded Anthropic. Result: Anthropic outage takes down brainstorming for every specialist simultaneously.
2. **Tool-aware streaming does not cascade.** `handleToolAwareStreaming` reads `chain[0]` as `primaryTarget` and on error jumps straight to `classifyStreamError → SSE error`. The chain it received is never iterated. `handleTextStreaming` correctly iterates the chain — tool-aware does not. The 529 from Anthropic Opus therefore surfaces directly to the founder instead of cascading to Sonnet → DeepSeek → Gemini → MiniMax.

`isRetryableError` already classifies the 529 correctly via the substring `"overloaded"` (line 99 of error-classification.ts) — it just isn't being used in the tool-aware path.

## 4. Proposed Cascade (Universal — `FALLBACK_CHAINS` already encodes it)

The existing chains are sound. Don't redesign them — just make them actually run. Pattern per tier already covers: primary → faster sibling (sonnet) → cross-provider (DeepSeek) → another cross-provider (Gemini/MiniMax). No per-specialist customisation needed; the tier is the abstraction.

Add to each provider attempt:

- **Retry-with-jitter on the same target** before cascading: 2 attempts, base 400 ms, jitter ±200 ms, only when `isRetryableError(err)` is true. Avoids cascading on a single 529 blip that resolves in <1 s.
- **Cascade only when retries are exhausted on the current target.**
- **Final empty-state** when the whole chain is dead: in-character SSE event the client renders as a friendly retry prompt, not a stack trace.

## 5. Implementation Outline (NO code yet)

### 5a. Client (`team-meeting-dialog.tsx`)
- `executeSpecialist`: stop hardcoding the model. Read `specialist.modelTier` and pass `{ providerId: <primary for tier>, modelId: <primary for tier>, modelTier }`. Server already builds the chain from `modelTier`. Best to expose a small helper `getPrimaryTargetForTier(modelTier)` that mirrors `FALLBACK_CHAINS[tier][0]` — keep the source of truth server-side, import a thin client constant.
- Wrap-up call (line 1264): can stay on `claude` tier since that's a synthesis task — but pipe through the same helper for consistency.
- Error UI: replace `*[Error: Could not generate response]*` (lines 1071, 1219) and `${specialist.name} encountered an error: ${message}` (line 1065) with in-character empty state derived from the specialist's `name`. e.g. `Priya stepped out for a moment — give it 30 seconds and try the round again.` Keep retry CTA visible. The SSE `errorCategory` can drive copy variants (overloaded vs network vs rate_limit).

### 5b. Server — single new helper, reused everywhere
Add `withFailover(chain, attempt)` in a new file `src/lib/agents/failover.ts`:

```
withFailover<T>(chain: ProviderTarget[], attempt: (target) => Promise<T>): Promise<T>
```

Responsibilities:
- iterate `chain`
- for each target: skip if no API key; run `attempt`; on throw, classify with `isRetryableError`; if retryable AND not last, retry once with jitter on same target, then move to next; if non-retryable, throw immediately.
- on full exhaustion, throw a typed `AllProvidersExhaustedError` carrying the last error.

Then:
- `handleToolAwareStreaming` wraps its current single-target body in `withFailover(chain, async (target) => { ... })`. The Anthropic tool-loop only runs when `target.providerId === "anthropic"`; for non-Anthropic targets it falls into the existing else-branch (inject tool context + stream). The same closure pattern already exists.
- `handleTextStreaming` keeps current behaviour (already cascades) but is refactored onto `withFailover` for parity. Mid-stream errors stay non-retryable — that's correct.
- `handleSpeculativeStreaming` already uses chain (line 2149 logs cascades) — refactor onto `withFailover` if low-risk.

### 5c. Error events emitted to client
Augment the SSE error event with `specialistName` so the client can render the in-character empty state without an extra lookup.

### 5d. 529 explicit handling
`isRetryableError` already catches "overloaded" — no change needed. Add a one-line comment near it that 529 lands here so future readers don't add a second 529 branch.

## 6. Risk Callouts

- **Voice consistency.** Cascading from Opus to Sonnet to DeepSeek will shift voice mid-meeting. Mitigation: log cascades to console with `specialistId` so we can spot frequency; if a specialist is cascading >5% of the time we'll re-benchmark. Per CLAUDE.md Specialist Configuration Protocol, run `experiments/autoagent-strategy-specialist/benchmark/runner.py` once after this change with each specialist forced onto its second-tier fallback to confirm voice floor 4.0 holds. Document those baselines in the protocol table.
- **Cascade hides outages.** If Anthropic is down for hours and we silently route to Sonnet→DeepSeek, founder may not know. Mitigation: emit a one-time SSE `notice` event when a cascade fired (`Priya is using a backup model right now`). Subtle, non-blocking — does not interrupt the meeting flow.
- **Tool-aware vs non-Anthropic semantics.** Anthropic tool-loop is multi-turn; non-Anthropic uses pre-injected tool context. Cascading from Anthropic→DeepSeek mid-meeting changes which tools the model sees. Acceptable trade-off (working response > perfect tools) but worth a comment in the helper.
- **Retry-with-jitter cost.** Two extra Anthropic calls on a 529 storm = ~2x cost on failures only. Failures are rare; cost is negligible. Tristan's directive ("reliability not cost") applies.
- **Client hardcode fix is the highest-leverage change.** Even without the cascade fix, routing Priya/Mia/Sage off Anthropic during an Anthropic outage stops the bleed. Ship the client fix in the same commit.
- **Benchmark integrity.** No personality-config edits in this change — only routing/error handling. Benchmark suite does not need to re-baseline specialist scores; only run it on the second-tier-fallback verification noted above.

## 7. Out of Scope

- New fallback chains, new providers, cost-routing changes.
- Speculative streaming refactor (separate ticket if needed).
- Persisting "which model answered" per meeting entry (nice-to-have, defer).
