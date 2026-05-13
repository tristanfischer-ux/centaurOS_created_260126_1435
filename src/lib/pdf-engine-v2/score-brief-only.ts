/**
 * score-brief-only.ts — Score a Brief section with 3 council judges.
 * 
 * Usage: npx tsx score-brief-only.ts --input brief-section.txt --output scores.json
 */

import { readFileSync, writeFileSync } from 'fs'

const BRIEF_CRITERIA = [
  'Constraint Capture — are all physical limits (mass, dimensions, cost) explicitly stated?',
  'Feasibility Pre-check — do the targets align with physics and market reality?',
  'Requirement Traceability — can every requirement be traced to a specific module?',
  'Specificity — are requirements quantified with units, not qualitative?',
  'Completeness — are regulatory, manufacturing, and commercial requirements covered?',
]

const ENGINEERING_DIMENSIONS = [
  'Technical Accuracy — are the engineering specifications physically correct and achievable?',
  'Safety Compliance — does the design satisfy relevant standards?',
  'Cost Realism — are the cost estimates grounded in real market data?',
  'Manufacturing Feasibility — can this actually be built at the stated volume?',
  'Design Completeness — are all critical components specified?',
]

async function main() {
  const args = process.argv.slice(2)
  const inputIdx = args.indexOf('--input')
  const outputIdx = args.indexOf('--output')
  
  if (inputIdx === -1 || outputIdx === -1) {
    console.error('Usage: npx tsx score-brief-only.ts --input brief.txt --output scores.json')
    process.exit(1)
  }
  
  const briefText = readFileSync(args[inputIdx + 1], 'utf-8')
  const outputPath = args[outputIdx + 1]
  
  const allCriteria = [...ENGINEERING_DIMENSIONS, ...BRIEF_CRITERIA]
  const criteriaList = allCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
  
  const prompt = `As an experienced engineering consultant, evaluate this Brief section for engineering quality. Score each criterion 1-10. For scores below 5, explain specifically what is wrong.

JUDGING CRITERIA:
${criteriaList}

BRIEF SECTION CONTENT:
${briefText.slice(0, 8000)}

Return ONLY valid JSON:
{
  "criteria_scores": [
    {"criterion": "criterion name", "score": 7, "reason": "specific observation"}
  ],
  "overall_score": 7,
  "overall_reasons": ["observation 1", "observation 2"],
  "code_change_recommendations": ["specific fix 1", "specific fix 2"]
}`

  const judges = [
    'x-ai/grok-4.3',
    'xiaomi/mimo-v2.5-pro',
    'z-ai/glm-5.1',
  ]
  
  console.log(`[score-brief] Scoring with ${judges.length} judges...`)
  
  const votes: any[] = []
  
  for (const model of judges) {
    try {
      console.log(`[score-brief] Calling ${model}...`)
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          // WS-D 2026-05-13: 150k (was 4096) — Tristan approved; truncation more expensive than unused tokens.
          max_tokens: 150_000,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(60000),
      })
      
      if (!response.ok) {
        console.warn(`[score-brief] ${model} returned ${response.status}`)
        continue
      }
      
      const json = await response.json()
      const msg = json.choices?.[0]?.message
      const raw = msg?.content || msg?.reasoning || ''
      
      if (!raw) {
        console.warn(`[score-brief] ${model} returned empty`)
        continue
      }
      
      // Extract JSON
      let jsonStr = raw.replace(/^\s*```json\s*/m, '').replace(/```\s*$/m, '').trim()
      const firstBrace = jsonStr.indexOf('{')
      const lastBrace = jsonStr.lastIndexOf('}')
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
      }
      
      const parsed = JSON.parse(jsonStr)
      if (parsed.overall_score) {
        votes.push({
          model,
          score: parsed.overall_score,
          criteria_scores: parsed.criteria_scores || [],
          reasons: parsed.overall_reasons || [],
          recommendations: parsed.code_change_recommendations || [],
        })
        console.log(`[score-brief] ${model}: ${parsed.overall_score}/10`)
      }
    } catch (err: any) {
      console.warn(`[score-brief] ${model} failed: ${err.message}`)
    }
  }
  
  if (votes.length === 0) {
    console.error('[score-brief] All judges failed')
    process.exit(1)
  }
  
  // Average scores
  const avgScore = Math.round(votes.reduce((s, v) => s + v.score, 0) / votes.length)
  const allReasons = [...new Set(votes.flatMap(v => v.reasons))]
  const allRecommendations = [...new Set(votes.flatMap(v => v.recommendations))]
  
  const result = {
    overall_score: avgScore,
    judge_scores: votes.map(v => ({ model: v.model, score: v.score })),
    reasons: allReasons.slice(0, 5),
    recommendations: allRecommendations.slice(0, 5),
    criteria_scores: allCriteria.map((c, i) => {
      const scores = votes
        .map(v => v.criteria_scores[i]?.score)
        .filter(s => typeof s === 'number')
      return {
        criterion: c,
        score: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      }
    }),
  }
  
  writeFileSync(outputPath, JSON.stringify(result, null, 2))
  console.log(`[score-brief] Overall: ${avgScore}/10 (${votes.length} judges)`)
}

main().catch(err => {
  console.error('[score-brief] Fatal:', err.message)
  process.exit(1)
})
