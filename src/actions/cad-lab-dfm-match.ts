/**
 * @file cad-lab-dfm-match.ts — Vector-backed manufacturing technique retrieval.
 *
 * @description Semantic search over `manufacturing_technique_enrichments` +
 * `process_capabilities` using the nomic-embed-text-v1.5 model (768 dims). Phase
 * 5 of the Forge Source overhaul: replaces the static 45-technique library in
 * `src/lib/manufacturing-techniques/data.ts` with a DB-backed, embedding-
 * indexed lookup that the DfM tab can extend without code changes.
 *
 * @related
 * - Migration: supabase/migrations/20260421000000_manufacturing_techniques_embeddings.sql
 * - RPC: match_manufacturing_techniques(query_embedding, threshold, count, only_reviewed)
 * - Embed pipeline: src/lib/search/nomic-embed.ts
 * - Consumer: src/components/cad/manufacturing-intelligence-tab.tsx
 */

"use server"

import { createClient } from "@/lib/supabase/server"
import { nomicEmbed } from "@/lib/search/nomic-embed"

export interface ManufacturingTechniqueMatch {
  techniqueSlug: string
  displayName: string
  articleMarkdown: string | null
  toleranceTypicalMm: number | null
  toleranceMinMm: number | null
  toleranceMaxMm: number | null
  suitableMaterials: string[]
  unsuitableMaterials: string[]
  typicalLeadTimeDays: number | null
  realWorldTolerances: unknown
  realWorldMaterials: unknown
  realWorldEquipment: unknown
  tipsAndInsights: unknown
  commonApplications: unknown
  supplierCount: number | null
  source: string | null
  reviewed: boolean
  similarity: number
}

export interface MatchManufacturingTechniquesInput {
  /** Module-level query text, e.g. "Primary wing spar T800 CFRP tube, aerospace-grade, ±0.1mm" */
  query: string
  matchThreshold?: number
  matchCount?: number
  /** Default true — hides LLM-seeded unreviewed rows from production UI. */
  onlyReviewed?: boolean
}

/**
 * Semantic retrieval over manufacturing techniques for a given module spec.
 *
 * @security Auth-required to prevent public embedding-API cost abuse.
 */
export async function matchManufacturingTechniques(
  input: MatchManufacturingTechniquesInput,
): Promise<ManufacturingTechniqueMatch[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const trimmed = input.query.trim().slice(0, 4000)
  if (!trimmed) return []

  let embedding: number[]
  try {
    const [e] = await nomicEmbed([trimmed], "search_query")
    embedding = e
  } catch (err) {
    console.warn("[matchManufacturingTechniques] embed failed:", err instanceof Error ? err.message : err)
    return []
  }

  // RPC expects the embedding as a pgvector literal (JS client → stringify)
  const { data, error } = await supabase.rpc("match_manufacturing_techniques", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: input.matchThreshold ?? 0.45,
    match_count: input.matchCount ?? 6,
    only_reviewed: input.onlyReviewed ?? true,
  })

  if (error || !data) {
    if (error) console.warn("[matchManufacturingTechniques] RPC failed:", error.message)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((row) => ({
    techniqueSlug: row.technique_slug,
    displayName: row.display_name,
    articleMarkdown: row.article_markdown ?? null,
    toleranceTypicalMm: row.tolerance_typical_mm ?? null,
    toleranceMinMm: row.tolerance_min_mm ?? null,
    toleranceMaxMm: row.tolerance_max_mm ?? null,
    suitableMaterials: Array.isArray(row.suitable_materials) ? row.suitable_materials : [],
    unsuitableMaterials: Array.isArray(row.unsuitable_materials) ? row.unsuitable_materials : [],
    typicalLeadTimeDays: row.typical_lead_time_days ?? null,
    realWorldTolerances: row.real_world_tolerances ?? null,
    realWorldMaterials: row.real_world_materials ?? null,
    realWorldEquipment: row.real_world_equipment ?? null,
    tipsAndInsights: row.tips_and_insights ?? null,
    commonApplications: row.common_applications ?? null,
    supplierCount: row.supplier_count ?? null,
    source: row.source ?? null,
    reviewed: row.reviewed ?? true,
    similarity: typeof row.similarity === "number" ? row.similarity : 0,
  }))
}
