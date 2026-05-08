/**
 * feasibility-full-rl.ts — Full-flow RL loop: raw text → Research → Brief → Feasibility → revision → Feasibility
 * 
 * This tests the COMPLETE pipeline up to the Feasibility gate, including
 * the Feasibility → Brief feedback loop. Each iteration:
 * 1. Runs Research (once, cached)
 * 2. Generates Brief
 * 3. Runs Feasibility
 * 4. If infeasible: revises Brief, re-runs Feasibility
 * 5. Scores the final Feasibility output
 * 6. If < 8/10: gets suggestions, applies them, repeats
 * 
 * Usage: npx tsx src/lib/pdf-engine-v2/feasibility-full-rl.ts --brief "text" --output /path --max-iter 5
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const FEASIBILITY_TEMPLATE = `You are writing the Feasibility Gate section of an engineering report.

CRITICAL: Every constraint MUST have ALL of these fields filled in. No vague language. No "should be feasible". Specific numbers only.

# Feasibility Gate Assessment

## 1. Constraint Verification

For EACH constraint, fill in EVERY cell of this table. If you don't know a number, estimate it with a cited source.

| # | Constraint | Target | Physics Calculation | Comparable Product 1 | Comparable Product 2 | Achievable? | Risk Level |
|---|---|---|---|---|---|---|---|
| 1 | [name] | [target value] | [formula + specific numbers] | [product name, specs, price] | [product name, specs, price] | YES/NO/MARGINAL | LOW/MEDIUM/HIGH |

EXAMPLE ROW (copy this level of specificity):
| 1 | Mass in air | ≤ 90 kg | Cylinder volume = π × (0.115m)² × 2.1m = 0.0872 m³. Neutral buoyancy at 1,025 kg/m³ = 89.4 kg. Battery 12kWh @ 200Wh/kg = 60kg. Ti hull 4mm @ 27kg. Payload 10kg. Total = 97kg. EXCEEDS 89.4kg by 7.6kg. | Teledyne Gavia: 1.2m, 75kg, 8hr, £250k | L3Harris Iver3: 1.5m, 52kg, 14hr, £180k | NO | HIGH |

ANOTHER EXAMPLE:
| 2 | Energy efficiency | ≤ 2.5 kWh/kg | LED lighting: 200 µmol/m²/s × 12m² = 2400 µmol/s. At 3.0 µmol/J efficacy = 800W. 16h/day = 12.8 kWh/day. For 15kg crop = 6.0 kWh/kg (lighting alone). HVAC adds 2-3 kWh/kg. Total = 8-9 kWh/kg. | Freight Farms: 8.5 kWh/kg | IGS: 7.2 kWh/kg | NO | HIGH |

## 2. Technical Feasibility
- State the specific physics law that limits this design
- Name the technology and its current best-in-class performance
- Compare to 2+ named products with their actual specs

## 3. Cost Feasibility
- Name 2-3 comparable products with retail prices
- Calculate: BOM target = retail × (1 - margin%)
- State whether target is above/below comparable range

## 4. Regulatory Feasibility
- Name specific certification body (e.g., "BSI", "TÜV SÜD", "DNV")
- Cite standard with version (e.g., "IEC 62619:2022")
- State typical timeline in weeks

## 5. Manufacturing Feasibility
- Name specific process (e.g., "CNC machining Ti-6Al-4V", "injection moulding PA12-GF30")
- State if volume is achievable with that process
- Name any supply chain bottleneck

## 6. Verdict
GREEN / AMBER / RED — justified by the WORST risk level from the table above.

## 7. Recommended Modifications (REQUIRED when any constraint is HIGH risk)
For each HIGH-risk constraint:
- State the specific physics reason it's impossible
- Propose a numeric alternative (e.g., "Increase from 2.5 to 12 kWh/kg")
- State the design impact

RULES:
- EVERY row in the constraint table MUST have a Physics Calculation
- EVERY row MUST have 2 comparable products (name + specs + price)
- If you don't know a comparable, say "No comparable found — requires research" (don't make one up)
- No vague language anywhere. Numbers only.`


async function main() {
  const args = process.argv.slice(2)
  const briefIdx = args.indexOf('--brief')
  const outputIdx = args.indexOf('--output')
  const maxIterIdx = args.indexOf('--max-iter')
  
  if (briefIdx === -1 || outputIdx === -1) {
    console.error('Usage: npx tsx feasibility-full-rl.ts --brief "text" --output /path [--max-iter 5]')
    process.exit(1)
  }
  
  const originalBrief = args[briefIdx + 1]
  const outputDir = args[outputIdx + 1]
  const maxIter = maxIterIdx >= 0 ? parseInt(args[maxIterIdx + 1]) : 5
  mkdirSync(outputDir, { recursive: true })
  
  console.log(`[full-rl] Starting (max ${maxIter} iterations)...`)
  console.log(`[full-rl] Brief: ${originalBrief.length} chars`)
  
  // Step 1: Research ONCE
  console.log('[full-rl] Research (one-time)...')
  const { runResearch } = await import(join(__dirname, 'stages/1-research'))
  const researchResult = await runResearch(originalBrief, '')
  const research = researchResult.ok ? researchResult.data : null
  console.log(`[full-rl] Research: ${research?.report?.length || 0} chars`)
  writeFileSync(join(outputDir, 'research.json'), JSON.stringify(research, null, 2))
  
  // Step 2: Iterative loop
  const history: any[] = []
  let currentBriefText = ''
  let currentConstraints: any = {}
  
  for (let iter = 1; iter <= maxIter; iter++) {
    console.log(`\n[full-rl] === Iteration ${iter}/${maxIter} ===`)
    
    // Generate Brief
    console.log('[full-rl] Generating Brief...')
    const { runBriefGeneration } = await import(join(__dirname, 'stages/0-brief-generation'))
    const briefGenResult = await runBriefGeneration(originalBrief, 'unknown')
    const generatedBrief = briefGenResult.ok ? briefGenResult.data : null
    currentBriefText = generatedBrief?.briefText || originalBrief
    currentConstraints = extractConstraints(originalBrief, research, generatedBrief)
    console.log(`[full-rl] Brief: ${currentBriefText.length} chars, ${generatedBrief?.fields?.objectives?.length || 0} objectives`)
    writeFileSync(join(outputDir, `brief-iter-${iter}.txt`), currentBriefText)
    
    // Run Feasibility
    console.log('[full-rl] Running Feasibility...')
    const feasText = await generateFeasibility(originalBrief, currentConstraints, research)
    writeFileSync(join(outputDir, `feas-iter-${iter}-v1.txt`), feasText)
    console.log(`[full-rl] Feasibility v1: ${feasText.length} chars`)
    
    // Check if Feasibility found HIGH-risk constraints
    const hasHighRisk = feasText.includes('HIGH') || feasText.includes('NO') || feasText.includes('RED')
    
    // Feedback loop: if infeasible, revise Brief and re-run Feasibility
    let finalFeasText = feasText
    let revisionCount = 0
    const MAX_REVISIONS = 2
    
    while (hasHighRisk && revisionCount < MAX_REVISIONS) {
      revisionCount++
      console.log(`[full-rl] Revision ${revisionCount}: Brief is infeasible, revising...`)
      
      // Run Brief Revision
      const { runBriefRevision } = await import(join(__dirname, 'stages/3.5-brief-revision'))
      const revisionResult = await runBriefRevision(originalBrief, currentBriefText, feasText, 'unknown')
      
      if (revisionResult.ok && revisionResult.data?.hasRevisions) {
        const rev = revisionResult.data
        console.log(`[full-rl] Revised: ${rev.changes.length} constraints updated`)
        
        // Update constraint values
        for (const change of rev.changes) {
          const field = change.constraint.toLowerCase()
          if (field.includes('cost') || field.includes('price')) {
            const match = change.revised.match(/[\d,]+/)
            if (match) currentConstraints.costCeiling = parseInt(match[0].replace(/,/g, ''))
          } else if (field.includes('mass') || field.includes('weight')) {
            const match = change.revised.match(/[\d,.]+/)
            if (match) currentConstraints.maxMass = parseFloat(match[0].replace(/,/g, ''))
          }
          console.log(`[full-rl]   ${change.constraint}: ${change.original} → ${change.revised}`)
        }
        
        // Re-run Feasibility with revised constraints
        console.log('[full-rl] Re-running Feasibility...')
        finalFeasText = await generateFeasibility(originalBrief, currentConstraints, research)
        writeFileSync(join(outputDir, `feas-iter-${iter}-v${revisionCount + 1}.txt`), finalFeasText)
        console.log(`[full-rl] Feasibility v${revisionCount + 1}: ${finalFeasText.length} chars`)
      } else {
        console.log('[full-rl] No revisions proposed — breaking')
        break
      }
    }
    
    // Score the final Feasibility
    console.log('[full-rl] Scoring...')
    const scores = await scoreFeasibility(finalFeasText)
    console.log(`[full-rl] Score: ${scores.overall}/10`)
    console.log(`[full-rl] Judges: ${scores.judges.map((j: any) => `${j.model.split('/').pop()}:${j.score}`).join(', ')}`)
    
    const result = { 
      iteration: iter, 
      ...scores, 
      revisionCount,
      feasLength: finalFeasText.length,
    }
    history.push(result)
    writeFileSync(join(outputDir, 'history.json'), JSON.stringify(history, null, 2))
    
    if (scores.overall >= 8) {
      console.log(`\n[full-rl] ✅ Target ${scores.overall}/10 reached at iteration ${iter}`)
      break
    }
    
    // Get improvement suggestions for next iteration
    console.log('[full-rl] Getting suggestions...')
    const suggestions = await getSuggestions(scores, finalFeasText, currentConstraints)
    writeFileSync(join(outputDir, `suggestions-iter-${iter}.json`), JSON.stringify(suggestions, null, 2))
    console.log(`[full-rl] ${suggestions.changes?.length || 0} suggestions received`)
  }
  
  const final = history[history.length - 1]
  const best = history.reduce((a, b) => a.overall > b.overall ? a : b)
  console.log(`\n[full-rl] === Summary ===`)
  console.log(`[full-rl] Final: ${final?.overall}/10, Best: ${best.overall}/10`)
  console.log(`[full-rl] Iterations: ${history.length}`)
}

function extractConstraints(brief: string, research: any, generatedBrief: any): any {
  const b = research?.designBrief || {}
  return {
    costCeiling: b.constraints?.unitCostCeilingGbp || generatedBrief?.fields?.costCeiling || null,
    maxMass: b.constraints?.maxMassKg || generatedBrief?.fields?.maxMass || null,
    productionVolume: b.quantityTarget || generatedBrief?.fields?.productionVolume || null,
    jurisdiction: (b.constraints as any)?.jurisdiction || generatedBrief?.fields?.jurisdiction || null,
    envelope: (b.constraints as any)?.envelope || generatedBrief?.fields?.envelope || null,
    operatingTemp: (b.constraints as any)?.operatingTemperature || generatedBrief?.fields?.operatingTemp || null,
    standards: research?.standardCodes || generatedBrief?.fields?.standards || [],
    brief: brief.slice(0, 2000),
  }
}

async function generateFeasibility(brief: string, constraints: any, research: any): Promise<string> {
  const constraintsSummary = [
    constraints.costCeiling ? `Cost ceiling: £${constraints.costCeiling}` : '',
    constraints.maxMass ? `Max mass: ${constraints.maxMass} kg` : '',
    constraints.productionVolume ? `Volume: ${constraints.productionVolume}` : '',
    constraints.jurisdiction ? `Jurisdiction: ${constraints.jurisdiction}` : '',
    constraints.envelope ? `Envelope: ${constraints.envelope}` : '',
    constraints.operatingTemp ? `Temperature: ${constraints.operatingTemp}` : '',
    constraints.standards?.length ? `Standards: ${constraints.standards.join(', ')}` : '',
  ].filter(Boolean).join('\n')
  
  const response = await callLLM(
    'google/gemini-3.1-pro-preview',
    FEASIBILITY_TEMPLATE,
    `FOUNDER BRIEF:\n${brief}\n\nCONSTRAINTS:\n${constraintsSummary}\n\nRESEARCH DATA:\n${summarizeResearch(research)}`,
    4096,
    0.3
  )
  return response || ''
}

async function scoreFeasibility(feasText: string): Promise<any> {
  const rubric = `Score this Feasibility Gate section 1-10:

1. Constraint Table — Does EVERY row have: Physics Calculation (formula + numbers), 2 Comparable Products (name + specs + price), Achievable? (YES/NO/MARGINAL), Risk Level? (2 pts)
2. Technical Feasibility — Is a specific physics law cited? Is current best-in-class performance stated? (2 pts)
3. Cost Feasibility — Are 2-3 comparable products named with prices? Is BOM-to-retail ratio calculated? (2 pts)
4. Regulatory Feasibility — Is a specific certification body named? Standard with version? Timeline in weeks? (2 pts)
5. Verdict — Is GREEN/AMBER/RED justified by the worst risk level in the table? (2 pts)
6. Recommended Modifications — Are impossible constraints given numeric alternatives with design impact? (bonus)

SCORING GUIDE:
- 8-10: EVERY row has physics calculation + 2 comparables. Numbers throughout. Named cert bodies. Specific timelines.
- 6-7: Most rows have calculations but some are vague. 1+ comparables missing.
- 4-5: Half the rows are vague. Few comparables. Generic statements.
- 1-3: Most rows are vague or empty. No comparables. No physics.

Return ONLY JSON: {"score": N, "criteria": [{"name":"...","score":N,"reason":"..."}], "reasons":["..."], "missing":["..."]}`

  const judges = ['x-ai/grok-4.3', 'xiaomi/mimo-v2.5-pro', 'z-ai/glm-5.1']
  const votes: any[] = []
  
  for (const model of judges) {
    try {
      const raw = await callLLM(model, 'Return ONLY valid JSON.', `${rubric}\n\nFEASIBILITY:\n${feasText.slice(0, 6000)}`, 2048)
      if (!raw) continue
      const parsed = extractJSON(raw)
      if (parsed) {
        parsed.score = Math.max(1, Math.min(10, Math.round(parsed.score || 0)))
        votes.push({ model, ...parsed })
      }
    } catch (e: any) {
      console.warn(`[full-rl] Judge ${model}: ${e.message}`)
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

async function getSuggestions(scores: any, feasText: string, constraints: any): Promise<any> {
  const prompt = `You are improving a Feasibility Gate section.

CURRENT SCORE: ${scores.overall}/10
ISSUES: ${scores.reasons.join('; ')}
MISSING: ${scores.missing.join('; ')}

CONSTRAINTS:
${JSON.stringify(constraints, null, 2)}

Current output:
${feasText.slice(0, 2000)}

Suggest 1-3 specific changes to improve the score toward 8/10.

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
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) s = s.slice(first, last + 1)
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
  console.error('[full-rl] Fatal:', err.message)
  process.exit(1)
})
