import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { createClient } from "@/lib/supabase/server"
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

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
})

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
        if (!process.env.OPENAI_API_KEY) {
            console.error('[TalentMatchAPI] OPENAI_API_KEY is not configured')
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
