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

    // FK CLEANUP: Several tables reference auth.users(id) or profiles(id)
    // with NO ON DELETE clause (defaults to RESTRICT). These MUST be cleaned
    // before deleteUser(), or the cascade to profiles will fail with a FK violation.
    //
    // GOTCHA: profiles.paired_ai_id → profiles(id) is the self-reference blocker.
    // NOT NULL RESTRICT columns (cad_lab_projects, xray_scans, forge_contracts,
    // manufacturing_orders) must DELETE rows. Nullable RESTRICT columns SET NULL.

    // 1. Self-reference: null out inbound paired_ai_id references
    const { error: pairingError } = await adminSupabase
      .from("profiles")
      .update({ paired_ai_id: null })
      .eq("paired_ai_id", user.id)

    if (pairingError) {
      console.error("[deleteMyAccount] Failed to clear paired_ai_id refs:", pairingError)
      return { error: "Failed to unlink paired profiles. Please contact support." }
    }

    // 2. Clean RESTRICT FK columns on auth.users(id) — these block deleteUser()
    // GOTCHA: cad_lab_projects, xray_scans, forge_contracts, manufacturing_orders
    // have created_by NOT NULL — can't set null, must DELETE rows.
    // cad_assemblies.creator_id is nullable (was wrongly listed as component_catalogue).
    const authFkCleanup = await Promise.allSettled([
      adminSupabase.from("cad_lab_projects").delete().eq("created_by", user.id),
      adminSupabase.from("xray_scans").delete().eq("created_by", user.id),
      adminSupabase.from("forge_contracts").delete().eq("created_by", user.id),
      adminSupabase.from("manufacturing_orders").delete().eq("created_by", user.id),
      adminSupabase.from("finance_expenses").update({ approved_by: null }).eq("approved_by", user.id),
      adminSupabase.from("cad_grammar_versions").update({ created_by: null }).eq("created_by", user.id),
      adminSupabase.from("cad_assemblies").update({ creator_id: null }).eq("creator_id", user.id),
      adminSupabase.from("waitlist").update({ approved_by: null }).eq("approved_by", user.id),
    ])

    // 3. Clean RESTRICT FK columns on profiles(id)
    // GOTCHA: activity_events has ON DELETE CASCADE + NOT NULL — handled automatically, skip.
    // sheets_service_credentials was DROPPED (migration 20260227200001) — skip.
    const profileFkCleanup = await Promise.allSettled([
      adminSupabase.from("manufacturing_rfqs").update({ created_by: null }).eq("created_by", user.id),
      adminSupabase.from("task_shares").delete().or(`shared_by.eq.${user.id},shared_with_user_id.eq.${user.id}`),
      adminSupabase.from("objective_shares").delete().or(`shared_by.eq.${user.id},shared_with_user_id.eq.${user.id}`),
      adminSupabase.from("task_files").update({ uploaded_by: null }).eq("uploaded_by", user.id),
      adminSupabase.from("marketplace_recommendations").update({ dismissed_by: null }).eq("dismissed_by", user.id),
      adminSupabase.from("rfq_clarifications").update({ answered_by: null }).eq("answered_by", user.id),
      adminSupabase.from("agent_action_log").update({ requires_approval_from: null, approved_by: null }).or(`requires_approval_from.eq.${user.id},approved_by.eq.${user.id}`),
    ])

    // 4. Standard cleanup: Remove from teams, tasks, memberships
    const membershipCleanup = await Promise.allSettled([
      adminSupabase.from("task_assignees").delete().eq("profile_id", user.id),
      adminSupabase.from("tasks").update({ assignee_id: null }).eq("assignee_id", user.id),
      adminSupabase.from("team_members").delete().eq("profile_id", user.id),
      adminSupabase.from("foundry_memberships").delete().eq("user_id", user.id),
    ])

    // Log non-fatal cleanup errors (GDPR data is already handled)
    const allCleanup = [...authFkCleanup, ...profileFkCleanup, ...membershipCleanup]
    const cleanupErrors = allCleanup
      .map((r) =>
        r.status === "rejected"
          ? r.reason
          : r.value.error
      )
      .filter(Boolean)

    if (cleanupErrors.length > 0) {
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
