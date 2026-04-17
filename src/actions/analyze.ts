"use server"

import { withAIGate } from '@/lib/ai/with-ai-gate'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { z } from 'zod'
import {
  businessPlanAnalysisSchema,
  analyzedObjectiveSchema,
  analyzedProductSchema,
  hiringRequirementSchema,
  capacityRequirementSchema,
  fundingRequirementSchema,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/business-plan-types'
import type { BusinessPlanAnalysis } from '@/lib/business-plan-types'

// DECISION: Objectives extraction needs Opus — Sonnet returns empty arrays
// on complex action plans because it can't synthesize day-by-day checklists
// into structured objectives. Other sections (hires, funding, products) are
// simpler extraction tasks that Sonnet handles fine.
const OBJECTIVES_MODEL = 'claude-opus-4-6'
const SECTION_MODEL = 'claude-sonnet-4-6'
const OBJECTIVES_MAX_TOKENS = 8192
const SECTION_MAX_TOKENS = 4096

// ─── Section-Specific Prompts ─────────────────────────────────────────

const OBJECTIVES_PROMPT = `You are an expert business consultant and operations strategist. Extract ALL strategic objectives, goals, milestones, and action items from the document.

IMPORTANT: The document may be a traditional business plan, BUT it could also be:
- A go-to-market action plan with day-by-day or week-by-week tasks
- A project tracker with checklists and deadlines
- A commercial audit with recommended actions
- A strategic roadmap with phases and milestones

Your job is to extract EVERY actionable objective — NOT the products/features described in the plan, but the ACTIONS the company needs to take. For example:
- "Fix website SEO issues" is an objective (action to take)
- "ForgeOS CAD Lab" is a product (NOT an objective — skip it)
- "Reach out to 50 hardware founders" is an objective
- "Record demo video" is a task under an objective

Group related tasks into objectives. If the document has explicit phases/weeks/days, use those as the grouping.

For each objective:
- title: the goal name (action-oriented, e.g. "Launch founder outreach campaign", NOT product names)
- description: what it entails and why it matters
- phase: business phase (e.g. "Week 1", "Day 1-2", "Launch", "Scale", "Month 1") — use the document's own phasing if available
- suggestedStartDate, suggestedEndDate: ISO dates if timing is mentioned or inferable
- tasks: 3-8 concrete, actionable tasks. Each task has:
  - title, description
  - role: "Executive" (founder does it personally) or "AI_Agent" (AI specialist handles it). NO "Apprentice".
  - estimatedDays (required)

Aim for 5-15 objectives with 3-8 tasks each. Extract generously — it's better to have too many than too few.

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

const PRODUCTS_PROMPT = `You are an expert product strategist. Extract DISTINCT products and services that the company SELLS to customers.

IMPORTANT: Only extract products/services that are revenue-generating offerings sold to external customers. Do NOT extract:
- Internal tools, features, or platform modules (e.g. "CAD Lab", "Task Manager", "Dashboard")
- Action items, strategies, or objectives from the plan
- Individual features of a single product (keep the product as one item, not 15 sub-features)

If the document describes a SaaS platform with multiple tiers, that is ONE product with different pricing tiers — NOT multiple products.

For each product/service:
- name: the product or service name
- description: what it does or delivers
- targetMarket: who it's for (if mentioned)
- revenueModel: how it generates revenue (e.g. "one-time purchase", "SaaS subscription", "per-unit sale")
- suggestedPrice: approximate price in GBP if mentioned or inferable (number, omit if unknown)

Return ONLY a raw JSON array (no markdown, no code fences):
[{ "name": "...", "description": "...", "targetMarket": "...", "revenueModel": "...", "suggestedPrice": 0 }]

If the document is an action plan, audit, or internal strategy document with no distinct product offerings, return an empty array: []`

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
 * Attempt to parse a JSON string with fallback extraction.
 *
 * @description Tries three strategies in order:
 * 1. Direct JSON.parse on the stripped input
 * 2. Regex extraction of the first JSON object or array from surrounding text
 * 3. Returns null so the caller can continue with partial results
 */
function safeParseJSON(raw: string, sectionName: string): unknown | null {
  // Attempt 1: parse as-is
  try {
    return JSON.parse(raw)
  } catch {
    // fall through
  }

  // Attempt 2: extract JSON object or array from surrounding text
  const objectMatch = raw.match(/\{[\s\S]*\}/)
  const arrayMatch = raw.match(/\[[\s\S]*\]/)
  const extracted = arrayMatch?.[0] ?? objectMatch?.[0]
  if (extracted) {
    try {
      return JSON.parse(extracted)
    } catch {
      // fall through
    }
  }

  // Attempt 3: give up on this section — log for debugging
  console.error(`[analyze] Failed to extract valid JSON for section "${sectionName}":`, {
    rawLength: raw.length,
    rawPreview: raw.slice(0, 300),
  })
  return null
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
  modelOverride?: string,
  maxTokensOverride?: number,
): Promise<string> {
  const response = await client.messages.create({
    model: modelOverride ?? SECTION_MODEL,
    max_tokens: maxTokensOverride ?? SECTION_MAX_TOKENS,
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

        // FLOW: Use the shared extractDocumentText action for all file types
        const { extractDocumentText } = await import('@/actions/extract-document-text')
        const extractForm = new FormData()
        extractForm.append('file', file)
        const extractResult = await extractDocumentText(extractForm)
        if (!extractResult.success) {
          return { error: extractResult.error }
        }
        text = extractResult.text
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
      const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 0 })

      // DECISION: Run all 6 Sonnet calls in parallel within the server action.
      // Objectives extraction also runs via /api/analyze-objectives (Opus, 300s)
      // from the client component — if Opus returns objectives and Sonnet doesn't,
      // the client merges the Opus result. This server action stays under 60s.
      const [
        objectivesRaw,
        hiringRaw,
        capacityRaw,
        fundingRaw,
        productsRaw,
        summaryRaw,
      ] = await Promise.all([
        extractSection(client, truncatedText, OBJECTIVES_PROMPT),
        extractSection(client, truncatedText, HIRING_PROMPT),
        extractSection(client, truncatedText, CAPACITY_PROMPT),
        extractSection(client, truncatedText, FUNDING_PROMPT),
        extractSection(client, truncatedText, PRODUCTS_PROMPT),
        extractSection(client, truncatedText, SUMMARY_PROMPT),
      ])

      // ── Parse and validate each section independently ──
      // DECISION: Partial success is better than total failure. If some sections
      // fail to parse, we keep the ones that succeeded and fall back to empty
      // arrays for the rest. Only fail entirely if ALL sections fail.
      const failedSections: string[] = []

      function parseSection<T>(
        raw: string,
        sectionName: string,
        schema: z.ZodType<T>,
        fallback: T,
      ): T {
        const parsed = safeParseJSON(raw, sectionName)
        if (parsed === null) {
          failedSections.push(sectionName)
          return fallback
        }
        const result = schema.safeParse(parsed)
        if (!result.success) {
          console.error(`[analyze] Zod validation failed for "${sectionName}":`, {
            issues: result.error.issues.slice(0, 3),
          })
          failedSections.push(sectionName)
          return fallback
        }
        return result.data
      }

      const objectivesParsed = parseSection(
        objectivesRaw, 'objectives',
        z.array(analyzedObjectiveSchema).default([]), [],
      )
      const hiringParsed = parseSection(
        hiringRaw, 'hiring',
        z.array(hiringRequirementSchema).default([]), [],
      )
      const capacityParsed = parseSection(
        capacityRaw, 'capacity',
        z.array(capacityRequirementSchema).default([]), [],
      )
      const fundingParsed = parseSection(
        fundingRaw, 'funding',
        z.array(fundingRequirementSchema).default([]), [],
      )
      const productsParsed = parseSection(
        productsRaw, 'products',
        z.array(analyzedProductSchema).default([]), [],
      )

      // Summary is plain text, not JSON
      const executiveSummary = summaryRaw.trim()

      // INTENT: If every JSON section failed, there's nothing useful to save.
      // But if at least one succeeded, partial results are valuable.
      const jsonSectionCount = 5
      if (failedSections.length === jsonSectionCount) {
        console.error('[analyze] All sections failed to parse:', { failedSections })
        return { error: 'Failed to parse AI response. Please try again.' }
      }

      if (failedSections.length > 0) {
        console.warn('[analyze] Some sections failed to parse (continuing with partial results):', {
          failedSections,
          successCount: jsonSectionCount - failedSections.length,
        })
      }

      // Assemble full analysis and do final validation
      const assembled = {
        objectives: objectivesParsed,
        hiringRequirements: hiringParsed,
        capacityRequirements: capacityParsed,
        fundingRequirements: fundingParsed,
        products: productsParsed,
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
    } catch (error) {
      console.error('[analyze] Business plan analysis failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return { error: 'Failed to analyze document. Please ensure it is a valid PDF or text file.' }
    }
  })
}
