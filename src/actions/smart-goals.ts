'use server'

/**
 * @file smart-goals.ts
 *
 * @description AI-powered SMART goal engine that takes raw ideas and helps
 * users refine them into Specific, Measurable, Achievable, Relevant, and
 * Time-bound objectives or tasks. Uses GPT-4o with company context to
 * generate contextually relevant suggestions.
 *
 * @security Requires authenticated user with foundry membership
 */

import OpenAI from 'openai'
import { buildAIContext } from '@/lib/ai-context/builder'
import { escapeHtml } from '@/lib/security/sanitize'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { withAIGate } from '@/lib/ai/with-ai-gate'

let openaiClient: OpenAI | null = null

/** Whether AI features are available (API key is set). */
function isAIEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY)
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return null
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey })
  }

  return openaiClient
}

/**
 * Lightweight check for whether AI features are configured.
 *
 * @description Returns true when OPENAI_API_KEY is set to a real value.
 * Used by SmartHintBar to avoid rendering when AI is unavailable.
 *
 * @returns Whether the OpenAI API key is configured
 */
export async function checkAIAvailable(): Promise<boolean> {
  return isAIEnabled()
}

/** Source page context for pre-filling */
export interface SmartGoalContext {
  source: 'marketplace' | 'blueprints' | 'agents' | 'inspiration' | 'manual'
  entityTitle?: string
  entityDescription?: string
}

/** Input for the SMART goal analyzer */
export interface SmartGoalInput {
  rawIdea: string
  context?: SmartGoalContext
  type: 'objective' | 'task'
}

/** Per-dimension SMART score (1-5) */
export interface SmartScore {
  specific: number
  measurable: number
  achievable: number
  relevant: number
  timeBound: number
}

/** AI-generated SMART suggestion */
export interface SmartGoalSuggestion {
  title: string
  description: string
  measurable: string
  suggestedTimeframe: string
  smartScore: SmartScore
  suggestions: string[]
}

/** Result from the smartify action */
export interface SmartifyResult {
  suggestion?: SmartGoalSuggestion
  error?: string
}

/** Result from the score-only action */
export interface SmartScoreResult {
  score?: SmartScore
  suggestions?: string[]
  error?: string
}

/**
 * Analyzes a raw idea and returns a SMART-formatted suggestion with scores.
 *
 * @description Takes a user's raw idea text plus optional page context and
 * returns an AI-refined version that is Specific, Measurable, Achievable,
 * Relevant, and Time-bound. Includes per-dimension scores and improvement tips.
 *
 * @param input - The raw idea, type (objective/task), and optional source context
 * @returns SMART suggestion with scores, or error message
 *
 * @security Requires authenticated user with foundry membership
 */
export async function smartifyGoal(
  input: SmartGoalInput
): Promise<SmartifyResult> {
  if (!isAIEnabled()) return { error: 'AI not configured' }

  const openai = getOpenAIClient()
  if (!openai) return { error: 'AI not configured' }

  return withAIGate('smart_goals', async ({ user, foundryId }) => {

  // SECURITY: Rate limit AI calls to prevent cost abuse
  const rateLimitError = await checkRateLimit('aiSmartGoal', `ai:${user.id}`)
  if (rateLimitError) return { error: rateLimitError }

  // VALIDATION: Input bounds
  const rawIdea = input.rawIdea?.trim()
  if (!rawIdea || rawIdea.length < 3) {
    return { error: 'Please enter at least a few words about your idea.' }
  }
  if (rawIdea.length > 2000) {
    return { error: 'Idea text is too long. Please keep it under 2000 characters.' }
  }

  // Build company context for relevance
  let businessContext = ''
  try {
    businessContext = await buildAIContext(foundryId, user.id, {
      includeActivity: false,
      includeObjectives: true,
    })
  } catch (error) {
    // Non-critical — proceed without business context
    console.warn('[SmartGoals] Failed to build AI context:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        foundryId,
    })
  }

  // SECURITY: Sanitize user input before injecting into prompt
  const sanitizedIdea = escapeHtml(rawIdea)
  const sanitizedEntityTitle = input.context?.entityTitle
    ? escapeHtml(input.context.entityTitle)
    : ''
  const sanitizedEntityDescription = input.context?.entityDescription
    ? escapeHtml(input.context.entityDescription.slice(0, 500))
    : ''

  const sourceContext =
    input.context && sanitizedEntityTitle
      ? `\nSource: The user saw "${sanitizedEntityTitle}" on the ${input.context.source} page.${
          sanitizedEntityDescription
            ? ` Details: ${sanitizedEntityDescription}`
            : ''
        }`
      : ''

  const typeLabel = input.type === 'objective' ? 'strategic objective' : 'actionable task'

  const systemPrompt = `You are a SMART goal coach for startup founders. Your job is to take a founder's raw idea and refine it into a ${typeLabel} that is:
- **Specific**: Clear and unambiguous, answering who/what/where/when/why
- **Measurable**: Has concrete criteria or metrics to track progress
- **Achievable**: Realistic given a typical early-stage startup's resources
- **Relevant**: Aligned with growing a business (consider the company context below)
- **Time-bound**: Has a clear deadline or timeframe

${businessContext ? `Company Context:\n${businessContext}\n` : ''}
${sourceContext}

The user's raw idea is: "${sanitizedIdea}"

Return ONLY a raw JSON object (no markdown, no code fences) with this structure:
{
  "title": "A concise SMART-formatted ${input.type} title (max 200 chars)",
  "description": "2-3 sentence description providing context, what success looks like, and any key considerations",
  "measurable": "How to measure success — specific metrics, deliverables, or criteria",
  "suggestedTimeframe": "A suggested deadline with brief rationale, e.g. '2 weeks — enough time to research and validate'",
  "smartScore": {
    "specific": 1-5,
    "measurable": 1-5,
    "achievable": 1-5,
    "relevant": 1-5,
    "timeBound": 1-5
  },
  "suggestions": ["Tip to improve any dimension scoring below 4, max 3 tips"]
}

Guidelines:
- The title should be action-oriented and specific (not generic like "grow revenue")
- For tasks, keep titles to a single deliverable
- For objectives, titles can be broader but still concrete
- Suggestions should be brief and practical
- Be encouraging, not pedantic`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.3-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: sanitizedIdea },
      ],
      temperature: 0.7,
      max_tokens: 800,
    })

    const content = response.choices[0]?.message?.content?.trim()
    if (!content) return { error: 'AI returned an empty response. Please try again.' }

    // Parse JSON from response (strip any accidental code fences)
    const jsonStr = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(jsonStr) as SmartGoalSuggestion

    // Validate the shape
    if (!parsed.title || !parsed.smartScore) {
      return { error: 'AI returned an unexpected format. Please try again.' }
    }

    // Clamp scores to 1-5 range
    const clamp = (n: number): number => Math.max(1, Math.min(5, Math.round(n)))
    parsed.smartScore = {
      specific: clamp(parsed.smartScore.specific),
      measurable: clamp(parsed.smartScore.measurable),
      achievable: clamp(parsed.smartScore.achievable),
      relevant: clamp(parsed.smartScore.relevant),
      timeBound: clamp(parsed.smartScore.timeBound),
    }

    return { suggestion: parsed }
  } catch (error) {
    console.error('[SmartGoals] Failed to smartify goal:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      rawIdea: rawIdea.slice(0, 100),
    })
    return { error: 'Failed to analyze your idea. Please try again.' }
  }
  })
}

/**
 * Quickly scores existing text against SMART criteria without generating suggestions.
 *
 * @description Lightweight version of smartifyGoal that only returns scores
 * and improvement tips. Used for real-time inline feedback as users type.
 *
 * @param text - The title/description text to score
 * @param type - Whether this is an objective or task
 * @returns SMART scores and brief suggestions, or error
 */
export async function scoreSmartGoal(
  text: string,
  type: 'objective' | 'task'
): Promise<SmartScoreResult> {
  if (!isAIEnabled()) return { error: 'AI not configured' }

  const openai = getOpenAIClient()
  if (!openai) return { error: 'AI not configured' }

  const trimmed = text?.trim()
  if (!trimmed || trimmed.length < 5) {
    return {
      score: { specific: 1, measurable: 1, achievable: 3, relevant: 3, timeBound: 1 },
      suggestions: ['Add more detail about what you want to achieve.'],
    }
  }

  return withAIGate('smart_goals', async ({ user }) => {
    // SECURITY: Rate limit AI calls to prevent cost abuse
  const rateLimitError = await checkRateLimit('aiSmartGoal', `ai:${user.id}`)
  if (rateLimitError) return { error: rateLimitError }

  const sanitizedText = escapeHtml(trimmed)
  const typeLabel = type === 'objective' ? 'objective' : 'task'

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.3-instant',
      messages: [
        {
          role: 'system',
          content: `Score this ${typeLabel} title against SMART criteria. Return ONLY a raw JSON object:
{
  "specific": 1-5,
  "measurable": 1-5,
  "achievable": 1-5,
  "relevant": 1-5,
  "timeBound": 1-5,
  "suggestions": ["max 2 brief improvement tips"]
}
Be fair but encouraging. A simple clear action gets at least 3 on specific.`,
        },
        { role: 'user', content: sanitizedText },
      ],
      temperature: 0.3,
      max_tokens: 200,
    })

    const content = response.choices[0]?.message?.content?.trim()
    if (!content) return { error: 'Empty response' }

    const jsonStr = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(jsonStr)

    const clamp = (n: number): number => Math.max(1, Math.min(5, Math.round(n)))

    return {
      score: {
        specific: clamp(parsed.specific),
        measurable: clamp(parsed.measurable),
        achievable: clamp(parsed.achievable),
        relevant: clamp(parsed.relevant),
        timeBound: clamp(parsed.timeBound),
      },
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 3)
        : [],
    }
  } catch (error) {
    console.error('[SmartGoals] Failed to score goal:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return { error: 'Failed to score. Please try again.' }
  }
  })
}
