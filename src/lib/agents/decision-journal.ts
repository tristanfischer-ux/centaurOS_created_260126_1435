/**
 * @file decision-journal.ts
 *
 * @description Tracks key decisions the founder makes with specialist input.
 * This creates the foundation for "remember when" references, pattern
 * recognition, and decision tracking over time.
 *
 * Decisions are extracted from conversations when:
 * - The user explicitly decides something ("Let's go with option A")
 * - The specialist recommends and the user agrees
 * - A proposed action is accepted
 *
 * @related
 * - Specialist state: src/lib/agents/specialist-state.ts
 * - Memory manager: src/lib/agent-memory/manager.ts
 * - Execute route: src/app/api/agents/execute/route.ts
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ──────────────────────────────────────────────────────────

export type OutcomeStatus = 'pending' | 'positive' | 'negative' | 'mixed' | 'unknown'

export interface DecisionEntry {
    id: string
    foundryId: string
    specialistId: string
    decision: string
    context: string
    outcome?: string
    outcomeStatus: OutcomeStatus
    outcomeNotes?: string
    outcomeRecordedAt?: string
    createdAt: string
}

// ─── Decision Patterns ──────────────────────────────────────────────

/** Patterns that indicate a decision has been made */
const DECISION_PATTERNS = [
    /let'?s (go with|do|proceed|choose|pick|start|launch|build|hire|cut|stop)/i,
    /i'?ve decided/i,
    /we'?re going (with|to)/i,
    /i want to (go with|proceed|choose)/i,
    /decision:?\s*(.+)/i,
    /agreed[.!]?\s/i,
    /that'?s the plan/i,
    /let'?s do (it|that|this)/i,
    /sounds good,?\s*(let'?s|go)/i,
    /yes,?\s*(let'?s|do|go|proceed)/i,
]

/**
 * Detects if a user message contains a decision signal.
 *
 * @param message - The user's message
 * @returns Whether the message likely contains a decision
 */
export function containsDecisionSignal(message: string): boolean {
    return DECISION_PATTERNS.some(pattern => pattern.test(message))
}

/**
 * Extracts a decision summary from a conversation exchange.
 * Uses the user's message and the specialist's preceding recommendation.
 *
 * @param userMessage - The user's decision message
 * @param specialistResponse - The specialist's preceding response
 * @returns A concise decision summary
 */
export function extractDecisionSummary(
    userMessage: string,
    specialistResponse: string,
): string {
    // Take the first 200 chars of the user's message as the decision
    const userPart = userMessage.trim().slice(0, 200)

    // Try to extract the recommendation from the specialist's response
    const recMatch = specialistResponse.match(/recommend(?:ation)?:?\s*(.{20,200})/i)
    const context = recMatch ? recMatch[1].trim() : specialistResponse.slice(0, 150).trim()

    return `Decided: "${userPart}" (Context: ${context})`
}

/**
 * Records a decision in the journal.
 *
 * @param foundryId - The foundry ID
 * @param specialistId - The specialist who helped with the decision
 * @param decision - The decision summary
 * @param context - Additional context
 *
 * @audit Logs decision to specialist_decision_journal table
 */
export async function recordDecision(
    foundryId: string,
    specialistId: string,
    decision: string,
    context: string,
): Promise<void> {
    const supabase = createAdminClient()

    try {
        // AUDIT: Record decision for pattern recognition and "remember when" references
        await supabase.from('specialist_decision_journal').insert({
            foundry_id: foundryId,
            specialist_id: specialistId,
            decision,
            context,
        })
    } catch (error) {
        console.error('[decision-journal] Failed to record decision:', error)
    }
}

/**
 * Gets recent decisions for a specialist to reference.
 *
 * @param foundryId - The foundry ID
 * @param specialistId - The specialist ID (optional, null for all)
 * @param limit - Maximum decisions to return
 * @returns Array of recent decisions
 */
export async function getRecentDecisions(
    foundryId: string,
    specialistId?: string,
    limit: number = 10,
): Promise<DecisionEntry[]> {
    const supabase = createAdminClient()

    let query = supabase
        .from('specialist_decision_journal')
        .select('id, foundry_id, specialist_id, decision, context, outcome, outcome_status, outcome_notes, outcome_recorded_at, created_at')
        .eq('foundry_id', foundryId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (specialistId) {
        query = query.eq('specialist_id', specialistId)
    }

    const { data, error } = await query

    if (error) {
        console.error('[decision-journal] Failed to fetch decisions:', error)
        return []
    }

    return (data ?? []).map(row => ({
        id: row.id,
        foundryId: row.foundry_id,
        specialistId: row.specialist_id,
        decision: row.decision,
        context: row.context,
        outcome: row.outcome,
        outcomeStatus: (row.outcome_status ?? 'pending') as OutcomeStatus,
        outcomeNotes: row.outcome_notes ?? undefined,
        outcomeRecordedAt: row.outcome_recorded_at ?? undefined,
        createdAt: row.created_at,
    }))
}

/**
 * Compiles decision journal into a prompt block.
 *
 * @description Formats recent decisions into a natural-language prompt block
 * that encourages the specialist to reference past decisions naturally.
 *
 * @param decisions - Recent decisions
 * @returns Formatted prompt block, or empty string if no decisions
 */
const OUTCOME_LABELS: Record<OutcomeStatus, string> = {
    pending: '',
    positive: '✅ Worked well',
    negative: '❌ Didn\'t work',
    mixed: '⚖️ Mixed results',
    unknown: '❓ Unclear outcome',
}

export function compileDecisionJournalPrompt(decisions: DecisionEntry[]): string {
    if (decisions.length === 0) return ''

    const lines: string[] = [
        '## Decision Journal (decisions this founder made with your help)',
        'Reference these naturally when relevant. "Remember when you decided to..." or "That aligns with your earlier decision to..."',
        'When a past decision had a known outcome, use it: "Last time we tried X, it [worked/didn\'t work] — here\'s what I\'d suggest differently."',
        '',
    ]

    for (const d of decisions.slice(0, 5)) {
        const date = new Date(d.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        const outcomeLabel = OUTCOME_LABELS[d.outcomeStatus]
        lines.push(`- [${date}] ${d.decision}`)
        if (outcomeLabel) {
            lines.push(`  → ${outcomeLabel}${d.outcomeNotes ? `: ${d.outcomeNotes}` : ''}`)
        } else if (d.outcome) {
            lines.push(`  Outcome: ${d.outcome}`)
        }
    }

    return lines.join('\n')
}

/**
 * Generates follow-up reminders for decisions older than 30 days with pending outcomes.
 *
 * @description Scans the decision journal for stale pending decisions and creates
 * reminder insights in agent_insights. Deduplicates by checking for existing
 * follow-up insights referencing the same decision ID.
 *
 * @param foundryId - The foundry to scan
 * @returns Number of follow-up insights created
 */
export async function generateDecisionFollowUps(foundryId: string): Promise<number> {
    const admin = createAdminClient()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: pendingDecisions } = await admin
        .from('specialist_decision_journal')
        .select('id, specialist_id, decision, created_at')
        .eq('foundry_id', foundryId)
        .or('outcome_status.is.null,outcome_status.eq.pending')
        .lt('created_at', thirtyDaysAgo)
        .limit(20)

    if (!pendingDecisions?.length) return 0

    // Check for existing follow-ups
    const decisionIds = pendingDecisions.map(d => d.id)
    const { data: existing } = await admin
        .from('agent_insights')
        .select('domain_data')
        .eq('foundry_id', foundryId)
        .eq('insight_type', 'reminder')

    const existingIds = new Set(
        (existing ?? [])
            .map(i => (i.domain_data as Record<string, unknown>)?.decision_id)
            .filter(Boolean) as string[]
    )

    let created = 0
    for (const d of pendingDecisions) {
        if (existingIds.has(d.id)) continue

        const daysAgo = Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000)

        await admin.from('agent_insights').insert({
            foundry_id: foundryId,
            specialist_id: d.specialist_id,
            insight_type: 'reminder',
            urgency: 'important',
            title: `How did this decision work out? (${daysAgo}d ago)`,
            body: `You decided "${d.decision.slice(0, 150)}" ${daysAgo} days ago. Recording the outcome helps improve future advice.`,
            domain_data: {
                decision_id: d.id,
                action_type: 'record_outcome',
                days_since_decision: daysAgo,
            },
            suggested_actions: [
                { label: 'Record outcome', action_type: 'record_outcome', action_data: { decisionId: d.id } },
            ],
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        created++
    }

    return created
}

/**
 * Detects behavioral patterns from the decision journal.
 * E.g., "You tend to deprioritize marketing tasks" or "You favor speed over perfection."
 *
 * @description Analyzes the full decision history to extract recurring patterns
 * in the founder's decision-making style. Only triggers with 5+ decisions
 * and 40%+ pattern match to avoid false positives.
 *
 * @param decisions - All decisions for this foundry
 * @returns Array of detected patterns (human-readable strings)
 */
export function detectDecisionPatterns(decisions: DecisionEntry[]): string[] {
    if (decisions.length < 5) return []

    const patterns: string[] = []
    const decisionTexts = decisions.map(d => d.decision.toLowerCase())

    // Speed bias detection
    const speedWords = ['fast', 'quick', 'now', 'immediately', 'today', 'this week', 'ship', 'launch']
    const speedCount = decisionTexts.filter(d => speedWords.some(w => d.includes(w))).length
    if (speedCount > decisions.length * 0.4) {
        patterns.push('This founder tends to favor speed and urgency in decisions. They prefer action over analysis.')
    }

    // Caution bias detection
    const cautionWords = ['wait', 'think about', 'more data', 'research', 'careful', 'risk']
    const cautionCount = decisionTexts.filter(d => cautionWords.some(w => d.includes(w))).length
    if (cautionCount > decisions.length * 0.4) {
        patterns.push('This founder tends to be deliberate and data-driven. They prefer thorough analysis before committing.')
    }

    // People-first detection
    const peopleWords = ['hire', 'team', 'culture', 'people', 'onboard']
    const peopleCount = decisionTexts.filter(d => peopleWords.some(w => d.includes(w))).length
    if (peopleCount > decisions.length * 0.3) {
        patterns.push('This founder prioritizes people and team decisions. They invest heavily in hiring and culture.')
    }

    return patterns
}
