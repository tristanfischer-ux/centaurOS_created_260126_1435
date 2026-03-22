/**
 * @file observer.ts
 *
 * @description The Observer compresses raw conversation messages into
 * structured, emoji-prioritized observation log entries. This is the
 * "compression" half of the Observational Memory system.
 *
 * Inspired by Mastra's Observational Memory pattern (Feb 2026), implemented
 * independently for ForgeOS.
 *
 * @security Uses OpenAI API key from environment. No user data is logged.
 */

import OpenAI from 'openai'
import { countTokens } from './token-counter'
import type { MemoryMessage } from './types'

// ─── Observer System Prompt ─────────────────────────────────────────

const OBSERVER_SYSTEM_PROMPT = `You are the memory consciousness of an AI assistant. Your observations will be the ONLY information the assistant has about past interactions.

## Your Task
Compress the conversation messages below into structured observation log entries. These observations must capture everything important so the assistant can recall it later.

## Priority Levels
- 🔴 HIGH: Explicit user facts, preferences, decisions, stated goals, company details, names, numbers
- 🟡 MEDIUM: Project details, questions asked, tool results, recommendations given, workflow context
- 🟢 LOW: Minor details, uncertain observations, pleasantries

## Special Categories (use these tags when detected)
- 🎯 RECURRING: A topic the user has asked about multiple times — note the recurrence
- 💡 PREFERENCE: A communication preference signal (e.g., asked for shorter answers, prefers bullets, likes/dislikes a specific approach)
- ⚡ CORRECTION: User corrected the assistant or expressed dissatisfaction with the output
- 🔄 FOLLOW_UP: Something the user committed to doing or revisiting later — note what and estimated when

## Rules
1. User assertions → 🔴 HIGH priority. User questions → 🟡 MEDIUM priority.
2. One observation per distinct event or fact. Don't combine unrelated items.
3. Group observations by date, with 24-hour timestamps.
4. Preserve specifics: names, numbers, measurements, dates, decisions.
5. Keep unusual or notable phrasing in quotes.
6. Use precise action verbs: "stated", "requested", "approved", "rejected", "asked about".
7. When a user references a future date (e.g. "next Tuesday"), include the estimated actual date.
8. When information supersedes previous info, note the update explicitly.
9. For workflow outputs, summarize the key deliverable, not the full content.
10. ALWAYS look for preference signals: if the user says "make it shorter", "just give me the recommendation", "I prefer tables", or expresses frustration with the format — tag it with 💡 PREFERENCE.
11. ALWAYS look for corrections: if the user says "that's not what I meant", "no", or pushes back — tag it with ⚡ CORRECTION.
12. ALWAYS look for recurring themes: if the same topic appears in multiple conversations — tag it with 🎯 RECURRING.

## Output Format
Return ONLY the observation entries in this format:

Date: YYYY-MM-DD
- 🔴 (HH:MM) [observation text]
- 🟡 (HH:MM) [observation text]
- 🟢 (HH:MM) [observation text]
- 💡 (HH:MM) PREFERENCE: [what was preferred/disliked]
- ⚡ (HH:MM) CORRECTION: [what was corrected]
- 🎯 (HH:MM) RECURRING: [topic that keeps coming up]
- 🔄 (HH:MM) FOLLOW_UP: [commitment + estimated date]

Date: YYYY-MM-DD
- ...

Do NOT include any preamble, explanation, or markdown formatting beyond the above structure.`

// ─── Format messages for the observer ───────────────────────────────

/**
 * Formats raw messages into a readable block for the observer prompt.
 *
 * @param messages - The unobserved messages to compress
 * @returns Formatted message text
 */
function formatMessagesForObserver(messages: MemoryMessage[]): string {
  return messages
    .map((m) => {
      const time = new Date(m.created_at).toISOString()
      const role = m.role.toUpperCase()
      return `[${time}] ${role}: ${m.content}`
    })
    .join('\n\n')
}

// ─── Run Observer ───────────────────────────────────────────────────

/**
 * Compresses raw messages into structured observation entries.
 *
 * @description Calls an LLM to analyze conversation messages and distill
 * them into date-grouped, emoji-prioritized observation log entries.
 * The observations preserve key facts, decisions, and context while
 * reducing token count by 3-6x.
 *
 * @param messages - Array of unobserved messages to compress
 * @param existingObservations - Optional existing observations for context
 * @param config - Observer configuration (model, temperature)
 * @returns The compressed observation text
 *
 * @throws {Error} If OPENAI_API_KEY is not set
 * @throws {Error} If the LLM call fails
 */
export async function runObserver(
  messages: MemoryMessage[],
  existingObservations?: string,
  config?: { model?: string; temperature?: number }
): Promise<string> {
  if (messages.length === 0) return ''

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('[AgentMemory/Observer] Missing OPENAI_API_KEY')
  }

  const openai = new OpenAI({ apiKey })
  const formattedMessages = formatMessagesForObserver(messages)

  let userPrompt = '## MESSAGES TO OBSERVE\n\n' + formattedMessages

  if (existingObservations?.trim()) {
    userPrompt =
      '## EXISTING OBSERVATIONS (for context — do not repeat these)\n\n' +
      existingObservations +
      '\n\n' +
      userPrompt
  }

  const completion = await openai.chat.completions.create({
    model: config?.model ?? 'gpt-5.3-instant',
    temperature: config?.temperature ?? 0.3,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: OBSERVER_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })

  const result = completion.choices[0]?.message?.content?.trim() ?? ''

  console.info('[AgentMemory/Observer] Compressed messages:', {
    inputMessages: messages.length,
    inputTokens: countTokens(formattedMessages),
    outputTokens: countTokens(result),
    compressionRatio: (
      countTokens(formattedMessages) / Math.max(countTokens(result), 1)
    ).toFixed(1) + 'x',
  })

  return result
}
