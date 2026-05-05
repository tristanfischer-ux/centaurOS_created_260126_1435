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

// Stage 4: BOM Generation — uses BOM_GENERATION_SYSTEM from prompts.ts

// USD→GBP conversion. Rough static rate is fine for engineering estimates;
// anything tighter needs a real FX feed which is out of scope here.
const USD_TO_GBP = 0.8

// Default batch size for amortising process setup costs when the brief
// does not specify one. Prototype assumption.
const DEFAULT_BATCH_SIZE = 25

async function callOpenRouter(systemPrompt: string, userContent: string): Promise<any> {
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
        model: 'z-ai/glm-5.1',
        max_tokens: 16384,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
      signal: controller.signal
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

    console.log('[bom] Response length:', raw.length, 'chars. First 300:', raw.slice(0, 300))

    let jsonStr = raw.replace(/^\s*```json\s*/m, '').replace(/```\s*$/m, '').trim()

    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
    }

    try {
      return JSON.parse(jsonStr)
    } catch (e) {
      const partsMatch = jsonStr.match(/\{[\s\S]*"parts"[\s\S]*\}/)
      if (partsMatch) {
        try { return JSON.parse(partsMatch[0]) } catch (e2) { /* continue */ }
      }
      console.error('[bom] JSON parsing failed. First 500 chars:', raw.slice(0, 500))
      throw new Error('Failed to parse JSON response from LLM')
    }
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
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

    const userPrompt = `Generate a BOM for the modules below. Use the grounding catalogues when naming materials and processes.\n\n${moduleDescriptions}\n${groundingBlock}${context}`

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

    // COTS cost heuristic — used ONLY as a last resort when the LLM declared
    // the part is_purchased but gave no cost and we have no database match.
    // Flagged as priceSource: 'heuristic' so readers know the confidence.
    function heuristicCotsCost(name: string): number {
      const n = name.toLowerCase()
      if (n.includes('compressor')) return 800
      if (n.includes('heat exchanger') || n.includes('bphe') || n.includes('evaporator') || n.includes('condenser')) return 600
      if (n.includes('fan') && !n.includes('grille')) return 250
      if (n.includes('expansion valve') || n.includes('eev')) return 150
      if (n.includes('pump')) return 250
      if (n.includes('inverter') || n.includes('drive')) return 400
      if (n.includes('control') || n.includes('mainboard') || n.includes('hmi')) return 180
      if (n.includes('enclosure') || n.includes('housing') || n.includes('chassis')) return 120
      if (n.includes('sensor') || n.includes('transducer')) return 60
      if (n.includes('valve') || n.includes('prv')) return 80
      if (n.includes('wiring') || n.includes('harness')) return 45
      if (n.includes('insulation') || n.includes('gasket') || n.includes('seal')) return 15
      if (n.includes('fastener') || n.includes('bolt') || n.includes('nut')) return 5
      return 25
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

    // ─── Ground each part against the catalogue ──────────────────────────
    let groundedCount = 0
    let heuristicCount = 0
    let llmCount = 0

    for (const part of finalParts) {
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
          part.estimatedUnitCostGbp = heuristicCotsCost(part.name)
          ;(part as any).priceSource = 'heuristic'
          heuristicCount++
        }
      } else {
        // COTS: prefer LLM estimate (often quite good for named manufacturers),
        // else heuristic. Database lookup doesn't apply for COTS.
        if (typeof part.estimatedUnitCostGbp === 'number' && part.estimatedUnitCostGbp > 0) {
          ;(part as any).priceSource = 'llm'
          llmCount++
        } else {
          part.estimatedUnitCostGbp = heuristicCotsCost(part.name)
          ;(part as any).priceSource = 'heuristic'
          heuristicCount++
        }
      }
    }

    console.log(
      `[bom-cost] Grounded cost sources: ${groundedCount} database, ${llmCount} LLM, ${heuristicCount} heuristic (of ${finalParts.length} total)`
    )

    // ─── Top-N web price lookup for the most expensive parts ──────────────
    console.log('[bom-cost] Searching Brave for real prices on top 10 most expensive parts...')
    const sortedIndices = finalParts
      .map((p, i) => ({ i, cost: p.estimatedUnitCostGbp ?? 0 }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10)

    const searchPromises = sortedIndices.map(async ({ i }) => {
      const part = finalParts[i]
      const realPrice = await searchRealPrice(part.name, part.material || '')
      if (realPrice !== null) {
        part.estimatedUnitCostGbp = realPrice
        part.isPurchased = true
        part.process = 'purchased_cots'
        ;(part as any).priceSource = 'search'
      }
    })
    await Promise.all(searchPromises)

    const costBreakdown = calculateCost(finalParts, options?.domain || 'default', options?.ceilingGbp || null)

    console.log('[bom-cost] BOM generation complete.')
    return {
      ok: true,
      data: { parts: finalParts, bomLines: finalBomLines, costBreakdown },
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
