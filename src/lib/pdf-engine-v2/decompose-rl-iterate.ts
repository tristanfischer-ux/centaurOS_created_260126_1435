/**
 * decompose-rl-iterate.ts — Fast RL loop for Module Decomposition quality.
 * 
 * Architecture: Research → Brief → Feasibility → Decomposition (iterate)
 * 
 * Uses projects with HIGH feasibility scores (9-10/10) so the decomposition
 * gets clean input, not garbage from failed feasibility.
 * 
 * Usage: npx tsx src/lib/pdf-engine-v2/decompose-rl-iterate.ts --brief "text" --output /path --max-iter 5
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  const args = process.argv.slice(2)
  const briefIdx = args.indexOf('--brief')
  const outputIdx = args.indexOf('--output')
  const maxIterIdx = args.indexOf('--max-iter')
  
  if (briefIdx === -1 || outputIdx === -1) {
    console.error('Usage: npx tsx decompose-rl-iterate.ts --brief "text" --output /path [--max-iter 5]')
    process.exit(1)
  }
  
  const originalBrief = args[briefIdx + 1]
  const outputDir = args[outputIdx + 1]
  const maxIter = maxIterIdx >= 0 ? parseInt(args[maxIterIdx + 1]) : 5
  mkdirSync(outputDir, { recursive: true })
  
  console.log(`[decomp-rl] Starting (max ${maxIter} iterations)...`)
  
  // Step 1: Research ONCE
  console.log('[decomp-rl] Research (one-time)...')
  const { runResearch } = await import(join(__dirname, 'stages/1-research'))
  const researchResult = await runResearch(originalBrief, '')
  const research = researchResult.ok ? researchResult.data : null
  console.log(`[decomp-rl] Research: ${research?.report?.length || 0} chars`)
  writeFileSync(join(outputDir, 'research.json'), JSON.stringify(research, null, 2))
  
  // Step 2: Brief Generation ONCE
  console.log('[decomp-rl] Brief generation (one-time)...')
  const { runBriefGeneration } = await import(join(__dirname, 'stages/0-brief-generation'))
  const briefGenResult = await runBriefGeneration(originalBrief, 'unknown')
  const generatedBrief = briefGenResult.ok ? briefGenResult.data : null
  console.log(`[decomp-rl] Brief: ${generatedBrief?.briefText?.length || 0} chars`)
  
  // Step 3: Iterative decomposition improvement
  const history: any[] = []
  
  for (let iter = 1; iter <= maxIter; iter++) {
    console.log(`\n[decomp-rl] === Iteration ${iter}/${maxIter} ===`)
    
    // Generate decomposition
    console.log('[decomp-rl] Generating decomposition...')
    const modules = await generateDecomposition(originalBrief, research, generatedBrief)
    writeFileSync(join(outputDir, `modules-iter-${iter}.json`), JSON.stringify(modules, null, 2))
    console.log(`[decomp-rl] Generated: ${modules.length} modules`)
    
    // Score with council
    console.log('[decomp-rl] Scoring...')
    const scores = await scoreDecomposition(modules, originalBrief, research)
    console.log(`[decomp-rl] Score: ${scores.overall}/10`)
    console.log(`[decomp-rl] Judges: ${scores.judges.map((j: any) => `${j.model.split('/').pop()}:${j.score}`).join(', ')}`)
    
    const result = { iteration: iter, ...scores, moduleCount: modules.length }
    history.push(result)
    writeFileSync(join(outputDir, 'history.json'), JSON.stringify(history, null, 2))
    
    if (scores.overall >= 8) {
      console.log(`\n[decomp-rl] ✅ Target ${scores.overall}/10 reached at iteration ${iter}`)
      break
    }
    
    // Get improvement suggestions
    console.log('[decomp-rl] Getting suggestions...')
    const suggestions = await getSuggestions(scores, modules, originalBrief)
    writeFileSync(join(outputDir, `suggestions-iter-${iter}.json`), JSON.stringify(suggestions, null, 2))
    console.log(`[decomp-rl] ${suggestions.changes?.length || 0} suggestions received`)
  }
  
  const final = history[history.length - 1]
  const best = history.reduce((a, b) => a.overall > b.overall ? a : b)
  console.log(`\n[decomp-rl] === Summary ===`)
  console.log(`[decomp-rl] Final: ${final?.overall}/10, Best: ${best.overall}/10`)
  console.log(`[decomp-rl] Iterations: ${history.length}`)
}

const DECOMPOSE_TEMPLATE = `You are decomposing an engineering product into subsystem modules.

CRITICAL: Every module MUST have ALL fields filled with SPECIFIC names. No generic descriptions. Real component names only.

For EACH module, provide:

1. name — specific subsystem name (e.g., "4S LiPo Battery Pack + BMS", NOT "Power System")
2. description — 2-3 sentences with specific technologies mentioned
3. purpose — why this module exists, with a specific performance requirement
4. keyParts — 5-8 REAL component names with manufacturer/model if possible
5. failureModes — 3+ specific failure modes with root causes
6. interfaces — how this module connects to EACH other module
7. criticality — HIGH/MEDIUM/LOW with safety justification

EXAMPLES of GOOD keyParts:
- "Samsung INR21700-50E cells (3.6V, 5000mAh)" 
- "TI BQ76952 BMS IC"
- "Amass XT90 connector"
- "Mean Well RSP-500-48 power supply"

BAD keyParts (will score low):
- "battery cells"
- "connectors"  
- "power supply"
- "sensors"

EXAMPLES of GOOD failureModes:
- {"mode": "Cell thermal runaway", "cause": "Internal short circuit from dendrite growth or separator defect", "effect": "Fire, toxic HF/CO venting, pressure spike in enclosure", "severity": "HIGH"}
- {"mode": "ESC MOSFET failure", "cause": "Gate oxide breakdown from voltage spike during regenerative braking", "effect": "Motor lockup, potential crash, loss of flight control", "severity": "HIGH"}

BAD failureModes (will score low):
- {"mode": "Battery failure", "cause": "Overcharging", "effect": "System failure", "severity": "HIGH"}

EXAMPLES of GOOD interfaces:
- {"target": "Flight Controller", "type": "data", "description": "UART serial at 115200 baud via JST-GH 4-pin connector for telemetry and motor commands"}
- {"target": "Battery Pack", "type": "electrical", "description": "XT90 connector, 14.8V nominal, 50A continuous, 100A burst"}

RULES:
- Every module must have 5+ keyParts with specific component names
- Every module must have 3+ failureModes with specific physical causes
- Interfaces must name the connector type and signal/voltage/spec
- The modules must collectively cover the ENTIRE product — no gaps
- Group by functional subsystem, not physical location
- Each module should represent a coherent engineering work package

Return JSON array:
[
  {
    "name": "...",
    "description": "...",
    "purpose": "...",
    "keyParts": ["specific part 1", "specific part 2", ...],
    "failureModes": [
      {"mode": "...", "cause": "specific physical cause", "effect": "specific consequence", "severity": "HIGH/MEDIUM/LOW"}
    ],
    "interfaces": [
      {"target": "other module name", "type": "electrical/mechanical/fluid/data", "description": "specific connector/signal/voltage"}
    ],
    "criticality": "HIGH/MEDIUM/LOW"
  }
]`

async function generateDecomposition(brief: string, research: any, generatedBrief: any): Promise<any[]> {
  const constraintsSummary = [
    generatedBrief?.fields?.costCeiling ? `Cost ceiling: £${generatedBrief.fields.costCeiling}` : '',
    generatedBrief?.fields?.maxMass ? `Max mass: ${generatedBrief.fields.maxMass} kg` : '',
    generatedBrief?.fields?.productionVolume ? `Volume: ${generatedBrief.fields.productionVolume}` : '',
    research?.standardCodes?.length ? `Standards: ${research.standardCodes.join(', ')}` : '',
  ].filter(Boolean).join('\n')
  
  const response = await callLLM(
    'google/gemini-3.1-pro-preview',
    DECOMPOSE_TEMPLATE,
    `FOUNDER BRIEF:\n${brief}\n\nCONSTRAINTS:\n${constraintsSummary}\n\nRESEARCH:\n${summarizeResearch(research)}`,
    16384,
    0.3
  )
  
  if (!response) {
    console.warn('[decomp-rl] Empty LLM response')
    return []
  }
  
  const parsed = extractJSON(response)
  if (Array.isArray(parsed)) return parsed
  if (parsed?.modules && Array.isArray(parsed.modules)) return parsed.modules
  if (parsed?.decomposition && Array.isArray(parsed.decomposition)) return parsed.decomposition
  
  // Try to extract array directly from the response
  const arrayMatch = response.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      const arr = JSON.parse(arrayMatch[0])
      if (Array.isArray(arr) && arr.length > 0) return arr
    } catch (e) {
      console.warn('[decomp-rl] Array extraction failed:', (e as Error).message?.slice(0, 100))
    }
  }
  
  console.warn('[decomp-rl] Could not parse modules from response. First 300 chars:', response.slice(0, 300))
  return []
}

async function scoreDecomposition(modules: any[], brief: string, research: any): Promise<any> {
  const rubric = `Score this Module Decomposition 1-10:

1. Completeness — Do modules cover the ENTIRE product? No gaps? (2 pts)
2. Abstraction Level — Are modules at similar levels? Not "battery" vs "entire electrical system"? (2 pts)
3. Specificity — Does each module have 5+ SPECIFIC component names in keyParts (manufacturer/model)? 3+ failureModes with physical causes? (2 pts)
4. Interfaces — Are connections specified with connector type, signal, voltage, spec? (2 pts)
5. Criticality — Is safety impact assessed with justification? (2 pts)

SCORING GUIDE:
- 8-10: Every module has 5+ real component names, 3+ failure modes with physics, named connectors, complete coverage
- 6-7: Most modules have specific parts but some are generic. 2-3 failure modes. Interfaces exist but lack connector specs
- 4-5: Half the modules have generic parts. 1-2 failure modes. Vague interfaces
- 1-3: Most modules have generic descriptions. Missing failure modes. No interfaces

Return ONLY JSON: {"score": N, "criteria": [{"name":"...","score":N,"reason":"..."}], "reasons":["..."], "missing":["..."]}`

  const judges = ['x-ai/grok-4.3', 'xiaomi/mimo-v2.5-pro', 'z-ai/glm-5.1']
  const votes: any[] = []
  
  for (const model of judges) {
    try {
      const modulesText = JSON.stringify(modules, null, 2).slice(0, 6000)
      const raw = await callLLM(model, 'Return ONLY valid JSON.', `${rubric}\n\nMODULES:\n${modulesText}\n\nBRIEF:\n${brief.slice(0, 1000)}`, 2048)
      if (!raw) continue
      const parsed = extractJSON(raw)
      if (parsed) {
        parsed.score = Math.max(1, Math.min(10, Math.round(parsed.score || 0)))
        votes.push({ model, ...parsed })
      }
    } catch (e: any) {
      console.warn(`[decomp-rl] Judge ${model}: ${e.message}`)
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

async function getSuggestions(scores: any, modules: any[], brief: string): Promise<any> {
  const prompt = `You are improving a Module Decomposition for an engineering product.

CURRENT SCORE: ${scores.overall}/10
ISSUES: ${scores.reasons.join('; ')}
MISSING: ${scores.missing.join('; ')}

Current modules (${modules.length}):
${modules.map((m: any, i: number) => `${i+1}. ${m.name}: ${m.description?.slice(0, 100)}`).join('\n')}

BRIEF: ${brief.slice(0, 500)}

Suggest 1-3 specific changes to improve the decomposition toward 8/10.
Focus on: missing modules, vague keyParts, missing failureModes, missing interfaces.

Return JSON: {"changes": [{"what": "description", "reasoning": "why this helps"}]}`

  const raw = await callLLM('google/gemini-3.1-pro-preview', 'Return ONLY valid JSON.', prompt, 4096)
  if (!raw) return { changes: [] }
  return extractJSON(raw) || { changes: [] }
}

async function callLLM(model: string, system: string, user: string, maxTokens: number = 16384, temperature: number = 0.3): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
    signal: AbortSignal.timeout(180000),
  })
  
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
    }
  }
  if (research.standardCodes?.length) parts.push(`Standards: ${research.standardCodes.join(', ')}`)
  if (research.sources?.length) parts.push(`Sources: ${research.sources.map((s: any) => s.title).join(', ')}`)
  return parts.join('\n') || 'Minimal research.'
}

main().catch(err => {
  console.error('[decomp-rl] Fatal:', err.message)
  process.exit(1)
})
