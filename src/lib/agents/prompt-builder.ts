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
 *   6. Temporal awareness (time/day, milestone proximity)
 *   7. Emotional awareness (detecting the founder's emotional state from their message)
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
