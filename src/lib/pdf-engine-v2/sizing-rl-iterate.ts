/**
 * sizing-rl-iterate.ts — Fast RL loop for Size & Layout quality.
 * 
 * Starts with BESS (passed feasibility 10/10, decomposition 8/10).
 * Pipeline: Research → Brief → Decomposition → Size & Layout (iterate)
 * 
 * Usage: npx tsx src/lib/pdf-engine-v2/sizing-rl-iterate.ts --brief "text" --output /path --max-iter 5
 */

import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const args = process.argv.slice(2)
  const briefIdx = args.indexOf('--brief')
  const outputIdx = args.indexOf('--output')
  const maxIterIdx = args.indexOf('--max-iter')
  const modulesIdx = args.indexOf('--modules')
  
  if (briefIdx === -1 || outputIdx === -1) {
    console.error('Usage: npx tsx sizing-rl-iterate.ts --brief "text" --output /path [--max-iter 5] [--modules path.json]')
    process.exit(1)
  }
  
  const originalBrief = args[briefIdx + 1]
  const outputDir = args[outputIdx + 1]
  const maxIter = maxIterIdx >= 0 ? parseInt(args[maxIterIdx + 1]) : 5
  const modulesPath = modulesIdx >= 0 ? args[modulesIdx + 1] : null
  mkdirSync(outputDir, { recursive: true })
  
  console.log(`[sizing-rl] Starting (max ${maxIter} iterations)...`)
  
  // Step 1: Research ONCE
  console.log('[sizing-rl] Research (one-time)...')
  const { runResearch } = await import(join(__dirname, 'stages/1-research'))
  const researchResult = await runResearch(originalBrief, '')
  const research = researchResult.ok ? researchResult.data : null
  console.log(`[sizing-rl] Research: ${research?.report?.length || 0} chars`)
  
  // Step 2: Get modules (from file or generate)
  let modules: any[] = []
  if (modulesPath) {
    modules = JSON.parse(readFileSync(modulesPath, 'utf-8'))
    console.log(`[sizing-rl] Loaded ${modules.length} modules from ${modulesPath}`)
  } else {
    console.log('[sizing-rl] Generating decomposition...')
    // Use the decompose RL to get modules
    modules = await generateDecomposition(originalBrief, research)
    console.log(`[sizing-rl] Generated ${modules.length} modules`)
  }
  
  // Step 3: Iterative sizing improvement
  const history: any[] = []
  
  for (let iter = 1; iter <= maxIter; iter++) {
    console.log(`\n[sizing-rl] === Iteration ${iter}/${maxIter} ===`)
    
    // Generate sizing
    console.log('[sizing-rl] Generating sizing...')
    const sizing = await generateSizing(originalBrief, modules, research)
    writeFileSync(join(outputDir, `sizing-iter-${iter}.json`), JSON.stringify(sizing, null, 2))
    console.log(`[sizing-rl] Generated: ${sizing.moduleDimensions?.length || 0} module dimensions`)
    
    // Score with council
    console.log('[sizing-rl] Scoring...')
    const scores = await scoreSizing(sizing, originalBrief, modules)
    console.log(`[sizing-rl] Score: ${scores.overall}/10`)
    console.log(`[sizing-rl] Judges: ${scores.judges.map((j: any) => `${j.model.split('/').pop()}:${j.score}`).join(', ')}`)
    
    const result = { iteration: iter, ...scores, moduleCount: modules.length }
    history.push(result)
    writeFileSync(join(outputDir, 'history.json'), JSON.stringify(history, null, 2))
    
    if (scores.overall >= 8) {
      console.log(`\n[sizing-rl] ✅ Target ${scores.overall}/10 reached at iteration ${iter}`)
      break
    }
    
    // Get improvement suggestions
    console.log('[sizing-rl] Getting suggestions...')
    const suggestions = await getSuggestions(scores, sizing, modules, originalBrief)
    writeFileSync(join(outputDir, `suggestions-iter-${iter}.json`), JSON.stringify(suggestions, null, 2))
    console.log(`[sizing-rl] ${suggestions.changes?.length || 0} suggestions received`)
  }
  
  const final = history[history.length - 1]
  const best = history.length ? history.reduce((a, b) => a.overall > b.overall ? a : b) : { overall: 0 }
  console.log(`\n[sizing-rl] === Summary ===`)
  console.log(`[sizing-rl] Final: ${final?.overall}/10, Best: ${best.overall}/10`)
  console.log(`[sizing-rl] Iterations: ${history.length}`)
}

const SIZING_TEMPLATE = `You are generating the Size & Layout section of an engineering report.

Given the product modules and research data, produce a detailed physical layout analysis.

For EACH module, provide:
1. name — module name (must match the decomposition)
2. dimensions — { w_mm, d_mm, h_mm } specific dimensions based on the components
3. mass_kg — estimated mass based on materials and components
4. floor_area_m2 — footprint in square meters
5. heat_dissipation_w — heat generated (if applicable)
6. mounting — how this module is mounted (floor, wall, rack, suspended)
7. adjacent_to — which modules it must be physically near (for cable/pipe runs)

ALSO provide:
- total_envelope — { w_mm, d_mm, h_mm } of the entire product
- total_mass_kg — sum of all module masses
- total_floor_area_m2 — sum of all footprints
- clearance_mm — minimum clearance between modules
- cable_routing — summary of how cables/pipes run between modules

RULES:
- Dimensions must be specific numbers, not ranges
- Mass must be calculated from material density × volume where possible
- Floor area must account for the actual footprint, not the bounding box
- Heat dissipation must be calculated from power consumption × (1 - efficiency)
- Modules that generate heat must be near ventilation or cooling modules
- Heavy modules must be at the bottom (floor-mounted)
- Cable/pipe runs must be minimized (adjacent modules should be near each other)

Return JSON:
{
  "moduleDimensions": [
    {
      "name": "...",
      "dimensions": { "w_mm": 100, "d_mm": 200, "h_mm": 300 },
      "mass_kg": 5.2,
      "floor_area_m2": 0.02,
      "heat_dissipation_w": 50,
      "mounting": "floor",
      "adjacent_to": ["module2", "module3"]
    }
  ],
  "total_envelope": { "w_mm": 1200, "d_mm": 2400, "h_mm": 2800 },
  "total_mass_kg": 850,
  "total_floor_area_m2": 2.88,
  "clearance_mm": 50,
  "cable_routing": "DC bus runs along left wall..."
}`

async function generateDecomposition(brief: string, research: any): Promise<any[]> {
  const response = await callLLM(
    'google/gemini-3.1-pro-preview',
    'You are decomposing a product into modules. Return JSON array of modules.',
    `BRIEF:\n${brief}\n\nRESEARCH:\n${summarizeResearch(research)}`,
    16384,
    0.3
  )
  const parsed = extractJSON(response)
  return Array.isArray(parsed) ? parsed : parsed?.modules || []
}

async function generateSizing(brief: string, modules: any[], research: any): Promise<any> {
  const modulesSummary = modules.map((m: any) => 
    `${m.name}: ${m.description?.slice(0, 100)} | keyParts: ${m.keyParts?.join(', ')}`
  ).join('\n')
  
  const response = await callLLM(
    'google/gemini-3.1-pro-preview',
    SIZING_TEMPLATE,
    `BRIEF:\n${brief}\n\nMODULES:\n${modulesSummary}\n\nRESEARCH:\n${summarizeResearch(research)}`,
    16384,
    0.3
  )
  
  const parsed = extractJSON(response)
  return parsed || { moduleDimensions: [], total_envelope: {}, total_mass_kg: 0 }
}

async function scoreSizing(sizing: any, brief: string, modules: any[]): Promise<any> {
  const rubric = `Score this Size & Layout section 1-10:

1. Dimension Specificity — Does EVERY module have specific w/d/h in mm? Not ranges? (2 pts)
2. Mass Calculation — Is mass calculated from material density × volume? Not guessed? (2 pts)
3. Layout Logic — Are heavy modules floor-mounted? Heat-generating modules near cooling? (2 pts)
4. Cable/Pipe Routing — Is there a clear routing plan between modules? (2 pts)
5. Envelope — Is the total envelope realistic? Does it fit within stated constraints? (2 pts)

SCORING GUIDE:
- 8-10: Every module has specific dimensions calculated from components. Mass from density×volume. Layout logic clear. Cable routing specified.
- 6-7: Most modules have specific dimensions. Some mass calculations. Basic layout logic.
- 4-5: Half the modules have dimensions. Masses are guessed. No layout logic.
- 1-3: Most modules missing dimensions. Masses are guesses. No layout.

Return ONLY JSON: {"score": N, "criteria": [{"name":"...","score":N,"reason":"..."}], "reasons":["..."], "missing":["..."]}`

  const judges = ['x-ai/grok-4.3', 'xiaomi/mimo-v2.5-pro', 'z-ai/glm-5.1']
  const votes: any[] = []
  
  for (const model of judges) {
    try {
      const sizingText = JSON.stringify(sizing, null, 2).slice(0, 6000)
      const raw = await callLLM(model, 'Return ONLY valid JSON.', `${rubric}\n\nSIZING:\n${sizingText}\n\nBRIEF:\n${brief.slice(0, 1000)}`, 2048)
      if (!raw) continue
      const parsed = extractJSON(raw)
      if (parsed) {
        parsed.score = Math.max(1, Math.min(10, Math.round(parsed.score || 0)))
        votes.push({ model, ...parsed })
      }
    } catch (e: any) {
      console.warn(`[sizing-rl] Judge ${model}: ${e.message}`)
    }
  }
  
  if (votes.length === 0) return { overall: 0, judges: [], reasons: ['All judges failed'], missing: [] }
  
  const overall = Math.round(votes.reduce((s, v) => s + (v.score || 0), 0) / votes.length)
  return {
    overall,
    judges: votes.map(v => ({ model: v.model, score: v.score })),
    reasons: [...new Set(votes.flatMap(v => v.reasons || []))],
    missing: [...new Set(votes.flatMap(v => v.missing || []))],
    criteria: votes[0]?.criteria || [],
  }
}

async function getSuggestions(scores: any, sizing: any, modules: any[], brief: string): Promise<any> {
  const prompt = `You are improving a Size & Layout section.

CURRENT SCORE: ${scores.overall}/10
ISSUES: ${scores.reasons.join('; ')}

Current sizing: ${JSON.stringify(sizing, null, 2).slice(0, 2000)}

Suggest 1-3 specific changes to improve toward 8/10.

Return JSON: {"changes": [{"what": "description", "reasoning": "why this helps"}]}`

  const raw = await callLLM('google/gemini-3.1-pro-preview', 'Return ONLY valid JSON.', prompt, 4096)
  if (!raw) return { changes: [] }
  return extractJSON(raw) || { changes: [] }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timer)
  }
}

async function callLLM(model: string, system: string, user: string, maxTokens: number = 16384, temperature: number = 0.3): Promise<string> {
  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  }, 180000)
  
  if (!response.ok) throw new Error(`API ${response.status}`)
  const json = await response.json()
  return json.choices?.[0]?.message?.content || ''
}

function extractJSON(text: string): any {
  let s = text.replace(/^\s*```json\s*/m, '').replace(/```\s*$/m, '').trim()
  
  const firstObj = s.indexOf('{')
  const firstArr = s.indexOf('[')
  let start = -1
  if (firstObj >= 0 && firstArr >= 0) start = Math.min(firstObj, firstArr)
  else if (firstObj >= 0) start = firstObj
  else if (firstArr >= 0) start = firstArr

  if (start >= 0) {
    const isArray = s[start] === '['
    const openChar = isArray ? '[' : '{'
    const closeChar = isArray ? ']' : '}'
    
    let count = 0
    let end = -1
    let inString = false
    let escape = false
    
    for (let i = start; i < s.length; i++) {
      const char = s[i]
      if (escape) { escape = false; continue }
      if (char === '\\') { escape = true; continue }
      if (char === '"') { inString = !inString; continue }
      if (!inString) {
        if (char === openChar) count++
        else if (char === closeChar) {
          count--
          if (count === 0) {
            end = i
            break
          }
        }
      }
    }
    
    if (end > start) s = s.slice(start, end + 1)
  }
  
  try { return JSON.parse(s) } catch { return null }
}

function summarizeResearch(research: any): string {
  if (!research) return 'No research data.'
  const parts: string[] = []
  const b = research.designBrief
  if (b) {
    parts.push(`Mission: ${b.mission || b.useCase || 'unknown'}`)
    if (b.constraints) {
      parts.push(`Cost: £${b.constraints.unitCostCeilingGbp || '?'}`)
      parts.push(`Mass: ${b.constraints.maxMassKg || '?'} kg`)
      parts.push(`Envelope: ${b.constraints.envelope || '?'}`)
    }
  }
  if (research.standardCodes?.length) parts.push(`Standards: ${research.standardCodes.join(', ')}`)
  return parts.join('\n') || 'Minimal research.'
}

main().catch(err => {
  console.error('[sizing-rl] Fatal:', err.message)
  process.exit(1)
})
