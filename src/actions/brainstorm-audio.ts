'use server'

/**
 * @file brainstorm-audio.ts
 *
 * @description F3 — generates a single combined WAV audio file for each saved
 * meeting_thread using the Gemini multi-speaker TTS endpoint. One WAV file per
 * session, stored at brainstorm-assets/<threadId>/audio/combined.wav and played
 * by an HTML <audio> player on the meeting page.
 *
 * Audio pipeline (ported from HFN generate_audio.py):
 *   1. Collect all specialist entries for the thread.
 *   2. Assign each entry to Reader1 or Reader2 (alternating by index; Cal/host
 *      always Reader1 for the first turn).
 *   3. Accumulate entries into chunks of at most 4,500 chars, merging any
 *      final chunk under 1,000 chars into the previous one.
 *   4. Call the Gemini multi-speaker TTS endpoint for each chunk; concatenate
 *      the raw PCM bytes across all chunks.
 *   5. Wrap the concatenated PCM in a standard 44-byte WAV header (pure JS,
 *      no ffmpeg — avoids the Vercel-no-ffmpeg constraint).
 *   6. Upload combined.wav to Supabase storage and write the path to
 *      meeting_threads.audio_url.
 *
 * Provider: Google AI Gemini TTS.
 *   Primary model:  gemini-2.5-pro-preview-tts
 *   Fallback model: gemini-2.5-flash-preview-tts  (on 429 / 500 / 503)
 *   Auth: x-goog-api-key from GOOGLE_AI_API_KEY or GEMINI_API_KEY
 *
 * NOTE: OpenRouter does NOT proxy Gemini TTS (audio modality is excluded from
 * the text-only OpenRouter bridge). The call is direct to Google AI.
 *
 * Voice mapping (Gemini built-in voices):
 *   Reader1 = Puck  (British male, calm and authoritative)
 *   Reader2 = Kore  (British female, clear and engaging)
 *
 * Cost estimate: Gemini TTS charges per character of audio text. A typical
 * 3,000-char council session costs ~$0.01 at current pricing.
 *
 * @related
 * - BRAINSTORM-FEATURES-PLAN.md (Phase 3)
 * - src/actions/meeting-threads.ts (refreshSessionAssetUrls signs WAV URLs)
 * - hfn-build-system/generate_audio.py (reference implementation)
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidUUID } from '@/lib/security/sanitize'

// ── Environment ────────────────────────────────────────────────────────────────

const GOOGLE_AI_API_KEY =
    process.env.GOOGLE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim()

const AUDIO_BUCKET = 'brainstorm-assets'

// Two Gemini TTS models in order of preference. The pipeline tries
// Pro first; on 429 / 500 / 503 it falls back to Flash.
const TTS_MODELS = [
    'gemini-2.5-pro-preview-tts',
    'gemini-2.5-flash-preview-tts',
] as const

// British voices for multi-speaker TTS.
const VOICE_READER1 = 'Puck' // Calm, authoritative British male
const VOICE_READER2 = 'Kore' // Clear, engaging British female

// Chunking constants (matching HFN generate_audio.py).
const TTS_MAX_CHARS = 4_500
const TTS_MIN_LAST_CHUNK = 1_000
const TTS_RATE_LIMIT_SLEEP_MS = 45_000

// The voice-direction prompt prepended to each chunk.
const VOICE_DIRECTION = `Read this brainstorm-council discussion aloud using British English accents — Received Pronunciation, like BBC Radio 4. Reader1 is a calm, authoritative narrator. Reader2 is a clear, engaging narrator. Both read at a natural, measured pace suitable for a serious analytical conversation. Each reader reads their assigned turns smoothly and professionally.`

// PCM audio parameters from the Gemini TTS response.
const PCM_SAMPLE_RATE = 24_000
const PCM_CHANNELS = 1
const PCM_BIT_DEPTH = 16

// ── Types ──────────────────────────────────────────────────────────────────────

type AudioStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'refused_too_long'

interface AudioClip {
    specialist_id: string | null
    specialist_name: string | null
    voice: string
    path: string
    char_count: number
}

// A single council entry assigned to a speaker label.
interface SpeakerEntry {
    speakerLabel: 'Reader1' | 'Reader2'
    text: string
}

// A chunk ready to send to the TTS endpoint.
type TtsChunk = SpeakerEntry[]

// ── Helpers ────────────────────────────────────────────────────────────────────

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

/**
 * Strip markdown emphasis, headings, and links before TTS — the engine
 * reads "asterisk asterisk" literally otherwise.
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
 * Assign each council entry to Reader1 or Reader2, alternating by index.
 * The host specialist (chief-of-staff / Cal) always starts as Reader1 so the
 * opening framing is authoritative. Other specialists alternate starting at
 * index 0 of the non-host entries.
 */
function assignSpeakers(
    entries: Array<{
        specialist_id: string | null
        specialist_name: string | null
        content: string
    }>,
): SpeakerEntry[] {
    const result: SpeakerEntry[] = []
    let specialistIndex = 0

    for (const entry of entries) {
        const text = plainText(entry.content)
        if (!text || text.length < 30) continue

        const name = entry.specialist_name ?? 'Specialist'
        const isHost = entry.specialist_id === 'chief-of-staff'

        let speakerLabel: 'Reader1' | 'Reader2'
        if (isHost) {
            // Cal / host always Reader1 for framing continuity.
            speakerLabel = 'Reader1'
        } else {
            speakerLabel = specialistIndex % 2 === 0 ? 'Reader1' : 'Reader2'
            specialistIndex++
        }

        // Include the specialist's name inline so the listener knows who is
        // speaking — Gemini reads "Reader1: Cal here — <text>" naturally.
        result.push({
            speakerLabel,
            text: `${name}: ${text}`,
        })
    }

    return result
}

/**
 * Group speaker entries into chunks of at most TTS_MAX_CHARS characters.
 * If the last chunk is shorter than TTS_MIN_LAST_CHUNK chars it is merged
 * into the previous chunk (matching HFN generate_audio.py behaviour).
 */
function buildChunks(entries: SpeakerEntry[]): TtsChunk[] {
    const chunks: TtsChunk[] = []
    let current: TtsChunk = []
    let currentLen = 0

    for (const entry of entries) {
        // +30 for the "Reader1: " prefix overhead in the formatted payload.
        const entryLen = entry.text.length + 30
        if (currentLen + entryLen > TTS_MAX_CHARS && current.length > 0) {
            chunks.push(current)
            current = []
            currentLen = 0
        }
        current.push(entry)
        currentLen += entryLen
    }

    if (current.length > 0) {
        chunks.push(current)
    }

    // Merge last chunk into second-to-last if it is too short.
    if (chunks.length >= 2) {
        const lastLen = chunks[chunks.length - 1].reduce(
            (acc, e) => acc + e.text.length + 30,
            0,
        )
        if (lastLen < TTS_MIN_LAST_CHUNK) {
            chunks[chunks.length - 2].push(...chunks[chunks.length - 1])
            chunks.pop()
        }
    }

    return chunks
}

/**
 * Build the 44-byte canonical WAV header for the given PCM byte-length.
 *
 * Format: RIFF / PCM / 24 kHz / 16-bit / mono.
 * Pure JS — no ffmpeg, no external libraries.
 */
function buildWavHeader(pcmByteLength: number): Buffer {
    const blockAlign = PCM_CHANNELS * (PCM_BIT_DEPTH / 8) // 2
    const byteRate = PCM_SAMPLE_RATE * blockAlign // 48000
    const dataChunkSize = pcmByteLength
    const riffChunkSize = 36 + dataChunkSize

    const header = Buffer.alloc(44)
    // RIFF header
    header.write('RIFF', 0, 'ascii')
    header.writeUInt32LE(riffChunkSize, 4)
    header.write('WAVE', 8, 'ascii')
    // fmt  sub-chunk
    header.write('fmt ', 12, 'ascii')
    header.writeUInt32LE(16, 16) // sub-chunk size (PCM = 16)
    header.writeUInt16LE(1, 20) // audio format 1 = PCM
    header.writeUInt16LE(PCM_CHANNELS, 22)
    header.writeUInt32LE(PCM_SAMPLE_RATE, 24)
    header.writeUInt32LE(byteRate, 28)
    header.writeUInt16LE(blockAlign, 32)
    header.writeUInt16LE(PCM_BIT_DEPTH, 34)
    // data sub-chunk
    header.write('data', 36, 'ascii')
    header.writeUInt32LE(dataChunkSize, 40)
    return header
}

/**
 * Call the Gemini TTS endpoint for a single chunk and return the raw PCM bytes.
 *
 * Retries up to 6 times per model. Falls back from Pro to Flash on 429/500/503.
 * Sleeps TTS_RATE_LIMIT_SLEEP_MS (45 s) between chunks (the caller is
 * responsible for the inter-chunk sleep, not this function).
 */
async function generateTtsChunk(chunk: TtsChunk, maxRetries = 6): Promise<Buffer> {
    // Format the chunk as "Reader1: <text>\n\nReader2: <text>" etc.
    const formatted = chunk
        .map((e) => `${e.speakerLabel}: ${e.text}`)
        .join('\n\n')

    const payload = {
        contents: [
            {
                role: 'user',
                parts: [{ text: `${VOICE_DIRECTION}\n\n${formatted}` }],
            },
        ],
        generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
                multiSpeakerVoiceConfig: {
                    speakerVoiceConfigs: [
                        {
                            speaker: 'Reader1',
                            voiceConfig: {
                                prebuiltVoiceConfig: { voiceName: VOICE_READER1 },
                            },
                        },
                        {
                            speaker: 'Reader2',
                            voiceConfig: {
                                prebuiltVoiceConfig: { voiceName: VOICE_READER2 },
                            },
                        },
                    ],
                },
            },
        },
    }

    let lastError = 'Unknown'

    for (const model of TTS_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const resp = await fetch(`${url}?key=${GOOGLE_AI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                // 6-minute timeout — long audio chunks can take several minutes.
                signal: AbortSignal.timeout(360_000),
            })

            if (resp.status === 429 || resp.status === 500 || resp.status === 503) {
                // Rate-limited or server error — retry or try next model.
                const isQuotaExhausted =
                    resp.status === 429 &&
                    (await resp.text().catch(() => '')).includes('per_day')
                if (isQuotaExhausted) {
                    console.warn(`[BrainstormAudio] ${model} daily quota exhausted, trying next model`)
                    break // Try the next model.
                }
                const waitMs = 15_000 + attempt * 10_000
                console.warn(`[BrainstormAudio] ${model} HTTP ${resp.status} attempt ${attempt + 1}/${maxRetries} — waiting ${waitMs}ms`)
                await new Promise((r) => setTimeout(r, waitMs))
                lastError = `HTTP ${resp.status}`
                continue
            }

            if (!resp.ok) {
                const body = await resp.text().catch(() => '')
                throw new Error(`Gemini TTS HTTP ${resp.status}: ${body.slice(0, 300)}`)
            }

            const data = (await resp.json()) as {
                candidates?: Array<{
                    content?: {
                        parts?: Array<{
                            inlineData?: { data?: string }
                        }>
                    }
                    finishReason?: string
                }>
            }

            const candidates = data.candidates ?? []
            if (candidates.length === 0) {
                const waitMs = 15_000 + attempt * 10_000
                console.warn(`[BrainstormAudio] ${model} no candidates attempt ${attempt + 1} — waiting ${waitMs}ms`)
                await new Promise((r) => setTimeout(r, waitMs))
                lastError = 'No candidates'
                continue
            }

            const inlineData = candidates[0]?.content?.parts?.[0]?.inlineData
            if (!inlineData?.data) {
                const finishReason = candidates[0]?.finishReason ?? 'unknown'
                const waitMs = 15_000 + attempt * 10_000
                console.warn(`[BrainstormAudio] ${model} no audio (finishReason=${finishReason}) attempt ${attempt + 1} — waiting ${waitMs}ms`)
                await new Promise((r) => setTimeout(r, waitMs))
                lastError = `No audio (finishReason=${finishReason})`
                continue
            }

            return Buffer.from(inlineData.data, 'base64')
        }
    }

    throw new Error(`Gemini TTS failed on all models: ${lastError}`)
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Generate a single combined WAV audio file for a meeting thread.
 *
 * @description
 * Assembles a multi-speaker audio file from all specialist entries using the
 * Gemini multi-speaker TTS pipeline. Two British voices alternate (Reader1 =
 * Puck, Reader2 = Kore); the specialist's name is embedded in the text so the
 * listener knows who is speaking.
 *
 * Output:
 *   brainstorm-assets/<threadId>/audio/combined.wav
 *
 * The meeting_threads row gains:
 *   audio_status = 'ready'
 *   audio_url    = storage path (signed on read by refreshSessionAssetUrls)
 *
 * The legacy audio_clips JSONB is set to a single synthetic entry for
 * backwards compatibility with older sessions that still read it.
 *
 * @param threadId — UUID of the meeting_thread
 * @returns ok flag + total char count + error message
 */
export async function generateSessionAudio(
    threadId: string,
): Promise<{ ok: boolean; charCount: number; error: string | null }> {
    if (!isValidUUID(threadId)) {
        return { ok: false, charCount: 0, error: 'Invalid thread id' }
    }
    if (!GOOGLE_AI_API_KEY) {
        console.error('[BrainstormAudio] GOOGLE_AI_API_KEY / GEMINI_API_KEY missing')
        return { ok: false, charCount: 0, error: 'Gemini API key not configured' }
    }

    // SECURITY: auth gate — server actions are public RPC endpoints by default.
    // Without this gate, an attacker could trigger TTS generation for any thread
    // they know the UUID of, billing the owning foundry.
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

    // Atomic claim — flip audio_status from 'pending'|'failed' to 'generating'
    // in one round-trip to prevent concurrent double-generation.
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

    const thread = claimed as { id: string; foundry_id: string; author_user_id: string }

    // Load all specialist entries in chronological order.
    const { data: rawEntries } = await admin
        .from('meeting_entries')
        .select('id, specialist_id, specialist_name, content, role, created_at')
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
        await setAudioStatus(threadId, 'failed')
        return { ok: false, charCount: 0, error: 'No specialist entries' }
    }

    // Assign speakers and build TTS chunks.
    const speakerEntries = assignSpeakers(entries)
    if (speakerEntries.length === 0) {
        await setAudioStatus(threadId, 'refused_too_long')
        return { ok: false, charCount: 0, error: 'No audio-worthy entries' }
    }

    const chunks = buildChunks(speakerEntries)
    const totalChars = speakerEntries.reduce((acc, e) => acc + e.text.length, 0)

    console.info('[BrainstormAudio] Starting Gemini TTS:', {
        threadId,
        entries: speakerEntries.length,
        chunks: chunks.length,
        totalChars,
    })

    try {
        // Generate PCM for each chunk, concatenating into one buffer.
        const pcmBuffers: Buffer[] = []

        for (let i = 0; i < chunks.length; i++) {
            const chunkChars = chunks[i].reduce((acc, e) => acc + e.text.length, 0)
            console.info(`[BrainstormAudio] Chunk ${i + 1}/${chunks.length}: ${chunkChars} chars`)

            const pcm = await generateTtsChunk(chunks[i])
            pcmBuffers.push(pcm)

            // Rate-limit guard between chunks — 45 s, matching HFN pipeline.
            if (i < chunks.length - 1) {
                await new Promise((r) => setTimeout(r, TTS_RATE_LIMIT_SLEEP_MS))
            }
        }

        // Concatenate all PCM, then prepend the WAV header.
        const allPcm = Buffer.concat(pcmBuffers)
        const wavHeader = buildWavHeader(allPcm.length)
        const wavBuffer = Buffer.concat([wavHeader, allPcm])

        // Upload to Supabase storage.
        const storagePath = `${threadId}/audio/combined.wav`
        const { error: uploadErr } = await admin.storage
            .from(AUDIO_BUCKET)
            .upload(storagePath, wavBuffer, {
                contentType: 'audio/wav',
                upsert: true,
                cacheControl: '3600',
            })

        if (uploadErr) {
            console.error('[BrainstormAudio] Storage upload failed:', {
                threadId,
                path: storagePath,
                err: uploadErr.message,
            })
            await setAudioStatus(threadId, 'failed')
            return { ok: false, charCount: totalChars, error: 'Storage upload failed' }
        }

        // Persist the combined audio path. The legacy audio_clips array is set
        // to a single synthetic entry so refreshSessionAssetUrls (which signs
        // audio_clips entries) still works for older code paths that read it.
        const legacyClip: AudioClip = {
            specialist_id: null,
            specialist_name: 'Full council discussion',
            voice: 'gemini-multispeaker',
            path: storagePath,
            char_count: totalChars,
        }
        await admin
            .from('meeting_threads')
            .update({
                audio_status: 'ready',
                audio_clips: [legacyClip],
                audio_url: storagePath,
            })
            .eq('id', threadId)

        console.info('[BrainstormAudio] Combined WAV generated:', {
            threadId,
            speakerCount: speakerEntries.length,
            chunks: chunks.length,
            chars: totalChars,
            pcmBytes: allPcm.length,
            wavKb: Math.round(wavBuffer.length / 1024),
            durationEstMin: Math.round(allPcm.length / (PCM_SAMPLE_RATE * 2) / 60 * 10) / 10,
        })

        return { ok: true, charCount: totalChars, error: null }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[BrainstormAudio] Fatal:', { threadId, message })
        await setAudioStatus(threadId, 'failed')
        return { ok: false, charCount: 0, error: message }
    }
}
