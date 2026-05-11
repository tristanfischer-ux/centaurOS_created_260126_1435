/**
 * @file 1.7-module-decomposition.ts — Stage 1.5 (numbered 1.7 to slot between
 * Stage 1b regulatory and Stage 2 decompose) — LLM-derived module catalog +
 * 4-seat council validation.
 *
 * Implements §4 of `radical/ITER3-ARCHITECTURE-DESIGN.md`:
 *   - one LLM call to emit `ModuleDecomposition`
 *   - 4-seat council (Grok + Gemini + GLM + Sonnet) validates the catalog
 *   - synthesis rule: 2+ NEEDS_MAJOR → BLOCK + retry once → fall back to
 *     ClassModulePriors (§8.1) on second failure
 *   - prior cross-check: forbidden_present = schema_error (BLOCK + retry);
 *     missing_required = council warning
 *   - 2+ low-confidence modules force NEEDS_MAJOR regardless of seat votes
 *
 * Backward compatibility: Stage 1.7 is invoked from the engine orchestrator
 * ONLY when `RADICAL_PHASE_3_PER_MODULE=true`. When the flag is OFF, the
 * legacy single-shot Stage 2 path runs unchanged.
 *
 * Design doc: ../radical/ITER3-ARCHITECTURE-DESIGN.md §4
 * Type contract: ../types/module-decomposition.ts
 * Priors: ./class-module-priors.ts
 */

import type {
  StageResult,
  StructuredBriefJSON,
  RegulatoryExtraction,
} from '../types'
import type {
  ApplicabilityConfidence,
  CouncilSeatId,
  CouncilSeatReview,
  CouncilVerdict,
  DerivedParameters,
  ModuleDecomposition,
  ModuleDecompositionTelemetry,
  ModuleDecompositionValidation,
  ModuleSpec,
  SeatVerdict,
  UniversalModule,
} from '../types/module-decomposition'
import {
  MODULE_DEFAULT_ALLOWED_RADICALS,
  UNIVERSAL_MODULES,
} from '../types/module-decomposition'
import {
  MODULE_DECOMPOSITION_TAXONOMY_PROMPT,
  MODULE_DECOMPOSITION_COUNCIL_PROMPT,
} from '../prompts'
import { normaliseProductClass } from '../radical/character-hierarchy'
import {
  CLASS_MODULE_PRIORS,
  validateAgainstPriors,
  buildFallbackModuleList,
  type PriorValidationResult,
} from './class-module-priors'

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/**
 * Returns true when the Iter 3 per-module decomposition path is enabled.
 * When false (default), the legacy single-shot Stage 2 path runs.
 */
export function isPhase3PerModuleEnabled(): boolean {
  const raw = (process.env.RADICAL_PHASE_3_PER_MODULE ?? '').toLowerCase().trim()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

// ---------------------------------------------------------------------------
// Known radicals — must mirror KNOWN_RADICALS in 2-decompose.ts
// ---------------------------------------------------------------------------

const KNOWN_RADICALS = new Set<string>([
  'steel', 'copper', 'polymer_thermoplastic', 'electrical_conducting_function', 'solid_state_of_matter',
  'lithium_iron_phosphate_chemistry', 'electrochemical_energy_function', 'silicon_semiconductor_function',
  'magnetic_coupling_function', 'electromechanical_switching_function', 'thermal_transfer_function',
  'fluid_flow_state', 'mineral_fibre_material', 'pressure_vessel_function', 'chemical_suppressant_material',
  'chemical_sensing_function', 'optical_sensing_function',
  'aluminium_alloy', 'refrigerant_fluid', 'mechanical_kinetic_function',
  'carbon_fibre_composite', 'digital_logic_function',
  'optical_transduction_function', 'biochemical_sensing_function', 'buoyancy_control_function',
  'electrochemical_reaction_function',
])

const UNIVERSAL_MODULE_SET = new Set<UniversalModule>(UNIVERSAL_MODULES as readonly UniversalModule[])
const COUNCIL_SEATS: ReadonlyArray<{ id: CouncilSeatId; model: string }> = [
  { id: 'grok',   model: 'x-ai/grok-4.3' },
  { id: 'gemini', model: 'google/gemini-3.1-pro-preview' },
  { id: 'glm',    model: 'z-ai/glm-5.1' },
  { id: 'mimo',   model: 'xiaomi/mimo-v2.5-pro' },
]

// ---------------------------------------------------------------------------
// LLM transport (OpenRouter)
// ---------------------------------------------------------------------------

interface LlmCallResult {
  raw: string
  parsed: unknown
  inputTokens: number
  outputTokens: number
  durationMs: number
  model: string
}

async function callOpenRouterJson(
  systemPrompt: string,
  userContent: string,
  models: string[],
  maxTokens: number,
): Promise<LlmCallResult> {
  const startedAt = Date.now()
  let lastErr: unknown

  for (const model of models) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300_000)
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.0,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (!response.ok) {
        throw new Error(`OpenRouter API status ${response.status} from ${model}`)
      }
      const json = await response.json() as {
        choices?: Array<{ message?: { content?: string; reasoning?: string; reasoning_details?: Array<{ type?: string; text?: string }> } }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const msg = json.choices?.[0]?.message
      let raw = msg?.content || msg?.reasoning || ''
      if (!raw && msg?.reasoning_details?.length) {
        raw = msg.reasoning_details
          .filter(d => d.type === 'reasoning.text')
          .map(d => d.text ?? '')
          .join('\n')
      }
      if (!raw) throw new Error(`Empty response from ${model}`)

      // JSON extraction — strip thinking blocks + fences, then progressively try
      const jsonStr = raw
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '')
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()
      let parsed: unknown = null
      try {
        parsed = JSON.parse(jsonStr)
      } catch {
        const firstBrace = jsonStr.indexOf('{')
        const lastBrace = jsonStr.lastIndexOf('}')
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          try {
            parsed = JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1))
          } catch { /* fall through */ }
        }
      }
      if (parsed === null) {
        throw new Error(`Could not parse JSON from ${model}; first 200 chars: ${raw.slice(0, 200)}`)
      }
      return {
        raw,
        parsed,
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        durationMs: Date.now() - startedAt,
        model,
      }
    } catch (err) {
      clearTimeout(timeout)
      lastErr = err
      console.warn(`[module-decomposition] ${model} failed: ${(err as Error).message}; trying next...`)
      continue
    }
  }
  throw new Error(
    `All models failed for module-decomposition LLM call. Last error: ${(lastErr as Error)?.message ?? 'unknown'}`,
  )
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateModuleSpecShape(
  raw: unknown,
  index: number,
  errors: string[],
  paramWarnings: string[],
): ModuleSpec | null {
  if (!raw || typeof raw !== 'object') {
    errors.push(`modules[${index}] is not an object`)
    return null
  }
  const r = raw as Record<string, unknown>

  const moduleKey = r.module
  if (typeof moduleKey !== 'string' || !UNIVERSAL_MODULE_SET.has(moduleKey as UniversalModule)) {
    errors.push(`modules[${index}].module is invalid: ${String(moduleKey)}`)
    return null
  }

  const moduleBrief = typeof r.module_brief === 'string' ? r.module_brief.trim() : ''
  if (moduleBrief.length === 0) {
    errors.push(`modules[${index}].module_brief is empty`)
    return null
  }

  // derived_parameters
  const derivedRaw = r.derived_parameters
  const derived: DerivedParameters = {}
  if (derivedRaw && typeof derivedRaw === 'object') {
    for (const [k, v] of Object.entries(derivedRaw as Record<string, unknown>)) {
      if (typeof v === 'number') {
        if (!Number.isFinite(v) || v < 0) {
          paramWarnings.push(`modules[${index}].derived_parameters.${k}=${v} is invalid (must be finite, non-negative); stripped`)
          continue
        }
        derived[k] = v
      } else if (typeof v === 'string') {
        const trimmed = v.trim()
        if (trimmed.length > 0 && trimmed.length <= 80) {
          derived[k] = trimmed
        } else {
          paramWarnings.push(`modules[${index}].derived_parameters.${k} string length out of range (1-80); stripped`)
        }
      } else {
        paramWarnings.push(`modules[${index}].derived_parameters.${k} is neither number nor string; stripped`)
      }
    }
  }

  // allowed_radicals — fall back to module defaults if absent
  const radicalsRaw = Array.isArray(r.allowed_radicals) ? r.allowed_radicals : []
  const cleanedRadicals: string[] = []
  for (const rad of radicalsRaw) {
    if (typeof rad === 'string' && KNOWN_RADICALS.has(rad)) {
      if (!cleanedRadicals.includes(rad)) cleanedRadicals.push(rad)
    } else if (typeof rad === 'string') {
      paramWarnings.push(`modules[${index}].allowed_radicals contains unknown radical "${rad}"; dropped`)
    }
  }
  const allowedRadicals = cleanedRadicals.length > 0
    ? cleanedRadicals
    : [...MODULE_DEFAULT_ALLOWED_RADICALS[moduleKey as UniversalModule]]

  // applicability_confidence
  const confRaw = r.applicability_confidence
  const conf: ApplicabilityConfidence =
    confRaw === 'high' || confRaw === 'medium' || confRaw === 'low'
      ? confRaw
      : 'low'

  // secondary_modules — optional
  let secondary: UniversalModule[] | undefined
  if (Array.isArray(r.secondary_modules) && r.secondary_modules.length > 0) {
    secondary = []
    for (const s of r.secondary_modules) {
      if (typeof s === 'string' && UNIVERSAL_MODULE_SET.has(s as UniversalModule) && s !== moduleKey) {
        if (!secondary.includes(s as UniversalModule)) secondary.push(s as UniversalModule)
      }
    }
    if (secondary.length === 0) secondary = undefined
  }

  return {
    module: moduleKey as UniversalModule,
    module_brief: moduleBrief,
    derived_parameters: derived,
    allowed_radicals: allowedRadicals,
    applicability_confidence: conf,
    secondary_modules: secondary,
  }
}

function validateModuleDecompositionPayload(
  raw: unknown,
  classification: string,
): {
  validation: ModuleDecompositionValidation
  modules: ModuleSpec[]
  excluded: UniversalModule[]
  rationale: Partial<Record<UniversalModule, string>>
  productClass: string
  priorResult: PriorValidationResult
} {
  const errors: string[] = []
  const paramWarnings: string[] = []

  if (!raw || typeof raw !== 'object') {
    return {
      validation: { ok: false, schema_errors: ['response is not an object'], prior_warnings: [], parameter_warnings: [] },
      modules: [], excluded: [], rationale: {}, productClass: classification,
      priorResult: { ok: false, missing_required: [], forbidden_present: [], optional_present: [] },
    }
  }
  const root = raw as Record<string, unknown>
  const productClass = typeof root.product_class === 'string' && root.product_class.trim().length > 0
    ? root.product_class.trim()
    : classification

  // modules
  const modulesRaw = Array.isArray(root.modules) ? root.modules : []
  if (modulesRaw.length < 3 || modulesRaw.length > 12) {
    errors.push(`modules.length must be 3..12 (got ${modulesRaw.length})`)
  }
  const modules: ModuleSpec[] = []
  const seenPrimary = new Set<UniversalModule>()
  for (let i = 0; i < modulesRaw.length; i++) {
    const spec = validateModuleSpecShape(modulesRaw[i], i, errors, paramWarnings)
    if (spec) {
      if (seenPrimary.has(spec.module)) {
        errors.push(`modules[${i}].module="${spec.module}" duplicates an earlier entry`)
      } else {
        seenPrimary.add(spec.module)
        modules.push(spec)
      }
    }
  }

  // excluded_modules
  const excludedRaw = Array.isArray(root.excluded_modules) ? root.excluded_modules : []
  const excluded: UniversalModule[] = []
  for (const e of excludedRaw) {
    if (typeof e === 'string' && UNIVERSAL_MODULE_SET.has(e as UniversalModule)) {
      if (seenPrimary.has(e as UniversalModule)) {
        errors.push(`excluded_modules contains "${e}" which is also in modules`)
      } else if (!excluded.includes(e as UniversalModule)) {
        excluded.push(e as UniversalModule)
      }
    } else if (typeof e === 'string') {
      errors.push(`excluded_modules contains invalid key "${e}"`)
    }
  }

  // sum invariant
  if (errors.length === 0 && modules.length + excluded.length !== 12) {
    errors.push(`modules.length (${modules.length}) + excluded_modules.length (${excluded.length}) MUST equal 12`)
  }

  // rationale
  const rationaleRaw = root.rationale_excluded
  const rationale: Partial<Record<UniversalModule, string>> = {}
  if (rationaleRaw && typeof rationaleRaw === 'object') {
    for (const [k, v] of Object.entries(rationaleRaw as Record<string, unknown>)) {
      if (UNIVERSAL_MODULE_SET.has(k as UniversalModule) && typeof v === 'string' && v.trim().length > 0) {
        rationale[k as UniversalModule] = v.trim()
      }
    }
  }
  // every excluded module needs a rationale; missing rationale is a warning not an error
  for (const e of excluded) {
    if (!rationale[e]) {
      paramWarnings.push(`excluded module "${e}" has no rationale_excluded entry`)
    }
  }

  // Prior cross-check
  const normClass = normaliseProductClass(productClass)
  const prior = normClass ? CLASS_MODULE_PRIORS[normClass] : undefined
  const priorResult = validateAgainstPriors(modules.map(m => m.module), prior)
  const prior_warnings: string[] = []
  if (priorResult.missing_required.length > 0) {
    prior_warnings.push(`missing_required modules per ${normClass} prior: ${priorResult.missing_required.join(', ')}`)
  }
  if (priorResult.forbidden_present.length > 0) {
    errors.push(`forbidden_present modules per ${normClass} prior: ${priorResult.forbidden_present.join(', ')}`)
  }

  return {
    validation: {
      ok: errors.length === 0,
      schema_errors: errors,
      prior_warnings,
      parameter_warnings: paramWarnings,
    },
    modules,
    excluded,
    rationale,
    productClass,
    priorResult,
  }
}

// ---------------------------------------------------------------------------
// Council
// ---------------------------------------------------------------------------

function buildCouncilUserContent(
  modules: ModuleSpec[],
  excluded: UniversalModule[],
  rationale: Partial<Record<UniversalModule, string>>,
  parsedBrief: StructuredBriefJSON,
  classification: string,
): string {
  return [
    `[Product classification]`,
    classification,
    ``,
    `[Brief summary]`,
    JSON.stringify(parsedBrief, null, 2).slice(0, 3000),
    ``,
    `[Module catalog under review]`,
    JSON.stringify({
      product_class: classification,
      modules,
      excluded_modules: excluded,
      rationale_excluded: rationale,
    }, null, 2),
  ].join('\n')
}

function parseSeatReview(raw: unknown, seat: CouncilSeatId): CouncilSeatReview {
  const fallback: CouncilSeatReview = {
    seat,
    verdict: 'NEEDS_MAJOR',
    coverage_ok: false,
    no_spurious_modules: false,
    parameters_plausible: false,
    notes: ['failed to parse seat response — defaulting to NEEDS_MAJOR'],
  }
  if (!raw || typeof raw !== 'object') return fallback
  const r = raw as Record<string, unknown>
  const v = r.verdict
  const verdict: SeatVerdict =
    v === 'OK' || v === 'NEEDS_MINOR' || v === 'NEEDS_MAJOR' ? v : 'NEEDS_MAJOR'
  const notes = Array.isArray(r.notes)
    ? r.notes.filter((n): n is string => typeof n === 'string')
    : []
  return {
    seat,
    verdict,
    coverage_ok: r.coverage_ok === true,
    no_spurious_modules: r.no_spurious_modules === true,
    parameters_plausible: r.parameters_plausible === true,
    notes,
  }
}

function aggregateCouncilVerdict(seats: CouncilSeatReview[], lowConfidenceCount: number): CouncilVerdict {
  // Data-quality back-stop: ≥2 low-confidence modules → NEEDS_MAJOR regardless of seats
  if (lowConfidenceCount >= 2) return 'NEEDS_MAJOR'
  const majorCount = seats.filter(s => s.verdict === 'NEEDS_MAJOR').length
  if (majorCount >= 2) return 'NEEDS_MAJOR'
  if (majorCount === 1) {
    // Worst non-block verdict from the other three; promote one NEEDS_MAJOR to NEEDS_MINOR
    return 'NEEDS_MINOR'
  }
  const minorCount = seats.filter(s => s.verdict === 'NEEDS_MINOR').length
  if (minorCount >= 1) return 'NEEDS_MINOR'
  return 'OK'
}

async function runCouncil(
  modules: ModuleSpec[],
  excluded: UniversalModule[],
  rationale: Partial<Record<UniversalModule, string>>,
  parsedBrief: StructuredBriefJSON,
  classification: string,
): Promise<{ seats: CouncilSeatReview[]; aggregate: CouncilVerdict; notes: string[]; durationMs: number; inputTokens: number; outputTokens: number }> {
  const userContent = buildCouncilUserContent(modules, excluded, rationale, parsedBrief, classification)
  const startedAt = Date.now()

  const seatPromises = COUNCIL_SEATS.map(async ({ id, model }): Promise<CouncilSeatReview & { tokens: { input: number; output: number } }> => {
    try {
      const result = await callOpenRouterJson(
        MODULE_DECOMPOSITION_COUNCIL_PROMPT,
        userContent,
        [model],
        2048,
      )
      const review = parseSeatReview(result.parsed, id)
      return { ...review, tokens: { input: result.inputTokens, output: result.outputTokens } }
    } catch (err) {
      console.warn(`[module-decomposition] council seat "${id}" (${model}) failed: ${(err as Error).message}`)
      return {
        seat: id,
        verdict: 'NEEDS_MAJOR',
        coverage_ok: false,
        no_spurious_modules: false,
        parameters_plausible: false,
        notes: [`seat call failed: ${(err as Error).message}`],
        tokens: { input: 0, output: 0 },
      }
    }
  })
  const settled = await Promise.all(seatPromises)
  const seats: CouncilSeatReview[] = settled.map(s => ({
    seat: s.seat,
    verdict: s.verdict,
    coverage_ok: s.coverage_ok,
    no_spurious_modules: s.no_spurious_modules,
    parameters_plausible: s.parameters_plausible,
    notes: s.notes,
  }))
  const totalInput = settled.reduce((acc, s) => acc + s.tokens.input, 0)
  const totalOutput = settled.reduce((acc, s) => acc + s.tokens.output, 0)

  const lowConfidenceCount = modules.filter(m => m.applicability_confidence === 'low').length
  const aggregate = aggregateCouncilVerdict(seats, lowConfidenceCount)
  const notes = Array.from(new Set(seats.flatMap(s => s.notes))).slice(0, 30)

  return {
    seats,
    aggregate,
    notes,
    durationMs: Date.now() - startedAt,
    inputTokens: totalInput,
    outputTokens: totalOutput,
  }
}

// ---------------------------------------------------------------------------
// Cost estimate (rough, GBP)
// ---------------------------------------------------------------------------

function estimateCostGbp(inputTokens: number, outputTokens: number): number {
  // Average across council seats and gemini primary; ballpark from §6.3.
  // Conservative: £3/M input, £15/M output.
  return (inputTokens * 3 + outputTokens * 15) / 1_000_000
}

// ---------------------------------------------------------------------------
// Fallback path
// ---------------------------------------------------------------------------

function buildFallbackDecomposition(
  classification: string,
  parsedBrief: StructuredBriefJSON,
  failureNote: string,
): ModuleDecomposition | null {
  const normClass = normaliseProductClass(classification)
  const prior = normClass ? CLASS_MODULE_PRIORS[normClass] : undefined
  const list = buildFallbackModuleList(prior)
  if (!list || !prior) return null

  const modules: ModuleSpec[] = list.map(m => ({
    module: m,
    module_brief: `Fallback ModuleSpec for ${m} on a ${classification}. Stage 1.5 LLM failed validation; engine reverted to ClassModulePriors. Per-module Stage 2 will use default allowed_radicals.`,
    derived_parameters: {},
    allowed_radicals: [...MODULE_DEFAULT_ALLOWED_RADICALS[m]],
    applicability_confidence: 'low',
    secondary_modules: undefined,
  }))
  const excluded: UniversalModule[] = (UNIVERSAL_MODULES as readonly UniversalModule[])
    .filter(m => !modules.some(x => x.module === m))
  const rationale: Partial<Record<UniversalModule, string>> = {}
  for (const e of excluded) {
    rationale[e] = prior.forbidden.includes(e)
      ? `Forbidden by ${normClass} prior — does not apply to this product class.`
      : `Not in fallback catalog for ${normClass}.`
  }
  return {
    product_class: classification,
    normalised_class: normClass,
    modules,
    excluded_modules: excluded,
    rationale_excluded: rationale,
    council_verdict: 'NEEDS_MINOR',
    council_seats: [],
    council_notes: [failureNote, `fallback: built from CLASS_MODULE_PRIORS[${normClass}]`],
    telemetry: {
      llm_call_ms: 0,
      council_ms: 0,
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_gbp: 0,
      retried: true,
    },
  }
  // parsedBrief intentionally unused in fallback — the Stage 1.5 derived
  // parameters are LLM-derived; without an LLM, downstream gets empty {}.
  void parsedBrief
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

const STAGE_1_7_PRIMARY_MODELS = ['google/gemini-3.1-pro-preview', 'x-ai/grok-4.3']
const STAGE_1_7_MAX_TOKENS = 4096

/**
 * Run Stage 1.5 module decomposition.
 *
 *   1. Build the user prompt from parsedBrief + classification + (truncated) regulatory.
 *   2. Single LLM call (gemini primary, grok fallback) to emit ModuleDecomposition catalog.
 *   3. Validate schema + cross-check ClassModulePriors.
 *      - If schema_errors include forbidden_present OR sum-invariant violation,
 *        retry the LLM ONCE with the validation reminder appended.
 *   4. If validation passes, dispatch the 4-seat council in parallel.
 *      - 2+ NEEDS_MAJOR (or 2+ low-confidence modules) → retry LLM once with
 *        council notes appended; on second NEEDS_MAJOR, fall back to ClassModulePriors.
 *   5. Return the ModuleDecomposition with telemetry.
 */
export async function runModuleDecomposition(
  parsedBrief: StructuredBriefJSON,
  classification: string,
  regulatoryExtraction?: RegulatoryExtraction,
): Promise<StageResult<ModuleDecomposition>> {
  const startedAt = Date.now()
  console.log('[module-decomposition] Stage 1.5 starting (RADICAL_PHASE_3_PER_MODULE)...')

  if (!process.env.OPENROUTER_API_KEY) {
    return {
      ok: false,
      error: 'OPENROUTER_API_KEY is not set; Stage 1.5 cannot dispatch LLM calls',
      durationMs: Date.now() - startedAt,
    }
  }

  const allEntries = regulatoryExtraction?.regulatory_entries ?? []
  const regSummary = allEntries.length
    ? `\n\n[Regulatory entries from Stage 4 — first 20 of ${allEntries.length}]\n` +
      allEntries.slice(0, 20).map(e => `- ${e.standard_name} (${e.jurisdiction}): ${e.engineering_impact}`).join('\n')
    : ''

  const baseUserContent =
    `[Structured brief JSON from Stage 1]\n${JSON.stringify(parsedBrief, null, 2)}\n\n` +
    `[Product classification]\n${classification}` +
    regSummary

  // ── First LLM attempt + validation ────────────────────────────────────────
  let attempt1: LlmCallResult
  try {
    attempt1 = await callOpenRouterJson(
      MODULE_DECOMPOSITION_TAXONOMY_PROMPT,
      baseUserContent,
      STAGE_1_7_PRIMARY_MODELS,
      STAGE_1_7_MAX_TOKENS,
    )
  } catch (err) {
    return {
      ok: false,
      error: `Stage 1.5 LLM call failed: ${(err as Error).message}`,
      durationMs: Date.now() - startedAt,
    }
  }

  let v = validateModuleDecompositionPayload(attempt1.parsed, classification)
  let llmInput = attempt1.inputTokens
  let llmOutput = attempt1.outputTokens
  let llmDuration = attempt1.durationMs
  let retried = false

  // Retry once on schema failure with the validation reminder appended
  if (!v.validation.ok) {
    console.warn(
      `[module-decomposition] Stage 1.5 first attempt failed validation (${v.validation.schema_errors.length} errors). Retrying...`,
    )
    const reminder =
      `\n\nCRITICAL VALIDATION REQUIREMENTS (YOUR PREVIOUS RESPONSE FAILED THESE):\n` +
      v.validation.schema_errors.map(e => `- ${e}`).join('\n') +
      `\n\nReturn a fully corrected JSON catalog. modules.length + excluded_modules.length MUST equal 12.`
    try {
      const attempt2 = await callOpenRouterJson(
        MODULE_DECOMPOSITION_TAXONOMY_PROMPT,
        baseUserContent + reminder,
        STAGE_1_7_PRIMARY_MODELS,
        STAGE_1_7_MAX_TOKENS,
      )
      v = validateModuleDecompositionPayload(attempt2.parsed, classification)
      llmInput += attempt2.inputTokens
      llmOutput += attempt2.outputTokens
      llmDuration += attempt2.durationMs
      retried = true
    } catch (err) {
      console.warn(`[module-decomposition] retry threw: ${(err as Error).message}`)
    }
  }

  if (!v.validation.ok) {
    // Fallback to priors
    const fallback = buildFallbackDecomposition(
      classification,
      parsedBrief,
      `LLM emission failed validation twice: ${v.validation.schema_errors.join('; ')}`,
    )
    if (fallback) {
      console.warn(`[module-decomposition] Fell back to ClassModulePriors for class=${classification}`)
      return { ok: true, data: fallback, durationMs: Date.now() - startedAt }
    }
    return {
      ok: false,
      error: `Stage 1.5 validation failed twice and no class prior available for "${classification}": ${v.validation.schema_errors.join('; ')}`,
      durationMs: Date.now() - startedAt,
    }
  }

  // ── Council validation ────────────────────────────────────────────────────
  console.log(
    `[module-decomposition] LLM emitted ${v.modules.length} modules + ${v.excluded.length} excluded — dispatching 4-seat council...`,
  )
  const council = await runCouncil(v.modules, v.excluded, v.rationale, parsedBrief, classification)
  console.log(
    `[module-decomposition] Council verdict=${council.aggregate} (` +
    council.seats.map(s => `${s.seat}:${s.verdict}`).join(', ') +
    `)`,
  )

  let finalModules = v.modules
  let finalExcluded = v.excluded
  let finalRationale = v.rationale
  let finalCouncil = council
  let totalInput = llmInput + council.inputTokens
  let totalOutput = llmOutput + council.outputTokens

  if (council.aggregate === 'NEEDS_MAJOR') {
    console.warn('[module-decomposition] Council BLOCKED — retrying Stage 1.5 once with council notes appended...')
    const reminder =
      `\n\nCRITICAL COUNCIL FEEDBACK ON YOUR PREVIOUS CATALOG (4-seat council voted NEEDS_MAJOR):\n` +
      council.notes.map(n => `- ${n}`).join('\n') +
      `\n\nReturn a corrected JSON catalog addressing every point above.`
    try {
      const attempt3 = await callOpenRouterJson(
        MODULE_DECOMPOSITION_TAXONOMY_PROMPT,
        baseUserContent + reminder,
        STAGE_1_7_PRIMARY_MODELS,
        STAGE_1_7_MAX_TOKENS,
      )
      const v2 = validateModuleDecompositionPayload(attempt3.parsed, classification)
      llmInput += attempt3.inputTokens
      llmOutput += attempt3.outputTokens
      llmDuration += attempt3.durationMs
      retried = true
      if (v2.validation.ok) {
        const council2 = await runCouncil(v2.modules, v2.excluded, v2.rationale, parsedBrief, classification)
        totalInput = llmInput + council.inputTokens + council2.inputTokens
        totalOutput = llmOutput + council.outputTokens + council2.outputTokens
        if (council2.aggregate === 'NEEDS_MAJOR') {
          // fall back to priors
          const fallback = buildFallbackDecomposition(
            classification,
            parsedBrief,
            'Council BLOCKED twice; reverted to ClassModulePriors',
          )
          if (fallback) {
            console.warn('[module-decomposition] Council BLOCKED twice — falling back to ClassModulePriors')
            return { ok: true, data: fallback, durationMs: Date.now() - startedAt }
          }
          return {
            ok: false,
            error: 'Stage 1.5 council BLOCKED twice and no class prior available',
            durationMs: Date.now() - startedAt,
          }
        }
        finalModules = v2.modules
        finalExcluded = v2.excluded
        finalRationale = v2.rationale
        finalCouncil = council2
      } else {
        // Couldn't even validate the retry; fall back to priors
        const fallback = buildFallbackDecomposition(
          classification,
          parsedBrief,
          `Council retry validation failed: ${v2.validation.schema_errors.join('; ')}`,
        )
        if (fallback) {
          console.warn('[module-decomposition] Council retry validation failed — falling back to ClassModulePriors')
          return { ok: true, data: fallback, durationMs: Date.now() - startedAt }
        }
        return {
          ok: false,
          error: `Stage 1.5 council retry validation failed: ${v2.validation.schema_errors.join('; ')}`,
          durationMs: Date.now() - startedAt,
        }
      }
    } catch (err) {
      console.warn(`[module-decomposition] Council retry threw: ${(err as Error).message}`)
      const fallback = buildFallbackDecomposition(
        classification,
        parsedBrief,
        `Council retry exception: ${(err as Error).message}`,
      )
      if (fallback) {
        return { ok: true, data: fallback, durationMs: Date.now() - startedAt }
      }
      return {
        ok: false,
        error: `Stage 1.5 council retry exception: ${(err as Error).message}`,
        durationMs: Date.now() - startedAt,
      }
    }
  }

  // ── Build final ModuleDecomposition ──────────────────────────────────────
  const allCouncilNotes = [
    ...finalCouncil.notes,
    ...v.validation.parameter_warnings,
    ...v.validation.prior_warnings,
  ]
  const telemetry: ModuleDecompositionTelemetry = {
    llm_call_ms: llmDuration,
    council_ms: finalCouncil.durationMs,
    input_tokens: totalInput,
    output_tokens: totalOutput,
    estimated_cost_gbp: estimateCostGbp(totalInput, totalOutput),
    retried,
  }

  const data: ModuleDecomposition = {
    product_class: v.productClass,
    normalised_class: normaliseProductClass(v.productClass),
    modules: finalModules,
    excluded_modules: finalExcluded,
    rationale_excluded: finalRationale,
    council_verdict: finalCouncil.aggregate,
    council_seats: finalCouncil.seats,
    council_notes: allCouncilNotes,
    telemetry,
  }

  return { ok: true, data, durationMs: Date.now() - startedAt }
}

// ---------------------------------------------------------------------------
// Test-only exports (kept stable so unit tests can hit the helpers directly)
// ---------------------------------------------------------------------------

export const __test = {
  validateModuleDecompositionPayload,
  aggregateCouncilVerdict,
  parseSeatReview,
  buildFallbackDecomposition,
  KNOWN_RADICALS,
  COUNCIL_SEATS,
}
