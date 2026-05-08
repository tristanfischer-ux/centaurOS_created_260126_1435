/**
 * @file stages/4-bom-cost.ts — Legacy BOM + Cost stage (v1 path)
 *
 * @deprecated Superseded by the integrated BOM/Cost/Suppliers stage
 * (`stages/4-bom-cost-suppliers.ts` under `BOM_PIPELINE=v2`).
 * Phase E will cut over to the integrated stage as the default once the v2
 * BOM scores ≥8 baseline across all 10 briefs.
 *
 * Deletion schedule: after Phase E cut-over, hold period ends 2026-05-22.
 * See STRICT-ADOPTION-MIGRATION-PLAN.md §Phase E.
 *
 * On the PA path (default), this file is still invoked via the legacy BOM
 * branch when BOM_PIPELINE is not set to 'v2'. Phase E removes the flag and
 * makes the integrated stage the only path.
 */

import { calculateCost } from '../cost-model'
import {
  loadAllGroundingData,
  formatMaterialsForPrompt,
  formatProcessesForPrompt,
  type GroundingData,
  type MaterialProperty,
  type ProcessCapability,
} from '../db-queries'
import type { Module, Part, BomLine, CostBreakdown, StageResult, DimensionSheet } from '../types'
import { sanitiseLlmOutput } from '../sanitiser'
import { BOM_GENERATION_SYSTEM } from '../prompts'
import { STAGE_TEMPERATURES } from '../llm-temperature-config'
import { parseJsonFromLlm } from '../lib/llm-json'
import { REQUIRED_PARTS } from '../lib/required-parts-manifest'
import { classifyRegime } from '../lib/part-regime'
import { routePartLookup } from '../lib/regime-router'
import { buildDeterministicPhase, deduplicateBom } from '../lib/bom-builder'
import {
  deriveQuantities,
  applyOverrides,
} from '../lib/quantity-derivation'
import type { ProductSpecs } from '../lib/spec-extraction'

// Stage 4: BOM Generation — uses BOM_GENERATION_SYSTEM from prompts.ts

// USD→GBP conversion. Rough static rate is fine for engineering estimates;
// anything tighter needs a real FX feed which is out of scope here.
const USD_TO_GBP = 0.8

// Default batch size for amortising process setup costs when the brief
// does not specify one. Prototype assumption.
const DEFAULT_BATCH_SIZE = 25

async function callOpenRouter(systemPrompt: string, userContent: string): Promise<any> {
  // A10 FIX (2026-05-06): GLM-5.1 reliably returns prose reasoning + numbered
  // list despite "Return ONLY JSON" instruction. Switch to Gemini primary
  // (same as decompose, which works) with response_format: json_object to
  // force the shape. Fallback to Claude then GPT if Gemini errors.
  const models = [
    'google/gemini-3.1-pro-preview',
    'xiaomi/mimo-v2.5-pro',
    'openai/gpt-4.1-mini',
  ]
  let lastErr: any = null

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
          temperature: STAGE_TEMPERATURES.bom,
          max_tokens: 16384,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`OpenRouter ${model} returned ${response.status}`)
      }

      const json = await response.json()
      const msg = json.choices?.[0]?.message
      let raw = msg?.content || msg?.reasoning || ''
      if (!raw && msg?.reasoning_details?.length) {
        raw = msg.reasoning_details
          .filter((d: any) => d.type === 'reasoning.text')
          .map((d: any) => d.text).join('\n')
      }
      if (!raw) throw new Error(`${model}: empty content`)

      console.log(`[bom] ${model} responded: ${raw.length} chars`)
      return parseJsonFromLlm(raw, { stage: 'bom', expectKey: 'parts', model })
    } catch (err) {
      clearTimeout(timeout)
      lastErr = err
      console.warn(`[bom] ${model} failed: ${(err as Error).message}. Trying next model...`)
      continue
    }
  }
  throw lastErr || new Error('All BOM models failed')
}

async function searchRealPrice(partName: string, material: string): Promise<number | null> {
  const q = `buy ${partName} ${material} price distributor`
  const controller = new AbortController()
  const fetchPromise = fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`,
    {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': process.env.BRAVE_API_KEY || '',
      },
      signal: controller.signal
    }
  )

  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<Response>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new Error('Brave Search request timed out'))
    }, 15000)
  })

  let response: Response
  try {
    response = await Promise.race([fetchPromise, timeoutPromise])
  } catch (err) {
    clearTimeout(timeoutId!)
    return null
  }
  clearTimeout(timeoutId!)

  if (!response.ok) return null

  const data = await response.json()
  const results = data.web?.results || []

  for (const result of results) {
    const text = ((result.title || '') + ' ' + (result.description || '')).toLowerCase()
    const match = text.match(/(?:£|\$|€|gbp|usd)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i)
    if (match && match[1]) {
      const price = parseFloat(match[1].replace(/,/g, ''))
      if (!isNaN(price) && price > 0) {
        const isUsd = text.includes('$') || text.includes('usd')
        const isEur = text.includes('€') || text.includes('eur')
        return isUsd ? price * USD_TO_GBP : isEur ? price * 0.85 : price
      }
    }
  }
  return null
}

// ─── Grounding lookups ─────────────────────────────────────────────────────

/**
 * Find a material in the catalogue by code (exact, case-insensitive) or
 * by family (e.g. "aluminum", "steel"). Returns null if nothing matches.
 *
 * Exact code match wins. Family match is a fallback that picks the cheapest
 * verified entry in that family so the cost estimate doesn't swing wildly
 * based on which specific alloy the LLM named.
 */
function findMaterial(
  materialField: string | undefined,
  catalogue: MaterialProperty[]
): MaterialProperty | null {
  if (!materialField || catalogue.length === 0) return null
  const needle = materialField.trim().toLowerCase()
  if (!needle || needle === 'varies' || needle === 'cots' || needle === 'n/a') return null

  // 1. Exact code match (e.g. "6061-T6", "304SS")
  const byCode = catalogue.find(m => m.material_code.toLowerCase() === needle)
  if (byCode) return byCode

  // 2. Exact name match (e.g. "Aluminum 6061-T6")
  const byName = catalogue.find(m => m.material_name.toLowerCase() === needle)
  if (byName) return byName

  // 3. Substring match on code (handles "6061" vs "6061-T6")
  const bySubCode = catalogue.find(m =>
    m.material_code.toLowerCase().includes(needle) ||
    needle.includes(m.material_code.toLowerCase())
  )
  if (bySubCode) return bySubCode

  // 4. Family match — pick cheapest verified entry in the family
  const family = catalogue
    .filter(m => needle.includes(m.material_family.toLowerCase()))
    .sort((a, b) => (a.cost_per_kg_usd ?? Infinity) - (b.cost_per_kg_usd ?? Infinity))
  if (family.length > 0) return family[0]

  return null
}

/**
 * Find a process in the catalogue by name (exact) or display name.
 */
function findProcess(
  processField: string | undefined,
  catalogue: ProcessCapability[]
): ProcessCapability | null {
  if (!processField || catalogue.length === 0) return null
  const needle = processField.trim().toLowerCase()
  if (!needle || needle === 'purchased_cots' || needle === 'cots') return null

  const byName = catalogue.find(p => p.process_name.toLowerCase() === needle)
  if (byName) return byName

  const byDisplay = catalogue.find(p => p.display_name.toLowerCase() === needle)
  if (byDisplay) return byDisplay

  // Substring both ways
  const bySub = catalogue.find(p =>
    p.process_name.toLowerCase().includes(needle) ||
    needle.includes(p.process_name.toLowerCase())
  )
  if (bySub) return bySub

  return null
}

/**
 * Compute a cost for a fabricated part from the material + process catalogue.
 *
 * Model: material_cost + process_cost
 *   material_cost = mass_kg × cost_per_kg_usd × USD_TO_GBP
 *   process_cost = (setup_cost_usd / batch_size + material_cost × (per_part_cost_multiplier - 1)) × USD_TO_GBP
 *
 * Returns null if we don't have enough data to produce a grounded estimate.
 */
function computeFabricatedCost(
  massKg: number | undefined,
  material: MaterialProperty | null,
  process: ProcessCapability | null,
  batchSize: number
): { cost: number; breakdown: string } | null {
  if (!massKg || massKg <= 0) return null
  if (!material || material.cost_per_kg_usd == null) return null

  const materialCostUsd = massKg * material.cost_per_kg_usd
  const materialCostGbp = materialCostUsd * USD_TO_GBP

  if (!process) {
    // No process info: just return material cost. This is honest — we can't
    // estimate machining/forming labour without the process catalogue.
    return {
      cost: materialCostGbp,
      breakdown: `material only: ${massKg.toFixed(2)}kg × $${material.cost_per_kg_usd}/kg = £${materialCostGbp.toFixed(2)}`,
    }
  }

  const setupPerPartUsd = (process.setup_cost_usd_typical ?? 0) / Math.max(1, batchSize)
  const mult = process.per_part_cost_multiplier ?? 1
  // per_part_cost_multiplier is a multiplier on the full per-part cost in the
  // engineering handbook schema; we interpret it as a material-cost multiplier
  // so that (multiplier - 1) is the process labour uplift.
  const processLabourUsd = materialCostUsd * Math.max(0, mult - 1) + setupPerPartUsd
  const processLabourGbp = processLabourUsd * USD_TO_GBP

  const total = materialCostGbp + processLabourGbp
  return {
    cost: total,
    breakdown: `${massKg.toFixed(2)}kg ${material.material_code} @ $${material.cost_per_kg_usd}/kg + ${process.display_name} (${mult}× mult, $${process.setup_cost_usd_typical ?? 0} setup / ${batchSize}) = £${total.toFixed(2)}`,
  }
}

// ─── Main stage ────────────────────────────────────────────────────────────

export async function runBomCost(
  modules: Module[],
  dimensionSheet: DimensionSheet | null,
  options?: {
    domain?: string
    ceilingGbp?: number
    trainingDataDossier?: string
    batchSize?: number
    grounding?: GroundingData
    // Per-cell qty realism (2026-05-06): specs + productClass let the BOM
    // stage override LLM-guessed quantities with deterministic formulae
    // (e.g. BESS cell count from capacity). See lib/quantity-derivation.ts.
    productSpecs?: ProductSpecs
    productClass?: string
  }
): Promise<StageResult<{ parts: Part[]; bomLines: BomLine[]; costBreakdown: CostBreakdown }>> {
  const startTime = Date.now()

  try {
    // Load grounding ONCE, up front. If caller passed it in (from index.ts
    // where it's already loaded) reuse that; otherwise load it ourselves.
    console.log('[bom-cost] Loading grounding data from database...')
    const grounding = options?.grounding ?? await loadAllGroundingData(options?.domain)
    console.log(
      `[bom-cost] Grounding loaded: ${grounding.materials.length} materials, ${grounding.processes.length} processes, ${grounding.standards.length} standards`
    )

    const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE

    // Phase 1 + 2: Corpus-first / deterministic-first BOM parts
    const { deterministicParts, deterministicBomLines } = await buildDeterministicPhase(
      options?.productClass,
      modules
    )
    console.log(`[bom-cost] Built ${deterministicParts.length} deterministic parts via phase 1/2`)

    // Build the modules description for the LLM
    const moduleDescriptions = modules.map((m) => {
      return `## Module: ${m.name} (id: ${m.id})
Purpose: ${m.purpose}
Key Parts: ${(m.keyParts || []).join(", ")}
Description: ${m.description}
Total mass budget: ${m.estimatedMassKg ?? 0} kg`
    }).join("\n\n")

    // Build the grounding block for the LLM. This is the "data-first" shift:
    // the LLM sees the real catalogue BEFORE it names parts, so its material
    // codes and process names actually land in our lookup tables.
    const groundingBlock = `
You have access to the following grounding catalogues. USE THESE material codes
and process names in your BOM. Do not invent material codes that are not in this
list — downstream cost calculation relies on exact-match lookup.

## Materials catalogue (${grounding.materials.length} entries)
${formatMaterialsForPrompt(grounding.materials)}

## Process catalogue (${grounding.processes.length} entries)
${formatProcessesForPrompt(grounding.processes)}
`

    const context = options?.trainingDataDossier
      ? `\n\n## Training data dossier\n${options.trainingDataDossier.slice(0, 4000)}`
      : ""

    // Build deterministic parts exclusion text
    let deterministicExclusion = ""
    if (deterministicParts.length > 0) {
      const names = deterministicParts.map(p => p.name).join(", ")
      deterministicExclusion = `\n\nCRITICAL RULE: The following parts are already sourced and priced — do NOT regenerate them: ${names}. Generate ONLY additional parts needed for this product that are NOT in the above list.`
    }

    const userPrompt = `Generate a BOM for the modules below. Use the grounding catalogues when naming materials and processes.${deterministicExclusion}\n\n${moduleDescriptions}\n${groundingBlock}${context}`

    console.log('[bom-cost] Generating BOM via OpenRouter (grounded with catalogues)...')
    const skeletonRes = await callOpenRouter(BOM_GENERATION_SYSTEM, userPrompt)

    const skeletonParts = Array.isArray(skeletonRes.parts) ? skeletonRes.parts : []
    const bomLines = Array.isArray(skeletonRes.bomLines) ? skeletonRes.bomLines : []

    if (skeletonParts.length === 0) {
      throw new Error('No skeleton parts generated')
    }

    // Mass lookup for parts where the LLM didn't estimate mass. Keep the
    // curated table small and domain-agnostic (mechanical primitives only).
    const MASS_LOOKUP: Record<string, number> = {
      compressor: 25, scroll: 25, evaporator: 15, condenser: 12, bphe: 8,
      'heat exchanger': 10, fan: 5, axial: 5, motor: 8, inverter: 12, drive: 12,
      enclosure: 20, chassis: 30, frame: 25, pump: 8, valve: 2, eev: 1,
      sensor: 0.2, transducer: 0.3, pcb: 0.5, controller: 1, hmi: 2, display: 1,
      wiring: 3, harness: 2, cable: 1, insulation: 2, foam: 1, gasket: 0.5,
      seal: 0.3, fastener: 0.1, bolt: 0.05, bracket: 1.5, panel: 5, casing: 8,
      jacket: 3,
    }

    // B2 FIX (2026-05-06): expanded COTS cost heuristic — last resort when the
    // LLM declared the part is_purchased but gave no cost and database lookup
    // didn't match. Previous table had a few common heat-pump parts then £25
    // default; that default dominated on BESS / farm BOMs where most parts
    // aren't heat-pump specific. Tagged priceSource: 'heuristic' so the PDF
    // can show reader-visible source grade.
    function heuristicCotsCost(name: string): number {
      const n = name.toLowerCase()

      // ─── Known-expensive components (floor prices) ────────────────────
      // Catch components that routinely cost $30k-80k but were landing at
      // the £18 default. These are MINIMUM prices — the search/LLM pass
      // that follows can still raise them.
      const KNOWN_EXPENSIVE: Array<{ pattern: RegExp; minPrice: number; label: string }> = [
        // Navigation / DVL
        { pattern: /dvl|doppler velocity log/i, minPrice: 25000, label: 'DVL' },
        { pattern: /phins|ixblue|exail/i, minPrice: 45000, label: 'FOG INS' },
        { pattern: /\bins\b|inertial navigation/i, minPrice: 40000, label: 'INS' },
        // Acoustic comms
        { pattern: /acoustic modem|underwater.*comm/i, minPrice: 5000, label: 'Acoustic modem' },
        // Pressure / subsea
        { pattern: /syntactic foam/i, minPrice: 500, label: 'Syntactic foam' },
        { pattern: /subconn|underwater.*connector/i, minPrice: 150, label: 'Subsea connector' },
        // Semiconductors
        { pattern: /fpga|xilinx|altera/i, minPrice: 50, label: 'FPGA' },
        { pattern: /ambarella|qualcomm.*soc|nvidia.*jetson/i, minPrice: 100, label: 'SoC' },
        // Sensors
        { pattern: /sony.*imx|cmos.*sensor/i, minPrice: 50, label: 'Image sensor' },
        // Batteries (large)
        { pattern: /battery.*kwh|kwh.*battery/i, minPrice: 200, label: 'Large battery' },
      ]
      for (const { pattern, minPrice, label } of KNOWN_EXPENSIVE) {
        if (pattern.test(n)) {
          console.log(`[bom-cost:heuristic] Known-expensive match: "${name}" → ${label} (floor £${minPrice})`)
          return minPrice
        }
      }

      // ─── Battery / BESS-specific ───────────────────────────────────────
      if (/prismatic|lfp|lithium|li-?ion/.test(n) && /cell/.test(n)) return 42   // CATL 280 Ah cell ~£42
      if (/battery module|cell module/.test(n)) return 250
      if (/\brack\b.*(?:batter|cell)/.test(n) || /battery rack/.test(n)) return 180
      if (/bms.*master|master.*bms/.test(n)) return 350
      if (/bms.*slave|slave.*bms/.test(n)) return 85

      // ─── Power electronics ────────────────────────────────────────────
      if (/pcs\b|power conversion/.test(n)) return 38000                          // 1 MW PCS ~£38k
      if (/\binverter\b|drive\b/.test(n)) return 450
      if (/transformer/.test(n)) return 8500
      if (/step.?up|step.?down/.test(n) && /transformer|converter/.test(n)) return 7200
      if (/protection relay|relay.*(g99|sel-|siprotec)/.test(n)) return 2400
      if (/\bigbt\b|power module/.test(n)) return 180
      if (/capacitor.*(dc|power|film|snap-in)/.test(n)) return 45
      if (/busbar|bus-bar|bus bar/.test(n)) return 28
      if (/fuse.*(1500|hrc|dc)/.test(n)) return 45
      if (/\bfuse\b/.test(n)) return 8

      // ─── Thermal management ───────────────────────────────────────────
      if (/compressor/.test(n)) return 1200                                        // scroll ~£800-2k
      if (/bphe|brazed.?plate heat/.test(n)) return 620
      if (/heat exchanger|evaporator|condenser/.test(n)) return 580
      if (/chiller|cdu|cooling distribution/.test(n)) return 8500
      if (/\bfan\b(?!.*grille)/.test(n)) return 280
      if (/expansion valve|eev|txv/.test(n)) return 180
      if (/\bpump\b/.test(n)) return 320
      if (/cold plate/.test(n)) return 220
      if (/manifold/.test(n)) return 75

      // ─── Safety / fire / detection ────────────────────────────────────
      if (/novec|fm-?200|fk-?5-1-12|clean agent/.test(n)) return 3800
      if (/stat-?x|aerosol.*suppress/.test(n)) return 420
      if (/off-?gas|li-?ion tamer|voc detect/.test(n)) return 2400
      if (/smoke detect/.test(n)) return 85
      if (/gas (?:detector|sensor)|h2 sensor|co sensor/.test(n)) return 180
      if (/fire (?:alarm )?control panel|facp/.test(n)) return 1200

      // ─── Enclosure / structure ────────────────────────────────────────
      if (/\bcontainer\b.*(?:iso|40.?ft|20.?ft)/.test(n) || /40.?foot iso container/.test(n)) return 4200
      if (/enclosure|housing|chassis|cabinet/.test(n)) return 250
      if (/bracket|mount/.test(n)) return 18
      if (/panel(?!.*solar)/.test(n)) return 95

      // ─── Electrical ─────────────────────────────────────────────────────
      if (/contactor/.test(n)) return 320
      if (/current transducer|current sensor|lem.*hab|lem.*dhab/.test(n)) return 95
      if (/switchgear|disconnect|isolator/.test(n)) return 680
      if (/circuit breaker|mccb|mcb/.test(n)) return 180

      // ─── Controls / comms ──────────────────────────────────────────────
      if (/plc|industrial pc|beckhoff/.test(n)) return 1800
      if (/hmi|display.*touch|touchscreen/.test(n)) return 420
      if (/cellular modem|4g|5g modem/.test(n)) return 350
      if (/ethernet switch.*industrial|managed switch/.test(n)) return 280
      if (/\bups\b/.test(n)) return 420
      if (/controller|mainboard|control board/.test(n)) return 180

      // ─── Horticulture / farm ───────────────────────────────────────────
      if (/led.*grow|horticultural led|grow light/.test(n)) return 280
      if (/fertigation|dosing pump|peristaltic/.test(n)) return 220
      if (/ec sensor|ph sensor|par sensor/.test(n)) return 280
      if (/co2.*(sensor|dosing|cylinder)/.test(n)) return 320
      if (/hepa filter/.test(n)) return 180
      if (/\btray\b.*(?:dwc|nft|flood|ebb)/.test(n)) return 85

      // ─── Sensors generic ───────────────────────────────────────────────
      if (/\b(?:temperature|thermistor|rtd|ntc).*sensor/.test(n) || /\bntc\b/.test(n)) return 12
      if (/pressure transducer|pressure sensor/.test(n)) return 85
      if (/sensor|transducer|transmitter|detector/.test(n)) return 65

      // ─── Wiring / connections ──────────────────────────────────────────
      if (/wiring harness|cable harness/.test(n)) return 180
      if (/connector|header/.test(n)) return 12
      if (/cable gland/.test(n)) return 18
      if (/cable\b(?!.*assembly)/.test(n)) return 8   // per-metre cable
      if (/terminal block|din rail terminal/.test(n)) return 6

      // ─── Insulation / sealing / hardware ──────────────────────────────
      // B2b (2026-05-06): thermal-pad / intumescent / inter-cell barriers are
      // typically cheap sheet-cut pieces, NOT £18 each. They DO sometimes
      // appear in BOMs with quantities of 5,000+ per BESS. Keep them at
      // £0.80-3 unless they are specifically a named acoustic enclosure pad.
      if (/thermal pad|intumescent|inter.?cell.*barrier|inter.?cell.*pad|poron|ceramic fibre|mica.?composite|mica.?based|mica paper/.test(n)) return 0.80
      if (/acoustic (?:pad|panel|insulation).*(?:enclosure|panel)/.test(n)) return 35
      if (/insulation|foam/.test(n)) return 14
      if (/gasket|o-?ring|\bseal\b/.test(n)) return 8
      if (/fastener|washer/.test(n)) return 0.4
      if (/\bbolt\b|\bnut\b|\bscrew\b|\brivet\b|insert|helicoil/.test(n)) return 0.8
      if (/thermal paste|\btim\b|thermal pad/.test(n)) return 6

      // ─── Default small-part fallback ───────────────────────────────────
      return 18
    }

    // Build the final parts list, attaching mass, cost, and source attribution
    const finalParts: Part[] = skeletonParts.map((sp: any): Part => {
      const name = sanitiseLlmOutput(sp.name || '')
      const material = sanitiseLlmOutput(sp.material || '')
      const process = sanitiseLlmOutput(sp.process || '')
      const isPurchased = Boolean(sp.isPurchased)

      // Mass: use LLM value if plausible, else keyword lookup, else 0.5kg default
      let massKg: number = typeof sp.massKg === 'number' && sp.massKg > 0 ? sp.massKg : 0
      if (massKg === 0) {
        const nameLower = name.toLowerCase()
        for (const [kw, m] of Object.entries(MASS_LOOKUP)) {
          if (nameLower.includes(kw)) { massKg = m; break }
        }
        if (massKg === 0) massKg = 0.5
      }

      return {
        id: sanitiseLlmOutput(sp.partNumber || ''),
        partNumber: sanitiseLlmOutput(sp.partNumber || ''),
        name,
        sourceModuleId: sanitiseLlmOutput(sp.sourceModuleId || ''),
        process,
        isPurchased,
        material: material || (isPurchased ? 'cots' : 'varies'),
        massKg,
        // Cost is computed in the next pass after grounding lookups
        estimatedUnitCostGbp: typeof sp.estimatedUnitCostGbp === 'number' ? sp.estimatedUnitCostGbp : undefined,
      }
    })

    const finalBomLines: BomLine[] = bomLines.map((bl: any) => ({
      parentPartId: bl.parentPartNumber ? sanitiseLlmOutput(bl.parentPartNumber) : null,
      childPartId: sanitiseLlmOutput(bl.childPartNumber || ''),
      quantity: Number(bl.quantity) || 1,
    }))

    // ─── Phase 4: Merge + Deduplicate (Deterministic + LLM) ──────────────
    const merged = deduplicateBom(
      deterministicParts,
      deterministicBomLines,
      finalParts,
      finalBomLines,
      options?.productClass
    )
    const mergedParts = merged.finalParts
    let appliedBomLines = merged.finalBomLines

    // ─── Per-cell quantity realism (2026-05-06) ──────────────────────────
    // Override LLM-guessed BOM quantities with deterministic formulae
    // derived from ProductSpecs. This is the single biggest lever on BOM
    // cost accuracy: LLMs guess cell counts between 272 and 5,000 for the
    // same 3.5 MWh brief. Deterministic qty locks it to ~4,880.
    //
    // Overrides are applied in-place to finalBomLines, stamping
    // `qtySource: 'deterministic'` so the PDF renderer can show the
    // override visually (green cell background).
    if (options?.productSpecs && options?.productClass) {
      const overrides = deriveQuantities(
        options.productSpecs,
        options.productClass,
        mergedParts,
        appliedBomLines,
      )
      if (overrides.length > 0) {
        for (const ov of overrides) {
          console.log(
            `[bom-cost:qty] override ${ov.partNumber} qty ${ov.oldQty} → ${ov.newQty} ` +
              `(rule: ${ov.rule}, conf: ${ov.confidence}) — ${ov.explanation}`
          )
        }
        // applyOverrides returns a new array with qtySource/qtyRule stamps.
        // Cast through unknown because BomLine shape doesn't officially
        // include these runtime-only fields; PDF renderer reads them via
        // (bl as any).qtySource.
        appliedBomLines = applyOverrides(appliedBomLines, overrides) as BomLine[]
        // Also stamp priceSource on the matching parts so the BOM renderer
        // can show "deterministic-qty" in the Gr. column if needed.
        for (const ov of overrides) {
          const part = mergedParts.find(
            p => p.partNumber === ov.partNumber || p.id === ov.partId
          )
          if (part) {
            ;(part as any).qtyDeterministic = true
            ;(part as any).qtyRule = ov.rule
          }
        }
        console.log(
          `[bom-cost:qty] Applied ${overrides.length} deterministic qty override(s)`
        )
      } else {
        console.log('[bom-cost:qty] No deterministic overrides applied (no rules matched parts)')
      }
    } else {
      console.log(
        '[bom-cost:qty] Skipped — missing productSpecs or productClass in options'
      )
    }

    // ─── Ground each part against the catalogue ──────────────────────────
    let groundedCount = 0
    let heuristicCount = 0
    let llmCount = 0
    let manifestUnpricedCount = 0

    for (const part of mergedParts) {
      // If it's already priced by the deterministic phase, skip grounding lookup
      if ((part as any).priceSource === 'distributor') {
        groundedCount++
        continue
      }

      const material = findMaterial(part.material, grounding.materials)
      const process = findProcess(part.process, grounding.processes)

      // Record what we matched for audit purposes
      ;(part as any).matchedMaterialCode = material?.material_code ?? null
      ;(part as any).matchedProcessName = process?.process_name ?? null

      if (!part.isPurchased) {
        // Fabricated: compute from material + process catalogue
        const computed = computeFabricatedCost(part.massKg, material, process, batchSize)
        if (computed) {
          part.estimatedUnitCostGbp = computed.cost
          ;(part as any).priceSource = 'database'
          ;(part as any).priceBreakdown = computed.breakdown
          groundedCount++
        } else if (typeof part.estimatedUnitCostGbp === 'number' && part.estimatedUnitCostGbp > 0) {
          ;(part as any).priceSource = 'llm'
          llmCount++
        } else {
          // Last resort: heuristic by keyword
          if ((part as any).sourceManifest) {
            ;(part as any).priceSource = 'manifest_no_price'
            manifestUnpricedCount++
          } else {
            part.estimatedUnitCostGbp = heuristicCotsCost(part.name)
            ;(part as any).priceSource = 'heuristic'
            heuristicCount++
          }
        }
      } else {
        // COTS: prefer LLM estimate (often quite good for named manufacturers),
        // else heuristic. Database lookup doesn't apply for COTS.
        if (typeof part.estimatedUnitCostGbp === 'number' && part.estimatedUnitCostGbp > 0) {
          ;(part as any).priceSource = 'llm'
          llmCount++
        } else {
          if ((part as any).sourceManifest) {
            ;(part as any).priceSource = 'manifest_no_price'
            manifestUnpricedCount++
          } else {
            part.estimatedUnitCostGbp = heuristicCotsCost(part.name)
            ;(part as any).priceSource = 'heuristic'
            heuristicCount++
          }
        }
      }
    }

    console.log(
      `[bom-cost] Grounded cost sources: ${groundedCount} database/distributor, ${llmCount} LLM, ${heuristicCount} heuristic, ${manifestUnpricedCount} unpriced manifest (of ${mergedParts.length} total)`
    )

    // ─── Top-N web price lookup for the most expensive parts ──────────────
    console.log('[bom-cost] Searching Brave for real prices on top 10 most expensive parts...')
    const sortedIndices = mergedParts
      .map((p, i) => ({ i, cost: p.estimatedUnitCostGbp ?? 0 }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10)

    const searchPromises = sortedIndices.map(async ({ i }) => {
      const part = mergedParts[i]
      // Skip if already found via deterministic distributor
      if ((part as any).priceSource === 'distributor') return

      const realPrice = await searchRealPrice(part.name, part.material || '')
      if (realPrice !== null) {
        part.estimatedUnitCostGbp = realPrice
        part.isPurchased = true
        part.process = 'purchased_cots'
        ;(part as any).priceSource = 'search'
      }
    })
    await Promise.all(searchPromises)

    const costBreakdown = calculateCost(mergedParts, appliedBomLines, options?.domain || 'default', options?.ceilingGbp || null, options?.batchSize)

    console.log('[bom-cost] BOM generation complete.')
    return {
      ok: true,
      data: { parts: mergedParts, bomLines: appliedBomLines, costBreakdown },
      durationMs: Date.now() - startTime,
    }
  } catch (error: any) {
    console.error('[bom-cost] Stage failed:', error)
    return {
      ok: false,
      error: error.message || 'Unknown error during BOM generation',
      durationMs: Date.now() - startTime,
    }
  }
}

async function gapFillBom(
  modules: Module[],
  skeletonParts: Part[]
): Promise<Part[]> {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
  if (!OPENROUTER_API_KEY) {
    console.warn('No OPENROUTER_API_KEY found, skipping BOM gap-fill')
    return []
  }

  const controller = new AbortController()
  // AbortSignal.timeout() is unreliable in Node server actions. Using setTimeout and explicit abort.
  const timeoutMs = 120000
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const systemPrompt = `You are a mechanical and electrical engineering assistant.
Your task is to identify standard hardware and components missing from a bill of materials (BOM).
Common gap-fill categories:
- Fasteners (bolts, nuts, washers), brackets, gaskets for mechanical assemblies
- Connectors, wiring harnesses, PCB headers for electrical modules
- Mounting hardware, labels/markings

Given the modules and skeleton parts, return a JSON array of additional parts with the EXACT SAME schema as the skeleton parts.
Every part MUST have:
- partNumber (unique, e.g., 'fastener-001')
- name
- sourceModuleId (must refer to one of the provided module IDs)
- process (e.g., 'purchased_cots')
- material
- massKg
- estimatedUnitCostGbp
- isPurchased (boolean)

Respond ONLY with valid JSON array of objects. Do not use markdown blocks.`

  const userPrompt = JSON.stringify({ modules, skeletonParts }, null, 2)

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'z-ai/glm-5.1',
        temperature: STAGE_TEMPERATURES.bom,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      console.warn(`OpenRouter gap-fill failed: ${res.status} ${res.statusText}`)
      return []
    }

    const data = await res.json() as any
    const msg = data.choices?.[0]?.message
    // Gemini reasoning models may put output in 'reasoning' instead of 'content'
    const content = msg?.content || msg?.reasoning || (msg?.reasoning_details?.length
      ? msg.reasoning_details.filter((d: any) => d.type === 'reasoning.text').map((d: any) => d.text).join('\n')
      : '[]')
    
    // Attempt to parse array or { parts: [] }
    let parsed: any
    try {
      // Remove any markdown formatting
      const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim()
      parsed = JSON.parse(cleanContent)
    } catch (e) {
      console.error('Failed to parse gap-fill response:', e)
      return []
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
       // if object is returned find an array inside
       const arrays = Object.values(parsed).filter(Array.isArray)
       if (arrays.length > 0) {
         parsed = arrays[0]
       } else {
         parsed = []
       }
    }
    
    if (Array.isArray(parsed)) {
      const moduleIds = new Set(modules.map(m => m.id))
      return parsed.map((p: any, idx: number) => ({
        id: p.id || `gap-fill-${Date.now()}-${idx}`,
        partNumber: p.partNumber || `gap-fill-pn-${Date.now()}-${idx}`,
        name: p.name || 'Standard Component',
        sourceModuleId: moduleIds.has(p.sourceModuleId) ? p.sourceModuleId : modules[0]?.id,
        process: p.process || 'purchased_cots',
        material: p.material || 'varies',
        massKg: typeof p.massKg === 'number' ? p.massKg : 0.05,
        estimatedUnitCostGbp: typeof p.estimatedUnitCostGbp === 'number' ? p.estimatedUnitCostGbp : 1.0,
        isPurchased: typeof p.isPurchased === 'boolean' ? p.isPurchased : true
      }))
    }
    
    return []
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      console.warn('BOM gap-fill timed out')
    } else {
      console.error('BOM gap-fill error:', err)
    }
    return []
  }
}
