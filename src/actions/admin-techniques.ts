"use server"

/**
 * @file admin-techniques.ts — Platform-admin review of LLM-seeded manufacturing
 * techniques (Phase 5E of the Forge Source overhaul).
 *
 * @description LLM-seeded rows land in `manufacturing_technique_enrichments`
 * with `source='seed_llm_deepseek'` and `reviewed=false`. They do not surface
 * to founder-facing UI until a platform admin approves them here (or via a
 * bulk SQL `UPDATE`). Approve flips `reviewed=true`; reject deletes the row.
 *
 * @security Access gated by `requireAdmin()` — admin_users membership is the
 * authoritative check. Uses the admin client for writes so reviewers can
 * act across foundries without foundry_id scoping (these rows are platform-
 * wide reference data with no tenant ownership).
 *
 * @related
 * - Migration: supabase/migrations/20260421000000_manufacturing_techniques_embeddings.sql
 * - Consumer: src/app/(ops)/ops/techniques/page.tsx
 * - Cron (re-embed): src/app/api/cron/re-embed-techniques/route.ts
 */

import { requireAdmin } from "@/lib/admin/access"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

export interface AdminTechniqueRow {
  id: string
  techniqueSlug: string
  source: string | null
  reviewed: boolean
  articleMarkdown: string | null
  supplierCount: number | null
  typicalLeadTimeDays: number | null
  contentHash: string | null
  embeddedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

type Status = "unreviewed" | "reviewed" | "all"

export async function listAdminTechniques(
  status: Status = "unreviewed",
): Promise<{ rows: AdminTechniqueRow[] } | { error: string }> {
  try {
    await requireAdmin()
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Admin access required" }
  }

  const admin = createAdminClient()
  let query = admin
    .from("manufacturing_technique_enrichments")
    .select(
      "id, technique_slug, source, reviewed, article_markdown, supplier_count, typical_lead_time_days, content_hash, embedded_at, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(200)

  if (status === "unreviewed") query = query.eq("reviewed", false)
  else if (status === "reviewed") query = query.eq("reviewed", true)

  const { data, error } = await query
  if (error) {
    console.error("[listAdminTechniques] select failed:", error.message)
    return { error: error.message }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: AdminTechniqueRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    techniqueSlug: r.technique_slug,
    source: r.source ?? null,
    reviewed: r.reviewed ?? false,
    articleMarkdown: r.article_markdown ?? null,
    supplierCount: r.supplier_count ?? null,
    typicalLeadTimeDays: r.typical_lead_time_days ?? null,
    contentHash: r.content_hash ?? null,
    embeddedAt: r.embedded_at ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  }))

  return { rows }
}

export async function approveTechnique(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Admin access required" }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("manufacturing_technique_enrichments")
    .update({ reviewed: true })
    .eq("id", id)

  if (error) {
    console.error("[approveTechnique] update failed:", error.message)
    return { ok: false, error: error.message }
  }

  revalidatePath("/ops/techniques")
  return { ok: true }
}

export async function rejectTechnique(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Admin access required" }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("manufacturing_technique_enrichments")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("[rejectTechnique] delete failed:", error.message)
    return { ok: false, error: error.message }
  }

  revalidatePath("/ops/techniques")
  return { ok: true }
}

export async function approveAllSeededTechniques(): Promise<{ ok: boolean; approved: number; error?: string }> {
  try {
    await requireAdmin()
  } catch (err) {
    return { ok: false, approved: 0, error: err instanceof Error ? err.message : "Admin access required" }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("manufacturing_technique_enrichments")
    .update({ reviewed: true })
    .eq("reviewed", false)
    .eq("source", "seed_llm_deepseek")
    .select("id")

  if (error) {
    console.error("[approveAllSeededTechniques] bulk update failed:", error.message)
    return { ok: false, approved: 0, error: error.message }
  }

  revalidatePath("/ops/techniques")
  return { ok: true, approved: data?.length ?? 0 }
}
