"use server"

/**
 * @file create-company.ts
 *
 * @description Server action for post-signup company/foundry creation.
 * Any executive can create a company workspace, giving them a second foundry
 * with Founder role while keeping their marketplace presence in forge-guild.
 *
 * @security Requires authenticated user with account_type 'team_builder'.
 * Rate limited to 3 foundry creations per user.
 */

import { withUser } from "@/lib/server-action-utils"
import { clearFoundryCache } from "@/lib/supabase/foundry-context"
import { revalidatePath } from "next/cache"

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
}

export async function createCompanyFoundry(params: {
  companyName: string
  industry?: string
  stage?: string
}): Promise<{ success: true; foundryId: string; foundryName: string } | { success: false; error: string }> {
  return withUser(async ({ supabase, user }) => {
    const { companyName: rawName, industry, stage } = params

    // VALIDATION: Company name is required
    if (!rawName || rawName.trim().length < 2) {
      return { success: false as const, error: "Company name must be at least 2 characters" }
    }

    // SECURITY: Sanitize inputs — strip HTML tags but don't entity-encode
    // (parameterized queries prevent SQL injection, React escapes on render)
    const companyName = rawName.trim().slice(0, 100).replace(/<[^>]*>/g, '')
    const sanitizedIndustry = industry ? industry.trim().slice(0, 100).replace(/<[^>]*>/g, '') : null
    const sanitizedStage = stage ? stage.trim().slice(0, 100).replace(/<[^>]*>/g, '') : null

    // VALIDATION: Check account type
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_type, role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.account_type !== "team_builder") {
      return { success: false as const, error: "Only team builder accounts can create companies" }
    }

    // RATE LIMIT: Max 3 foundry creations per user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: existingCount } = await (supabase as any)
      .from("foundries")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)

    if (existingCount != null && existingCount >= 3) {
      return { success: false as const, error: "You can create a maximum of 3 company workspaces" }
    }

    // Create the foundry
    const baseSlug = generateSlug(companyName)
    const uniqueSlug = `${baseSlug}-${user.id.slice(0, 6)}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let foundryResult = await (supabase as any)
      .from("foundries")
      .insert({
        name: companyName,
        slug: uniqueSlug,
        industry: sanitizedIndustry,
        stage: sanitizedStage,
        owner_id: user.id,
      })
      .select("id")
      .single()

    // Retry with timestamp slug on conflict
    if (foundryResult.error) {
      const retrySlug = `${baseSlug}-${Date.now().toString(36)}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      foundryResult = await (supabase as any)
        .from("foundries")
        .insert({
          name: companyName,
          slug: retrySlug,
          industry: sanitizedIndustry,
          stage: sanitizedStage,
          owner_id: user.id,
        })
        .select("id")
        .single()

      if (foundryResult.error) {
        console.error("[createCompanyFoundry] Foundry creation failed:", foundryResult.error)
        return { success: false as const, error: "Failed to create company workspace" }
      }
    }

    const foundryId = foundryResult.data.id as string

    // Create foundry membership with Founder role
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: membershipError } = await (supabase as any).from("foundry_memberships").insert({
      user_id: user.id,
      foundry_id: foundryId,
      role: "Founder",
      is_primary: false,
      joined_at: new Date().toISOString(),
    })

    if (membershipError) {
      // Rollback: delete the orphaned foundry
      console.error("[createCompanyFoundry] Membership creation failed:", membershipError)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("foundries").delete().eq("id", foundryId)
      return { success: false as const, error: "Failed to set up workspace membership" }
    }

    // DECISION: Upgrade profile role to Founder if currently Executive.
    // One-way upgrade — Founder has all Executive privileges plus owns a workspace.
    if (profile.role === "Executive" || profile.role === "Apprentice") {
      await supabase
        .from("profiles")
        .update({ role: "Founder" })
        .eq("id", user.id)
    }

    // Switch active foundry to the new one
    await supabase.rpc("switch_active_foundry", {
      p_user_id: user.id,
      p_foundry_id: foundryId,
    })

    // Clear foundry cache
    clearFoundryCache(user.id)

    // Seed demo data
    const demoRpcs = [
      "seed_demo_forge_concept",
      "seed_demo_air_quality_sensor",
      "seed_demo_drone_motor_mount",
    ] as const

    for (const rpc of demoRpcs) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc(rpc, { p_foundry_id: foundryId, p_user_id: user.id })
      } catch (e) {
        console.warn(`[createCompanyFoundry] ${rpc} failed:`, e)
      }
    }

    try {
      await supabase.rpc("seed_founder_demo_data", { p_foundry_id: foundryId, p_user_id: user.id })
    } catch (e) {
      console.warn("[createCompanyFoundry] seed_founder_demo_data failed:", e)
    }

    try {
      await supabase.rpc("seed_founder_demo_data_expanded", { p_foundry_id: foundryId, p_user_id: user.id })
    } catch (e) {
      console.warn("[createCompanyFoundry] seed_founder_demo_data_expanded failed:", e)
    }

    revalidatePath("/", "layout")

    return {
      success: true as const,
      foundryId,
      foundryName: companyName,
    }
  }) as Promise<{ success: true; foundryId: string; foundryName: string } | { success: false; error: string }>
}
