/**
 * @file prompt-builder.ts — Heavy context layer assembly for specialist prompts.
 *
 * @description Assembles the supplementary context layers that enrich a specialist's
 * system prompt beyond its core personality. These layers provide:
 *   1. Founder preferences (communication style, trust level, pet peeves)
 *   2. Specialist emotional state and relationship depth
 *   3. Decision journal (past decisions for "remember when" references)
 *   4. External intelligence (recent monitoring sweep reports)
 *   5. Knowledge Vault (relevant organizational knowledge)
 *   6. "Since we last talked" bridge (what changed since last conversation)
 *   7. Cross-specialist intelligence (what related specialists recently said)
 *   8. Specialist knowledge base (persistent facts from past conversations)
 *   9. Temporal awareness (time/day, milestone proximity)
 *  10. Emotional awareness (detecting the founder's emotional state from their message)
 *
 * Each layer is independently failable — if any DB query fails, the specialist
 * proceeds with a slightly less rich prompt rather than failing entirely.
 *
 * On the "fast path" (conversational follow-ups where history provides continuity),
 * only temporal and emotional layers are included (zero DB queries).
 *
 * @audit Extracted 2026-02-19 from src/app/api/agents/execute/route.ts
 *        (refactor step 6 of 8). No logic changes — code moved verbatim.
 *        The execute route now calls buildContextLayers() instead of inlining
 *        ~120 lines of try/catch blocks.
 *
 * @related
 * - Execute route: src/app/api/agents/execute/route.ts (sole consumer)
 * - Specialist state: src/lib/agents/specialist-state.ts (emotional state)
 * - Founder preferences: src/lib/agents/founder-preferences.ts (communication prefs)
 * - Decision journal: src/lib/agents/decision-journal.ts (past decisions)
 * - Knowledge Vault: src/lib/knowledge-vault.ts (organizational knowledge)
 */

import { createClient } from "@/lib/supabase/server"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
import type { SpecialistId } from "@/app/(platform)/agents/specialists-data"
import {
    getFounderPreferences,
    getSpecialistRelationship,
    compileFounderPreferencesPrompt,
} from "@/lib/agents/founder-preferences"
import { getSpecialistState, compileSpecialistStatePrompt } from "@/lib/agents/specialist-state"
import {
    getRecentDecisions,
    compileDecisionJournalPrompt,
    detectDecisionPatterns,
} from "@/lib/agents/decision-journal"
import { getRecentIntelligenceReports } from "@/lib/agents/intelligence-sweep-orchestrator"
import { compileIntelligencePrompt } from "@/lib/agents/external-intelligence"
import { searchKnowledgeForSpecialist } from "@/lib/knowledge-vault"
import { compileTemporalPrompt } from "@/lib/agents/temporal-context"
import { compileEmotionalPrompt } from "@/lib/agents/emotional-context"
import { createAdminClient } from "@/lib/supabase/admin"
import { SPECIALISTS } from "@/app/(platform)/agents/specialists-data"
import { buildHandoffContext } from "@/lib/agents/handoff-context"
import { isEngineeringRelevant, buildEngineeringReferenceLayer } from "@/lib/agents/engineering-context"

// ─── Token Budget ────────────────────────────────────────────────────────────

/** Approximate token count via chars/4 heuristic. Good enough for budgeting. */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
}

/**
 * Layer priority order (highest first). Layers not in this list get lowest priority.
 * INTENT: When the total context exceeds the budget, lower-priority layers are
 * dropped first so the specialist retains the most critical context.
 */
const LAYER_PRIORITIES: Record<string, number> = {
    'Handoff Context': 100,        // Critical for continuity across specialist switches
    'Emotional State': 90,         // Relationship depth drives conversation style
    'Founder Preferences': 85,     // Communication style matters
    'Decision Journal': 80,        // "Remember when" references
    'Specialist Knowledge': 75,    // Persistent facts from past conversations
    'Temporal Awareness': 70,      // Time-of-day, milestones
    'External Intelligence': 60,   // Sweep reports
    'Engineering Reference Data': 58, // Verified material/process/standards data
    'Task Ownership': 55,          // Active work
    'Since Last Talked': 50,       // What changed since last chat
    'Knowledge Vault': 45,         // Organizational knowledge search results
    'Emotional Awareness': 40,     // Detecting founder mood from message
}

/** Token budget per model tier (context layers only, excluding personality prompt) */
const TOKEN_BUDGETS: Record<string, number> = {
    claude: 6000,
    qwen: 4000,
    minimax: 4000,
    'qwen-local': 4000,
}

interface CollectedLayer {
    name: string
    block: string
    tokens: number
    priority: number
}

/**
 * Applies token budget to collected context layers, keeping highest-priority
 * layers and dropping/truncating lower-priority ones when over budget.
 */
function applyTokenBudget(
    layers: CollectedLayer[],
    modelTier: string,
): { blocks: string; activeLayers: string[]; tokensUsed: number; tokenBudget: number } {
    const budget = TOKEN_BUDGETS[modelTier] ?? 4000
    const sorted = [...layers].sort((a, b) => b.priority - a.priority)
    const kept: CollectedLayer[] = []
    let tokensUsed = 0

    for (const layer of sorted) {
        if (tokensUsed + layer.tokens <= budget) {
            kept.push(layer)
            tokensUsed += layer.tokens
        } else {
            // Try to fit a truncated version of this layer
            const remaining = budget - tokensUsed
            if (remaining > 200) { // Only truncate if we can keep a meaningful chunk
                const truncatedBlock = layer.block.slice(0, remaining * 4) + '\n...(truncated)'
                const truncTokens = estimateTokens(truncatedBlock)
                kept.push({ ...layer, block: truncatedBlock, tokens: truncTokens })
                tokensUsed += truncTokens
            }
            break // Budget exhausted
        }
    }

    return {
        blocks: kept.map(l => `\n\n${l.block}`).join(''),
        activeLayers: kept.map(l => l.name),
        tokensUsed,
        tokenBudget: budget,
    }
}

/**
 * Parameters for building the specialist context layers.
 */
export interface ContextLayerParams {
    /** Foundry ID (null/undefined for anonymous users — skips DB-backed layers) */
    foundryId: string | null | undefined
    /** Specialist ID (null/undefined for non-specialist conversations) */
    specialistId: string | null | undefined
    /** Memory thread ID (null/undefined if no memory thread exists yet) */
    threadId: string | null | undefined
    /** The user's raw input text (used for emotional detection + knowledge search) */
    input: string
    /** The assembled final prompt (used as search fallback when input is empty) */
    finalPrompt: string
    /** True for conversational follow-ups — skips DB queries, uses lightweight layers only */
    isConversationalFastPath: boolean
    /** Source specialist's thread ID for cross-specialist handoff context (optional) */
    handoffSourceThreadId?: string
    /** Source specialist's ID for cross-specialist handoff context (optional) */
    handoffSourceSpecialistId?: string
    /** CAD Lab project ID — triggers engineering reference data injection */
    cadLabProjectId?: string
}

/**
 * Assembles supplementary context layers for a specialist system prompt.
 *
 * @description Builds a string of context blocks to append to the specialist's
 * system prompt. On the full path, queries 5-6 data sources in sequence (each
 * wrapped in try/catch for independent failability). On the fast path, only
 * includes temporal and emotional awareness (zero DB queries).
 *
 * @param params - The context assembly parameters
 * @returns Object with context blocks string and list of active layer names
 */
export async function buildContextLayers(params: ContextLayerParams & {
    /** Model tier for token budget (defaults to 'claude') */
    modelTier?: string
}): Promise<{
    contextBlocks: string
    activeLayers: string[]
    /** Approximate tokens used by context layers */
    contextTokensUsed: number
    /** Token budget that was applied */
    contextTokenBudget: number
}> {
    const {
        foundryId, specialistId, threadId, input, finalPrompt, isConversationalFastPath,
        handoffSourceThreadId, handoffSourceSpecialistId, cadLabProjectId, modelTier = 'claude',
    } = params
    const collectedLayers: CollectedLayer[] = []

    if (!isConversationalFastPath) {
        // Deep handoff context: when specialist B is receiving a handoff from specialist A,
        // inject A's full conversation transcript, artifacts, and decisions so B can
        // continue seamlessly without the founder re-explaining.
        if (foundryId && handoffSourceThreadId && handoffSourceSpecialistId) {
            try {
                const handoffBlock = await buildHandoffContext(foundryId, handoffSourceSpecialistId, handoffSourceThreadId)
                if (handoffBlock) {
                    collectedLayers.push({
                        name: 'Handoff Context',
                        block: handoffBlock,
                        tokens: estimateTokens(handoffBlock),
                        priority: LAYER_PRIORITIES['Handoff Context'] ?? 0,
                    })
                }
            } catch (err) {
                console.warn("[PromptBuilder] Could not load handoff context:", err)
            }
        }

        // Founder preferences: learned communication style, trust level, pet peeves
        if (foundryId && specialistId && threadId) {
            try {
                const [founderPrefs, specialistRel] = await Promise.all([
                    getFounderPreferences(foundryId),
                    getSpecialistRelationship(threadId, foundryId),
                ])
                const specialist = getSpecialistById(specialistId)
                const prefsBlock = compileFounderPreferencesPrompt(
                    founderPrefs,
                    specialistRel,
                    specialist?.name ?? specialistId,
                )
                if (prefsBlock) {
                    collectedLayers.push({
                        name: 'Founder Preferences',
                        block: prefsBlock,
                        tokens: estimateTokens(prefsBlock),
                        priority: LAYER_PRIORITIES['Founder Preferences'] ?? 0,
                    })
                }
            } catch (err) {
                console.warn("[PromptBuilder] Could not load founder preferences:", err)
            }
        }

        // Parallel context layer fetching: layers 2-7 are independent of each other
        // and can run concurrently via Promise.allSettled for independent failability.
        if (foundryId && specialistId) {
            const layerPromises: Array<Promise<{ block: string; layer: string }>> = []

            // Layer 2: Specialist emotional state and relationship depth
            if (threadId) {
                layerPromises.push(
                    (async () => {
                        const specialist = getSpecialistById(specialistId)
                        const { emotional, relationship } = await getSpecialistState(threadId, foundryId)
                        const stateBlock = compileSpecialistStatePrompt(emotional, relationship, specialist?.name ?? specialistId)
                        return { block: stateBlock, layer: 'Emotional State' }
                    })()
                )
            }

            // Layer 3: Decision journal
            layerPromises.push(
                (async () => {
                    const decisions = await getRecentDecisions(foundryId, specialistId, 10)
                    const journalBlock = compileDecisionJournalPrompt(decisions)
                    const allDecisions = await getRecentDecisions(foundryId, undefined, 50)
                    const patterns = detectDecisionPatterns(allDecisions)
                    let block = journalBlock
                    if (patterns.length > 0) {
                        block += `\n\n## Founder Decision Patterns\n${patterns.join('\n')}`
                    }
                    return { block, layer: 'Decision Journal' }
                })()
            )

            // Layer 4: External intelligence
            layerPromises.push(
                (async () => {
                    const reports = await getRecentIntelligenceReports(foundryId, 3, specialistId)
                    const block = compileIntelligencePrompt(reports, specialistId as SpecialistId)
                    return { block, layer: 'External Intelligence' }
                })()
            )

            // Layer 5: Knowledge Vault
            layerPromises.push(
                (async () => {
                    const block = await searchKnowledgeForSpecialist(
                        foundryId,
                        input || finalPrompt.slice(0, 500),
                        specialistId,
                        8
                    )
                    return { block: block ?? '', layer: 'Knowledge Vault' }
                })()
            )

            // Layer 6: Task ownership
            layerPromises.push(
                (async () => {
                    const { buildSpecialistTaskContext } = await import('./sweep-context')
                    const block = await buildSpecialistTaskContext(foundryId, specialistId)
                    return { block: block ?? '', layer: 'Task Ownership' }
                })()
            )

            // Layer 7: "Since we last talked" bridge
            if (threadId) {
                layerPromises.push(
                    (async () => {
                        const block = await buildSinceLastTalkedContext(foundryId, specialistId, threadId)
                        return { block, layer: 'Since Last Talked' }
                    })()
                )
            }

            // Layer 8: Specialist knowledge base (persistent facts from past conversations)
            layerPromises.push(
                (async () => {
                    const { getSpecialistKnowledge, compileKnowledgePrompt } = await import('./knowledge-base')
                    const entries = await getSpecialistKnowledge(foundryId, specialistId, { limit: 30 })
                    const specialist = getSpecialistById(specialistId)
                    const block = compileKnowledgePrompt(entries, specialist?.name ?? specialistId)
                    return { block, layer: 'Specialist Knowledge' }
                })()
            )

            // Layer 9: Engineering Reference Data (materials, tolerances, standards, supplier intel)
            if (isEngineeringRelevant(input, specialistId, cadLabProjectId)) {
                layerPromises.push(
                    (async () => {
                        const block = await buildEngineeringReferenceLayer(input, foundryId, cadLabProjectId)
                        return { block, layer: 'Engineering Reference Data' }
                    })()
                )
            }

            const results = await Promise.allSettled(layerPromises)
            for (const result of results) {
                if (result.status === 'fulfilled' && result.value.block) {
                    collectedLayers.push({
                        name: result.value.layer,
                        block: result.value.block,
                        tokens: estimateTokens(result.value.block),
                        priority: LAYER_PRIORITIES[result.value.layer] ?? 0,
                    })
                } else if (result.status === 'rejected') {
                    console.warn("[PromptBuilder] Context layer failed:", result.reason)
                }
            }
        }

        // Temporal awareness with milestone detection
        let foundryCreatedAt: string | null = null
        if (foundryId) {
            try {
                const supabase = await createClient()
                const { data: foundryData } = await supabase
                    .from("foundries")
                    .select("created_at")
                    .eq("id", foundryId)
                    .single()
                foundryCreatedAt = foundryData?.created_at ?? null
            } catch {
                // Non-critical
            }
        }
        const temporalBlock = compileTemporalPrompt(undefined, foundryCreatedAt)
        collectedLayers.push({
            name: 'Temporal Awareness',
            block: temporalBlock,
            tokens: estimateTokens(temporalBlock),
            priority: LAYER_PRIORITIES['Temporal Awareness'] ?? 0,
        })

        // Emotional awareness: detect founder's emotional state from their message
        const emotionalBlock = compileEmotionalPrompt(input)
        if (emotionalBlock) {
            collectedLayers.push({
                name: 'Emotional Awareness',
                block: emotionalBlock,
                tokens: estimateTokens(emotionalBlock),
                priority: LAYER_PRIORITIES['Emotional Awareness'] ?? 0,
            })
        }
    } else {
        // Fast path: lightweight temporal + emotional only (no DB queries)
        const temporalBlock = compileTemporalPrompt()
        collectedLayers.push({
            name: 'Temporal Awareness',
            block: temporalBlock,
            tokens: estimateTokens(temporalBlock),
            priority: LAYER_PRIORITIES['Temporal Awareness'] ?? 0,
        })

        const emotionalBlock = compileEmotionalPrompt(input)
        if (emotionalBlock) {
            collectedLayers.push({
                name: 'Emotional Awareness',
                block: emotionalBlock,
                tokens: estimateTokens(emotionalBlock),
                priority: LAYER_PRIORITIES['Emotional Awareness'] ?? 0,
            })
        }
    }

    // Apply token budget — highest-priority layers kept first
    const budgeted = applyTokenBudget(collectedLayers, modelTier)
    return {
        contextBlocks: budgeted.blocks,
        activeLayers: budgeted.activeLayers,
        contextTokensUsed: budgeted.tokensUsed,
        contextTokenBudget: budgeted.tokenBudget,
    }
}

// ─── "Since We Last Talked" Context Bridge ─────────────────────────────

/** Minimum gap (hours) before injecting "since we last talked" context */
const SINCE_LAST_TALKED_MIN_HOURS = 12

/**
 * Builds a "what changed since you last talked" context block.
 *
 * @description Queries for changes since the specialist's last interaction:
 * sweep insights, decisions made with other specialists, and task status
 * changes. Gives the specialist ammunition to reference real developments
 * instead of generic greetings.
 *
 * @param foundryId - The foundry ID
 * @param specialistId - The specialist ID
 * @param threadId - The memory thread ID (used to find last interaction time)
 * @returns Formatted markdown block, or empty string if nothing changed
 */
export async function buildSinceLastTalkedContext(
    foundryId: string,
    specialistId: string,
    threadId: string,
): Promise<string> {
    const admin = createAdminClient()

    // 1. Get last interaction time for this thread
    const { data: thread } = await admin
        .from('agent_memory_threads')
        .select('last_interaction_at')
        .eq('id', threadId)
        .single()

    const lastInteraction = thread?.last_interaction_at
    if (!lastInteraction) return ''

    const lastDate = new Date(lastInteraction)
    const hoursSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60)
    if (hoursSince < SINCE_LAST_TALKED_MIN_HOURS) return ''

    const sinceISO = lastDate.toISOString()
    const bullets: string[] = []

    // 2. Recent insights from this specialist's domain (sweep discoveries)
    const { data: recentInsights } = await admin
        .from('agent_insights')
        .select('title, urgency, specialist_id, created_at')
        .eq('foundry_id', foundryId)
        .eq('specialist_id', specialistId)
        .gt('created_at', sinceISO)
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false })
        .limit(3)

    if (recentInsights?.length) {
        for (const i of recentInsights) {
            const urgencyTag = i.urgency === 'critical' ? ' [CRITICAL]' : i.urgency === 'important' ? ' [important]' : ''
            bullets.push(`Your background analysis found:${urgencyTag} ${i.title}`)
        }
    }

    // 3. Decisions made with OTHER specialists since last chat
    const { data: crossDecisions } = await admin
        .from('specialist_decision_journal')
        .select('specialist_id, decision, created_at')
        .eq('foundry_id', foundryId)
        .neq('specialist_id', specialistId)
        .gt('created_at', sinceISO)
        .order('created_at', { ascending: false })
        .limit(3)

    if (crossDecisions?.length) {
        for (const d of crossDecisions) {
            const spec = SPECIALISTS.find(s => s.id === d.specialist_id)
            const specName = spec?.name ?? d.specialist_id
            bullets.push(`The founder decided (with ${specName}): ${d.decision.slice(0, 150)}`)
        }
    }

    // 4. Task status changes for tasks this specialist owns
    const { data: completedTasks } = await admin
        .from('tasks')
        .select('title, status')
        .eq('foundry_id', foundryId)
        .or(`created_by_agent_id.eq.${specialistId},owner_agent_id.eq.${specialistId}`)
        .in('status', ['Done', 'Completed'])
        .gt('updated_at', sinceISO)
        .is('deleted_at', null)
        .limit(3)

    if (completedTasks?.length) {
        for (const t of completedTasks) {
            bullets.push(`Task completed: "${t.title}"`)
        }
    }

    const { data: overdueTasks } = await admin
        .from('tasks')
        .select('title, end_date')
        .eq('foundry_id', foundryId)
        .or(`created_by_agent_id.eq.${specialistId},owner_agent_id.eq.${specialistId}`)
        .not('status', 'in', '("Done","Completed")')
        .lt('end_date', new Date().toISOString())
        .is('deleted_at', null)
        .limit(3)

    if (overdueTasks?.length) {
        for (const t of overdueTasks) {
            const daysOverdue = Math.floor((Date.now() - new Date(t.end_date!).getTime()) / (1000 * 60 * 60 * 24))
            bullets.push(`Task overdue (${daysOverdue}d): "${t.title}"`)
        }
    }

    if (bullets.length === 0) return ''

    const daysSince = Math.floor(hoursSince / 24)
    const timeLabel = daysSince >= 1 ? `${daysSince} day${daysSince === 1 ? '' : 's'}` : `${Math.floor(hoursSince)} hours`

    return [
        `## What Changed Since You Last Talked (${timeLabel} ago)`,
        'Reference these naturally in your opening — show you\'ve been paying attention even when they weren\'t here.',
        '',
        ...bullets.map(b => `- ${b}`),
    ].join('\n')
}

// ─── Cross-Specialist Intelligence ("Water Cooler") ────────────────────

/**
 * Builds context about what related specialists have recently said or discovered.
 *
 * @description Queries recent insights and decisions from specialists that have
 * defined relationships with the current specialist. This enables natural
 * cross-references in 1:1 conversations: "I know Finn flagged the burn rate..."
 *
 * @param foundryId - The foundry ID
 * @param specialistId - The current specialist ID
 * @returns Formatted context string, or empty string if no relevant activity
 */
export async function buildCrossSpecialistContext(
    foundryId: string,
    specialistId: string,
): Promise<string> {
    const specialist = getSpecialistById(specialistId)
    if (!specialist?.personality.relationships) return ''

    // Get IDs of specialists we have relationships with
    const relatedIds = Object.keys(specialist.personality.relationships)
    if (relatedIds.length === 0) return ''

    const admin = createAdminClient()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const lines: string[] = []

    // Recent insights from related specialists
    const { data: relatedInsights } = await admin
        .from('agent_insights')
        .select('specialist_id, title, urgency, insight_type')
        .eq('foundry_id', foundryId)
        .in('specialist_id', relatedIds)
        .gt('created_at', sevenDaysAgo)
        .eq('is_dismissed', false)
        .in('insight_type', ['recommendation', 'alert', 'observation'])
        .order('created_at', { ascending: false })
        .limit(5)

    if (relatedInsights?.length) {
        for (const insight of relatedInsights) {
            const spec = SPECIALISTS.find(s => s.id === insight.specialist_id)
            const name = spec?.name ?? insight.specialist_id
            lines.push(`${name} recently flagged: ${insight.title}`)
        }
    }

    // Recent decisions made with related specialists
    const { data: relatedDecisions } = await admin
        .from('specialist_decision_journal')
        .select('specialist_id, decision')
        .eq('foundry_id', foundryId)
        .in('specialist_id', relatedIds)
        .gt('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(3)

    if (relatedDecisions?.length) {
        for (const d of relatedDecisions) {
            const spec = SPECIALISTS.find(s => s.id === d.specialist_id)
            const name = spec?.name ?? d.specialist_id
            lines.push(`The founder decided (with ${name}): ${d.decision.slice(0, 120)}`)
        }
    }

    if (lines.length === 0) return ''

    return lines.slice(0, 5).join('\n')
}
