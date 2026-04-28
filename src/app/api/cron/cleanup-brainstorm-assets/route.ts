/**
 * Cron Job: Cleanup Expired Brainstorm Assets
 *
 * @description Deletes brainstorm-assets storage objects + clears the
 * meeting_threads.cover_image_url / audio_clips fields when the parent
 * thread is older than 90 days. Bounds storage cost growth — full plan
 * documented in BRAINSTORM-FEATURES-PLAN.md (Phase 0).
 *
 * Schedule: Daily at 04:30 UTC (set in vercel.json).
 *
 * @security Requires CRON_SECRET Bearer token. Uses the admin client to
 * bypass RLS — this is a system-level retention job.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getClientIP, rateLimit } from '@/lib/security/rate-limit'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

const RETENTION_DAYS = 90
const BATCH_SIZE = 200

export async function GET(req: NextRequest): Promise<NextResponse> {
    const ip = getClientIP(req.headers)
    const ipLimit = await rateLimit('webhook', `cron-cleanup-brainstorm:${ip}`)
    if (!ipLimit.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const authFailure = verifyCronSecret(req)
    if (authFailure) return authFailure

    try {
        const admin = createAdminClient()
        const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

        // Find threads older than the retention window that still have assets.
        // We don't delete the meeting_thread row itself (founders may want
        // the transcript long-term) — only the heavy media.
        const { data: stale, error: fetchErr } = await admin
            .from('meeting_threads')
            .select('id, cover_image_url, audio_clips')
            .lt('created_at', cutoff)
            .or('cover_image_url.not.is.null,audio_status.eq.ready')
            .limit(BATCH_SIZE)

        if (fetchErr) {
            console.error('[CleanupBrainstorm] Fetch failed:', fetchErr.message)
            return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })
        }

        const rows = (stale ?? []) as Array<{ id: string; cover_image_url: string | null; audio_clips: unknown }>
        if (rows.length === 0) {
            return NextResponse.json({ ok: true, threadsCleaned: 0, objectsDeleted: 0 })
        }

        // Storage objects live under <thread_id>/cover.png + <thread_id>/audio/*.mp3.
        // Listing the prefix and deleting the returned names is the safest path —
        // we don't have to track every URL we wrote.
        let totalDeleted = 0
        const cleanedThreadIds: string[] = []

        for (const row of rows) {
            const prefix = row.id
            const { data: list, error: listErr } = await admin.storage
                .from('brainstorm-assets')
                .list(prefix, { limit: 1000 })

            if (listErr) {
                console.error(`[CleanupBrainstorm] List failed for ${prefix}:`, listErr.message)
                continue
            }

            const paths: string[] = []
            for (const file of list ?? []) {
                paths.push(`${prefix}/${file.name}`)
            }

            // Recurse one level for audio/ subfolder
            const { data: audioList } = await admin.storage
                .from('brainstorm-assets')
                .list(`${prefix}/audio`, { limit: 1000 })
            for (const f of audioList ?? []) {
                paths.push(`${prefix}/audio/${f.name}`)
            }

            if (paths.length > 0) {
                const { error: removeErr } = await admin.storage
                    .from('brainstorm-assets')
                    .remove(paths)
                if (removeErr) {
                    console.error(`[CleanupBrainstorm] Remove failed for ${prefix}:`, removeErr.message)
                    continue
                }
                totalDeleted += paths.length
            }

            cleanedThreadIds.push(row.id)
        }

        // Clear the URLs from the rows so the UI stops trying to fetch them.
        if (cleanedThreadIds.length > 0) {
            const { error: updateErr } = await admin
                .from('meeting_threads')
                .update({
                    cover_image_url: null,
                    cover_status: 'pending',
                    audio_clips: [],
                    audio_status: 'pending',
                })
                .in('id', cleanedThreadIds)

            if (updateErr) {
                console.error('[CleanupBrainstorm] Row update failed:', updateErr.message)
            }
        }

        console.info('[CleanupBrainstorm] Done', {
            threadsCleaned: cleanedThreadIds.length,
            objectsDeleted: totalDeleted,
        })

        return NextResponse.json({
            ok: true,
            threadsCleaned: cleanedThreadIds.length,
            objectsDeleted: totalDeleted,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[CleanupBrainstorm] Fatal:', message)
        return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
    }
}
