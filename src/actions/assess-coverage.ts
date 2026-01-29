"use server"

import OpenAI from 'openai'
import { 
    GapAssessmentInput, 
    GapAssessmentResult, 
    CoverageStatus,
    GapPriority,
    CoverageType,
    BusinessFunctionCategory,
    DEFAULT_BUSINESS_FUNCTIONS 
} from '@/types/org-blueprint'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
})

/**
 * Analyzes a foundry's business context and suggests coverage status for each business function.
 * Uses AI to determine which functions are likely critical, optional, or not needed based on
 * the business description, industry, stage, and team size.
 */
export async function assessCoverage(
    input: GapAssessmentInput
): Promise<{ result?: GapAssessmentResult; error?: string }> {
    try {
        if (!input.foundry_description || input.foundry_description.trim().length < 20) {
            return { error: 'Please provide a more detailed business description (at least 20 characters)' }
        }

        const functionsList = DEFAULT_BUSINESS_FUNCTIONS.map(f => ({
            id: f.id,
            name: f.name,
            category: f.category,
            description: f.description,
            typicallyEarlyStage: f.typicallyEarlyStage
        }))

        const systemPrompt = `You are an expert business operations consultant specializing in early-stage startups and fractional businesses.

Your task is to analyze a business context and determine which business functions are:
- Critical and need coverage immediately
- Important but can be partially covered or delayed
- Not relevant for this type of business

You will be given:
1. A business description
2. Optional context: industry, company stage, team size
3. A list of standard business functions

For each function, assess:
1. Whether it's needed: 'covered' (critical), 'partial' (important but flexible), 'gap' (needed but likely missing), 'not_needed'
2. Priority if it's a gap: 'critical', 'high', 'medium', 'low'
3. What type of coverage would work best: 'founder', 'internal_team', 'fractional', 'agency', 'ai_tool', 'outsourced', 'marketplace'
4. Marketplace search terms if they should look for providers

Be pragmatic - early-stage startups don't need everything. Focus on what's actually essential for their specific situation.

Return ONLY a raw JSON object (no markdown) with this structure:
{
    "assessed_functions": [
        {
            "function_id": "string",
            "function_name": "string",
            "category": "string",
            "suggested_status": "covered" | "partial" | "gap" | "not_needed",
            "reasoning": "string (1-2 sentences)",
            "priority_if_gap": "critical" | "high" | "medium" | "low",
            "suggested_coverage_types": ["string"],
            "marketplace_search_terms": ["string"] (optional)
        }
    ],
    "overall_coverage_score": number (0-100, rough estimate of current coverage),
    "critical_gaps": ["string"] (function names that need immediate attention),
    "recommendations": ["string"] (3-5 actionable recommendations)
}`

        const userPrompt = `Analyze this business and suggest coverage status for each function:

Business Description:
${input.foundry_description}

${input.industry ? `Industry: ${input.industry}` : ''}
${input.stage ? `Company Stage: ${input.stage}` : ''}
${input.team_size ? `Team Size: ${input.team_size} people` : ''}

${input.current_coverage ? `Current Coverage (user-reported):
${Object.entries(input.current_coverage).map(([id, status]) => `- ${id}: ${status}`).join('\n')}` : ''}

Business Functions to Assess:
${JSON.stringify(functionsList, null, 2)}`

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
        })

        if (!completion.choices || completion.choices.length === 0) {
            return { error: 'AI returned no response' }
        }

        const content = completion.choices[0].message.content
        if (!content) {
            return { error: 'AI returned empty content' }
        }

        // Clean up potential markdown formatting
        const cleanedContent = content.replace(/```json/g, '').replace(/```/g, '').trim()

        try {
            const parsed = JSON.parse(cleanedContent)
            
            // Validate and type the response
            const result: GapAssessmentResult = {
                assessed_functions: (parsed.assessed_functions || []).map((f: Record<string, unknown>) => ({
                    function_id: String(f.function_id || ''),
                    function_name: String(f.function_name || ''),
                    category: String(f.category || 'Operations') as BusinessFunctionCategory,
                    suggested_status: validateStatus(f.suggested_status as string),
                    reasoning: String(f.reasoning || ''),
                    priority_if_gap: validatePriority(f.priority_if_gap as string),
                    suggested_coverage_types: Array.isArray(f.suggested_coverage_types) 
                        ? f.suggested_coverage_types.map((t: unknown) => validateCoverageType(String(t)))
                        : ['founder'],
                    marketplace_search_terms: Array.isArray(f.marketplace_search_terms)
                        ? f.marketplace_search_terms.map((t: unknown) => String(t))
                        : undefined
                })),
                overall_coverage_score: Math.min(100, Math.max(0, Number(parsed.overall_coverage_score) || 50)),
                critical_gaps: Array.isArray(parsed.critical_gaps) 
                    ? parsed.critical_gaps.map((g: unknown) => String(g))
                    : [],
                recommendations: Array.isArray(parsed.recommendations)
                    ? parsed.recommendations.map((r: unknown) => String(r))
                    : []
            }

            return { result }
        } catch (parseError) {
            console.error('Failed to parse AI response:', parseError)
            return { error: 'Failed to parse AI assessment. Please try again.' }
        }

    } catch (error) {
        console.error('Coverage assessment failed:', error)
        return { error: 'Failed to assess coverage. Please try again.' }
    }
}

// Helper to validate coverage status
function validateStatus(status: string): CoverageStatus {
    const valid: CoverageStatus[] = ['covered', 'partial', 'gap', 'not_needed']
    return valid.includes(status as CoverageStatus) ? status as CoverageStatus : 'gap'
}

// Helper to validate gap priority
function validatePriority(priority: string): GapPriority {
    const valid: GapPriority[] = ['critical', 'high', 'medium', 'low']
    return valid.includes(priority as GapPriority) ? priority as GapPriority : 'medium'
}

// Helper to validate coverage type
function validateCoverageType(type: string): CoverageType {
    const valid: CoverageType[] = ['internal_team', 'fractional', 'agency', 'ai_tool', 'founder', 'outsourced', 'marketplace']
    return valid.includes(type as CoverageType) ? type as CoverageType : 'founder'
}

/**
 * Quick assessment for a single function - useful for updating individual items
 */
export async function assessSingleFunction(
    functionName: string,
    functionCategory: string,
    foundryContext: string
): Promise<{ suggestion?: { status: CoverageStatus; priority: GapPriority; reasoning: string }; error?: string }> {
    try {
        const systemPrompt = `You are a business operations advisor. Given a business context and a specific function, determine if that function is:
- 'covered': Essential and the founder is likely handling it
- 'partial': Needed but can be done part-time or shared
- 'gap': Needed but likely not covered properly
- 'not_needed': Not relevant for this business

Return JSON only: { "status": "...", "priority": "critical|high|medium|low", "reasoning": "..." }`

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Business: ${foundryContext}\n\nFunction: ${functionName} (${functionCategory})` }
            ],
            temperature: 0.5,
        })

        const content = completion.choices[0]?.message?.content
        if (!content) {
            return { error: 'No response from AI' }
        }

        const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(cleaned)

        return {
            suggestion: {
                status: validateStatus(parsed.status),
                priority: validatePriority(parsed.priority),
                reasoning: String(parsed.reasoning || '')
            }
        }
    } catch (error) {
        console.error('Single function assessment failed:', error)
        return { error: 'Assessment failed' }
    }
}
