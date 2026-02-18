"use server"

/**
 * @file reference-models.ts — Server actions for CAD Lab reference model matching.
 *
 * @description When a user enters a product description (e.g. "I want to build a rocket"),
 * matchReferenceModel returns the closest reference model for instant 3D preview.
 * Uses keyword scoring; optional AI matching can be added later.
 *
 * @security All actions require authentication. reference_models table is read-only for users.
 */

import { createClient } from "@/lib/supabase/server"

// ─── Types ───────────────────────────────────────────────────────────

export interface ReferenceModelModuleTemplate {
  name: string
  purpose: string
  description?: string
  inputs?: string[]
  outputs?: string[]
}

export interface ReferenceModel {
  id: string
  category: string
  name: string
  stepUrl: string | null
  stlUrl: string | null
  thumbnailSvg: string | null
  description: string | null
  searchKeywords: string[]
  moduleTemplate: ReferenceModelModuleTemplate[]
  sortOrder: number
}

// ─── List all (for admin or fallback) ─────────────────────────────────

/**
 * Fetches all reference models ordered by sort_order.
 *
 * @returns Array of reference models or empty array on error
 */
export async function listReferenceModels(): Promise<ReferenceModel[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("reference_models")
    .select("id, category, name, step_url, stl_url, thumbnail_svg, description, search_keywords, module_template, sort_order")
    .order("sort_order", { ascending: true })

  if (error) {
    console.error("[reference-models] listReferenceModels failed:", error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    stepUrl: row.step_url ?? null,
    stlUrl: row.stl_url ?? null,
    thumbnailSvg: row.thumbnail_svg ?? null,
    description: row.description ?? null,
    searchKeywords: Array.isArray(row.search_keywords) ? row.search_keywords : [],
    moduleTemplate: Array.isArray(row.module_template) ? (row.module_template as unknown as ReferenceModelModuleTemplate[]) : [],
    sortOrder: row.sort_order ?? 0,
  }))
}

// ─── Match by subject ─────────────────────────────────────────────────

/**
 * Finds the best-matching reference model for a product description.
 * Scores by number of keyword matches (case-insensitive).
 *
 * @param subject - User's product description (e.g. "I want to build a rocket")
 * @returns Best matching reference model or null if no match / empty subject
 */
export async function matchReferenceModel(subject: string): Promise<ReferenceModel | null> {
  const trimmed = subject.trim()
  if (!trimmed) return null

  const models = await listReferenceModels()
  if (models.length === 0) return null

  const lower = trimmed.toLowerCase()
  const words = lower.split(/\s+/).filter((w) => w.length > 1)

  let best: { model: ReferenceModel; score: number } | null = null

  for (const model of models) {
    let score = 0
    for (const keyword of model.searchKeywords) {
      const kw = keyword.toLowerCase()
      if (lower.includes(kw)) score += 2
      if (words.some((w) => w === kw || w.startsWith(kw) || kw.startsWith(w))) score += 1
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { model, score }
    }
  }

  if (!best) return models.find((m) => m.category === "generic") ?? null
  return best.model
}
