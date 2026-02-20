"use server"

import { withAuth } from '@/lib/server-action-utils'
import { checkRateLimit } from '@/lib/security/rate-limit'
import type { BusinessPlanAnalysis } from '@/lib/business-plan-types'

// DECISION: Using Claude Opus 4.6 instead of GPT-4o for business plan analysis.
// Claude excels at strategic reasoning, structured output, and understanding
// nuanced business context — exactly what's needed for deriving objectives,
// hiring timelines, and funding requirements from a business plan.
const MODEL_ID = 'claude-opus-4-6'

// INTENT: Single comprehensive prompt that extracts all five output streams
// in one AI call. This avoids multiple round-trips and keeps the analysis
// internally consistent (hiring dates derive from objective dates, funding
// amounts reference the same capacity needs, etc.).
const SYSTEM_PROMPT = `You are an expert business consultant, strategic planner, and operations advisor.

Analyze the provided business plan and extract ALL of the following in a single JSON response:

1. **Strategic Objectives** — The key pillars or goals of the plan. For each objective:
   - Break it into 3-5 concrete, actionable tasks
   - Assign a role to each task: Executive (decisions/hiring/strategy), Apprentice (research/setup/calls), AI_Agent (data/coding/analysis)
   - Estimate a suggestedStartDate and suggestedEndDate (ISO format, e.g. "2026-04-01") if timing is mentioned or can be inferred
   - Include the business phase this belongs to (e.g. "Launch", "Scale", "Consolidate")

2. **Hiring Requirements** — Who the business needs to hire to execute the plan:
   - roleTitle: the specific role (e.g. "Head of Manufacturing Operations", "Fractional CFO", "Sales Apprentice")
   - roleType: "full_time", "fractional", or "apprentice"
   - reason: why this role is needed (link to plan goals)
   - linkedObjectiveTitle: which objective requires this hire
   - suggestedDate: when they should start (ISO date, derive from the linked objective's start date minus 6 weeks)
   - phase: the business phase

3. **Capacity Requirements** — Manufacturing, production, or operational capacity needs:
   - description: what capacity is needed
   - linkedObjectiveTitle: which objective drives this need
   - requiredByDate: when it's needed (ISO date if inferable)
   - notes: any specific equipment, space, certifications, or process requirements

4. **Funding Requirements** — Specific funding events the business needs:
   - title: short label (e.g. "Seed Round", "Equipment Purchase", "Working Capital Facility")
   - amountUsd: estimated amount in USD (integer, omit if unknown)
   - reason: what the money is for
   - neededByDate: when (ISO date if inferable)
   - fundingType: one of: bootstrapping, angel, vc, grant, revenue_based, debt, other
   - linkedObjectiveTitles: array of objective titles that depend on this funding

5. **executiveSummary**: A 2-3 sentence plain-language summary of the business plan.

Return ONLY a raw JSON object with this exact structure (no markdown, no code fences):
{
  "objectives": [...],
  "hiringRequirements": [...],
  "capacityRequirements": [...],
  "fundingRequirements": [...],
  "executiveSummary": "..."
}`

/**
 * @description Analyzes a business plan document using Claude Opus 4.6 and extracts
 * strategic objectives, hiring requirements, capacity needs, and funding milestones.
 * @param formData - FormData containing either a 'file' (PDF/DOCX/TXT) or 'text' field
 * @returns The full analysis or an error message
 * @security Rate-limited per user to prevent AI cost abuse
 */
export async function analyzeBusinessPlan(
  formData: FormData
): Promise<{ analysis?: BusinessPlanAnalysis; error?: string }> {
  return withAuth(async ({ user }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return { error: 'AI analysis service is not configured' }

    // SECURITY: Rate limit AI calls to prevent cost abuse
    const rateLimitError = await checkRateLimit('aiAnalysis', `ai:${user.id}`)
    if (rateLimitError) return { error: rateLimitError }

    try {
      const file = formData.get('file') as File | null
      const textInput = formData.get('text') as string | null

      if (!file && !textInput) return { error: 'No file or text provided' }

      let text = ''

      if (file) {
        if (file.type === 'application/pdf') {
          const buffer = Buffer.from(await file.arrayBuffer())
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfParse = require('pdf-parse')
          const data = await pdfParse(buffer)
          text = data.text
        } else {
          text = await file.text()
        }
      } else if (textInput) {
        text = textInput
      }

      if (!text || text.length < 50) {
        return { error: 'Could not extract enough text from the file.' }
      }

      const truncatedText = text.slice(0, 100000)

      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey })

      const message = await client.messages.create({
        model: MODEL_ID,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Analyze the following business plan:\n\n${truncatedText}` },
        ],
      })

      const textBlock = message.content.find(block => block.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        return { error: 'AI returned no text content' }
      }

      try {
        const analysis = JSON.parse(textBlock.text) as BusinessPlanAnalysis
        return { analysis }
      } catch (parseError) {
        console.error('[analyze] Failed to parse AI JSON response:', parseError)
        return { error: 'Failed to parse AI response' }
      }
    } catch (error) {
      console.error('[analyze] Business plan analysis failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return { error: 'Failed to analyze document. Please ensure it is a valid PDF or text file.' }
    }
  })
}
