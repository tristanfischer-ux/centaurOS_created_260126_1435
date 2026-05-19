/**
 * Cron Job: Brainstorm Audio Backstop — PAUSED 2026-05-19
 *
 * @description Originally picked up meeting_threads with audio_status='pending'
 * older than 2 minutes and called generateSessionAudio for each one up to
 * BATCH_SIZE.
 *
 * PAUSED because the audio transcript feature is hidden across the UI and the
 * primary after() schedulers in createMeetingThread / completeMeetingThread
 * are also paused. With audio_status now staying 'pending' on every new
 * session, the cron would otherwise pick up every saved brainstorm and burn
 * Gemini TTS tokens on a feature nobody can see.
 *
 * To reinstate: revert this file to the pre-2026-05-19 version (git history)
 * and re-enable the after() blocks in src/actions/meeting-threads.ts.
 *
 * Schedule: every 15 minutes (set in vercel.json) — left in place so the
 * cron still runs, but it now returns immediately.
 *
 * @security Requires CRON_SECRET Bearer token.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/security/cron-auth'

export const maxDuration = 300

export async function GET(req: NextRequest): Promise<NextResponse> {
    const authFailure = verifyCronSecret(req)
    if (authFailure) return authFailure

    return NextResponse.json({ ok: true, processed: 0, paused: true })
}
