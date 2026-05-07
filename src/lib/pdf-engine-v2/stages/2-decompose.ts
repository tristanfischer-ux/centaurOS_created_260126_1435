import type { Module, ResearchResult, StageResult } from '../types'
import { MODULE_DECOMPOSITION_SYSTEM } from '../prompts'
import { STAGE_TEMPERATURES } from '../llm-temperature-config'

// Stage 2: Module Decomposition — uses MODULE_DECOMPOSITION_SYSTEM from prompts.ts
// The prompt is defined in prompts.ts and imported above.

/**
 * Validates the JSON decomposition result against the required schema constraints.
 */
function validateDecomposeResult(data: any): Module[] {
  if (!data || typeof data !== 'object') {
    throw new Error('Response is not a valid JSON object')
  }
  
  if (!Array.isArray(data.modules) || data.modules.length < 1 || data.modules.length > 15) {
    throw new Error('Validation failed: Result must be an array with 1-15 modules')
  }

  for (let i = 0; i < data.modules.length; i++) {
    const mod = data.modules[i]
    // Auto-generate id from name if missing
    if (!mod.id && mod.name) {
      mod.id = mod.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_')
    }
    if (!mod.name || !mod.purpose || !mod.description) {
      throw new Error(`Validation failed: Module at index ${i} missing required fields (name, purpose, description)`)
    }
    
    if (!Array.isArray(mod.keyParts) || mod.keyParts.length === 0) {
      throw new Error(`Validation failed: Module '${mod.id}' keyParts must be an array with >0 entries`)
    }

    for (const part of mod.keyParts) {
      if (typeof part !== 'string') {
        throw new Error(`Validation failed: Module '${mod.id}' keyParts entries must be strings`)
      }
    }
  }

  // Force cast structure mapping (status is required on Module interface but LLM doesn't output it)
  return data.modules.map((m: any) => ({
    ...m,
    status: m.status || 'draft' // Provide a default for the TS interface if absent
  })) as Module[]
}

/**
 * Calls the OpenRouter API to fetch the decomposition response.
 */
async function callOpenRouter(systemPrompt: string, userContent: string): Promise<any> {
  // Try multiple models with fallback
  const models = ['google/gemini-3.1-pro-preview', 'x-ai/grok-4.3', 'xiaomi/mimo-v2.5-pro']
  
  for (const model of models) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300_000)

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: STAGE_TEMPERATURES.decompose,
          max_tokens: 16384,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
        signal: controller.signal,
      })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`OpenRouter API returned status: ${response.status}`)
    }

    const json = await response.json()
    const msg = json.choices?.[0]?.message
    let raw = msg?.content || msg?.reasoning || ''
    if (!raw && msg?.reasoning_details?.length) {
      raw = msg.reasoning_details.filter((d: any) => d.type === 'reasoning.text').map((d: any) => d.text).join('\n')
    }

    if (!raw) {
      throw new Error('No content in OpenRouter response')
    }

    console.log(`[decompose] ${model} responded: ${raw.length} chars`)

    // A7 FIX (2026-05-06): robust JSON extraction with full-raw-dump on failure.
    // Previous bracket-matching strategy tracked '{'/'}' depth without string
    // awareness — a literal '{' or '}' inside a description string threw the
    // count off and the slice became malformed. New strategy:
    //   1. Strip markdown fences + thinking blocks
    //   2. Try JSON.parse on the whole thing (works for well-formed responses)
    //   3. If that fails, try the first-brace-to-last-brace slice
    //   4. If that also fails, try the "modules" locator (last resort)
    //   5. On final failure, dump full raw to disk so we can debug later
    let jsonStr = raw
    jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    jsonStr = jsonStr.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '').trim()
    jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    // Step 1: try parse-whole first — fastest path for well-formed JSON
    try {
      return JSON.parse(jsonStr)
    } catch { /* fall through */ }

    // Step 2: first-brace-to-last-brace slice (handles leading prose)
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1))
      } catch { /* fall through */ }
    }

    // Step 3: "modules" locator (legacy — for when the response has trailing junk)
    const modulesIdx = jsonStr.indexOf('"modules"')
    if (modulesIdx > 0) {
      let start = modulesIdx
      while (start > 0 && jsonStr[start] !== '{') start--
      let depth = 0
      let end = -1
      for (let i = start; i < jsonStr.length; i++) {
        if (jsonStr[i] === '{') depth++
        else if (jsonStr[i] === '}') {
          depth--
          if (depth === 0) { end = i; break }
        }
      }
      if (end > start) {
        try {
          return JSON.parse(jsonStr.slice(start, end + 1))
        } catch { /* fall through */ }
      }
    }

    // Step 4: dump full raw for later inspection, then fail.
    try {
      const fs = await import('fs')
      const dumpPath = `/tmp/decompose-raw-${model.replace(/\//g, '_')}-${Date.now()}.txt`
      fs.writeFileSync(dumpPath, raw)
      console.error(`[decompose] ${model} JSON parse failed. Full raw dumped to ${dumpPath}. First 500: ${raw.slice(0, 500)}`)
    } catch { /* ignore */ }
    throw new Error('Failed to parse JSON response from LLM')
    } catch (error) {
      clearTimeout(timeout)
      console.warn(`[decompose] ${model} failed: ${(error as Error).message}. Trying next model...`)
      continue  // Try next model
    }
  }

  throw new Error('All models failed for decompose')
}

/**
 * Run the decomposition stage
 * Input: research result from Stage 1
 * Output: StageResult<Module[]> with structured modules
 */
export async function runDecompose(
  research: ResearchResult,
  options?: { trainingDataDossier?: string }
): Promise<StageResult<Module[]>> {
  const startTime = Date.now()
  console.log('[decompose] Starting decompose stage...')

  const userContent = options?.trainingDataDossier
    ? `Research Dossier:\n${JSON.stringify(research, null, 2)}\n\nTraining Data Context:\n${options.trainingDataDossier.slice(0, 5000)}`
    : `Research Dossier:\n${JSON.stringify(research, null, 2)}`

  try {
    console.log('[decompose] Calling Gemini via OpenRouter...')
    let parsedJson = await callOpenRouter(MODULE_DECOMPOSITION_SYSTEM, userContent)
    
    try {
      console.log('[decompose] Got response, validating...')
      const modules = validateDecomposeResult(parsedJson)
      console.log('[decompose] Validation successful.')
      return {
        ok: true,
        data: modules,
        durationMs: Date.now() - startTime
      }
    } catch (validationErr) {
      console.log(`[decompose] Validation failed: ${validationErr instanceof Error ? validationErr.message : String(validationErr)}. Retrying with simpler prompt...`)
      // Retry with a simpler prompt
      const simplerPrompt = `Break this product into 8-12 modules. Each module needs: name, purpose (1-2 sentences), why_it_matters, description (2-3 paragraphs), keyParts (3-5 strings), failureModes (2-4 strings with causes), riskMatrix (3-5 entries with severity 1-5, likelihood 1-5, mitigation). Return ONLY valid JSON with a "modules" array. No markdown.`
      parsedJson = await callOpenRouter(simplerPrompt, userContent)
      const modules = validateDecomposeResult(parsedJson)
      return {
        ok: true,
        data: modules,
        durationMs: Date.now() - startTime
      }
    }
  } catch (error) {
    console.error('[decompose] Stage failed:', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error during decompose stage',
      durationMs: Date.now() - startTime
    }
  }
}
