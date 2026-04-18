/**
 * @file forge-shortlist.ts — DB-backed Forge supplier shortlist CRUD.
 *
 * @description Phase 4 of the Source overhaul. Replaces localStorage-only
 * persistence (`forge-supplier-shortlist-v2-<projectId>`) with a Postgres
 * table scoped to the project's foundry via RLS. Keeps the
 * ShortlistedSupplier interface stable so client-side logic (ramp role
 * chips, Volume Ramp Planner, RFQ creation) doesn't need to change shape.
 *
 * @security All actions use `createClient()` (cookie-auth supabase client).
 * RLS on `forge_supplier_shortlist` + `cad_lab_projects` enforces cross-
 * foundry isolation. Server-side auth check is defence-in-depth; RLS is
 * the actual gate.
 *
 * @related
 * - Migration: supabase/migrations/20260421010000_forge_supplier_shortlist.sql
 * - Client: src/app/(platform)/the-forge/cad-lab/source/page.tsx
 * - Interface: `ShortlistedSupplier` in source/page.tsx
 */

"use server"

import { createClient } from "@/lib/supabase/server"
import type { ScoreBreakdown } from "@/actions/cad-lab-supplier-match"

// ─── Types (serialisable over React Flight) ─────────────────────────

export interface ShortlistRow {
  supplierId: string
  name: string
  isVerified: boolean
  supplierType: string
  moduleIds: string[]
  bestMatchScore: number
  bestScoreBreakdown: ScoreBreakdown
  allMatchReasons: string[]
  rampRole: string
  notes: string | null
  addedAt: string
  updatedAt: string
}

export interface ShortlistUpsertInput {
  projectId: string
  supplierId: string
  name: string
  isVerified: boolean
  supplierType: string
  moduleIds: string[]
  bestMatchScore: number
  bestScoreBreakdown: ScoreBreakdown
  allMatchReasons: string[]
  rampRole?: string
}

export interface ShortlistUpdateInput {
  projectId: string
  supplierId: string
  moduleIds?: string[]
  rampRole?: string
  notes?: string
  bestMatchScore?: number
  bestScoreBreakdown?: ScoreBreakdown
  allMatchReasons?: string[]
}

// ─── Row mapper ─────────────────────────────────────────────────────

interface DbRow {
  supplier_id: string
  supplier_name: string
  is_verified: boolean
  supplier_type: string | null
  module_ids: string[]
  best_match_score: number | null
  best_score_breakdown: ScoreBreakdown | null
  all_match_reasons: string[]
  ramp_role: string
  notes: string | null
  added_at: string
  updated_at: string
}

function rowToClient(r: DbRow): ShortlistRow {
  return {
    supplierId: r.supplier_id,
    name: r.supplier_name,
    isVerified: r.is_verified,
    supplierType: r.supplier_type ?? "service",
    moduleIds: r.module_ids ?? [],
    bestMatchScore: r.best_match_score ?? 0,
    bestScoreBreakdown: r.best_score_breakdown ?? {
      semantic: 0, process: 0, material: 0, quality: 0, keyword: 0,
      capability: 0, industry: 0, certifications: 0, specialties: 0, total: 0,
    },
    allMatchReasons: r.all_match_reasons ?? [],
    rampRole: r.ramp_role ?? "unassigned",
    notes: r.notes,
    addedAt: r.added_at,
    updatedAt: r.updated_at,
  }
}

// ─── Read ───────────────────────────────────────────────────────────

export async function getProjectShortlist(projectId: string): Promise<ShortlistRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("forge_supplier_shortlist")
    .select("supplier_id, supplier_name, is_verified, supplier_type, module_ids, best_match_score, best_score_breakdown, all_match_reasons, ramp_role, notes, added_at, updated_at")
    .eq("project_id", projectId)
    .order("added_at", { ascending: true })

  if (error) {
    console.warn("[getProjectShortlist] select failed:", error.message)
    return []
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(rowToClient)
}

// ─── Create / Upsert ────────────────────────────────────────────────

export async function addToShortlist(input: ShortlistUpsertInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "unauthenticated" }

  const { error } = await supabase
    .from("forge_supplier_shortlist")
    .upsert({
      project_id: input.projectId,
      supplier_id: input.supplierId,
      supplier_name: input.name,
      is_verified: input.isVerified,
      supplier_type: input.supplierType,
      module_ids: input.moduleIds,
      best_match_score: input.bestMatchScore,
      best_score_breakdown: input.bestScoreBreakdown as unknown as never,
      all_match_reasons: input.allMatchReasons,
      ramp_role: input.rampRole ?? "unassigned",
      added_by: user.id,
    }, { onConflict: "project_id,supplier_id" })

  if (error) {
    console.warn("[addToShortlist] upsert failed:", error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

// ─── Update ─────────────────────────────────────────────────────────

export async function updateShortlistEntry(input: ShortlistUpdateInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "unauthenticated" }

  const patch: Record<string, unknown> = {}
  if (input.moduleIds !== undefined) patch.module_ids = input.moduleIds
  if (input.rampRole !== undefined) patch.ramp_role = input.rampRole
  if (input.notes !== undefined) patch.notes = input.notes
  if (input.bestMatchScore !== undefined) patch.best_match_score = input.bestMatchScore
  if (input.bestScoreBreakdown !== undefined) patch.best_score_breakdown = input.bestScoreBreakdown as unknown
  if (input.allMatchReasons !== undefined) patch.all_match_reasons = input.allMatchReasons

  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await supabase
    .from("forge_supplier_shortlist")
    .update(patch)
    .eq("project_id", input.projectId)
    .eq("supplier_id", input.supplierId)

  if (error) {
    console.warn("[updateShortlistEntry] update failed:", error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

// ─── Delete ─────────────────────────────────────────────────────────

export async function removeFromShortlist(
  projectId: string,
  supplierId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "unauthenticated" }

  const { error } = await supabase
    .from("forge_supplier_shortlist")
    .delete()
    .eq("project_id", projectId)
    .eq("supplier_id", supplierId)

  if (error) {
    console.warn("[removeFromShortlist] delete failed:", error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

// ─── Delete all shortlist rows for a project ────────────────────────
// Used by the Source page's "Refresh shortlist" action which wipes local
// state before re-running match-all. Keeps DB state in sync.

export async function clearProjectShortlist(
  projectId: string,
): Promise<{ ok: boolean; error?: string; deleted: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "unauthenticated", deleted: 0 }

  const { error, count } = await supabase
    .from("forge_supplier_shortlist")
    .delete({ count: "exact" })
    .eq("project_id", projectId)

  if (error) {
    console.warn("[clearProjectShortlist] delete failed:", error.message)
    return { ok: false, error: error.message, deleted: 0 }
  }
  return { ok: true, deleted: count ?? 0 }
}

// ─── Bulk migrate from localStorage (one-shot on client mount) ──────
//
// Client passes its v2 localStorage blob; we upsert each row. Safe to
// call repeatedly thanks to the (project_id, supplier_id) unique
// constraint — subsequent calls become no-ops.

export interface MigrateFromLocalStorageInput {
  projectId: string
  entries: Array<Omit<ShortlistUpsertInput, "projectId">>
}

export async function migrateShortlistFromLocalStorage(
  input: MigrateFromLocalStorageInput,
): Promise<{ migrated: number; failed: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { migrated: 0, failed: input.entries.length }
  if (input.entries.length === 0) return { migrated: 0, failed: 0 }

  const rows = input.entries.map((e) => ({
    project_id: input.projectId,
    supplier_id: e.supplierId,
    supplier_name: e.name,
    is_verified: e.isVerified,
    supplier_type: e.supplierType,
    module_ids: e.moduleIds,
    best_match_score: e.bestMatchScore,
    best_score_breakdown: e.bestScoreBreakdown as unknown as never,
    all_match_reasons: e.allMatchReasons,
    ramp_role: e.rampRole ?? "unassigned",
    added_by: user.id,
  }))

  const { error } = await supabase
    .from("forge_supplier_shortlist")
    .upsert(rows, { onConflict: "project_id,supplier_id" })

  if (error) {
    console.warn("[migrateShortlistFromLocalStorage] upsert failed:", error.message)
    return { migrated: 0, failed: rows.length }
  }
  return { migrated: rows.length, failed: 0 }
}
