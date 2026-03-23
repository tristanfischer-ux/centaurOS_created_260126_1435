import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/security/rate-limit'
import { aiGuard } from '@/lib/ai/guard'

// SECURITY: Zod schema for input validation
const ForgeMatchRequestSchema = z.object({
    memberId: z.string().uuid(),
})

// Types for the API

interface AISuggestion {
    listingId: string
    title: string
    compatibilityScore: number
    reasoning: string
    useCases: string[]
}

interface ForgeMatchResponse {
    member: {
        name: string
        role: string
        skills: string[]
    }
    suggestions: AISuggestion[]
}

interface ErrorResponse {
    error: string
}

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

export async function POST(
    request: NextRequest
): Promise<NextResponse<ForgeMatchResponse | ErrorResponse>> {
    try {
        // AUTH + AI GATE: Verify user session and check AI usage limits (MUST be first)
        const supabase = await createClient()
        const guard = await aiGuard(supabase, 'forge_match')
        if (guard.denied) return guard.response as NextResponse<ErrorResponse>
        const user = { id: guard.userId }

        // SECURITY: Fail closed when OpenAI key is not configured.
        if (!process.env.OPENAI_API_KEY?.trim()) {
            console.error('[ForgeMatchAPI] OPENAI_API_KEY is not configured')
            return NextResponse.json(
                { error: 'Forge matching service is not configured' },
                { status: 503 }
            )
        }

        const openai = getOpenAIClient()
        if (!openai) {
            return NextResponse.json(
                { error: 'Forge matching service is not configured' },
                { status: 503 }
            )
        }

        // SECURITY: Rate limit AI endpoints (10 requests per minute per user)
        const rateLimitResult = await rateLimit('api', `forge-match:${user.id}`, { limit: 10, window: 60 * 1000 })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please wait before requesting more matches.' },
                { status: 429 }
            )
        }

        // SECURITY: Parse and validate request body with Zod
        const body = await request.json()
        const validation = ForgeMatchRequestSchema.safeParse(body)
        
        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid request: memberId must be a valid UUID' },
                { status: 400 }
            )
        }
        
        const { memberId } = validation.data

        // Fetch member profile and verify foundry membership
        const { data: member, error: memberError } = await supabase
            .from('profiles')
            .select('id, full_name, role, skills, capacity_score, bio, foundry_id')
            .eq('id', memberId)
            .single()

        if (memberError || !member) {
            return NextResponse.json(
                { error: 'Member not found' },
                { status: 404 }
            )
        }

        // Verify the authenticated user's foundry matches the member's foundry
        if (!guard.foundryId || guard.foundryId !== member.foundry_id) {
            return NextResponse.json(
                { error: 'Unauthorized: Member belongs to a different foundry' },
                { status: 403 }
            )
        }

        // Fetch marketplace listings for matching
        const { data: aiListings, error: listingsError } = await supabase
            .from('marketplace_listings')
            .select('id, title, description, subcategory, attributes, is_verified')

        if (listingsError) {
            console.error('Error fetching AI listings:', listingsError)
            return NextResponse.json(
                { error: 'Failed to fetch AI tools' },
                { status: 500 }
            )
        }

        if (!aiListings || aiListings.length === 0) {
            return NextResponse.json({
                member: {
                    name: member.full_name || 'Unknown',
                    role: member.role,
                    skills: member.skills || []
                },
                suggestions: []
            })
        }

        // Prepare data for GPT-5.3 analysis
        const memberProfile = {
            name: member.full_name || 'Unknown',
            role: member.role,
            skills: member.skills || [],
            workload: member.capacity_score ?? 50, // 0-100 scale, default to 50
            bio: member.bio || ''
        }

        const aiTools = aiListings.map(listing => ({
            id: listing.id,
            title: listing.title,
            description: listing.description || '',
            subcategory: listing.subcategory,
            attributes: listing.attributes,
            isVerified: listing.is_verified
        }))

        // Generate talent matching suggestions using GPT-5.3
        const systemPrompt = `You are an expert at matching humans with AI tools to form effective partnerships - human-AI teams that leverage the strengths of both.

Your task is to analyze a human team member's profile and suggest the top 3 AI tools that would best complement their skills and role.

Consider:
1. Skills gaps - AI tools that can fill in areas where the human may need support
2. Role enhancement - AI that amplifies what the human is already good at
3. Workload balance - If the human has high workload, prioritize AI that automates or assists
4. Complementary capabilities - Form a complete team where human creativity meets AI execution

Return ONLY a raw JSON array (no markdown formatting) with exactly 3 suggestions:
[
    {
        "listingId": "the-tool-id",
        "title": "Tool Name",
        "compatibilityScore": 1-10,
        "reasoning": "2-3 sentences explaining why this pairing works",
        "useCases": ["specific use case 1", "specific use case 2", "specific use case 3"]
    }
]

If there are fewer than 3 AI tools available, return suggestions for all available tools.
Score compatibility from 1-10 where 10 is a perfect match.`

        const userPrompt = `## Human Team Member Profile
Name: ${memberProfile.name}
Role: ${memberProfile.role}
Skills: ${memberProfile.skills.length > 0 ? memberProfile.skills.join(', ') : 'Not specified'}
Current Workload: ${memberProfile.workload}/100 (higher = more busy)
Bio: ${memberProfile.bio || 'Not provided'}

## Available AI Tools
${JSON.stringify(aiTools, null, 2)}

Please suggest the top 3 AI tools that would form the best partnership with this human.`

        const completion = await openai.chat.completions.create({
            model: 'gpt-5.3-chat-latest',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
        })

        guard.trackUsage({
            model: 'gpt-5.3-chat-latest',
            promptTokens: completion.usage?.prompt_tokens,
            completionTokens: completion.usage?.completion_tokens,
        }).catch(() => {})

        const content = completion.choices[0]?.message?.content
        if (!content) {
            return NextResponse.json(
                { error: 'AI returned no response' },
                { status: 500 }
            )
        }

        // Parse the AI response
        const cleanedContent = content.replace(/```json/g, '').replace(/```/g, '').trim()
        
        let suggestions: AISuggestion[]
        try {
            const parsed = JSON.parse(cleanedContent)
            
            // Validate and type the response
            suggestions = Array.isArray(parsed) 
                ? parsed.map((s: Record<string, unknown>) => ({
                    listingId: String(s.listingId || ''),
                    title: String(s.title || ''),
                    compatibilityScore: Math.min(10, Math.max(1, Number(s.compatibilityScore) || 5)),
                    reasoning: String(s.reasoning || ''),
                    useCases: Array.isArray(s.useCases) 
                        ? s.useCases.map((u: unknown) => String(u))
                        : []
                }))
                : []
            
            // Filter to only include valid listing IDs
            const validListingIds = new Set(aiListings.map(l => l.id))
            suggestions = suggestions.filter(s => validListingIds.has(s.listingId))
            
        } catch (parseError) {
            console.error('Failed to parse AI response:', parseError)
            return NextResponse.json(
                { error: 'Failed to parse AI matching response' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            member: {
                name: memberProfile.name,
                role: memberProfile.role,
                skills: memberProfile.skills
            },
            suggestions
        })

    } catch (error) {
        console.error('Forge matching failed:', error)
        return NextResponse.json(
            { error: 'Failed to generate talent matches' },
            { status: 500 }
        )
    }
}
