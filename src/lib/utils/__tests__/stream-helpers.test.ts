/**
 * @file stream-helpers.test.ts — Tests for SSE stream utility functions.
 *
 * @description Covers the 3 pure functions extracted from brief-specialist-dialog.tsx:
 *   - readWithTimeout: stream read with per-chunk timeout
 *   - isRetryableStreamError: transient vs terminal error classification
 *   - normalizeSpecialistError: raw error → user-friendly message
 *
 * These tests serve as a regression safety net: any change to error classification
 * logic must pass these tests, preventing accidental changes to retry behavior or
 * user-facing error messages.
 *
 * @audit Created 2026-02-19 as part of specialist system maintainability refactor (Step 3 of 8).
 */

import {
    readWithTimeout,
    isRetryableStreamError,
    normalizeSpecialistError,
} from "../stream-helpers"

// ─── readWithTimeout ─────────────────────────────────────────────────

describe("readWithTimeout", () => {
    it("resolves when reader returns before timeout", async () => {
        const chunk = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
        const mockReader = {
            read: jest.fn().mockResolvedValue({ done: false, value: chunk }),
        } as unknown as ReadableStreamDefaultReader<Uint8Array>

        const result = await readWithTimeout(mockReader, 5000)
        expect(result).toEqual({ done: false, value: chunk })
        expect(mockReader.read).toHaveBeenCalledTimes(1)
    })

    it("resolves with done=true when stream ends", async () => {
        const mockReader = {
            read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
        } as unknown as ReadableStreamDefaultReader<Uint8Array>

        const result = await readWithTimeout(mockReader, 5000)
        expect(result.done).toBe(true)
    })

    it("rejects with timeout when reader hangs", async () => {
        const hangingRead = new Promise(() => {
            // Never resolves — simulates a hung connection
        })
        const mockReader = {
            read: jest.fn().mockReturnValue(hangingRead),
        } as unknown as ReadableStreamDefaultReader<Uint8Array>

        await expect(readWithTimeout(mockReader, 50)).rejects.toThrow(
            "Stream chunk timeout",
        )
    })
})

// ─── isRetryableStreamError ──────────────────────────────────────────

describe("isRetryableStreamError", () => {
    const RETRYABLE_CASES = [
        "Stream interrupted mid-response",
        "Stream chunk timeout after 30s",
        "Service temporarily overloaded",
        "Temporarily unavailable",
        "Network error: ECONNREFUSED",
        "fetch failed: ENOTFOUND",
    ]

    const NON_RETRYABLE_CASES = [
        "Authentication failed",
        "Rate limit exceeded",
        "conversation is too long for this model",
        "Unknown error occurred",
        "",
    ]

    it.each(RETRYABLE_CASES)("returns true for retryable: %s", (error) => {
        expect(isRetryableStreamError(error)).toBe(true)
    })

    it.each(NON_RETRYABLE_CASES)("returns false for non-retryable: %s", (error) => {
        expect(isRetryableStreamError(error)).toBe(false)
    })
})

// ─── normalizeSpecialistError ────────────────────────────────────────

describe("normalizeSpecialistError", () => {
    const SPECIALIST = "Sage"

    it("normalizes provider unavailable errors", () => {
        expect(normalizeSpecialistError("temporarily unavailable", SPECIALIST)).toContain(
            "having trouble connecting",
        )
        expect(normalizeSpecialistError("Provider not configured", SPECIALIST)).toContain(
            "having trouble connecting",
        )
        expect(normalizeSpecialistError("PROVIDER_UNAVAILABLE", SPECIALIST)).toContain(
            "having trouble connecting",
        )
    })

    it("normalizes stream interruption errors", () => {
        const result = normalizeSpecialistError("Stream interrupted mid-response", SPECIALIST)
        expect(result).toContain("lost connection")
        expect(result).toContain(SPECIALIST)
    })

    it("normalizes rate limiting errors", () => {
        expect(normalizeSpecialistError("rate-limiting by Anthropic", SPECIALIST)).toContain(
            "rate-limited",
        )
        expect(normalizeSpecialistError("rate limit exceeded", SPECIALIST)).toContain(
            "rate-limited",
        )
    })

    it("normalizes conversation too long errors", () => {
        const result = normalizeSpecialistError("conversation is too long for this model", SPECIALIST)
        expect(result).toContain("too long")
        expect(result).toContain("fresh conversation")
    })

    it("normalizes overloaded errors", () => {
        expect(normalizeSpecialistError("server overloaded please retry", SPECIALIST)).toContain(
            "overloaded",
        )
        expect(normalizeSpecialistError("temporarily overloaded", SPECIALIST)).toContain(
            "overloaded",
        )
    })

    it("returns the raw error for unrecognized messages", () => {
        const raw = "Something completely unexpected happened"
        expect(normalizeSpecialistError(raw, SPECIALIST)).toBe(raw)
    })

    it("includes the specialist name in all normalized messages", () => {
        const knownErrors = [
            "temporarily unavailable",
            "Stream interrupted",
            "rate-limiting",
            "conversation is too long",
            "overloaded",
        ]
        for (const error of knownErrors) {
            expect(normalizeSpecialistError(error, SPECIALIST)).toContain(SPECIALIST)
        }
    })
})
