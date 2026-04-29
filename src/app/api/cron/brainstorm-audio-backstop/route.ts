/**
 * Cron Job: Brainstorm Audio Backstop
 *
 * @description Picks up meeting_threads with audio_status='pending' that are
 * older than 2 minutes (giving the primary after() path a chance to fire first),
 * and calls generateSessionAudio for each one up to BATCH_SIZE.
 *
 * This backstop exists because the primary audio-generation path runs inside
 * Vercel's after() block in completeMeetingThread. After() silently drops when
 * the handler returns in under ~1 second — a known Vercel constraint. Sessions
 * with many TTS chunks can also exceed the 300s cap. The cron sweeps the
 * stragglers so audio_status does not stay stuck at 'pending' indefinitely.
 *
 * Schedule: every 15 minutes (set in vercel.json).
 *
 * @security Requires CRON_SECRET Bearer token. Admin client bypasses RLS.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSessionAudio } from '@/actions/brainstorm-audio'

// Process at most 3 sessions per tick to stay well within the 300s cap.
const BATCH_SIZE = 3
// Sessions younger than 2 minutes may still have their after() block in-flight.
const MIN_AGE_MINUTES = 2

export const maxDuration = 300

export async function GET(req: NextRequest): Promise<NextResponse> {
    const authFailure = verifyCronSecret(req)
    if (authFailure) return authFailure

    try {
        const admin = createAdminClient()
        const cutoff = new Date(Date.now() - MIN_AGE_MINUTES * 60 * 1000).toISOString()

        // Find sessions stuck at pending (audio never started or after() dropped).
        // Exclude 'generating' rows that were recently touched — those may be running.
        const { data: rows, error: fetchErr } = await admin
            .from('meeting_threads')
            .select('id')
            .in('audio_status', ['pending'])
            .eq('status', 'complete')
            .lt('created_at', cutoff)
            .order('created_at', { ascending: true })
            .limit(BATCH_SIZE)

        if (fetchErr) {
            console.error('[AudioBackstop] Fetch failed:', fetchErr.message)
            return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })
        }

        const pending = (rows ?? []) as Array<{ id: string }>
        if (pending.length === 0) {
            return NextResponse.json({ ok: true, processed: 0 })
        }

        console.info('[AudioBackstop] Processing sessions:', { count: pending.length, ids: pending.map(r => r.id) })

        const results: Array<{ id: string; ok: boolean; error: string | null }> = []

        for (const row of pending) {
            try {
                const result = await generateSessionAudio(row.id)
                results.push({ id: row.id, ok: result.ok, error: result.error })
                console.info('[AudioBackstop] Session processed:', { id: row.id, ok: result.ok, charCount: result.charCount })
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown error'
                console.error('[AudioBackstop] Session failed:', { id: row.id, error: msg })
                results.push({ id: row.id, ok: false, error: msg })
            }
        }

        return NextResponse.json({
            ok: true,
            processed: results.length,
            results,
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[AudioBackstop] Fatal:', message)
        return NextResponse.json({ error: 'Backstop failed' }, { status: 500 })
    }
}
