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
 * eligibility (disputes, orders, financial retention), cleans up memberships
 * and assignments, then deletes or anonymizes the user.
 *
 * @returns Result with success or error details (sole-founder foundries, blockers)
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
        const { count } = await adminSupabase
          .from("foundry_memberships")
          .select("*", { count: "exact", head: true })
          .eq("foundry_id", membership.foundry_id)
          .eq("role", "Founder")
          .neq("user_id", user.id)

        if (count === 0) {
          // INTENT: foundries is a joined object from the select above
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

    // Cleanup: Remove from teams, tasks, memberships (before auth deletion)
    try {
      await adminSupabase
        .from("task_assignees")
        .delete()
        .eq("profile_id", user.id)

      await adminSupabase
        .from("tasks")
        .update({ assignee_id: null })
        .eq("assignee_id", user.id)

      await adminSupabase
        .from("team_members")
        .delete()
        .eq("profile_id", user.id)

      await adminSupabase
        .from("foundry_memberships")
        .delete()
        .eq("user_id", user.id)
    } catch (cleanupError) {
      console.error("[deleteMyAccount] Cleanup error:", cleanupError)
      return { error: "Failed to clean up account data. Please try again." }
    }

    // GDPR: Process deletion or anonymization
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
      if (eligibility.retentionEndDate) {
        await scheduleFullDeletion(
          adminSupabase,
          user.id,
          new Date(eligibility.retentionEndDate)
        )
      }
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
