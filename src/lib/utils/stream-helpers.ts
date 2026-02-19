/**
 * @file stream-helpers.ts — SSE stream utilities for specialist conversations.
 *
 * @description Pure utility functions for reading from SSE streams with timeouts,
 * classifying stream errors as retryable vs terminal, and normalizing error messages
 * into user-friendly text.
 *
 * Extracted from:
 *   - src/app/(platform)/agents/brief-specialist-dialog.tsx (3,249 lines)
 *
 * These functions have zero React dependencies and are used by the specialist
 * chat dialog to handle SSE stream reliability. Extracting them enables:
 *   1. Independent unit testing (see src/lib/utils/__tests__/stream-helpers.test.ts)
 *   2. Reuse in other streaming consumers (e.g., team-meeting-dialog.tsx has an
 *      inline copy of readWithTimeout that could be consolidated in the future)
 *   3. Reducing the dialog component's size and cognitive complexity
 *
 * @audit Extracted 2026-02-19 as part of specialist system maintainability refactor (Step 2 of 8).
 *        No logic changes — function bodies are identical to the originals.
 *
 * @related
 * - Brief dialog: src/app/(platform)/agents/brief-specialist-dialog.tsx (primary consumer)
 * - Execute route: src/app/api/agents/execute/route.ts (produces the SSE streams these helpers read)
 * - Conversation engine: src/lib/agents/conversation-engine.ts (defines the streaming interface)
 */

/**
 * Reads from a ReadableStream with a per-chunk timeout.
 *
 * @description Wraps `reader.read()` in a `Promise.race` against a timeout.
 * This prevents the read from hanging indefinitely when a proxy or AI provider
 * silently drops the connection mid-stream — a common failure mode with
 * Vercel's edge function proxy and long-running LLM responses.
 *
 * @param reader - The ReadableStream reader to read from
 * @param timeoutMs - Maximum milliseconds to wait for a chunk before rejecting
 * @returns The stream read result (value + done flag)
 * @throws Error with message "Stream chunk timeout" if no chunk arrives within timeoutMs
 */
export function readWithTimeout(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
    return Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Stream chunk timeout")), timeoutMs)
        }),
    ])
}

/**
 * Determines if a stream/fetch error is transient and worth retrying.
 *
 * @description Classifies error messages to decide whether the specialist chat
 * should automatically retry the request. Retryable errors are typically
 * infrastructure issues (connection drops, timeouts, provider overloads) that
 * resolve on their own. Non-retryable errors (auth, rate limits, content issues)
 * would just fail again on retry.
 *
 * @param error - The error message string to classify
 * @returns true if the error is transient and the request should be retried
 */
export function isRetryableStreamError(error: string): boolean {
    const lower = error.toLowerCase()
    if (lower.includes("stream interrupted") || lower.includes("stream chunk timeout")) return true
    if (lower.includes("overloaded") || lower.includes("temporarily")) return true
    if (lower.includes("network") || lower.includes("fetch failed")) return true
    return false
}

/**
 * Normalizes raw stream/API errors into user-friendly messages.
 *
 * @description Translates technical error strings from the AI provider or
 * network layer into actionable messages the user can understand. Includes
 * the specialist's name for context so the message reads naturally in the
 * chat UI (e.g., "Sage is having trouble connecting...").
 *
 * @param error - The raw error message from the stream or API response
 * @param specialistName - The specialist's display name (e.g., "Sage", "Max")
 * @returns A user-friendly error message suitable for display in the chat
 */
export function normalizeSpecialistError(error: string, specialistName: string): string {
    if (
        error.includes("temporarily unavailable") ||
        error.includes("not configured") ||
        error.includes("PROVIDER_UNAVAILABLE")
    ) {
        return `${specialistName} is having trouble connecting right now. Try again in a moment, or check your AI provider settings.`
    }
    if (error.includes("Stream interrupted")) {
        return `${specialistName} lost connection mid-response. This is usually temporary — try sending your message again.`
    }
    if (error.includes("rate-limiting") || error.includes("rate limit")) {
        return `${specialistName} is being rate-limited by the AI provider. Wait a moment and try again.`
    }
    if (error.includes("conversation is too long")) {
        return `The conversation with ${specialistName} has gotten too long. Try starting a fresh conversation.`
    }
    if (error.includes("overloaded") || error.includes("temporarily overloaded")) {
        return `${specialistName}'s AI provider is temporarily overloaded. Try again in a few seconds.`
    }
    return error
}
