/**
 * 3.5-brief-revision.ts — Feasibility → Brief Feedback Loop
 * 
 * When Feasibility finds impossible constraints, this stage revises the Brief
 * with feasible alternatives. The revised Brief shows:
 * - What the founder originally asked for
 * - What Feasibility found (impossible constraints)
 * - What was changed to make it feasible
 * 
 * Pipeline: Research → Brief → Feasibility → Brief Revision → (re-run Feasibility)
 */

import type { StageResult } from '../types'

export interface BriefRevision {
  /** The revised 5-section Brief text */
  revisedBriefText: string
  /** What changed from the original Brief */
  changes: Array<{
    constraint: string
    original: string
    feasibilityFinding: string
    revised: string
    reasoning: string
  }>
  /** Whether any changes were made */
  hasRevisions: boolean
}

const REVISION_PROMPT = `You are revising an engineering Brief after a Feasibility assessment found impossible constraints.

Your job: take the impossible constraints and propose FEASIBLE alternatives. The revised Brief should:
1. Keep the founder's original intent
2. Acknowledge what Feasibility found (impossible constraints)
3. Propose specific, numeric alternatives that ARE feasible
4. Explain why each change was made

Output the revised 5-section Brief with the same structure as the original, but with updated constraints.

Also output a JSON array of changes:
\`\`\`json
{
  "changes": [
    {
      "constraint": "energy budget",
      "original": "2.5 kWh/kg",
      "feasibilityFinding": "Thermodynamically impossible — physics requires 8-12 kWh/kg",
      "revised": "8 kWh/kg",
      "reasoning": "LED lighting alone requires 5.97 kWh/kg; adding HVAC pushes to 8+"
    }
  ]
}
\`\`\`

RULES:
- Every revised constraint must be physically achievable
- Keep the founder's product vision intact — only change what's impossible
- Be specific with numbers, not vague
- If multiple alternatives exist, pick the most practical one`


export async function runBriefRevision(
  originalBrief: string,
  currentBriefText: string,
  feasibilityText: string,
  productClass: string,
): Promise<StageResult<BriefRevision>> {
  const startTime = Date.now()
  console.log('[brief-rev] Revising Brief after Feasibility findings...')

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-pro-preview',
        max_tokens: 4096,
        temperature: 0.3,
        messages: [
          { role: 'system', content: REVISION_PROMPT },
          { role: 'user', content: `ORIGINAL FOUNDER BRIEF:\n${originalBrief}\n\nCURRENT STRUCTURED BRIEF:\n${currentBriefText}\n\nFEASIBILITY ASSESSMENT:\n${feasibilityText}\n\nPRODUCT CLASS: ${productClass}\n\nRevise the Brief to make all constraints feasible. Output the revised Brief and the JSON changes array.` },
        ],
      }),
      signal: AbortSignal.timeout(180000),
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API ${response.status}`)
    }

    const json = await response.json()
    const raw = json.choices?.[0]?.message?.content || ''
    
    if (!raw) {
      throw new Error('Empty response from LLM')
    }

    // Extract JSON changes
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/)
    let changes: BriefRevision['changes'] = []
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1])
        changes = parsed.changes || []
      } catch (e) {
        console.warn('[brief-rev] Failed to parse changes JSON')
      }
    }

    // Extract the revised brief text (everything before the JSON block)
    const revisedBriefText = raw.replace(/```json[\s\S]*?```/, '').trim()

    const hasRevisions = changes.length > 0
    console.log(`[brief-rev] ${changes.length} revisions made`)

    return {
      ok: true,
      data: { revisedBriefText, changes, hasRevisions },
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[brief-rev] Failed: ${message}`)
    return {
      ok: false,
      error: message,
      durationMs: Date.now() - startTime,
    }
  }
}
