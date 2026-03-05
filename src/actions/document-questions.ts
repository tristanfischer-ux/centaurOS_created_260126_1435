'use server'

/**
 * @file document-questions.ts
 *
 * @description Server action that generates skill-specific clarifying questions
 * for the Document Writer's "Guide Me" mode. Uses Claude Sonnet 4.6 to produce
 * 4-6 targeted questions based on the skill type and user context.
 *
 * @related
 * - src/lib/document-skills/types.ts — DocumentQuestion type
 * - src/components/reports/SkillDocumentSection.tsx — UI consumer
 * - src/lib/document-skills/data-collector.ts — Auto-data collection
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { rateLimit } from '@/lib/security/rate-limit'
import { getSkillById } from '@/lib/document-skills'
import { collectAutoData } from '@/lib/document-skills/data-collector'

import type { DocumentQuestion } from '@/lib/document-skills/types'

interface GenerateQuestionsResult {
  success: boolean
  questions?: DocumentQuestion[]
  error?: string
}

/**
 * Generate clarifying questions for a document skill.
 *
 * @param skillId - The document skill to generate questions for
 * @param userContext - The user's initial context / brief
 * @param includeAutoData - Whether to include company data for smarter questions
 * @returns 4-6 clarifying questions with hints
 */
export async function generateDocumentQuestions(
  skillId: string,
  userContext: string,
  includeAutoData: boolean,
): Promise<GenerateQuestionsResult> {
  // AUTH
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  // SECURITY: Rate limit — shares bucket with document generation
  const rateLimitResult = await rateLimit('api', `doc-skill:${user.id}`, {
    limit: 20,
    window: 60 * 60 * 1000,
  })
  if (!rateLimitResult.success) {
    return { success: false, error: 'Rate limit exceeded. Please wait before generating more.' }
  }

  // VALIDATION
  const skill = getSkillById(skillId)
  if (!skill) {
    return { success: false, error: 'Unknown skill' }
  }

  if (!userContext?.trim()) {
    return { success: false, error: 'Please provide some context first' }
  }

  if (userContext.length > 20000) {
    return { success: false, error: 'Context too long (max 20,000 characters)' }
  }

  try {
    // Collect auto-data if requested (for smarter questions)
    let autoDataText = ''
    if (includeAutoData && skill.autoDataSources.length > 0) {
      const foundryId = await getFoundryIdCached()
      if (foundryId) {
        try {
          autoDataText = await collectAutoData(skill.autoDataSources, foundryId)
        } catch (err) {
          console.warn('[DocumentQuestions] Auto-data collection failed:', err)
        }
      }
    }

    // Build prompt
    const systemPrompt = `You are helping a user write a ${skill.title}. Based on their initial context and the document structure, generate 4-6 clarifying questions that would significantly improve the quality of the generated document.

Rules:
- Questions must be specific and actionable — not "Tell me more"
- Target gaps relative to what the document needs (metrics, names, timelines, constraints)
- Return JSON array: [{ "id": "q1", "question": "...", "hint": "...", "required": false }]
- Set required=true for the 2 most important questions
- Keep questions concise (1 sentence). Hints are brief example answers (~15 words).
- Return ONLY the JSON array — no markdown fences, no preamble.`

    const userMessage = [
      autoDataText ? `# Company Context\n\n${autoDataText}\n\n---\n\n` : '',
      `# Document Type\n\n${skill.title}: ${skill.description}\n\n`,
      `# User Brief\n\n${userContext.trim()}`,
    ].join('')

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    // Parse response
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return { success: false, error: 'No response from AI' }
    }

    // Strip markdown fences if present
    let jsonText = textBlock.text.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    const parsed = JSON.parse(jsonText) as DocumentQuestion[]

    // VALIDATION: Ensure well-formed questions
    const questions = parsed
      .filter(q => q.id && q.question && q.hint !== undefined)
      .slice(0, 6)
      .map(q => ({
        id: String(q.id),
        question: String(q.question),
        hint: String(q.hint),
        required: Boolean(q.required),
      }))

    if (questions.length === 0) {
      return { success: false, error: 'Failed to generate questions' }
    }

    return { success: true, questions }
  } catch (err) {
    console.error('[DocumentQuestions] Generation failed:', err)
    const message = err instanceof Error ? err.message : 'Failed to generate questions'
    return { success: false, error: message }
  }
}
