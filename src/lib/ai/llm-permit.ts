/**
 * @file llm-permit.ts — Postgres-backed concurrency semaphore for LLM calls.
 *
 * @description Wraps any LLM client call in `withLlmPermit(provider, model, fn)`.
 * Acquires a permit row from `llm_concurrency_permits` before calling, releases
 * on completion. If the live permit count is at the configured cap (table
 * `llm_permit_caps`), the call blocks (with jittered backoff) until a slot
 * frees. Crashed callers are recovered via the permit's `expires_at` TTL.
 *
 * Why this exists: the production Anthropic API key is shared across all
 * foundries. Multiple chains running per-module fanout (Fang reviews, BOM
 * generation, supplier matching) saturate the org-level rate limit when
 * many users overlap. Per-project caps (3 concurrent Fang reviews) and
 * per-foundry caps (3 chains) bound the worst case but don't enforce a
 * cross-tenant ceiling on the LLM call itself. This helper does.
 *
 * @related
 *   - Migration: supabase/migrations/20260425060000_llm_concurrency_permits.sql
 *   - Postgres functions: acquire_llm_permit, release_llm_permit
 *   - Caps config: llm_permit_caps table
 */

"use server"

import { createAdminClient } from "@/lib/supabase/admin"

/** Maximum total time to spend waiting for a permit before failing open
 *  (calling the LLM anyway). Set generously — every stage's outer budget
 *  is ~240s, and we'd rather make the call and risk a 429 (which the SDK
 *  retries) than fail the stage by refusing to call at all. */
const PERMIT_ACQUIRE_TIMEOUT_MS = 30_000

/** Initial backoff between retry attempts when the cap is full. */
const INITIAL_BACKOFF_MS = 200

/** Backoff cap — we don't want to wait minutes between retries even if the
 *  contention is severe. */
const MAX_BACKOFF_MS = 2_000

/** TTL for the permit row. If the caller crashes before releasing, the
 *  permit auto-expires and is opportunistically swept on the next acquire.
 *  Sized to comfortably exceed Vercel's 300s function ceiling. */
const PERMIT_TTL_SECONDS = 360

/**
 * Wraps an LLM call in a Postgres-backed concurrency permit.
 *
 * Behaviour:
 *   - Try `acquire_llm_permit(provider, model)`.
 *   - On success, run `fn`, release the permit on completion (success OR
 *     throw), return the result / re-throw.
 *   - On NULL (cap reached), sleep with jittered exponential backoff up
 *     to PERMIT_ACQUIRE_TIMEOUT_MS, then retry.
 *   - If still no permit after the timeout, FAIL OPEN — call `fn` anyway
 *     without a permit. The SDK's own 429 handling absorbs whatever
 *     fallout there is. This is deliberate: a stuck permit pool shouldn't
 *     wedge the autopilot pipeline.
 *
 * @example
 *   const response = await withLlmPermit("anthropic", "claude-opus-4-7", () =>
 *     client.messages.create(createParams)
 *   )
 */
export async function withLlmPermit<T>(
    provider: string,
    model: string,
    fn: () => Promise<T>,
): Promise<T> {
    const admin = createAdminClient()
    const startedAt = Date.now()
    let backoffMs = INITIAL_BACKOFF_MS
    let permitId: number | null = null

    while (Date.now() - startedAt < PERMIT_ACQUIRE_TIMEOUT_MS) {
        const { data, error } = await admin.rpc("acquire_llm_permit", {
            p_provider: provider,
            p_model: model,
            p_ttl_seconds: PERMIT_TTL_SECONDS,
        })

        if (error) {
            console.warn(
                `[llm-permit] acquire failed for ${provider}/${model} (failing open):`,
                error.message,
            )
            // Fail open on RPC error — don't wedge the chain.
            return fn()
        }

        if (typeof data === "number") {
            permitId = data
            break
        }

        // data === null → cap reached, back off.
        const jittered = backoffMs + Math.floor(Math.random() * backoffMs * 0.5)
        await new Promise((resolve) => setTimeout(resolve, jittered))
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
    }

    if (permitId === null) {
        console.warn(
            `[llm-permit] timed out waiting ${PERMIT_ACQUIRE_TIMEOUT_MS}ms for ${provider}/${model} permit — failing open`,
        )
        // Fail open: call without a permit. SDK's 429 retries absorb the rest.
        return fn()
    }

    try {
        return await fn()
    } finally {
        // Release in a try/catch — a release failure must not mask the
        // caller's outcome (success or thrown error from `fn`).
        try {
            await admin.rpc("release_llm_permit", { p_permit_id: permitId })
        } catch (releaseErr) {
            console.warn(
                `[llm-permit] release failed for permit ${permitId} (will TTL-expire):`,
                releaseErr instanceof Error ? releaseErr.message : releaseErr,
            )
        }
    }
}
