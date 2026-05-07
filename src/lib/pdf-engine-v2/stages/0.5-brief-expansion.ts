import { parseJsonFromLlm } from '../lib/llm-json'
import type { StageResult } from '../types'

export interface BriefExpansionResult {
  originalBrief: string
  expandedFields: Record<string, unknown>
  inferredAssumptions: Array<{ field: string; value: unknown; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; reasoning: string }>
  assumptions: string[]
  canProceed: boolean
}

export function buildBriefExpansionPrompt(
  briefText: string,
  productClass: string,
  technologyDomains: string[]
): string {
  return `You are a product engineering analyst. A founder has written a minimal brief for a ${productClass}. 
Infer the missing engineering constraints from context. Be specific with numbers — don't say "appropriate", say "£15,000-25,000".

BRIEF:
${briefText}

PRODUCT CLASS: ${productClass}
TECHNOLOGY DOMAINS: ${technologyDomains.join(', ')}

For each inferred field, provide:
- field name (matching the expected structured brief fields)
- inferred value
- confidence (HIGH/MEDIUM/LOW)
- reasoning (why you inferred this)

Return JSON: {
  "inferred_fields": [
    {"field": "target_cost", "value": 15000, "confidence": "MEDIUM", "reasoning": "Similar class products typically..."}
  ],
  "assumptions": ["Assumed UK market based on..."]
}`
}

export function shouldExpandBrief(briefText: string, designBrief?: any): boolean {
  if (briefText.length < 500) return true
  if (designBrief) {
    // Check for many missing fields
    const fields = ['useCase', 'targetProcess', 'targetMaterial', 'toleranceTarget', 'quantityTarget']
    const missing = fields.filter(f => !designBrief[f] || designBrief[f].toLowerCase() === 'unknown' || designBrief[f].toLowerCase() === 'n/a')
    if (missing.length >= 3) return true
  }
  return false
}

export async function runBriefExpansion(
  briefText: string,
  productClass: string,
  classification: { confidence: string; technologyDomains: string[] }
): Promise<StageResult<BriefExpansionResult>> {
  const startMs = Date.now()

  const prompt = buildBriefExpansionPrompt(briefText, productClass, classification.technologyDomains)

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-v4-flash',
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      throw new Error(`OpenRouter API error: ${res.statusText}`)
    }

    const data = await res.json()
    const content = data.choices[0].message.content

    const parsed = parseJsonFromLlm(content, { expectKey: 'inferred_fields', model: 'deepseek-v4-flash', stage: 'brief-expansion' })

    const inferredAssumptions = parsed.inferred_fields || []
    const expandedFields: Record<string, unknown> = {}
    for (const f of inferredAssumptions) {
      expandedFields[f.field] = f.value
    }

    const assumptions = parsed.assumptions || []

    return {
      ok: true,
      data: {
        originalBrief: briefText,
        expandedFields,
        inferredAssumptions,
        assumptions,
        canProceed: true,
      },
      durationMs: Date.now() - startMs,
    }
  } catch (err: any) {
    return {
      ok: false,
      error: err.message,
      durationMs: Date.now() - startMs,
    }
  }
}
