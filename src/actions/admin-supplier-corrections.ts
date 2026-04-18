"use server"

/**
 * @file admin-supplier-corrections.ts — Platform-admin review surface for
 * founder-submitted supplier corrections (Task I).
 *
 * @description Founders submit corrections via `submitSupplierCorrection` in
 * `supplier-enrichment.ts` (free-text proposed_value against any field name).
 * Platform admins review here: approve (writes proposed_value to the listing
 * AND stamps applied_at + status='approved'), or reject (status='rejected'
 * with an optional reason).
 *
 * @security
 *   - Access gated by `requireAdmin()` — admin_users table membership required.
 *     Founder/Executive roles do NOT have access.
 *   - Apply uses the admin client (bypasses RLS) because corrections target
 *     listings the admin does not own. This is the correct escalation.
 *   - Only a fixed allow-list of TEXT fields can be applied — free-text
 *     proposed_value cannot safely coerce into JSON/numeric columns, and
 *     arbitrary field names would expand the attack surface on the listings
 *     table.
 */

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdmin } from "@/lib/admin/access"

export interface AdminSupplierCorrectionRow {
  id: string
  listingId: string
  listingTitle: string | null
  fieldName: string
  currentValue: string | null
  proposedValue: string
  reason: string | null
  submittedBy: string | null
  submittedByEmail: string | null
  foundryId: string
  status: string
  createdAt: string
  reviewedBy: string | null
  appliedAt: string | null
}

/** Fields safe to update from a free-text proposed_value. Everything else is review-only. */
const APPLICABLE_FIELDS = new Set([
  "website_url",
  "contact_email",
  "contact_name",
  "contact_phone",
  "contact_title",
  "contact_linkedin",
  "lead_time",
  "minimum_order",
  "country",
  "country_iso",
  "city",
  "address",
  "description",
  "subcategory",
  "company_size",
  "financial_health",
  "export_controls",
  "production_capacity",
  "quality_systems",
  "sustainability_notes",
])

async function requireAdminAuth(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Not authenticated" }
  const allowed = await isAdmin(user.id)
  if (!allowed) return { ok: false, error: "Admin access required" }
  return { ok: true, userId: user.id }
}

/**
 * List supplier corrections across all foundries, with optional status filter.
 * Newest first. Joins listing title and submitter email for the UI.
 */
export async function listSupplierCorrections(
  status: "pending" | "approved" | "rejected" | "all" = "pending",
): Promise<{ rows: AdminSupplierCorrectionRow[] } | { error: string }> {
  const auth = await requireAdminAuth()
  if (!auth.ok) return { error: auth.error }

  // Admin client: corrections span foundries, so we bypass RLS deliberately.
  const admin = createAdminClient()

  // Two-step: no declared FK from supplier_corrections.submitted_by → profiles,
  // so PostgREST can't auto-join. Fetch corrections (+ listing title via
  // declared FK), then batch-lookup submitter emails.
  let query = admin
    .from("supplier_corrections")
    .select(`
      id, listing_id, field_name, current_value, proposed_value, reason,
      submitted_by, foundry_id, status, created_at, reviewed_by, applied_at,
      marketplace_listings ( title )
    `)
    .order("created_at", { ascending: false })
    .limit(500)
  if (status !== "all") query = query.eq("status", status)

  const { data, error } = await query
  if (error) {
    console.error("[admin-supplier-corrections] list failed:", error.message)
    return { error: "Could not load corrections" }
  }

  const submitterIds = Array.from(
    new Set((data ?? []).map((r) => r.submitted_by).filter((x): x is string => Boolean(x))),
  )
  const emailsById = new Map<string, string>()
  if (submitterIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", submitterIds)
    for (const p of profiles ?? []) {
      if (p.email) emailsById.set(p.id, p.email)
    }
  }

  const rows: AdminSupplierCorrectionRow[] = (data ?? []).map((r) => {
    const listing = (r as unknown as { marketplace_listings?: { title?: string | null } }).marketplace_listings
    return {
      id: r.id,
      listingId: r.listing_id,
      listingTitle: listing?.title ?? null,
      fieldName: r.field_name,
      currentValue: r.current_value,
      proposedValue: r.proposed_value,
      reason: r.reason,
      submittedBy: r.submitted_by,
      submittedByEmail: r.submitted_by ? emailsById.get(r.submitted_by) ?? null : null,
      foundryId: r.foundry_id,
      status: r.status,
      createdAt: r.created_at,
      reviewedBy: r.reviewed_by,
      appliedAt: r.applied_at,
    }
  })

  return { rows }
}

/**
 * Approve a correction: write proposed_value to the listing's target field
 * (allow-list only), then stamp the correction as applied.
 */
export async function approveSupplierCorrection(
  correctionId: string,
): Promise<{ ok: true } | { error: string }> {
  const auth = await requireAdminAuth()
  if (!auth.ok) return { error: auth.error }
  const admin = createAdminClient()

  const { data: row, error: readErr } = await admin
    .from("supplier_corrections")
    .select("id, listing_id, field_name, proposed_value, status")
    .eq("id", correctionId)
    .single()
  if (readErr || !row) return { error: "Correction not found" }
  if (row.status !== "pending") return { error: `Correction already ${row.status}` }

  if (!APPLICABLE_FIELDS.has(row.field_name)) {
    return { error: `Field '${row.field_name}' is review-only. Mark the correction 'reviewed' with notes instead of applying.` }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listingUpdate: Record<string, any> = { [row.field_name]: row.proposed_value }

  const { error: updErr } = await admin
    .from("marketplace_listings")
    .update(listingUpdate)
    .eq("id", row.listing_id)
  if (updErr) {
    console.error("[admin-supplier-corrections] listing update failed:", updErr.message)
    return { error: "Could not apply correction to listing" }
  }

  const { error: stampErr } = await admin
    .from("supplier_corrections")
    .update({
      status: "approved",
      reviewed_by: auth.userId,
      applied_at: new Date().toISOString(),
    })
    .eq("id", correctionId)
  if (stampErr) {
    console.error("[admin-supplier-corrections] status stamp failed:", stampErr.message)
    return { error: "Listing updated but status stamp failed — re-stamp manually" }
  }

  return { ok: true }
}

/**
 * Reject a correction: record status='rejected' and the reviewer. The listing
 * is NOT touched. An optional reason is appended to the existing `reason`
 * field (since there's no dedicated reviewer_notes column).
 */
export async function rejectSupplierCorrection(
  correctionId: string,
  reviewerNote?: string,
): Promise<{ ok: true } | { error: string }> {
  const auth = await requireAdminAuth()
  if (!auth.ok) return { error: auth.error }
  const admin = createAdminClient()

  const { data: row, error: readErr } = await admin
    .from("supplier_corrections")
    .select("id, reason, status")
    .eq("id", correctionId)
    .single()
  if (readErr || !row) return { error: "Correction not found" }
  if (row.status !== "pending") return { error: `Correction already ${row.status}` }

  const mergedReason = reviewerNote?.trim()
    ? `${row.reason ?? ""}\n---\nReviewer: ${reviewerNote.trim()}`.trim()
    : row.reason

  const { error: updErr } = await admin
    .from("supplier_corrections")
    .update({
      status: "rejected",
      reviewed_by: auth.userId,
      reason: mergedReason,
    })
    .eq("id", correctionId)
  if (updErr) {
    console.error("[admin-supplier-corrections] reject failed:", updErr.message)
    return { error: "Could not reject correction" }
  }

  return { ok: true }
}
