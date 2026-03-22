"use server"

import { withAIGate } from '@/lib/ai/with-ai-gate'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { z } from 'zod'
import {
  businessPlanAnalysisSchema,
  analyzedObjectiveSchema,
  hiringRequirementSchema,
  capacityRequirementSchema,
  fundingRequirementSchema,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_FILE_TYPES,
} from '@/lib/business-plan-types'
import type { BusinessPlanAnalysis } from '@/lib/business-plan-types'

// DECISION: Using Sonnet for parallel section extraction. Each section is
// straightforward extraction (not creative reasoning), so Sonnet is faster
// and cheaper. Opus was needed for the monolithic call because it had to
// maintain coherence across all 5 sections simultaneously.
const SECTION_MODEL = 'claude-sonnet-4-6'
const SECTION_MAX_TOKENS = 2048

// ─── Section-Specific Prompts ─────────────────────────────────────────

const OBJECTIVES_PROMPT = `You are an expert business consultant. Extract strategic objectives from the business plan.

For each objective:
- title: the goal name
- description: what it entails
- phase: business phase (e.g. "Launch", "Scale", "Consolidate")
- suggestedStartDate, suggestedEndDate: ISO dates if timing is mentioned or inferable
- tasks: 3-5 concrete, actionable tasks. Each task has:
  - title, description
  - role: "Executive" (decisions/hiring/strategy), "Apprentice" (research/setup/calls), or "AI_Agent" (data/coding/analysis)
  - estimatedDays (optional)

Return ONLY a raw JSON array (no markdown, no code fences):
[{ "title": "...", "description": "...", "phase": "...", "suggestedStartDate": "...", "suggestedEndDate": "...", "tasks": [...] }]`

const HIRING_PROMPT = `You are an expert HR and operations advisor. Extract hiring requirements from the business plan.

For each role:
- roleTitle: specific role (e.g. "Head of Manufacturing Operations", "Fractional CFO")
- roleType: "full_time", "fractional", or "apprentice"
- reason: why this role is needed
- linkedObjectiveTitle: which objective requires this hire
- suggestedDate: when they should start (ISO date, derive from linked objective start minus 6 weeks)
- phase: business phase

Return ONLY a raw JSON array (no markdown, no code fences):
[{ "roleTitle": "...", "roleType": "...", "reason": "...", "linkedObjectiveTitle": "...", "suggestedDate": "...", "phase": "..." }]`

const CAPACITY_PROMPT = `You are an expert manufacturing and operations advisor. Extract capacity requirements from the business plan.

For each capacity need:
- description: what capacity is needed
- linkedObjectiveTitle: which objective drives this need
- requiredByDate: when it's needed (ISO date if inferable)
- notes: specific equipment, space, certifications, or process requirements

Return ONLY a raw JSON array (no markdown, no code fences):
[{ "description": "...", "linkedObjectiveTitle": "...", "requiredByDate": "...", "notes": "..." }]`

const FUNDING_PROMPT = `You are an expert financial advisor. Extract funding requirements from the business plan.

For each funding event:
- title: short label (e.g. "Seed Round", "Equipment Purchase")
- amountUsd: estimated amount in USD (integer, omit if unknown)
- reason: what the money is for
- neededByDate: when (ISO date if inferable)
- fundingType: one of: bootstrapping, angel, vc, grant, revenue_based, debt, other
- linkedObjectiveTitles: array of objective titles that depend on this funding

Return ONLY a raw JSON array (no markdown, no code fences):
[{ "title": "...", "amountUsd": 0, "reason": "...", "neededByDate": "...", "fundingType": "...", "linkedObjectiveTitles": [...] }]`

const SUMMARY_PROMPT = `You are an expert business consultant. Write a 2-3 sentence plain-language executive summary of the business plan.

Return ONLY the summary text — no JSON, no markdown, no code fences. Just the plain text summary.`

// ─── Helpers ──────────────────────────────────────────────────────────

/** Strip markdown code fences and extract JSON from AI response */
function stripFences(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
  if (fenceMatch) return fenceMatch[1].trim()
  return trimmed
}

/**
 * Call Claude for a single section extraction.
 *
 * @description Each section gets its own focused prompt and runs as an
 * independent Sonnet call. The business plan text is passed identically
 * to all 5 calls.
 */
async function extractSection(
  client: InstanceType<typeof import('@anthropic-ai/sdk').default>,
  businessPlanText: string,
  sectionPrompt: string,
): Promise<string> {
  const response = await client.messages.create({
    model: SECTION_MODEL,
    max_tokens: SECTION_MAX_TOKENS,
    system: sectionPrompt,
    messages: [
      { role: 'user', content: `Analyze the following business plan:\n\n${businessPlanText}` },
    ],
  })

  const textBlock = response.content.find(block => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('AI returned no text content')
  }

  return stripFences(textBlock.text)
}

// ─── Main Action ──────────────────────────────────────────────────────

/**
 * @description Analyzes a business plan document using 5 parallel Claude Sonnet
 * calls, each extracting one section independently. Total time ≈ max(all 5)
 * instead of one large sequential call.
 *
 * @param formData - FormData containing either a 'file' (PDF/DOCX/TXT) or 'text' field
 * @returns The full analysis or an error message
 * @security Rate-limited per user to prevent AI cost abuse
 */
export async function analyzeBusinessPlan(
  formData: FormData
): Promise<{ analysis?: BusinessPlanAnalysis; error?: string }> {
  return withAIGate('analyze', async ({ user }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
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
        if (file.size > MAX_FILE_SIZE_BYTES) {
          return { error: 'File too large. Maximum size is 20 MB.' }
        }

        if (!ALLOWED_FILE_TYPES.includes(file.type as typeof ALLOWED_FILE_TYPES[number])) {
          return { error: 'Unsupported file type. Please upload a PDF, DOCX, or TXT file.' }
        }

        if (file.type === 'application/pdf') {
          const buffer = Buffer.from(await file.arrayBuffer())
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfParse = require('pdf-parse')
          const data = await pdfParse(buffer)
          text = data.text
        } else if (
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) {
          const buffer = Buffer.from(await file.arrayBuffer())
          const mammoth = await import('mammoth')
          const result = await mammoth.extractRawText({ buffer })
          text = result.value
        } else {
          text = await file.text()
        }
      } else if (textInput) {
        text = textInput
      }

      if (!text || text.length < 50) {
        return { error: 'Could not extract enough text from the file.' }
      }

      // GOTCHA: Claude's context window is large (200k tokens) but we cap
      // at ~100k chars to keep costs reasonable and avoid timeouts.
      const truncatedText = text.slice(0, 100000)

      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey })

      // DECISION: Run all 5 section extractions in parallel using Sonnet.
      // Each section is independent — no cross-section coherence needed.
      // Total wall time = max(all 5) ≈ 10-20s instead of 30-60s for one Opus call.
      const [
        objectivesRaw,
        hiringRaw,
        capacityRaw,
        fundingRaw,
        summaryRaw,
      ] = await Promise.all([
        extractSection(client, truncatedText, OBJECTIVES_PROMPT),
        extractSection(client, truncatedText, HIRING_PROMPT),
        extractSection(client, truncatedText, CAPACITY_PROMPT),
        extractSection(client, truncatedText, FUNDING_PROMPT),
        extractSection(client, truncatedText, SUMMARY_PROMPT),
      ])

      // ── Parse and validate each section independently ──
      try {
        const objectivesParsed = z.array(analyzedObjectiveSchema).default([]).parse(
          JSON.parse(objectivesRaw),
        )

        const hiringParsed = z.array(hiringRequirementSchema).default([]).parse(
          JSON.parse(hiringRaw),
        )

        const capacityParsed = z.array(capacityRequirementSchema).default([]).parse(
          JSON.parse(capacityRaw),
        )

        const fundingParsed = z.array(fundingRequirementSchema).default([]).parse(
          JSON.parse(fundingRaw),
        )

        // Summary is plain text, not JSON
        const executiveSummary = summaryRaw.trim()

        // Assemble full analysis and do final validation
        const assembled = {
          objectives: objectivesParsed,
          hiringRequirements: hiringParsed,
          capacityRequirements: capacityParsed,
          fundingRequirements: fundingParsed,
          executiveSummary,
        }

        const validated = businessPlanAnalysisSchema.safeParse(assembled)
        if (!validated.success) {
          console.error('[analyze] Assembled analysis failed final validation:', {
            issues: validated.error.issues.slice(0, 5),
          })
          return { error: 'AI response was malformed. Please try again.' }
        }

        return { analysis: validated.data }
      } catch (parseError) {
        console.error('[analyze] Failed to parse parallel section responses:', {
          error: parseError instanceof Error ? parseError.message : 'Unknown',
        })
        return { error: 'Failed to parse AI response. Please try again.' }
      }
    } catch (error) {
      console.error('[analyze] Business plan analysis failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return { error: 'Failed to analyze document. Please ensure it is a valid PDF or text file.' }
    }
  })
}
