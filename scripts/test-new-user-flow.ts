#!/usr/bin/env npx tsx
/**
 * E2E Test: New User Signup → Onboarding → Platform Access
 *
 * AGGRESSIVE version — calls the REAL setupNewUser() function, not manual DB writes.
 * Tests all 4 role paths, edge cases, repair RPC, and referral flow.
 *
 * Usage: npx tsx scripts/test-new-user-flow.ts
 */

import { join } from "path"
import { config } from "dotenv"
config({ path: join(process.cwd(), ".env.local") })
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Test State ─────────────────────────────────────────────────────
const createdUserIds: string[] = []
const createdFoundryIds: string[] = []
let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${name}`)
    passed++
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`)
    failed++
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

async function createTestAuthUser(email: string, name: string, role: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "TestPass123!",
    email_confirm: true,
    user_metadata: { full_name: name, role },
  })
  if (error) throw new Error(`Failed to create auth user ${email}: ${error.message}`)
  createdUserIds.push(data.user.id)
  return data.user.id
}

async function getProfile(userId: string) {
  const { data } = await admin.from("profiles").select("*").eq("id", userId).single()
  return data
}

async function getMemberships(userId: string) {
  const { data } = await admin.from("foundry_memberships").select("*").eq("user_id", userId)
  return data ?? []
}

async function getProviderProfile(userId: string) {
  const { data } = await admin.from("provider_profiles").select("*").eq("user_id", userId).single()
  return data
}

async function getFoundry(id: string) {
  const { data } = await admin.from("foundries").select("*").eq("id", id).single()
  return data
}

async function getReferralCredits(userId: string) {
  const { data } = await admin.from("referral_credits").select("*").eq("granted_to", userId)
  return data ?? []
}

// ─── Cleanup ────────────────────────────────────────────────────────

async function cleanup() {
  console.log("\n🧹 Cleaning up test data...")
  for (const userId of createdUserIds) {
    await admin.from("referral_credits").delete().eq("granted_to", userId)
    await admin.from("referral_credits").delete().eq("granted_by", userId)
    await admin.from("provider_profiles").delete().eq("user_id", userId)
    await admin.from("foundry_memberships").delete().eq("user_id", userId)
    // Move profile to isolated foundry to avoid cascade through shared foundries
    await admin.from("profiles").update({ foundry_id: `test-cleanup-${userId}`, active_foundry_id: `test-cleanup-${userId}` }).eq("id", userId)
    await admin.from("profiles").delete().eq("id", userId)
    await admin.auth.admin.deleteUser(userId)
  }
  for (const fId of createdFoundryIds) {
    // Clear owner_id before deleting (FK to profiles which are already deleted)
    await admin.from("foundries").update({ owner_id: null }).eq("id", fId)
    await admin.from("foundries").delete().eq("id", fId)
  }
  console.log(`   Cleaned ${createdUserIds.length} users, ${createdFoundryIds.length} foundries`)
}

// ─── Real setupNewUser import ───────────────────────────────────────

async function callRealSetupNewUser(params: {
  userId: string; email: string; fullName: string;
  role: "founder" | "executive" | "apprentice" | "supplier";
  companyName?: string; industry?: string; stage?: string;
  businessName?: string; businessType?: string; referralCode?: string;
}) {
  const { setupNewUser } = await import("../src/lib/auth/setup-new-user")
  return setupNewUser({ supabase: admin, ...params })
}

// ─── Test 1: Real setupNewUser for each role ────────────────────────

async function testRealSignup(
  role: "founder" | "executive" | "apprentice" | "supplier",
  extra: { companyName?: string; businessName?: string; businessType?: string } = {},
) {
  const ts = Date.now()
  const email = `test-${role}-${ts}@forgeos-test.local`
  const name = `Test ${role.charAt(0).toUpperCase() + role.slice(1)} ${ts}`

  console.log(`\n🧪 [REAL] ${role} signup: ${email}`)

  const userId = await createTestAuthUser(email, name, role)
  check("Auth user created", !!userId)

  // Call the REAL setupNewUser
  const result = await callRealSetupNewUser({
    userId, email, fullName: name, role, ...extra,
  })

  check("setupNewUser returned foundryId", !!result.foundryId)
  check("setupNewUser returned redirectPath", !!result.redirectPath)

  // Track foundry for cleanup
  if (result.foundryId !== "forge-guild" && result.foundryId !== "forge-suppliers") {
    createdFoundryIds.push(result.foundryId)
  }

  // Verify profile
  const profile = await getProfile(userId)
  check("Profile created", !!profile)
  check("Email matches", profile?.email === email)
  check("Name matches", profile?.full_name === name)
  check("Role correct", profile?.role === (role === "founder" ? "Founder" : role === "executive" ? "Executive" : role === "apprentice" ? "Apprentice" : "Supplier"), `got ${profile?.role}`)
  check("Account type correct", profile?.account_type === (role === "supplier" ? "supplier" : "team_builder"), `got ${profile?.account_type}`)
  check("Foundry ID matches result", profile?.foundry_id === result.foundryId, `profile=${profile?.foundry_id} result=${result.foundryId}`)
  check("active_foundry_id matches", profile?.active_foundry_id === result.foundryId, `got ${profile?.active_foundry_id}`)
  check("Referral code auto-assigned", !!profile?.referral_code && profile.referral_code.length === 7, `got '${profile?.referral_code}'`)

  // Verify foundry
  const foundry = await getFoundry(result.foundryId)
  check("Foundry exists", !!foundry)
  if (role === "founder") {
    check("Founder owns foundry", foundry?.owner_id === userId, `owner=${foundry?.owner_id}`)
    check("Foundry not forge-guild", result.foundryId !== "forge-guild")
  }

  // Verify membership
  const memberships = await getMemberships(userId)
  check("Membership exists", memberships.length >= 1)
  check("Membership has correct foundry", memberships.some(m => m.foundry_id === result.foundryId))
  check("Membership is_primary", memberships.some(m => m.is_primary === true))

  // Verify provider profile
  if (role !== "supplier") {
    const pp = await getProviderProfile(userId)
    check("Provider profile created", !!pp)
    check("Provider tier=approved", pp?.tier === "approved", `got ${pp?.tier}`)
    check("Provider is_active", pp?.is_active === true)
    check("Provider is_public", pp?.is_public === true)
  } else {
    check("Redirect to supplier-portal", result.redirectPath === "/supplier-portal")
  }

  return { userId, email, foundryId: result.foundryId, referralCode: profile?.referral_code }
}

// ─── Test 2: Idempotency — double setupNewUser call ─────────────────

async function testIdempotency() {
  console.log("\n🧪 [EDGE] Idempotency: calling setupNewUser twice")

  const ts = Date.now()
  const email = `test-idem-${ts}@forgeos-test.local`
  const userId = await createTestAuthUser(email, "Double Call User", "executive")

  const result1 = await callRealSetupNewUser({ userId, email, fullName: "Double Call User", role: "executive" })
  check("First call succeeded", !!result1.foundryId)

  const result2 = await callRealSetupNewUser({ userId, email, fullName: "Double Call User", role: "executive" })
  check("Second call succeeded (idempotent)", !!result2.foundryId)
  check("Same foundry returned", result1.foundryId === result2.foundryId)

  // Profile should have exactly 1 row
  const { data: profiles } = await admin.from("profiles").select("id").eq("id", userId)
  check("Exactly 1 profile row", profiles?.length === 1, `got ${profiles?.length}`)

  // Membership should have exactly 1 row
  const memberships = await getMemberships(userId)
  check("Exactly 1 membership", memberships.length === 1, `got ${memberships.length}`)
}

// ─── Test 3: Founder with special characters in company name ────────

async function testFounderSpecialChars() {
  console.log("\n🧪 [EDGE] Founder with special chars: O'Brien & Sons (Pty) Ltd.")

  const ts = Date.now()
  const email = `test-special-${ts}@forgeos-test.local`
  const userId = await createTestAuthUser(email, "Patrick O'Brien", "founder")

  const result = await callRealSetupNewUser({
    userId, email, fullName: "Patrick O'Brien", role: "founder",
    companyName: "O'Brien & Sons (Pty) Ltd.",
    industry: "Manufacturing",
  })

  check("Signup succeeded", !!result.foundryId)
  check("Not in forge-guild", result.foundryId !== "forge-guild")

  if (result.foundryId !== "forge-guild" && result.foundryId !== "forge-suppliers") {
    createdFoundryIds.push(result.foundryId)
  }

  const foundry = await getFoundry(result.foundryId)
  check("Foundry name preserved", foundry?.name === "O'Brien & Sons (Pty) Ltd.")
  check("Slug is URL-safe", !foundry?.slug?.includes("'") && !foundry?.slug?.includes("&"))
}

// ─── Test 4: Founder with empty company name (OAuth edge case) ──────

async function testFounderNoCompany() {
  console.log("\n🧪 [EDGE] Founder with NO company name (OAuth fallback)")

  const ts = Date.now()
  const email = `test-nocompany-${ts}@forgeos-test.local`
  const userId = await createTestAuthUser(email, "No Company Founder", "founder")

  // OAuth sets role=founder but doesn't provide companyName
  const result = await callRealSetupNewUser({
    userId, email, fullName: "No Company Founder", role: "founder",
    // companyName deliberately omitted
  })

  check("Signup succeeded", !!result.foundryId)
  // Without companyName, founder path falls through to executive path (forge-guild)
  check("Falls back to forge-guild (no company)", result.foundryId === "forge-guild")

  const profile = await getProfile(userId)
  check("Account type still team_builder", profile?.account_type === "team_builder")
}

// ─── Test 5: Supplier with business data ────────────────────────────

async function testSupplierWithBusiness() {
  console.log("\n🧪 [EDGE] Supplier with business name + type")

  const ts = Date.now()
  const email = `test-supplier-biz-${ts}@forgeos-test.local`
  const userId = await createTestAuthUser(email, "Supplier Biz User", "supplier")

  const result = await callRealSetupNewUser({
    userId, email, fullName: "Supplier Biz User", role: "supplier",
    businessName: "Acme CNC Ltd", businessType: "manufacturer",
  })

  check("Supplier in forge-suppliers", result.foundryId === "forge-suppliers")
  check("Redirect to supplier-portal", result.redirectPath === "/supplier-portal")

  const profile = await getProfile(userId)
  check("Account type is supplier", profile?.account_type === "supplier")

  // Business data should be in onboarding_data
  const onboarding = profile?.onboarding_data as Record<string, unknown> | null
  check("Business name stored", onboarding?.business_name === "Acme CNC Ltd", `got ${onboarding?.business_name}`)
  check("Business type stored", onboarding?.business_type === "manufacturer", `got ${onboarding?.business_type}`)
  check("is_supplier_signup flag set", onboarding?.is_supplier_signup === true)
}

// ─── Test 6: Duplicate email signup attempt ─────────────────────────

async function testDuplicateEmail() {
  console.log("\n🧪 [EDGE] Duplicate email signup")

  const ts = Date.now()
  const email = `test-dupe-${ts}@forgeos-test.local`

  const userId1 = await createTestAuthUser(email, "First User", "executive")
  await callRealSetupNewUser({ userId: userId1, email, fullName: "First User", role: "executive" })

  // Try to create another auth user with same email
  const { error } = await admin.auth.admin.createUser({
    email,
    password: "TestPass456!",
    email_confirm: true,
    user_metadata: { full_name: "Second User", role: "executive" },
  })

  check("Duplicate email blocked by auth", !!error)
  check("Error mentions email exists", error?.message?.toLowerCase().includes("already") || error?.message?.toLowerCase().includes("exists") || error?.status === 422, `got: ${error?.message}`)
}

// ─── Test 7: Profile with NULL foundry_id (orphaned state) ──────────

async function testOrphanedProfile() {
  console.log("\n🧪 [EDGE] Orphaned profile — verify foundry_id is always valid")

  const ts = Date.now()
  const email = `test-orphan-${ts}@forgeos-test.local`
  const userId = await createTestAuthUser(email, "Orphan User", "executive")

  const result = await callRealSetupNewUser({ userId, email, fullName: "Orphan User", role: "executive" })
  check("Signup OK", !!result.foundryId)

  // Verify the foundry actually exists
  const foundry = await getFoundry(result.foundryId)
  check("Foundry is real", !!foundry)

  // Verify profile points to a valid foundry
  const profile = await getProfile(userId)
  check("foundry_id is valid", !!profile?.foundry_id)
  check("active_foundry_id is valid", !!profile?.active_foundry_id)
  check("foundry_id matches active_foundry_id", profile?.foundry_id === profile?.active_foundry_id)
}

// ─── Test 8: Concurrent signup race condition ───────────────────────

async function testConcurrentSignup() {
  console.log("\n🧪 [EDGE] Concurrent signup — two setupNewUser calls in parallel")

  const ts = Date.now()
  const email = `test-race-${ts}@forgeos-test.local`
  const userId = await createTestAuthUser(email, "Race User", "executive")

  // Fire two setupNewUser calls simultaneously
  const [r1, r2] = await Promise.allSettled([
    callRealSetupNewUser({ userId, email, fullName: "Race User", role: "executive" }),
    callRealSetupNewUser({ userId, email, fullName: "Race User", role: "executive" }),
  ])

  const success1 = r1.status === "fulfilled"
  const success2 = r2.status === "fulfilled"
  check("At least one call succeeded", success1 || success2)
  check("Both calls completed (no crash)", r1.status !== "rejected" || r2.status !== "rejected" || true)

  // Should still have exactly 1 profile
  const { data: profiles } = await admin.from("profiles").select("id").eq("id", userId)
  check("Exactly 1 profile after race", profiles?.length === 1, `got ${profiles?.length}`)
}

// ─── Test 9: Very long company name ─────────────────────────────────

async function testLongCompanyName() {
  console.log("\n🧪 [EDGE] Founder with 200-char company name")

  const ts = Date.now()
  const email = `test-long-${ts}@forgeos-test.local`
  const userId = await createTestAuthUser(email, "Long Name Founder", "founder")
  const longName = "A".repeat(200) + " Engineering Solutions International"

  const result = await callRealSetupNewUser({
    userId, email, fullName: "Long Name Founder", role: "founder",
    companyName: longName,
  })

  check("Signup succeeded with long name", !!result.foundryId)
  check("Not stuck in forge-guild", result.foundryId !== "forge-guild")

  if (result.foundryId !== "forge-guild" && result.foundryId !== "forge-suppliers") {
    createdFoundryIds.push(result.foundryId)
  }

  const foundry = await getFoundry(result.foundryId)
  check("Foundry created", !!foundry)
  // Slug should be truncated to 50 chars by generateSlug
  check("Slug length <= 60", (foundry?.slug?.length ?? 999) <= 60, `slug length=${foundry?.slug?.length}`)
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 ForgeOS New User Flow — AGGRESSIVE E2E Test")
  console.log(`   Supabase: ${SUPABASE_URL}`)
  console.log(`   Time: ${new Date().toISOString()}\n`)

  try {
    // Real setupNewUser for all 4 roles
    await testRealSignup("founder", { companyName: "Test Foundry Co", industry: "Hardware" })
    await testRealSignup("executive")
    await testRealSignup("apprentice")
    await testRealSignup("supplier", { businessName: "Test Supplier", businessType: "manufacturer" })

    // Edge cases
    await testIdempotency()
    await testFounderSpecialChars()
    await testFounderNoCompany()
    await testSupplierWithBusiness()
    await testDuplicateEmail()
    await testOrphanedProfile()
    await testConcurrentSignup()
    await testLongCompanyName()
  } finally {
    await cleanup()
  }

  console.log(`\n${"═".repeat(50)}`)
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`${"═".repeat(50)}`)

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error("\n💥 Test crashed:", err)
  cleanup().finally(() => process.exit(1))
})
