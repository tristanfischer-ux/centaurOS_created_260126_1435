/**
 * Cron Job: Re-embed manufacturing technique rows whose content changed.
 *
 * @description Walks `manufacturing_technique_enrichments` + `process_capabilities`,
 * computes the current SHA-256 hash of each row's embedded text, and re-embeds
 * any row whose `content_hash` doesn't match (or is null). Keeps the semantic
 * retrieval index fresh after edits without re-embedding unchanged rows every
 * night.
 *
 * Schedule: Daily at 04:00 UTC (see vercel.json). Budgeted at ≤ 200 embeds per
 * run — content rarely churns this hard, so we'll usually re-embed 0–5 rows.
 *
 * @security Requires CRON_SECRET Bearer token. Uses admin client (service_role)
 * for cross-foundry reads + writes; these are platform reference tables.
 *
 * @related
 * - Migration: supabase/migrations/20260421000000_manufacturing_techniques_embeddings.sql
 * - One-time backfill: scripts/backfill-manufacturing-technique-embeddings.ts
 * - Nomic client: src/lib/search/nomic-embed.ts
 */

import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { verifyCronSecret } from "@/lib/security/cron-auth"
import { getClientIP, rateLimit } from "@/lib/security/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { nomicEmbed } from "@/lib/search/nomic-embed"

const MAX_REEMBED_PER_RUN = 200
const EMBED_BATCH_SIZE = 10

export const maxDuration = 300

function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32)
}

function textForProcessCapability(r: Record<string, unknown>): string {
  const parts = [
    (r.display_name as string | null) ?? (r.process_name as string),
    `Process: ${r.process_name as string}`,
    r.tolerance_typical_mm != null ? `Typical tolerance: ${r.tolerance_typical_mm}mm` : "",
    r.tolerance_min_mm != null && r.tolerance_max_mm != null
      ? `Range: ${r.tolerance_min_mm}mm to ${r.tolerance_max_mm}mm`
      : "",
    Array.isArray(r.suitable_materials) && (r.suitable_materials as string[]).length > 0
      ? `Materials: ${(r.suitable_materials as string[]).join(", ")}`
      : "",
    Array.isArray(r.unsuitable_materials) && (r.unsuitable_materials as string[]).length > 0
      ? `Avoid: ${(r.unsuitable_materials as string[]).join(", ")}`
      : "",
    r.typical_lead_time_days != null ? `Lead time ~${r.typical_lead_time_days} days` : "",
  ]
  return parts.filter(Boolean).join(". ")
}

function textForEnrichment(r: Record<string, unknown>): string {
  const parts = [
    r.technique_slug as string,
    (r.article_markdown as string | null) ?? "",
  ]
  const jsonFields = [
    "real_world_tolerances",
    "real_world_materials",
    "real_world_equipment",
    "tips_and_insights",
    "common_applications",
  ]
  for (const key of jsonFields) {
    const v = r[key]
    if (v && typeof v === "object") {
      parts.push(`${key.replace(/_/g, " ")}: ${JSON.stringify(v).slice(0, 400)}`)
    }
  }
  return parts.filter(Boolean).join(". ").slice(0, 6000)
}

interface ReembedResult {
  table: string
  considered: number
  needed: number
  reembedded: number
  failed: number
}

async function reembedTable(
  admin: ReturnType<typeof createAdminClient>,
  table: "process_capabilities" | "manufacturing_technique_enrichments",
  selectFields: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textFn: (r: any) => string,
): Promise<ReembedResult> {
  // INTENT: dynamic `.select()` defeats the generated types' template literal
  // parser. Cast the client to any locally — this helper is platform-scoped
  // and the admin client bypasses RLS anyway.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = admin as any
  const { data: rows, error } = await client
    .from(table)
    .select(`id, ${selectFields}, content_hash, embedding`)
    .limit(1000)

  if (error || !rows) {
    console.error(`[re-embed-techniques] ${table} fetch failed:`, error?.message)
    return { table, considered: 0, needed: 0, reembedded: 0, failed: 0 }
  }

  const needsReembed: Array<{ id: string; text: string; newHash: string }> = []
  for (const r of rows as Array<Record<string, unknown>>) {
    const text = textFn(r)
    if (!text) continue
    const newHash = hashContent(text)
    const currentHash = r.content_hash as string | null
    const hasEmbedding = r.embedding != null
    if (currentHash !== newHash || !hasEmbedding) {
      needsReembed.push({ id: r.id as string, text, newHash })
    }
  }

  const capped = needsReembed.slice(0, MAX_REEMBED_PER_RUN)
  let reembedded = 0
  let failed = 0

  for (let i = 0; i < capped.length; i += EMBED_BATCH_SIZE) {
    const batch = capped.slice(i, i + EMBED_BATCH_SIZE)
    try {
      const embeddings = await nomicEmbed(
        batch.map((b) => b.text),
        "search_document",
      )
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]
        const embStr = `[${embeddings[j].join(",")}]`
        const { error: updateErr } = await client
          .from(table)
          .update({
            embedding: embStr,
            content_hash: item.newHash,
            embedded_at: new Date().toISOString(),
          })
          .eq("id", item.id)
        if (updateErr) {
          console.warn(`[re-embed-techniques] ${table}/${item.id} update failed:`, updateErr.message)
          failed++
        } else {
          reembedded++
        }
      }
    } catch (err) {
      console.warn(`[re-embed-techniques] ${table} batch failed:`, err instanceof Error ? err.message : err)
      failed += batch.length
    }
  }

  return {
    table,
    considered: rows.length,
    needed: needsReembed.length,
    reembedded,
    failed,
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Rate limit
  const ip = getClientIP(req.headers)
  const ipLimit = await rateLimit("webhook", `cron-re-embed-techniques:${ip}`)
  if (!ipLimit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  // Auth
  const authFailure = verifyCronSecret(req)
  if (authFailure) return authFailure

  // Confirm Nomic key is available before we start — cron should fail loudly
  // rather than silently skip.
  if (!process.env.NOMIC_API_KEY?.trim()) {
    console.error("[re-embed-techniques] NOMIC_API_KEY not set")
    return NextResponse.json({ error: "Embedding key not configured" }, { status: 503 })
  }

  try {
    const admin = createAdminClient()

    const enrichmentResult = await reembedTable(
      admin,
      "manufacturing_technique_enrichments",
      "technique_slug, article_markdown, real_world_tolerances, real_world_materials, real_world_equipment, tips_and_insights, common_applications",
      textForEnrichment,
    )

    const processResult = await reembedTable(
      admin,
      "process_capabilities",
      "process_name, display_name, tolerance_typical_mm, tolerance_min_mm, tolerance_max_mm, suitable_materials, unsuitable_materials, typical_lead_time_days",
      textForProcessCapability,
    )

    const totalReembedded = enrichmentResult.reembedded + processResult.reembedded
    const totalFailed = enrichmentResult.failed + processResult.failed

    console.info(
      `[re-embed-techniques] Done: ${totalReembedded} re-embedded, ${totalFailed} failed.`,
      { enrichment: enrichmentResult, processCaps: processResult },
    )

    return NextResponse.json({
      success: true,
      reembedded: totalReembedded,
      failed: totalFailed,
      detail: {
        manufacturing_technique_enrichments: enrichmentResult,
        process_capabilities: processResult,
      },
    })
  } catch (err) {
    console.error("[re-embed-techniques] Error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
