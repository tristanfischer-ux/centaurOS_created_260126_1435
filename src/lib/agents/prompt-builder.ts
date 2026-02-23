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
 *   8. Temporal awareness (time/day, milestone proximity)
 *   9. Emotional awareness (detecting the founder's emotional state from their message)
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
 * @returns A string of context blocks, each separated by double newlines
 */
export async function buildContextLayers(params: ContextLayerParams): Promise<string> {
    const { foundryId, specialistId, threadId, input, finalPrompt, isConversationalFastPath } = params
    let contextBlocks = ""

    if (!isConversationalFastPath) {
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
                    contextBlocks += `\n\n${prefsBlock}`
                }
            } catch (err) {
                console.warn("[PromptBuilder] Could not load founder preferences:", err)
            }
        }

        // Specialist emotional state and relationship depth
        if (foundryId && threadId && specialistId) {
            try {
                const specialist = getSpecialistById(specialistId)
                const { emotional, relationship } = await getSpecialistState(threadId, foundryId)
                const stateBlock = compileSpecialistStatePrompt(emotional, relationship, specialist?.name ?? specialistId)
                if (stateBlock) {
                    contextBlocks += `\n\n${stateBlock}`
                }
            } catch (err) {
                console.warn("[PromptBuilder] Could not load specialist state:", err)
            }
        }

        // Decision journal: past decisions for "remember when" references
        if (foundryId && specialistId) {
            try {
                const decisions = await getRecentDecisions(foundryId, specialistId, 10)
                const journalBlock = compileDecisionJournalPrompt(decisions)
                if (journalBlock) {
                    contextBlocks += `\n\n${journalBlock}`
                }
                const allDecisions = await getRecentDecisions(foundryId, undefined, 50)
                const patterns = detectDecisionPatterns(allDecisions)
                if (patterns.length > 0) {
                    contextBlocks += `\n\n## Founder Decision Patterns\n${patterns.join('\n')}`
                }
            } catch (err) {
                console.warn("[PromptBuilder] Could not load decision journal:", err)
            }
        }

        // External intelligence: recent reports from monitoring sweeps
        if (foundryId && specialistId) {
            try {
                const reports = await getRecentIntelligenceReports(foundryId, 3, specialistId)
                const intelligenceBlock = compileIntelligencePrompt(reports, specialistId as SpecialistId)
                if (intelligenceBlock) {
                    contextBlocks += `\n\n${intelligenceBlock}`
                }
            } catch (err) {
                console.warn("[PromptBuilder] Failed to load intelligence context:", err)
            }
        }

        // Knowledge Vault: inject relevant organizational knowledge
        if (foundryId && specialistId) {
            try {
                const vaultContext = await searchKnowledgeForSpecialist(
                    foundryId,
                    input || finalPrompt.slice(0, 500),
                    specialistId,
                    8
                )
                if (vaultContext) {
                    contextBlocks += `\n\n${vaultContext}`
                }
            } catch (err) {
                console.warn("[PromptBuilder] Could not load Knowledge Vault context:", err)
            }
        }

        // Task ownership context: tasks this specialist created or owns
        if (foundryId && specialistId) {
            try {
                const { buildSpecialistTaskContext } = await import('./sweep-context')
                const taskBlock = await buildSpecialistTaskContext(foundryId, specialistId)
                if (taskBlock) {
                    contextBlocks += `\n\n${taskBlock}`
                }
            } catch (err) {
                console.warn("[PromptBuilder] Could not load task context:", err)
            }
        }

        // "Since we last talked" bridge: what changed since last conversation
        if (foundryId && specialistId && threadId) {
            try {
                const sinceBlock = await buildSinceLastTalkedContext(foundryId, specialistId, threadId)
                if (sinceBlock) {
                    contextBlocks += `\n\n${sinceBlock}`
                }
            } catch (err) {
                console.warn("[PromptBuilder] Could not build 'since last talked' context:", err)
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
        contextBlocks += `\n\n${temporalBlock}`

        // Emotional awareness: detect founder's emotional state from their message
        const emotionalBlock = compileEmotionalPrompt(input)
        if (emotionalBlock) {
            contextBlocks += `\n\n${emotionalBlock}`
        }
    } else {
        // Fast path: lightweight temporal + emotional only (no DB queries)
        const temporalBlock = compileTemporalPrompt()
        contextBlocks += `\n\n${temporalBlock}`

        const emotionalBlock = compileEmotionalPrompt(input)
        if (emotionalBlock) {
            contextBlocks += `\n\n${emotionalBlock}`
        }
    }

    return contextBlocks
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
