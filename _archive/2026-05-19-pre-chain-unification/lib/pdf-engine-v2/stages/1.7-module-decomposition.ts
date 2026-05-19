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
import {
  synthesiseMultiEmitterDecomposition,
  type MultiEmitterOutput,
  type JudgeVerdict,
} from '../radical/council-synthesis'
import { parseJsonFromLlm } from '../lib/llm-json'
import { getActionLogger } from '../lib/action-logger'
import {
  ensureGraphsRegistered,
  getClassReferenceGraph,
  validateConnectionsAgainstGraph,
  type ProductClassGraph,
  type GraphValidationResult,
} from '../class-reference-graph'
import {
  isRagAtEmissionEnabled,
  retrieveReferences,
  formatFewShotBlock,
  type ReferenceRecord,
} from '../retrieve-references'
// 2026-05-18 — registry accumulation write-back + read-back. This mirrors the
// supplier write-back pattern (scripts/supplier-enrichment/persist-web-fallback.ts):
// every multi-emitter Stage 1.7 run feeds prior-confirmed sub-modules + cross-
// module connections back into a SQLite accumulation table, and the next run
// pulls those entries to inject into the emitter prompt as "emit these by
// default". Fail-soft — every DB call try/catches so pipeline never breaks.
import {
  persistConsensusFromSynthesis,
  buildAccumulatedPromptBlock,
  type EmitterOutputLike,
} from '../../../../scripts/registry-accumulation/persist-emitted-modules'

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

/**
 * WS-A 2026-05-13: opt in to the 6-emitter + 2-judge monolith pattern.
 * When false (default), the legacy 1-emitter + 4-reviewer path runs unchanged.
 * Drives `runModuleDecomposition` to delegate to `runMultiEmitterModuleDecomposition`.
 */
export function isMultiEmitterEnabled(): boolean {
  const raw = (process.env.RADICAL_MULTI_EMITTER ?? '').toLowerCase().trim()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

// ---------------------------------------------------------------------------
// K10 shadow-mode validation — 2026-05-18 (dispatch: "Wire K10 into G4 in
// shadow mode first").
//
// AFTER the G4 grammar gate completes (whether retries exhausted, council
// PASS, fallback to priors, or otherwise), validate the emitted
// `cross_module_grammar_links` against the K10 ProductClassGraph for the
// resolved product_class. Attach the structured result to the
// ModuleDecomposition object as `k10ShadowResult` (additive — accessed via
// `as any` like the existing `g4ManualReview` badge).
//
// SHADOW MODE: this never blocks the pipeline. It collects diagnostic data
// so the next dispatch can promote to enforcing mode once we know what the
// failure pattern looks like across the 10 supported classes.
//
// Disable entirely (for performance testing) by setting
// `PDF_ENGINE_K10_VALIDATE=false`.
// ---------------------------------------------------------------------------

/**
 * Shadow-mode validation result attached to ModuleDecomposition (via `as any`).
 *
 * `verdict` semantics:
 *  - `PASS_SHADOW`     — every required edge in the graph is present in
 *                        the emission
 *  - `FAIL_SHADOW`     — at least one required graph edge is missing from
 *                        the emission (would have failed enforcing mode)
 *  - `NO_GRAPH`        — no K10 graph registered for this product_class
 *                        (shadow check intentionally skipped — not a fail)
 *  - `SKIPPED`         — PDF_ENGINE_K10_VALIDATE=false, validation disabled
 *  - `ERROR`           — validator threw (caught; pipeline continues)
 */
export interface K10ShadowResult {
  /** Resolved K10 graph slug used for the lookup (may differ from product_class). */
  class: string
  /** Original product_class emitted on the decomposition. */
  product_class: string
  verdict: 'PASS_SHADOW' | 'FAIL_SHADOW' | 'NO_GRAPH' | 'SKIPPED' | 'ERROR'
  /** Number of emitted edges that matched a graph edge (mutual or directional). */
  matched_edges: number
  /** Required graph edges with no matching emission — the "would-block" set. */
  missing_required: Array<{
    from_class: string
    to_class: string
    protocol?: string
    mechanism?: string
    notes?: string
  }>
  /** Emitted edges that found no graph match — informational only. */
  extra_emitted: Array<{
    from_module: string
    to_module: string
    mechanism?: string
    protocol?: string
    detail?: string
  }>
  /** Matched edges where mechanism/protocol disagreed with the graph entry. */
  protocol_mismatches: Array<{
    from_module: string
    to_module: string
    reason: string
  }>
  /** ISO-8601 timestamp the shadow check ran. */
  ts: string
  /** Always 'shadow' in this dispatch — sentinel for the future enforcing-mode flip. */
  mode: 'shadow'
  /** Why ERROR / NO_GRAPH / SKIPPED — surface to the renderer for the Appendix B note. */
  reason?: string
}

/**
 * Map from `state.moduleDecomposition.product_class` (the upstream
 * classification string) to a registered K10 graph slug. The classifier
 * emits short slugs (e.g. `energy_storage`, `heat_pump`) while the K10
 * registry uses fuller class names (e.g. `bess-utility-scale`,
 * `heat-pump-residential`). This table maps the former to the latter.
 *
 * Keys are matched case-insensitively after trimming. If a key is not in the
 * table, we try a direct lookup against the K10 registry (which covers
 * already-correct slugs like `dc_fast_ev_charger`, `insulin_pump`, etc.).
 */
const K10_CLASS_ALIASES: Readonly<Record<string, string>> = {
  // BESS variants
  'bess':                                 'bess-utility-scale',
  'energy_storage':                       'bess-utility-scale',
  'battery_energy_storage':               'bess-utility-scale',
  'battery_energy_storage_system':        'bess-utility-scale',
  // Heat pump
  'heat_pump':                            'heat-pump-residential',
  'heat-pump':                            'heat-pump-residential',
  'thermal_system':                       'heat-pump-residential',
  // VFD
  'vfd':                                  'vfd-motor-drive',
  'motor_drive':                          'vfd-motor-drive',
  // EV charger
  'ev_charger':                           'dc_fast_ev_charger',
  // Solar inverter
  'pv_inverter':                          'pv_string_inverter',
  'solar_inverter':                       'pv_string_inverter',
  'string_inverter':                      'pv_string_inverter',
  // Robot arm
  'robot_arm':                            'industrial_robot_arm',
  'industrial_robot':                     'industrial_robot_arm',
  // Insulin pump
  'insulin':                              'insulin_pump',
  // Fuel cell
  'fuel_cell':                            'fuel_cell_power_module',
  // 3D printer
  '3d_printer':                           'industrial_3d_printer',
  'metal_3d_printer':                     'industrial_3d_printer',
  'sla_printer':                          'industrial_3d_printer',
  // Hydrogen electrolyser
  'electrolyser':                         'hydrogen_electrolyser',
  'electrolyzer':                         'hydrogen_electrolyser',
  // Commercial heat pump (added 2026-05-18 "10 → 15 coverage" dispatch)
  'heat_pump_commercial':                 'heat-pump-commercial',
  'commercial_heat_pump':                 'heat-pump-commercial',
  'industrial_heat_pump':                 'heat-pump-commercial',
  'large_heat_pump':                      'heat-pump-commercial',
  // PV module residential
  'pv_module':                            'pv_module_residential',
  'solar_module':                         'pv_module_residential',
  'solar_panel':                          'pv_module_residential',
  'pv_panel':                             'pv_module_residential',
  'photovoltaic_module':                  'pv_module_residential',
  // Wind turbine small
  'wind_turbine':                         'wind_turbine_small',
  'small_wind':                           'wind_turbine_small',
  'small_wind_turbine':                   'wind_turbine_small',
  'distributed_wind':                     'wind_turbine_small',
  // AUV subsea
  'auv':                                  'auv-subsea',
  'autonomous_underwater_vehicle':        'auv-subsea',
  'subsea_auv':                           'auv-subsea',
  'uuv':                                  'auv-subsea',
  // Vehicle battery pack
  'ev_battery':                           'vehicle_battery_pack',
  'ev_battery_pack':                      'vehicle_battery_pack',
  'traction_battery':                     'vehicle_battery_pack',
  'traction_battery_pack':                'vehicle_battery_pack',
  'vehicle_battery':                      'vehicle_battery_pack',
}

/**
 * Resolve a product_class string to a K10 graph slug, or null if no K10
 * graph is registered for that class. Tries: direct registry lookup → alias
 * map → null.
 */
function resolveK10GraphSlug(productClass: string): string | null {
  const trimmed = productClass.trim().toLowerCase()
  if (trimmed.length === 0) return null
  // Direct hit on the registry (covers exact slugs like `dc_fast_ev_charger`).
  if (getClassReferenceGraph(trimmed)) return trimmed
  // Alias map (covers classifier-shortened slugs like `heat_pump`).
  const aliased = K10_CLASS_ALIASES[trimmed]
  if (aliased && getClassReferenceGraph(aliased)) return aliased
  return null
}

/**
 * Run the K10 shadow-mode validation against an emitted ModuleDecomposition
 * and return the structured shadow result. Pure function — does NOT mutate
 * its inputs. Never throws (catches internally).
 *
 * Caller (the public `runModuleDecomposition`) attaches the result to the
 * decomposition via `(data as any).k10ShadowResult = ...` so it round-trips
 * through `state.moduleDecomposition` and reaches the PDF renderer.
 */
export async function runK10ShadowValidation(
  data: ModuleDecomposition,
): Promise<K10ShadowResult> {
  const ts = new Date().toISOString()

  // Opt-out switch — disable entirely for performance testing.
  if (process.env.PDF_ENGINE_K10_VALIDATE === 'false') {
    return {
      class: '',
      product_class: data.product_class,
      verdict: 'SKIPPED',
      matched_edges: 0,
      missing_required: [],
      extra_emitted: [],
      protocol_mismatches: [],
      ts,
      mode: 'shadow',
      reason: 'PDF_ENGINE_K10_VALIDATE=false',
    }
  }

  try {
    await ensureGraphsRegistered()
  } catch (err) {
    return {
      class: '',
      product_class: data.product_class,
      verdict: 'ERROR',
      matched_edges: 0,
      missing_required: [],
      extra_emitted: [],
      protocol_mismatches: [],
      ts,
      mode: 'shadow',
      reason: `ensureGraphsRegistered threw: ${(err as Error).message ?? String(err)}`,
    }
  }

  const slug = resolveK10GraphSlug(data.product_class)
  if (!slug) {
    return {
      class: '',
      product_class: data.product_class,
      verdict: 'NO_GRAPH',
      matched_edges: 0,
      missing_required: [],
      extra_emitted: [],
      protocol_mismatches: [],
      ts,
      mode: 'shadow',
      reason: `no K10 graph registered for product_class="${data.product_class}"`,
    }
  }
  const graph = getClassReferenceGraph(slug) as ProductClassGraph

  try {
    const emitted = (data.cross_module_grammar_links ?? []).map(l => ({
      from_module: l.from_module,
      to_module: l.to_module,
      mechanism: l.mechanism,
      detail: l.detail,
    }))
    const k10Result: GraphValidationResult = validateConnectionsAgainstGraph(emitted, graph)

    return {
      class: slug,
      product_class: data.product_class,
      verdict: k10Result.missing_required.length === 0 ? 'PASS_SHADOW' : 'FAIL_SHADOW',
      matched_edges: k10Result.summary.matched_count,
      missing_required: k10Result.missing_required.map(e => ({
        from_class: String(e.from_class),
        to_class: String(e.to_class),
        protocol: e.protocol,
        mechanism: e.mechanism,
        notes: e.notes,
      })),
      extra_emitted: k10Result.extra.map(e => ({
        from_module: e.from_module,
        to_module: e.to_module,
        mechanism: e.mechanism,
        protocol: e.protocol,
        detail: e.detail,
      })),
      protocol_mismatches: k10Result.protocol_mismatch.map(m => ({
        from_module: m.emitted.from_module,
        to_module: m.emitted.to_module,
        reason: m.reason,
      })),
      ts,
      mode: 'shadow',
    }
  } catch (err) {
    return {
      class: slug,
      product_class: data.product_class,
      verdict: 'ERROR',
      matched_edges: 0,
      missing_required: [],
      extra_emitted: [],
      protocol_mismatches: [],
      ts,
      mode: 'shadow',
      reason: `validateConnectionsAgainstGraph threw: ${(err as Error).message ?? String(err)}`,
    }
  }
}

// ---------------------------------------------------------------------------
// Task #87 (2026-05-18) — Auto class-registry hook.
//
// When `runK10ShadowValidation` returns `NO_GRAPH` (unknown product class),
// the pipeline previously degraded to a poor template. This hook trips
// `provisional_class_registry: true` on the ModuleDecomposition so the
// renderer can flag the output as auto-generated, and optionally invokes the
// organic generator (scripts/generate-class-registry.ts) to fill priors /
// connections / standards / hazards / cost-stack ratios.
//
// Gating:
//   - The hook ALWAYS attaches `provisional_class_registry: true` and
//     `provisional_class_reason: <reason>` when the K10 shadow result is
//     NO_GRAPH. No LLM cost.
//   - The hook ALWAYS consults the cached `auto_class_registry` SQLite table
//     (~/.forge-truth/forge-truth.db) — if a row exists for the slug, the
//     payload is attached and downstream stages can use it. No LLM cost.
//   - The hook ONLY pays Grok (one ~£1-2 call) when
//     `PDF_ENGINE_AUTO_CLASS_GEN=true` is set in the environment. Off by
//     default so a runaway pipeline can't quietly burn cost.
//
// Wire-up touches the ModuleDecomposition object via `(data as any).*`
// (same additive-field pattern used by k10ShadowResult). Renderer reads:
//   state.moduleDecomposition.provisional_class_registry
//   state.moduleDecomposition.auto_class_registry_payload
//   state.moduleDecomposition.auto_class_registry_audit
//
// IMPORTANT: this hook must NEVER throw — class-registry generation is a
// best-effort enhancement. Any failure leaves the pipeline at its pre-hook
// behaviour (poor-template degradation) with the provisional flag set.
//
// Drawer cross-ref: task #87.
// ---------------------------------------------------------------------------

export interface AutoClassRegistryHookResult {
  /** True if an auto-registry entry was attached (cached or freshly generated). */
  attached: boolean
  /** True if the hook called the Grok generator (incurred LLM cost). */
  generated: boolean
  /** Resolved slug used for cache lookup. */
  slug: string
  /** Free-form reason / outcome. */
  reason: string
}

/**
 * If the K10 shadow result indicates the class is unknown (NO_GRAPH), mark
 * the decomposition as provisional and try to attach an auto-generated
 * registry payload. Pure side-effect on the `data` argument via additive
 * `as any` fields. Never throws.
 *
 * @param data - ModuleDecomposition mutated in place with provisional flags.
 * @param k10 - The shadow validation result. Only NO_GRAPH triggers hook.
 * @param briefExcerpt - Optional brief text to pass to the generator. Up to
 *   the caller to truncate before passing.
 */
export async function triggerAutoClassRegistryIfUnknown(
  data: ModuleDecomposition,
  k10: K10ShadowResult,
  briefExcerpt: string = '',
): Promise<AutoClassRegistryHookResult> {
  // Only fire on NO_GRAPH — all other verdicts mean a curated graph exists.
  if (k10.verdict !== 'NO_GRAPH') {
    return {
      attached: false,
      generated: false,
      slug: data.product_class,
      reason: `K10 verdict=${k10.verdict} (curated graph in place); auto-registry hook skipped`,
    }
  }

  const slug = String(data.product_class ?? '').trim()
  if (!slug) {
    return {
      attached: false,
      generated: false,
      slug: '',
      reason: 'product_class is empty on the decomposition; auto-registry hook skipped',
    }
  }

  // ALWAYS attach the provisional flag — even if cache misses + generator is
  // gated off, downstream stages and the renderer should know the class
  // registry was not curated.
  ;(data as any).provisional_class_registry = true
  ;(data as any).provisional_class_reason =
    k10.reason ?? `no K10 reference graph registered for product_class="${slug}"`

  // Cache-first — zero LLM cost when the slug has been generated before.
  try {
    const { openAutoClassRegistryDb, loadCachedPayload, generateClassRegistryEntry } =
      // Dynamic import so the type-graph dependency on better-sqlite3 stays
      // out of any environment that doesn't have it (e.g. browser tests).
      await import('../../../../scripts/generate-class-registry.js' as string)
    const db = openAutoClassRegistryDb()
    try {
      const norm = slug.toLowerCase().replace(/-/g, '_')
      const cached = loadCachedPayload(db, norm)
      if (cached) {
        ;(data as any).auto_class_registry_payload = cached.payload
        ;(data as any).auto_class_registry_audit = cached.audit
        return {
          attached: true,
          generated: false,
          slug: norm,
          reason: `cache hit for slug="${norm}" (generated_at=${cached.audit.generated_at}, model=${cached.audit.generator_model})`,
        }
      }

      // Cache miss. Pay Grok ONLY when explicitly opted in.
      const optIn = (process.env.PDF_ENGINE_AUTO_CLASS_GEN ?? '').toLowerCase().trim()
      if (optIn !== 'true' && optIn !== '1' && optIn !== 'yes') {
        return {
          attached: false,
          generated: false,
          slug: norm,
          reason: `cache miss for slug="${norm}"; PDF_ENGINE_AUTO_CLASS_GEN not set so generator is gated off (set it to "true" to pay one Grok call ~£1-2)`,
        }
      }

      const out = await generateClassRegistryEntry(norm, {
        briefExcerpt,
        db,
      })
      if (!out.ok) {
        return {
          attached: false,
          generated: false,
          slug: norm,
          reason: `generator failed: ${out.error}`,
        }
      }
      if (out.alias) {
        // Alias resolution — caller may want to re-classify upstream, but for
        // now record the resolution and skip the payload attach.
        return {
          attached: false,
          generated: false,
          slug: out.resolved_slug,
          reason: `generator aliased "${norm}" to curated slug "${out.resolved_slug}": ${out.reason}`,
        }
      }
      ;(data as any).auto_class_registry_payload = out.payload
      ;(data as any).auto_class_registry_audit = out.audit
      return {
        attached: true,
        generated: true,
        slug: norm,
        reason: `Grok 4.3 generated fresh payload (cost=£${out.audit.estimated_cost_gbp.toFixed(3)}, tokens in/out=${out.audit.input_tokens}/${out.audit.output_tokens})`,
      }
    } finally {
      try {
        db.close()
      } catch {
        // ignore close errors
      }
    }
  } catch (err) {
    return {
      attached: false,
      generated: false,
      slug,
      reason: `auto-registry hook threw — non-fatal: ${(err as Error).message ?? String(err)}`,
    }
  }
}

// ---------------------------------------------------------------------------
// W1 2026-05-18 — RAG-at-emission helper. Builds a "brief text" from the
// structured brief JSON suitable for embedding-based retrieval, runs the
// Python retriever (`scripts/rag/retrieve_json.py`), and returns the
// formatted few-shot block ready to concatenate into `baseUserContent`.
// Returns an empty string when RAG is disabled or retrieval fails — callers
// fall through to the pre-W1 prompt path unchanged.
// ---------------------------------------------------------------------------

function composeBriefForRetrieval(brief: StructuredBriefJSON, classification: string): string {
  // The dominant signal is `product_description`. Append mission + a compact
  // summary of any safety standards so the embedding picks up class signals
  // even when the description is short.
  const parts: string[] = []
  if (brief.product_description) parts.push(brief.product_description.trim())
  if (brief.mission_statement) parts.push(brief.mission_statement.trim())
  const standards = (brief.constraints?.safety_standards ?? [])
    .map(s => (s as { value?: string }).value)
    .filter((v): v is string => Boolean(v))
  if (standards.length > 0) parts.push(`Standards: ${standards.slice(0, 6).join(', ')}`)
  parts.push(`Product class: ${classification}`)
  return parts.join('\n\n').slice(0, 4000)
}

async function buildRagFewShotBlock(
  brief: StructuredBriefJSON,
  classification: string,
): Promise<{ block: string; records: ReferenceRecord[] }> {
  if (!isRagAtEmissionEnabled()) return { block: '', records: [] }
  const startedAt = Date.now()
  try {
    const briefText = composeBriefForRetrieval(brief, classification)
    const records = await retrieveReferences(briefText, classification, { k: 5 })
    const block = formatFewShotBlock(records)
    console.log(
      `[module-decomposition][rag] retrieved ${records.length} reference records for class=${classification} in ${Date.now() - startedAt}ms`,
    )
    return { block, records }
  } catch (err) {
    console.warn(`[module-decomposition][rag] retrieval failed: ${(err as Error).message}`)
    return { block: '', records: [] }
  }
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
  /**
   * Piece 8 (2026-05-13): when true, fall back to Gemini 3.1 Flash-Lite
   * JSON-repair when the local strip+brace-slice parser fails. Used by the
   * multi-emitter `callEmitter` path (Stage 1.7) where ~6 LLMs run in parallel
   * and a single transient parse failure forces a same-model retry (expensive).
   * The repair path is far cheaper than another emitter call.
   */
  enableLlmRepair = false,
  /** Optional caller-supplied step name for the action log (e.g. 'module_decomposition:emitter:grok') */
  stepName = 'module_decomposition',
): Promise<LlmCallResult> {
  const startedAt = Date.now()
  let lastErr: unknown

  for (const model of models) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300_000)
    const modelStartAt = Date.now()
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
        getActionLogger().logLlm({
          step_name: stepName,
          model,
          latency_ms: Date.now() - modelStartAt,
          ok: false,
          error: `OpenRouter ${response.status}`,
        })
        throw new Error(`OpenRouter API status ${response.status} from ${model}`)
      }
      const json = await response.json() as {
        choices?: Array<{ message?: { content?: string; reasoning?: string; reasoning_details?: Array<{ type?: string; text?: string }> }; finish_reason?: string }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      // WS-D 2026-05-13: log truncation as ERROR — even with 150k budget we want loud signal
      const finishReason = json.choices?.[0]?.finish_reason
      if (finishReason && finishReason !== 'stop' && finishReason !== 'tool_calls') {
        console.error(`[module-decomposition] TRUNCATION DETECTED: finish_reason='${finishReason}' (raised max_tokens?) — model: ${model}`)
      }
      // Per-emitter LLM record (audit Gap #2 — Stage 1.7 was the highest-
      // priority blind spot: 6 emitters + 2 judges + tiebreak, all silent).
      getActionLogger().logLlm({
        step_name: stepName,
        model,
        prompt_tokens: json.usage?.prompt_tokens,
        completion_tokens: json.usage?.completion_tokens,
        latency_ms: Date.now() - modelStartAt,
        finish_reason: finishReason,
        ok: true,
      })
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
        // Piece 8 (2026-05-13): optional Flash-Lite repair fallback when caller
        // has opted in. Cheaper than dispatching a backup emitter.
        if (enableLlmRepair) {
          try {
            parsed = await parseJsonFromLlm(raw, {
              stage: 'module-decomposition',
              model,
              enableLlmRepair: true,
            })
          } catch (repairErr) {
            console.error(
              `[module-decomposition] Flash-Lite repair fallback failed for ${model}: ` +
              `${(repairErr as Error).message}`,
            )
          }
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

  // overview_paragraph_en — unified-prose addition (Tristan 2026-05-13).
  // Backward-compat: warn (not error) when missing, so legacy snapshots without
  // the field still parse. New emissions under the updated prompt will set it.
  const overviewRaw = typeof r.overview_paragraph_en === 'string' ? r.overview_paragraph_en.trim() : ''
  let overviewParagraphEn: string | undefined
  if (overviewRaw.length === 0) {
    paramWarnings.push(`modules[${index}].overview_paragraph_en is missing — will fall back to downstream Piece 1F (drift risk)`)
  } else if (overviewRaw.length < 200) {
    paramWarnings.push(`modules[${index}].overview_paragraph_en is only ${overviewRaw.length} chars — target 400-1200 (4-6 sentences); accepted but flag`)
    overviewParagraphEn = overviewRaw
  } else {
    overviewParagraphEn = overviewRaw
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
  //
  // S1 2026-05-18 — corpus-calibrated rebalance: the Phase 4 corpus shows real
  // engineering manuals decompose products at far lower density than the previous
  // 4-8-sub-module floor. Median active sub-modules per doc across 49 classes is
  // 3-25 TOTAL across the whole product, NOT per-module. Per-module typical is
  // 2-4. Floor warnings demoted; ceiling warning tightened to >6.
  const subModulesRaw = Array.isArray(r.sub_modules) ? r.sub_modules : []
  if (subModulesRaw.length === 0) {
    errors.push(`modules[${index}].sub_modules is missing or empty — at least 1 sub-module is required (typical 2-4 for most modules; up to 6 for the flagship module of a complex product)`)
  } else if (subModulesRaw.length > 6) {
    paramWarnings.push(`modules[${index}].sub_modules has ${subModulesRaw.length} entries (S1 corpus-calibrated typical 2-4; >6 flagged for over-decomposition review — does a real installer manual list this many sub-systems within this module?)`)
  }
  // S1 2026-05-18: removed `<3 sub_modules` warning. 1-2 sub-modules is realistic
  // and common across the Phase 4 corpus (CGM patches, insulin pumps, small drones,
  // edge-AI inference appliances). The prompt's REFERENCE DECOMPOSITION DENSITY
  // table gives class-specific targets — many classes have median ≤2 sub-mods per
  // active module.
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
    // Fix B (Tristan, 2026-05-13): raised from 4-word cap to 9-word cap to
    // align with BESS worked example.
    //
    // S1 2026-05-18 — corpus-calibrated rebalance: the 5-9-word band was a
    // misread. Phase 4 corpus across 49 classes shows real installer/service
    // manuals decompose sub-modules at median 1.0-3.0 parts. The BESS worked
    // example's 5-9 words are the high-end exemplar for the densest module of
    // the densest product, NOT a target for typical sub-modules. Variants of
    // the same physical part (M6 vs M8 bolt, 100A vs 125A breaker) belong as
    // modifier_characters on ONE word, not as separate words.
    const wordsRaw = Array.isArray(smr.words) ? smr.words : []
    if (wordsRaw.length === 0) {
      errors.push(`modules[${index}].sub_modules[${si}] ("${smId}").words is missing or empty — at least 1 word is required`)
    } else if (wordsRaw.length > 6) {
      paramWarnings.push(`modules[${index}].sub_modules[${si}] ("${smId}").words has ${wordsRaw.length} entries (S1 corpus-calibrated typical 1-3, max 6; >6 flagged for over-decomposition review — are any of these the same physical part with different sizes/grades? Collapse to modifier_characters if so.)`)
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
    // WS-A 2026-05-13 R-C1: accept optional english_sentence + rad_syntax. Both
    // are non-fatal when missing (legacy path doesn't emit them); multi-emitter
    // path requires them in the prompt but doesn't block synthesis if 1 of N
    // emitters skipped — the synthesiser picks the longest non-empty emission.
    const englishSentence = typeof smr.english_sentence === 'string' && smr.english_sentence.trim().length > 0
      ? smr.english_sentence.trim()
      : undefined
    const radSyntax = typeof smr.rad_syntax === 'string' && smr.rad_syntax.trim().length > 0
      ? smr.rad_syntax.trim()
      : undefined
    subModules.push({
      id: smId,
      name_human: nameHuman,
      words,
      role_verb: roleVerb,
      topology_clause: topologyClause,
      english_sentence: englishSentence,
      rad_syntax: radSyntax,
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
    overview_paragraph_en: overviewParagraphEn,
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
    // Piece 1D fix 2026-05-12: auto-strip forbidden modules + move to excluded
    // with auto-rationale, rather than hard-failing the entire catalogue. Real
    // production data (BESS v4 run) showed Grok occasionally emits
    // `mass_fluid_transport_process` for BESS because the cooling loop reads as
    // "fluid transport" colloquially — even though the BESS prior correctly
    // forbids it (BESS does thermal management, not internal mass flow).
    // The LLM is "almost right" — auto-correcting is more useful than blocking.
    paramWarnings.push(
      `forbidden_present modules per ${normClass} prior auto-stripped + moved to excluded: ${priorResult.forbidden_present.join(', ')}`,
    )
    for (const fm of priorResult.forbidden_present) {
      // Remove from modules array
      const idx = modules.findIndex(m => m.module === fm)
      if (idx >= 0) modules.splice(idx, 1)
      // Add to excluded list (if not already there)
      if (!excluded.includes(fm as UniversalModule)) {
        excluded.push(fm as UniversalModule)
      }
      // Synthesise rationale
      if (!rationale[fm as UniversalModule]) {
        rationale[fm as UniversalModule] =
          `Auto-excluded by ${normClass} prior — module is forbidden for this product class (LLM emitted it incorrectly; engine corrected).`
      }
    }
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
  // Piece 1D fix 2026-05-12: when the seat response is null / not an object /
  // unparseable, treat as TRANSPORT_FAILED (ABSTAIN-equivalent in the
  // aggregator), NOT as a legitimate NEEDS_MAJOR vote. This catches the case
  // where the seat call SUCCEEDED at the HTTP layer but the LLM returned
  // unparseable text ("Let me carefully review...") — different from a real
  // transport-layer throw which sets transport_failed=true in the catch block,
  // but functionally the same: the seat didn't actually review.
  const fallback: CouncilSeatReview = {
    seat,
    verdict: 'NEEDS_MAJOR',
    coverage_ok: false,
    no_spurious_modules: false,
    parameters_plausible: false,
    notes: ['failed to parse seat response — treated as ABSTAIN (transport_failed) by aggregator'],
    transport_failed: true,
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
// WS-D 2026-05-13: 150k (was 32768) — Tristan approved; truncation more expensive than unused tokens.
// WS-A 2026-05-13: 250k for multi-emitter mode — emitters now must emit §4.5
// fidelity (english_sentence + rad_syntax + grammar per sub-module), which
// roughly doubles output token volume. Legacy single-emitter path also uses
// 250k to allow the expanded few-shot to fit upstream.
const STAGE_1_7_MAX_TOKENS = 250_000

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
/**
 * K10 enforcing-mode result. Same shape as `K10ShadowResult` plus a
 * `mode: 'enforcing'` discriminator and (optionally) the bounded-retry
 * outcome — `g4_retry_fired` / `g4_retries_used` / `manual_review_attached`.
 *
 * Attached as `(data as any).k10EnforcingResult` ALONGSIDE
 * `k10ShadowResult` (which always remains, in shadow mode, for forward-compat
 * with existing consumers). Default behaviour (no env flag) writes only
 * `k10ShadowResult` and leaves `k10EnforcingResult` undefined.
 */
export interface K10EnforcingResult extends Omit<K10ShadowResult, 'mode'> {
  mode: 'enforcing'
  /** Did the K10 enforcing verdict cause a G4 re-emit cycle in this run? */
  g4_retry_fired: boolean
  /** Number of K10-triggered G4 retries actually consumed (0, 1, or 2). */
  g4_retries_used: number
  /** Was the manual-review badge attached (i.e. 2 K10 retries exhausted)? */
  manual_review_attached: boolean
}

/** Threshold above which K10 enforcing mode treats a FAIL_SHADOW as a G4 fail. */
const K10_ENFORCING_MISSING_THRESHOLD = 1
/** Cap on K10-triggered G4 retries. Matches the existing G4_MAX_RETRIES inside
 * the multi-emitter loop. */
const K10_ENFORCING_MAX_RETRIES = 2

/** Read-and-validate helper for `PDF_ENGINE_K10_ENFORCING`. Defaults to OFF. */
function isK10EnforcingEnabled(): boolean {
  const raw = (process.env.PDF_ENGINE_K10_ENFORCING ?? '').toLowerCase().trim()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

/**
 * Public Stage 1.5 / 1.7 entry. Dispatches to the legacy single-emitter or
 * the WS-A multi-emitter path depending on the RADICAL_MULTI_EMITTER flag,
 * then runs the K10 reference-graph check.
 *
 * Two modes, switched by `PDF_ENGINE_K10_ENFORCING` (default false):
 *
 *   SHADOW (default):
 *     - K10 validates the emitted decomposition AFTER `runModuleDecompositionInner`
 *       returns and attaches the structured result to
 *       `(data as any).k10ShadowResult`.
 *     - G4 outcome / StageResult `ok` flag UNCHANGED. Pure observability.
 *     - To disable entirely set `PDF_ENGINE_K10_VALIDATE=false`.
 *
 *   ENFORCING (opt-in via `PDF_ENGINE_K10_ENFORCING=true`):
 *     - Runs the inner pipeline once.
 *     - Computes K10 shadow result and attaches to `(data as any).k10ShadowResult`
 *       (preserves forward-compat with existing shadow-mode consumers).
 *     - If `k10ShadowResult.verdict === 'FAIL_SHADOW' && missing_required.length > 1`
 *       (the K10_ENFORCING_MISSING_THRESHOLD), re-runs the inner pipeline up
 *       to `K10_ENFORCING_MAX_RETRIES` times. Mirrors the existing G4 judge-retry
 *       cadence (the BLOCKER-1 fix's bounded retry pattern).
 *     - On 2nd K10-fail-after-retry: attaches
 *       `(data as any).k10ManualReview = true` + the missing-required edge
 *       list on `(data as any).k10ManualReviewEdges` (so the renderer can
 *       surface a `K10 reference graph` badge in Appendix B alongside the
 *       g4/g3/g5/cost-reality/g1b/physicsLedger badges).
 *     - In both pass-and-fail paths, also writes
 *       `(data as any).k10EnforcingResult` so downstream consumers can
 *       distinguish enforcing-mode telemetry from shadow-mode telemetry.
 *     - G4 outcome (verdict / `ok` flag) on the StageResult is UNCHANGED —
 *       the existing G4 retry loop already exhausted its budget; K10
 *       enforcing piggy-backs on the run-the-pipeline-again primitive. If
 *       the LAST attempt still missed required edges, we surface manual-review
 *       rather than fail the stage (matches G4 BLOCKER-1 behaviour).
 */
export async function runModuleDecomposition(
  parsedBrief: StructuredBriefJSON,
  classification: string,
  regulatoryExtraction?: RegulatoryExtraction,
): Promise<StageResult<ModuleDecomposition>> {
  const enforcing = isK10EnforcingEnabled()
  const _logger = getActionLogger()
  _logger.logStage({
    step_name: 'module_decomposition',
    action_type: 'stage_start',
    classification,
    multi_emitter: isMultiEmitterEnabled(),
    k10_enforcing: enforcing,
  })
  const _stageStart = Date.now()

  // Helper — one full inner attempt + K10 shadow attachment. Always returns
  // a result (never throws); K10 errors are non-fatal.
  const runOneAttempt = async (): Promise<{
    result: StageResult<ModuleDecomposition>
    k10: K10ShadowResult | null
  }> => {
    const result = await runModuleDecompositionInner(parsedBrief, classification, regulatoryExtraction)
    let k10: K10ShadowResult | null = null
    if (result.ok && result.data) {
      try {
        k10 = await runK10ShadowValidation(result.data)
        ;(result.data as any).k10ShadowResult = k10
        const v = k10.verdict
        console.log(
          `[module-decomposition][k10-shadow] verdict=${v}` +
            (v === 'FAIL_SHADOW'
              ? ` missing_required=${k10.missing_required.length}/${k10.missing_required.length + k10.matched_edges} extras=${k10.extra_emitted.length}`
              : v === 'PASS_SHADOW'
                ? ` matched=${k10.matched_edges} extras=${k10.extra_emitted.length}`
                : ` reason=${k10.reason ?? '(none)'}`),
        )

        // Task #87 (2026-05-18) — auto class-registry hook.
        // When K10 verdict=NO_GRAPH the class is unknown to the curated
        // registry. Mark the decomposition provisional + try the cache /
        // generator. Never throws. Idempotent — safe to call again on retry.
        if (k10.verdict === 'NO_GRAPH') {
          const briefExcerpt = (parsedBrief.product_description ?? '').toString().slice(0, 4000)
          try {
            const hookResult = await triggerAutoClassRegistryIfUnknown(
              result.data,
              k10,
              briefExcerpt,
            )
            console.log(
              `[module-decomposition][auto-class-registry] slug=${hookResult.slug} attached=${hookResult.attached} generated=${hookResult.generated} — ${hookResult.reason}`,
            )
          } catch (err) {
            console.warn(
              `[module-decomposition][auto-class-registry] hook threw — non-fatal: ${(err as Error).message ?? String(err)}`,
            )
          }
        }
      } catch (err) {
        // Belt-and-braces: K10 must NEVER break the pipeline. Leave `k10 = null`
        // — the enforcing loop below treats null/non-FAIL the same as PASS.
        console.warn(
          `[module-decomposition][k10-shadow] threw — non-fatal: ${(err as Error).message ?? String(err)}`,
        )
      }
    }
    return { result, k10 }
  }

  // --- Default (shadow-only) path — preserved unchanged for safety. ----------
  if (!enforcing) {
    const { result } = await runOneAttempt()
    _logger.logStage({
      step_name: 'module_decomposition',
      action_type: 'stage_end',
      outcome: result.ok ? 'ok' : 'fail',
      duration_ms: Date.now() - _stageStart,
      error: result.error,
      enforcing: false,
    })
    return result
  }

  // --- Enforcing path — opt-in via PDF_ENGINE_K10_ENFORCING=true. ------------
  // First attempt + K10 evaluation. If the verdict is PASS_SHADOW / NO_GRAPH /
  // SKIPPED / ERROR, OR FAIL_SHADOW with missing <= threshold, we DO NOT retry.
  // Only `FAIL_SHADOW && missing > threshold` triggers the bounded retry.
  let attempt = 0
  let lastResult: StageResult<ModuleDecomposition>
  let lastK10: K10ShadowResult | null
  let g4RetriesUsed = 0
  do {
    attempt += 1
    const { result, k10 } = await runOneAttempt()
    lastResult = result
    lastK10 = k10
    // No retry if the inner pipeline failed outright — there's no data to
    // re-validate, and re-running would just repeat the same error class.
    if (!result.ok || !result.data) break
    // No retry if K10 didn't produce a FAIL_SHADOW worth re-emitting on.
    if (!k10 || k10.verdict !== 'FAIL_SHADOW') break
    if (k10.missing_required.length <= K10_ENFORCING_MISSING_THRESHOLD) break
    // FAIL_SHADOW above threshold AND we still have retries left → retry.
    if (attempt >= 1 + K10_ENFORCING_MAX_RETRIES) break
    g4RetriesUsed += 1
    console.warn(
      `[module-decomposition][k10-enforcing] G4 retry ${g4RetriesUsed}/${K10_ENFORCING_MAX_RETRIES} — K10 FAIL_SHADOW with ${k10.missing_required.length} missing-required edges (threshold ${K10_ENFORCING_MISSING_THRESHOLD}); re-running inner pipeline.`,
    )
  } while (true)

  // Attach enforcing result + manual-review badge as appropriate.
  if (lastResult.ok && lastResult.data) {
    const baseK10 = lastK10
    const failedAfterRetries =
      !!baseK10 &&
      baseK10.verdict === 'FAIL_SHADOW' &&
      baseK10.missing_required.length > K10_ENFORCING_MISSING_THRESHOLD &&
      g4RetriesUsed >= K10_ENFORCING_MAX_RETRIES
    const enforcingResult: K10EnforcingResult = baseK10
      ? {
          ...baseK10,
          mode: 'enforcing',
          g4_retry_fired: g4RetriesUsed > 0,
          g4_retries_used: g4RetriesUsed,
          manual_review_attached: failedAfterRetries,
        }
      : {
          class: '',
          product_class: lastResult.data.product_class,
          verdict: 'ERROR',
          matched_edges: 0,
          missing_required: [],
          extra_emitted: [],
          protocol_mismatches: [],
          ts: new Date().toISOString(),
          mode: 'enforcing',
          reason: 'shadow validator returned null (validator threw); enforcing mode falling through to manual review',
          g4_retry_fired: false,
          g4_retries_used: 0,
          manual_review_attached: false,
        }
    ;(lastResult.data as any).k10EnforcingResult = enforcingResult
    if (failedAfterRetries) {
      ;(lastResult.data as any).k10ManualReview = true
      ;(lastResult.data as any).k10ManualReviewEdges = baseK10!.missing_required
      console.warn(
        `[module-decomposition][k10-enforcing] manual-review badge attached after ${g4RetriesUsed} retries — ${baseK10!.missing_required.length} required edges still missing.`,
      )
    }
    console.log(
      `[module-decomposition][k10-enforcing] verdict=${baseK10?.verdict ?? 'NULL'} g4_retries_used=${g4RetriesUsed} manual_review=${failedAfterRetries}`,
    )
  }
  _logger.logStage({
    step_name: 'module_decomposition',
    action_type: 'stage_end',
    outcome: lastResult.ok ? 'ok' : 'fail',
    duration_ms: Date.now() - _stageStart,
    error: lastResult.error,
    enforcing: true,
    g4_retries_used: g4RetriesUsed,
  })
  return lastResult
}

/**
 * Private inner entry — branches between legacy and multi-emitter paths.
 * Kept private so the K10 shadow attachment in the public wrapper above is
 * unavoidable on every successful return.
 */
async function runModuleDecompositionInner(
  parsedBrief: StructuredBriefJSON,
  classification: string,
  regulatoryExtraction?: RegulatoryExtraction,
): Promise<StageResult<ModuleDecomposition>> {
  // WS-A 2026-05-13: when RADICAL_MULTI_EMITTER=true, delegate to the
  // 6-emitter + 2-judge path. Legacy 1-emitter + 4-reviewer path stays the
  // default until the multi-emitter pattern proves out on full pipeline runs.
  if (isMultiEmitterEnabled()) {
    return runMultiEmitterModuleDecomposition(parsedBrief, classification, regulatoryExtraction)
  }
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

  // W1 2026-05-18 — RAG few-shot block (empty string when RAG_AT_EMISSION is off).
  const { block: ragBlock } = await buildRagFewShotBlock(parsedBrief, classification)

  const baseUserContent =
    `[Structured brief JSON from Stage 1]\n${JSON.stringify(parsedBrief, null, 2)}\n\n` +
    `[Product classification]\n${classification}` +
    regSummary +
    ragBlock

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

  // Retry once on schema failure with the validation reminder appended.
  // Piece 1D fix 2026-05-12: surface the specific schema errors (was logging
  // only the COUNT, hiding the actual cause). When BESS v2 fell through to
  // fallback with "1 errors", future diagnosis required reading raw LLM dumps;
  // the error list itself is small enough to log verbatim.
  if (!v.validation.ok) {
    console.warn(
      `[module-decomposition] Stage 1.5 first attempt failed validation (${v.validation.schema_errors.length} errors). Retrying...`,
    )
    for (const err of v.validation.schema_errors) {
      console.warn(`[module-decomposition]   error: ${err}`)
    }
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
        // Couldn't even validate the retry; fall back to priors.
        // Piece 1D fix 2026-05-12: surface the specific schema errors so future
        // diagnosis doesn't need raw LLM dumps (was logging only a generic message).
        console.warn(`[module-decomposition] Council retry validation failed (${v2.validation.schema_errors.length} errors):`)
        for (const err of v2.validation.schema_errors) {
          console.warn(`[module-decomposition]   error: ${err}`)
        }
        const fallback = buildFallbackDecomposition(
          classification,
          parsedBrief,
          `Council retry validation failed: ${v2.validation.schema_errors.join('; ')}`,
        )
        if (fallback) {
          console.warn('[module-decomposition] Falling back to ClassModulePriors')
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
// WS-A 2026-05-13 — Multi-emitter monolith pattern (6 emitters + 2 judges)
// ---------------------------------------------------------------------------

/**
 * 6 emitters (balanced 3 Western + 3 Asian — no lineage overlap with judges).
 * Order is informational only; emitters dispatch in parallel via Promise.allSettled.
 */
const MULTI_EMITTER_MODELS: ReadonlyArray<string> = [
  'google/gemini-3.1-pro-preview',     // US / Google
  'x-ai/grok-4.3',                     // US / xAI
  'anthropic/claude-opus-4-7',         // US / Anthropic (via OpenRouter)
  'qwen/qwen3.6-max-preview',          // Asia / Alibaba
  'xiaomi/mimo-v2.5-pro',              // Asia / Xiaomi
  'moonshotai/kimi-k2.6',              // Asia / Moonshot
] as const

// Iter-09 backup pool (2026-05-13): when a preferred emitter fails (HTTP 400,
// JSON parse error, transport timeout), dispatch ONE backup serially per failure.
// Order: cheapest + lowest-hallucination first.
const MULTI_EMITTER_BACKUPS: ReadonlyArray<string> = [
  'google/gemini-3.1-flash-lite',   // 8.2% hallucination, 329 tok/s, £0.25/M input — best cheap option
  'qwen/qwen3.5-405b',               // Asian backup, different variant from qwen3.6-max
  'minimax/minimax-m2.7',            // Asian backup, 34% hallucination, distinct lineage
] as const

/**
 * 2 judges (independent vendors, no lineage overlap with emitters in role).
 * - GLM = schema-strict (IFBench top, low hallucination)
 * - Sonnet = independent vendor breadth check (IFBench mid, GDPval-AA #3)
 */
const MULTI_EMITTER_JUDGE_MODELS: ReadonlyArray<{ id: string; model: string }> = [
  { id: 'glm',    model: 'z-ai/glm-5.1' },
  { id: 'sonnet', model: 'anthropic/claude-sonnet-4-6' },
] as const

const MULTI_EMITTER_MIN_SPEAKING = 3

/**
 * Build the council-style judge prompt over the SYNTHESISED catalog.
 * The judge sees the synthesised output and must emit OK/NEEDS_MINOR/NEEDS_MAJOR
 * with optional `schema_violations: string[]` (per R-C3 schema-vs-quality
 * tiebreak in council-synthesis.ts).
 */
function buildMultiEmitterJudgePrompt(): string {
  return MODULE_DECOMPOSITION_COUNCIL_PROMPT +
    `\n\nADDITIONAL FIELD (WS-A 2026-05-13): if you find SCHEMA-grade violations ` +
    `in the synthesised catalog (invalid radical_id, duplicate sub_module id, ` +
    `malformed RAD string, missing required field), emit them in an array field ` +
    `"schema_violations" alongside your verdict. Quality concerns (under-decomposition, ` +
    `wrong parameter magnitude) stay in your "notes" array. ` +
    `Per the WS-A tiebreak rule, EITHER judge citing a schema_violation → engine ` +
    `auto-drops the offending field (no retry). BOTH judges voting NEEDS_MAJOR on ` +
    `quality only → engine retries the synthesis once. A single quality NEEDS_MAJOR ` +
    `is logged and synthesis proceeds.`
}

function parseJudgeResponse(raw: unknown, judgeId: string, model: string): JudgeVerdict {
  const fallback: JudgeVerdict = {
    judge: judgeId,
    model,
    verdict: 'NEEDS_MAJOR',
    notes: ['failed to parse judge response — treated as quality NEEDS_MAJOR'],
    schemaViolations: [],
  }
  if (!raw || typeof raw !== 'object') return fallback
  const r = raw as Record<string, unknown>
  const v = r.verdict
  const verdict: 'OK' | 'NEEDS_MINOR' | 'NEEDS_MAJOR' =
    v === 'OK' || v === 'NEEDS_MINOR' || v === 'NEEDS_MAJOR' ? v : 'NEEDS_MAJOR'
  const notes = Array.isArray(r.notes)
    ? (r.notes as unknown[]).filter((n): n is string => typeof n === 'string')
    : []
  const schemaViolations = Array.isArray(r.schema_violations)
    ? (r.schema_violations as unknown[]).filter((s): s is string => typeof s === 'string')
    : []
  return { judge: judgeId, model, verdict, notes, schemaViolations }
}

/**
 * WS-A 2026-05-13 — 6-emitter + 2-judge monolith pattern. Feature-flagged
 * by RADICAL_MULTI_EMITTER. Pattern:
 *
 *   1. Build the user prompt from parsedBrief + classification + regulatory.
 *   2. Dispatch 6 emitters in parallel via Promise.allSettled. Failed emissions
 *      are logged but not fatal — synthesis proceeds with ≥3 surviving emitters.
 *   3. Synthesise the 6 outputs into a single MultiEmitterDecompositionPayload
 *      using majority-vote rules from council-synthesis.ts (≥3 of 6 module
 *      inclusion, ≥4 of 6 excluded-intersection, union sub_modules by id,
 *      R-C2 quantity ≥3 of 6 agreement, R-C1 english_sentence + rad_syntax
 *      propagated).
 *   4. Dispatch 2 judges in parallel over the synthesised output. Apply
 *      tiebreak rule: schema_violation → drop offending field, no retry.
 *      Both quality-NEEDS_MAJOR → retry synthesis once with judge notes
 *      appended to each emitter prompt.
 *   5. Validate the final synthesised catalog through the existing schema
 *      validator (re-uses validateModuleDecompositionPayload — keeps prior
 *      cross-check, forbidden-module strip, etc.).
 *   6. Return wrapped in ModuleDecomposition with telemetry.
 */
export async function runMultiEmitterModuleDecomposition(
  parsedBrief: StructuredBriefJSON,
  classification: string,
  regulatoryExtraction?: RegulatoryExtraction,
): Promise<StageResult<ModuleDecomposition>> {
  const startedAt = Date.now()
  console.log('[module-decomposition] WS-A multi-emitter Stage 1.7 starting (RADICAL_MULTI_EMITTER)...')

  if (!process.env.OPENROUTER_API_KEY) {
    return {
      ok: false,
      error: 'OPENROUTER_API_KEY is not set; multi-emitter Stage 1.7 cannot dispatch LLM calls',
      durationMs: Date.now() - startedAt,
    }
  }

  const allEntries = regulatoryExtraction?.regulatory_entries ?? []
  const regSummary = allEntries.length
    ? `\n\n[Regulatory entries from Stage 4 — first 20 of ${allEntries.length}]\n` +
      allEntries.slice(0, 20).map(e => `- ${e.standard_name} (${e.jurisdiction}): ${e.engineering_impact}`).join('\n')
    : ''

  // W1 2026-05-18 — RAG few-shot block. Empty string when RAG_AT_EMISSION
  // is off (default). Computed ONCE here so all 6 emitters see the same block.
  const { block: ragBlock, records: ragRecords } = await buildRagFewShotBlock(parsedBrief, classification)
  if (ragRecords.length > 0) {
    console.log(`[multi-emitter][rag] injecting ${ragRecords.length} records into all ${MULTI_EMITTER_MODELS.length} emitter prompts`)
  }

  // 2026-05-18 — DB-aware lookup. Inject prior-confirmed sub-modules +
  // cross-module connections accumulated from past runs into the user content.
  // Threshold: ≥5 prior briefs (MIN_INJECTION_SEEN_COUNT). The accumulated
  // block sits BETWEEN the brief + classification and the regulatory/RAG
  // blocks so the LLM sees it as engine context rather than user instruction.
  // Fail-soft — wrapped in try/catch; an empty block is the safe default.
  let accumulatedBlock = ''
  try {
    accumulatedBlock = buildAccumulatedPromptBlock(classification)
    if (accumulatedBlock.length > 0) {
      const moduleLines = (accumulatedBlock.match(/^  - /gm) ?? []).length
      console.log(`[multi-emitter][registry-accumulation] injecting ${moduleLines} prior-confirmed entries for class="${classification}"`)
    }
  } catch (err) {
    console.warn(`[multi-emitter][registry-accumulation] buildAccumulatedPromptBlock failed: ${(err as Error).message}`)
    accumulatedBlock = ''
  }

  const baseUserContent =
    `[Structured brief JSON from Stage 1]\n${JSON.stringify(parsedBrief, null, 2)}\n\n` +
    `[Product classification]\n${classification}` +
    accumulatedBlock +
    regSummary +
    ragBlock

  // Wrapper to call ONE emitter and collect parsed payload + diagnostics.
  // Iter-09 (2026-05-13): on JSON-parse failure (200 OK but unparseable), retry
  // the SAME model ONCE — LLM nondeterminism may yield clean JSON on retry.
  // HTTP errors / transport failures are NOT retried here (caller dispatches
  // a backup model instead).
  async function callEmitter(model: string, userContent: string): Promise<MultiEmitterOutput & { durationMs: number; inputTokens: number; outputTokens: number }> {
    let attempt = 0
    let lastErr: Error | null = null
    while (attempt < 2) {
      try {
        const result = await callOpenRouterJson(
          MODULE_DECOMPOSITION_TAXONOMY_PROMPT,
          userContent,
          [model],
          STAGE_1_7_MAX_TOKENS,
          // Piece 8 (2026-05-13): opt-in Flash-Lite JSON-repair fallback —
          // far cheaper than the same-model retry below or a backup emitter dispatch.
          true,
        )
        const v = validateModuleDecompositionPayload(result.parsed, classification)
        // Even if v.validation.ok is false, capture whatever modules parsed —
        // the synthesiser's majority-vote drops outliers anyway. But mark
        // schemaViolations so the judge can see them.
        if (!v.validation.ok && v.modules.length === 0) {
          return {
            ok: false,
            model,
            schemaViolations: v.validation.schema_errors,
            durationMs: result.durationMs,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          }
        }
        return {
          ok: true,
          model,
          data: {
            product_class: v.productClass,
            modules: v.modules,
            excluded_modules: v.excluded,
            rationale_excluded: v.rationale,
            cross_module_grammar_links: v.crossModuleGrammarLinks,
          },
          schemaViolations: v.validation.schema_errors,
          durationMs: result.durationMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        }
      } catch (err) {
        lastErr = err as Error
        const msg = lastErr.message
        // JSON-parse failure signal from callOpenRouterJson — same-model retry
        // is worthwhile because the HTTP call succeeded (200 OK) and the model
        // produced output; the parser just couldn't extract JSON. Retry once.
        const isJsonParseError = msg.includes('Could not parse JSON from') ||
          msg.includes('Empty response from')
        if (isJsonParseError && attempt === 0) {
          console.warn(`[module-decomposition][multi-emitter] emitter ${model} JSON-parse failed; retrying SAME model once...`)
          attempt += 1
          continue
        }
        console.warn(`[module-decomposition][multi-emitter] emitter ${model} failed: ${msg}`)
        return {
          ok: false,
          model,
          schemaViolations: [`transport: ${msg}`],
          durationMs: 0,
          inputTokens: 0,
          outputTokens: 0,
        }
      }
    }
    // Exhausted retry attempts on JSON-parse path.
    const msg = lastErr?.message ?? 'unknown'
    console.warn(`[module-decomposition][multi-emitter] emitter ${model} failed after same-model retry: ${msg}`)
    return {
      ok: false,
      model,
      schemaViolations: [`transport: ${msg}`],
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
    }
  }

  // Dispatch all 6 preferred emitters in parallel.
  console.log(`[module-decomposition][multi-emitter] dispatching ${MULTI_EMITTER_MODELS.length} emitters in parallel...`)
  const emitterStartedAt = Date.now()
  const emitterResults = await Promise.allSettled(
    MULTI_EMITTER_MODELS.map(m => callEmitter(m, baseUserContent)),
  )
  let emitterWallMs = Date.now() - emitterStartedAt
  let totalInput = 0
  let totalOutput = 0

  const emitterOutputs: MultiEmitterOutput[] = []
  for (let i = 0; i < emitterResults.length; i++) {
    const r = emitterResults[i]
    const model = MULTI_EMITTER_MODELS[i]
    if (r.status === 'fulfilled') {
      totalInput += r.value.inputTokens
      totalOutput += r.value.outputTokens
      emitterOutputs.push({
        ok: r.value.ok,
        data: r.value.data,
        model: r.value.model,
        schemaViolations: r.value.schemaViolations,
      })
    } else {
      console.warn(`[module-decomposition][multi-emitter] emitter ${model} promise rejected: ${String(r.reason)}`)
      emitterOutputs.push({ ok: false, model, schemaViolations: [`promise: ${String(r.reason)}`] })
    }
  }

  const preferredSpeaking = emitterOutputs.filter(e => e.ok).length
  console.log(
    `[multi-emitter] preferred ${MULTI_EMITTER_MODELS.length}/${MULTI_EMITTER_MODELS.length} dispatched, ${preferredSpeaking} succeeded`,
  )

  // Iter-09 (2026-05-13): if any preferred emitter failed, dispatch backups
  // SERIALLY (one at a time). Each successful backup fills one missing slot.
  // Stop when we reach 6 total successes OR exhaust the backup pool.
  const TARGET_SPEAKING = MULTI_EMITTER_MODELS.length
  let backupsUsed = 0
  if (preferredSpeaking < TARGET_SPEAKING) {
    const maxBackupAttempts = Math.min(
      TARGET_SPEAKING - preferredSpeaking,
      MULTI_EMITTER_BACKUPS.length,
    )
    for (let b = 0; b < maxBackupAttempts; b++) {
      const backupModel = MULTI_EMITTER_BACKUPS[b]
      const backupIndex = b + 1
      console.log(`[multi-emitter] dispatching backup ${backupIndex}: ${backupModel}`)
      const backupStartedAt = Date.now()
      const result = await callEmitter(backupModel, baseUserContent)
      emitterWallMs += Date.now() - backupStartedAt
      totalInput += result.inputTokens
      totalOutput += result.outputTokens
      emitterOutputs.push({
        ok: result.ok,
        data: result.data,
        model: result.model,
        schemaViolations: result.schemaViolations,
      })
      backupsUsed += 1
      if (result.ok) {
        console.log(`[multi-emitter] backup ${backupIndex} succeeded`)
        const speakingNow = emitterOutputs.filter(e => e.ok).length
        if (speakingNow >= TARGET_SPEAKING) break
      } else {
        const reason = result.schemaViolations?.[0] ?? 'unknown'
        console.warn(`[multi-emitter] backup ${backupIndex} failed: ${reason}`)
      }
    }
  }

  const speakingCount = emitterOutputs.filter(e => e.ok).length
  const backupSpeaking = speakingCount - preferredSpeaking
  console.log(
    `[multi-emitter] complete: ${speakingCount}/${TARGET_SPEAKING} emitters (${preferredSpeaking} preferred + ${backupSpeaking} backups; ${backupsUsed} backup attempts)`,
  )

  if (speakingCount < MULTI_EMITTER_MIN_SPEAKING) {
    console.warn(
      `[module-decomposition][multi-emitter] only ${speakingCount} of ${MULTI_EMITTER_MODELS.length} emitters succeeded (min ${MULTI_EMITTER_MIN_SPEAKING}); falling back to ClassModulePriors`,
    )
    const fallback = buildFallbackDecomposition(
      classification,
      parsedBrief,
      `Multi-emitter: only ${speakingCount}/${MULTI_EMITTER_MODELS.length} emitters succeeded; below quorum`,
    )
    if (fallback) return { ok: true, data: fallback, durationMs: Date.now() - startedAt }
    return {
      ok: false,
      error: `Multi-emitter Stage 1.7 below quorum (${speakingCount} speaking) and no class prior for "${classification}"`,
      durationMs: Date.now() - startedAt,
    }
  }

  // First synthesis pass (no judges yet)
  let synth = synthesiseMultiEmitterDecomposition(emitterOutputs, [], normaliseProductClass(classification))

  // Dispatch judges over the synthesised output
  const judgePrompt = buildMultiEmitterJudgePrompt()
  const judgeUserContent = buildCouncilUserContent(
    synth.synthesised.modules,
    synth.synthesised.excluded_modules,
    synth.synthesised.rationale_excluded,
    parsedBrief,
    classification,
  )

  async function callJudge(id: string, model: string): Promise<JudgeVerdict & { inputTokens: number; outputTokens: number }> {
    try {
      const result = await callOpenRouterJson(judgePrompt, judgeUserContent, [model], 8192)
      const parsed = parseJudgeResponse(result.parsed, id, model)
      return { ...parsed, inputTokens: result.inputTokens, outputTokens: result.outputTokens }
    } catch (err) {
      console.warn(`[module-decomposition][multi-emitter] judge ${id} (${model}) failed: ${(err as Error).message}`)
      return {
        judge: id,
        model,
        verdict: 'NEEDS_MINOR',
        notes: [`judge call failed: ${(err as Error).message}`],
        schemaViolations: [],
        inputTokens: 0,
        outputTokens: 0,
      }
    }
  }

  const judgeStartedAt = Date.now()
  const judgeSettled = await Promise.all(
    MULTI_EMITTER_JUDGE_MODELS.map(j => callJudge(j.id, j.model)),
  )
  const judgeWallMs = Date.now() - judgeStartedAt
  for (const j of judgeSettled) {
    totalInput += j.inputTokens
    totalOutput += j.outputTokens
  }
  const judges: JudgeVerdict[] = judgeSettled.map(j => ({
    judge: j.judge,
    model: j.model,
    verdict: j.verdict,
    notes: j.notes,
    schemaViolations: j.schemaViolations,
  }))

  // Re-synthesise with judges populated (so verdict is computed correctly)
  synth = synthesiseMultiEmitterDecomposition(emitterOutputs, judges, normaliseProductClass(classification))
  let retried = false
  let g4ManualReview = false

  // ── G4 grammar/synthesis gate: bounded retry loop ──────────────────────
  // Council 2026-05-18 BLOCKER-1: previously a single retry then silent
  // fallback to priors. Now a bounded loop (max 2 retries) before tagging
  // state with a `g4_manual_review` badge and proceeding. Mirrors Engine
  // A's maxRetries=2 pattern from stages/4-bom-cost-suppliers.ts.
  //
  // Tristan 2026-05-13: in MINIMAL_BRIEF_MODULES_ONLY mode the synthesis picker
  // is anchor-emitter (single-winning-emitter authoritative) — judges are no
  // longer the gate. Skip the retry loop entirely; it just doubles wall-clock
  // without changing the anchor's pick (the anchor scores arithmetic +
  // sub-module count, not the judges' verdict).
  const G4_MAX_RETRIES = 2
  if (synth.shouldRetry && process.env.MINIMAL_BRIEF_MODULES_ONLY === 'true') {
    console.log('[module-decomposition][multi-emitter] BOTH judges NEEDS_MAJOR but MINIMAL_BRIEF_MODULES_ONLY=true — anchor-mode picker bypasses judge gate, shipping first-pass synthesis')
  } else {
    let g4Attempt = 0
    while (synth.shouldRetry && g4Attempt < G4_MAX_RETRIES) {
      g4Attempt += 1
      const judgeNotes = judges.flatMap(j => j.notes ?? [])
      const reminder =
        `\n\nCRITICAL JUDGE FEEDBACK ON THE PREVIOUS SYNTHESIS (attempt ${g4Attempt}/${G4_MAX_RETRIES}; BOTH judges voted NEEDS_MAJOR on quality):\n` +
        judgeNotes.map(n => `- ${n}`).join('\n') +
        `\n\nReturn a fully corrected JSON catalog addressing every point above. Re-emit with §4.5 fidelity (english_sentence + rad_syntax + grammar per sub-module).`

      console.warn(`[module-decomposition][multi-emitter] G4 retry ${g4Attempt}/${G4_MAX_RETRIES} — re-dispatching all 6 emitters with judge notes appended...`)
      const retryStartedAt = Date.now()
      const retryResults = await Promise.allSettled(
        MULTI_EMITTER_MODELS.map(m => callEmitter(m, baseUserContent + reminder)),
      )
      emitterWallMs += Date.now() - retryStartedAt
      retried = true

      const retryOutputs: MultiEmitterOutput[] = []
      for (let i = 0; i < retryResults.length; i++) {
        const r = retryResults[i]
        const model = MULTI_EMITTER_MODELS[i]
        if (r.status === 'fulfilled') {
          totalInput += r.value.inputTokens
          totalOutput += r.value.outputTokens
          retryOutputs.push({
            ok: r.value.ok,
            data: r.value.data,
            model: r.value.model,
            schemaViolations: r.value.schemaViolations,
          })
        } else {
          retryOutputs.push({ ok: false, model, schemaViolations: [`promise: ${String(r.reason)}`] })
        }
      }

      const retrySpeaking = retryOutputs.filter(e => e.ok).length
      if (retrySpeaking >= MULTI_EMITTER_MIN_SPEAKING) {
        // Re-synthesise with retry outputs + same judges (per spec — judges
        // do not re-vote; the synthesis is authoritative each round).
        synth = synthesiseMultiEmitterDecomposition(retryOutputs, judges, normaliseProductClass(classification))
      } else {
        synth.notes.push(
          `[multi-emitter] G4 retry ${g4Attempt} produced only ${retrySpeaking}/${MULTI_EMITTER_MODELS.length} speaking emitters; kept prior synthesis`,
        )
        // No quorum — further retries unlikely to help. Bail out and let the
        // manual-review badge below catch this.
        break
      }
    }
    if (synth.shouldRetry) {
      // Exhausted retries with judges still NEEDS_MAJOR. Attach manual-review
      // badge to synthesis notes; the caller annotates state.g4ManualReview
      // so the renderer can surface it on the cover.
      g4ManualReview = true
      synth.notes.push(
        `[multi-emitter] G4 manual-review: exhausted ${G4_MAX_RETRIES} retries with judges NEEDS_MAJOR — proceeding with last synthesis but flagging the run.`,
      )
      console.warn(`[module-decomposition][multi-emitter] G4 manual-review badge attached after ${G4_MAX_RETRIES} bounded retries.`)
    }
  }

  // Final validation pass through the existing payload validator (applies
  // prior cross-check, auto-strip of forbidden modules, etc.).
  const rawForValidator = {
    product_class: synth.synthesised.product_class,
    modules: synth.synthesised.modules,
    excluded_modules: synth.synthesised.excluded_modules,
    rationale_excluded: synth.synthesised.rationale_excluded,
    cross_module_grammar_links: synth.synthesised.cross_module_grammar_links,
  }
  const finalValidation = validateModuleDecompositionPayload(rawForValidator, classification)

  if (!finalValidation.validation.ok) {
    console.warn(`[module-decomposition][multi-emitter] final validation failed (${finalValidation.validation.schema_errors.length} errors); falling back to ClassModulePriors`)
    for (const err of finalValidation.validation.schema_errors) {
      console.warn(`[module-decomposition][multi-emitter]   error: ${err}`)
    }
    const fallback = buildFallbackDecomposition(
      classification,
      parsedBrief,
      `Multi-emitter: synthesised catalog failed validation: ${finalValidation.validation.schema_errors.join('; ')}`,
    )
    if (fallback) return { ok: true, data: fallback, durationMs: Date.now() - startedAt }
    return {
      ok: false,
      error: `Multi-emitter Stage 1.7 final validation failed: ${finalValidation.validation.schema_errors.join('; ')}`,
      durationMs: Date.now() - startedAt,
    }
  }

  // Assemble final ModuleDecomposition
  const allNotes = [
    ...synth.notes,
    ...finalValidation.validation.parameter_warnings,
    ...finalValidation.validation.prior_warnings,
    ...judges.flatMap(j => [
      `[judge:${j.judge}] verdict=${j.verdict}`,
      ...(j.notes ?? []),
      ...(j.schemaViolations ?? []).map(s => `[judge:${j.judge}][schema] ${s}`),
    ]),
  ]

  const telemetry: ModuleDecompositionTelemetry = {
    llm_call_ms: emitterWallMs,
    council_ms: judgeWallMs,
    input_tokens: totalInput,
    output_tokens: totalOutput,
    estimated_cost_gbp: estimateCostGbp(totalInput, totalOutput),
    retried,
  }

  const data: ModuleDecomposition = {
    product_class: finalValidation.productClass,
    normalised_class: normaliseProductClass(finalValidation.productClass),
    modules: finalValidation.modules,
    excluded_modules: finalValidation.excluded,
    rationale_excluded: finalValidation.rationale,
    cross_module_grammar_links: finalValidation.crossModuleGrammarLinks,
    council_verdict: synth.verdict,
    council_seats: synth.seats,
    council_notes: allNotes,
    telemetry,
  }
  // Council 2026-05-18 BLOCKER-1: manual-review badge after bounded G4 retry
  // exhaustion. Attached via `as any` rather than extending ModuleDecomposition
  // — additive, read by the renderer's cover-page logic; downstream type-strict
  // consumers continue to ignore unknown properties.
  if (g4ManualReview) {
    ;(data as any).g4ManualReview = true
  }

  // 2026-05-18 — registry accumulation write-back. Persist consensus
  // sub-modules + cross-module connections that ≥4 of 6 emitters agreed on.
  // Only fires when:
  //   - the final validation passed (we reached this point, so it has)
  //   - the G4 grammar gate exited successfully (NOT in manual-review mode)
  // Skipping manual-review runs is conservative — by definition those runs
  // produced something the judges flagged as broken, so we don't want to
  // learn from them.
  // Fail-soft — try/catch around the whole batch so a bad SQLite file never
  // breaks the pipeline.
  if (!g4ManualReview) {
    try {
      const briefExcerpt =
        (parsedBrief as any)?.product_description?.slice?.(0, 240)
        ?? (parsedBrief as any)?.brief?.slice?.(0, 240)
        ?? ''
      const emitterLike: EmitterOutputLike[] = emitterOutputs.map(e => ({
        ok: e.ok,
        model: e.model,
        data: e.data as any,
      }))
      const persistCounts = persistConsensusFromSynthesis(
        classification,
        emitterLike,
        briefExcerpt,
      )
      const mc = persistCounts.modules
      const cc = persistCounts.connections
      if (mc.inserted + mc.updated + cc.inserted + cc.updated > 0) {
        console.log(
          `[multi-emitter][registry-accumulation] persisted: ` +
          `sub-modules ins=${mc.inserted} upd=${mc.updated} skip=${mc.skipped}; ` +
          `connections ins=${cc.inserted} upd=${cc.updated} skip=${cc.skipped}`,
        )
      }
    } catch (err) {
      console.warn(`[multi-emitter][registry-accumulation] persist batch failed: ${(err as Error).message}`)
    }
  } else {
    console.log('[multi-emitter][registry-accumulation] skipping persist — G4 manual-review badge attached')
  }

  console.log(
    `[multi-emitter] complete: ${speakingCount}/${TARGET_SPEAKING} emitters (${preferredSpeaking} preferred + ${backupSpeaking} backups), verdict=${data.council_verdict}, ${data.modules.length} modules, cost≈£${telemetry.estimated_cost_gbp.toFixed(3)}, retried=${retried}`,
  )

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
  MULTI_EMITTER_MODELS,
  MULTI_EMITTER_JUDGE_MODELS,
}
