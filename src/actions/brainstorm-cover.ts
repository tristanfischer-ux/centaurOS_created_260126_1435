'use server'

/**
 * @file brainstorm-cover.ts
 *
 * @description Generates a session cover infographic for each saved
 * meeting_thread. Rendering is done server-side via the route handler at
 * /api/brainstorm-cover/[threadId] (next/og ImageResponse — deterministic
 * JSX to PNG, no AI model involved). The route handler returns the PNG,
 * uploads it to brainstorm-assets/<thread_id>/cover.png, and updates
 * cover_image_url + cover_status='ready' in one pass.
 *
 * Cost: effectively zero (next/og compute vs ~$0.12/image for gpt-image-2).
 * Quality: crisp text, brand-faithful layout, no hallucination.
 *
 * WHY the route-handler approach:
 *  - next/og ImageResponse must run in a route-handler or middleware context;
 *    it cannot run inside a 'use server' action.
 *  - The route URL is also reusable for live thumbnail rendering if we ever
 *    want to expose it directly.
 *
 * @related
 *  - src/app/api/brainstorm-cover/[threadId]/route.tsx (the actual renderer)
 *  - supabase/migrations/20260428000000_brainstorm_session_assets.sql
 *  - src/actions/meeting-threads.ts (after() hook that calls this)
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidUUID } from '@/lib/security/sanitize'

const COVER_BUCKET = 'brainstorm-assets'

type CoverStatus = 'pending' | 'generating' | 'ready' | 'failed'

/**
 * Persist a status change to meeting_threads.cover_status.
 */
async function setCoverStatus(
    threadId: string,
    status: CoverStatus,
    coverImageUrl?: string | null,
): Promise<void> {
    const admin = createAdminClient()
    const update: Record<string, unknown> = { cover_status: status }
    if (coverImageUrl !== undefined) {
        update.cover_image_url = coverImageUrl
    }
    await admin.from('meeting_threads').update(update).eq('id', threadId)
}

/**
 * Log spend to ai_usage_log so /admin telemetry keeps working.
 * Cost is $0 for next/og renders — recorded for completeness.
 */
async function logUsage(
    threadId: string,
    foundryId: string,
    userId: string,
    success: boolean,
): Promise<void> {
    try {
        const admin = createAdminClient()
        await admin.from('ai_usage_log').insert({
            user_id: userId,
            foundry_id: foundryId,
            feature: 'brainstorm_cover',
            model: 'next/og',
            input_tokens: 0,
            output_tokens: 0,
            cost_usd: 0,
            metadata: { thread_id: threadId, success },
        })
    } catch (err) {
        console.error('[BrainstormCover] usage log failed:', err)
    }
}

/**
 * Generate a cover infographic for a meeting thread.
 *
 * @description Call from a Vercel after() block in saveMeetingThread or the
 * wrap-up flow. This function:
 *  1. Auth-gates the call (caller must be authenticated and own the thread).
 *  2. Atomically claims the generation slot (pending|failed → generating).
 *  3. Calls the /api/brainstorm-cover/[threadId] route handler server-to-server,
 *     which renders the PNG via next/og, uploads it, and updates the DB row.
 *  4. Falls back to marking cover_status='failed' on any error.
 *
 * The route handler handles the actual rendering + DB write, so if the
 * route call succeeds the row is already updated to 'ready'. This wrapper
 * handles the atomic claim and error recovery.
 *
 * @param threadId — UUID of the meeting_thread to cover
 * @returns { ok: boolean; error: string | null }
 */
export async function generateSessionInfographic(
    threadId: string,
): Promise<{ ok: boolean; error: string | null }> {
    if (!isValidUUID(threadId)) {
        return { ok: false, error: 'Invalid thread id' }
    }

    // SECURITY: caller must be authenticated and able to SELECT the thread
    // via RLS. Without this, any authenticated user could trigger infographic
    // generation for arbitrary threadIds.
    const userClient = await createClient()
    const {
        data: { user },
    } = await userClient.auth.getUser()

    if (!user) {
        return { ok: false, error: 'Not authenticated' }
    }

    const { data: gateRow, error: gateErr } = await userClient
        .from('meeting_threads')
        .select('id')
        .eq('id', threadId)
        .single()

    if (gateErr || !gateRow) {
        return { ok: false, error: 'Not authorised' }
    }

    const admin = createAdminClient()

    // Atomically claim the generation slot. Flip cover_status from
    // 'pending'|'failed' to 'generating' and return the row in one round-trip.
    // If 0 rows were updated, another worker already owns this slot.
    const { data: claimed, error: claimErr } = await admin
        .from('meeting_threads')
        .update({ cover_status: 'generating' })
        .eq('id', threadId)
        .in('cover_status', ['pending', 'failed'])
        .select('id, foundry_id, author_user_id')
        .maybeSingle()

    if (claimErr) {
        console.error('[BrainstormCover] Claim failed:', { threadId, err: claimErr.message })
        return { ok: false, error: 'Claim failed' }
    }

    if (!claimed) {
        // Already generating, ready, or not visible — silent no-op
        return { ok: true, error: null }
    }

    const foundryId = (claimed as { foundry_id: string }).foundry_id
    const authorUserId = (claimed as { author_user_id: string }).author_user_id

    const startedAt = Date.now()

    try {
        // Call the route handler server-to-server. The route handler:
        //  - Renders the infographic JSX via next/og
        //  - Uploads the PNG to brainstorm-assets/<threadId>/cover.png
        //  - Updates cover_image_url + cover_status='ready' in the DB
        //
        // We need to call this as an authenticated request so the route's
        // own auth check passes. We do this by making an internal fetch
        // with the user's cookie header forwarded.
        //
        // IMPORTANT: this only works in a Node.js runtime context (not edge).
        // The 'use server' action runs on Node.js, so this is fine.

        // Determine the base URL — use VERCEL_URL in production/preview,
        // localhost in development.
        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : process.env.NEXT_PUBLIC_SITE_URL
            ?? 'http://localhost:3000'

        // Forward the caller's cookies so the route handler's auth check passes.
        // In Next.js server actions the 'next/headers' cookies() helper is available.
        const { cookies } = await import('next/headers')
        const cookieStore = await cookies()
        const cookieHeader = cookieStore
            .getAll()
            .map((c) => `${c.name}=${c.value}`)
            .join('; ')

        const coverUrl = `${baseUrl}/api/brainstorm-cover/${threadId}`

        const resp = await fetch(coverUrl, {
            method: 'GET',
            headers: {
                Cookie: cookieHeader,
                Accept: 'image/png',
            },
            // 30-second timeout — next/og rendering is fast
            signal: AbortSignal.timeout(30_000),
        })

        if (!resp.ok) {
            const errBody = await resp.text().catch(() => '')
            console.error('[BrainstormCover] Route handler returned non-ok:', {
                threadId,
                status: resp.status,
                body: errBody.slice(0, 300),
            })
            await setCoverStatus(threadId, 'failed')
            await logUsage(threadId, foundryId, authorUserId, false)
            return { ok: false, error: `Route handler ${resp.status}: ${errBody.slice(0, 100)}` }
        }

        // The route handler already set cover_status='ready' and cover_image_url.
        // We just need to log and revalidate.

        try {
            revalidatePath('/agents')
        } catch {
            // revalidatePath only works inside a Next.js render context;
            // when called from a Vercel after() block it may no-op silently.
        }

        await logUsage(threadId, foundryId, authorUserId, true)

        console.info('[BrainstormCover] Cover generated:', {
            threadId,
            renderer: 'next/og',
            ms: Date.now() - startedAt,
        })

        return { ok: true, error: null }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[BrainstormCover] Fatal:', { threadId, message })
        await setCoverStatus(threadId, 'failed')
        await logUsage(threadId, foundryId, authorUserId, false)
        return { ok: false, error: message }
    }
}

/**
 * Expose a thin `regenerateMeetingCover` action so the existing "Retry"
 * button in MeetingCard keeps working unchanged. It resets the status to
 * 'pending' (handled by resetCoverForRetry in meeting-threads.ts) then
 * calls generateSessionInfographic. The Retry button already calls
 * resetCoverForRetry + generateSessionInfographic in sequence, so this
 * named export is provided for any future callers that want a single call.
 *
 * @param threadId — UUID of the meeting_thread to regenerate
 */
export async function regenerateMeetingCover(
    threadId: string,
): Promise<{ ok: boolean; error: string | null }> {
    if (!isValidUUID(threadId)) {
        return { ok: false, error: 'Invalid thread id' }
    }
    // Reset status so the atomic claim in generateSessionInfographic can fire
    const admin = createAdminClient()
    await admin
        .from('meeting_threads')
        .update({ cover_status: 'pending' })
        .eq('id', threadId)

    return generateSessionInfographic(threadId)
}
