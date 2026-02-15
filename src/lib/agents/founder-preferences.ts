/**
 * @file founder-preferences.ts
 *
 * @description Manages the founder's communication preference profile.
 * This profile accumulates over time as the memory observer detects
 * preference signals from conversations (e.g., "make it shorter",
 * "just tell me what to do", frustration with hedging).
 *
 * The profile is injected into every specialist prompt as a
 * "## Working With This Founder" section, enabling all specialists
 * to adapt their output style to what the founder actually wants.
 *
 * Trust levels:
 * - building (0-3 interactions): More explanation, more questions, deferential
 * - established (4-10): More direct, skip repeated explanations, reference past work
 * - deep (10+): Candid challenges, shorthand, "remember when we tried X?"
 *
 * @security All operations require foundry membership via RLS.
 *
 * @related
 * - Migration: supabase/migrations/20260215000000_founder_preferences.sql
 * - Execute route: src/app/api/agents/execute/route.ts
 * - Observer: src/lib/agent-memory/observer.ts
 */

import { createClient } from "@/lib/supabase/server"

// Type assertion helper — the founder_preferences table and new agent_memory_threads
// columns may not be in the generated Supabase types until types are regenerated
// after migration. These helpers provide type-safe wrappers around raw queries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FounderPreferences {
    /** Preferred response length */
    preferredLength: "brief" | "balanced" | "detailed"
    /** Preferred output format */
    formatPreference: "bullets" | "prose" | "tables" | "mixed"
    /** Preferred communication tone */
    tonePreference: "casual" | "conversational" | "professional"
    /** How fast the founder makes decisions */
    decisionSpeed: "fast" | "balanced" | "deliberate"
    /** Whether the founder wants data-backed recommendations */
    prefersData: boolean
    /** Whether the founder wants a single recommendation vs options */
    prefersRecommendation: boolean
    /** Terms and phrases the founder uses (specialists should mirror) */
    vocabulary: string[]
    /** Things that frustrate the founder (learned from corrections) */
    petPeeves: string[]
    /** What the founder values most (learned from emphasis patterns) */
    valuesSignals: string[]
    /** Total interactions across all specialists */
    totalInteractions: number
}

export interface SpecialistRelationshipMeta {
    /** Trust level with this specific specialist */
    trustLevel: "building" | "established" | "deep"
    /** Total interactions with this specialist */
    totalInteractions: number
    /** Last interaction timestamp */
    lastInteractionAt: string | null
}

// ─── Default Preferences ────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: FounderPreferences = {
    preferredLength: "balanced",
    formatPreference: "mixed",
    tonePreference: "conversational",
    decisionSpeed: "balanced",
    prefersData: true,
    prefersRecommendation: true,
    vocabulary: [],
    petPeeves: [],
    valuesSignals: [],
    totalInteractions: 0,
}

// ─── Fetch Preferences ──────────────────────────────────────────────────────

/**
 * Fetches the founder's preference profile for a given foundry.
 * Returns defaults if no profile exists yet.
 *
 * @param foundryId - The foundry ID
 * @returns Founder preferences (defaults if not yet created)
 */
export async function getFounderPreferences(
    foundryId: string,
): Promise<FounderPreferences> {
    try {
        const supabase: AnySupabaseClient = await createClient()
        const { data } = await supabase
            .from("founder_preferences")
            .select("*")
            .eq("foundry_id", foundryId)
            .maybeSingle()

        if (!data) return DEFAULT_PREFERENCES

        return {
            preferredLength: (data.preferred_length as FounderPreferences["preferredLength"]) ?? "balanced",
            formatPreference: (data.format_preference as FounderPreferences["formatPreference"]) ?? "mixed",
            tonePreference: (data.tone_preference as FounderPreferences["tonePreference"]) ?? "conversational",
            decisionSpeed: (data.decision_speed as FounderPreferences["decisionSpeed"]) ?? "balanced",
            prefersData: (data.prefers_data as boolean) ?? true,
            prefersRecommendation: (data.prefers_recommendation as boolean) ?? true,
            vocabulary: (data.vocabulary as string[]) ?? [],
            petPeeves: (data.pet_peeves as string[]) ?? [],
            valuesSignals: (data.values_signals as string[]) ?? [],
            totalInteractions: (data.total_interactions as number) ?? 0,
        }
    } catch (err) {
        console.warn("[founder-preferences] Failed to fetch:", {
            error: err instanceof Error ? err.message : "Unknown",
        })
        return DEFAULT_PREFERENCES
    }
}

/**
 * Fetches the specialist-specific relationship metadata from the memory thread.
 *
 * @param threadId - The specialist's memory thread ID
 * @param foundryId - The foundry ID
 * @returns Relationship metadata (trust level, interaction count)
 */
export async function getSpecialistRelationship(
    threadId: string,
    foundryId: string,
): Promise<SpecialistRelationshipMeta> {
    try {
        const supabase: AnySupabaseClient = await createClient()
        const { data } = await supabase
            .from("agent_memory_threads")
            .select("trust_level, total_interactions, last_interaction_at")
            .eq("id", threadId)
            .eq("foundry_id", foundryId)
            .maybeSingle()

        return {
            trustLevel: (data?.trust_level as SpecialistRelationshipMeta["trustLevel"]) ?? "building",
            totalInteractions: (data?.total_interactions as number) ?? 0,
            lastInteractionAt: (data?.last_interaction_at as string) ?? null,
        }
    } catch {
        return { trustLevel: "building", totalInteractions: 0, lastInteractionAt: null }
    }
}

/**
 * Increments the interaction counter on a specialist's memory thread
 * and updates the trust level based on total interactions.
 *
 * @param threadId - The specialist's memory thread ID
 * @param foundryId - The foundry ID
 */
export async function recordInteraction(
    threadId: string,
    foundryId: string,
): Promise<void> {
    try {
        const supabase: AnySupabaseClient = await createClient()

        // Get current count
        const { data: thread } = await supabase
            .from("agent_memory_threads")
            .select("total_interactions")
            .eq("id", threadId)
            .eq("foundry_id", foundryId)
            .maybeSingle()

        const currentCount = (thread?.total_interactions as number) ?? 0
        const newCount = currentCount + 1

        // Calculate trust level based on interaction count
        let trustLevel: "building" | "established" | "deep" = "building"
        if (newCount >= 10) trustLevel = "deep"
        else if (newCount >= 4) trustLevel = "established"

        await supabase
            .from("agent_memory_threads")
            .update({
                total_interactions: newCount,
                trust_level: trustLevel,
                last_interaction_at: new Date().toISOString(),
            })
            .eq("id", threadId)
            .eq("foundry_id", foundryId)

        // Also increment the global foundry preferences counter
        const { data: prefs } = await supabase
            .from("founder_preferences")
            .select("id, total_interactions")
            .eq("foundry_id", foundryId)
            .maybeSingle()

        if (prefs) {
            await supabase
                .from("founder_preferences")
                .update({
                    total_interactions: ((prefs.total_interactions as number) ?? 0) + 1,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", prefs.id as string)
        } else {
            // Create preferences row if it doesn't exist yet
            await supabase
                .from("founder_preferences")
                .insert({
                    foundry_id: foundryId,
                    total_interactions: 1,
                })
        }
    } catch (err) {
        console.warn("[founder-preferences] Failed to record interaction:", {
            error: err instanceof Error ? err.message : "Unknown",
        })
    }
}

// ─── Prompt Compilation ─────────────────────────────────────────────────────

/**
 * Compiles the founder's preferences and trust level into a prompt block.
 *
 * @description Generates a "Working With This Founder" section that tells
 * the specialist how to communicate with this specific founder. Includes
 * both general preferences AND the trust level with this specific specialist.
 *
 * @param preferences - The founder's communication preferences
 * @param relationship - The specialist-specific relationship metadata
 * @param specialistName - The specialist's name (for trust level context)
 * @returns Compiled prompt block string
 */
export function compileFounderPreferencesPrompt(
    preferences: FounderPreferences,
    relationship: SpecialistRelationshipMeta,
    specialistName: string,
): string {
    if (preferences.totalInteractions === 0 && relationship.totalInteractions === 0) {
        return "" // No preferences learned yet
    }

    const lines: string[] = []

    // Communication style
    const lengthGuide: Record<string, string> = {
        brief: "This founder prefers concise responses. Get to the point fast. Skip the context-setting unless they ask for it.",
        balanced: "This founder likes a balance of depth and brevity. Lead with the key insight, then provide supporting detail.",
        detailed: "This founder values thorough analysis. Don't skip the reasoning — they want to understand the 'why' behind recommendations.",
    }
    lines.push(lengthGuide[preferences.preferredLength])

    const formatGuide: Record<string, string> = {
        bullets: "Format with bullet points — this founder reads faster in lists.",
        prose: "Write in flowing paragraphs — this founder prefers narrative over lists.",
        tables: "Use tables when comparing — this founder is data-visual.",
        mixed: "Mix formats as appropriate for the content.",
    }
    lines.push(formatGuide[preferences.formatPreference])

    // Decision-making style
    if (preferences.decisionSpeed === "fast") {
        lines.push("This founder decides fast. Give them the recommendation and let them go. Don't over-explain.")
    } else if (preferences.decisionSpeed === "deliberate") {
        lines.push("This founder likes to think through decisions. Present options with pros/cons. Don't rush them.")
    }

    if (preferences.prefersRecommendation && !preferences.prefersData) {
        lines.push("This founder wants YOUR recommendation, not a menu of options. Be opinionated.")
    } else if (preferences.prefersData && !preferences.prefersRecommendation) {
        lines.push("This founder wants data and options so they can decide themselves.")
    }

    // Learned vocabulary
    if (preferences.vocabulary.length > 0) {
        lines.push(`This founder uses these terms: ${preferences.vocabulary.slice(0, 5).join(", ")}. Mirror their language naturally.`)
    }

    // Pet peeves
    if (preferences.petPeeves.length > 0) {
        lines.push(`AVOID these — the founder finds them frustrating: ${preferences.petPeeves.slice(0, 3).join("; ")}`)
    }

    // Values
    if (preferences.valuesSignals.length > 0) {
        lines.push(`This founder values: ${preferences.valuesSignals.slice(0, 3).join(", ")}. Emphasize these when relevant.`)
    }

    // Trust level (specialist-specific)
    const trustGuide: Record<string, string> = {
        building: `You and ${specialistName.split(",")[0]} are still getting to know each other (${relationship.totalInteractions} conversations). Provide more context and explanation. Ask clarifying questions when needed. Be thorough but not presumptuous.`,
        established: `You have an established working relationship with ${specialistName.split(",")[0]} (${relationship.totalInteractions} conversations). You can be more direct, skip explanations you've given before, and reference past discussions. The founder trusts your judgment in your domain.`,
        deep: `You have a deep working relationship with ${specialistName.split(",")[0]} (${relationship.totalInteractions} conversations). Be candid and direct. Use shorthand. Challenge the founder when you disagree — they expect it. Reference your shared history: "Remember when we discussed X? This is similar."`,
    }
    lines.push(trustGuide[relationship.trustLevel])

    // Last interaction context
    if (relationship.lastInteractionAt) {
        const lastDate = new Date(relationship.lastInteractionAt)
        const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
        if (daysSince > 7) {
            lines.push(`It's been ${daysSince} days since your last conversation. Acknowledge the gap naturally if relevant.`)
        }
    }

    return `## Working With This Founder\n${lines.map(l => `- ${l}`).join("\n")}`
}
