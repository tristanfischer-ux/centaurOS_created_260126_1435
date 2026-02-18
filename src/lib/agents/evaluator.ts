/**
 * @file evaluator.ts
 *
 * @description Lightweight output quality evaluation for agent responses.
 * Uses a cheap model (GPT-4o-mini) to score relevance, completeness, and
 * actionability. Run async after streaming to avoid adding latency.
 *
 * @audit Stores scores in agent_memory_messages.metadata for monitoring and improvement.
 */

export interface EvaluationResult {
  /** 0–1: did the response address the question? */
  relevance: number
  /** 0–1: were all parts of the question answered? */
  completeness: number
  /** 0–1: can the user act on this advice? */
  actionability: number
  /** Weighted average (0–1) */
  overall: number
  /** If score < threshold, what's missing */
  feedback?: string
}

const EVALUATION_THRESHOLD = 0.4
const SELF_CORRECTION_THRESHOLD = 0.3

const WEIGHTS = { relevance: 0.4, completeness: 0.35, actionability: 0.25 }

/**
 * Scores an assistant response against the user prompt.
 * Uses GPT-4o-mini for low cost and speed.
 *
 * @param userPrompt - The user's question or request
 * @param assistantOutput - The assistant's response text
 * @returns EvaluationResult with scores and optional feedback
 */
export async function evaluateOutput(
  userPrompt: string,
  assistantOutput: string
): Promise<EvaluationResult> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return {
      relevance: 0,
      completeness: 0,
      actionability: 0,
      overall: 0,
      feedback: 'Evaluator skipped: no API key',
    }
  }

  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey: openaiKey })

  const systemPrompt = `You are an output quality evaluator. Score the assistant's response against the user's prompt.
Return ONLY a JSON object with these exact keys (numbers 0-1, two decimals):
- relevance: did the response address the user's question? (0-1)
- completeness: were all parts of the question answered? (0-1)
- actionability: can the user act on this advice? (0-1)
- feedback: if overall would be below 0.5, one short sentence on what's missing (optional string)

No other text. Example: {"relevance":0.9,"completeness":0.8,"actionability":0.85,"feedback":null}`

  const userMessage = `User prompt:\n${userPrompt.slice(0, 4000)}\n\nAssistant response:\n${assistantOutput.slice(0, 6000)}`

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 200,
    })

    const raw = res.choices[0]?.message?.content?.trim() ?? '{}'
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    const relevance = clamp(Number(parsed.relevance ?? 0), 0, 1)
    const completeness = clamp(Number(parsed.completeness ?? 0), 0, 1)
    const actionability = clamp(Number(parsed.actionability ?? 0), 0, 1)
    const overall =
      relevance * WEIGHTS.relevance +
      completeness * WEIGHTS.completeness +
      actionability * WEIGHTS.actionability
    const feedback =
      typeof parsed.feedback === 'string' && parsed.feedback.trim()
        ? parsed.feedback.trim()
        : undefined

    return {
      relevance: Math.round(relevance * 100) / 100,
      completeness: Math.round(completeness * 100) / 100,
      actionability: Math.round(actionability * 100) / 100,
      overall: Math.round(overall * 100) / 100,
      feedback,
    }
  } catch (err) {
    console.warn('[Evaluator] Evaluation failed:', err instanceof Error ? err.message : err)
    return {
      relevance: 0,
      completeness: 0,
      actionability: 0,
      overall: 0,
      feedback: 'Evaluation failed',
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

/**
 * Whether the response should be flagged for review (score below threshold).
 */
export function shouldFlagForReview(result: EvaluationResult): boolean {
  return result.overall < EVALUATION_THRESHOLD
}

/**
 * Whether to attempt self-correction (score very low). Phase 4c optional.
 */
export function shouldSelfCorrect(result: EvaluationResult): boolean {
  return result.overall < SELF_CORRECTION_THRESHOLD
}

// ─── Engineering-specific evaluation ─────────────────────────────────────

export interface EngineeringEvaluationResult {
  /** 0–1: do recommended specs/dimensions match the research or source data? */
  dimensionalConsistency: number
  /** 0–1: is the suggested material suitable for the stated manufacturing process? */
  materialAppropriateness: number
  /** 0–1: are safety/compliance concerns flagged where relevant (load-bearing, electrical, thermal)? */
  safetyCompliance: number
  /** 0–1: are recommended components/suppliers plausibly purchasable (not fictional)? */
  sourcingFeasibility: number
  /** 0–1: do tolerances compound reasonably (no obvious stack-up violations)? */
  toleranceStackUp: number
  /** Weighted average (0–1) */
  overall: number
  /** Short feedback if overall < 0.5 */
  feedback?: string
}

const ENGINEERING_WEIGHTS = {
  dimensionalConsistency: 0.25,
  materialAppropriateness: 0.2,
  safetyCompliance: 0.25,
  sourcingFeasibility: 0.15,
  toleranceStackUp: 0.15,
}

const ENGINEERING_EVAL_MODEL = 'gpt-4o'

/**
 * Scores an engineering recommendation (research report, module decomposition,
 * or diagnostics) against the source context. Uses a capable model for
 * domain-specific judgment.
 *
 * @param userPrompt - The user's request or research query
 * @param assistantOutput - The engineering recommendation (report, JSON, or text)
 * @param context - Optional grounding context (e.g. research report snippet)
 * @returns EngineeringEvaluationResult with dimension-specific scores
 */
export async function evaluateEngineeringOutput(
  userPrompt: string,
  assistantOutput: string,
  context?: string
): Promise<EngineeringEvaluationResult> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return {
      dimensionalConsistency: 0,
      materialAppropriateness: 0,
      safetyCompliance: 0,
      sourcingFeasibility: 0,
      toleranceStackUp: 0,
      overall: 0,
      feedback: 'Evaluator skipped: no API key',
    }
  }

  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey: openaiKey })

  const systemPrompt = `You are an engineering quality evaluator. Score the assistant's engineering recommendation against the user's request and any source context.

Score each dimension 0–1 (two decimals):
- dimensionalConsistency: Do recommended dimensions/specs align with the research or source data? No invented numbers?
- materialAppropriateness: Is the suggested material suitable for the stated manufacturing process and environment?
- safetyCompliance: Are safety/compliance concerns mentioned where relevant (load-bearing, electrical, thermal, IP rating)?
- sourcingFeasibility: Are recommended components or suppliers plausibly real and purchasable (not obviously fictional)?
- toleranceStackUp: If tolerances are given, do they compound reasonably (no obvious stack-up violations)?
- feedback: If overall would be below 0.5, one short sentence on what's wrong (optional string).

Return ONLY a JSON object with those exact keys. No other text. Example:
{"dimensionalConsistency":0.9,"materialAppropriateness":0.85,"safetyCompliance":0.7,"sourcingFeasibility":0.8,"toleranceStackUp":0.9,"feedback":null}`

  const contextBlock = context ? `\nSource/context (excerpt):\n${context.slice(0, 2000)}` : ''
  const userMessage = `User request:\n${userPrompt.slice(0, 3000)}\n\nAssistant engineering output:\n${assistantOutput.slice(0, 5000)}${contextBlock}`

  try {
    const res = await client.chat.completions.create({
      model: ENGINEERING_EVAL_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 300,
    })

    const raw = res.choices[0]?.message?.content?.trim() ?? '{}'
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    const dimensionalConsistency = clamp(Number(parsed.dimensionalConsistency ?? 0), 0, 1)
    const materialAppropriateness = clamp(Number(parsed.materialAppropriateness ?? 0), 0, 1)
    const safetyCompliance = clamp(Number(parsed.safetyCompliance ?? 0), 0, 1)
    const sourcingFeasibility = clamp(Number(parsed.sourcingFeasibility ?? 0), 0, 1)
    const toleranceStackUp = clamp(Number(parsed.toleranceStackUp ?? 0), 0, 1)
    const overall =
      dimensionalConsistency * ENGINEERING_WEIGHTS.dimensionalConsistency +
      materialAppropriateness * ENGINEERING_WEIGHTS.materialAppropriateness +
      safetyCompliance * ENGINEERING_WEIGHTS.safetyCompliance +
      sourcingFeasibility * ENGINEERING_WEIGHTS.sourcingFeasibility +
      toleranceStackUp * ENGINEERING_WEIGHTS.toleranceStackUp
    const feedback =
      typeof parsed.feedback === 'string' && parsed.feedback.trim()
        ? parsed.feedback.trim()
        : undefined

    return {
      dimensionalConsistency: Math.round(dimensionalConsistency * 100) / 100,
      materialAppropriateness: Math.round(materialAppropriateness * 100) / 100,
      safetyCompliance: Math.round(safetyCompliance * 100) / 100,
      sourcingFeasibility: Math.round(sourcingFeasibility * 100) / 100,
      toleranceStackUp: Math.round(toleranceStackUp * 100) / 100,
      overall: Math.round(overall * 100) / 100,
      feedback,
    }
  } catch (err) {
    console.warn('[Evaluator] Engineering evaluation failed:', err instanceof Error ? err.message : err)
    return {
      dimensionalConsistency: 0,
      materialAppropriateness: 0,
      safetyCompliance: 0,
      sourcingFeasibility: 0,
      toleranceStackUp: 0,
      overall: 0,
      feedback: 'Evaluation failed',
    }
  }
}

/**
 * Run evaluation async and store scores in message metadata.
 * Call fire-and-forget after saving the assistant message (no await).
 *
 * @param messageId - The agent_memory_message id to attach evaluation to
 * @param foundryId - Foundry for RLS
 * @param userPrompt - The user's prompt (for relevance/completeness)
 * @param assistantOutput - The assistant's response text
 */
export async function runOutputEvaluationAndStore(
  messageId: string,
  foundryId: string,
  userPrompt: string,
  assistantOutput: string
): Promise<void> {
  const { updateMessageMetadata } = await import('@/lib/agent-memory/manager')
  const result = await evaluateOutput(userPrompt, assistantOutput)
  await updateMessageMetadata(messageId, foundryId, {
    evaluation: {
      relevance: result.relevance,
      completeness: result.completeness,
      actionability: result.actionability,
      overall: result.overall,
      ...(result.feedback && { feedback: result.feedback }),
      flagged: shouldFlagForReview(result),
    },
  })
}
