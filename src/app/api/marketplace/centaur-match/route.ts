import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import OpenAI from 'openai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database.types'
import { rateLimit, getClientIP } from '@/lib/security/rate-limit'

// SECURITY: Zod schema for input validation
const CentaurMatchRequestSchema = z.object({
    memberId: z.string().uuid(),
})

// Types for the API
type Profile = Database['public']['Tables']['profiles']['Row']
type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row']

interface CentaurMatchRequest {
    memberId: string
}

interface AISuggestion {
    listingId: string
    title: string
    compatibilityScore: number
    reasoning: string
    useCases: string[]
}

interface CentaurMatchResponse {
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

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
})

export async function POST(
    request: NextRequest
): Promise<NextResponse<CentaurMatchResponse | ErrorResponse>> {
    try {
        // Create Supabase client and authenticate
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // SECURITY: Rate limit AI endpoints (10 requests per minute per user)
        const headersList = await headers()
        const clientIP = getClientIP(headersList)
        const rateLimitResult = await rateLimit('api', `centaur-match:${user.id}`, { limit: 10, window: 60 })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please wait before requesting more matches.' },
                { status: 429 }
            )
        }

        // SECURITY: Parse and validate request body with Zod
        const body = await request.json()
        const validation = CentaurMatchRequestSchema.safeParse(body)
        
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
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', user.id)
            .single()

        if (!userProfile || userProfile.foundry_id !== member.foundry_id) {
            return NextResponse.json(
                { error: 'Unauthorized: Member belongs to a different foundry' },
                { status: 403 }
            )
        }

        // Fetch AI listings from marketplace
        const { data: aiListings, error: listingsError } = await supabase
            .from('marketplace_listings')
            .select('id, title, description, subcategory, attributes, is_verified')
            .eq('category', 'AI')

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

        // Prepare data for GPT-4o analysis
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

        // Generate centaur matching suggestions using GPT-4o
        const systemPrompt = `You are an expert at matching humans with AI tools to form effective "centaur" partnerships - human-AI teams that leverage the strengths of both.

Your task is to analyze a human team member's profile and suggest the top 3 AI tools that would best complement their skills and role.

Consider:
1. Skills gaps - AI tools that can fill in areas where the human may need support
2. Role enhancement - AI that amplifies what the human is already good at
3. Workload balance - If the human has high workload, prioritize AI that automates or assists
4. Complementary capabilities - Form a "complete centaur" where human creativity meets AI execution

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
Score compatibility from 1-10 where 10 is a perfect centaur match.`

        const userPrompt = `## Human Team Member Profile
Name: ${memberProfile.name}
Role: ${memberProfile.role}
Skills: ${memberProfile.skills.length > 0 ? memberProfile.skills.join(', ') : 'Not specified'}
Current Workload: ${memberProfile.workload}/100 (higher = more busy)
Bio: ${memberProfile.bio || 'Not provided'}

## Available AI Tools
${JSON.stringify(aiTools, null, 2)}

Please suggest the top 3 AI tools that would form the best centaur partnership with this human.`

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
        })

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
        console.error('Centaur matching failed:', error)
        return NextResponse.json(
            { error: 'Failed to generate centaur matches' },
            { status: 500 }
        )
    }
}
