# Brainstorming Team-Meeting Fallback Chain — Implementation Notes

**Status:** Code changes applied. Type-check clean on touched files. NOT committed — main thread to review.

**Plan reference:** [`FALLBACK-CHAIN-PLAN.md`](./FALLBACK-CHAIN-PLAN.md)

**P0 fixed:** Anthropic 529 OVERLOADED at 02:55:12 took down brainstorming for every specialist because (1) the client hardcoded `claude-opus-4-7` for all 13 specialists, and (2) the server's tool-aware streaming handler never iterated the fallback chain.

---

## Files Changed

| File | Lines (approx) | Change |
|---|---|---|
| `src/lib/agents/failover.ts` | **+264 (new)** | New helper module: `ModelTier`, `ProviderTarget`, `FALLBACK_CHAINS`, `getPrimaryTargetForTier`, `AllProvidersExhaustedError`, `withFailover`. Single source of truth shared by client and server. |
| `src/app/api/agents/execute/route.ts` | ~+90 / -120 net (~-30) | Replaced inline `ModelTier` / `ProviderTarget` / `FALLBACK_CHAINS` with imports from `failover.ts`. Refactored `handleToolAwareStreaming` to wrap its body in `withFailover` (the bug fix). Refactored `handleTextStreaming` onto `withFailover` for parity. Both now emit `errorCategory: "all_providers_down"` + `specialistName` on full exhaustion. Added `specialistId` parameter to `handleTextStreaming` so the SSE error event carries the specialist name. `handleSpeculativeStreaming` left untouched (already cascades correctly via its own loop, low-risk to leave). |
| `src/app/(platform)/agents/team-meeting-dialog.tsx` | ~+25 / -10 net (~+15) | Imported `getPrimaryTargetForTier`. Replaced two hardcoded `{providerId:"anthropic", modelId:"claude-opus-4-7", modelTier:"claude"}` blocks (per-specialist call + wrap-up) with `getPrimaryTargetForTier(specialist.modelTier)` and `getPrimaryTargetForTier("claude")` respectively. Replaced `*[Error: Could not generate response]*` placeholder + `${specialist.name} encountered an error: ${message}` toast with in-character empty state copy: `*${specialist.name} stepped out for a moment — give it 30 seconds and try the round again.*` Applied to BOTH the per-specialist round and the autonomous-debate path. |

**Total:** 1 new file (~264 lines), 2 edited files. No deletions of existing functionality, no specialist personality config touched, no `FALLBACK_CHAINS` content changed.

---

## What's Different vs The Plan

Largely faithful. A handful of choices the main thread should sanity-check:

1. **`FALLBACK_CHAINS` lives in `failover.ts` now.** Plan said "import from where it lives" — but it lived inside `route.ts` and wasn't exported. Moving it to `failover.ts` is the cleanest way to give the client `getPrimaryTargetForTier` without dragging the whole route into the client bundle. Route.ts now re-imports it.

2. **`hasApiKeyForProvider` mirrors `resolveApiKeyForProvider` rather than imports it.** The route's helper does more than env detection — it builds a full env→key map and is server-only. Pulling it into a shared helper would drag server env reads into the client bundle. The duplication is small (~12 cases) and the comment in `failover.ts` flags the precedent.

3. **`handleToolAwareStreaming` now resets `fullOutput = ""` and rebuilds `conversationMessages` per attempt** so a cascade doesn't carry text/messages from the failed target. Without this, a primary failure would have shipped accumulated state into the cascade attempt.

4. **`handleTextStreaming` got a new `specialistId` parameter** so the SSE error event can carry `specialistName` for the in-character empty state. Backwards-compatible default `undefined` (the existing `slides` modality call site passes `undefined` through; new text-modality call site passes `specialistId`).

5. **Mid-stream errors stay non-retryable, even on retryable error categories.** Once `hasEmittedToClient` flips, `onError` wraps any retryable error string as `mid-stream provider failure (no fallback): ...` which trips `isRetryableError`'s default branch (no match → false). This preserves the prior "no cascade after partial emit" semantic that protects users from incoherent provider-switched output mid-message.

6. **`handleSpeculativeStreaming` left untouched.** Plan called it "low risk to refactor onto withFailover" but it has a different two-stream-with-abort pattern that doesn't map cleanly to `withFailover`'s synchronous-attempt shape. Already cascades correctly via its own loop (lines ~2218 with `isRetryableError` check). Refactoring it adds risk for no behavioural change. Out of scope.

7. **In-character empty-state copy is identical for the toast (`setError`) and the entry content.** Toast: `${specialist.name} stepped out for a moment — give it 30 seconds and try the round again.` Entry: same text, italicised in markdown. Could differentiate (e.g. drop the toast entirely since the in-line entry is enough), but kept both for visibility.

---

## Things The Main Thread Should Verify Before Committing

1. **Voice consistency on cascades.** The plan flagged this as a risk. For a clean handover, run the benchmark suite against the **second-tier** target for one or two specialists and confirm voice floor 4.0 holds. Reference: `experiments/autoagent-strategy-specialist/benchmark/runner.py`. This wasn't done in this session — the bug fix is independent of personality/scoring, but the cascade now actually fires and could reach Sonnet/DeepSeek/Gemini for the first time in production traffic.

2. **The cascade-fired notice event** mentioned in plan §6 was NOT added. The plan called it a "subtle, non-blocking" notice ("Priya is using a backup model right now"). Out of scope per the deliverable list — adding it later is purely additive, no behavioural change. Worth a follow-up ticket.

3. **`handleSpeculativeStreaming` skipped.** See #6 above — already cascades correctly. If the main thread disagrees and wants parity, it's a 30-line change.

4. **Type-check.** Ran `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit` against the touched files — zero new errors. Full repo `tsc` shows pre-existing errors in `src/actions/plan/*`, `src/app/(platform)/plan/**`, and `.next/types/validator.ts` (stale Next.js cache). None of those touch the modified files.

5. **No commits / no push.** As instructed.

---

## Verification

- `npx tsc --noEmit` filter `team-meeting-dialog|api/agents/execute|lib/agents/failover|lib/agents/error-classification` → clean.
- No vestigial `primaryTarget` references in `route.ts`.
- `FALLBACK_CHAINS` and `withFailover` only used where expected.
- Browser/runtime verification NOT performed in this session (the bug fix would only manifest under a live Anthropic 529 storm and the agent-browser test account isn't a `Founder` running brainstorming meetings). Recommend a smoke test by main thread: open a brainstorming meeting on preview, force Priya to fail by temporarily flipping her tier to a bad model in `specialists-config.ts`, confirm cascade kicks in. Or wait for next 5xx storm.

---

## Cost / Reliability Trade-off (per Tristan's directive)

- Retry-with-jitter doubles cost ONLY on retryable errors. Errors are rare; cost impact is negligible.
- Cascade adds at most 4 extra calls when a tier fully exhausts. Extreme tail event; cost still negligible vs the value of a successful brainstorming session.
- Reliability is now bounded by `min(provider) downtime intersected over the chain` rather than `single-provider downtime`. With 5-target chains crossing 3+ providers, full chain failure is essentially impossible outside a multi-provider outage.
