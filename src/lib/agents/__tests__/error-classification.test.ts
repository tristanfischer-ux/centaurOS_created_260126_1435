/**
 * @file error-classification.test.ts — Tests for AI provider error classification.
 *
 * @description Covers the 2 pure functions extracted from execute/route.ts:
 *   - isRetryableError: controls provider failover (try next provider or give up?)
 *   - classifyStreamError: raw error → safe user message + category
 *
 * These tests are critical for production reliability: they define the exact
 * contract between provider error strings and the system's retry/display behavior.
 * Any change to error classification must pass these tests.
 *
 * @audit Created 2026-02-19 as part of specialist system maintainability refactor (Step 3 of 8).
 */

import {
    isRetryableError,
    classifyStreamError,
} from "../error-classification"
import type { ClassifiedError } from "../error-classification"

// ─── isRetryableError ────────────────────────────────────────────────

describe("isRetryableError", () => {
    describe("non-retryable (request-side problems)", () => {
        const cases = [
            "Error: too many tokens in prompt",
            "context_length_exceeded: 128000 tokens",
            "Maximum context length exceeded",
            "Input too long for model",
            "content_filter triggered by provider",
            "safety system blocked the response",
            "Request blocked by content_policy",
            "authentication failed: invalid token",
            "invalid api key provided",
            "HTTP 401 Unauthorized",
        ]

        it.each(cases)("returns false for: %s", (error) => {
            expect(isRetryableError(error)).toBe(false)
        })
    })

    describe("retryable (provider-side problems)", () => {
        const cases = [
            "Service overloaded, please retry",
            "HTTP 503 Service Unavailable",
            "At capacity, try again later",
            "Internal server_error from provider",
            "rate_limit exceeded: 60 req/min",
            "rate limit: too many requests",
            "HTTP 429 Too Many Requests",
            "ECONNREFUSED: connection refused",
            "ENOTFOUND: DNS resolution failed",
            "Request timeout after 30s",
            "Network error: connection reset",
            "fetch failed: ECONNRESET",
            "HTTP 500 Internal Server Error",
        ]

        it.each(cases)("returns true for: %s", (error) => {
            expect(isRetryableError(error)).toBe(true)
        })
    })

    it("defaults to non-retryable for unknown errors", () => {
        expect(isRetryableError("Something completely unknown")).toBe(false)
        expect(isRetryableError("")).toBe(false)
    })
})

// ─── classifyStreamError ─────────────────────────────────────────────

describe("classifyStreamError", () => {
    it("classifies context length errors", () => {
        const result = classifyStreamError("too many tokens in the prompt")
        expect(result.category).toBe("context_length")
        expect(result.message).toContain("too long")
    })

    it("classifies rate limit errors", () => {
        const result = classifyStreamError("rate_limit exceeded")
        expect(result.category).toBe("rate_limit")
        expect(result.message).toContain("rate-limiting")
    })

    it("classifies auth errors", () => {
        const result = classifyStreamError("invalid api key")
        expect(result.category).toBe("auth")
        expect(result.message).toContain("authentication failed")
    })

    it("classifies overloaded errors", () => {
        const result = classifyStreamError("server overloaded")
        expect(result.category).toBe("overloaded")
        expect(result.message).toContain("overloaded")
    })

    it("classifies network errors", () => {
        const result = classifyStreamError("ECONNREFUSED")
        expect(result.category).toBe("network")
        expect(result.message).toContain("Could not reach")
    })

    it("classifies content filter errors", () => {
        const result = classifyStreamError("content_filter triggered")
        expect(result.category).toBe("content_filter")
        expect(result.message).toContain("content filter")
    })

    it("falls back to unknown for unrecognized errors", () => {
        const result = classifyStreamError("xyzzy")
        expect(result.category).toBe("unknown")
        expect(result.message).toContain("Stream interrupted")
    })

    it("truncates rawHint to 120 characters", () => {
        const longError = "A".repeat(200)
        const result = classifyStreamError(longError)
        expect(result.rawHint).toHaveLength(120)
    })

    it("never leaks raw error in user-facing message for known categories", () => {
        const sensitiveRawError = "Error from api-key-abc123: server_error at internal.path"
        const result = classifyStreamError(sensitiveRawError)
        expect(result.message).not.toContain("api-key-abc123")
        expect(result.message).not.toContain("internal.path")
    })

    it("preserves rawHint for debugging", () => {
        const rawError = "ECONNREFUSED: connection refused to provider"
        const result = classifyStreamError(rawError)
        expect(result.rawHint).toBe(rawError)
    })

    it("returns correct type shape", () => {
        const result: ClassifiedError = classifyStreamError("any error")
        expect(result).toHaveProperty("message")
        expect(result).toHaveProperty("category")
        expect(result).toHaveProperty("rawHint")
        expect(typeof result.message).toBe("string")
        expect(typeof result.category).toBe("string")
        expect(typeof result.rawHint).toBe("string")
    })
})
