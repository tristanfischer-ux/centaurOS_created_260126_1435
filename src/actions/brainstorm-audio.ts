'use server'

/**
 * @file brainstorm-audio.ts
 *
 * @description F3 — generates per-specialist voice clips for each saved
 * meeting_thread using OpenAI's tts-1 endpoint. One MP3 per specialist
 * entry, played in sequence by an HTML <audio> playlist on the meeting
 * page. NOT OpenRouter (TTS isn't on OpenRouter — Tristan's premise was
 * wrong, flagged in the red-team).
 *
 * Provider: OpenAI tts-1 ($15 / 1M chars). For a 3K-char council session
 * that's ~$0.045 per session. Cost guard refuses generation when the
 * total transcript exceeds CHAR_BUDGET (default 13K chars / ~$0.20).
 *
 * Voice mapping (per BRAINSTORM-FEATURES-PLAN.md D5):
 *   Fiona (host)       -> nova
 *   Sage (strategy)    -> onyx
 *   Finn (finance)     -> alloy
 *   Sal  (sales)       -> fable
 *   Max  (CTO)         -> echo
 *   Cal  (chief-of-st) -> shimmer
 *   any other          -> alloy (fallback)
 *
 * @related
 * - BRAINSTORM-FEATURES-PLAN.md (Phase 3)
 * - src/actions/meeting-threads.ts (refreshSessionAssetUrls signs MP3 URLs)
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidUUID } from '@/lib/security/sanitize'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech'
const AUDIO_BUCKET = 'brainstorm-assets'

const TTS_MODEL = 'tts-1'
const AUDIO_FORMAT = 'mp3'
const CHAR_BUDGET = 13_000 // ~$0.20 per session

// Cost per million chars for telemetry (tts-1 published price)
const COST_PER_MILLION = 15.0

type AudioStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'refused_too_long'

// Voice → specialist mapping. The right side is the OpenAI tts-1 voice.
// Keep this in sync with the D5 row in BRAINSTORM-FEATURES-PLAN.md and
// the LIVE_VOICE_MAPPING comment in specialists-config.ts (added below).
const SPECIALIST_VOICE_MAP: Record<string, string> = {
    'fundraising-advisor': 'nova', // Fiona (host)
    'strategist': 'onyx', // Sage
    'finance-lead': 'alloy', // Finn
    'sales-lead': 'fable', // Sal
    'cto': 'echo', // Max
    'chief-of-staff': 'shimmer', // Cal

    // Fall-back assignments for the other specialists so 5-tier deep
    // councils still get distinct voices instead of all defaulting to alloy.
    'vp-engineering': 'echo',
    'vp-manufacturing': 'onyx',
    'vp-supply-chain': 'fable',
    'product-lead': 'nova',
    'growth-marketer': 'shimmer',
    'hiring-team': 'shimmer',
    'legal-counsel': 'onyx',
}

const VALID_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const

function voiceFor(specialistId: string | null): string {
    if (!specialistId) return 'alloy'
    return SPECIALIST_VOICE_MAP[specialistId] ?? 'alloy'
}

interface AudioClip {
    specialist_id: string | null
    specialist_name: string | null
    voice: string
    path: string
    char_count: number
}

async function setAudioStatus(
    threadId: string,
    status: AudioStatus,
    clips?: AudioClip[],
): Promise<void> {
    const admin = createAdminClient()
    const update: Record<string, unknown> = { audio_status: status }
    if (clips !== undefined) {
        update.audio_clips = clips
    }
    await admin.from('meeting_threads').update(update).eq('id', threadId)
}

async function logUsage(
    threadId: string,
    foundryId: string,
    userId: string,
    chars: number,
    success: boolean,
): Promise<void> {
    try {
        const admin = createAdminClient()
        await admin.from('ai_usage_log').insert({
            user_id: userId,
            foundry_id: foundryId,
            feature: 'brainstorm_audio',
            model: TTS_MODEL,
            input_tokens: chars, // chars repurposed as input_tokens for billing surface
            output_tokens: 0,
            cost_usd: success ? (chars / 1_000_000) * COST_PER_MILLION : 0,
            metadata: { thread_id: threadId, success, char_count: chars },
        })
    } catch (err) {
        console.error('[BrainstormAudio] usage log failed:', err)
    }
}

/**
 * Strip markdown emphasis + headings before sending text to TTS — the
 * TTS engine reads "asterisk asterisk" literally otherwise.
 */
function plainText(content: string): string {
    return content
        .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1') // italic
        .replace(/_([^_]+)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1') // inline code
        .replace(/^#{1,6}\s+/gm, '') // ATX headings
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // markdown links → label
        .replace(/^[-*]\s+/gm, '— ') // list bullets → em-dash
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/**
 * Generate a single combined audio file for a meeting thread.
 *
 * @description Assembles a single TTS script from all specialist entries,
 * using inline "Name:" labels as speaker separators and a comma-pause
 * between turns. One OpenAI tts-1 call → one MP3 file → one <audio> player.
 *
 * This is simpler and better than the previous per-clip approach:
 *   - One player means the founder can listen in the car without touching
 *     the screen between each speaker.
 *   - Single-call TTS produces more natural prosody across turn boundaries
 *     than stitching separate clips.
 *   - No ffmpeg dependency.
 *
 * Storage path: brainstorm-assets/<threadId>/audio/combined.mp3
 * The row gains an audio_url TEXT column alongside the legacy audio_clips
 * JSONB (kept for backwards compat with old sessions).
 *
 * Cost guard: if combined char count > CHAR_BUDGET, status is set to
 * 'refused_too_long' and no API call happens.
 *
 * Voice: we use 'nova' (Cal's mapped voice) for the combined script — calm,
 * clear, and natural for continuous listening. The inline "Name:" labels let
 * the listener follow who is speaking without voice-switching complexity.
 *
 * @param threadId — UUID of the meeting_thread
 * @returns ok flag + total char count + error
 */
export async function generateSessionAudio(
    threadId: string,
): Promise<{ ok: boolean; charCount: number; error: string | null }> {
    if (!isValidUUID(threadId)) {
        return { ok: false, charCount: 0, error: 'Invalid thread id' }
    }
    if (!OPENAI_API_KEY) {
        console.error('[BrainstormAudio] OPENAI_API_KEY missing')
        return { ok: false, charCount: 0, error: 'OPENAI_API_KEY not configured' }
    }

    // SECURITY: same auth gate as brainstorm-cover — server actions are
    // public RPC endpoints by default. Without this gate, an attacker
    // could trigger TTS generation for any thread they know the ID of,
    // billing the owning foundry. Caught by Gemini 2.5 Pro final review.
    const userClient = await createClient()
    const {
        data: { user },
    } = await userClient.auth.getUser()
    if (!user) {
        return { ok: false, charCount: 0, error: 'Not authenticated' }
    }
    const { data: gateRow, error: gateErr } = await userClient
        .from('meeting_threads')
        .select('id')
        .eq('id', threadId)
        .single()
    if (gateErr || !gateRow) {
        return { ok: false, charCount: 0, error: 'Not authorised' }
    }

    const admin = createAdminClient()

    // Atomic claim — flip audio_status='pending'|'failed' to 'generating'
    // in one round-trip. If 0 rows updated, another worker already owns
    // this slot. Caught by DeepSeek V3.1 Terminus Phase 3 review (TOCTOU
    // race could double-bill OpenAI on rapid concurrent saves).
    const { data: claimed, error: claimErr } = await admin
        .from('meeting_threads')
        .update({ audio_status: 'generating' })
        .eq('id', threadId)
        .in('audio_status', ['pending', 'failed'])
        .select('id, foundry_id, author_user_id')
        .maybeSingle()

    if (claimErr) {
        console.error('[BrainstormAudio] Claim failed:', { threadId, err: claimErr.message })
        return { ok: false, charCount: 0, error: 'Claim failed' }
    }

    if (!claimed) {
        // Already generating, ready, refused, or RLS-hidden — no-op.
        return { ok: true, charCount: 0, error: null }
    }

    const thread = claimed

    const { data: rawEntries } = await admin
        .from('meeting_entries')
        .select('id, specialist_id, specialist_name, content, role, round_number, created_at')
        .eq('thread_id', threadId)
        .eq('role', 'specialist')
        .order('created_at', { ascending: true })

    const entries = (rawEntries ?? []) as Array<{
        id: string
        specialist_id: string | null
        specialist_name: string | null
        content: string
    }>

    if (entries.length === 0) {
        // Terminal failed state — don't leave the row stuck in 'generating'.
        await setAudioStatus(threadId, 'failed')
        return { ok: false, charCount: 0, error: 'No specialist entries' }
    }

    // ── Build the combined script ─────────────────────────────────────────
    // Format: "Name: <plain text>. , , , " with comma-pauses between turns
    // to give the listener a beat to absorb each perspective before the next
    // speaker begins. The inline label ("Sage:") reads naturally in TTS.
    const scriptParts: string[] = []
    for (const entry of entries) {
        const text = plainText(entry.content)
        if (!text || text.length < 30) continue
        const label = entry.specialist_name ?? 'Specialist'
        scriptParts.push(`${label}: ${text}`)
    }

    if (scriptParts.length === 0) {
        await setAudioStatus(threadId, 'refused_too_long')
        return { ok: false, charCount: 0, error: 'No audio-worthy entries' }
    }

    // Join with a double-comma pause (TTS reads each comma as a brief pause).
    const combinedScript = scriptParts.join(' , , , ')
    const totalChars = combinedScript.length

    // Cost guard
    if (totalChars > CHAR_BUDGET) {
        console.warn('[BrainstormAudio] Refused — over budget:', {
            threadId,
            chars: totalChars,
            budget: CHAR_BUDGET,
        })
        await setAudioStatus(threadId, 'refused_too_long')
        return {
            ok: false,
            charCount: totalChars,
            error: `Session too long for audio (${totalChars} chars > ${CHAR_BUDGET})`,
        }
    }

    try {
        // Single TTS call — 'nova' voice is calm and clear for continuous
        // listening. Inline name labels handle speaker differentiation.
        const resp = await fetch(OPENAI_TTS_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: TTS_MODEL,
                voice: 'nova',
                input: combinedScript,
                response_format: AUDIO_FORMAT,
                speed: 1.0,
            }),
            signal: AbortSignal.timeout(120_000),
        })

        if (!resp.ok) {
            const body = await resp.text().catch(() => '')
            console.error('[BrainstormAudio] OpenAI TTS error:', {
                threadId,
                status: resp.status,
                body: body.slice(0, 300),
            })
            await setAudioStatus(threadId, 'failed')
            await logUsage(
                threadId,
                (thread as { foundry_id: string }).foundry_id,
                (thread as { author_user_id: string }).author_user_id,
                totalChars,
                false,
            )
            return { ok: false, charCount: totalChars, error: `TTS ${resp.status}` }
        }

        const arr = new Uint8Array(await resp.arrayBuffer())
        const mp3 = Buffer.from(arr)

        // Single file at a predictable path under <threadId>/audio/
        const path = `${threadId}/audio/combined.mp3`

        const { error: uploadErr } = await admin.storage
            .from(AUDIO_BUCKET)
            .upload(path, mp3, {
                contentType: 'audio/mpeg',
                upsert: true,
                cacheControl: '3600',
            })

        if (uploadErr) {
            console.error('[BrainstormAudio] Storage upload failed:', {
                threadId,
                path,
                err: uploadErr.message,
            })
            await setAudioStatus(threadId, 'failed')
            return { ok: false, charCount: totalChars, error: 'Storage upload failed' }
        }

        // Persist the combined audio path. We also write a synthetic
        // audio_clips array with a single entry so the legacy path in
        // refreshSessionAssetUrls (which signs audio_clips) still works for
        // any code that reads it. New UI reads audio_url directly.
        const legacyClip: AudioClip = {
            specialist_id: null,
            specialist_name: 'Full council discussion',
            voice: 'nova',
            path,
            char_count: totalChars,
        }
        const adminUpdate: Record<string, unknown> = {
            audio_status: 'ready',
            audio_clips: [legacyClip],
            // audio_url persists the storage path for the new single-player UI.
            // refreshSessionAssetUrls signs this path alongside cover_image_url.
            audio_url: path,
        }
        await admin.from('meeting_threads').update(adminUpdate).eq('id', threadId)

        await logUsage(
            threadId,
            (thread as { foundry_id: string }).foundry_id,
            (thread as { author_user_id: string }).author_user_id,
            totalChars,
            true,
        )

        console.info('[BrainstormAudio] Combined audio generated:', {
            threadId,
            speakerCount: scriptParts.length,
            chars: totalChars,
            sizeKb: Math.round(mp3.length / 1024),
            costUsd: ((totalChars / 1_000_000) * COST_PER_MILLION).toFixed(4),
        })

        return { ok: true, charCount: totalChars, error: null }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[BrainstormAudio] Fatal:', { threadId, message })
        await setAudioStatus(threadId, 'failed')
        await logUsage(
            threadId,
            (thread as { foundry_id: string }).foundry_id,
            (thread as { author_user_id: string }).author_user_id,
            0,
            false,
        )
        return { ok: false, charCount: 0, error: message }
    }
}
