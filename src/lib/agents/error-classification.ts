/**
 * @file error-classification.ts — Error classification for AI provider responses.
 *
 * @description Pure functions that classify raw error strings from AI providers
 * into actionable categories. Used by:
 *   1. The execute route's failover logic (isRetryableError → should we try the next provider?)
 *   2. The SSE streaming handler (classifyStreamError → what message does the user see?)
 *
 * Extracted from:
 *   - src/app/api/agents/execute/route.ts (1,354 lines)
 *
 * @audit Extracted 2026-02-19 as part of specialist system maintainability refactor (Step 3 of 8).
 *        No logic changes — function bodies are identical to the originals.
 *        The execute route now imports these from here.
 *
 * @security These functions never leak API keys, internal paths, or raw stack traces.
 *           classifyStreamError returns only safe, user-facing messages.
 *
 * @related
 * - Execute route: src/app/api/agents/execute/route.ts (primary consumer)
 * - Stream helpers: src/lib/utils/stream-helpers.ts (client-side error handling)
 * - Tests: src/lib/agents/__tests__/error-classification.test.ts
 */

/**
 * Error classification result with both user-facing message and diagnostic category.
 */
export interface ClassifiedError {
    /** User-facing error message (safe to display) */
    message: string
    /** Machine-readable category for client-side logging */
    category: "context_length" | "rate_limit" | "auth" | "overloaded" | "network" | "content_filter" | "unknown"
    /** First 120 chars of raw error for client-side debugging (no secrets) */
    rawHint: string
}

/**
 * Determines whether a raw provider error is retryable via failover.
 *
 * @description Controls the execute route's provider failover chain. When the
 * primary provider fails, this function decides whether to try the next provider
 * in the chain or surface the error to the user immediately.
 *
 * Retryable errors indicate the **provider** is the problem (overloaded, rate-limited,
 * unreachable). Non-retryable errors indicate the **request** is the problem (too long,
 * content filtered, bad auth) — retrying on another provider would produce the same
 * failure or violate the user's intent.
 *
 * Unknown errors default to non-retryable to avoid wasting fallback attempts on
 * errors that are likely to repeat.
 *
 * @param rawError - The raw error string from the provider
 * @returns true if the error is retryable on a different provider
 */
export function isRetryableError(rawError: string): boolean {
    const lower = rawError.toLowerCase()

    // Non-retryable: request-side problems
    if (lower.includes("too many tokens") || lower.includes("context_length") || lower.includes("maximum context") || lower.includes("too long")) return false
    if (lower.includes("content_filter") || lower.includes("safety") || lower.includes("blocked") || lower.includes("content_policy")) return false
    if (lower.includes("authentication") || lower.includes("invalid api key") || lower.includes("unauthorized") || lower.includes("401")) return false

    // Retryable: billing/quota exhaustion — the request is fine, the provider account is the problem
    if (lower.includes("credit balance") || lower.includes("billing") || lower.includes("insufficient_quota") || lower.includes("quota") || lower.includes("payment required") || lower.includes("402")) return true

    // Retryable: provider-side problems
    if (lower.includes("overloaded") || lower.includes("503") || lower.includes("capacity") || lower.includes("server_error")) return true
    if (lower.includes("rate_limit") || lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) return true
    if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("timeout") || lower.includes("network") || lower.includes("fetch failed")) return true
    if (lower.includes("500") || lower.includes("internal server error")) return true

    // Unknown errors default to non-retryable to avoid wasting fallback attempts
    return false
}

/**
 * Classifies a raw streaming error into a user-friendly message and category.
 *
 * @description Maps provider-specific error strings to:
 *   1. A safe, actionable message for the user (never leaks secrets or internals)
 *   2. A machine-readable category for client-side logging and error handling
 *   3. A truncated raw hint for debugging (first 120 chars, no secrets)
 *
 * @param rawError - The raw error string from the provider or stream
 * @returns Classified error with message, category, and raw hint
 */
export function classifyStreamError(rawError: string): ClassifiedError {
    const lower = rawError.toLowerCase()
    const rawHint = rawError.substring(0, 120)

    if (lower.includes("too many tokens") || lower.includes("context_length") || lower.includes("maximum context") || lower.includes("too long")) {
        return { message: "The conversation is too long for this model. Try starting a new conversation or using a shorter message.", category: "context_length", rawHint }
    }

    if (lower.includes("rate_limit") || lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
        return { message: "The AI provider is rate-limiting requests. Please wait a moment and try again.", category: "rate_limit", rawHint }
    }

    if (lower.includes("authentication") || lower.includes("invalid api key") || lower.includes("unauthorized") || lower.includes("401")) {
        return { message: "AI provider authentication failed. The platform API key may need to be updated.", category: "auth", rawHint }
    }

    if (lower.includes("credit balance") || lower.includes("billing") || lower.includes("insufficient_quota") || lower.includes("quota") || lower.includes("payment required") || lower.includes("402")) {
        return { message: "The AI provider's credit balance is low. Trying an alternative provider...", category: "overloaded", rawHint }
    }

    if (lower.includes("overloaded") || lower.includes("503") || lower.includes("capacity") || lower.includes("server_error")) {
        return { message: "The AI provider is temporarily overloaded. Please try again in a few seconds.", category: "overloaded", rawHint }
    }

    if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("timeout") || lower.includes("network") || lower.includes("fetch failed")) {
        return { message: "Could not reach the AI provider. This is usually temporary — please try again.", category: "network", rawHint }
    }

    if (lower.includes("content_filter") || lower.includes("safety") || lower.includes("blocked") || lower.includes("content_policy")) {
        return { message: "The response was blocked by the AI provider's content filter. Try rephrasing your message.", category: "content_filter", rawHint }
    }

    return { message: "Stream interrupted. Please try sending your message again.", category: "unknown", rawHint }
}
