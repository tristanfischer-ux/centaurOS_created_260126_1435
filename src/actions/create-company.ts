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
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { rateLimit } from "@/lib/security/rate-limit"

function generateSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
  return slug || "company"
}

export async function createCompanyFoundry(params: {
  companyName: string
  industry?: string
  stage?: string
}): Promise<{ success: true; foundryId: string; foundryName: string } | { success: false; error: string }> {
  return withUser(async ({ supabase, user }) => {
    // SECURITY: Rate limit foundry creation — 5 attempts per hour per user
    const rl = await rateLimit('api', `create-company:${user.id}`, { limit: 5, window: 60 * 60 * 1000 })
    if (!rl.success) {
      return { success: false as const, error: 'Too many attempts. Please try again later.' }
    }

    const { companyName: rawName, industry, stage } = params

    // VALIDATION: Company name is required
    if (!rawName || rawName.trim().length < 2) {
      return { success: false as const, error: "Company name must be at least 2 characters" }
    }

    // SECURITY: Sanitize inputs — strip HTML tags, control chars, zero-width chars
    // (parameterized queries prevent SQL injection, React escapes on render)
    const companyName = rawName.trim()
      .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .slice(0, 100)
      .replace(/<[^>]*>/g, '')
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
    // SECURITY: Treat query failure as error (not as "count is 0")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foundries.owner_id not in generated types
    const { count: existingCount, error: countError } = await (supabase as any)
      .from("foundries")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)

    if (countError) {
      console.error("[createCompanyFoundry] Rate limit check failed:", countError)
      return { success: false as const, error: "Unable to verify workspace limit" }
    }

    if (existingCount != null && existingCount >= 3) {
      return { success: false as const, error: "You can create a maximum of 3 company workspaces" }
    }

    // Create the foundry
    const baseSlug = generateSlug(companyName)
    const uniqueSlug = `${baseSlug}-${user.id.slice(0, 6)}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foundries columns (industry, stage, owner_id) not in generated types
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foundries columns not in generated types
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foundry_memberships table not in generated types
    const { error: membershipError } = await (supabase as any).from("foundry_memberships").insert({
      user_id: user.id,
      foundry_id: foundryId,
      role: "Founder",
      is_primary: false,
      joined_at: new Date().toISOString(),
    })

    if (membershipError) {
      // Rollback: delete the orphaned foundry using admin client
      // SECURITY: User's RLS client may not have DELETE policy on foundries
      console.error("[createCompanyFoundry] Membership creation failed:", membershipError)
      const adminClient = createAdminClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin client type doesn't match user client type
      await (adminClient as any).from("foundries").delete().eq("id", foundryId)
      return { success: false as const, error: "Failed to set up workspace membership" }
    }

    // DECISION: Upgrade profile role to Founder if currently Executive.
    // One-way upgrade — Founder has all Executive privileges plus owns a workspace.
    // SECURITY: Only upgrade Executive→Founder, not Apprentice (prevents privilege escalation)
    if (profile.role === "Executive") {
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

    // DECISION: Demo forge products (weather station, air quality sensor, drone mount)
    // removed — pre-canned text walls with no images or CAD were hurting first impressions
    // more than helping. Clean empty state + "What do you want to build?" hero is better.

    {
      const { error: e } = await supabase.rpc("seed_founder_demo_data", { p_foundry_id: foundryId, p_user_id: user.id })
      if (e) console.warn("[createCompanyFoundry] seed_founder_demo_data failed:", e.message)
    }

    {
      const { error: e } = await supabase.rpc("seed_founder_demo_data_expanded", { p_foundry_id: foundryId, p_user_id: user.id })
      if (e) console.warn("[createCompanyFoundry] seed_founder_demo_data_expanded failed:", e.message)
    }

    revalidatePath("/", "layout")

    return {
      success: true as const,
      foundryId,
      foundryName: companyName,
    }
  }) as Promise<{ success: true; foundryId: string; foundryName: string } | { success: false; error: string }>
}

/**
 * Converts the user's current sandbox foundry into a real company.
 * Updates the foundry name, slug, and sets is_sandbox = false.
 * Used during onboarding when the user enters their company name.
 *
 * @param params.companyName - Required company name (min 2 chars)
 * @returns Success with foundry details, or error
 */
export async function convertSandboxToCompany(params: {
  companyName: string
}): Promise<{ success: true; foundryId: string; foundryName: string } | { success: false; error: string }> {
  return withUser(async ({ supabase, user }) => {
    const { companyName: rawName } = params

    // VALIDATION: Company name is required
    if (!rawName || rawName.trim().length < 2) {
      return { success: false as const, error: "Company name must be at least 2 characters" }
    }

    // SECURITY: Sanitize input
    const companyName = rawName.trim()
      .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .slice(0, 100)
      .replace(/<[^>]*>/g, '')

    // Fetch user's current foundry
    const { data: profile } = await supabase
      .from("profiles")
      .select("foundry_id, active_foundry_id, role")
      .eq("id", user.id)
      .single()

    const foundryId = profile?.active_foundry_id || profile?.foundry_id
    if (!foundryId) {
      return { success: false as const, error: "No workspace found for your account" }
    }

    // Verify it's a sandbox
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- is_sandbox not in generated types
    const { data: foundry } = await (supabase as any)
      .from("foundries")
      .select("id, is_sandbox")
      .eq("id", foundryId)
      .single()

    if (!foundry?.is_sandbox) {
      return { success: false as const, error: "Your workspace has already been set up as a company" }
    }

    // Generate slug with collision retry
    const baseSlug = generateSlug(companyName)
    let slug = `${baseSlug}-${user.id.slice(0, 6)}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foundries columns not in generated types
    let updateResult = await (supabase as any)
      .from("foundries")
      .update({ name: companyName, slug, is_sandbox: false })
      .eq("id", foundryId)

    // Retry with timestamp slug on conflict
    if (updateResult.error) {
      slug = `${baseSlug}-${Date.now().toString(36)}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateResult = await (supabase as any)
        .from("foundries")
        .update({ name: companyName, slug, is_sandbox: false })
        .eq("id", foundryId)

      if (updateResult.error) {
        console.error("[convertSandboxToCompany] Update failed:", updateResult.error)
        return { success: false as const, error: "Failed to update your workspace" }
      }
    }

    // Upgrade Executive → Founder (same as createCompanyFoundry)
    if (profile?.role === "Executive") {
      await supabase
        .from("profiles")
        .update({ role: "Founder" })
        .eq("id", user.id)
    }

    // Clear cache so sidebar shows new name
    clearFoundryCache(user.id)
    revalidatePath("/", "layout")

    return {
      success: true as const,
      foundryId,
      foundryName: companyName,
    }
  }) as Promise<{ success: true; foundryId: string; foundryName: string } | { success: false; error: string }>
}
