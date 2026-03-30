/**
 * @file memory-search.ts — Past advice search tool handler for all specialists.
 *
 * @description Implements query_past_advice which searches previous specialist
 * conversations and knowledge base for relevant historical advice. Enables
 * specialists to reference their own (or other specialists') past recommendations.
 *
 * @security All queries filter by foundry_id via thread context. Read-only.
 *
 * @related
 * - Agent memory: src/lib/agent-memory.ts
 * - Tool definitions: src/lib/agents/tools/definitions.ts
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { ToolHandler } from "./common"

// ─── query_past_advice ───────────────────────────────────────────

export const handleQueryPastAdvice: ToolHandler = async (args, ctx) => {
    const query = args.query as string
    const specialistFilter = args.specialist_id as string | undefined
    const days = Math.min((args.days as number) ?? 90, 365)
    const limit = Math.min((args.limit as number) ?? 10, 25)

    if (!query || typeof query !== "string") {
        return "Error: `query` parameter is required."
    }

    const supabase = createAdminClient()
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // Search assistant messages from agent_memory_messages
    // Join with threads to get foundry scope
    let messageQuery = supabase
        .from("agent_memory_messages")
        .select(`
            id, content, role, created_at,
            agent_memory_threads!inner(foundry_id, specialist_id)
        `)
        .eq("role", "assistant")
        .eq("agent_memory_threads.foundry_id", ctx.foundryId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(limit * 3) // Fetch more than limit to allow keyword filtering

    if (specialistFilter) {
        messageQuery = messageQuery.eq("agent_memory_threads.specialist_id", specialistFilter)
    }

    const { data: messages, error: msgErr } = await messageQuery

    if (msgErr) {
        return `Error searching past advice: ${msgErr.message}`
    }

    // Keyword filter: split query into words, match at least one
    const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    const matched = (messages ?? []).filter((m) => {
        const content = (m.content as string ?? "").toLowerCase()
        return keywords.some((kw) => content.includes(kw))
    }).slice(0, limit)

    // Also search specialist_knowledge_base for matching entries
    let kbResults: Array<{ key: string; value: string; specialist_id: string; updated_at: string }> = []
    try {
        const { data: kbData } = await supabase
            .from("specialist_knowledge_base")
            .select("key, value, specialist_id, updated_at")
            .eq("foundry_id", ctx.foundryId)
            .limit(50)

        if (kbData) {
            kbResults = kbData.filter((entry) => {
                const text = `${entry.key} ${entry.value}`.toLowerCase()
                return keywords.some((kw) => text.includes(kw))
            }).slice(0, 5)
        }
    } catch {
        // specialist_knowledge_base may not exist yet — non-fatal
    }

    // INTENT: Semantic search over the Knowledge Vault (pgvector embeddings).
    // This finds conceptually related notes even when keywords don't match.
    let vaultResults: Array<{ title: string; content: string; note_type: string; source_specialist: string | null; similarity: number }> = []
    try {
        const { embedText } = await import("@/lib/search/semantic-search")
        const embedding = await embedText(query)
        if (embedding) {
            const { data: vaultData } = await supabase.rpc("match_knowledge_notes", {
                query_embedding: JSON.stringify(embedding),
                p_foundry_id: ctx.foundryId,
                match_threshold: 0.35,
                match_count: 10,
            })
            if (vaultData) {
                vaultResults = (vaultData as Array<{ title: string; content: string; note_type: string; source_specialist: string | null; similarity: number }>)
                    .slice(0, 8)
            }
        }
    } catch {
        // Semantic search unavailable — fall through to keyword results
    }

    if (matched.length === 0 && kbResults.length === 0 && vaultResults.length === 0) {
        return `No past advice found matching "${query}" in the last ${days} days.`
    }

    let md = `## Past Advice: "${query}"\n\n`

    // Knowledge Vault results first (highest quality — semantically matched)
    if (vaultResults.length > 0) {
        md += `### Knowledge Vault (${vaultResults.length} semantic matches)\n\n`
        for (const v of vaultResults) {
            const source = v.source_specialist ? ` (via ${v.source_specialist})` : ""
            md += `**${v.title}**${source} [${v.note_type}] (${Math.round(v.similarity * 100)}% match):\n> ${v.content.slice(0, 400)}${v.content.length > 400 ? "…" : ""}\n\n`
        }
    }

    if (matched.length > 0) {
        md += `### Previous Conversations (${matched.length} results)\n\n`
        for (const m of matched) {
            const thread = m.agent_memory_threads as unknown as { specialist_id: string }
            const date = new Date(m.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            })
            const specId = thread?.specialist_id ?? "unknown"
            const excerpt = (m.content as string ?? "").slice(0, 500)
            md += `**${specId}** (${date}):\n> ${excerpt}${(m.content as string ?? "").length > 500 ? "…" : ""}\n\n`
        }
    }

    if (kbResults.length > 0) {
        md += `### Knowledge Base Entries\n\n`
        for (const entry of kbResults) {
            md += `- **${entry.key}** (${entry.specialist_id}): ${entry.value.slice(0, 300)}${entry.value.length > 300 ? "…" : ""}\n`
        }
    }

    return md
}
