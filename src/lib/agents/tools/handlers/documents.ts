/**
 * @file documents.ts — Document persistence tool handler for all specialists.
 *
 * @description Implements write_document which saves specialist-generated content
 * (analyses, reports, deliverables) to the specialist_documents table for future
 * reference and cross-session persistence.
 *
 * @security All inserts are scoped to ctx.foundryId for tenant isolation.
 *
 * @related
 * - Migration: supabase/migrations/20260225000000_specialist_documents.sql
 * - Tool definitions: src/lib/agents/tools/definitions.ts
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { ToolHandler } from "./common"

// ─── write_document ──────────────────────────────────────────────

export const handleWriteDocument: ToolHandler = async (args, ctx) => {
    const title = args.title as string
    const content = args.content as string
    const contentType = (args.content_type as string) ?? "markdown"

    if (!title || typeof title !== "string") {
        return "Error: `title` parameter is required."
    }
    if (!content || typeof content !== "string") {
        return "Error: `content` parameter is required."
    }
    if (!["markdown", "csv", "json"].includes(contentType)) {
        return "Error: `content_type` must be one of: markdown, csv, json."
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from("specialist_documents")
        .insert({
            foundry_id: ctx.foundryId,
            specialist_id: ctx.specialistId ?? "unknown",
            title,
            content,
            content_type: contentType,
            thread_id: ctx.threadId ?? null,
            created_by: ctx.userId ?? null,
        })
        .select("id")
        .single()

    if (error) {
        return `Error saving document: ${error.message}`
    }

    return `Document saved: "${title}" (id: ${data.id})`
}
