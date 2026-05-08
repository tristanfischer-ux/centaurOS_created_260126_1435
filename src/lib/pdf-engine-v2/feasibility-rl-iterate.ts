/**
 * feasibility-rl-iterate.ts — Fast RL loop for Feasibility section quality.
 * 
 * Architecture: Same as brief-rl-iterate but for Feasibility.
 * 1. Run research + brief generation ONCE per project (reusable)
 * 2. Generate Feasibility assessment from designBrief + constraints
 * 3. Score with council
 * 4. Iterate until 8/10
 * 
 * Usage: npx tsx src/lib/pdf-engine-v2/feasibility-rl-iterate.ts --brief "text" --output /path --max-iter 5
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const FEASIBILITY_TEMPLATE = `You are writing the Feasibility Gate section of an engineering report.
You MUST follow this exact structure:

# Feasibility Gate Assessment

## 1. Constraint Verification

For EACH constraint from the brief, evaluate whether it is physically achievable. Use this table format:

| Constraint | Target | Achievable? | Reasoning | Risk Level |
|---|---|---|---|---|
| [constraint name] | [target value] | YES/NO/MARGINAL | [specific physics/engineering reasoning] | LOW/MEDIUM/HIGH |

## 2. Technical Feasibility

Assess the core engineering challenge:
- Is the stated performance achievable with current technology?
- Are there physics limits that make this impossible?
- What are the top 3 technical risks?

## 3. Cost Feasibility

- Is the target cost ceiling realistic for this product class?
- Compare to comparable products (if known)
- What percentage of comparable products does this represent?

## 4. Regulatory Feasibility

- Are the required certifications achievable?
- What is the estimated certification timeline?
- Are there any regulatory blockers?

## 5. Manufacturing Feasibility

- Can this be manufactured at the stated volume?
- What manufacturing processes are required?
- Are there supply chain risks?

## 6. Verdict

**GREEN** / **AMBER** / **RED** with a 1-sentence justification.

## 7. Recommended Modifications (when constraints are impossible)

If any constraint is assessed as NO or HIGH risk, provide:
- What would need to change to make it feasible
- Specific numeric alternative (e.g., "Increase energy budget from 2.5 kWh/kg to 8 kWh/kg" or "Reduce depth rating from 100m to 50m")
- Impact of the modification on the overall design

This section is REQUIRED when any constraint has Risk Level = HIGH.

RULES:
- Every assessment must cite specific numbers or physics
- No vague language ("should be feasible", "likely achievable")
- If a constraint is NOT achievable, say so explicitly AND propose a specific alternative
- If data is insufficient, state what additional information is needed
- The verdict must match the worst risk level found
- When Risk Level is HIGH, Section 7 (Recommended Modifications) is REQUIRED
- Cite comparable products by name and price when assessing cost feasibility
- For regulatory feasibility, cite specific certification bodies and typical timelines`

async function main() {
  const args = process.argv.slice(2)
  const briefIdx = args.indexOf('--brief')
  const outputIdx = args.indexOf('--output')
  const maxIterIdx = args.indexOf('--max-iter')
  
  if (briefIdx === -1 || outputIdx === -1) {
    console.error('Usage: npx tsx feasibility-rl-iterate.ts --brief "text" --output /path [--max-iter 5]')
    process.exit(1)
  }
  
  const originalBrief = args[briefIdx + 1]
  const outputDir = args[outputIdx + 1]
  const maxIter = maxIterIdx >= 0 ? parseInt(args[maxIterIdx + 1]) : 5
  mkdirSync(outputDir, { recursive: true })
  
  console.log(`[feas-rl] Starting (max ${maxIter} iterations)...`)
  
  // Step 1: Research ONCE
  console.log('[feas-rl] Research (one-time)...')
  const { runResearch } = await import(join(__dirname, 'stages/1-research'))
  const researchResult = await runResearch(originalBrief, '')
  const research = researchResult.ok ? researchResult.data : null
  console.log(`[feas-rl] Research: ${research?.report?.length || 0} chars`)
  writeFileSync(join(outputDir, 'research.json'), JSON.stringify(research, null, 2))
  
  // Step 2: Brief Generation ONCE
  console.log('[feas-rl] Brief generation (one-time)...')
  const { runBriefGeneration } = await import(join(__dirname, 'stages/0-brief-generation'))
  const briefGenResult = await runBriefGeneration(originalBrief, 'unknown')
  const generatedBrief = briefGenResult.ok ? briefGenResult.data : null
  console.log(`[feas-rl] Brief: ${generatedBrief?.briefText?.length || 0} chars`)
  
  // Extract constraints for feasibility
  const constraints = extractConstraints(originalBrief, research, generatedBrief)
  writeFileSync(join(outputDir, 'constraints.json'), JSON.stringify(constraints, null, 2))
  
  // Step 3: Iterative feasibility improvement
  const history: any[] = []
  
  for (let iter = 1; iter <= maxIter; iter++) {
    console.log(`\n[feas-rl] === Iteration ${iter}/${maxIter} ===`)
    
    // Generate feasibility assessment
    console.log('[feas-rl] Generating...')
    const feasText = await generateFeasibility(originalBrief, constraints, research)
    writeFileSync(join(outputDir, `feas-iter-${iter}.txt`), feasText)
    console.log(`[feas-rl] Generated: ${feasText.length} chars`)
    
    // Score with council
    console.log('[feas-rl] Scoring...')
    const scores = await scoreFeasibility(feasText)
    console.log(`[feas-rl] Score: ${scores.overall}/10`)
    console.log(`[feas-rl] Judges: ${scores.judges.map((j: any) => `${j.model.split('/').pop()}:${j.score}`).join(', ')}`)
    
    const result = { iteration: iter, ...scores, feasLength: feasText.length }
    history.push(result)
    writeFileSync(join(outputDir, 'history.json'), JSON.stringify(history, null, 2))
    
    if (scores.overall >= 8) {
      console.log(`\n[feas-rl] ✅ Target ${scores.overall}/10 reached at iteration ${iter}`)
      break
    }
    
    // Get improvement suggestions
    console.log('[feas-rl] Getting suggestions...')
    const suggestions = await getSuggestions(scores, feasText, constraints)
    writeFileSync(join(outputDir, `suggestions-iter-${iter}.json`), JSON.stringify(suggestions, null, 2))
    console.log(`[feas-rl] ${suggestions.changes?.length || 0} suggestions received`)
  }
  
  const final = history[history.length - 1]
  const best = history.reduce((a, b) => a.overall > b.overall ? a : b)
  console.log(`\n[feas-rl] === Summary ===`)
  console.log(`[feas-rl] Final: ${final?.overall}/10, Best: ${best.overall}/10`)
  console.log(`[feas-rl] Iterations: ${history.length}`)
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
  const rubric = `Score this Feasibility Gate section 1-10 on each criterion:

1. Constraint Verification — Is each constraint individually assessed with specific physics/engineering reasoning? (2 pts)
2. Technical Feasibility — Are physics limits cited? Are top risks identified? (2 pts)
3. Cost Feasibility — Is the cost ceiling compared to real comparable products? (2 pts)
4. Regulatory Feasibility — Are certifications and timelines specific? (2 pts)
5. Verdict — Is the GREEN/AMBER/RED verdict justified by the analysis above? (2 pts)
6. Recommended Modifications — When constraints are impossible, are specific alternatives proposed with numeric targets? (bonus: can push score above 8)

8-10 = all constraints assessed, specific physics cited, verdict justified, alternatives proposed for impossible constraints. 6-7 = mostly present but missing alternatives. 4-5 = gaps. 1-3 = missing most.

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
      console.warn(`[feas-rl] Judge ${model}: ${e.message}`)
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
  const prompt = `You are improving a Feasibility Gate section of an engineering report.

CURRENT SCORE: ${scores.overall}/10
ISSUES: ${scores.reasons.join('; ')}
MISSING: ${scores.missing.join('; ')}

CONSTRAINTS:
${JSON.stringify(constraints, null, 2)}

Current output:
${feasText.slice(0, 2000)}

Suggest 1-3 specific changes to improve the score toward 8/10. Focus on:
- Adding specific physics/engineering reasoning
- Citing comparable products for cost feasibility
- Adding specific numbers for regulatory timelines
- Making the verdict more justified

Return JSON: {"changes": [{"what": "description", "reasoning": "why this helps"}]}`

  const raw = await callLLM('google/gemini-3.1-pro-preview', 'Return ONLY valid JSON.', prompt, 4096)
  if (!raw) return { changes: [] }
  return extractJSON(raw) || { changes: [] }
}

async function callLLM(model: string, system: string, user: string, maxTokens: number = 4096, temperature: number = 0.3): Promise<string> {
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
  console.error('[feas-rl] Fatal:', err.message)
  process.exit(1)
})
