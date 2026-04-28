import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidUUID } from '@/lib/security/sanitize'

/**
 * @file api/brainstorm-cover/[threadId]/route.tsx
 *
 * @description Deterministic structured infographic for a brainstorming session.
 * Renders 1600×900 PNG via next/og (ImageResponse JSX → PNG, zero AI cost).
 * Replaces the gpt-image-2 / Nano Banana path that could not typeset multi-element
 * infographics with crisp text.
 *
 * On success:
 *  1. Returns the PNG with Cache-Control: public, max-age=86400, immutable.
 *  2. Uploads the PNG to brainstorm-assets/<threadId>/cover.png.
 *  3. Updates meeting_threads.cover_image_url + cover_status='ready'.
 *
 * @security Auth-gated: the caller's RLS-scoped client must be able to SELECT
 * the thread row. Anonymous requests are rejected.
 *
 * @related
 *  - src/actions/brainstorm-cover.ts (thin wrapper + atomic claim logic)
 *  - supabase/migrations/20260428000000_brainstorm_session_assets.sql
 */

export const runtime = 'edge'

// ─── Colour palette (ForgeOS brand) ──────────────────────────────────────────
const CREAM       = '#fff7ef'
const ORANGE      = '#ff4500'
const CHARCOAL    = '#292524'
const STONE       = '#78716c'
const DIVIDER     = '#e7e5e4'

// Initial-circle background palette for specialists (Cal gets ORANGE, others rotate)
const CIRCLE_PALETTE = ['#3b82f6', '#0ea5e9', '#8b5cf6', '#22c55e', '#f59e0b', '#ec4899']

// ─── Content extraction helpers ───────────────────────────────────────────────

interface RawEntry {
    specialist_name: string | null
    council_position: string | null
    content: string
    role: string
}

/** Return the first sentence of text, capped at maxLen characters. */
function firstSentence(text: string, maxLen: number): string {
    // Split on sentence-ending punctuation followed by a space or end of string
    const match = text.match(/^(.*?[.!?])(?:\s|$)/)
    const sentence = match ? match[1] : text
    const trimmed = sentence.trim()
    if (trimmed.length <= maxLen) return trimmed
    // Truncate at last word boundary within maxLen
    const truncated = trimmed.slice(0, maxLen)
    const lastSpace = truncated.lastIndexOf(' ')
    return lastSpace > maxLen * 0.6 ? truncated.slice(0, lastSpace) + '…' : truncated + '…'
}

/** Parse the council tier label + specialist count from tier string + entry array. */
function tierBadgeText(tier: string, specialistCount: number): string {
    const labels: Record<string, string> = {
        quick: 'QUICK',
        full: 'FULL COUNCIL',
        deep: 'DEEP COUNCIL',
        strategy: 'STRATEGY',
    }
    const label = labels[tier] ?? tier.toUpperCase()
    return `${label} · ${specialistCount}`
}

interface ExtractedContent {
    calOpen: string
    specialists: Array<{ name: string; role: string; take: string; initial: string; colour: string }>
    agreedOn: string
    disagreedOn: string
    thisWeek: string
}

function extractContent(entries: RawEntry[], topic: string): ExtractedContent {
    // Cal's opening — entry where council_position contains 'open'
    const calOpenEntry = entries.find(
        (e) => e.council_position?.toLowerCase().includes('open'),
    )
    const calOpen = calOpenEntry
        ? firstSentence(calOpenEntry.content, 160)
        : `The council is reviewing: ${firstSentence(topic, 100)}`

    // Cal's closing — entry where council_position contains 'close' or 'synthesis'
    const calCloseEntry = entries.find(
        (e) =>
            e.council_position?.toLowerCase().includes('close') ||
            e.council_position?.toLowerCase().includes('synthesis'),
    )
    const calCloseText = calCloseEntry?.content ?? ''

    // Parse agreed on: look for "agrees that …" or "consensus:" or "agreed:"
    let agreedOn = ''
    const agreedMatch = calCloseText.match(
        /(?:council\s+agrees?\s+(?:that|on|:)|consensus[:\s]+|agreed[:\s]+)(.*?)(?:\.|$)/i,
    )
    if (agreedMatch) {
        agreedOn = agreedMatch[1].trim().slice(0, 90)
        if (agreedOn.length === 90) agreedOn += '…'
    } else {
        agreedOn = firstSentence(calCloseText, 90)
    }

    // Parse disagreed on: look for "disagreement" / "disagrees" / "tension"
    let disagreedOn = ''
    const disagreedMatch = calCloseText.match(
        /(?:sharpest\s+disagreement|key\s+tension|disagrees?[:\s]+|disputed[:\s]+)(.*?)(?:\.|$)/i,
    )
    if (disagreedMatch) {
        disagreedOn = disagreedMatch[1].trim().slice(0, 90)
        if (disagreedOn.length === 90) disagreedOn += '…'
    }

    // Parse this week: look for "this week" sentence
    let thisWeek = ''
    const thisWeekMatch = calCloseText.match(/this\s+week[,:\s]+(.*?)(?:\.|$)/i)
    if (thisWeekMatch) {
        thisWeek = thisWeekMatch[1].trim().slice(0, 100)
        if (thisWeek.length === 100) thisWeek += '…'
    } else {
        // Fall back to last sentence of Cal's close
        const sentences = calCloseText.match(/[^.!?]+[.!?]/g) ?? []
        if (sentences.length > 0) {
            thisWeek = sentences[sentences.length - 1].trim().slice(0, 100)
        }
    }

    // Specialist entries (non-Cal, non-open, non-close)
    const specialistEntries = entries.filter(
        (e) =>
            e.role === 'specialist' &&
            !e.council_position?.toLowerCase().includes('open') &&
            !e.council_position?.toLowerCase().includes('close') &&
            !e.council_position?.toLowerCase().includes('synthesis'),
    )

    // Deduplicate by specialist name (keep first occurrence)
    const seen = new Set<string>()
    const deduped = specialistEntries.filter((e) => {
        const key = (e.specialist_name ?? '').toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })

    // Top 5 specialists
    const topSpecialists = deduped.slice(0, 5)

    const specialists = topSpecialists.map((e, idx) => {
        const name = e.specialist_name ?? `Specialist ${idx + 1}`
        // Role label: extract from council_position or default
        const role = e.council_position
            ? e.council_position
                  .replace(/^(quick take|challenge|synthesis|open|close)[\s-–:]+/i, '')
                  .trim()
            : 'Council member'
        const take = firstSentence(e.content, 100)
        const initial = name.slice(0, 2).toUpperCase()
        const colour = CIRCLE_PALETTE[idx % CIRCLE_PALETTE.length]
        return { name, role, take, initial, colour }
    })

    return { calOpen, specialists, agreedOn, disagreedOn, thisWeek }
}

// ─── JSX layout ──────────────────────────────────────────────────────────────

interface InfographicProps {
    topic: string
    tier: string
    content: ExtractedContent
    specialistCount: number
}

function buildInfographic({ topic, tier, content, specialistCount }: InfographicProps) {
    const { calOpen, specialists, agreedOn, disagreedOn, thisWeek } = content
    const tierBadge = tierBadgeText(tier, specialistCount)

    // Truncate topic for display
    const displayTopic =
        topic.length > 160
            ? topic.slice(0, 157) + '…'
            : topic

    // Specialist card grid — up to 5 in a row
    const colCount = Math.min(specialists.length, 3)
    const colWidth = colCount === 1 ? 440 : colCount === 2 ? 640 / 2 : 420

    return (
        <div
            style={{
                width: 1600,
                height: 900,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: CREAM,
                fontFamily: 'system-ui, sans-serif',
                overflow: 'hidden',
            }}
        >
            {/* ── Header band ── */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: CHARCOAL,
                    paddingLeft: 48,
                    paddingRight: 48,
                    paddingTop: 20,
                    paddingBottom: 20,
                    borderLeft: `6px solid ${ORANGE}`,
                }}
            >
                <span
                    style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: '#e7e5e4',
                        letterSpacing: 3,
                        textTransform: 'uppercase',
                    }}
                >
                    FORGEOS · BRAINSTORMING COUNCIL
                </span>
                <span
                    style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: ORANGE,
                        letterSpacing: 2,
                        textTransform: 'uppercase',
                    }}
                >
                    {tierBadge}
                </span>
            </div>

            {/* ── Main body ── */}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    paddingLeft: 54,
                    paddingRight: 54,
                    paddingTop: 40,
                    paddingBottom: 0,
                    gap: 0,
                }}
            >
                {/* Question */}
                <div
                    style={{
                        fontSize: 38,
                        fontWeight: 700,
                        color: CHARCOAL,
                        fontFamily: 'Georgia, "Times New Roman", serif',
                        lineHeight: 1.25,
                        marginBottom: 24,
                        maxWidth: 1400,
                    }}
                >
                    {displayTopic}
                </div>

                {/* Divider */}
                <div
                    style={{
                        width: '100%',
                        height: 1,
                        backgroundColor: DIVIDER,
                        marginBottom: 22,
                    }}
                />

                {/* Cal's opening framing */}
                {calOpen && (
                    <div
                        style={{
                            fontSize: 18,
                            fontStyle: 'italic',
                            color: STONE,
                            lineHeight: 1.5,
                            marginBottom: 30,
                            paddingLeft: 20,
                            borderLeft: `3px solid ${ORANGE}`,
                            maxWidth: 1300,
                        }}
                    >
                        {calOpen}
                    </div>
                )}

                {/* Specialist cards */}
                {specialists.length > 0 && (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            gap: 16,
                            flexWrap: 'nowrap',
                            marginBottom: 28,
                        }}
                    >
                        {specialists.map((sp, idx) => (
                            <div
                                key={idx}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    backgroundColor: '#ffffff',
                                    borderRadius: 12,
                                    padding: 20,
                                    gap: 10,
                                    minWidth: 0,
                                    border: `1px solid ${DIVIDER}`,
                                }}
                            >
                                {/* Avatar initial circle + name */}
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 12,
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 20,
                                            backgroundColor: sp.colour,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#ffffff',
                                            fontSize: 14,
                                            fontWeight: 700,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {sp.initial}
                                    </div>
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 2,
                                            minWidth: 0,
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: 15,
                                                fontWeight: 700,
                                                color: CHARCOAL,
                                                borderBottom: `2px solid ${ORANGE}`,
                                                paddingBottom: 1,
                                            }}
                                        >
                                            {sp.name}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                color: STONE,
                                                textTransform: 'uppercase',
                                                letterSpacing: 1,
                                            }}
                                        >
                                            {sp.role}
                                        </span>
                                    </div>
                                </div>

                                {/* Divider */}
                                <div
                                    style={{
                                        width: '100%',
                                        height: 1,
                                        backgroundColor: DIVIDER,
                                    }}
                                />

                                {/* Take */}
                                <span
                                    style={{
                                        fontSize: 13,
                                        color: CHARCOAL,
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {sp.take}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Council split row */}
                {(agreedOn || disagreedOn) && (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            gap: 40,
                            marginBottom: 16,
                        }}
                    >
                        {agreedOn && (
                            <div
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'row',
                                    gap: 10,
                                    alignItems: 'flex-start',
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: '#22c55e',
                                        textTransform: 'uppercase',
                                        letterSpacing: 1.5,
                                        flexShrink: 0,
                                        marginTop: 2,
                                    }}
                                >
                                    AGREED ON:
                                </span>
                                <span style={{ fontSize: 13, color: CHARCOAL, lineHeight: 1.4 }}>
                                    {agreedOn}
                                </span>
                            </div>
                        )}
                        {disagreedOn && (
                            <div
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'row',
                                    gap: 10,
                                    alignItems: 'flex-start',
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: ORANGE,
                                        textTransform: 'uppercase',
                                        letterSpacing: 1.5,
                                        flexShrink: 0,
                                        marginTop: 2,
                                    }}
                                >
                                    DISPUTED:
                                </span>
                                <span style={{ fontSize: 13, color: CHARCOAL, lineHeight: 1.4 }}>
                                    {disagreedOn}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Action footer ── */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: `${ORANGE}18`,
                    borderTop: `1px solid ${ORANGE}30`,
                    paddingLeft: 54,
                    paddingRight: 54,
                    paddingTop: 14,
                    paddingBottom: 14,
                    gap: 24,
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        flex: 1,
                        minWidth: 0,
                    }}
                >
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: ORANGE,
                            textTransform: 'uppercase',
                            letterSpacing: 1.5,
                            flexShrink: 0,
                        }}
                    >
                        THIS WEEK:
                    </span>
                    {thisWeek && (
                        <span style={{ fontSize: 13, color: CHARCOAL, lineHeight: 1.3 }}>
                            {thisWeek}
                        </span>
                    )}
                </div>
                <span
                    style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: STONE,
                        flexShrink: 0,
                    }}
                >
                    ForgeOS · Fractional Forge
                </span>
            </div>
        </div>
    )
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ threadId: string }> },
): Promise<Response> {
    const { threadId } = await params

    if (!isValidUUID(threadId)) {
        return new NextResponse('Invalid thread id', { status: 400 })
    }

    // SECURITY: gate on the caller's session — they must be able to SELECT
    // the thread via RLS. If unauthenticated or the thread doesn't belong to
    // their foundry, this returns a 403.
    const userClient = await createClient()
    const {
        data: { user },
    } = await userClient.auth.getUser()

    if (!user) {
        return new NextResponse('Not authenticated', { status: 401 })
    }

    const { data: gateRow, error: gateErr } = await userClient
        .from('meeting_threads')
        .select('id')
        .eq('id', threadId)
        .single()

    if (gateErr || !gateRow) {
        return new NextResponse('Not authorised', { status: 403 })
    }

    // Admin client for the actual data reads + write-back
    const admin = createAdminClient()

    const { data: thread, error: threadErr } = await admin
        .from('meeting_threads')
        .select('id, topic, council_tier, foundry_id, author_user_id')
        .eq('id', threadId)
        .single()

    if (threadErr || !thread) {
        return new NextResponse('Thread not found', { status: 404 })
    }

    const { data: rawEntries } = await admin
        .from('meeting_entries')
        .select('specialist_name, council_position, content, role')
        .eq('thread_id', threadId)
        .eq('role', 'specialist')
        .order('created_at', { ascending: true })
        .limit(20)

    const entries: RawEntry[] = ((rawEntries ?? []) as Array<Record<string, unknown>>).map((e) => ({
        specialist_name: (e.specialist_name as string | null) ?? null,
        council_position: (e.council_position as string | null) ?? null,
        content: (e.content as string) ?? '',
        role: (e.role as string) ?? 'specialist',
    }))

    const tier = (thread as { council_tier: string }).council_tier ?? 'quick'
    const topic = (thread as { topic: string }).topic

    // Count distinct specialist names for the tier badge
    const specialistNames = new Set(
        entries
            .filter(
                (e) =>
                    !e.council_position?.toLowerCase().includes('open') &&
                    !e.council_position?.toLowerCase().includes('close'),
            )
            .map((e) => e.specialist_name)
            .filter(Boolean),
    )
    const specialistCount = specialistNames.size || entries.length

    const content = extractContent(entries, topic)

    const imageResponse = new ImageResponse(
        buildInfographic({ topic, tier, content, specialistCount }),
        { width: 1600, height: 900 },
    )

    // We need the PNG bytes for Supabase storage upload.
    // ImageResponse is a Web Response — we can clone it and get arrayBuffer.
    const pngBytes = await imageResponse.clone().arrayBuffer()
    const pngBuffer = Buffer.from(pngBytes)

    // Upload to Supabase storage
    const storagePath = `${threadId}/cover.png`
    const { error: uploadErr } = await admin.storage
        .from('brainstorm-assets')
        .upload(storagePath, pngBuffer, {
            contentType: 'image/png',
            upsert: true,
            cacheControl: '86400',
        })

    if (uploadErr) {
        console.error('[BrainstormCoverRoute] Storage upload failed:', {
            threadId,
            err: uploadErr.message,
        })
        // Return the image anyway — the storage write is best-effort; the
        // action caller will handle status updates on its own path.
    } else {
        // Update cover_image_url + cover_status='ready'
        const updatePayload: Record<string, unknown> = {
            cover_status: 'ready',
            cover_image_url: storagePath,
        }
        await admin.from('meeting_threads').update(updatePayload).eq('id', threadId)
    }

    // Return the PNG with aggressive caching — 24-hour public cache.
    // next/og returns the correct Content-Type: image/png header automatically.
    const headers = new Headers(imageResponse.headers)
    headers.set('Cache-Control', 'public, max-age=86400, immutable')

    return new Response(imageResponse.body, {
        status: 200,
        headers,
    })
}
