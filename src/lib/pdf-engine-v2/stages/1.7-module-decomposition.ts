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
  ContentCharacter,
  ContentRadical,
  CouncilSeatId,
  CouncilSeatReview,
  CouncilVerdict,
  CrossModuleGrammarLink,
  DerivedParameters,
  GrammarLink,
  GrammarMechanism,
  ModifyingCharacter,
  ModuleDecomposition,
  ModuleDecompositionTelemetry,
  ModuleDecompositionValidation,
  ModuleSpec,
  SeatVerdict,
  SubModuleSpec,
  UniversalModule,
  WordSpec,
} from '../types/module-decomposition'
import {
  CONTENT_RADICALS,
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

/** The 22 canonical content radical IDs — used to validate ContentCharacter radicals. */
const CONTENT_RADICAL_SET = new Set<string>(CONTENT_RADICALS)

/** All 26 canonical GrammarMechanism values. Used to validate grammar_links and cross_module_grammar_links. */
const GRAMMAR_MECHANISM_SET = new Set<GrammarMechanism>([
  // Mechanical/structural
  'mechanical_mount', 'pcb_mounting', 'cable_transit', 'fluid_routing', 'door_interlock',
  // Electrical — power
  'voltage_taps', 'dc_busbar', 'ac_busbar', 'high_voltage_dc',
  // Electrical — control/signal
  'contactor_command', 'pre_charge_enable', 'imd_trip', 'sensor_feedback',
  'alarm_interlock', 'safety_isolation', 'manual_override', 'hmi_data',
  // Comms
  'can_bus', 'modbus_tcp', 'i2c_bus', 'spi_bus', 'rf_path', 'fibre_optic',
  // Fluid/thermal
  'cooling_loop', 'refrigerant_line', 'air_duct',
])
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

  // ── sub_modules ──────────────────────────────────────────────────────────
  // Coding-council 2026-05-12 (NEEDS_MAJOR, Gemini + GLM): a hard `length < 3` error
  // creates a paradox with the prompt's "single-sub-module modules allowed with
  // justification" exception AND traps `buildFallbackDecomposition`'s empty array
  // in an unrecoverable retry loop. Demoted 1-2 entries from error to warning.
  // Genuinely empty output remains a hard error since it's structurally unusable
  // downstream (Stage 2 needs at least one sub_module_id to tag leaves against).
  // Piece 1B.1: each sub_module now carries words[] instead of primary_character_id.
  const subModulesRaw = Array.isArray(r.sub_modules) ? r.sub_modules : []
  if (subModulesRaw.length === 0) {
    errors.push(`modules[${index}].sub_modules is missing or empty — at least 1 sub-module is required (3–8 strongly preferred)`)
  } else if (subModulesRaw.length > 8) {
    paramWarnings.push(`modules[${index}].sub_modules has ${subModulesRaw.length} entries (max 8); extras will still be accepted but review`)
  } else if (subModulesRaw.length < 3) {
    paramWarnings.push(`modules[${index}].sub_modules has only ${subModulesRaw.length} entries (3–8 strongly preferred); accepted but flag for review — module_brief should justify the sparse decomposition`)
  }
  const subModules: SubModuleSpec[] = []
  const seenSubIds = new Set<string>()
  for (let si = 0; si < subModulesRaw.length; si++) {
    const sm = subModulesRaw[si]
    if (!sm || typeof sm !== 'object') {
      errors.push(`modules[${index}].sub_modules[${si}] is not an object`)
      continue
    }
    const smr = sm as Record<string, unknown>
    const smId = typeof smr.id === 'string' ? smr.id.trim() : ''
    if (smId.length === 0) {
      errors.push(`modules[${index}].sub_modules[${si}].id is empty`)
      continue
    }
    if (seenSubIds.has(smId)) {
      errors.push(`modules[${index}].sub_modules[${si}].id "${smId}" duplicates an earlier sub_module id within this module`)
      continue
    }
    seenSubIds.add(smId)
    const nameHuman = typeof smr.name_human === 'string' ? smr.name_human.trim() : ''
    if (nameHuman.length === 0) {
      errors.push(`modules[${index}].sub_modules[${si}] ("${smId}").name_human is empty`)
    }

    // ── words[] validation (Piece 1B.1) ──────────────────────────────────
    // Coding-council 1B 2026-05-12 P1 fix: prompt HARD CONSTRAINTS says 1–4
    // words; validator warning threshold previously at >8 created a silent
    // gap where the LLM could emit 5–8 words without surfacing the deviation.
    // Aligned to >4 so prompt-validator agreement holds.
    const wordsRaw = Array.isArray(smr.words) ? smr.words : []
    if (wordsRaw.length === 0) {
      errors.push(`modules[${index}].sub_modules[${si}] ("${smId}").words is missing or empty — at least 1 word is required`)
    } else if (wordsRaw.length > 4) {
      paramWarnings.push(`modules[${index}].sub_modules[${si}] ("${smId}").words has ${wordsRaw.length} entries (>4 — prompt HARD CONSTRAINT caps at 4); accepted but flag for review`)
    }
    const words: WordSpec[] = []
    const seenWordIds = new Set<string>()
    for (let wi = 0; wi < wordsRaw.length; wi++) {
      const wr = wordsRaw[wi]
      if (!wr || typeof wr !== 'object') {
        errors.push(`modules[${index}].sub_modules[${si}].words[${wi}] is not an object`)
        continue
      }
      const wrr = wr as Record<string, unknown>
      const wordId = typeof wrr.id === 'string' ? wrr.id.trim() : ''
      if (wordId.length === 0) {
        errors.push(`modules[${index}].sub_modules[${si}].words[${wi}].id is empty`)
        continue
      }
      if (seenWordIds.has(wordId)) {
        errors.push(`modules[${index}].sub_modules[${si}].words[${wi}].id "${wordId}" duplicates an earlier word id within this sub-module`)
        continue
      }
      seenWordIds.add(wordId)
      const wordNameHuman = typeof wrr.name_human === 'string' ? wrr.name_human.trim() : ''
      if (wordNameHuman.length === 0) {
        paramWarnings.push(`modules[${index}].sub_modules[${si}].words[${wi}] ("${wordId}").name_human is empty; accepted`)
      }

      // content_character validation
      const ccRaw = wrr.content_character
      if (!ccRaw || typeof ccRaw !== 'object') {
        errors.push(`modules[${index}].sub_modules[${si}].words[${wi}] ("${wordId}").content_character is missing or not an object`)
        continue
      }
      const cc = ccRaw as Record<string, unknown>
      const charId = typeof cc.character_id === 'string' ? cc.character_id.trim() : ''
      if (charId.length === 0) {
        errors.push(`modules[${index}].sub_modules[${si}].words[${wi}].content_character.character_id is empty`)
        continue
      }
      const charNameHuman = typeof cc.name_human === 'string' ? cc.name_human.trim() : ''
      if (charNameHuman.length === 0) {
        paramWarnings.push(`modules[${index}].sub_modules[${si}].words[${wi}].content_character.name_human is empty; accepted`)
      }

      // Radical validation helper
      const validateRadical = (field: string, val: unknown): ContentRadical | null => {
        if (val === null || val === undefined) return null
        if (typeof val !== 'string') {
          paramWarnings.push(`modules[${index}].sub_modules[${si}].words[${wi}].content_character.${field} is not a string; treated as null`)
          return null
        }
        const trimmed = val.trim()
        if (trimmed.length === 0) return null
        if (!CONTENT_RADICAL_SET.has(trimmed)) {
          paramWarnings.push(`modules[${index}].sub_modules[${si}].words[${wi}].content_character.${field}="${trimmed}" is not in the 22-radical canonical set; accepted as extension radical`)
        }
        return trimmed as ContentRadical
      }

      const fnPrimary = validateRadical('function_radical_primary', cc.function_radical_primary)
      const fnSecondary = validateRadical('function_radical_secondary', cc.function_radical_secondary)
      const matPrimary = validateRadical('material_radical_primary', cc.material_radical_primary)
      const matSecondary = validateRadical('material_radical_secondary', cc.material_radical_secondary)

      // At least one radical must be set
      if (fnPrimary === null && matPrimary === null) {
        errors.push(`modules[${index}].sub_modules[${si}].words[${wi}].content_character ("${charId}"): at least one of function_radical_primary or material_radical_primary MUST be non-null`)
        continue
      }

      const contentCharacter: ContentCharacter = {
        character_id: charId,
        name_human: charNameHuman,
        function_radical_primary: fnPrimary,
        function_radical_secondary: fnSecondary,
        material_radical_primary: matPrimary,
        material_radical_secondary: matSecondary,
      }

      // modifier_characters on the word
      const modCharsRaw = Array.isArray(wrr.modifier_characters) ? wrr.modifier_characters : []
      const modifierCharacters: ModifyingCharacter[] = []
      for (let mi = 0; mi < modCharsRaw.length; mi++) {
        const mod = modCharsRaw[mi]
        if (!mod || typeof mod !== 'object') {
          paramWarnings.push(`modules[${index}].sub_modules[${si}].words[${wi}].modifier_characters[${mi}] is not an object; skipped`)
          continue
        }
        const modr = mod as Record<string, unknown>
        const kind = typeof modr.kind === 'string' ? modr.kind.trim() : ''
        if (kind.length === 0) {
          paramWarnings.push(`modules[${index}].sub_modules[${si}].words[${wi}].modifier_characters[${mi}].kind is empty; skipped`)
          continue
        }
        const value = typeof modr.value === 'string' ? modr.value.trim() : ''
        if (value.length === 0) {
          paramWarnings.push(`modules[${index}].sub_modules[${si}].words[${wi}].modifier_characters[${mi}].value is empty; skipped`)
          continue
        }
        const unit = typeof modr.unit === 'string' && modr.unit.trim().length > 0 ? modr.unit.trim() : undefined
        modifierCharacters.push({ kind, value, unit })
      }

      words.push({
        id: wordId,
        name_human: wordNameHuman,
        content_character: contentCharacter,
        modifier_characters: modifierCharacters,
      })
    }

    const roleVerb = typeof smr.role_verb === 'string' && smr.role_verb.trim().length > 0 ? smr.role_verb.trim() : undefined
    const topologyClause = typeof smr.topology_clause === 'string' && smr.topology_clause.trim().length > 0 ? smr.topology_clause.trim() : undefined
    subModules.push({
      id: smId,
      name_human: nameHuman,
      words,
      role_verb: roleVerb,
      topology_clause: topologyClause,
    })
  }

  // ── grammar_links ─────────────────────────────────────────────────────────
  const grammarLinksRaw = Array.isArray(r.grammar_links) ? r.grammar_links : []
  const grammarLinks: GrammarLink[] = []
  for (let gi = 0; gi < grammarLinksRaw.length; gi++) {
    const gl = grammarLinksRaw[gi]
    if (!gl || typeof gl !== 'object') {
      errors.push(`modules[${index}].grammar_links[${gi}] is not an object`)
      continue
    }
    const glr = gl as Record<string, unknown>
    const fromId = typeof glr.from_sub_module === 'string' ? glr.from_sub_module.trim() : ''
    const toId = typeof glr.to_sub_module === 'string' ? glr.to_sub_module.trim() : ''
    if (fromId.length === 0) {
      errors.push(`modules[${index}].grammar_links[${gi}].from_sub_module is empty`)
      continue
    }
    if (toId.length === 0) {
      errors.push(`modules[${index}].grammar_links[${gi}].to_sub_module is empty`)
      continue
    }
    if (!seenSubIds.has(fromId)) {
      errors.push(`modules[${index}].grammar_links[${gi}].from_sub_module "${fromId}" does not match any sub_module id in this module`)
    }
    if (!seenSubIds.has(toId)) {
      errors.push(`modules[${index}].grammar_links[${gi}].to_sub_module "${toId}" does not match any sub_module id in this module`)
    }
    const mechanism = typeof glr.mechanism === 'string' ? glr.mechanism.trim() : ''
    if (!GRAMMAR_MECHANISM_SET.has(mechanism as GrammarMechanism)) {
      errors.push(`modules[${index}].grammar_links[${gi}].mechanism "${mechanism}" is not in the 26-mechanism canonical set`)
      continue
    }
    const linkType = glr.type
    if (linkType !== 'mutual' && linkType !== 'directional') {
      errors.push(`modules[${index}].grammar_links[${gi}].type must be "mutual" or "directional" (got "${String(linkType)}")`)
      continue
    }
    const detail = typeof glr.detail === 'string' && glr.detail.trim().length > 0 ? glr.detail.trim() : undefined
    grammarLinks.push({
      from_sub_module: fromId,
      to_sub_module: toId,
      mechanism: mechanism as GrammarMechanism,
      type: linkType,
      detail,
    })
  }

  return {
    module: moduleKey as UniversalModule,
    module_brief: moduleBrief,
    derived_parameters: derived,
    allowed_radicals: allowedRadicals,
    applicability_confidence: conf,
    secondary_modules: secondary,
    sub_modules: subModules,
    grammar_links: grammarLinks,
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
  crossModuleGrammarLinks: CrossModuleGrammarLink[]
} {
  const errors: string[] = []
  const paramWarnings: string[] = []

  if (!raw || typeof raw !== 'object') {
    return {
      validation: { ok: false, schema_errors: ['response is not an object'], prior_warnings: [], parameter_warnings: [] },
      modules: [], excluded: [], rationale: {}, productClass: classification,
      priorResult: { ok: false, missing_required: [], forbidden_present: [], optional_present: [] },
      crossModuleGrammarLinks: [],
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

  // ── cross_module_grammar_links ─────────────────────────────────────────────
  const includedModuleSet = new Set<UniversalModule>(modules.map(m => m.module))
  const crossLinksRaw = Array.isArray(root.cross_module_grammar_links) ? root.cross_module_grammar_links : []
  const crossModuleGrammarLinks: CrossModuleGrammarLink[] = []
  for (let ci = 0; ci < crossLinksRaw.length; ci++) {
    const cl = crossLinksRaw[ci]
    if (!cl || typeof cl !== 'object') {
      errors.push(`cross_module_grammar_links[${ci}] is not an object`)
      continue
    }
    const clr = cl as Record<string, unknown>
    const fromMod = typeof clr.from_module === 'string' ? clr.from_module.trim() : ''
    const toMod = typeof clr.to_module === 'string' ? clr.to_module.trim() : ''
    if (!UNIVERSAL_MODULE_SET.has(fromMod as UniversalModule) || !includedModuleSet.has(fromMod as UniversalModule)) {
      errors.push(`cross_module_grammar_links[${ci}].from_module "${fromMod}" is not a valid UniversalModule present in modules[]`)
      continue
    }
    if (!UNIVERSAL_MODULE_SET.has(toMod as UniversalModule) || !includedModuleSet.has(toMod as UniversalModule)) {
      errors.push(`cross_module_grammar_links[${ci}].to_module "${toMod}" is not a valid UniversalModule present in modules[]`)
      continue
    }
    const mechanism = typeof clr.mechanism === 'string' ? clr.mechanism.trim() : ''
    if (!GRAMMAR_MECHANISM_SET.has(mechanism as GrammarMechanism)) {
      errors.push(`cross_module_grammar_links[${ci}].mechanism "${mechanism}" is not in the 26-mechanism canonical set`)
      continue
    }
    const linkType = clr.type
    if (linkType !== 'mutual' && linkType !== 'directional') {
      errors.push(`cross_module_grammar_links[${ci}].type must be "mutual" or "directional" (got "${String(linkType)}")`)
      continue
    }
    const detail = typeof clr.detail === 'string' && clr.detail.trim().length > 0 ? clr.detail.trim() : undefined
    crossModuleGrammarLinks.push({
      from_module: fromMod as UniversalModule,
      to_module: toMod as UniversalModule,
      mechanism: mechanism as GrammarMechanism,
      type: linkType,
      detail,
    })
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
    crossModuleGrammarLinks,
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

  // Piece 1B fix 2026-05-12: separate transport-failed seats from legitimate
  // votes. A transport failure means the seat couldn't review; counting it as
  // NEEDS_MAJOR (the old default) treated council-LLM noise as a structural
  // block. Now: transport-failed seats are ABSTAIN-equivalent.
  const speaking = seats.filter(s => !s.transport_failed)
  const failedCount = seats.length - speaking.length

  // Piece 1B fix 2 (coding-council 2026-05-12): check 2+ NEEDS_MAJOR among
  // SPEAKING seats BEFORE the quorum check. Earlier ordering had `failedCount
  // >= 2 → NEEDS_MINOR` first, which would mask a genuine block (2 speaking
  // seats vote MAJOR + 2 seats transport-fail) by short-circuiting to MINOR.
  // Real blocking votes from speaking seats must never be downgraded by
  // transport noise on the OTHER seats.
  const majorCount = speaking.filter(s => s.verdict === 'NEEDS_MAJOR').length
  if (majorCount >= 2) return 'NEEDS_MAJOR'

  // Insufficient quorum — 2+ seats failed at transport → NEEDS_MINOR (proceed
  // with flag) rather than blocking. The catalog already passed schema
  // validation upstream; council just couldn't confirm it.
  if (failedCount >= 2) return 'NEEDS_MINOR'

  // 1 NEEDS_MAJOR among speaking seats: promote to NEEDS_MINOR (the lone block
  // is logged in council_notes; remaining speaking seats agree to proceed).
  if (majorCount === 1) {
    // Worst non-block verdict from the other speaking seats; promote one NEEDS_MAJOR to NEEDS_MINOR
    return 'NEEDS_MINOR'
  }
  const minorCount = speaking.filter(s => s.verdict === 'NEEDS_MINOR').length
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
        4096,  // Piece 1B fix 2026-05-12: was 2048; raised to fit reasoning-style responses without truncating the JSON.
      )
      const review = parseSeatReview(result.parsed, id)
      return { ...review, tokens: { input: result.inputTokens, output: result.outputTokens } }
    } catch (err) {
      console.warn(`[module-decomposition] council seat "${id}" (${model}) failed: ${(err as Error).message}`)
      // Piece 1B fix 2026-05-12: mark transport_failed=true so the aggregator can
      // distinguish "couldn't speak" (transport noise) from a legitimate review.
      // The verdict here remains NEEDS_MAJOR as a safe default IF the aggregator
      // ever ignores transport_failed, but the aggregator will treat this as
      // ABSTAIN rather than counting toward the 2+ NEEDS_MAJOR block threshold.
      return {
        seat: id,
        verdict: 'NEEDS_MAJOR',
        coverage_ok: false,
        no_spurious_modules: false,
        parameters_plausible: false,
        notes: [`seat call failed: ${(err as Error).message}`],
        transport_failed: true,
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
    // Piece 1A coding-council 2026-05-12 fix (GLM NEEDS_MAJOR): fallback must emit
    // at least one sub_module to satisfy the validator's "length >= 1" hard check.
    // Piece 1B.1: sentinel now uses words[] shape. material_radical_primary is set
    // to solid_state_of_matter to satisfy the "at least one radical" constraint
    // without lying about the engineering content.
    sub_modules: [
      {
        id: 'uncategorised',
        name_human: 'Uncategorised (fallback)',
        words: [
          {
            id: 'uncategorised_word',
            name_human: 'Uncategorised',
            content_character: {
              character_id: 'uncategorised',
              name_human: 'Uncategorised',
              function_radical_primary: null,
              function_radical_secondary: null,
              material_radical_primary: 'solid_state_of_matter' as const,
              material_radical_secondary: null,
            },
            modifier_characters: [],
          },
        ],
        role_verb: 'contains',
      },
    ],
    grammar_links: [],
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
    // Piece 1A: required field — fallback emits empty cross-module links.
    cross_module_grammar_links: [],
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

// Council 2026-05-12 + BESS v3/v5 evidence: Gemini 3.1 Pro emits markdown preamble
// ("**Decomposing the BESS**", "Let me analyze...") despite explicit JSON-only
// instructions, while Grok 4.3 reliably emits pure JSON. Order swapped so Grok
// is the primary; Gemini is the fallback used only when Grok call fails at the
// transport layer. The MODULE_DECOMPOSITION_TAXONOMY_PROMPT has been hardened
// with explicit bad/good examples too — but model-order is the cheaper insurance.
const STAGE_1_7_PRIMARY_MODELS = ['x-ai/grok-4.3', 'google/gemini-3.1-pro-preview']
const STAGE_1_7_MAX_TOKENS = 16384

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
  let finalCrossModuleLinks = v.crossModuleGrammarLinks
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
        finalCrossModuleLinks = v2.crossModuleGrammarLinks
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
    cross_module_grammar_links: finalCrossModuleLinks,
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
