/**
 * @file failover.ts — Provider failover primitives for AI specialist requests.
 *
 * @description Single source of truth for the per-tier provider fallback chains
 * AND the runtime helper that iterates them with retry-with-jitter. Imported by
 * both the server route (which actually iterates chains during a request) and
 * the client team-meeting dialog (which only needs `getPrimaryTargetForTier` so
 * it stops hardcoding `claude-opus-4-7` for every specialist).
 *
 * @related
 * - Server consumer: src/app/api/agents/execute/route.ts (handleTextStreaming, handleToolAwareStreaming)
 * - Client consumer: src/app/(platform)/agents/team-meeting-dialog.tsx (executeSpecialist + wrap-up)
 * - Error classification: src/lib/agents/error-classification.ts (isRetryableError decides retry vs surface)
 *
 * @audit Created 2026-04-24 to fix the 02:55:12 P0 brainstorming outage:
 *   1. Client was hardcoding `claude-opus-4-7` for every specialist, ignoring
 *      `specialist.modelTier`. Anthropic 529 OVERLOADED took out brainstorming
 *      for every specialist simultaneously instead of just claude-tier ones.
 *   2. handleToolAwareStreaming read chain[0] as the only target and never
 *      iterated the chain on error — so even claude-tier specialists didn't
 *      cascade through Sonnet → DeepSeek → Gemini → MiniMax as the chain
 *      dictates.
 * Both call sites now route through `getPrimaryTargetForTier` (consistent
 * primary selection) and the server wraps each handler body in `withFailover`
 * (chains actually run).
 *
 * @security Failover never crosses the qwen-local boundary. If the user chose
 * local inference for privacy, a cloud fallback would violate that contract.
 */

import { isRetryableError } from "@/lib/agents/error-classification"
import type { AIProviderId } from "@/lib/ai-providers/types"

// ─── Types ────────────────────────────────────────────────────────────

/**
 * Model tier — matches the `modelTier` field on `Specialist` in
 * `src/lib/agents/specialists-config.ts`. The tier is the abstraction
 * client and server share; concrete providerId/modelId targets are looked
 * up here.
 */
export type ModelTier =
    | "claude"
    | "sonnet"
    | "qwen"
    | "qwen-local"
    | "minimax"
    | "deepseek"
    | "google"
    | "openai"
    | "haiku"
    | "gpt-mini"
    | "qwen-235b"
    | "deepseek-v4-pro"

/**
 * A concrete provider/model pair the failover loop will attempt.
 */
export interface ProviderTarget {
    providerId: AIProviderId
    modelId: string
}

// ─── Fallback Chains ──────────────────────────────────────────────────

/**
 * Ordered fallback chains per model tier. The first entry is the primary —
 * same model the specialist is configured for. Subsequent entries are tried
 * (in order) only when the primary returns a retryable error AND the per-target
 * single-retry-with-jitter has been exhausted.
 *
 * @security qwen-local has no cloud fallbacks by design — local-only privacy
 * contract.
 */
export const FALLBACK_CHAINS: Record<ModelTier, ProviderTarget[]> = {
    // 2026-04-29: Anthropic credits running low — route claude-tier through
    // non-Anthropic providers. DeepSeek V4-Pro for synthesis-heavy work (Sage,
    // Cal, Fiona, Leo), Gemini 3.1 Pro as second choice.
    claude: [
        { providerId: "together", modelId: "deepseek-ai/DeepSeek-V4-Pro" },
        { providerId: "google", modelId: "gemini-3.1-pro-preview" },
        { providerId: "deepseek", modelId: "deepseek-chat" },
        { providerId: "minimax", modelId: "MiniMax-M2.7" },
    ],
    sonnet: [
        { providerId: "deepseek", modelId: "deepseek-chat" },
        { providerId: "google", modelId: "gemini-3.1-pro-preview" },
        { providerId: "minimax", modelId: "MiniMax-M2.7" },
    ],
    qwen: [
        { providerId: "qwen", modelId: "qwen3.5-plus" },
        { providerId: "deepseek", modelId: "deepseek-chat" },
        { providerId: "together", modelId: "Qwen/Qwen3.5-397B-A17B" },
        { providerId: "minimax", modelId: "MiniMax-M2.7" },
        { providerId: "openai", modelId: "gpt-5.4" },
    ],
    minimax: [
        { providerId: "minimax", modelId: "MiniMax-M2.7" },
        { providerId: "deepseek", modelId: "deepseek-chat" },
        { providerId: "together", modelId: "Qwen/Qwen3.5-397B-A17B" },
        { providerId: "qwen", modelId: "qwen3.5-plus" },
        { providerId: "openai", modelId: "gpt-5.4" },
    ],
    "qwen-local": [
        { providerId: "qwen-local", modelId: "qwen3:30b-a3b" },
    ],
    deepseek: [
        { providerId: "deepseek", modelId: "deepseek-v4-flash" },
        { providerId: "google", modelId: "gemini-2.5-flash" },
        { providerId: "minimax", modelId: "MiniMax-M2.7" },
        { providerId: "openai", modelId: "gpt-5.4" },
    ],
    google: [
        { providerId: "google", modelId: "gemini-3.1-pro-preview" },
        { providerId: "deepseek", modelId: "deepseek-chat" },
        { providerId: "minimax", modelId: "MiniMax-M2.7" },
    ],
    openai: [
        { providerId: "openai", modelId: "gpt-5.4" },
        { providerId: "deepseek", modelId: "deepseek-chat" },
        { providerId: "google", modelId: "gemini-2.5-flash" },
    ],
    // 2026-04-29: Mia — swap from Haiku to Gemini 2.5 Flash (no Anthropic)
    haiku: [
        { providerId: "google", modelId: "gemini-2.5-flash" },
        { providerId: "deepseek", modelId: "deepseek-chat" },
        { providerId: "minimax", modelId: "MiniMax-M2.7" },
    ],
    // Sal (sales-lead) — gpt-4.1-mini primary, no Anthropic fallback
    "gpt-mini": [
        { providerId: "openai", modelId: "gpt-4.1-mini" },
        { providerId: "openai", modelId: "gpt-5.4" },
        { providerId: "deepseek", modelId: "deepseek-chat" },
    ],
    // Fang (vp-manufacturing) — Qwen 3 235B, no Anthropic fallback
    "qwen-235b": [
        { providerId: "qwen", modelId: "qwen3-235b-a22b" },
        { providerId: "together", modelId: "Qwen/Qwen3.5-397B-A17B" },
        { providerId: "deepseek", modelId: "deepseek-chat" },
        { providerId: "minimax", modelId: "MiniMax-M2.7" },
    ],
    // Finn (finance-lead) — V4-Pro reasoning, no Anthropic fallback
    "deepseek-v4-pro": [
        { providerId: "together", modelId: "deepseek-ai/DeepSeek-V4-Pro" },
        { providerId: "deepseek", modelId: "deepseek-reasoner" },
        { providerId: "deepseek", modelId: "deepseek-chat" },
        { providerId: "google", modelId: "gemini-3.1-pro-preview" },
    ],
}

// ─── Primary Target Lookup (used by both client and server) ───────────

/**
 * Returns the primary (chain[0]) provider/model for a given model tier.
 * Used by the client to construct the initial request body so it doesn't
 * hardcode a single provider for every specialist, and by the server-side
 * resolver to keep both layers in sync.
 *
 * @param modelTier - Specialist's `modelTier` field.
 * @returns `ProviderTarget` plus `modelTier` so callers can pass it through
 *          to the `/api/agents/execute` body without a second lookup.
 * @throws  If the tier has no fallback chain (unreachable for current tiers,
 *          but defensive — guards against typos when new tiers are added).
 */
export function getPrimaryTargetForTier(
    modelTier: ModelTier,
): ProviderTarget & { modelTier: ModelTier } {
    const chain = FALLBACK_CHAINS[modelTier]
    if (!chain || chain.length === 0) {
        throw new Error(`No fallback chain for modelTier: ${modelTier}`)
    }
    const primary = chain[0]
    return { providerId: primary.providerId, modelId: primary.modelId, modelTier }
}

// ─── Errors ───────────────────────────────────────────────────────────

/**
 * Thrown by `withFailover` when every target in the chain has been attempted
 * (with retry-with-jitter) and all returned retryable errors. Caught at the
 * top of the streaming handlers, which translate it into an in-character SSE
 * error event the client renders as a friendly empty-state.
 */
export class AllProvidersExhaustedError extends Error {
    constructor(public readonly lastError: unknown, message: string) {
        super(message)
        this.name = "AllProvidersExhaustedError"
    }
}

// ─── Failover Loop ────────────────────────────────────────────────────

/**
 * Iterates a `ProviderTarget` chain, calling `attempt(target)` on each. On a
 * retryable error, retries the same target ONCE with 400-800ms jitter before
 * moving to the next target in the chain. Non-retryable errors (auth, content
 * filter, context length) surface immediately — there is no point cascading.
 *
 * Targets without an API key configured are skipped silently; this mirrors
 * the prior `handleTextStreaming` behaviour and keeps preview/staging from
 * trying providers that aren't wired up.
 *
 * Cost note: doubling a request on a 529 storm is negligible — failures are
 * rare and Tristan's directive is "reliability not cost".
 *
 * Voice note: cascading from Opus → Sonnet → DeepSeek → Gemini → MiniMax can
 * shift voice mid-meeting. Cascades log `specialistId` so we can see how
 * frequent that is and re-benchmark the second-tier fallback if needed.
 *
 * @param chain    Ordered fallback targets for the modelTier.
 * @param attempt  Async function that runs the actual request against a target.
 *                 Must throw on failure (don't swallow).
 * @param options  Optional metadata used in logs (specialistId is enough to
 *                 audit cascade frequency from the Vercel function logs).
 * @returns        Whatever `attempt` returned for the first successful target.
 * @throws         The most recent non-retryable error, OR
 *                 `AllProvidersExhaustedError` if every target was retryable.
 */
export async function withFailover<T>(
    chain: ProviderTarget[],
    attempt: (target: ProviderTarget) => Promise<T>,
    options: { specialistId?: string } = {},
): Promise<T> {
    let lastError: unknown = new Error("No targets attempted")

    for (let i = 0; i < chain.length; i++) {
        const target = chain[i]

        // Skip target if no API key — mirrors the prior per-handler check.
        if (!hasApiKeyForProvider(target.providerId)) {
            console.warn("[withFailover] skipping target — no API key", {
                providerId: target.providerId,
                modelId: target.modelId,
                specialistId: options.specialistId,
            })
            continue
        }

        // Per-target single retry-with-jitter on retryable errors.
        for (let retry = 0; retry <= 1; retry++) {
            try {
                if (i > 0 || retry > 0) {
                    console.log("[withFailover] cascade or retry", {
                        attemptIndex: i,
                        retry,
                        providerId: target.providerId,
                        modelId: target.modelId,
                        specialistId: options.specialistId,
                    })
                }
                return await attempt(target)
            } catch (err) {
                lastError = err
                const message = err instanceof Error ? err.message : String(err)

                if (!isRetryableError(message)) {
                    // Non-retryable: cascading would just produce the same failure.
                    throw err
                }

                if (retry === 0) {
                    // 400-800ms jitter before retrying the same target.
                    const jitter = 400 + Math.floor(Math.random() * 400)
                    await new Promise((r) => setTimeout(r, jitter))
                    continue
                }
                // retry === 1 — exhausted on this target; fall through to next chain entry.
            }
        }
    }

    throw new AllProvidersExhaustedError(
        lastError,
        `All ${chain.length} fallback targets exhausted`,
    )
}

// ─── API Key Detection ────────────────────────────────────────────────

/**
 * Mirrors `resolveApiKeyForProvider` in route.ts. Kept as a separate function
 * here (rather than importing) because the client bundle imports failover.ts
 * for `getPrimaryTargetForTier` — pulling in the route.ts helper would drag
 * server-only code into the client.
 *
 * In the browser `process.env.*` is undefined, so this returns false for every
 * provider — but the client never calls `withFailover`, only the server does,
 * so that's fine.
 */
function hasApiKeyForProvider(providerId: AIProviderId): boolean {
    switch (providerId) {
        case "anthropic":
            return !!process.env.ANTHROPIC_API_KEY?.trim()
        case "openai":
            return !!process.env.OPENAI_API_KEY?.trim()
        case "deepseek":
            return !!process.env.DEEPSEEK_API_KEY?.trim()
        case "google":
            return !!process.env.GOOGLE_AI_API_KEY?.trim()
        case "minimax":
            return !!process.env.MINIMAX_API_KEY?.trim()
        case "together":
            return !!process.env.TOGETHER_API_KEY?.trim()
        case "qwen":
            return !!process.env.DASHSCOPE_API_KEY?.trim()
        case "qwen-local":
            // Local Ollama — no key needed; assume reachable. The actual
            // provider call will fail naturally if the local daemon is down.
            return true
        case "stability":
            return !!process.env.STABILITY_API_KEY?.trim()
        case "elevenlabs":
            return !!process.env.ELEVENLABS_API_KEY?.trim()
        case "replicate":
            return !!process.env.REPLICATE_API_TOKEN?.trim()
        default:
            // Unknown provider — let the attempt fail naturally so the error
            // surfaces with provider context instead of being silently skipped.
            return true
    }
}
