/**
 * @file project-ownership.ts — Foundry-scope checks for CAD Lab projects.
 *
 * @description Guards server actions that accept a client-supplied `projectId`
 * and then operate on it via `createAdminClient()` (bypassing RLS). Without
 * this check, a logged-in user from foundry A could pass a `projectId` owned
 * by foundry B and (a) burn foundry A's AI quota writing to foundry B's
 * storage, or (b) overwrite files in foundry B's `xray-images/<projectId>/`
 * namespace. See FORGE-REVIEW-TRACKER.md (Design stage P0 #1).
 *
 * @security This is the canonical ownership check for all CAD Lab actions
 * that use `createAdminClient()`. Call it early in every action that accepts
 * `projectId` from the client.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Verifies that `projectId` is a valid UUID and belongs to `foundryId`.
 *
 * @param supabase - Authenticated (non-admin) Supabase client — the RLS client
 *   is deliberate: the caller must themselves be able to see this project.
 * @param projectId - Client-supplied project UUID
 * @param foundryId - Caller's foundry ID (from withAuth / withAIGate)
 * @returns null on success, or an error string suitable for returning as
 *   `{ error }` from a server action.
 */
export async function ensureCadLabProjectOwnership(
  supabase: SupabaseClient,
  projectId: string,
  foundryId: string,
): Promise<string | null> {
  if (!projectId || !UUID_RE.test(projectId)) {
    return "Invalid project ID"
  }
  if (!foundryId) {
    return "No foundry context"
  }

  const { data, error } = await supabase
    .from("cad_lab_projects")
    .select("foundry_id")
    .eq("id", projectId)
    .maybeSingle()

  if (error) {
    console.error("[project-ownership] Lookup failed:", error.message)
    return "Project lookup failed"
  }
  if (!data) {
    // Either the project doesn't exist or RLS hid it from the caller — both
    // map to "not yours".
    return "Project not found"
  }
  if ((data.foundry_id as string | null) !== foundryId) {
    console.warn("[project-ownership] Cross-foundry access blocked", {
      projectId,
      callerFoundry: foundryId,
      projectFoundry: data.foundry_id,
    })
    return "Project not found"
  }
  return null
}
