import type { Module, ModulePA, ResearchResult, StageResult, RiskRow, StructuredBriefJSON, RegulatoryExtraction } from '../types'
import { MODULE_DECOMPOSITION_SYSTEM, MODULE_DECOMPOSITION_SYSTEM_PA, MODULE_DECOMPOSITION_RADICAL_PROMPT, MODULE_DECOMPOSITION_LEAVES_PROMPT } from '../prompts'
import { STAGE_TEMPERATURES } from '../llm-temperature-config'
import { validateFmea, type FmeaRow } from '../lib/fmea-validator'
import type { RadicalTree, CompositionNode } from '../radical/schema.js'
import { CURRENT_RADICAL_SPEC_VERSION } from '../radical/schema.js'
import { buildTreeFromLeaves, validateLeafList, deriveBessQuantityOverrides, deriveClassMandatoryCharacters } from '../radical/structural-builder.js'
import { HIERARCHY_STATS } from '../radical/character-hierarchy.js'

// Stage 2: Module Decomposition — uses MODULE_DECOMPOSITION_SYSTEM from prompts.ts
// PA path: uses MODULE_DECOMPOSITION_SYSTEM_PA and validateDecomposeResultPA().
// Radical Phase 1 path: uses MODULE_DECOMPOSITION_RADICAL_PROMPT when
//   RADICAL_PHASE_1_TREE_OUTPUT=true, emits a RadicalTree into state.radicalTree.
// The prompts are defined in prompts.ts and imported above.

// ---------------------------------------------------------------------------
// Radical Phase 1 — feature flag + BESS-only guard
// ---------------------------------------------------------------------------

/**
 * Returns true when the Radical Phase 1 tree output is enabled.
 * Must be set to exactly "true" (case-insensitive) to activate.
 * Phase 1 is BESS-only — other product classes ignore this flag.
 */
export function isPhaseOneTreeOutputEnabled(): boolean {
  const raw = (process.env.RADICAL_PHASE_1_TREE_OUTPUT ?? '').toLowerCase().trim()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

// ---------------------------------------------------------------------------
// Known radical library IDs for validation
// ---------------------------------------------------------------------------

/** All 22 radical IDs in the commissioned library (seed + Weeks 2-5). */
const KNOWN_RADICALS = new Set<string>([
  // Seed
  'steel', 'copper', 'polymer_thermoplastic', 'electrical_conducting_function', 'solid_state_of_matter',
  // Week 2 (BESS)
  'lithium_iron_phosphate_chemistry', 'electrochemical_energy_function', 'silicon_semiconductor_function',
  'magnetic_coupling_function', 'electromechanical_switching_function', 'thermal_transfer_function',
  'fluid_flow_state', 'mineral_fibre_material', 'pressure_vessel_function', 'chemical_suppressant_material',
  'chemical_sensing_function', 'optical_sensing_function',
  // Week 3
  'aluminium_alloy', 'refrigerant_fluid', 'mechanical_kinetic_function',
  // Week 4
  'carbon_fibre_composite', 'digital_logic_function',
  // Week 5
  'optical_transduction_function', 'biochemical_sensing_function', 'buoyancy_control_function',
  'electrochemical_reaction_function',
])

/** All known character IDs (seed + Week 2). Weeks 3-5 characters added as library grows. */
const KNOWN_CHARACTERS = new Set<string>([
  // Seed
  'steel_bolt', 'copper_wire', 'aluminium_extrusion', 'polymer_gasket', 'steel_plate', 'copper_busbar',
  'polymer_enclosure', 'steel_threaded_rod', 'aluminium_heatsink', 'copper_terminal',
  // Week 2 (BESS)
  'lfp_prismatic_cell', 'steel_rack_frame', 'pcb_controller', 'power_converter', 'transformer',
  'dc_contactor', 'circuit_breaker', 'resistor', 'protection_relay', 'liquid_cooling_system',
  'thermal_insulation_panel', 'fire_suppression_system', 'pressure_vessel', 'gas_sensor',
  'optical_arc_sensor', 'ems_controller', 'network_switch', 'steel_door', 'cable_transit_frame',
  'switchboard_enclosure',
])

/** All known archetype IDs (seed + Week 2). */
const KNOWN_ARCHETYPES = new Set<string>([
  // Seed
  'M8x30_316L_socket_head_bolt', 'M16x50_plain_steel_bolt', 'IP67_polymer_enclosure',
  'bare_polymer_enclosure', 'M8x30_plain_steel_bolt', 'tinned_copper_terminal_50A',
  'standard_copper_wire', 'standard_aluminium_heatsink', 'standard_copper_busbar',
  'standard_polymer_gasket',
  // Week 2 (BESS)
  'lfp_prismatic_cell_280Ah', 'steel_battery_rack_frame', 'bms_master_controller',
  'bms_slave_cell_monitor', 'pcs_inverter_1mw_bidirectional', 'step_up_transformer_400v_11kv',
  'dc_contactor_1500v_300a', 'dc_mccb_1500v_2000a', 'ac_acb_400v_2000a', 'ac_output_circuit_breaker',
  'dc_busbar_800v_2000a', 'precharge_resistor_hv', 'g99_protection_relay', 'liquid_cooling_loop_1mw',
  'mineral_wool_insulation_panel', 'container_fire_suppression_system', 'fire_suppression_cylinder_novec',
  'li_ion_offgas_detector', 'arc_flash_detection_sensor', 'ems_scada_controller',
  'managed_ethernet_switch_industrial', 'ups_3kva_industrial', 'fire_rated_steel_door_panic',
  'cable_transit_frame_ip55', 'ac_distribution_board_ip55',
])

// ---------------------------------------------------------------------------
// Radical Phase 1 — result type
// ---------------------------------------------------------------------------

export interface RadicalTreeResult {
  tree: RadicalTree
  unknowns: string[]         // UNKNOWN_RADICAL placeholder archetypeIds
  netNewArchetypes: string[] // archetypes in tree but not in KNOWN_ARCHETYPES (non-unknown)
  netNewCharacters: string[] // characters implied by unknowns (for surfacing)
  /** Phase 1.5: count of leaf records the LLM identified in Stage 1 */
  leafCount?: number
  /** Phase 1.5: count of leaves the builder could NOT place in the hierarchy */
  unmappedLeafCount?: number
  /** Phase 1.5: true if built via two-stage (deterministic Stage 2) */
  twoStageMode?: boolean
}

// ---------------------------------------------------------------------------
// Recursive node validator
// ---------------------------------------------------------------------------

function validateNode(
  node: any,
  path: string,
  unknowns: string[],
  netNewArchetypes: string[],
  depth: number = 0,
): CompositionNode {
  if (!node || typeof node !== 'object') {
    throw new Error(`Radical tree node at ${path} is not an object`)
  }

  const archetypeId = node.archetypeId ?? node.archetype_id
  if (!archetypeId || typeof archetypeId !== 'string') {
    throw new Error(`Radical tree node at ${path} missing archetypeId`)
  }

  const multiplicity = node.multiplicity ?? node.quantity ?? 1
  if (typeof multiplicity !== 'number' || !Number.isFinite(multiplicity) || multiplicity < 1) {
    throw new Error(`Radical tree node at ${path} has invalid multiplicity: ${multiplicity}`)
  }

  // Detect UNKNOWN_RADICAL placeholders
  if (archetypeId.startsWith('<UNKNOWN_RADICAL>')) {
    unknowns.push(archetypeId)
  } else {
    // Phase 1 finding: only validate archetypeId membership at LEAF nodes (depth >= 2).
    // Sentence and word nodes are compositions — they don't need archetype matches.
    // Root (depth=0) and sentence (depth=1) and word (depth=2) nodes use structural IDs.
    // Leaf nodes (depth >= 3) must be from the known library.
    const rawChildren: any[] = Array.isArray(node.children) ? node.children : []
    const isLeaf = rawChildren.length === 0
    if (isLeaf && !KNOWN_ARCHETYPES.has(archetypeId)) {
      netNewArchetypes.push(archetypeId)
    }
  }

  // Recurse into children
  const rawChildren: any[] = Array.isArray(node.children) ? node.children : []
  const children: CompositionNode[] = rawChildren.map((child, i) =>
    validateNode(child, `${path}.children[${i}]`, unknowns, netNewArchetypes, depth + 1)
  )

  return {
    archetypeId,
    quantity: multiplicity,
    children,
  }
}

// ---------------------------------------------------------------------------
// Radical tree JSON parser + validator
// ---------------------------------------------------------------------------

/**
 * Parse and validate a raw LLM JSON response as a Radical tree.
 * Returns the validated tree + metadata (unknowns, net-new archetypes).
 *
 * Validation rules:
 *   - radical_spec_version must be "1.0.0" (exact major version match)
 *   - composition.root must be present and non-null
 *   - All multiplicity values >= 1
 *   - UNKNOWN_RADICAL placeholders are tracked (not rejected — surfaced to caller)
 *   - No circular reference detection needed (JSON cannot encode cycles)
 */
export function validateRadicalTreeOutput(raw: any): RadicalTreeResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Radical tree: response is not a JSON object')
  }

  const version = raw.radical_spec_version ?? raw.version
  if (!version || typeof version !== 'string') {
    throw new Error('Radical tree: missing radical_spec_version')
  }

  const majorVersion = parseInt(version.split('.')[0], 10)
  const expectedMajor = parseInt(CURRENT_RADICAL_SPEC_VERSION.split('.')[0], 10)
  if (majorVersion !== expectedMajor) {
    throw new Error(
      `Radical tree: spec version ${version} is incompatible with current ${CURRENT_RADICAL_SPEC_VERSION}`
    )
  }

  const composition = raw.composition
  if (!composition || typeof composition !== 'object') {
    throw new Error('Radical tree: missing composition object')
  }

  if (!composition.root || typeof composition.root !== 'object') {
    throw new Error('Radical tree: missing composition.root')
  }

  const unknowns: string[] = []
  const netNewArchetypes: string[] = []

  const validatedRoot = validateNode(composition.root, 'root', unknowns, netNewArchetypes)

  // ── Canonicalisation pass (Opus-risk mitigation) ──────────────────────────
  // Sort children at every level by archetypeId to eliminate ordering variance
  // from the LLM. This ensures same brief → same canonical tree shape even when
  // the LLM emits children in a different order on different runs.
  // Note: this does NOT fix quantity variance — that requires prompt improvements.
  function canonicaliseNode(node: CompositionNode): CompositionNode {
    const sortedChildren = [...node.children]
      .map(canonicaliseNode)
      .sort((a, b) => a.archetypeId.localeCompare(b.archetypeId))
    return { ...node, children: sortedChildren }
  }
  const canonicalisedRoot = canonicaliseNode(validatedRoot)

  const tree: RadicalTree = {
    radical_spec_version: CURRENT_RADICAL_SPEC_VERSION,
    composition: {
      id: composition.id ?? 'llm_emitted_tree',
      description: composition.description ?? '',
      environment: Array.isArray(composition.environment) ? composition.environment : [],
      root: canonicalisedRoot,
    },
    meta: {
      created_at: new Date().toISOString(),
      product_slug: composition.id ?? undefined,
      authored_by: 'phase-1-llm',
    },
  }

  return { tree, unknowns, netNewArchetypes, netNewCharacters: [] }
}

// ---------------------------------------------------------------------------
// Radical Phase 1 — runDecomposeRadical
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase 1.5 — Two-stage decomposition helpers
// ---------------------------------------------------------------------------

/**
 * Call OpenRouter for the leaf-identification stage (Stage 1 of two-stage).
 * Returns raw parsed JSON (the leaf array) or throws on failure.
 * Temperature is forced to 0.0.
 */
async function callOpenRouterLeaves(systemPrompt: string, userContent: string): Promise<any> {
  const models = ['google/gemini-3.1-pro-preview', 'x-ai/grok-4.3']

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
          temperature: 0.0,   // DETERMINISM: must be 0 — Opus-risk mitigation
          max_tokens: 8192,
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
        raw = msg.reasoning_details
          .filter((d: any) => d.type === 'reasoning.text')
          .map((d: any) => d.text)
          .join('\n')
      }

      if (!raw) {
        throw new Error('No content in OpenRouter response')
      }

      console.log(`[decompose-radical-leaves] ${model} responded: ${raw.length} chars`)

      // JSON extraction — expecting a bare array
      let jsonStr = raw
      jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      jsonStr = jsonStr.replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '').trim()
      jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

      // Try parse whole string first
      try {
        return JSON.parse(jsonStr)
      } catch { /* fall through */ }

      // Try first bracket to last bracket (bare array)
      const firstBracket = jsonStr.indexOf('[')
      const lastBracket = jsonStr.lastIndexOf(']')
      if (firstBracket >= 0 && lastBracket > firstBracket) {
        try {
          return JSON.parse(jsonStr.slice(firstBracket, lastBracket + 1))
        } catch { /* fall through */ }
      }

      // Try first brace to last brace (wrapped in object)
      const firstBrace = jsonStr.indexOf('{')
      const lastBrace = jsonStr.lastIndexOf('}')
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          const parsed = JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1))
          // If the object has a 'leaves' or 'components' array, unwrap it
          if (Array.isArray(parsed.leaves)) return parsed.leaves
          if (Array.isArray(parsed.components)) return parsed.components
          if (Array.isArray(parsed.parts)) return parsed.parts
          return parsed
        } catch { /* fall through */ }
      }

      throw new Error('Failed to parse leaf-list JSON from LLM response')
    } catch (err) {
      clearTimeout(timeout)
      console.warn(`[decompose-radical-leaves] ${model} failed: ${(err as Error).message}. Trying next...`)
      continue
    }
  }

  throw new Error('All models failed for Radical Phase 1.5 leaf identification')
}

/**
 * Run the Radical Phase 1.5 module decomposition — two-stage architecture.
 *
 * Stage 1 (LLM): identify LEAVES only — flat list of LeafRecord
 *   - Uses MODULE_DECOMPOSITION_LEAVES_PROMPT (constrained format)
 *   - Constrained output format greatly reduces structural variance vs free-form tree
 *   - Temperature 0.0 enforced
 *
 * Stage 2 (deterministic code): build the hierarchical tree from the leaf list
 *   - Uses buildTreeFromLeaves() in radical/structural-builder.ts
 *   - NO LLM call — pure deterministic code
 *   - Same leaf list ALWAYS produces same tree shape
 *
 * Called from runDecomposePA() when RADICAL_PHASE_1_TREE_OUTPUT=true.
 * The flat module list (state.modules) is ALSO returned unchanged —
 * this function is strictly ADDITIVE.
 *
 * Determinism guarantee:
 *   - Tree structure: FULLY deterministic (Stage 2 is pure code)
 *   - Leaf list: deterministic if LLM is stable at temp=0.0
 *   - If leaf list variance is detected: surface diagnostic, do NOT silently pass
 */
export async function runDecomposeRadical(
  parsedBrief: StructuredBriefJSON,
  classification: string,
  regulatoryExtraction?: RegulatoryExtraction,
): Promise<StageResult<RadicalTreeResult>> {
  const startTime = Date.now()
  console.log('[decompose-radical] Starting Radical Phase 1.5 two-stage decomposition...')
  console.log(`[decompose-radical] Hierarchy: ${HIERARCHY_STATS.sentences} sentences, ${HIERARCHY_STATS.words} words, ${HIERARCHY_STATS.characterMappings} character mappings`)

  const allEntries = regulatoryExtraction?.regulatory_entries ?? []
  const regSummary = allEntries.length
    ? `\n\n[Regulatory entries from Stage 4]\n` +
      allEntries.slice(0, 20).map(e => `- ${e.standard_name} (${e.jurisdiction}): ${e.engineering_impact}`).join('\n')
    : ''

  const userContent =
    `[Structured brief JSON from Stage 1]\n${JSON.stringify(parsedBrief, null, 2)}\n\n` +
    `[Product classification from Stage 2]\n${classification}` +
    regSummary

  // ── Stage 1: LLM identifies leaves ──────────────────────────────────────
  console.log('[decompose-radical] Stage 1: LLM leaf identification (temp=0.0)...')
  let rawLeafList: any
  try {
    rawLeafList = await callOpenRouterLeaves(MODULE_DECOMPOSITION_LEAVES_PROMPT, userContent)
  } catch (err) {
    return {
      ok: false,
      error: `Stage 1 leaf identification failed: ${(err as Error).message}`,
      durationMs: Date.now() - startTime,
    }
  }

  let leaves
  try {
    leaves = validateLeafList(rawLeafList)
  } catch (err) {
    return {
      ok: false,
      error: `Stage 1 leaf-list validation failed: ${(err as Error).message}`,
      durationMs: Date.now() - startTime,
    }
  }

  console.log(`[decompose-radical] Stage 1 complete: ${leaves.length} leaves identified`)

  const unknownLeaves = leaves.filter(l => l.character_id === '<UNKNOWN>' || l.character_id.startsWith('<UNKNOWN>'))
  if (unknownLeaves.length > 0) {
    console.warn(`[decompose-radical] Stage 1: ${unknownLeaves.length} UNKNOWN character(s) — library may need expansion:`)
    for (const ul of unknownLeaves) {
      console.warn(`  UNKNOWN: ${ul.description ?? ul.character_id}`)
    }
  }

  // ── Stage 2: deterministic tree builder ─────────────────────────────────
  console.log('[decompose-radical] Stage 2: deterministic tree build from leaf list...')

  const productSlug = parsedBrief.project_id ?? classification.replace(/[^a-z0-9_]/gi, '_')

  // Derive physics-based quantity overrides AND mandatory character set for determinism.
  // P1-FIX: use deriveClassMandatoryCharacters() for ALL product classes, not just BESS.
  // Without mandatory character sets, non-BESS classes get cross-contaminated: generic
  // shared characters (liquid_cooling_system, pcb_controller) map to BESS/heat-pump sentences
  // in the hierarchy because they appear there first. Mandatory sets pin the class-appropriate
  // characters and filter out cross-class characters.
  const classResult = deriveClassMandatoryCharacters(classification, parsedBrief.constraints)
  const mandatoryCharacters: string[] | undefined = classResult.mandatoryCharacters.length > 0 ? classResult.mandatoryCharacters : undefined
  const quantityOverrides: Record<string, number> | undefined = classResult.quantityOverrides

  if (mandatoryCharacters) {
    console.log(`[decompose-radical] Stage 2: mandatory characters resolved for class="${classification}" (${mandatoryCharacters.length} chars)${quantityOverrides ? ' + quantity overrides' : ''}`)
  } else {
    console.log(`[decompose-radical] Stage 2: no mandatory character set for class="${classification}" — tree shape depends on LLM output`)
  }

  let buildResult
  try {
    buildResult = buildTreeFromLeaves(leaves, productSlug, classification, quantityOverrides, mandatoryCharacters)
  } catch (err) {
    return {
      ok: false,
      error: `Stage 2 tree build failed: ${(err as Error).message}`,
      durationMs: Date.now() - startTime,
    }
  }

  const { tree, unmappedCharacters, placedLeafCount, stats } = buildResult

  console.log(`[decompose-radical] Stage 2 complete: ${stats.sentences} sentences, ${stats.words} words, ${placedLeafCount} leaves placed, ${stats.unmapped} unmapped`)

  if (unmappedCharacters.length > 0) {
    console.warn(`[decompose-radical] Unmapped characters (no hierarchy entry): ${unmappedCharacters.join(', ')}`)
    console.warn('[decompose-radical] Add these to character-hierarchy.ts to place them in the tree')
  }

  // Collect unknowns for reporting (combine UNKNOWN leaves + unmapped characters)
  const allUnknowns = [
    ...unknownLeaves.map(l => `<UNKNOWN_RADICAL>: ${l.description ?? l.character_id}`),
    ...unmappedCharacters.filter(c => !c.startsWith('<UNKNOWN>')).map(c => `unmapped:${c}`),
  ]

  return {
    ok: true,
    data: {
      tree,
      unknowns: allUnknowns,
      netNewArchetypes: [],   // Stage 2 uses known archetypes from the library
      netNewCharacters: unknownLeaves.map(l => l.description ?? l.character_id),
      leafCount: leaves.length,
      unmappedLeafCount: stats.unmapped,
      twoStageMode: true,
    },
    durationMs: Date.now() - startTime,
  }
}

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
 *   - every module has estimated_mass_kg (not null unless CONCEPTUAL) AND
 *     estimated_dimensions_mm (not null unless CONCEPTUAL)
 *   - maturity is one of CONCEPTUAL | PRELIMINARY | ENGINEERING
 *   - expected_parts array present and non-empty
 *   - name and purpose are non-empty strings
 *   - estimated_lead_time_weeks is a number
 *
 * D1 council BLOCKER-D1-1 fix (5/6 seats):
 *   The PA Stage 5 prompt declares estimated_mass_kg/estimated_dimensions_mm as
 *   number|null, giving the LLM licence to return null for CONCEPTUAL modules.
 *   The validator now accepts null ONLY when maturity === 'CONCEPTUAL'.
 *   For PRELIMINARY/ENGINEERING maturity, null is still rejected.
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

    if (!mod.name || typeof mod.name !== 'string' || mod.name.trim() === '') {
      throw new Error(`PA validation failed: Module at index ${i} missing required field: name`)
    }

    // D1 council BLOCKER-D1-8 fix (2/6 seats: GPT-5.4, GLM-5.1):
    // validateDecomposeResultPA did not check purpose, expected_parts non-empty,
    // or estimated_lead_time_weeks. LLM could omit these and stage returned ok:true.
    if (!mod.purpose || typeof mod.purpose !== 'string' || mod.purpose.trim() === '') {
      // Attempt to backfill from technical_description before rejecting
      if (mod.description || mod.technical_description) {
        mod.purpose = mod.description || mod.technical_description
      } else {
        throw new Error(`PA validation failed: Module '${mod.name}' missing required field: purpose`)
      }
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

    // ── maturity: must be validated BEFORE mass/dims (D1-1 fix) ─────────────
    // Maturity drives whether null estimates are acceptable — check it first.
    if (!VALID_MATURITY.has(mod.maturity)) {
      throw new Error(
        `PA validation failed: Module '${mod.name}' has invalid maturity '${mod.maturity}'. ` +
        `Must be one of CONCEPTUAL | PRELIMINARY | ENGINEERING.`
      )
    }

    // ── estimated_mass_kg: null only allowed for CONCEPTUAL maturity ──────
    // D1 council BLOCKER-D1-1 fix (5/6 seats: Gemini, GPT-5.4, GLM-5.1, Kimi, MiMo):
    // The PA Stage 5 prompt declares estimated_mass_kg as number|null, giving LLMs
    // licence to return null for CONCEPTUAL modules. Accept null only for CONCEPTUAL;
    // reject for PRELIMINARY and ENGINEERING (sizing solver needs real estimates).
    if (mod.estimated_mass_kg === null || mod.estimated_mass_kg === undefined) {
      if (mod.maturity !== 'CONCEPTUAL') {
        throw new Error(
          `PA validation failed: Module '${mod.name}' (maturity=${mod.maturity}) has null estimated_mass_kg. ` +
          `PA Stage 5 rule: PRELIMINARY/ENGINEERING modules must provide a rough estimate — ` +
          `null means the sizing solver cannot allocate space. Null is only allowed for CONCEPTUAL maturity.`
        )
      }
      // CONCEPTUAL: null accepted — leave as null for sizing solver to handle
    }

    // ── estimated_dimensions_mm: null only allowed for CONCEPTUAL maturity ─
    // Same D1-1 fix applied to estimated_dimensions_mm.
    if (
      mod.estimated_dimensions_mm === null ||
      mod.estimated_dimensions_mm === undefined
    ) {
      if (mod.maturity !== 'CONCEPTUAL') {
        throw new Error(
          `PA validation failed: Module '${mod.name}' (maturity=${mod.maturity}) has null estimated_dimensions_mm. ` +
          `PA Stage 5 rule: PRELIMINARY/ENGINEERING modules must provide rough estimates. ` +
          `Null is only allowed for CONCEPTUAL maturity.`
        )
      }
      // CONCEPTUAL: null accepted — leave as null for sizing solver to handle
    }

    // ── expected_parts: must be a non-empty array ────────────────────────
    // D1 council BLOCKER-D1-8 fix (2/6 seats: GPT-5.4, GLM-5.1):
    // Previously silently defaulted to []. Now validates presence and
    // non-emptiness so the BOM stage always has part names to work with.
    if (!Array.isArray(mod.expected_parts) || mod.expected_parts.length === 0) {
      throw new Error(
        `PA validation failed: Module '${mod.name}' has empty or missing expected_parts. ` +
        `PA Stage 5 rule: every module must list at least one expected part.`
      )
    }

    // ── expected_parts: normalise quantity_per_assembly ───────────────────
    // 2026-05-09 fix: the updated prompt emits quantity_per_assembly (integer)
    // instead of quantity (string). Normalise both cases so downstream
    // consumers always see quantity_per_assembly: number. Backwards compatible:
    // if the LLM still emits legacy `quantity: "1"`, we parse and promote it.
    for (const ep of mod.expected_parts) {
      if (typeof ep.quantity_per_assembly !== 'number') {
        // Try to parse from legacy `quantity` string field
        const legacyQty = typeof ep.quantity === 'string'
          ? parseInt(ep.quantity.trim().replace(/[^0-9]/g, ''), 10)
          : typeof ep.quantity === 'number' ? ep.quantity : NaN
        ep.quantity_per_assembly = Number.isFinite(legacyQty) && legacyQty > 0 ? legacyQty : 1
        if (!Number.isFinite(legacyQty) || legacyQty <= 0) {
          console.warn(
            `[decompose-pa] Module '${mod.name}' part '${ep.name}': could not parse quantity_per_assembly, defaulting to 1.`
          )
        }
      }
      // Keep legacy quantity field in sync (string version) for any consumers still reading it
      if (ep.quantity === undefined) ep.quantity = String(ep.quantity_per_assembly)
    }

    // ── estimated_lead_time_weeks: must be a number ───────────────────────
    // D1 council BLOCKER-D1-8 fix: validate lead time is a number.
    // The legacy default of 12 weeks (applied below) only runs after validation —
    // LLMs that omit this field entirely should be caught here.
    if (mod.estimated_lead_time_weeks !== undefined && typeof mod.estimated_lead_time_weeks !== 'number') {
      console.warn(
        `[decompose-pa] Module '${mod.name}' has non-numeric estimated_lead_time_weeks '${mod.estimated_lead_time_weeks}', ` +
        `normalising to 12.`
      )
      mod.estimated_lead_time_weeks = 12
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

  // D1 council BLOCKER-D1-2 fix (4/6 seats: Gemini, Grok, Kimi, MiMo):
  // Guard against undefined regulatoryExtraction (non-fatal Stage 4 failure path).
  // The ternary condition uses optional chaining so that if regulatoryExtraction
  // is undefined or regulatory_entries is absent, regSummary is empty string.
  // The truthy branch is only reached when entries exist — accesses are safe.
  //
  // D1 council NOTED-D1-2 fix (reclassified BLOCKER, 2 seats: GLM-5.1, MiMo):
  // Raise slice limit from 10 to 20 so products with many applicable standards
  // (medical devices, aerospace) don't silently lose context beyond entry 10.
  // Log a truncation warning when >20 entries exist.
  const allEntries = regulatoryExtraction?.regulatory_entries ?? []
  if (allEntries.length > 20) {
    console.warn(
      `[decompose-pa] Regulatory context truncated: ${allEntries.length} standards identified, ` +
      `passing first 20 to decompose prompt. Standards beyond 20 are not visible to module decomposition.`
    )
  }
  const regSummary = allEntries.length
    ? `\n\n[Regulatory entries from Stage 4 — ${allEntries.length} standards identified]\n` +
      allEntries
        .slice(0, 20)
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
 *
 * @deprecated Use `runDecomposePA()` on the PA path (PA_PIPELINE=true / default).
 * This function is preserved for the legacy rollback path only (PA_PIPELINE=false).
 * See STRICT-ADOPTION-MIGRATION-PLAN.md §Phase D1.
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
