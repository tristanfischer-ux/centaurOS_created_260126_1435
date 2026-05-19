/**
 * @file -1-brief-augmenter.ts — P0a Brief Augmentation Stage (pre-Stage-0).
 *
 * Inserted BEFORE Stage 0 brief-generation. When a founder writes a sparse
 * brief ("I want a heat pump", "BESS", "a drone for inspection"), this stage
 * silently augments it with class-typical defaults so the rest of the
 * pipeline does not reject on missing mandatory fields.
 *
 * Two-phase:
 *   Phase 1 — class inference via Gemini 3.1 Flash-Lite. The model picks the
 *             best-fit product class from the registered supplier-archetype list
 *             in `class-suppliers.ts`. Falls back to a deterministic
 *             keyword match (or 'bess' as a last resort) so the pipeline
 *             always continues.
 *   Phase 2 — deterministic field defaulting. For each class-typical field
 *             that is missing from the brief — size envelope, power /
 *             capacity, operating temperature, cycle life, cost ceiling,
 *             standards — fill in a sensible default keyed off
 *             `class-floors.ts` + `class-standards.ts`. No LLM call here;
 *             zero cost beyond Phase 1.
 *
 * The output appends a clearly-delimited "Inferred from class" block to the
 * raw brief, so downstream stages (Stage 0 brief parsing, Stage 1.5
 * feasibility, the renderer's verbatim-prompt section) can distinguish what
 * the founder said from what the engine inferred.
 *
 * Design doc: ../../../../Downloads/forgeos-illustration-experiments/engine-flow-2026-05-18.html
 */

import { callFastExtract, GEMINI_3_1_FLASH_LITE } from '../lib/openrouter-models'
import { CLASS_SUPPLIERS } from '../class-suppliers'
import { CLASS_FLOORS, getClassFloors } from '../class-floors'
import { CLASS_STANDARDS } from '../class-standards'

export interface BriefAugmentationResult {
  /** The raw founder brief with an appended "Inferred from class" block. */
  augmentedBrief: string
  /** Inferred product class id (matches CLASS_SUPPLIERS keys). */
  inferredClass: string
  /**
   * Field-by-field record of what was added because the founder omitted it.
   * Empty if every class-typical field was already present.
   */
  filled: Array<{ field: string; value: string; reason: string }>
  /** Class inference cost in £ (LLM call only; field defaulting is free). */
  costGbp: number
  /** Wall-clock duration in ms. */
  durationMs: number
  /** True when class inference and defaulting both succeeded. */
  ok: boolean
  /** Set on failure; never throws — pipeline always continues. */
  error?: string
}

// All product-class ids registered in the engine. Sourced from
// `class-suppliers.ts` (the canonical "I know how to build this" list).
const REGISTERED_CLASSES: string[] = Object.keys(CLASS_SUPPLIERS)

// Display labels for the LLM picker. Pulled from class-floors where
// available (the human label lives there); falls back to the snake-case id.
function classLabel(id: string): string {
  // class-floors uses different keys (e.g. 'energy_storage' vs 'bess'), so
  // try a few lookups before falling back to the raw id.
  const direct = CLASS_FLOORS[id]
  if (direct) return direct.display_name
  // Try a couple of common id aliases.
  const aliases: Record<string, string> = {
    bess: 'energy_storage',
    heatpump: 'thermal_system',
    cgm: 'wearable_medical',
    edge_ai: 'edge_ai_server',
    consumer_cinematography_drone: 'drone',
    vertical_farm: 'vertical_farm',
  }
  const aliased = aliases[id] ? CLASS_FLOORS[aliases[id]] : undefined
  if (aliased) return aliased.display_name
  return id.replace(/_/g, ' ')
}

// Map class-suppliers id → class-floors id (the floors registry uses
// physics-axis names, not product names).
function floorsIdForClass(supplierClassId: string): string {
  const map: Record<string, string> = {
    bess: 'energy_storage',
    heatpump: 'thermal_system',
    ev_charger: 'ev_charger',
    cgm: 'wearable_medical',
    edge_ai: 'edge_ai_server',
    bioreactor: 'bioreactor',
    vertical_farm: 'vertical_farm',
    consumer_cinematography_drone: 'drone',
    auv: 'auv',
    haps: 'haps',
  }
  return map[supplierClassId] ?? supplierClassId
}

// Map class-suppliers id → class-standards id.
function standardsIdForClass(supplierClassId: string): string {
  const map: Record<string, string> = {
    bess: 'energy_storage',
    heatpump: 'thermal_system',
    ev_charger: 'ev_charger',
    cgm: 'wearable_medical',
    edge_ai: 'edge_ai_server',
    bioreactor: 'bioreactor',
    vertical_farm: 'vertical_farm',
    consumer_cinematography_drone: 'drone',
    auv: 'auv',
    haps: 'haps',
  }
  return map[supplierClassId] ?? supplierClassId
}

/**
 * Cheap keyword-based fallback used when the LLM call fails or returns a
 * class not in the registry. Covers the brief examples from the design doc
 * plus the common synonyms the rest of the pipeline knows about.
 */
function keywordClassFallback(brief: string): string {
  const b = brief.toLowerCase()
  if (/\bbess\b|battery energy storage|lfp|grid storage|energy storage/.test(b)) return 'bess'
  if (/heat ?pump|air[- ]source|ground[- ]source|hvac/.test(b)) return 'heatpump'
  if (/ev charger|charge ?point|ccs2|chademo|kw charger/.test(b)) return 'ev_charger'
  if (/\bcgm\b|continuous glucose|wearable.*medical/.test(b)) return 'cgm'
  if (/edge ai|jetson|inference server|ai server/.test(b)) return 'edge_ai'
  if (/bioreactor|fermenter|cell culture/.test(b)) return 'bioreactor'
  if (/vertical farm|indoor farm|hydroponic|aeroponic/.test(b)) return 'vertical_farm'
  if (/drone|uav|quadcopter|multirotor/.test(b)) return 'consumer_cinematography_drone'
  if (/\bauv\b|underwater vehicle|submersible/.test(b)) return 'auv'
  if (/\bhaps\b|stratospheric|high[- ]altitude platform/.test(b)) return 'haps'
  return 'bess' // safest default — most-developed class in the engine
}

/**
 * Phase 1 — pick the best-fit class via a single Flash-Lite call.
 * Returns the keyword fallback on any failure so the pipeline always
 * continues.
 */
async function inferProductClass(briefText: string): Promise<{ id: string; costGbp: number }> {
  const classList = REGISTERED_CLASSES
    .map(id => `  - ${id}: ${classLabel(id)}`)
    .join('\n')

  const prompt = `You are a product engineering classifier. Read the founder's brief and pick ONE product class from the list below.

Brief:
"""
${briefText}
"""

Registered product classes:
${classList}

Return ONLY a JSON object: {"class": "<id>", "confidence": "high"|"medium"|"low"}
The "class" value MUST be exactly one of the ids above. No other text.`

  try {
    const raw = await callFastExtract(prompt, {
      model: GEMINI_3_1_FLASH_LITE,
      thinkingLevel: 'low',
      temperature: 0,
      maxTokens: 4_000,
      timeoutMs: 30_000,
    })
    // Strip markdown fences if present.
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const parsed = JSON.parse(cleaned) as { class?: string }
    const picked = (parsed.class || '').trim()
    if (REGISTERED_CLASSES.includes(picked)) {
      // Flash-Lite per-call cost ≈ 4k input + 200 output × £0.25 / £1 per M tokens
      // ≈ £0.00125 — round to £0.001 for the bookkeeping.
      return { id: picked, costGbp: 0.001 }
    }
    console.warn(`[brief-augmenter] LLM picked unregistered class "${picked}" — falling back to keywords`)
    return { id: keywordClassFallback(briefText), costGbp: 0.001 }
  } catch (err) {
    console.warn(`[brief-augmenter] Class inference failed (${(err as Error).message}); using keyword fallback`)
    return { id: keywordClassFallback(briefText), costGbp: 0 }
  }
}

/**
 * Phase 2 — deterministic field-defaulting. Walks the class-typical fields
 * we want every brief to carry. For each one already present in the brief
 * (very loose substring match — we are trying not to overwrite a real
 * statement), skip. For each one missing, append a default sourced from
 * `class-floors.ts` and `class-standards.ts`.
 */
function buildDefaults(classId: string, briefText: string): Array<{ field: string; value: string; reason: string }> {
  const lower = briefText.toLowerCase()
  const filled: Array<{ field: string; value: string; reason: string }> = []

  const floorsId = floorsIdForClass(classId)
  const floors = getClassFloors(floorsId)
  const standardsId = standardsIdForClass(classId)
  const standards = CLASS_STANDARDS[standardsId]

  // Helper — only emit a default if the brief does not already mention the
  // concept. Substring match deliberately loose; downstream Stage 0 parser
  // will pick the founder's number if it is present.
  function emitIf(missing: () => boolean, field: string, value: string, reason: string) {
    if (missing()) filled.push({ field, value, reason })
  }

  // ── Size / capacity / power ────────────────────────────────────────────
  emitIf(
    () => !/\bmwh\b|\bkwh\b|capacity|\bkw\b|\bw\b\s*$/.test(lower) && classId === 'bess',
    'capacity',
    '2 MWh nameplate, 1 MW continuous power, 2-hour duration',
    'class-typical commercial BESS sizing for UK behind-the-meter / front-of-meter installations',
  )
  emitIf(
    () => !/\bkw\b|heating capacity|cop|scop/.test(lower) && classId === 'heatpump',
    'heating_capacity',
    '12 kW thermal output, SCOP 4.0 air-source',
    'class-typical UK residential air-source heat pump sizing (3-4 bedroom dwelling)',
  )
  emitIf(
    () => !/\bkw\b|charge speed|charging power/.test(lower) && classId === 'ev_charger',
    'charging_power',
    '22 kW AC, three-phase OZEV-eligible',
    'class-typical UK destination / depot AC charger spec',
  )
  emitIf(
    () => !/payload|kg|flight time|endurance/.test(lower) && classId === 'consumer_cinematography_drone',
    'payload_endurance',
    '1.0 kg payload, 35 min flight time at hover',
    'class-typical inspection / mapping drone envelope (DJI Matrice-class)',
  )
  emitIf(
    () => !/litre|liter|working volume|\bl\b\s*$/.test(lower) && classId === 'bioreactor',
    'working_volume',
    '50 L working volume, single-use bag bioreactor',
    'class-typical pilot-scale single-use bioreactor for mammalian cell culture',
  )
  emitIf(
    () => !/canopy area|m2|square metre|sq m/.test(lower) && classId === 'vertical_farm',
    'canopy_area',
    '120 m² canopy, 5-tier rack, LED 250 W/m²',
    'class-typical containerised vertical farm footprint for leafy greens',
  )
  emitIf(
    () => !/tflops|tops|inference|gpu|jetson/.test(lower) && classId === 'edge_ai',
    'compute_power',
    '275 TOPS INT8 at 60 W TDP, passive cooling',
    'class-typical Jetson AGX Orin-class industrial edge inference box',
  )
  emitIf(
    () => !/depth|dive|meter|metre|\bm\b\s*depth/.test(lower) && classId === 'auv',
    'depth_endurance',
    '300 m depth rating, 18 h endurance at 4 knots',
    'class-typical compact coastal AUV (Bluefin SandShark-class)',
  )
  emitIf(
    () => !/altitude|km|stratospher/.test(lower) && classId === 'haps',
    'altitude_endurance',
    '20 km cruise altitude, 30 day station-keeping, 250 kg total mass',
    'class-typical solar HAPS envelope (Airbus Zephyr / BAE PHASA-35 class)',
  )
  emitIf(
    () => !/sensor|day.*wear|continuous|measurement/.test(lower) && classId === 'cgm',
    'sensor_lifetime',
    '14 day disposable sensor, BLE transmitter, ±8% MARD',
    'class-typical enzymatic CGM (Dexcom G7 / Libre 3 class)',
  )

  // ── Operating temperature (every class except CGM benefits from this) ──
  emitIf(
    () => !/operating temp|temperature range|°c|degc/.test(lower),
    'operating_temperature',
    classId === 'haps' ? '-70 °C to +40 °C (stratospheric)' :
    classId === 'auv' ? '-2 °C to +35 °C (seawater)' :
    classId === 'cgm' ? '10 °C to 42 °C (skin contact)' :
    '-20 °C to +50 °C (outdoor UK industrial envelope)',
    'class-typical operating window for the deployment environment',
  )

  // ── Cycle life / design life ───────────────────────────────────────────
  if (classId === 'bess') {
    emitIf(
      () => !/cycle life|cycles|design life|service life/.test(lower),
      'cycle_life',
      '6000 cycles to 80% capacity at 0.5C, 15 year design life',
      'class-typical LFP BESS cell warranty (CATL / BYD blade reference)',
    )
  } else if (classId === 'heatpump' || classId === 'ev_charger' || classId === 'haps' || classId === 'edge_ai') {
    emitIf(
      () => !/design life|service life|warranty/.test(lower),
      'design_life',
      classId === 'heatpump' ? '15 year design life'
        : classId === 'ev_charger' ? '10 year design life'
        : classId === 'haps' ? '5 year operational life'
        : '7 year design life',
      'class-typical product warranty / certification cycle',
    )
  }

  // ── Cost ceiling — read the installed-cost floor from class-floors and
  //    quote a credible band 1.5×-2× above floor. The Stage 0 parser only
  //    looks for £ values so we keep this concise.
  emitIf(
    () => !/£\s*[\d,]+|\$\s*[\d,]+|cost ceiling|budget|capex|opex/.test(briefText),
    'cost_ceiling',
    floors
      ? `installed-cost ceiling: ${formatCostFromFloors(floors, classId)}`
      : 'installed-cost ceiling: class-typical capex band',
    'derived from class floor in class-floors.ts × 1.5-2.0 commercial multiplier',
  )

  // ── Standards / regulatory ─────────────────────────────────────────────
  emitIf(
    () => !/iso|iec|en \d|\bul\b|\bce\b|standard/.test(lower) && standards != null,
    'standards',
    standards!.standards.filter(s => s.mandatory).slice(0, 4).map(s => s.code).join(', ') || 'class-typical standards set',
    `mandatory regulatory baseline for ${classLabel(classId)} from class-standards.ts`,
  )

  // ── Jurisdiction ───────────────────────────────────────────────────────
  emitIf(
    () => !/\buk\b|\beu\b|\bus\b|jurisdiction|target market|europe|global/.test(lower),
    'jurisdiction',
    'United Kingdom + European Union primary market',
    'default jurisdiction for ForgeOS founders absent an explicit market call-out',
  )

  return filled
}

function formatCostFromFloors(
  floors: ReturnType<typeof getClassFloors>,
  classId: string,
): string {
  if (!floors) return 'class-typical capex band'
  // Pick the most representative installed-cost floor for the class.
  const pick = (slugs: string[]) => slugs
    .map(s => floors.floors[s])
    .find(f => f != null)
  if (classId === 'bess') {
    const f = pick(['installed_cost_min_gbp_per_kwh'])
    return f ? `£${Math.round(f.value * 1.6)}/kWh installed (≈ 2× ${f.value} ${f.unit} floor)` : 'class-typical capex band'
  }
  if (classId === 'heatpump') {
    const f = pick(['installed_cost_min_gbp_per_kw_residential', 'installed_cost_min_gbp_per_kw_commercial'])
    return f ? `£${Math.round(f.value * 1.6)}/kW installed` : 'class-typical capex band'
  }
  if (classId === 'ev_charger') {
    const f = pick(['installed_cost_min_gbp_per_kw_ac'])
    return f ? `£${Math.round(f.value * 1.6)}/kW installed` : 'class-typical capex band'
  }
  if (classId === 'consumer_cinematography_drone') {
    const f = pick(['bom_cost_min_gbp_commercial', 'bom_cost_min_gbp_prosumer'])
    return f ? `£${Math.round(f.value * 1.8).toLocaleString('en-GB')} BoM unit cost` : 'class-typical capex band'
  }
  if (classId === 'bioreactor') {
    const f = pick(['capex_min_gbp_per_l_single_use', 'capex_min_gbp_per_l_working_volume'])
    return f ? `£${Math.round(f.value * 1.5)}/L working volume installed` : 'class-typical capex band'
  }
  if (classId === 'vertical_farm') {
    const f = pick(['installed_cost_min_gbp_per_m2'])
    return f ? `£${Math.round(f.value * 1.6).toLocaleString('en-GB')}/m² installed` : 'class-typical capex band'
  }
  if (classId === 'edge_ai') {
    const f = pick(['bom_cost_min_gbp_industrial', 'bom_cost_min_gbp_consumer'])
    return f ? `£${Math.round(f.value * 1.8).toLocaleString('en-GB')} unit cost` : 'class-typical capex band'
  }
  if (classId === 'auv') {
    const f = pick(['bom_cost_min_gbp_coastal'])
    return f ? `£${Math.round(f.value * 1.6).toLocaleString('en-GB')} unit cost` : 'class-typical capex band'
  }
  if (classId === 'haps') {
    const f = pick(['bom_cost_min_gbp_platform'])
    return f ? `£${Math.round(f.value * 1.6).toLocaleString('en-GB')} per platform` : 'class-typical capex band'
  }
  if (classId === 'cgm') {
    const f = pick(['transmitter_cost_min_gbp'])
    return f ? `£${Math.round(f.value * 1.8)} transmitter unit cost + £${Math.round((floors.floors.sensor_cost_min_gbp_disposable?.value ?? 30) * 1.6)} per disposable sensor` : 'class-typical capex band'
  }
  return 'class-typical capex band'
}

/**
 * Render the augmented brief: founder's raw text followed by an "Inferred
 * from class" block. The block is wrapped in obvious delimiters so the
 * Stage 0 parser, council reviewers, and the renderer's verbatim section
 * can all tell what the engine added.
 */
function renderAugmented(
  rawBrief: string,
  classId: string,
  filled: Array<{ field: string; value: string; reason: string }>,
): string {
  if (filled.length === 0) {
    // No augmentation needed — return brief untouched so downstream stages
    // see exactly what the founder wrote.
    return rawBrief
  }
  const header = `\n\n---\n## Inferred from class (${classLabel(classId)}, id=${classId})\n_The following defaults were inferred by the engine because the founder's brief did not specify them. Founder-stated values take precedence wherever they conflict._\n`
  const body = filled.map(f => `- **${f.field}**: ${f.value}\n  _Reason: ${f.reason}_`).join('\n')
  return `${rawBrief.trimEnd()}${header}\n${body}\n`
}

/**
 * P0a entry point. Never throws — pipeline always continues. On total
 * failure returns the raw brief unchanged with `ok: false`.
 */
export async function runBriefAugmentation(
  briefText: string,
  declaredClass?: string,
): Promise<BriefAugmentationResult> {
  const startMs = Date.now()
  console.log('[brief-augmenter] P0a: augmenting sparse brief with class-typical defaults...')
  console.log(`[brief-augmenter] Input: ${briefText.length} chars, declared class: ${declaredClass ?? '(none)'}`)

  try {
    // Phase 1 — class inference. Honour caller's declared class if it is a
    // registered id (saves the LLM call).
    let classId: string
    let costGbp: number
    if (declaredClass && REGISTERED_CLASSES.includes(declaredClass)) {
      classId = declaredClass
      costGbp = 0
      console.log(`[brief-augmenter] Using declared class: ${classId}`)
    } else {
      const inferred = await inferProductClass(briefText)
      classId = inferred.id
      costGbp = inferred.costGbp
      console.log(`[brief-augmenter] Inferred class: ${classId} (cost £${costGbp.toFixed(4)})`)
    }

    // Phase 2 — deterministic field defaulting.
    const filled = buildDefaults(classId, briefText)
    console.log(`[brief-augmenter] Filled ${filled.length} class-typical fields: ${filled.map(f => f.field).join(', ') || '(none — brief already complete)'}`)

    const augmentedBrief = renderAugmented(briefText, classId, filled)

    return {
      augmentedBrief,
      inferredClass: classId,
      filled,
      costGbp,
      durationMs: Date.now() - startMs,
      ok: true,
    }
  } catch (err) {
    // Final safety net — never let augmentation kill the pipeline.
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[brief-augmenter] Failed: ${message} — returning raw brief unchanged`)
    return {
      augmentedBrief: briefText,
      inferredClass: keywordClassFallback(briefText),
      filled: [],
      costGbp: 0,
      durationMs: Date.now() - startMs,
      ok: false,
      error: message,
    }
  }
}
