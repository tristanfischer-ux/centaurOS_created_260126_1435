/**
 * @file project-supplier-shortlists.ts — Server actions for the supplier
 * stickiness rebuild (RED-TEAM-PIVOT-PLAN Tier 4 step 19).
 *
 * @description Four server action groups:
 *   1. Shortlist CRUD — save/remove a supplier, update status and notes.
 *   2. Quote ledger — log a quote, list quotes for a supplier.
 *   3. Lead-time alerts — set/clear target launch date, compute buffer weeks.
 *   4. Procurement diary — add an entry, list entries for a project.
 *
 * @security All actions use withAuth — auth + foundry resolved before any
 * DB write. RLS on all three tables is defence-in-depth.
 *
 * @related
 *   - Migration: supabase/migrations/20260425070000_project_supplier_shortlists.sql
 *   - UI: src/app/(platform)/the-forge-v2/projects/[id]/suppliers/
 */

"use server"

// INTENT: a "use server" file may ONLY export async functions. Re-exporting
// the synchronous `computeLeadTimeBuffer` helper from this file broke the
// build on /the-forge-v2/projects/<id>/suppliers. Consumers (currently only
// `shortlist-view.tsx`) import the helper and its type directly from
// `@/lib/supplier-lead-time`, so the re-exports here were dead — they only
// existed to fail the bundle. Removed.

import { withAuth } from "@/lib/server-action-utils"
import type { Database } from "@/types/database.types"

// ─── Shared types ────────────────────────────────────────────────────────────

export type ShortlistStatus =
  Database["public"]["Enums"]["supplier_shortlist_status"]

export interface ProjectShortlistRow {
  id: string
  projectId: string
  supplierId: string
  supplierName: string
  status: ShortlistStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface SupplierQuoteRow {
  id: string
  projectId: string
  supplierId: string
  quoteAmountPence: number | null
  currency: string
  volume: number | null
  leadTimeDays: number | null
  validUntil: string | null
  terms: string | null
  receivedAt: string | null
  notes: string | null
  createdAt: string
  createdByUserId: string
}

export interface ProcurementDiaryEntry {
  id: string
  projectId: string
  authorUserId: string
  entry: string
  occurredAt: string
  createdAt: string
}

// ─── 1. Shortlist CRUD ───────────────────────────────────────────────────────

/**
 * Upsert a supplier onto a project's shortlist.
 * Idempotent: calling twice with the same (projectId, supplierId) updates
 * the supplier_name and resets status to 'researching' only on first insert.
 */
export async function saveSupplierToShortlist(input: {
  projectId: string
  supplierId: string
  supplierName: string
}): Promise<{ success: boolean; row?: ProjectShortlistRow; error?: string }> {
  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from("project_supplier_shortlists")
      .upsert(
        {
          project_id: input.projectId,
          supplier_id: input.supplierId,
          supplier_name: input.supplierName,
          added_by_user_id: user.id,
        },
        {
          onConflict: "project_id,supplier_id",
          ignoreDuplicates: true, // keep existing status if already shortlisted
        }
      )
      .select()
      .single()

    if (error) {
      // 23505 = unique_violation — already shortlisted, fetch and return it
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("project_supplier_shortlists")
          .select()
          .eq("project_id", input.projectId)
          .eq("supplier_id", input.supplierId)
          .single()
        if (existing) {
          return { success: true, row: mapShortlistRow(existing) }
        }
      }
      console.error("[PSS] saveSupplierToShortlist:", error)
      return { success: false, error: error.message }
    }

    return { success: true, row: data ? mapShortlistRow(data) : undefined }
  })
}

/**
 * Remove a supplier from a project's shortlist (also cascades quotes via the
 * supplier_id match, but quotes FK is on project_id only — callers may want to
 * keep quotes for historical purposes, so we do NOT delete quotes here).
 */
export async function removeSupplierFromShortlist(input: {
  projectId: string
  supplierId: string
}): Promise<{ success: boolean; error?: string }> {
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase
      .from("project_supplier_shortlists")
      .delete()
      .eq("project_id", input.projectId)
      .eq("supplier_id", input.supplierId)

    if (error) {
      console.error("[PSS] removeSupplierFromShortlist:", error)
      return { success: false, error: error.message }
    }
    return { success: true }
  })
}

/**
 * Update the status and/or notes on an existing shortlist row.
 */
export async function updateShortlistRow(input: {
  projectId: string
  supplierId: string
  status?: ShortlistStatus
  notes?: string
}): Promise<{ success: boolean; row?: ProjectShortlistRow; error?: string }> {
  return withAuth(async ({ supabase }) => {
    const patch: Record<string, unknown> = {}
    if (input.status !== undefined) patch.status = input.status
    if (input.notes !== undefined) patch.notes = input.notes

    if (Object.keys(patch).length === 0) {
      return { success: true }
    }

    const { data, error } = await supabase
      .from("project_supplier_shortlists")
      .update(patch)
      .eq("project_id", input.projectId)
      .eq("supplier_id", input.supplierId)
      .select()
      .single()

    if (error) {
      console.error("[PSS] updateShortlistRow:", error)
      return { success: false, error: error.message }
    }
    return { success: true, row: data ? mapShortlistRow(data) : undefined }
  })
}

/**
 * List all shortlisted suppliers for a project, ordered by created_at asc.
 */
export async function listShortlistedSuppliers(
  projectId: string
): Promise<{ success: boolean; rows?: ProjectShortlistRow[]; error?: string }> {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("project_supplier_shortlists")
      .select()
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("[PSS] listShortlistedSuppliers:", error)
      return { success: false, error: error.message }
    }
    return { success: true, rows: (data ?? []).map(mapShortlistRow) }
  })
}

/**
 * Check whether a specific supplier is already on the project shortlist.
 */
export async function isSupplierShortlisted(input: {
  projectId: string
  supplierId: string
}): Promise<{ success: boolean; shortlisted: boolean; error?: string }> {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("project_supplier_shortlists")
      .select("id")
      .eq("project_id", input.projectId)
      .eq("supplier_id", input.supplierId)
      .maybeSingle()

    if (error) {
      console.error("[PSS] isSupplierShortlisted:", error)
      return { success: false, shortlisted: false, error: error.message }
    }
    return { success: true, shortlisted: !!data }
  })
}

// ─── 2. Quote ledger ─────────────────────────────────────────────────────────

/**
 * Log a received quote for a shortlisted supplier.
 * Fields are permissive — a founder can log a partial quote (no price yet)
 * and fill in fields as the negotiation progresses.
 */
export async function logSupplierQuote(input: {
  projectId: string
  supplierId: string
  quoteAmountPence?: number | null
  currency?: string
  volume?: number | null
  leadTimeDays?: number | null
  validUntil?: string | null
  terms?: string | null
  receivedAt?: string | null
  notes?: string | null
}): Promise<{ success: boolean; row?: SupplierQuoteRow; error?: string }> {
  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from("supplier_quotes")
      .insert({
        project_id: input.projectId,
        supplier_id: input.supplierId,
        quote_amount_pence: input.quoteAmountPence ?? null,
        currency: input.currency ?? "GBP",
        volume: input.volume ?? null,
        lead_time_days: input.leadTimeDays ?? null,
        valid_until: input.validUntil ?? null,
        terms: input.terms ?? null,
        received_at: input.receivedAt ?? null,
        notes: input.notes ?? null,
        created_by_user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("[PSS] logSupplierQuote:", error)
      return { success: false, error: error.message }
    }
    return { success: true, row: data ? mapQuoteRow(data) : undefined }
  })
}

/**
 * List all quotes for a specific supplier on a project, most recent first.
 */
export async function listSupplierQuotes(input: {
  projectId: string
  supplierId: string
}): Promise<{ success: boolean; rows?: SupplierQuoteRow[]; error?: string }> {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("supplier_quotes")
      .select()
      .eq("project_id", input.projectId)
      .eq("supplier_id", input.supplierId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[PSS] listSupplierQuotes:", error)
      return { success: false, error: error.message }
    }
    return { success: true, rows: (data ?? []).map(mapQuoteRow) }
  })
}

/**
 * List all quotes across all suppliers for a project.
 * Used by the comparison view to surface the best quote per supplier.
 */
export async function listAllQuotesForProject(
  projectId: string
): Promise<{ success: boolean; rows?: SupplierQuoteRow[]; error?: string }> {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("supplier_quotes")
      .select()
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[PSS] listAllQuotesForProject:", error)
      return { success: false, error: error.message }
    }
    return { success: true, rows: (data ?? []).map(mapQuoteRow) }
  })
}

/**
 * Delete a quote by id (founders may log by mistake).
 */
export async function deleteSupplierQuote(
  quoteId: string
): Promise<{ success: boolean; error?: string }> {
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase
      .from("supplier_quotes")
      .delete()
      .eq("id", quoteId)

    if (error) {
      console.error("[PSS] deleteSupplierQuote:", error)
      return { success: false, error: error.message }
    }
    return { success: true }
  })
}

// ─── 3. Lead-time alert helpers ──────────────────────────────────────────────

/**
 * Set the target launch date on a project.
 * Stored as an ISO date string (YYYY-MM-DD).
 */
export async function setProjectLaunchDate(input: {
  projectId: string
  targetLaunchDate: string | null
}): Promise<{ success: boolean; error?: string }> {
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase
      .from("cad_lab_projects")
      .update({ target_launch_date: input.targetLaunchDate })
      .eq("id", input.projectId)

    if (error) {
      console.error("[PSS] setProjectLaunchDate:", error)
      return { success: false, error: error.message }
    }
    return { success: true }
  })
}

// ─── 4. Procurement diary ────────────────────────────────────────────────────

/**
 * Add a free-text diary entry for a project.
 */
export async function addDiaryEntry(input: {
  projectId: string
  entry: string
  occurredAt?: string
}): Promise<{ success: boolean; row?: ProcurementDiaryEntry; error?: string }> {
  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from("procurement_diary_entries")
      .insert({
        project_id: input.projectId,
        author_user_id: user.id,
        entry: input.entry.trim(),
        occurred_at: input.occurredAt ?? new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("[PSS] addDiaryEntry:", error)
      return { success: false, error: error.message }
    }
    return { success: true, row: data ? mapDiaryRow(data) : undefined }
  })
}

/**
 * List diary entries for a project, most recent first.
 */
export async function listDiaryEntries(
  projectId: string
): Promise<{ success: boolean; rows?: ProcurementDiaryEntry[]; error?: string }> {
  return withAuth(async ({ supabase }) => {
    const { data, error } = await supabase
      .from("procurement_diary_entries")
      .select()
      .eq("project_id", projectId)
      .order("occurred_at", { ascending: false })

    if (error) {
      console.error("[PSS] listDiaryEntries:", error)
      return { success: false, error: error.message }
    }
    return { success: true, rows: (data ?? []).map(mapDiaryRow) }
  })
}

/**
 * Delete a diary entry by id.
 */
export async function deleteDiaryEntry(
  entryId: string
): Promise<{ success: boolean; error?: string }> {
  return withAuth(async ({ supabase }) => {
    const { error } = await supabase
      .from("procurement_diary_entries")
      .delete()
      .eq("id", entryId)

    if (error) {
      console.error("[PSS] deleteDiaryEntry:", error)
      return { success: false, error: error.message }
    }
    return { success: true }
  })
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

function mapShortlistRow(
  r: Database["public"]["Tables"]["project_supplier_shortlists"]["Row"]
): ProjectShortlistRow {
  return {
    id: r.id,
    projectId: r.project_id,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function mapQuoteRow(
  r: Database["public"]["Tables"]["supplier_quotes"]["Row"]
): SupplierQuoteRow {
  return {
    id: r.id,
    projectId: r.project_id,
    supplierId: r.supplier_id,
    quoteAmountPence: r.quote_amount_pence ?? null,
    currency: r.currency,
    volume: r.volume ?? null,
    leadTimeDays: r.lead_time_days ?? null,
    validUntil: r.valid_until ?? null,
    terms: r.terms ?? null,
    receivedAt: r.received_at ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    createdByUserId: r.created_by_user_id,
  }
}

function mapDiaryRow(
  r: Database["public"]["Tables"]["procurement_diary_entries"]["Row"]
): ProcurementDiaryEntry {
  return {
    id: r.id,
    projectId: r.project_id,
    authorUserId: r.author_user_id,
    entry: r.entry,
    occurredAt: r.occurred_at,
    createdAt: r.created_at,
  }
}
