/**
 * @file complexity-classifier.ts
 *
 * @description Lightweight keyword + heuristic complexity classifier for
 * specialist messages. No LLM call — runs in microseconds. Used by the
 * execute route to escalate minimax-tier specialists to qwen tier when
 * the request clearly requires multi-step reasoning, strategy, or analysis.
 *
 * @related
 * - Execute route: src/app/api/agents/execute/route.ts (sole consumer)
 * - Specialist data: src/app/(platform)/agents/specialists-data.ts (modelTier field)
 */

// ─── Complexity Signals ───────────────────────────────────────────────────────

/** Keywords that indicate a request requires deeper reasoning than simple Q&A */
const COMPLEXITY_KEYWORDS: string[] = [
    'analyze', 'analyse', 'analysis',
    'compare', 'comparison', 'versus', ' vs ',
    'strategy', 'strategic',
    'trade-off', 'tradeoff', 'trade off',
    'risk', 'risks',
    'scenario', 'scenarios',
    'evaluate', 'evaluation',
    'architecture', 'framework',
    'recommend between', 'which option', 'best approach',
    'pros and cons', 'advantages and disadvantages',
    'alternatives', 'options for',
    'implications', 'impact of',
    'explain why', 'how does this', 'what would happen',
    'step by step', 'walk me through',
    'deep dive', 'thorough',
]

const LONG_MESSAGE_THRESHOLD = 500 // chars
const MULTI_QUESTION_THRESHOLD = 3  // question marks

/**
 * Classifies a user message's complexity on a 3-point scale.
 *
 * @description Scores the message on three independent signals:
 * 1. Length (>500 chars suggests detailed/multi-part request)
 * 2. Complexity keywords (analysis, strategy, trade-offs, etc.)
 * 3. Multiple questions (3+ question marks)
 *
 * Score 0 → 'low', score 1 → 'medium', score ≥ 2 → 'high'.
 * The 2-signal threshold is conservative to avoid over-escalation.
 *
 * @param message - The user's raw input text
 * @returns Complexity level
 */
export function classifyComplexity(message: string): 'low' | 'medium' | 'high' {
    let score = 0
    const lower = message.toLowerCase()

    // Signal 1: long message implies detailed or multi-part request
    if (message.length > LONG_MESSAGE_THRESHOLD) score++

    // Signal 2: complexity keywords indicate analytical/strategic work
    if (COMPLEXITY_KEYWORDS.some(kw => lower.includes(kw))) score++

    // Signal 3: multiple questions suggest multi-faceted problem
    const questionCount = (message.match(/\?/g) ?? []).length
    if (questionCount >= MULTI_QUESTION_THRESHOLD) score++

    if (score >= 2) return 'high'
    if (score >= 1) return 'medium'
    return 'low'
}
