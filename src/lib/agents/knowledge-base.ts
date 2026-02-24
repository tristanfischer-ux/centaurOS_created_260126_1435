/**
 * @file knowledge-base.ts — CRUD operations for specialist knowledge base.
 *
 * @description Provides functions to read, write, and query the specialist
 * knowledge base — persistent facts extracted from conversations.
 *
 * @security All operations filter by foundry_id.
 */

import { createAdminClient } from "@/lib/supabase/admin"

export type KnowledgeType = "fact" | "preference" | "decision" | "metric" | "relationship" | "goal"

export interface KnowledgeEntry {
    id: string
    specialistId: string
    knowledgeType: KnowledgeType
    key: string
    value: string
    confidence: number
    source: string | null
    lastUpdatedAt: string
}

/**
 * Get all knowledge entries for a specialist in a foundry.
 *
 * @param foundryId - The foundry ID to scope the query
 * @param specialistId - The specialist ID to fetch knowledge for
 * @param options - Optional filters: knowledge type and result limit
 * @returns Array of knowledge entries, newest first
 */
export async function getSpecialistKnowledge(
    foundryId: string,
    specialistId: string,
    options?: { type?: KnowledgeType; limit?: number }
): Promise<KnowledgeEntry[]> {
    const supabase = createAdminClient()
    let query = supabase
        .from("specialist_knowledge_base")
        .select("id, specialist_id, knowledge_type, key, value, confidence, source, last_updated_at")
        .eq("foundry_id", foundryId)
        .eq("specialist_id", specialistId)
        .order("last_updated_at", { ascending: false })
        .limit(options?.limit ?? 50)

    if (options?.type) {
        query = query.eq("knowledge_type", options.type)
    }

    const { data, error } = await query
    if (error) {
        console.error("[KnowledgeBase] Query failed:", error.message)
        return []
    }

    return (data ?? []).map((d) => ({
        id: d.id,
        specialistId: d.specialist_id,
        knowledgeType: d.knowledge_type as KnowledgeType,
        key: d.key,
        value: d.value,
        confidence: d.confidence,
        source: d.source,
        lastUpdatedAt: d.last_updated_at,
    }))
}

/**
 * Upsert a knowledge entry (insert or update if key already exists).
 *
 * @param foundryId - The foundry ID
 * @param specialistId - The specialist ID
 * @param entry - The knowledge entry to upsert
 */
export async function upsertKnowledge(
    foundryId: string,
    specialistId: string,
    entry: {
        knowledgeType: KnowledgeType
        key: string
        value: string
        confidence?: number
        source?: string
        sourceThreadId?: string
    }
): Promise<void> {
    const supabase = createAdminClient()
    const { error } = await supabase
        .from("specialist_knowledge_base")
        .upsert(
            {
                foundry_id: foundryId,
                specialist_id: specialistId,
                knowledge_type: entry.knowledgeType,
                key: entry.key,
                value: entry.value,
                confidence: entry.confidence ?? 0.8,
                source: entry.source ?? "conversation",
                source_thread_id: entry.sourceThreadId ?? null,
                last_updated_at: new Date().toISOString(),
            },
            { onConflict: "foundry_id,specialist_id,key" }
        )

    if (error) {
        console.error("[KnowledgeBase] Upsert failed:", error.message)
    }
}

/**
 * Format knowledge entries as a system prompt context block.
 *
 * @param entries - The knowledge entries to compile
 * @param specialistName - The specialist's display name (for heading context)
 * @returns Formatted markdown block, or empty string if no entries
 */
export function compileKnowledgePrompt(entries: KnowledgeEntry[], specialistName: string): string {
    if (entries.length === 0) return ""

    const grouped: Record<string, KnowledgeEntry[]> = {}
    for (const e of entries) {
        if (!grouped[e.knowledgeType]) grouped[e.knowledgeType] = []
        grouped[e.knowledgeType]!.push(e)
    }

    let md = `## What You Know About This Company\n\n`
    md += `These are facts you've learned from previous conversations. Reference them naturally — don't list them.\n\n`

    const typeLabels: Record<KnowledgeType, string> = {
        fact: "Company Facts",
        preference: "Founder Preferences",
        decision: "Past Decisions",
        metric: "Key Metrics",
        relationship: "Relationships",
        goal: "Goals & Priorities",
    }

    for (const [type, label] of Object.entries(typeLabels)) {
        const items = grouped[type]
        if (!items?.length) continue
        md += `### ${label}\n`
        for (const item of items) {
            const conf = item.confidence >= 0.9 ? "" : item.confidence >= 0.7 ? " (likely)" : " (uncertain)"
            md += `- **${item.key}**: ${item.value}${conf}\n`
        }
        md += "\n"
    }

    return md
}
