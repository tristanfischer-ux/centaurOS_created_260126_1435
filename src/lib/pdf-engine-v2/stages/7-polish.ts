/**
 * @file stages/7-polish.ts — LLM narrative polish pass
 *
 * Takes the deterministic outputs from all previous stages and produces
 * polished, professional engineering narrative. This is the final LLM call
 * that makes the report read like it was written by a senior engineer.
 */

import type { PipelineState, Module, StageResult } from '../types'
import { sanitiseLlmOutput } from '../sanitiser'

const POLISH_SYSTEM_PROMPT = `You are a senior UK engineering report author. Rewrite the following module descriptions and section narratives into polished, professional engineering prose.

STYLE RULES:
1. British spelling throughout
2. No filler words (leverage, utilise, synergise, world-class, etc.)
3. Every sentence must contain a number, measurement, or specific technical detail
4. Active voice, maximum 25 words per sentence
5. Source-grade every factual claim: [D] for engineering estimates, [E] for assumptions
6. If uncertainty exists, state the bound or confidence interval
7. Technical descriptions must mention specific materials, methods, and operating principles
8. Failure modes must have specific causes, not generic statements

INPUT: JSON with modules array. Each module has name, purpose, description, keyParts, failureModes.

OUTPUT: JSON with the same structure but with polished descriptions and failure modes.
Return ONLY valid JSON. No markdown, no preamble.`

/**
 * Run the polish pass on module descriptions and failure modes.
 * This takes the deterministic outputs and makes them read like professional engineering prose.
 */
export async function runPolish(
  state: PipelineState
): Promise<StageResult<{ modules: Module[] }>> {
  const startTime = Date.now()
  console.log('[polish] Starting narrative polish pass...')

  if (!state.modules || state.modules.length === 0) {
    return { ok: false, error: 'No modules to polish', durationMs: Date.now() - startTime }
  }

  try {
    // Build input for the polish LLM
    const inputModules = state.modules.map(m => ({
      name: m.name,
      purpose: m.purpose,
      description: m.description,
      keyParts: m.keyParts,
      failureModes: m.failureModes,
    }))

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'xiaomi/mimo-v2.5-pro',
        max_tokens: 16384,
        messages: [
          { role: 'system', content: POLISH_SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify({ modules: inputModules }) },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API returned status ${response.status}`)
    }

    const json = await response.json()
    const msg = json.choices?.[0]?.message
    let raw = msg?.content || msg?.reasoning || ''
    if (!raw && msg?.reasoning_details?.length) {
      raw = msg.reasoning_details.filter((d: any) => d.type === 'reasoning.text').map((d: any) => d.text).join('\n')
    }

    if (!raw) throw new Error('No content in polish response')

    // Parse the polished output
    let jsonStr = raw.replace(/```json/g, '').replace(/```/g, '').trim()
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
    }

    const polished = JSON.parse(jsonStr)
    const polishedModules = polished.modules || []

    // Merge polished descriptions back into the original modules
    const updatedModules = state.modules.map((m, i) => {
      const polishedMod = polishedModules.find((pm: any) => pm.name === m.name) || polishedModules[i]
      if (polishedMod) {
        return {
          ...m,
          description: sanitiseLlmOutput(polishedMod.description || m.description),
          purpose: sanitiseLlmOutput(polishedMod.purpose || m.purpose),
          failureModes: (polishedMod.failureModes || m.failureModes).map((f: string) => sanitiseLlmOutput(f)),
        }
      }
      return m
    })

    console.log(`[polish] Polished ${updatedModules.length} module descriptions`)
    return {
      ok: true,
      data: { modules: updatedModules },
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    console.error('[polish] Polish pass failed:', (error as Error).message)
    // Don't fail the pipeline — return original modules
    return {
      ok: false,
      data: { modules: state.modules },
      error: (error as Error).message,
      durationMs: Date.now() - startTime,
    }
  }
}
