/**
 * @file reflector.ts
 *
 * @description The Reflector consolidates and garbage-collects observations
 * when they grow too large. This is the "compaction" half of the
 * Observational Memory system.
 *
 * Uses progressive compression levels: if the first pass doesn't compress
 * enough, it retries with increasingly aggressive guidance.
 *
 * @security Uses OpenAI API key from environment. No user data is logged.
 */

import OpenAI from 'openai'
import { countTokens } from './token-counter'
import type { CompressionLevel } from './types'

// ─── Reflector System Prompt ────────────────────────────────────────

const REFLECTOR_SYSTEM_PROMPT = `You are the observation reflector — part of an AI assistant's memory system. Your purpose is to consolidate, reorganize, and streamline observations so they remain useful without growing unbounded.

## Priority Levels (preserve these)
- 🔴 HIGH: Explicit user facts, preferences, decisions, goals
- 🟡 MEDIUM: Project details, workflow context, tool results
- 🟢 LOW: Minor details, uncertain observations

## Consolidation Rules
1. Preserve all dates and timestamps.
2. Combine related items into single observations where natural.
3. Condense OLDER observations more aggressively; keep RECENT observations (last 2-3 dates) in more detail.
4. User assertions (🔴) take precedence over questions (🟡). Never drop a 🔴 observation.
5. Remove 🟢 observations older than the most recent 3 dates.
6. When observations are superseded by newer ones, keep only the latest.
7. Preserve company-specific facts, names, numbers, and decisions regardless of age.

## Output Format
Return ONLY the consolidated observations in the same format:

Date: YYYY-MM-DD
- 🔴 (HH:MM) [observation]
- 🟡 (HH:MM) [observation]

Do NOT include preamble, explanation, or markdown beyond this structure.`

// ─── Compression Guidance ───────────────────────────────────────────

const COMPRESSION_GUIDANCE: Record<CompressionLevel, string> = {
  0: '',
  1: `\n\n## ADDITIONAL GUIDANCE: Moderate Compression
Condense more aggressively at the beginning of the observation timeline.
Keep fine detail only for the most recent 2 dates. Aim for ~70% of the original size.`,
  2: `\n\n## ADDITIONAL GUIDANCE: Aggressive Compression
Strongly reduce detail for everything except the most recent date.
Merge 🟡 items into summaries. Drop all 🟢 items older than 1 day.
Aim for ~50% of the original size. Preserve all 🔴 items.`,
}

// ─── Run Reflector ──────────────────────────────────────────────────

/**
 * Consolidates and compresses observation entries.
 *
 * @description Calls an LLM to reorganize, merge, and garbage-collect
 * observations. Supports progressive compression levels — if the output
 * still exceeds the target, callers can retry with a higher level.
 *
 * @param observations - The current observation text to consolidate
 * @param targetTokens - Target token count to compress below
 * @param compressionLevel - How aggressive to compress (0=normal, 1=moderate, 2=aggressive)
 * @param config - Reflector configuration (model, temperature)
 * @returns The consolidated observation text
 *
 * @throws {Error} If OPENAI_API_KEY is not set
 * @throws {Error} If the LLM call fails
 */
export async function runReflector(
  observations: string,
  targetTokens: number,
  compressionLevel: CompressionLevel = 0,
  config?: { model?: string; temperature?: number }
): Promise<string> {
  if (!observations.trim()) return ''

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('[AgentMemory/Reflector] Missing OPENAI_API_KEY')
  }

  const openai = new OpenAI({ apiKey })

  const systemPrompt =
    REFLECTOR_SYSTEM_PROMPT + COMPRESSION_GUIDANCE[compressionLevel]

  const userPrompt =
    `## OBSERVATIONS TO REFLECT ON\n\n` +
    observations +
    `\n\n## TARGET\nConsolidate these observations to fit within approximately ${targetTokens} tokens while preserving all critical information.`

  const completion = await openai.chat.completions.create({
    model: config?.model ?? 'gpt-5.3-instant',
    temperature: config?.temperature ?? 0,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })

  const result = completion.choices[0]?.message?.content?.trim() ?? ''
  const resultTokens = countTokens(result)
  const inputTokens = countTokens(observations)

  console.info('[AgentMemory/Reflector] Consolidated observations:', {
    inputTokens,
    outputTokens: resultTokens,
    targetTokens,
    compressionLevel,
    compressionRatio: (inputTokens / Math.max(resultTokens, 1)).toFixed(1) + 'x',
    withinTarget: resultTokens <= targetTokens,
  })

  return result
}
