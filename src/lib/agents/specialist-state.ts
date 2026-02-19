/**
 * @file specialist-state.ts
 *
 * @description Tracks emotional state and relationship depth between
 * specialists and the founder. This makes specialists feel alive --
 * they remember how past conversations went, they deepen their
 * relationship over time, and they reference shared history.
 *
 * @audit 2026-02-19 (refactor step 4 of 8): Added Zod schema for thread metadata.
 *        The metadata column is JSONB in Supabase — previously accessed via unsafe
 *        `as unknown as Record<string, unknown>` casts. Now validated through
 *        `parseSpecialistMetadata()` which provides typed access with safe defaults.
 *        This prevents runtime crashes if metadata is corrupt, missing, or has
 *        an unexpected shape.
 *
 * @related
 * - Founder preferences: src/lib/agents/founder-preferences.ts
 * - Personality: src/lib/agents/personality.ts
 * - Execute route: src/app/api/agents/execute/route.ts
 */

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import type { Json } from '@/types/database.types'

// ─── Types ──────────────────────────────────────────────────────────

export type SpecialistMood = 'energized' | 'concerned' | 'proud' | 'thoughtful' | 'neutral'

export interface SpecialistEmotionalState {
    /** Current emotional state of the specialist */
    mood: SpecialistMood
    /** What triggered this mood */
    trigger: string
    /** When this state was last updated */
    updatedAt: string
}

export interface RelationshipDepth {
    /** Trust level based on interaction count */
    level: 'new' | 'building' | 'established' | 'deep'
    /** Total conversation count */
    conversationCount: number
    /** Key topics discussed (for "remember when" references) */
    sharedHistory: string[]
    /** Decisions the user made with this specialist's input */
    decisionsMade: string[]
    /** Last conversation summary */
    lastConversationSummary: string | null
}

// ─── Zod Schema for Thread Metadata ─────────────────────────────────
//
// The agent_memory_threads.metadata column is JSONB. This schema defines
// the expected shape for specialist threads. Using .catch() on every field
// means invalid/missing data falls back to defaults instead of throwing —
// critical because metadata may have been written by older code versions
// with a different shape.

const specialistMetadataSchema = z.object({
    specialist_mood: z.enum(['energized', 'concerned', 'proud', 'thoughtful', 'neutral']).catch('neutral'),
    mood_trigger: z.string().catch(''),
    mood_updated_at: z.string().catch(() => new Date().toISOString()),
    shared_history: z.array(z.string()).catch([]),
    decisions_made: z.array(z.string()).catch([]),
    last_conversation_summary: z.string().nullable().catch(null),
})

/**
 * The validated shape of specialist thread metadata.
 * Inferred from the Zod schema so there's a single source of truth.
 */
export type SpecialistMetadata = z.infer<typeof specialistMetadataSchema>

/**
 * Safely parses raw JSONB metadata into a typed SpecialistMetadata object.
 *
 * @description Uses Zod's `.catch()` on every field so corrupt, missing, or
 * unexpectedly-shaped metadata always produces a valid object with defaults.
 * This replaces the previous `as unknown as Record<string, unknown>` casts
 * which would crash on null/undefined/wrong-type access.
 *
 * @param raw - The raw JSONB value from Supabase (could be null, object, or anything)
 * @returns A fully typed SpecialistMetadata with defaults for any missing fields
 */
export function parseSpecialistMetadata(raw: unknown): SpecialistMetadata {
    if (!raw || typeof raw !== 'object') {
        return specialistMetadataSchema.parse({})
    }
    return specialistMetadataSchema.parse(raw)
}

// ─── State Management ───────────────────────────────────────────────

/**
 * Gets the emotional state and relationship depth for a specialist-user pair.
 *
 * @description Reads from the agent_memory_threads metadata to reconstruct
 * the specialist's emotional state and relationship depth with the founder.
 * Falls back to sensible defaults if no state exists yet.
 *
 * @param threadId - The memory thread ID
 * @param foundryId - The foundry ID
 * @returns Emotional state and relationship depth
 */
export async function getSpecialistState(
    threadId: string,
    foundryId: string,
): Promise<{ emotional: SpecialistEmotionalState; relationship: RelationshipDepth }> {
    const supabase = await createClient()

    const { data: thread } = await supabase
        .from('agent_memory_threads')
        .select('metadata, total_interactions')
        .eq('id', threadId)
        .eq('foundry_id', foundryId)
        .single()

    const metadata = parseSpecialistMetadata(thread?.metadata)
    const interactionCount = thread?.total_interactions ?? 0

    const emotional: SpecialistEmotionalState = {
        mood: metadata.specialist_mood,
        trigger: metadata.mood_trigger,
        updatedAt: metadata.mood_updated_at,
    }

    const level = interactionCount < 3 ? 'new'
        : interactionCount < 8 ? 'building'
        : interactionCount < 20 ? 'established'
        : 'deep'

    const relationship: RelationshipDepth = {
        level,
        conversationCount: interactionCount,
        sharedHistory: metadata.shared_history,
        decisionsMade: metadata.decisions_made,
        lastConversationSummary: metadata.last_conversation_summary,
    }

    return { emotional, relationship }
}

/**
 * Updates the specialist's emotional state after a conversation.
 *
 * @description Persists the specialist's mood and trigger to the thread
 * metadata so it carries across conversations. Also updates the last
 * conversation summary for continuity references.
 *
 * @param threadId - The memory thread ID
 * @param foundryId - The foundry ID
 * @param mood - The new mood
 * @param trigger - What caused this mood
 * @param conversationSummary - Brief summary of the conversation
 */
export async function updateSpecialistState(
    threadId: string,
    foundryId: string,
    mood: SpecialistMood,
    trigger: string,
    conversationSummary?: string,
): Promise<void> {
    const supabase = await createClient()

    const { data: existing } = await supabase
        .from('agent_memory_threads')
        .select('metadata')
        .eq('id', threadId)
        .eq('foundry_id', foundryId)
        .single()

    const parsed = parseSpecialistMetadata(existing?.metadata)

    const updatedMetadata: SpecialistMetadata = {
        ...parsed,
        specialist_mood: mood,
        mood_trigger: trigger,
        mood_updated_at: new Date().toISOString(),
        ...(conversationSummary ? { last_conversation_summary: conversationSummary } : {}),
    }

    await supabase
        .from('agent_memory_threads')
        .update({ metadata: updatedMetadata as unknown as Json })
        .eq('id', threadId)
        .eq('foundry_id', foundryId)
}

/**
 * Records a key decision or shared history moment.
 *
 * @description Appends to the running list of shared moments between
 * a specialist and the founder. These are referenced in prompts to
 * create continuity ("remember when we decided to...").
 *
 * @param threadId - The memory thread ID
 * @param foundryId - The foundry ID
 * @param type - 'decision' or 'history'
 * @param entry - The entry to record
 */
export async function recordSharedMoment(
    threadId: string,
    foundryId: string,
    type: 'decision' | 'history',
    entry: string,
): Promise<void> {
    const supabase = await createClient()

    const { data: existing } = await supabase
        .from('agent_memory_threads')
        .select('metadata')
        .eq('id', threadId)
        .eq('foundry_id', foundryId)
        .single()

    const parsed = parseSpecialistMetadata(existing?.metadata)

    const key = type === 'decision' ? 'decisions_made' : 'shared_history'
    const entries = [...parsed[key], entry]
    // Keep last 20 entries to avoid unbounded growth
    if (entries.length > 20) entries.shift()

    const updatedMetadata: SpecialistMetadata = {
        ...parsed,
        [key]: entries,
    }

    await supabase
        .from('agent_memory_threads')
        .update({ metadata: updatedMetadata as unknown as Json })
        .eq('id', threadId)
        .eq('foundry_id', foundryId)
}

/**
 * Compiles specialist state into a prompt block for injection.
 *
 * @description Translates the specialist's emotional state and
 * relationship depth into natural-language guidance that shapes
 * how the specialist interacts with the founder. Deeper relationships
 * unlock more candid, shorthand communication.
 *
 * @param emotional - Current emotional state
 * @param relationship - Relationship depth data
 * @param specialistName - The specialist's first name
 * @returns Formatted prompt block
 */
export function compileSpecialistStatePrompt(
    emotional: SpecialistEmotionalState,
    relationship: RelationshipDepth,
    specialistName: string,
): string {
    const lines: string[] = ['## Your Relationship With This Founder']

    // Relationship depth guidance — unlocks progressively more candid behavior
    const depthGuidance: Record<string, string> = {
        new: `This is a new relationship (${relationship.conversationCount} conversations). Be welcoming but professional. Explain your reasoning. Ask clarifying questions. Build trust through competence.`,
        building: `You're building a relationship (${relationship.conversationCount} conversations). You can be more direct. Reference past conversations when relevant. Show that you remember what matters to them.`,
        established: `You have an established relationship (${relationship.conversationCount} conversations). Be candid and direct. Challenge assumptions when needed. Use shorthand — they know your style. Reference shared history.`,
        deep: `You have a deep relationship (${relationship.conversationCount} conversations). Be fully candid — push back hard when you disagree. Use "remember when..." references. Anticipate their thinking. You know this person well.`,
    }

    lines.push(depthGuidance[relationship.level])

    // Shared history — gives the specialist concrete moments to reference
    if (relationship.sharedHistory.length > 0) {
        lines.push('')
        lines.push('Key moments you share with this founder (reference naturally):')
        for (const moment of relationship.sharedHistory.slice(-5)) {
            lines.push(`- ${moment}`)
        }
    }

    // Decisions made together — reinforces the advisory relationship
    if (relationship.decisionsMade.length > 0) {
        lines.push('')
        lines.push('Decisions you helped this founder make (reference when relevant):')
        for (const decision of relationship.decisionsMade.slice(-5)) {
            lines.push(`- ${decision}`)
        }
    }

    // Last conversation context — enables continuity openers
    if (relationship.lastConversationSummary) {
        lines.push('')
        lines.push(`Last time you spoke: ${relationship.lastConversationSummary}`)
        lines.push(`Consider opening with a reference to this: "Last time we talked about..." or "I've been thinking about what you said about..."`)
    }

    // Emotional state — shapes the specialist's tone for this conversation
    if (emotional.mood !== 'neutral') {
        lines.push('')
        const moodGuidance: Record<SpecialistMood, string> = {
            energized: `You're feeling energized about this founder's progress. Let that positive energy show — be enthusiastic and forward-looking.`,
            concerned: `You have some concerns about ${emotional.trigger}. Bring this up diplomatically but don't ignore it.`,
            proud: `You're proud of what this founder has accomplished recently. Acknowledge it genuinely.`,
            thoughtful: `You've been thinking deeply about ${emotional.trigger}. Share your reflections.`,
            neutral: '',
        }
        lines.push(moodGuidance[emotional.mood])
    }

    return lines.join('\n')
}
