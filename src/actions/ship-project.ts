"use server"

/**
 * @file ship-project.ts — Ship & hand off a V2 project to Operations.
 *
 * @description Terminal state transition on a cad_lab_projects row. The
 * Launch page's "Ship and hand off" button calls this. Writes shipped_at +
 * shipped_by, drops an audit_log row, and returns the timestamp so the
 * client can flip into the "shipped" read-only render.
 *
 * Business rules (re-verified server-side — do NOT rely on client gating):
 *   1. Brief must be locked (brief_locked_at is not null). Shipping
 *      without a locked brief is nonsensical — there is no canonical spec
 *      to hand off.
 *   2. Project cannot already be shipped. Shipping is terminal; the only
 *      way past it is a Fork (new project row).
 *   3. Caller must be in the owning foundry (withAuth + foundry check).
 *
 * All three checks are load-bearing for tenant isolation and data
 * integrity. Failing any of them returns a typed errorCode; the Launch
 * view renders a matching inline message.
 *
 * @related
 *   - UI:     src/app/(platform)/the-forge-v2/projects/[id]/launch/
 *   - Table:  cad_lab_projects (shipped_at, shipped_by added in migration
 *             20260422010000_cad_lab_ship.sql)
 *   - Audit:  audit_log row with action = cad_lab_project.shipped
 */

import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"

// ─── Types ────────────────────────────────────────────────────────────

export type ShipProjectResult =
    | { ok: true; shippedAt: string }
    | {
          ok: false
          error: string
          errorCode:
              | "PROJECT_NOT_FOUND"
              | "PROJECT_FORBIDDEN"
              | "BRIEF_NOT_LOCKED"
              | "ALREADY_SHIPPED"
              | "INTERNAL"
      }

// ─── Action ────────────────────────────────────────────────────────────

export async function shipCadLabProject(
    projectId: string,
): Promise<ShipProjectResult> {
    return withAuth<ShipProjectResult>(async ({ user, foundryId }) => {
        const admin = createAdminClient()

        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, brief_locked_at, shipped_at")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
            return {
                ok: false,
                error: "Couldn't load project.",
                errorCode: "INTERNAL",
            }
        }
        if (!project) {
            return {
                ok: false,
                error: "Project not found.",
                errorCode: "PROJECT_NOT_FOUND",
            }
        }
        if (project.foundry_id !== foundryId) {
            // SECURITY: don't leak the existence of other-foundry projects.
            return {
                ok: false,
                error: "Project not found.",
                errorCode: "PROJECT_FORBIDDEN",
            }
        }
        if (!project.brief_locked_at) {
            return {
                ok: false,
                error:
                    "Lock the brief first — shipping without a locked spec is not supported.",
                errorCode: "BRIEF_NOT_LOCKED",
            }
        }
        if (project.shipped_at) {
            return {
                ok: false,
                error:
                    "This project has already been shipped. Fork it to start a new build.",
                errorCode: "ALREADY_SHIPPED",
            }
        }

        const shippedAtIso = new Date().toISOString()

        const { error: updateErr } = await admin
            .from("cad_lab_projects")
            .update({
                shipped_at: shippedAtIso,
                shipped_by: user.id,
            })
            .eq("id", projectId)

        if (updateErr) {
            console.error(
                "[ship-project] update failed:",
                updateErr.message ?? updateErr,
            )
            return {
                ok: false,
                error: "Couldn't record the ship — try again in a moment.",
                errorCode: "INTERNAL",
            }
        }

        // Audit log — non-fatal on failure so a temporary audit outage
        // doesn't block a legitimate ship. Matches brief-lock pattern.
        try {
            await admin.from("audit_log").insert({
                foundry_id: foundryId,
                user_id: user.id,
                action: "cad_lab_project.shipped",
                entity_type: "cad_lab_project",
                entity_id: projectId,
                section: "forge",
                metadata: {
                    shippedAt: shippedAtIso,
                },
            })
        } catch (auditErr) {
            console.error(
                "[ship-project] audit log write failed (non-fatal):",
                auditErr instanceof Error ? auditErr.message : auditErr,
            )
        }

        return { ok: true, shippedAt: shippedAtIso }
    })
}
