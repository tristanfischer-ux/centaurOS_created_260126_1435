import { parseJsonFromLlm } from '../lib/llm-json'
import { callFastExtract } from '../lib/openrouter-models'
import type { StageResult } from '../types'
import { getActionLogger } from '../lib/action-logger'

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
  const logger = getActionLogger()
  logger.logStage({
    step_name: 'brief-expansion',
    action_type: 'stage_start',
    brief_length: briefText.length,
    product_class: productClass,
    technology_domains: classification.technologyDomains,
  })

  const prompt = buildBriefExpansionPrompt(briefText, productClass, classification.technologyDomains)

  try {
    // Iter-09 (2026-05-13): swapped from DeepSeek V4-Flash (96% hallucination —
    // catastrophic for upstream creative inference) to Gemini 3.1 Flash-Lite
    // grounded (8.2% hallucination, native Google Search grounding for
    // regulatory/market facts). Per drawer forgeos_gotchas_2029897b28682440.
    // thinkingLevel='high' — one-shot per pipeline, latency hit invisible;
    // reasoning depth matters for inference accuracy.
    // groundWithGoogleSearch=true — real-time web check for regulatory
    // standards, market data, certifications drops hallucination near zero on
    // factual claims.
    const llmT0 = Date.now()
    const content = await callFastExtract(prompt, {
      thinkingLevel: 'high',
      groundWithGoogleSearch: true,
    })
    // callFastExtract returns raw text only — no token counts available.
    logger.logLlm({
      step_name: 'brief-expansion',
      model: 'google/gemini-3.1-flash-lite',
      latency_ms: Date.now() - llmT0,
      ok: true,
    })

    const parsed = await parseJsonFromLlm(content, {
      expectKey: 'inferred_fields',
      model: 'gemini-3.1-flash-lite',
      stage: 'brief-expansion',
      enableLlmRepair: true,
    })

    const inferredAssumptions = parsed.inferred_fields || []
    const expandedFields: Record<string, unknown> = {}
    for (const f of inferredAssumptions) {
      expandedFields[f.field] = f.value
    }

    const assumptions = parsed.assumptions || []

    logger.logStage({
      step_name: 'brief-expansion',
      action_type: 'stage_end',
      outcome: 'ok',
      duration_ms: Date.now() - startMs,
      inferred_fields_count: inferredAssumptions.length,
      assumptions_count: assumptions.length,
    })
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
    logger.logStage({
      step_name: 'brief-expansion',
      action_type: 'stage_end',
      outcome: 'fail',
      duration_ms: Date.now() - startMs,
      error: err.message,
    })
    return {
      ok: false,
      error: err.message,
      durationMs: Date.now() - startMs,
    }
  }
}
