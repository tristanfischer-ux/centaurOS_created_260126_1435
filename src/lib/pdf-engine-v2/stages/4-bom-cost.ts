import { calculateCost } from '../cost-model'
import { loadAllGroundingData } from '../db-queries'
import type { Module, Part, BomLine, CostBreakdown, StageResult, DimensionSheet } from '../types'
import { sanitiseLlmOutput } from '../sanitiser'
import { BOM_GENERATION_SYSTEM } from '../prompts'

// Stage 4: BOM Generation — uses BOM_GENERATION_SYSTEM from prompts.ts

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
      // Try finding JSON with 'parts' field
      const partsMatch = jsonStr.match(/\{[\s\S]*"parts"[\s\S]*\}/)
      if (partsMatch) {
        try { return JSON.parse(partsMatch[0]) } catch (e2) { /* continue */ }
      }
      console.error('[bom] JSON parsing failed. First 500 chars:', raw.slice(0, 500))
      throw new Error('Failed to parse JSON response from LLM')
    }
    
    try {
      return JSON.parse(jsonStr)
    } catch (parseError) {
      console.error('[bom-cost] JSON parsing failed. First 300 chars:', jsonStr.slice(0, 300))
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
    // Look for $ or £ followed by number
    const match = text.match(/(?:£|\$|€|gbp|usd)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i)
    if (match && match[1]) {
      const price = parseFloat(match[1].replace(/,/g, ''))
      if (!isNaN(price) && price > 0) {
        const isUsd = text.includes('$') || text.includes('usd')
        const isEur = text.includes('€') || text.includes('eur')
        return isUsd ? price * 0.8 : isEur ? price * 0.85 : price
      }
    }
  }
  return null
}

// Run BOM generation: LLM Skeleton + LLM Expansion + cost calculation
export async function runBomCost(
  modules: Module[],
  dimensionSheet: DimensionSheet | null,
  options?: { domain?: string; ceilingGbp?: number; trainingDataDossier?: string }
): Promise<StageResult<{ parts: Part[]; bomLines: BomLine[]; costBreakdown: CostBreakdown }>> {
  const startTime = Date.now()

  try {
    const moduleDescriptions = modules.map((m) => {
      return `## Module: ${m.name} (id: ${m.id})
Purpose: ${m.purpose}
Key Parts: ${(m.keyParts || []).join(", ")}
Description: ${m.description}
Total mass budget: ${m.estimatedMassKg ?? 0} kg`
    }).join("\n\n")

    const context = options?.trainingDataDossier 
      ? `\n\nTraining Data Dossier Context:\n${options.trainingDataDossier.slice(0, 5000)}`
      : ""

    // 1. Generate BOM Skeleton
    console.log('[bom-cost] Generating BOM skeleton via OpenRouter...')
    const skeletonUserPrompt = `Generate a BOM skeleton for the modules below:\n\n${moduleDescriptions}${context}\n\nReturn part names, hierarchy, and process types only.`
    const skeletonRes = await callOpenRouter(BOM_GENERATION_SYSTEM, skeletonUserPrompt)
    
    const skeletonParts = Array.isArray(skeletonRes.parts) ? skeletonRes.parts : []
    const bomLines = Array.isArray(skeletonRes.bomLines) ? skeletonRes.bomLines : []

    if (skeletonParts.length === 0) {
      throw new Error('No skeleton parts generated')
    }

    // Skip expensive expansion step — use skeleton parts with cost model estimates
    console.log('[bom-cost] Using skeleton parts with cost model estimates...')
    const finalParts: Part[] = skeletonParts.map((sp: any) => {
      // Apply cost heuristics based on process type and name
      const name = (sp.name || '').toLowerCase()
      let cost = 25
      if (name.includes('compressor')) cost = 800
      else if (name.includes('heat exchanger') || name.includes('bphe') || name.includes('evaporator') || name.includes('condenser')) cost = 600
      else if (name.includes('fan') && !name.includes('grille')) cost = 250
      else if (name.includes('expansion valve') || name.includes('eev')) cost = 150
      else if (name.includes('pump')) cost = 250
      else if (name.includes('inverter') || name.includes('drive')) cost = 400
      else if (name.includes('control') || name.includes('mainboard') || name.includes('hmi')) cost = 180
      else if (name.includes('enclosure') || name.includes('housing') || name.includes('chassis')) cost = 120
      else if (name.includes('sensor') || name.includes('transducer')) cost = 60
      else if (name.includes('valve') || name.includes('prv')) cost = 80
      else if (name.includes('wiring') || name.includes('harness')) cost = 45
      else if (name.includes('insulation') || name.includes('gasket') || name.includes('seal')) cost = 15
      else if (name.includes('fastener') || name.includes('bolt') || name.includes('nut')) cost = 5
      else if (sp.process === 'cnc') cost = 80
      else if (sp.process === 'sheet_metal') cost = 60
      else if (sp.process === 'purchased_cots') cost = 40

      return {
        id: sanitiseLlmOutput(sp.partNumber || ""),
        partNumber: sanitiseLlmOutput(sp.partNumber || ""),
        name: sanitiseLlmOutput(sp.name || ""),
        sourceModuleId: sanitiseLlmOutput(sp.sourceModuleId || ""),
        process: sanitiseLlmOutput(sp.process || ""),
        isPurchased: Boolean(sp.isPurchased),
        material: 'varies',
        estimatedUnitCostGbp: cost
      }
    })

    const finalBomLines: BomLine[] = bomLines.map((bl: any) => ({
      parentPartId: bl.parentPartNumber ? sanitiseLlmOutput(bl.parentPartNumber) : null,
      childPartId: sanitiseLlmOutput(bl.childPartNumber || ""),
      quantity: Number(bl.quantity) || 1
    }))

    const MASS_LOOKUP: Record<string, number> = {
      'compressor': 25,
      'scroll': 25,
      'evaporator': 15,
      'condenser': 12,
      'bphe': 8,
      'heat exchanger': 10,
      'fan': 5,
      'axial': 5,
      'motor': 8,
      'inverter': 12,
      'drive': 12,
      'enclosure': 20,
      'chassis': 30,
      'frame': 25,
      'pump': 8,
      'valve': 2,
      'eev': 1,
      'sensor': 0.2,
      'transducer': 0.3,
      'pcb': 0.5,
      'controller': 1,
      'hmi': 2,
      'display': 1,
      'wiring': 3,
      'harness': 2,
      'cable': 1,
      'insulation': 2,
      'foam': 1,
      'gasket': 0.5,
      'seal': 0.3,
      'fastener': 0.1,
      'bolt': 0.05,
      'bracket': 1.5,
      'panel': 5,
      'casing': 8,
      'jacket': 3,
    }

    // Apply to each part
    for (const part of finalParts) {
      if (!part.massKg || part.massKg === 0) {
        const name = (part.name || '').toLowerCase()
        for (const [keyword, mass] of Object.entries(MASS_LOOKUP)) {
          if (name.includes(keyword)) {
            part.massKg = mass
            break
          }
        }
        if (!part.massKg) part.massKg = 1 // Default 1kg for unknown
      }
      if (part.massKg === 0) {
        part.massKg = 0.5
        console.warn(`[bom-cost] Warning: part ${part.name} still has 0 mass, setting to 0.5`)
      }
    }

    console.log('[bom-cost] Loading grounding data from database...')
    const groundingData = await loadAllGroundingData()
    console.log(`[bom-cost] Loaded ${groundingData.totalRecords} grounding records.`)

    for (const part of finalParts) {
      const heuristicCost = part.estimatedUnitCostGbp || 0;
      
      const partName = (part.name || '').toLowerCase()
      const materialName = (part.material || '').toLowerCase()
      const processName = (part.process || '').toLowerCase()

      let dbCost: number | null = null;
      const matchedMaterial = groundingData.materials.find(m => 
        materialName.includes(m.name.toLowerCase()) || 
        partName.includes(m.name.toLowerCase())
      )
      
      if (matchedMaterial && matchedMaterial.cost_per_kg_usd && part.massKg) {
        dbCost = matchedMaterial.cost_per_kg_usd * part.massKg * 0.8; // Convert USD to GBP
      }

      let costMultiplier = 1;
      const matchedProcess = groundingData.processes.find(p => 
        processName.includes(p.process_name.toLowerCase()) ||
        partName.includes(p.process_name.toLowerCase())
      )
      
      if (matchedProcess) {
        const rating = (matchedProcess.cost_rating || '').toLowerCase()
        if (rating.includes('high') || rating.includes('$$$')) costMultiplier = 1.5
        else if (rating.includes('low') || rating.includes('$')) costMultiplier = 0.8
        else costMultiplier = 1.2
      }

      if (dbCost !== null) {
        const finalDbCost = dbCost * costMultiplier;
        part.estimatedUnitCostGbp = finalDbCost;
        (part as any).priceSource = 'database';
        console.log(`[bom-cost] DB cost applied to ${part.name}: £${finalDbCost.toFixed(2)} (Material: ${matchedMaterial?.name || 'unknown'}, Process: ${matchedProcess?.process_name || 'none'})`);
      } else if (matchedProcess) {
        const finalDbCost = heuristicCost * costMultiplier;
        part.estimatedUnitCostGbp = finalDbCost;
        (part as any).priceSource = 'database';
        console.log(`[bom-cost] DB process cost applied to ${part.name}: £${finalDbCost.toFixed(2)} (Process: ${matchedProcess.process_name})`);
      } else {
        (part as any).priceSource = 'heuristic';
      }
    }

    // Top 10 most expensive parts -> Search real prices
    console.log('[bom-cost] Searching Brave for real prices for top 10 expensive parts...')
    const sortedIndices = finalParts
      .map((p, i) => ({ i, cost: p.estimatedUnitCostGbp || 0 }))
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
      } else {
        ;(part as any).priceSource = 'heuristic'
      }
    })
    await Promise.all(searchPromises)

    const costBreakdown = calculateCost(finalParts, options?.domain || 'default', options?.ceilingGbp || null)

    console.log('[bom-cost] Successfully generated and expanded BOM.')
    return {
      ok: true,
      data: { parts: finalParts, bomLines: finalBomLines, costBreakdown },
      durationMs: Date.now() - startTime
    }
  } catch (error: any) {
    console.error('[bom-cost] Stage failed:', error)
    return {
      ok: false,
      error: error.message || 'Unknown error during BOM generation',
      durationMs: Date.now() - startTime
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
