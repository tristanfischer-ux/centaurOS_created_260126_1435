'use server'

/**
 * @file brainstorm-cover.ts
 *
 * @description F2 — generates a session cover image (infographic) for
 * each saved meeting_thread. Primary model: gpt-image-2 (OpenAI, best
 * text-in-image fidelity). Fallback: gemini-nano-banana
 * (gemini-2.5-flash-preview-05-20 native image generation via Google AI)
 * if the primary errors (rate limit, content policy, 5xx).
 *
 * The resulting PNG lives at brainstorm-assets/<thread_id>/cover.png and
 * the row's cover_image_url + cover_status fields are updated when ready.
 *
 * Cost: ~$0.04–0.08 per image (gpt-image-2 medium @ 1024x1024);
 * ~$0.001 via Nano Banana fallback.
 * Logged to ai_usage_log under feature='brainstorm_cover' so /admin
 * telemetry surfaces per-foundry spend.
 *
 * @related
 * - BRAINSTORM-FEATURES-PLAN.md (Phase 2)
 * - supabase/migrations/20260428000000_brainstorm_session_assets.sql
 * - src/actions/meeting-threads.ts (refreshSessionAssetUrls signs the URL)
 * - src/app/(platform)/the-forge/services/image-generator.ts (Nano Banana pattern)
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidUUID } from '@/lib/security/sanitize'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim()
const OPENAI_IMAGE_URL = 'https://api.openai.com/v1/images/generations'
const GOOGLE_AI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const COVER_BUCKET = 'brainstorm-assets'

// Primary: gpt-image-2 — best text-in-image rendering, low hallucination on
// short text strings. medium @ 1024×1024 = ~$0.04–0.08.
// DECISION 2026-04-28: swapped from gpt-image-1 which hallucinated dense
// panel text ("I yewr entering", "#Btore @tleagn"). gpt-image-2 is
// OpenAI's current production image model with improved legibility.
const IMAGE_MODEL = 'gpt-image-2'
const IMAGE_SIZE = '1024x1024'
const IMAGE_QUALITY = 'medium'

// Fallback: Nano Banana stable (gemini-2.5-flash-preview-05-20 native image gen).
// Fires only if gpt-image-2 throws (rate limit, content policy, 5xx).
// Cost: ~$0.001/image. Same API pattern as image-generator.ts.
const NANO_BANANA_FALLBACK_MODEL = 'gemini-2.5-flash-preview-05-20'

// Per-image cost in USD for telemetry (medium @ 1024x1024, gpt-image-2)
const COST_USD = 0.06

type CoverStatus = 'pending' | 'generating' | 'ready' | 'failed'

interface SpecialistEntry {
    specialistName: string | null
    councilPosition: string | null
    content: string
}

/**
 * Build the image prompt from the meeting topic + specialist entries.
 *
 * Design philosophy — less text = less hallucination room:
 *  - Cap each specialist take to ≤8 words (was 80 chars / ~15 words).
 *    Short headline takes allow gpt-image-2 and Nano Banana to typeset
 *    cleanly without glyph-hallucination pressure.
 *  - Brand palette explicit: International Orange (#ff4500) + cream
 *    (#fff7ed) + stone text. No black backgrounds ever.
 *  - Font character named: DM Serif Display for headers, Inter for body.
 *    Models mimic the visual weight/proportion even if they can't typeset.
 *  - Light theme, generous whitespace — ForgeOS design philosophy.
 *
 * Sent to both gpt-image-2 (primary) and Nano Banana fallback unchanged.
 */
/**
 * Strip prompt-injection vectors before interpolating user text into the
 * image prompt. Removes quote characters that could close our delimiters
 * and any line-break sequences that could be used to inject a new
 * instruction line. Caps length defensively. Caught by Gemini 2.5
 * Pro Phase 2 review (specialistName + topic were unsanitised).
 */
function sanitiseForPrompt(input: string, maxLen: number): string {
    return input
        .replace(/[\r\n]+/g, ' ')
        .replace(/["“”'`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLen)
}

/**
 * Build an editorial hero illustration prompt from the session's themes.
 *
 * Design philosophy — illustrate THEMES, not text:
 *   - Single hero illustration in flat editorial style (Stripe / Linear blog
 *     header aesthetic), NOT a layout of text panels or mini speaker cards.
 *   - The model picks the visual metaphor from the theme cues we extract from
 *     specialist content (tension, tradeoffs, paths, levers, gauges, scales).
 *   - Strict "no text overlay" rule: zero embedded text (or at most a 3-5 word
 *     headline if the model absolutely must anchor — but we actively discourage
 *     it). The previous prompt embedded the full question + per-specialist
 *     panels, producing a layout widget instead of an illustration.
 *   - 16:9 landscape, off-white background, International Orange accent.
 *   - No speaker boxes, no duplicated question banner, no widget cards.
 *
 * @param topic — the founder's question (used only for theme extraction, not
 *   rendered verbatim in the image)
 * @param entries — specialist entries; we extract top 3–4 theme cues
 */
function buildPrompt(topic: string, entries: SpecialistEntry[]): string {
    const safeTopic = sanitiseForPrompt(topic, 200)

    // Extract theme cues from up to 4 specialist responses (first sentence each).
    // These cues guide the visual metaphor without being typeset in the image.
    const reactors = entries.filter(
        (e) =>
            !e.councilPosition?.toLowerCase().includes('open') &&
            !e.councilPosition?.toLowerCase().includes('close'),
    )
    const themeCues = reactors
        .slice(0, 4)
        .map((e) => {
            const firstSentence = (e.content ?? '').split(/[.!?]/)[0] ?? e.content ?? ''
            return sanitiseForPrompt(firstSentence, 80)
        })
        .filter(Boolean)
        .join('; ')

    // DESIGN RATIONALE:
    // We pass theme cues to help the model pick a concrete visual metaphor
    // (diverging paths for strategic tradeoffs, a balance scale for risk vs.
    // reward, a gauge cluster for operational metrics, etc.) rather than
    // falling back to a generic abstract pattern. No text is typeset in the
    // image — the cues are instructions to the model, not copy to render.
    return [
        'Flat editorial hero illustration, 16:9 landscape format.',
        'Style: clean vector art in the spirit of Stripe or Linear blog post headers.',
        'Light off-white background (#fff7ef), International Orange (#ff4500) as the primary accent,',
        'one or two muted secondary tones (slate blue or warm stone). No dark backgrounds.',
        'Depict the THEMES of this business discussion as a single coherent metaphor —',
        'choose from: diverging paths, a balance scale, a lever and fulcrum, a gauge cluster,',
        'interconnected gears, a horizon with a single bright focal point — whichever best',
        'captures the tension in the discussion described below.',
        'Discussion topic (for theme guidance only — do NOT typeset this): ' + safeTopic + '.',
        themeCues
            ? ('Key themes from the discussion (for visual metaphor selection only — do NOT typeset): ' + themeCues + '.')
            : '',
        'Absolutely NO text in the image — no labels, no question text, no speaker names,',
        'no speech bubbles, no callout cards, no panels, no infographic widgets.',
        'No human faces, no robots, no brain icons, no neural-network imagery.',
        'No watermarks, no logos, no signatures.',
        'Generous whitespace. Optimistic, forward-looking mood.',
    ]
        .filter(Boolean)
        .join(' ')
}

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
 * Log the spend so /admin telemetry can see per-foundry cover-image cost.
 * @param model — the model that actually produced the image (may differ
 *   from IMAGE_MODEL when Nano Banana fallback fires)
 */
async function logUsage(
    threadId: string,
    foundryId: string,
    userId: string,
    success: boolean,
    model: string = IMAGE_MODEL,
): Promise<void> {
    try {
        const admin = createAdminClient()
        // Cost is approximate: gpt-image-2 medium ~$0.06, Nano Banana ~$0.001
        const costUsd = success
            ? model === NANO_BANANA_FALLBACK_MODEL
                ? 0.001
                : COST_USD
            : 0
        await admin.from('ai_usage_log').insert({
            user_id: userId,
            foundry_id: foundryId,
            feature: 'brainstorm_cover',
            model,
            input_tokens: 0,
            output_tokens: 0,
            cost_usd: costUsd,
            metadata: { thread_id: threadId, success },
        })
    } catch (err) {
        console.error('[BrainstormCover] usage log failed:', err)
    }
}

/**
 * Generate a cover image for a meeting thread.
 *
 * @description Call this from a Vercel after() block in saveMeetingThread
 * (or the wrap-up flow). It will:
 *  1. mark cover_status = 'generating'
 *  2. fetch topic + first entries from the DB
 *  3. call gpt-image-2 with the assembled prompt
 *  4. upload PNG to brainstorm-assets/<threadId>/cover.png
 *  5. mark cover_status = 'ready' + cover_image_url = the storage path
 *  6. log usage to ai_usage_log
 *
 * On any failure, marks status='failed' and returns false. Never throws.
 *
 * @param threadId — UUID of the meeting_thread to cover
 * @returns true on success, false on any failure (status persisted)
 */
export async function generateSessionInfographic(
    threadId: string,
): Promise<{ ok: boolean; error: string | null }> {
    if (!isValidUUID(threadId)) {
        return { ok: false, error: 'Invalid thread id' }
    }
    if (!OPENAI_API_KEY) {
        console.error('[BrainstormCover] OPENAI_API_KEY missing')
        return { ok: false, error: 'OPENAI_API_KEY not configured' }
    }

    // SECURITY: this is a `'use server'` exported action and is therefore
    // reachable as a public RPC by any authenticated user. Without an
    // auth check, a malicious caller could spam arbitrary threadIds and
    // (a) leak meeting content to OpenAI, (b) bill another foundry's
    // budget. Caught by the final-pass Gemini 2.5 Pro review (P0).
    //
    // Gate: caller must be authenticated AND able to SELECT the thread
    // through their RLS-scoped client. The server-action entry path
    // (createMeetingThread → after()) already runs in the original user
    // context, so this passes naturally there.
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

    // 1. Atomically claim the generation slot — single conditional UPDATE
    // that flips cover_status='pending'|'failed' to 'generating' and
    // returns the row in one round-trip. If 0 rows were updated, another
    // worker (or a previous successful run) already owns this slot.
    // Caught by OpenRouter Gemini 2.5 Pro review of Phase 2 — TOCTOU
    // window between SELECT and UPDATE could double-bill OpenAI.
    const { data: claimed, error: claimErr } = await admin
        .from('meeting_threads')
        .update({ cover_status: 'generating' })
        .eq('id', threadId)
        .in('cover_status', ['pending', 'failed'])
        .select('id, topic, foundry_id, author_user_id')
        .maybeSingle()

    if (claimErr) {
        console.error('[BrainstormCover] Claim failed:', { threadId, err: claimErr.message })
        return { ok: false, error: 'Claim failed' }
    }

    if (!claimed) {
        // Already generating, ready, or not visible — silent no-op
        return { ok: true, error: null }
    }

    const thread = claimed

    const { data: entries } = await admin
        .from('meeting_entries')
        .select('specialist_name, council_position, content')
        .eq('thread_id', threadId)
        .eq('role', 'specialist')
        .order('created_at', { ascending: true })
        .limit(5)

    const specialistEntries: SpecialistEntry[] = ((entries ?? []) as Array<Record<string, unknown>>).map((e) => ({
        specialistName: (e.specialist_name as string) ?? null,
        councilPosition: (e.council_position as string) ?? null,
        content: (e.content as string) ?? '',
    }))

    if (specialistEntries.length === 0) {
        // No content — mark as failed so the row reaches a terminal state
        // instead of sitting in 'generating' forever. Caught by Gemini 2.5
        // Pro review (Vercel after() has no built-in retry; "will retry on
        // next save" was wishful thinking).
        await setCoverStatus(threadId, 'failed')
        return { ok: false, error: 'No specialist entries' }
    }

    // Already in 'generating' state from the atomic claim above.
    const prompt = buildPrompt((thread as { topic: string }).topic, specialistEntries)
    const foundryId = (thread as { foundry_id: string }).foundry_id
    const authorUserId = (thread as { author_user_id: string }).author_user_id

    try {
        const startedAt = Date.now()

        // ── Step 1: Attempt gpt-image-2 (primary) ────────────────────────
        let pngBuffer: Buffer | null = null
        let modelUsed = IMAGE_MODEL

        if (OPENAI_API_KEY) {
            try {
                const resp = await fetch(OPENAI_IMAGE_URL, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: IMAGE_MODEL,
                        prompt,
                        size: IMAGE_SIZE,
                        quality: IMAGE_QUALITY,
                        n: 1,
                    }),
                    // 120s budget — gpt-image-2 medium typically returns in 15-30s
                    signal: AbortSignal.timeout(120_000),
                })

                if (resp.ok) {
                    const json = (await resp.json()) as {
                        data?: Array<{ b64_json?: string; url?: string }>
                    }
                    const b64 = json.data?.[0]?.b64_json
                    const directUrl = json.data?.[0]?.url

                    if (b64) {
                        pngBuffer = Buffer.from(b64, 'base64')
                    } else if (directUrl) {
                        // gpt-image-2 sometimes returns URL only — fetch the bytes
                        const imgResp = await fetch(directUrl, { signal: AbortSignal.timeout(30_000) })
                        if (imgResp.ok) {
                            pngBuffer = Buffer.from(new Uint8Array(await imgResp.arrayBuffer()))
                        }
                    }
                } else {
                    const errBody = await resp.text().catch(() => '')
                    console.warn('[BrainstormCover] gpt-image-2 non-ok, will try Nano Banana fallback:', {
                        threadId,
                        status: resp.status,
                        body: errBody.slice(0, 300),
                    })
                }
            } catch (primaryErr) {
                console.warn('[BrainstormCover] gpt-image-2 threw, will try Nano Banana fallback:', {
                    threadId,
                    error: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
                })
            }
        } else {
            console.warn('[BrainstormCover] OPENAI_API_KEY missing — skipping primary, trying Nano Banana')
        }

        // ── Step 2: Nano Banana fallback (gemini-2.5-flash-preview-05-20) ─
        // Fires when gpt-image-2 is unavailable, errors, or returns no image.
        if (!pngBuffer && GOOGLE_AI_API_KEY) {
            console.info('[BrainstormCover] Trying Nano Banana fallback:', { threadId, model: NANO_BANANA_FALLBACK_MODEL })
            const url = `${GOOGLE_AI_API_BASE}/${NANO_BANANA_FALLBACK_MODEL}:generateContent`

            const body = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseModalities: ['TEXT', 'IMAGE'],
                },
            }

            const nanoBananaResp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': GOOGLE_AI_API_KEY,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(90_000),
            })

            if (nanoBananaResp.ok) {
                type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string } }
                const nanoBananaJson = (await nanoBananaResp.json()) as {
                    candidates?: Array<{ content?: { parts?: GeminiPart[] } }>
                }
                const parts = nanoBananaJson.candidates?.[0]?.content?.parts
                const imagePart = parts?.find((p) => p.inlineData?.data)
                if (imagePart?.inlineData?.data) {
                    pngBuffer = Buffer.from(imagePart.inlineData.data, 'base64')
                    modelUsed = NANO_BANANA_FALLBACK_MODEL
                    console.info('[BrainstormCover] Nano Banana fallback succeeded:', { threadId })
                }
            } else {
                const errBody = await nanoBananaResp.text().catch(() => '')
                console.error('[BrainstormCover] Nano Banana fallback error:', {
                    threadId,
                    status: nanoBananaResp.status,
                    body: errBody.slice(0, 300),
                })
            }
        }

        if (!pngBuffer) {
            console.error('[BrainstormCover] Both primary (gpt-image-2) and fallback (Nano Banana) produced no image:', { threadId })
            await setCoverStatus(threadId, 'failed')
            await logUsage(threadId, foundryId, authorUserId, false)
            return { ok: false, error: 'No image produced by any model' }
        }

        // ── Step 3: Upload to Supabase Storage ────────────────────────────
        const storagePath = `${threadId}/cover.png`
        const { error: uploadErr } = await admin.storage
            .from(COVER_BUCKET)
            .upload(storagePath, pngBuffer, {
                contentType: 'image/png',
                upsert: true,
                cacheControl: '3600',
            })

        if (uploadErr) {
            console.error('[BrainstormCover] Storage upload failed:', { threadId, err: uploadErr.message })
            await setCoverStatus(threadId, 'failed')
            await logUsage(threadId, foundryId, authorUserId, false)
            return { ok: false, error: 'Storage upload failed' }
        }

        // We persist the storage PATH (not a signed URL) — listMeetingThreads
        // re-signs in batch on every read so URLs never go stale.
        await setCoverStatus(threadId, 'ready', storagePath)

        // W72: revalidate /agents so the saved-session card picks up the new
        // cover image without a manual page refresh. Addresses the
        // question-mark placeholder that persists until the user reloads.
        try {
            revalidatePath('/agents')
        } catch {
            // revalidatePath only works inside a Next.js render context;
            // when called from a Vercel after() block it may no-op silently.
            // Non-fatal — the user will see the image on the next natural load.
        }

        await logUsage(threadId, foundryId, authorUserId, true, modelUsed)

        console.info('[BrainstormCover] Cover generated:', {
            threadId,
            modelUsed,
            ms: Date.now() - startedAt,
            sizeKb: Math.round(pngBuffer.length / 1024),
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
