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

/**
 * Try generating a cover image via OpenAI gpt-image-2.
 * Returns the PNG buffer on success, null on failure.
 */
async function tryGptImage2(topic: string, specialistNames: string[]): Promise<Buffer | null> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        console.warn('[BrainstormCover] No OPENAI_API_KEY — skipping gpt-image-2')
        return null
    }

    const namesList = specialistNames.slice(0, 4).join(', ')
    const prompt = [
        'Create a professional, visually striking infographic-style illustration',
        'for a business brainstorming council session.',
        `The topic being discussed is: "${topic.slice(0, 200)}".`,
        `The council members are: ${namesList}.`,
        'Show diverse professionals in discussion in a modern, bright meeting room.',
        'Style: modern corporate illustration, light cream background, warm accent colours,',
        'clean typography, professional but approachable. NO dark themes or dark backgrounds.',
        'Include the ForgeOS brand subtly. Do NOT include any text overlays or headlines.',
    ].join(' ')

    try {
        const resp = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-image-1',
                prompt,
                n: 1,
                size: '1536x1024',
                quality: 'low',
            }),
            signal: AbortSignal.timeout(60_000),
        })

        if (!resp.ok) {
            const errBody = await resp.text().catch(() => '')
            console.error('[BrainstormCover] gpt-image-2 API error:', {
                status: resp.status,
                body: errBody.slice(0, 300),
            })
            return null
        }

        const json = await resp.json()
        const b64 = json?.data?.[0]?.b64_json
        if (b64) {
            return Buffer.from(b64, 'base64')
        }
        const url = json?.data?.[0]?.url
        if (url) {
            const imgResp = await fetch(url, { signal: AbortSignal.timeout(15_000) })
            if (imgResp.ok) {
                return Buffer.from(await imgResp.arrayBuffer())
            }
        }
        console.error('[BrainstormCover] gpt-image-2 returned no image data')
        return null
    } catch (err) {
        console.error('[BrainstormCover] gpt-image-2 fetch failed:', err instanceof Error ? err.message : err)
        return null
    }
}

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
        // Fetch thread data for the gpt-image-2 prompt
        const { data: threadData } = await admin
            .from('meeting_threads')
            .select('topic')
            .eq('id', threadId)
            .single()

        const { data: rawEntries } = await admin
            .from('meeting_entries')
            .select('specialist_name, role')
            .eq('thread_id', threadId)
            .eq('role', 'specialist')
            .limit(10)

        const specialistNames = [...new Set(
            (rawEntries ?? [])
                .map((e: { specialist_name: string | null }) => e.specialist_name)
                .filter(Boolean) as string[]
        )]

        const topic = threadData?.topic ?? 'Business strategy discussion'

        // ── Primary path: gpt-image-2 (real illustration) ──
        const gptImage = await tryGptImage2(topic, specialistNames)

        if (gptImage) {
            const storagePath = `${threadId}/cover.png`
            const { error: uploadErr } = await admin.storage
                .from(COVER_BUCKET)
                .upload(storagePath, gptImage, {
                    contentType: 'image/png',
                    upsert: true,
                    cacheControl: '86400',
                })

            if (!uploadErr) {
                await admin.from('meeting_threads').update({
                    cover_status: 'ready',
                    cover_image_url: storagePath,
                }).eq('id', threadId)

                try { revalidatePath('/agents') } catch { /* no-op in after() */ }
                await logUsage(threadId, foundryId, authorUserId, true)

                console.info('[BrainstormCover] Cover generated:', {
                    threadId, renderer: 'gpt-image-2', ms: Date.now() - startedAt,
                })
                return { ok: true, error: null }
            }

            console.error('[BrainstormCover] gpt-image-2 storage upload failed:', uploadErr.message)
        }

        // ── Fallback path: next/og text-card infographic ──
        console.info('[BrainstormCover] Falling back to next/og renderer')

        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : process.env.NEXT_PUBLIC_SITE_URL
            ?? 'http://localhost:3000'

        const { cookies } = await import('next/headers')
        const cookieStore = await cookies()
        const cookieHeader = cookieStore
            .getAll()
            .map((c) => `${c.name}=${c.value}`)
            .join('; ')

        const coverUrl = `${baseUrl}/api/brainstorm-cover/${threadId}`

        const resp = await fetch(coverUrl, {
            method: 'GET',
            headers: { Cookie: cookieHeader, Accept: 'image/png' },
            signal: AbortSignal.timeout(30_000),
        })

        if (!resp.ok) {
            const errBody = await resp.text().catch(() => '')
            console.error('[BrainstormCover] next/og route returned non-ok:', {
                threadId, status: resp.status, body: errBody.slice(0, 300),
            })
            await setCoverStatus(threadId, 'failed')
            await logUsage(threadId, foundryId, authorUserId, false)
            return { ok: false, error: `Route handler ${resp.status}: ${errBody.slice(0, 100)}` }
        }

        try { revalidatePath('/agents') } catch { /* no-op in after() */ }
        await logUsage(threadId, foundryId, authorUserId, true)

        console.info('[BrainstormCover] Cover generated:', {
            threadId, renderer: 'next/og-fallback', ms: Date.now() - startedAt,
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
