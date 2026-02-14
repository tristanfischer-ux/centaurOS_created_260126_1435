/**
 * @file route.ts
 *
 * @description Specialist Council API - orchestrates autonomous specialist debates
 * with Chief of Staff synthesis.
 *
 * POST /api/agents/council
 * Body: { topic: string, context?: string }
 *
 * Returns: { debate: DebateEntry[], report: CouncilReport }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { rateLimit } from '@/lib/security/rate-limit'
import { SPECIALISTS } from '@/app/(platform)/agents/specialists-data'
import { synthesizeCouncilDebate, type DebateTranscriptEntry } from '@/lib/agents/sweep-synthesis'
import { getOrCreateSpecialistThread } from '@/actions/agent-memory'

// Model configuration
const PROVIDER_ID = 'anthropic'
const MODEL_ID = 'claude-sonnet-4-20250514'

// Debate rounds
const DEBATE_ROUNDS = 3

// DECISION_SUPPORT_MAP - which specialists to involve based on topic keywords
const TOPIC_KEYWORD_MAP: Record<string, string[]> = {
    // Strategy & Vision
    strategy: ['strategist', 'chief-of-staff', 'product-lead'],
    vision: ['strategist', 'chief-of-staff'],
    roadmap: ['strategist', 'product-lead', 'cto'],
    'go-to-market': ['strategist', 'growth-marketer', 'sales-lead'],
    'market entry': ['strategist', 'growth-marketer', 'sales-lead'],

    // Finance
    budget: ['finance-lead', 'chief-of-staff', 'strategist'],
    fundraising: ['fundraising-advisor', 'finance-lead', 'strategist'],
    pricing: ['finance-lead', 'product-lead', 'strategist'],
    burn: ['finance-lead', 'fundraising-advisor'],
    revenue: ['finance-lead', 'sales-lead', 'growth-marketer'],

    // Product & Engineering
    product: ['product-lead', 'cto', 'strategist'],
    engineering: ['cto', 'vp-engineering', 'chief-of-staff'],
    launch: ['product-lead', 'growth-marketer', 'sales-lead'],
    mvp: ['product-lead', 'cto', 'vp-engineering'],
    feature: ['product-lead', 'vp-engineering', 'cto'],

    // Growth & Sales
    growth: ['growth-marketer', 'strategist', 'sales-lead'],
    sales: ['sales-lead', 'growth-marketer', 'strategist'],
    marketing: ['growth-marketer', 'strategist'],
    customer: ['sales-lead', 'product-lead', 'chief-of-staff'],

    // Operations
    hiring: ['hiring-team', 'chief-of-staff', 'strategist'],
    team: ['hiring-team', 'chief-of-staff'],
    process: ['chief-of-staff', 'cto'],
    operations: ['chief-of-staff', 'cto', 'finance-lead'],

    // Legal & Compliance
    legal: ['legal-counsel', 'chief-of-staff', 'finance-lead'],
    compliance: ['legal-counsel', 'finance-lead', 'chief-of-staff'],
    contract: ['legal-counsel', 'finance-lead'],

    // Manufacturing & Supply Chain
    manufacturing: ['vp-manufacturing', 'cto', 'vp-supply-chain'],
    supply: ['vp-supply-chain', 'vp-manufacturing', 'finance-lead'],
}

/**
 * Selects relevant specialists based on topic keywords
 */
function selectSpecialistsForTopic(topic: string): typeof SPECIALISTS {
    const topicLower = topic.toLowerCase()
    const selectedIds = new Set<string>(['chief-of-staff']) // Always include Cal

    // Find matching keywords
    for (const [keyword, specialistIds] of Object.entries(TOPIC_KEYWORD_MAP)) {
        if (topicLower.includes(keyword)) {
            specialistIds.forEach(id => selectedIds.add(id))
        }
    }

    // Fallback: if no matches, use a diverse set
    if (selectedIds.size === 1) {
        selectedIds.add('strategist')
        selectedIds.add('finance-lead')
        selectedIds.add('product-lead')
    }

    // Return specialist objects
    return SPECIALISTS.filter(s => selectedIds.has(s.id))
}

/**
 * Builds the debate prompt for a specialist
 */
function buildDebatePrompt(
    specialist: typeof SPECIALISTS[0],
    topic: string,
    allResponses: DebateTranscriptEntry[],
    debateRound: number
): string {
    const priorBlock = allResponses
        .map(r => `**${r.specialistName}** (Round ${r.round}):\n${r.content}`)
        .join('\n\n---\n\n')

    return `You are the ${specialist.name} in an active specialist council debate.

## Your Role
${specialist.description}

## Working Style
${specialist.workingStyle}

## Council Topic
"${topic}"

## Discussion So Far
${priorBlock || '(No prior responses yet)'}

## Your Task (Debate Round ${debateRound})
The founder is NOT participating — this is an autonomous debate between specialists.
Your job is to debate with your fellow specialists and reach clarity.

You MUST:
- **Directly address at least one other specialist by name** ("I agree with the Finance Lead's point...")
- **Challenge or build on specific points** — don't repeat what others said
- **Propose concrete recommendations** — a decision, next step, or framework
- **Ask direct questions** to other specialists when you need their expertise
- **Be opinionated** — the founder wants real debate, not polite consensus

If you disagree, say so clearly. The founder needs to see tensions, not just agreements.

Keep it punchy. Under 300 words. Use markdown. Be direct.
`
}

/**
 * Executes a specialist and returns their response
 */
async function executeSpecialist(
    specialist: typeof SPECIALISTS[0],
    threadId: string | undefined,
    prompt: string,
    input: string,
    cookieHeader: string | null
): Promise<string> {
    const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL ||
        (typeof process.env.VERCEL_URL === 'string'
            ? `https://${process.env.VERCEL_URL}`
            : 'http://localhost:3000')
    const url = `${baseUrl}/api/agents/execute`

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (cookieHeader) headers['Cookie'] = cookieHeader

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            prompt,
            input,
            providerId: PROVIDER_ID,
            modelId: MODEL_ID,
            modality: 'text',
            threadId: threadId ?? undefined,
            specialistId: specialist.id,
            customSystemPromptSuffix: `\n\n## Specialist Council Context\nYou are participating in an autonomous specialist council debate. Topic: "${input}"`,
        }),
    })

    if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Execution failed' }))
        throw new Error(errData.error || `HTTP ${res.status}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    let fullResponse = ''
    const decoder = new TextDecoder()

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        // SSE format: "data: {...}\n\n"
        const lines = chunk.split('\n')
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6)) as { text?: string }
                    if (data.text) {
                        fullResponse += data.text
                    }
                } catch {
                    // Skip invalid JSON
                }
            }
        }
    }

    return fullResponse
}

export async function POST(request: NextRequest) {
    try {
        // Authenticate
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Rate limit — council triggers 12+ LLM calls per request
        const rateLimitResult = await rateLimit('api', `council:${user.id}`, {
            limit: 5,
            window: 3600,
        })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: rateLimitResult.error || 'Rate limit exceeded' },
                { status: 429 }
            )
        }

        // Get user's foundry (standard pattern: profiles.active_foundry_id / foundry_id)
        const foundryId = await getFoundryIdCached()
        if (!foundryId) {
            return NextResponse.json({ error: 'No foundry found' }, { status: 404 })
        }

        // Parse request
        const body = await request.json()
        const { topic } = body

        // Context reserved for future use (e.g., background info for specialists)

        if (!topic || typeof topic !== 'string') {
            return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
        }

        // Select relevant specialists based on topic
        const selectedSpecialists = selectSpecialistsForTopic(topic)
        console.info(`[Council] Selected ${selectedSpecialists.length} specialists for topic: ${topic}`)

        // Get or create memory threads for each specialist
        const threadIds: Record<string, string> = {}
        for (const specialist of selectedSpecialists) {
            const { threadId } = await getOrCreateSpecialistThread(specialist.id)
            if (threadId) {
                threadIds[specialist.id] = threadId
            }
        }

        const cookieHeader = request.headers.get('cookie')

        // Run debate rounds
        const debateEntries: DebateTranscriptEntry[] = []

        for (let round = 1; round <= DEBATE_ROUNDS; round++) {
            console.info(`[Council] Running round ${round}/${DEBATE_ROUNDS}`)

            for (const specialist of selectedSpecialists) {
                try {
                    const prompt = buildDebatePrompt(
                        specialist,
                        topic,
                        debateEntries,
                        round
                    )

                    const response = await executeSpecialist(
                        specialist,
                        threadIds[specialist.id],
                        prompt,
                        topic,
                        cookieHeader
                    )

                    debateEntries.push({
                        specialistId: specialist.id,
                        specialistName: specialist.name,
                        specialistTitle: specialist.title,
                        round,
                        content: response,
                    })
                } catch (err) {
                    const message = err instanceof Error ? err.message : 'Unknown error'
                    console.error(`[Council] ${specialist.name} failed:`, message)

                    debateEntries.push({
                        specialistId: specialist.id,
                        specialistName: specialist.name,
                        specialistTitle: specialist.title,
                        round,
                        content: `*[Error: Could not generate response]*`,
                    })
                }
            }
        }

        // Have Chief of Staff synthesize the debate
        console.info(`[Council] Synthesizing debate with ${debateEntries.length} entries`)
        const report = await synthesizeCouncilDebate(topic, debateEntries)

        return NextResponse.json({
            topic,
            specialists: selectedSpecialists.map(s => ({ id: s.id, name: s.name, title: s.title })),
            debate: debateEntries,
            report,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('[Council] Error:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
