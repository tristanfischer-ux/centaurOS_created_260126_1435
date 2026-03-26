/**
 * @file handoff-context.ts — Deep cross-specialist handoff context builder.
 *
 * @description When specialist A hands off to specialist B, this module builds
 * a rich context block containing A's full conversation transcript, recent
 * artifacts, and key decisions. This gives B enough context to continue the
 * conversation seamlessly, rather than relying on a brief summary.
 *
 * Each database query is independently failable — if any source is unavailable,
 * the remaining context is still included.
 *
 * @related
 * - src/actions/agent-handoffs.ts — Persists handoff records
 * - src/lib/agents/prompt-builder.ts — Consumes this as an optional layer
 * - src/app/api/agents/execute/route.ts — Passes handoff params to prompt builder
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { getSpecialistById } from "@/lib/agents/specialists-config"

/**
 * Builds a deep handoff context block from a source specialist's recent activity.
 *
 * @description Queries the source specialist's recent conversation messages,
 * artifacts produced, and decisions recorded. Formats them into a structured
 * markdown block that the receiving specialist can use for seamless continuity.
 *
 * @param foundryId - The foundry ID for scoping queries
 * @param sourceSpecialistId - The specialist handing off (source)
 * @param sourceThreadId - The memory thread ID of the source conversation
 * @returns Formatted handoff context string, or empty string if no data found
 */
export async function buildHandoffContext(
    foundryId: string,
    sourceSpecialistId: string,
    sourceThreadId: string,
): Promise<string> {
    const admin = createAdminClient()
    const sourceSpecialist = getSpecialistById(sourceSpecialistId)
    const sourceName = sourceSpecialist?.name ?? sourceSpecialistId

    // ─── 1. Recent conversation messages ────────────────────────────────
    let messages: Array<{ role: string; content: string; created_at: string }> = []
    try {
        const { data } = await admin
            .from("agent_memory_messages")
            .select("role, content, created_at")
            .eq("thread_id", sourceThreadId)
            .order("created_at", { ascending: false })
            .limit(20)

        if (data && data.length > 0) {
            // Reverse for chronological order (queried DESC for recency limit)
            messages = data.reverse()
        }
    } catch (err) {
        console.warn("[HandoffContext] Failed to load conversation messages:", err)
    }

    // If no messages found, there's no meaningful handoff context to build
    if (messages.length === 0) {
        return ""
    }

    // ─── 2. Recent artifacts from this specialist ───────────────────────
    let artifacts: Array<{ title: string; content_type: string; content: string; created_at: string }> = []
    try {
        const { data } = await admin
            .from("agent_artifacts")
            .select("title, content_type, content, created_at")
            .eq("foundry_id", foundryId)
            .filter("metadata->>specialistId", "eq", sourceSpecialistId)
            .order("created_at", { ascending: false })
            .limit(3)

        if (data) {
            artifacts = data
        }
    } catch (err) {
        console.warn("[HandoffContext] Failed to load artifacts:", err)
    }

    // ─── 3. Recent decisions from this specialist ───────────────────────
    let decisions: Array<{ decision: string; context: string | null; created_at: string }> = []
    try {
        const { data } = await admin
            .from("specialist_decision_journal")
            .select("decision, context, created_at")
            .eq("foundry_id", foundryId)
            .eq("specialist_id", sourceSpecialistId)
            .order("created_at", { ascending: false })
            .limit(5)

        if (data) {
            decisions = data
        }
    } catch (err) {
        console.warn("[HandoffContext] Failed to load decisions:", err)
    }

    // ─── 4. Format into context block ───────────────────────────────────
    const lines: string[] = [
        `## Handoff Context from ${sourceName}`,
        "",
        "### Recent Conversation",
        `The founder was discussing the following with ${sourceName}:`,
        "",
    ]

    for (const msg of messages) {
        if (msg.role === "user") {
            const truncated = msg.content.length > 500
                ? msg.content.slice(0, 500) + "..."
                : msg.content
            lines.push(`**Founder:** ${truncated}`)
        } else {
            const truncated = msg.content.length > 800
                ? msg.content.slice(0, 800) + "..."
                : msg.content
            lines.push(`**${sourceName}:** ${truncated}`)
        }
    }

    if (artifacts.length > 0) {
        lines.push("")
        lines.push("### Deliverables Produced")
        for (const artifact of artifacts) {
            const date = new Date(artifact.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
            })
            lines.push(`- **${artifact.title}** (${artifact.content_type}, ${date})`)
        }
    }

    if (decisions.length > 0) {
        lines.push("")
        lines.push("### Key Decisions & Observations")
        for (const d of decisions) {
            const contextNote = d.context ? ` — Context: ${d.context.slice(0, 150)}` : ""
            lines.push(`- ${d.decision.slice(0, 200)}${contextNote}`)
        }
    }

    lines.push("")
    lines.push("Use this context to provide continuity. Reference specific points from the prior conversation when relevant.")

    return lines.join("\n")
}
