import type { Module, ModulePA, ResearchResult, StageResult, RiskRow, StructuredBriefJSON, RegulatoryExtraction } from '../types'
import { MODULE_DECOMPOSITION_SYSTEM, MODULE_DECOMPOSITION_SYSTEM_PA } from '../prompts'
import { STAGE_TEMPERATURES } from '../llm-temperature-config'
import { validateFmea, type FmeaRow } from '../lib/fmea-validator'

// Stage 2: Module Decomposition — uses MODULE_DECOMPOSITION_SYSTEM from prompts.ts
// PA path: uses MODULE_DECOMPOSITION_SYSTEM_PA and validateDecomposeResultPA().
// The prompts are defined in prompts.ts and imported above.

/**
 * Validates the JSON decomposition result against the required schema constraints.
 * Legacy path (PA_PIPELINE=false). Unchanged from original.
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

// ── PA Stage 5 Validation ────────────────────────────────────────────────────

const VALID_MATURITY = new Set(['CONCEPTUAL', 'PRELIMINARY', 'ENGINEERING'])
const VALID_INTERFACE_TYPE = new Set(['electrical', 'mechanical', 'thermal', 'data', 'fluid'])

/**
 * Validates the JSON decomposition result against the PA Stage 5 schema constraints.
 * PA path (PA_PIPELINE=true). Enforces:
 *   - every module has at least one interface
 *   - every failure_mode.cause is NOT "Unknown" (or case variants)
 *   - every module has estimated_mass_kg (not null) AND estimated_dimensions_mm (not null)
 *   - maturity is one of CONCEPTUAL | PRELIMINARY | ENGINEERING
 *   - expected_parts array present and non-empty
 */
export function validateDecomposeResultPA(data: any): ModulePA[] {
  if (!data || typeof data !== 'object') {
    throw new Error('Response is not a valid JSON object')
  }

  if (!Array.isArray(data.modules) || data.modules.length < 1) {
    throw new Error('PA validation failed: Result must have at least 1 module')
  }

  if (data.modules.length > 15) {
    throw new Error(`PA validation failed: Too many modules (${data.modules.length}). PA Stage 5 requires 6-12.`)
  }

  for (let i = 0; i < data.modules.length; i++) {
    const mod = data.modules[i]

    // Auto-generate id from name if missing
    if (!mod.id && mod.name) {
      mod.id = mod.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_')
    }

    if (!mod.name) {
      throw new Error(`PA validation failed: Module at index ${i} missing required field: name`)
    }

    // ── interfaces: every module must have at least one ──────────────────
    if (!Array.isArray(mod.interfaces) || mod.interfaces.length === 0) {
      throw new Error(
        `PA validation failed: Module '${mod.name}' has no interfaces. ` +
        `PA Stage 5 rule: every module MUST have at least one interface with another module.`
      )
    }

    // Normalise interface types
    for (const iface of mod.interfaces) {
      if (!VALID_INTERFACE_TYPE.has(iface.type)) {
        // Normalise to 'mechanical' as safe default rather than reject
        console.warn(`[decompose-pa] Module '${mod.name}' has invalid interface type '${iface.type}', normalising to 'mechanical'`)
        iface.type = 'mechanical'
      }
    }

    // ── failure_modes: cause must not be "Unknown" ────────────────────────
    if (Array.isArray(mod.failure_modes)) {
      for (const fm of mod.failure_modes) {
        if (
          typeof fm.cause === 'string' &&
          fm.cause.trim().toLowerCase() === 'unknown'
        ) {
          throw new Error(
            `PA validation failed: Module '${mod.name}' has a failure_mode with cause='Unknown'. ` +
            `PA Stage 5 rule: "Unknown" is not acceptable — always state a cause.`
          )
        }
      }
    } else {
      mod.failure_modes = []
    }

    // ── estimated_mass_kg: must not be null ───────────────────────────────
    if (mod.estimated_mass_kg === null || mod.estimated_mass_kg === undefined) {
      throw new Error(
        `PA validation failed: Module '${mod.name}' has null estimated_mass_kg. ` +
        `PA Stage 5 rule: provide rough estimates — null means the sizing solver cannot allocate space.`
      )
    }

    // ── estimated_dimensions_mm: must not be null ─────────────────────────
    if (
      mod.estimated_dimensions_mm === null ||
      mod.estimated_dimensions_mm === undefined
    ) {
      throw new Error(
        `PA validation failed: Module '${mod.name}' has null estimated_dimensions_mm. ` +
        `PA Stage 5 rule: provide rough estimates — null means the sizing solver cannot allocate space.`
      )
    }

    // ── maturity: must be one of the 3 enum values ────────────────────────
    if (!VALID_MATURITY.has(mod.maturity)) {
      throw new Error(
        `PA validation failed: Module '${mod.name}' has invalid maturity '${mod.maturity}'. ` +
        `Must be one of CONCEPTUAL | PRELIMINARY | ENGINEERING.`
      )
    }

    // ── expected_parts: must be present ───────────────────────────────────
    if (!Array.isArray(mod.expected_parts)) {
      mod.expected_parts = []
    }

    // ── Normalise legacy fields for backwards compat ──────────────────────
    // PA prompt uses why_it_matters / technical_description;
    // legacy Module interface uses whyItMatters / description.
    if (!mod.whyItMatters && mod.why_it_matters) {
      mod.whyItMatters = mod.why_it_matters
    }
    if (!mod.description && mod.technical_description) {
      mod.description = mod.technical_description
    }

    // Populate legacy required fields with sensible defaults if absent
    if (!mod.purpose) mod.purpose = mod.description || ''
    if (!mod.description) mod.description = mod.purpose || ''
    if (!mod.whyItMatters) mod.whyItMatters = mod.why_it_matters || ''
    if (!Array.isArray(mod.inputs)) mod.inputs = []
    if (!Array.isArray(mod.outputs)) mod.outputs = []
    if (!Array.isArray(mod.keyParts)) {
      // Derive from expected_parts for backwards compat
      mod.keyParts = mod.expected_parts.map((p: any) => p.name).filter(Boolean)
    }
    if (!Array.isArray(mod.failureModes)) {
      mod.failureModes = mod.failure_modes.map((fm: any) => `${fm.mode}: ${fm.cause}`)
    }
    if (!Array.isArray(mod.unknowns)) {
      mod.unknowns = mod.open_questions || []
    }
    mod.leadWeeks = mod.estimated_lead_time_weeks ?? 12
    mod.status = mod.status || 'draft'
    if (mod.estimatedMassKg === undefined && mod.estimated_mass_kg != null) {
      mod.estimatedMassKg = mod.estimated_mass_kg
    }
  }

  return data.modules as ModulePA[]
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

function applyFmeaPadding(modules: Module[]): Module[] {
  const fmeaRows: FmeaRow[] = []
  for (const m of modules) {
    if (m.riskMatrix) {
      for (const r of m.riskMatrix) {
        fmeaRows.push({
          module: m.name,
          hazard: r.hazard,
          cause: r.cause || 'Operational stress',
          severity: r.severity || 5,
          likelihood: r.likelihood || 5,
          rpn: (r.severity || 5) * (r.likelihood || 5) * (r.detection || 5)
        })
      }
    }
  }
  
  const fmeaVal = validateFmea(modules, fmeaRows)
  if (!fmeaVal.valid) {
    console.log(`[decompose] FMEA gaps detected: ${fmeaVal.gaps.join(', ')}. Padding with auto-generated rows.`)
    for (const m of modules) {
      const modRows = fmeaVal.paddedRows.filter(r => r.module === m.name)
      if (!m.riskMatrix) m.riskMatrix = []
      
      if (modRows.length > m.riskMatrix.length) {
        const addedRows = modRows.slice(m.riskMatrix.length)
        for (let i = 0; i < addedRows.length; i++) {
          const r = addedRows[i]
          m.riskMatrix.push({
            id: `RM-${m.id}-pad-${i}`,
            hazard: r.hazard,
            cause: r.cause,
            severity: r.severity,
            likelihood: r.likelihood,
            mitigation: 'Standard industry mitigation and testing',
            verificationTest: 'Standard module integration test'
          })
        }
      }
    }
  }
  return modules
}

/**
 * Run the decomposition stage — PA path (PA_PIPELINE=true).
 * Uses MODULE_DECOMPOSITION_SYSTEM_PA prompt and validateDecomposeResultPA().
 *
 * Input: parsedBrief (PA Stage 1), classification (PA Stage 2),
 *        regulatoryExtraction (PA Stage 4, optional for context)
 * Output: StageResult<ModulePA[]> with PA-schema modules
 */
export async function runDecomposePA(
  parsedBrief: StructuredBriefJSON,
  classification: string,
  regulatoryExtraction?: RegulatoryExtraction,
): Promise<StageResult<ModulePA[]>> {
  const startTime = Date.now()
  console.log('[decompose-pa] Starting PA Stage 5: Module Decomposition...')

  const regSummary = regulatoryExtraction?.regulatory_entries?.length
    ? `\n\n[Regulatory entries from Stage 4 — ${regulatoryExtraction.regulatory_entries.length} standards identified]\n` +
      regulatoryExtraction.regulatory_entries
        .slice(0, 10)
        .map(e => `- ${e.standard_name} (${e.jurisdiction}): ${e.engineering_impact}`)
        .join('\n')
    : ''

  const userContent =
    `[Structured brief JSON from Stage 1]\n${JSON.stringify(parsedBrief, null, 2)}\n\n` +
    `[Product classification from Stage 2]\n${classification}` +
    regSummary

  try {
    console.log('[decompose-pa] Calling OpenRouter with PA Stage 5 prompt...')
    let parsedJson = await callOpenRouter(MODULE_DECOMPOSITION_SYSTEM_PA, userContent)

    try {
      console.log('[decompose-pa] Got response, running PA validation...')
      const modules = validateDecomposeResultPA(parsedJson)

      console.log(`[decompose-pa] PA validation successful: ${modules.length} modules.`)
      return {
        ok: true,
        data: modules,
        durationMs: Date.now() - startTime,
      }
    } catch (validationErr) {
      console.warn(
        `[decompose-pa] PA validation failed: ${validationErr instanceof Error ? validationErr.message : String(validationErr)}. ` +
        `Retrying with explicit PA constraints...`
      )
      // Retry once — add explicit validation reminder to user content
      const retryContent =
        userContent +
        '\n\nCRITICAL VALIDATION REQUIREMENTS:\n' +
        '- Every module MUST have at least one interface (interfaces array non-empty)\n' +
        '- failure_modes.cause MUST NOT be "Unknown" — always state the specific cause\n' +
        '- estimated_mass_kg MUST be a number (not null) — provide a rough estimate\n' +
        '- estimated_dimensions_mm MUST be an object with w/d/h numbers (not null)\n' +
        '- maturity MUST be exactly "CONCEPTUAL", "PRELIMINARY", or "ENGINEERING"'

      parsedJson = await callOpenRouter(MODULE_DECOMPOSITION_SYSTEM_PA, retryContent)
      const modules = validateDecomposeResultPA(parsedJson)

      console.log(`[decompose-pa] PA validation successful on retry: ${modules.length} modules.`)
      return {
        ok: true,
        data: modules,
        durationMs: Date.now() - startTime,
      }
    }
  } catch (error) {
    console.error('[decompose-pa] PA Stage 5 failed:', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error during PA decompose stage',
      durationMs: Date.now() - startTime,
    }
  }
}

/**
 * Run the decomposition stage — legacy path (PA_PIPELINE=false).
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
      let modules = validateDecomposeResult(parsedJson)
      modules = applyFmeaPadding(modules)

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
      let modules = validateDecomposeResult(parsedJson)
      modules = applyFmeaPadding(modules)
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
