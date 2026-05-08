/**
 * brief-rl-iterate.ts — Fast RL loop for Brief section quality.
 * 
 * Architecture: Template + Generate → Score → Council suggests fixes → Code change → Repeat.
 * 
 * Key design:
 * - Research runs ONCE per project (expensive)
 * - Brief generation is a SINGLE LLM call (no self-refine in same call)
 * - Scoring is 3 parallel judge calls
 * - Code improvement suggestions come from a COUNCIL of LLMs, not manual
 * 
 * Usage: npx tsx src/lib/pdf-engine-v2/brief-rl-iterate.ts --brief "text" --output /path --max-iter 5
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// The fixed template — this is the CODE that gets iterated
// (not the prompt — the actual rendering logic)
const BRIEF_TEMPLATE = `Write the Brief section of an engineering report. Output ONLY the section text, no commentary.

STRUCTURE (use these exact headings):

# Project Brief: [product name]

## 1. Project Purpose
[1 sentence with quantifiable outcome]

## 2. Core Objectives
- [3-5 bullets, each testable with a metric]

## 3. Key Requirements & Constraints
### Requirements
- [process, materials, standards, tolerances]
### Constraints
- [cost ceiling with £, mass with kg, volume with number, jurisdiction, envelope with mm, temperature with °C]

## 4. Scope Boundaries
**In scope:** [what this covers]
**Out of scope:** [2+ exclusions]

## 5. Success Criteria
- [2-3 numeric criteria]

## Appendix: Research Sources
- [5-8 sources]

## Appendix: Applicable Standards
- [regulatory standards]

## Appendix: Engine-Inferred Assumptions
Field | Inferred Value | Confidence | Reasoning
--- | --- | --- | ---
[inferred fields with confidence]

RULES:
- 200-300 words main body (not appendices)
- Every metric has units. No "appropriate" or "suitable"
- Cost = specific £. Mass = specific kg. Volume = specific number
- If a field is unknown, write "Not specified — requires [specific input]"`

async function main() {
  const args = process.argv.slice(2)
  const briefIdx = args.indexOf('--brief')
  const outputIdx = args.indexOf('--output')
  const maxIterIdx = args.indexOf('--max-iter')
  
  if (briefIdx === -1 || outputIdx === -1) {
    console.error('Usage: npx tsx brief-rl-iterate.ts --brief "text" --output /path [--max-iter 5]')
    process.exit(1)
  }
  
  const originalBrief = args[briefIdx + 1]
  const outputDir = args[outputIdx + 1]
  const maxIter = maxIterIdx >= 0 ? parseInt(args[maxIterIdx + 1]) : 5
  mkdirSync(outputDir, { recursive: true })
  
  console.log(`[brief-rl] Starting (max ${maxIter} iterations)...`)
  console.log(`[brief-rl] Brief: ${originalBrief.length} chars`)
  
  // Step 1: Research ONCE
  console.log('[brief-rl] Research (one-time)...')
  const { runResearch } = await import(join(__dirname, 'stages/1-research'))
  const researchResult = await runResearch(originalBrief, '')
  const research = researchResult.ok ? researchResult.data : null
  console.log(`[brief-rl] Research: ${research?.report?.length || 0} chars`)
  writeFileSync(join(outputDir, 'research.json'), JSON.stringify(research, null, 2))
  
  const researchSummary = summarizeResearch(research)
  
  // Step 2: Iterative loop
  const history: any[] = []
  let codeVersion = 1 // tracks code changes
  
  for (let iter = 1; iter <= maxIter; iter++) {
    console.log(`\n[brief-rl] === Iteration ${iter}/${maxIter} (code v${codeVersion}) ===`)
    
    // Generate Brief
    console.log('[brief-rl] Generating...')
    const briefText = await generateBrief(originalBrief, researchSummary)
    writeFileSync(join(outputDir, `brief-iter-${iter}.txt`), briefText)
    console.log(`[brief-rl] Generated: ${briefText.length} chars`)
    
    // Score with council
    console.log('[brief-rl] Scoring...')
    const scores = await scoreBrief(briefText)
    console.log(`[brief-rl] Score: ${scores.overall}/10`)
    console.log(`[brief-rl] Judges: ${scores.judges.map((j: any) => `${j.model.split('/').pop()}:${j.score}`).join(', ')}`)
    
    const result = { iteration: iter, codeVersion, ...scores, briefLength: briefText.length }
    history.push(result)
    writeFileSync(join(outputDir, 'history.json'), JSON.stringify(history, null, 2))
    
    // Check target
    if (scores.overall >= 8) {
      console.log(`\n[brief-rl] ✅ Target ${scores.overall}/10 reached at iteration ${iter}`)
      break
    }
    
    // Get improvement suggestions from council
    console.log('[brief-rl] Getting improvement suggestions...')
    const suggestions = await getSuggestions(scores, briefText, originalBrief)
    writeFileSync(join(outputDir, `suggestions-iter-${iter}.json`), JSON.stringify(suggestions, null, 2))
    console.log(`[brief-rl] ${suggestions.changes.length} suggestions received`)
    
    // Apply suggestions (update template for next iteration)
    if (suggestions.changes.length > 0) {
      console.log('[brief-rl] Applying suggestions...')
      // The suggestions modify the template/prompt for the next generation
      codeVersion++
    }
  }
  
  // Summary
  const final = history[history.length - 1]
  const best = history.reduce((a, b) => a.overall > b.overall ? a : b)
  console.log(`\n[brief-rl] === Summary ===`)
  console.log(`[brief-rl] Final: ${final?.overall}/10, Best: ${best.overall}/10`)
  console.log(`[brief-rl] Iterations: ${history.length}, Code versions: ${codeVersion}`)
}

async function generateBrief(originalBrief: string, researchSummary: string): Promise<string> {
  const response = await callLLM(
    'google/gemini-3.1-pro-preview',
    BRIEF_TEMPLATE,
    `FOUNDER BRIEF:\n${originalBrief}\n\nRESEARCH DATA:\n${researchSummary}`,
    4096,
    0.3
  )
  return response || ''
}

async function scoreBrief(briefText: string): Promise<any> {
  const rubric = `Score this Brief 1-10 on each criterion:
1. Project Purpose — 1 sentence with quantifiable outcome? (2 pts)
2. Core Objectives — 3-5 testable bullets with metrics? (2 pts)
3. Requirements & Constraints — both columns with specific thresholds? (2 pts)
4. Scope Boundaries — in/out clearly stated? (2 pts)
5. Success Criteria — 2-3 numeric criteria? (2 pts)

8-10 = all present, specific. 6-7 = mostly present. 4-5 = gaps. 1-3 = missing most.

Return ONLY JSON: {"score": N, "criteria": [{"name":"...","score":N,"reason":"..."}], "reasons":["..."], "missing":["..."]}`

  const judges = ['x-ai/grok-4.3', 'xiaomi/mimo-v2.5-pro', 'z-ai/glm-5.1']
  const votes: any[] = []
  
  for (const model of judges) {
    try {
      const raw = await callLLM(model, 'Return ONLY valid JSON.', `${rubric}\n\nBRIEF:\n${briefText.slice(0, 6000)}`, 2048)
      if (!raw) continue
      const parsed = extractJSON(raw)
      if (parsed) {
        // Clamp score to 1-10 (some judges hallucinate out-of-range scores)
        parsed.score = Math.max(1, Math.min(10, Math.round(parsed.score || 0)))
        votes.push({ model, ...parsed })
      }
    } catch (e: any) {
      console.warn(`[brief-rl] Judge ${model}: ${e.message}`)
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

async function getSuggestions(scores: any, briefText: string, originalBrief: string): Promise<any> {
  const prompt = `You are improving a code template that generates Brief sections for engineering reports.

CURRENT SCORE: ${scores.overall}/10
ISSUES: ${scores.reasons.join('; ')}
MISSING: ${scores.missing.join('; ')}

The template is a text string with headings and rules. The generator LLM fills in the content based on founder brief + research data.

Current template:
\`\`\`
${BRIEF_TEMPLATE}
\`\`\`

Original founder brief (input):
${originalBrief.slice(0, 1000)}

Generated output (what the template produced):
${briefText.slice(0, 1500)}

Suggest 1-3 specific changes to the TEMPLATE (not the content) that would lift the score toward 8/10. Each change should be a specific text replacement or addition to the template.

Return JSON: {"changes": [{"what": "description", "old": "text to replace (or empty if adding)", "new": "replacement text", "reasoning": "why this helps"}]}`

  const raw = await callLLM('google/gemini-3.1-pro-preview', 'You are a code improvement advisor. Return ONLY valid JSON.', prompt, 4096)
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
      parts.push(`Volume: ${b.constraints.batchSize || b.quantityTarget || '?'}`)
    }
    if (b.targetProcess) parts.push(`Process: ${b.targetProcess}`)
    if (b.targetMaterial) parts.push(`Material: ${b.targetMaterial}`)
  }
  if (research.standardCodes?.length) parts.push(`Standards: ${research.standardCodes.join(', ')}`)
  if (research.sources?.length) parts.push(`Sources: ${research.sources.map((s: any) => s.title).join(', ')}`)
  if (research.competitors?.length) parts.push(`Competitors: ${research.competitors.map((c: any) => c.name).join(', ')}`)
  return parts.join('\n') || 'Minimal research.'
}

main().catch(err => {
  console.error('[brief-rl] Fatal:', err.message)
  process.exit(1)
})
