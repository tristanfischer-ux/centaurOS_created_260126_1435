"use server"

/**
 * Account Management Server Actions
 *
 * @description Self-service account deletion for UK-GDPR compliance.
 * Handles sole-founder checks, GDPR eligibility, cleanup, and auth deletion.
 *
 * @security Uses admin client to bypass RLS for cross-table cleanup and auth deletion.
 */

import { withUser } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  canDeleteUser,
  processImmediateDeletion,
  anonymizeUser,
  scheduleFullDeletion,
} from "@/lib/gdpr/data-deletion"
import { logSecurityEvent } from "@/lib/security/audit-log"

interface DeleteAccountResult {
  success?: true
  error?: string
  soleFounderFoundries?: string[]
  blockers?: Array<{ dataType: string; reason: string; releaseDate: string | null }>
}

/**
 * Self-service account deletion.
 *
 * @description Checks sole-founder status across all foundries, verifies GDPR
 * eligibility (disputes, orders, financial retention), processes GDPR deletion
 * first, then cleans up memberships/assignments, then deletes auth user.
 *
 * @returns Result with success or error details (sole-founder foundries, blockers)
 *
 * @security Operation order: validate → GDPR → cleanup → audit → auth delete.
 * GDPR runs before cleanup so a GDPR failure doesn't leave the user with
 * deleted memberships but a live account (half-deleted state).
 */
export async function deleteMyAccount(): Promise<DeleteAccountResult> {
  // INTENT: supabase from withUser is user-scoped; we need admin for cross-table ops
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return withUser(async ({ supabase: _userSupabase, user }) => {
    const adminSupabase = createAdminClient()

    // SECURITY: Check sole-founder status across ALL foundries
    const { data: founderMemberships, error: membershipError } = await adminSupabase
      .from("foundry_memberships")
      .select("foundry_id, foundries(name)")
      .eq("user_id", user.id)
      .eq("role", "Founder")

    if (membershipError) {
      console.error("[deleteMyAccount] Failed to check founder status:", membershipError)
      return { error: "Failed to verify account status. Please try again." }
    }

    if (founderMemberships && founderMemberships.length > 0) {
      const soleFounderFoundries: string[] = []

      for (const membership of founderMemberships) {
        // Check if other Founders exist in this foundry
        const { count, error: countError } = await adminSupabase
          .from("foundry_memberships")
          .select("*", { count: "exact", head: true })
          .eq("foundry_id", membership.foundry_id)
          .eq("role", "Founder")
          .neq("user_id", user.id)

        // GOTCHA: count is null on query error — treat as sole founder (fail-safe)
        if (countError || count === null || count === 0) {
          const foundryData = membership.foundries as unknown as { name: string } | null
          soleFounderFoundries.push(foundryData?.name || "Unknown foundry")
        }
      }

      if (soleFounderFoundries.length > 0) {
        return {
          error: `You are the sole Founder of: ${soleFounderFoundries.join(", ")}. Transfer ownership before deleting your account.`,
          soleFounderFoundries,
        }
      }
    }

    // GDPR: Check eligibility via existing utility (uses admin client to bypass RLS on escrow/orders)
    const eligibility = await canDeleteUser(adminSupabase, user.id)

    // Block if active disputes or pending orders
    if (!eligibility.canDelete && !eligibility.canAnonymize) {
      return {
        error: "Cannot delete account due to active items that must be resolved first.",
        blockers: eligibility.blockers,
      }
    }

    // GDPR: Process deletion or anonymization BEFORE cleanup
    // DECISION: GDPR runs first so a failure here doesn't leave the user
    // with deleted memberships but a live account (half-deleted orphan state).
    if (eligibility.canDelete) {
      const result = await processImmediateDeletion(adminSupabase, user.id)
      if (!result.success) {
        console.error("[deleteMyAccount] Immediate deletion failed:", result.error)
        return { error: "Failed to delete account data. Please contact support." }
      }
    } else if (eligibility.canAnonymize) {
      const anonResult = await anonymizeUser(adminSupabase, user.id)
      if (!anonResult.success) {
        console.error("[deleteMyAccount] Anonymization failed:", anonResult.error)
        return { error: "Failed to process account deletion. Please contact support." }
      }

      // Schedule full deletion when retention period ends
      // GOTCHA: scheduleFullDeletion calls anonymizeUser again internally — harmless (idempotent)
      if (eligibility.retentionEndDate) {
        const scheduleResult = await scheduleFullDeletion(
          adminSupabase,
          user.id,
          new Date(eligibility.retentionEndDate)
        )
        if (scheduleResult.error) {
          // Non-fatal: user is already anonymized + auth will be deleted.
          // Financial records just won't get automated scheduled cleanup.
          console.error("[deleteMyAccount] Failed to schedule full deletion:", scheduleResult.error)
        }
      }
    }

    // Cleanup: Remove from teams, tasks, memberships (after GDPR succeeds)
    // GOTCHA: Supabase client returns { error } on query failures, but network
    // errors throw. Use allSettled so a single failure doesn't crash the action.
    const cleanupResults = await Promise.allSettled([
      adminSupabase.from("task_assignees").delete().eq("profile_id", user.id),
      adminSupabase.from("tasks").update({ assignee_id: null }).eq("assignee_id", user.id),
      adminSupabase.from("team_members").delete().eq("profile_id", user.id),
      adminSupabase.from("foundry_memberships").delete().eq("user_id", user.id),
    ])

    const cleanupErrors = cleanupResults
      .map((r) =>
        r.status === "rejected"
          ? r.reason
          : r.value.error
      )
      .filter(Boolean)

    if (cleanupErrors.length > 0) {
      // Log but don't block — GDPR data is already handled, these are FK refs
      console.error("[deleteMyAccount] Non-fatal cleanup errors:", cleanupErrors)
    }

    // AUDIT: Log before auth deletion (after this, the user record is gone)
    await logSecurityEvent({
      type: "DATA_DELETION",
      userId: user.id,
      email: user.email,
      action: eligibility.canDelete ? "immediate_deletion" : "anonymize_and_schedule",
      success: true,
      details: {
        deletionType: eligibility.canDelete ? "immediate" : "scheduled",
        retentionEndDate: eligibility.retentionEndDate,
      },
    })

    // AUTH: Delete auth user — cascades to profiles row
    const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(user.id)
    if (authDeleteError) {
      console.error("[deleteMyAccount] Auth deletion failed:", authDeleteError)
      return { error: "Account data was cleared but session cleanup failed. Please contact support." }
    }

    return { success: true }
  })
}
