import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/security/rate-limit"
import { aiGuard } from "@/lib/ai/guard"

/**
 * @file talent-match/route.ts
 *
 * @description AI-powered talent matching endpoint. Takes a natural language
 * query and a set of People listings, then uses GPT-4o to score each listing
 * against the user's requirements. Returns scored matches with per-listing
 * reasoning and highlighted skills.
 *
 * @security Rate limited to 5 requests/minute per user. Requires auth via aiGuard.
 * @audit Tracks AI usage via aiGuard.trackUsage.
 */

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
        return null
    }

    if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey })
    }

    return openaiClient
}

interface ListingSummary {
    id: string
    title: string
    description: string
    subcategory: string
    attributes: Record<string, unknown>
    is_verified: boolean
    trustData: {
        averageRating: number | null
        totalReviews: number
        totalTransactions: number
        badges: string[]
        trustedByCount: number
    }
}

interface MatchResult {
    id: string
    score: number
    reasons: string[]
    highlightedSkills: string[]
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        // SECURITY: Fail closed when OpenAI key is not configured.
        if (!process.env.OPENAI_API_KEY?.trim()) {
            console.error('[TalentMatchAPI] OPENAI_API_KEY is not configured')
            return NextResponse.json(
                { success: false, error: 'Talent matching service is not configured' },
                { status: 503 }
            )
        }

        const openai = getOpenAIClient()
        if (!openai) {
            return NextResponse.json(
                { success: false, error: 'Talent matching service is not configured' },
                { status: 503 }
            )
        }

        // AUTH + AI LIMIT: Check subscription tier AI limits
        const supabase = await createClient()
        const guard = await aiGuard(supabase, 'talent_match')
        if (guard.denied) return guard.response

        // SECURITY: Rate limit (5 requests per minute per user)
        const rateLimitResult = await rateLimit('api', `talent-match:${guard.userId}`, { limit: 5, window: 60 * 1000 })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { success: false, error: "Rate limit exceeded. Please wait before searching again." },
                { status: 429 }
            )
        }

        const body = await req.json()
        const { query, listings } = body as { query: string; listings: ListingSummary[] }

        // VALIDATION: Check inputs
        if (!query || typeof query !== 'string' || query.length < 3) {
            return NextResponse.json({ success: false, error: "Invalid query" }, { status: 400 })
        }
        if (!listings || !Array.isArray(listings) || listings.length === 0) {
            return NextResponse.json({ success: false, error: "No listings provided" }, { status: 400 })
        }

        // Build condensed listing summaries for the AI prompt
        const listingSummaries = listings.slice(0, 50).map((l) => {
            const attrs = l.attributes || {}
            return {
                id: l.id,
                name: l.title,
                role: attrs.role || l.subcategory,
                skills: attrs.skills || attrs.expertise || [],
                industries: attrs.industries || [],
                experience: attrs.years_experience || 'unknown',
                location: attrs.location || 'unknown',
                rate: attrs.rate || attrs.day_rate || 'not specified',
                verified: l.is_verified,
                rating: l.trustData?.averageRating || null,
                reviews: l.trustData?.totalReviews || 0,
                trustedBy: l.trustData?.trustedByCount || 0,
                previousCompanies: attrs.previous_companies || [],
                education: attrs.education || null,
            }
        })

        // Call OpenAI for matching and scoring
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are a talent matching assistant for ForgeOS, a platform for hardware startups.

Your task: Given a user's description of who they need, score each candidate on a 0-100 scale based on how well they match.

SCORING CRITERIA:
- Skills match (0-40): Do their skills align with what's needed?
- Experience match (0-25): Do they have the right level/type of experience?
- Industry fit (0-15): Do their industries overlap?
- Trust signals (0-10): Are they verified? Well-reviewed? Trusted by other foundries?
- Availability/location (0-10): Do they match location/availability needs?

RULES:
- Be generous but honest. A 70+ score means "strong match."
- Only return candidates scoring 40+.
- For each match, give 1-3 concise reasons why they're a good fit.
- Highlight which of their skills are most relevant.
- Return results sorted by score (highest first).
- Maximum 5 results.

Return ONLY valid JSON in this format:
{
  "matches": [
    {
      "id": "listing-id",
      "score": 85,
      "reasons": ["15 years in aerospace hardware", "Scaled teams from 5 to 50"],
      "highlightedSkills": ["Systems Architecture", "Team Leadership"]
    }
  ],
  "explanation": "Brief summary of what you looked for and what you found"
}`
                },
                {
                    role: "user",
                    content: `QUERY: "${query}"

AVAILABLE CANDIDATES:
${JSON.stringify(listingSummaries, null, 1)}`
                }
            ],
            temperature: 0.3,
            max_tokens: 2000,
            response_format: { type: "json_object" },
        })

        // AUDIT: Track AI usage
        await guard.trackUsage({
            model: 'gpt-4o',
            promptTokens: completion.usage?.prompt_tokens || 1200,
            completionTokens: completion.usage?.completion_tokens || 500,
        })

        const content = completion.choices[0]?.message?.content
        if (!content) {
            return NextResponse.json({ success: false, error: "No response from AI" }, { status: 500 })
        }

        const parsed = JSON.parse(content) as {
            matches: MatchResult[]
            explanation: string
        }

        // FLOW: Fire-and-forget notifications for high-scoring executives.
        // Don't block the response — notify in the background.
        const highScoreMatches = (parsed.matches || []).filter(m => m.score >= 70)
        if (highScoreMatches.length > 0) {
            notifyHighScoreMatches(guard.userId, query, highScoreMatches).catch(e => {
                console.warn('[TalentMatch] Background notification failed:', e)
            })
        }

        return NextResponse.json({
            success: true,
            matches: parsed.matches || [],
            explanation: parsed.explanation || '',
        })

    } catch (error) {
        console.error("[TalentMatch] Error:", error)

        if (error instanceof OpenAI.APIError) {
            if (error.status === 429) {
                return NextResponse.json(
                    { success: false, error: "AI rate limit exceeded. Please try again later." },
                    { status: 429 }
                )
            }
        }

        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        )
    }
}

/**
 * Fire-and-forget: notify executives who scored 70+ in a talent search.
 * Deduplication: max 5 talent_search alerts per executive per 24 hours.
 * Skips if the searcher is the executive themselves.
 */
async function notifyHighScoreMatches(
    searcherUserId: string,
    query: string,
    matches: MatchResult[]
): Promise<void> {
    const { createMatchAlert, canCreateAlert } = await import('@/lib/notifications/match-alert-helpers')

    // SECURITY: Use admin client for system-level lookups (H-5).
    // The user's scoped client may not have access to all listings/providers.
    const adminSupabase = createAdminClient()

    // Resolve listing IDs → user IDs via marketplace_listings → provider_profiles
    const listingIds = matches.map(m => m.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: listings } = await (adminSupabase as any)
        .from('marketplace_listings')
        .select('id, created_by_provider_id')
        .in('id', listingIds)

    if (!listings || listings.length === 0) return

    // Get user_ids from provider_profiles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const providerIds = (listings as any[]).map((l: any) => l.created_by_provider_id).filter(Boolean)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: providers } = await (adminSupabase as any)
        .from('provider_profiles')
        .select('id, user_id')
        .in('id', providerIds)

    if (!providers || providers.length === 0) return

    const providerToUser = new Map<string, string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of providers as any[]) {
        providerToUser.set(p.id, p.user_id)
    }

    const listingToUser = new Map<string, string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const l of listings as any[]) {
        const userId = providerToUser.get(l.created_by_provider_id)
        if (userId) listingToUser.set(l.id, userId)
    }

    for (const match of matches) {
        try {
            const expertUserId = listingToUser.get(match.id)
            if (!expertUserId) continue
            // Don't notify the searcher about themselves
            if (expertUserId === searcherUserId) continue

            const allowed = await canCreateAlert(expertUserId, 'talent_search', 5)
            if (!allowed) continue

            // SECURITY: Don't leak the founder's search query or match reasons to the
            // executive — reasons reveal search criteria (H-4).
            await createMatchAlert(
                expertUserId,
                'talent_search',
                'You appeared in a talent search',
                'A founder searched for talent and your profile was a strong match.',
                match.id,
                { score: match.score }
            )
        } catch (e) {
            // M-7: Per-match resilience — one failure doesn't block others
            console.warn(`[notifyHighScoreMatches] Failed for match ${match.id}:`, e)
        }
    }
}
