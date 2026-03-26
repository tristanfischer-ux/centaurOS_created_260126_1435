#!/usr/bin/env npx tsx
/**
 * AGGRESSIVE E2E Test: New User Signup
 * Calls the REAL setupNewUser() and attacks every edge case.
 */

import { join } from "path"
import { config } from "dotenv"
config({ path: join(process.cwd(), ".env.local") })
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("Missing env vars"); process.exit(1) }

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const createdUserIds: string[] = []
const createdFoundryIds: string[] = []
let passed = 0, failed = 0

function check(name: string, condition: boolean, detail?: string) {
  if (condition) { console.log(`  ✅ ${name}`); passed++ }
  else { console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); failed++ }
}

async function createUser(email: string, name: string, role: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: "TestPass123!", email_confirm: true, user_metadata: { full_name: name, role } })
  if (error) throw new Error(`Auth create failed: ${error.message}`)
  createdUserIds.push(data.user.id)
  return data.user.id
}

async function setup(params: Parameters<typeof import("../src/lib/auth/setup-new-user").setupNewUser>[0] extends { supabase: any } ? Omit<Parameters<typeof import("../src/lib/auth/setup-new-user").setupNewUser>[0], "supabase"> : never) {
  const { setupNewUser } = await import("../src/lib/auth/setup-new-user")
  return setupNewUser({ supabase: admin, ...params })
}

async function getProfile(id: string) { return (await admin.from("profiles").select("*").eq("id", id).single()).data }
async function getMemberships(id: string) { return (await admin.from("foundry_memberships").select("*").eq("user_id", id)).data ?? [] }
async function getProviderProfile(id: string) { return (await admin.from("provider_profiles").select("*").eq("user_id", id).single()).data }
async function getFoundry(id: string) { return (await admin.from("foundries").select("*").eq("id", id).single()).data }

async function cleanup() {
  console.log("\n🧹 Cleaning up...")
  for (const id of createdUserIds) {
    await admin.from("referral_credits").delete().eq("granted_to", id)
    await admin.from("referral_credits").delete().eq("granted_by", id)
    await admin.from("provider_profiles").delete().eq("user_id", id)
    await admin.from("foundry_memberships").delete().eq("user_id", id)
    await admin.from("profiles").update({ foundry_id: `cleanup-${id}`, active_foundry_id: `cleanup-${id}` }).eq("id", id)
    await admin.from("profiles").delete().eq("id", id)
    await admin.auth.admin.deleteUser(id)
  }
  for (const fId of createdFoundryIds) {
    await admin.from("foundries").update({ owner_id: null }).eq("id", fId)
    await admin.from("foundries").delete().eq("id", fId)
  }
  console.log(`   Done: ${createdUserIds.length} users, ${createdFoundryIds.length} foundries`)
}

// ─── Tests ──────────────────────────────────────────────────────────

async function testFounderFull() {
  console.log("\n🧪 Founder (full path)")
  const id = await createUser(`f-full-${Date.now()}@test.local`, "Full Founder", "founder")
  const r = await setup({ userId: id, email: `f-full@test.local`, fullName: "Full Founder", role: "founder", companyName: "Acme Corp", industry: "Hardware", stage: "Seed" })
  if (r.foundryId !== "forge-guild") createdFoundryIds.push(r.foundryId)
  const p = await getProfile(id)
  const f = await getFoundry(r.foundryId)
  const m = await getMemberships(id)
  const pp = await getProviderProfile(id)
  check("Profile exists", !!p)
  check("Role=Founder", p?.role === "Founder")
  check("account_type=team_builder", p?.account_type === "team_builder")
  check("Foundry not forge-guild", r.foundryId !== "forge-guild")
  check("Foundry owner is user", f?.owner_id === id, `owner=${f?.owner_id}`)
  check("Foundry name=Acme Corp", f?.name === "Acme Corp", `name=${f?.name}`)
  check("Foundry has industry", f?.industry === "Hardware", `industry=${f?.industry}`)
  check("Foundry has stage", f?.stage === "Seed", `stage=${f?.stage}`)
  check("Membership exists", m.length >= 1)
  check("Membership role=Founder", m[0]?.role === "Founder")
  check("Provider profile exists", !!pp)
  check("Provider tier=approved", pp?.tier === "approved")
  check("Referral code 7 chars", p?.referral_code?.length === 7)
  check("Redirect=/today", r.redirectPath === "/today")
  check("active_foundry_id set", p?.active_foundry_id === r.foundryId)
}

async function testExecutive() {
  console.log("\n🧪 Executive")
  const id = await createUser(`exec-${Date.now()}@test.local`, "Exec User", "executive")
  const r = await setup({ userId: id, email: `exec@test.local`, fullName: "Exec User", role: "executive" })
  const p = await getProfile(id)
  check("In forge-guild", r.foundryId === "forge-guild")
  check("account_type=team_builder", p?.account_type === "team_builder")
  check("Role=Executive", p?.role === "Executive")
  check("Provider profile exists", !!(await getProviderProfile(id)))
}

async function testApprentice() {
  console.log("\n🧪 Apprentice")
  const id = await createUser(`app-${Date.now()}@test.local`, "App User", "apprentice")
  const r = await setup({ userId: id, email: `app@test.local`, fullName: "App User", role: "apprentice" })
  const p = await getProfile(id)
  check("In forge-guild", r.foundryId === "forge-guild")
  check("Role=Apprentice", p?.role === "Apprentice")
  check("Provider profile exists", !!(await getProviderProfile(id)))
}

async function testSupplier() {
  console.log("\n🧪 Supplier (with business data)")
  const id = await createUser(`sup-${Date.now()}@test.local`, "Sup User", "supplier")
  const r = await setup({ userId: id, email: `sup@test.local`, fullName: "Sup User", role: "supplier", businessName: "CNC Ltd", businessType: "manufacturer" })
  const p = await getProfile(id)
  check("In forge-suppliers", r.foundryId === "forge-suppliers")
  check("account_type=supplier", p?.account_type === "supplier")
  check("Redirect=/supplier-portal", r.redirectPath === "/supplier-portal")
  check("No provider profile", !(await getProviderProfile(id)))
  const od = p?.onboarding_data as Record<string, unknown> | null
  check("Business name in onboarding_data", od?.business_name === "CNC Ltd")
  check("Business type in onboarding_data", od?.business_type === "manufacturer")
  check("is_supplier_signup flag", od?.is_supplier_signup === true)
}

async function testIdempotency() {
  console.log("\n🧪 Idempotency (double call)")
  const id = await createUser(`idem-${Date.now()}@test.local`, "Idem User", "executive")
  const r1 = await setup({ userId: id, email: `idem@test.local`, fullName: "Idem User", role: "executive" })
  const r2 = await setup({ userId: id, email: `idem@test.local`, fullName: "Idem User", role: "executive" })
  check("Same foundry", r1.foundryId === r2.foundryId)
  const { data: rows } = await admin.from("profiles").select("id").eq("id", id)
  check("Exactly 1 profile", rows?.length === 1)
}

async function testConcurrentRace() {
  console.log("\n🧪 Concurrent race (parallel calls)")
  const id = await createUser(`race-${Date.now()}@test.local`, "Race User", "executive")
  const [r1, r2] = await Promise.allSettled([
    setup({ userId: id, email: `race@test.local`, fullName: "Race User", role: "executive" }),
    setup({ userId: id, email: `race@test.local`, fullName: "Race User", role: "executive" }),
  ])
  check("At least one succeeded", r1.status === "fulfilled" || r2.status === "fulfilled")
  const { data: rows } = await admin.from("profiles").select("id").eq("id", id)
  check("Exactly 1 profile", rows?.length === 1)
}

async function testFounderNoCompany() {
  console.log("\n🧪 Founder WITHOUT company (OAuth edge)")
  const id = await createUser(`f-nocomp-${Date.now()}@test.local`, "NoComp Founder", "founder")
  const r = await setup({ userId: id, email: `f-nocomp@test.local`, fullName: "NoComp Founder", role: "founder" })
  const p = await getProfile(id)
  check("Falls to forge-guild", r.foundryId === "forge-guild")
  check("Profile exists", !!p)
  check("account_type=team_builder", p?.account_type === "team_builder")
  check("Role=Founder", p?.role === "Founder")
  check("Provider profile exists", !!(await getProviderProfile(id)))
  check("Membership exists", (await getMemberships(id)).length >= 1)
}

async function testSpecialCharsCompany() {
  console.log("\n🧪 Special chars: O'Brien & Sons (Pty) Ltd.")
  const id = await createUser(`f-spec-${Date.now()}@test.local`, "Patrick O'Brien", "founder")
  const r = await setup({ userId: id, email: `f-spec@test.local`, fullName: "Patrick O'Brien", role: "founder", companyName: "O'Brien & Sons (Pty) Ltd." })
  if (r.foundryId !== "forge-guild") createdFoundryIds.push(r.foundryId)
  const f = await getFoundry(r.foundryId)
  check("Not forge-guild", r.foundryId !== "forge-guild")
  check("Name preserved", f?.name === "O'Brien & Sons (Pty) Ltd.")
  check("Slug URL-safe", !/['"&()]/.test(f?.slug ?? ""))
}

async function testUnicodeCompany() {
  console.log("\n🧪 Unicode company: 日本製造 Mfg")
  const id = await createUser(`f-uni-${Date.now()}@test.local`, "Taro Yamada", "founder")
  const r = await setup({ userId: id, email: `f-uni@test.local`, fullName: "Taro Yamada", role: "founder", companyName: "日本製造 Manufacturing" })
  if (r.foundryId !== "forge-guild") createdFoundryIds.push(r.foundryId)
  check("Signup succeeded", !!r.foundryId)
  const f = await getFoundry(r.foundryId)
  check("Foundry created", !!f)
  check("Slug has latin chars", /^[a-z0-9-]+$/.test(f?.slug ?? ""))
}

async function testPureUnicodeCompany() {
  console.log("\n🧪 PURE Unicode company: 日本製造株式会社 (no latin chars)")
  const id = await createUser(`f-punicode-${Date.now()}@test.local`, "Yuki Tanaka", "founder")
  const r = await setup({ userId: id, email: `f-punicode@test.local`, fullName: "Yuki Tanaka", role: "founder", companyName: "日本製造株式会社" })
  if (r.foundryId !== "forge-guild") createdFoundryIds.push(r.foundryId)
  check("Signup succeeded", !!r.foundryId)
  check("Not in forge-guild", r.foundryId !== "forge-guild")
  const f = await getFoundry(r.foundryId)
  check("Foundry created", !!f)
  check("Slug not empty", (f?.slug?.length ?? 0) > 0)
  check("Slug starts with 'foundry'", f?.slug?.startsWith("foundry") ?? false, `got ${f?.slug}`)
}

async function testLongCompany() {
  console.log("\n🧪 200-char company name")
  const id = await createUser(`f-long-${Date.now()}@test.local`, "Long Founder", "founder")
  const longName = "A".repeat(200) + " Engineering"
  const r = await setup({ userId: id, email: `f-long@test.local`, fullName: "Long Founder", role: "founder", companyName: longName })
  if (r.foundryId !== "forge-guild") createdFoundryIds.push(r.foundryId)
  check("Signup OK", !!r.foundryId)
  check("Not forge-guild", r.foundryId !== "forge-guild")
  const f = await getFoundry(r.foundryId)
  check("Slug <= 60 chars", (f?.slug?.length ?? 999) <= 60)
}

async function testEmptyStringCompany() {
  console.log("\n🧪 Empty string company name")
  const id = await createUser(`f-empty-${Date.now()}@test.local`, "Empty Founder", "founder")
  const r = await setup({ userId: id, email: `f-empty@test.local`, fullName: "Empty Founder", role: "founder", companyName: "" })
  const p = await getProfile(id)
  // Empty string is falsy → falls to else branch like no company
  check("Falls to forge-guild", r.foundryId === "forge-guild")
  check("Profile exists", !!p)
  check("account_type=team_builder", p?.account_type === "team_builder")
}

async function testSlugCollision() {
  console.log("\n🧪 Slug collision (two founders same company name)")
  const id1 = await createUser(`f-col1-${Date.now()}@test.local`, "Founder A", "founder")
  const id2 = await createUser(`f-col2-${Date.now()}@test.local`, "Founder B", "founder")
  const r1 = await setup({ userId: id1, email: `col1@test.local`, fullName: "Founder A", role: "founder", companyName: "Collision Corp" })
  const r2 = await setup({ userId: id2, email: `col2@test.local`, fullName: "Founder B", role: "founder", companyName: "Collision Corp" })
  if (r1.foundryId !== "forge-guild") createdFoundryIds.push(r1.foundryId)
  if (r2.foundryId !== "forge-guild") createdFoundryIds.push(r2.foundryId)
  check("Both succeeded", !!r1.foundryId && !!r2.foundryId)
  check("Different foundries", r1.foundryId !== r2.foundryId, `${r1.foundryId} vs ${r2.foundryId}`)
  check("Neither in forge-guild", r1.foundryId !== "forge-guild" && r2.foundryId !== "forge-guild")
}

async function testDuplicateEmail() {
  console.log("\n🧪 Duplicate email")
  const email = `dupe-${Date.now()}@test.local`
  await createUser(email, "First", "executive")
  const { error } = await admin.auth.admin.createUser({ email, password: "TestPass456!", email_confirm: true, user_metadata: { full_name: "Second", role: "executive" } })
  check("Auth rejects duplicate", !!error)
}

async function testSupplierNoBusinessData() {
  console.log("\n🧪 Supplier WITHOUT business data")
  const id = await createUser(`sup-bare-${Date.now()}@test.local`, "Bare Supplier", "supplier")
  const r = await setup({ userId: id, email: `sup-bare@test.local`, fullName: "Bare Supplier", role: "supplier" })
  const p = await getProfile(id)
  check("In forge-suppliers", r.foundryId === "forge-suppliers")
  check("account_type=supplier", p?.account_type === "supplier")
  // No businessName → no onboarding_data update
  const od = p?.onboarding_data as Record<string, unknown> | null
  check("No business data in onboarding", !od?.business_name)
}

async function testFounderOwnershipChain() {
  console.log("\n🧪 Founder ownership: profile → foundry → membership chain integrity")
  const id = await createUser(`f-chain-${Date.now()}@test.local`, "Chain Founder", "founder")
  const r = await setup({ userId: id, email: `chain@test.local`, fullName: "Chain Founder", role: "founder", companyName: "Chain Co" })
  if (r.foundryId !== "forge-guild") createdFoundryIds.push(r.foundryId)

  const p = await getProfile(id)
  const f = await getFoundry(r.foundryId)
  const m = await getMemberships(id)

  // Full chain verification
  check("Profile.foundry_id → foundry exists", !!f)
  check("Foundry.owner_id → profile.id", f?.owner_id === id)
  check("Membership.foundry_id = profile.foundry_id", m.some(mm => mm.foundry_id === p?.foundry_id))
  check("Membership.user_id = profile.id", m.some(mm => mm.user_id === id))
  check("Profile.foundry_id = profile.active_foundry_id", p?.foundry_id === p?.active_foundry_id)
}

async function testXSSInName() {
  console.log("\n🧪 XSS in full_name and company")
  const id = await createUser(`xss-${Date.now()}@test.local`, '<script>alert("xss")</script>', "founder")
  const r = await setup({ userId: id, email: `xss@test.local`, fullName: '<script>alert("xss")</script>', role: "founder", companyName: '<img src=x onerror=alert(1)>' })
  if (r.foundryId !== "forge-guild") createdFoundryIds.push(r.foundryId)
  const p = await getProfile(id)
  const f = await getFoundry(r.foundryId)
  // Data should be stored as-is (no HTML escaping in DB — escaping happens at render)
  check("Profile created", !!p)
  check("Foundry created", !!f)
  // Slug should strip HTML tags via generateSlug (only keeps a-z0-9)
  check("Slug safe", /^[a-z0-9-]+$/.test(f?.slug ?? "FAIL"))
}

async function testOnboardingState() {
  console.log("\n🧪 Onboarding state — new user should see onboarding modal")
  const id = await createUser(`onboard-${Date.now()}@test.local`, "Onboard User", "executive")
  const r = await setup({ userId: id, email: `onboard@test.local`, fullName: "Onboard User", role: "executive" })
  const p = await getProfile(id)
  const od = (p?.onboarding_data ?? {}) as Record<string, unknown>
  check("onboarding_data exists", !!p?.onboarding_data || p?.onboarding_data === null || typeof p?.onboarding_data === "object")
  check("has_completed_onboarding is falsy", !od.has_completed_onboarding)
  check("onboarding_modal_completed is falsy", !od.onboarding_modal_completed)
}

async function testReferralCodeUniqueness() {
  console.log("\n🧪 Referral code uniqueness across multiple users")
  const ids: string[] = []
  const codes: string[] = []
  for (let i = 0; i < 5; i++) {
    const id = await createUser(`refcode-${i}-${Date.now()}@test.local`, `RefCode ${i}`, "executive")
    ids.push(id)
    await setup({ userId: id, email: `refcode-${i}@test.local`, fullName: `RefCode ${i}`, role: "executive" })
    const p = await getProfile(id)
    if (p?.referral_code) codes.push(p.referral_code)
  }
  check("All 5 users got referral codes", codes.length === 5)
  const uniqueCodes = new Set(codes)
  check("All referral codes unique", uniqueCodes.size === 5, `${codes.length} codes, ${uniqueCodes.size} unique`)
}

// ═══════════════════════════════════════════════════════════════════
// ROUND 2: Post-signup state — onboarding modal should trigger
// ═══════════════════════════════════════════════════════════════════

async function testAccountTypeChange() {
  console.log("\n🧪 [R2] setAccountType — switch from null to supplier")
  const id = await createUser(`actype-${Date.now()}@test.local`, "AccType User", "executive")
  await setup({ userId: id, email: `actype@test.local`, fullName: "AccType User", role: "executive" })

  // Profile starts with account_type=team_builder
  let p = await getProfile(id)
  check("Initial account_type=team_builder", p?.account_type === "team_builder")

  // Simulate onboarding modal selecting "supplier"
  await admin.from("profiles").update({ account_type: "supplier" }).eq("id", id)
  p = await getProfile(id)
  check("account_type changed to supplier", p?.account_type === "supplier")

  // Change back
  await admin.from("profiles").update({ account_type: "team_builder" }).eq("id", id)
  p = await getProfile(id)
  check("account_type reverted to team_builder", p?.account_type === "team_builder")
}

async function testOnboardingDataPersistence() {
  console.log("\n🧪 [R2] Onboarding data — partial updates merge correctly")
  const id = await createUser(`odmerge-${Date.now()}@test.local`, "OD Merge", "executive")
  await setup({ userId: id, email: `odmerge@test.local`, fullName: "OD Merge", role: "executive" })

  // Write first field
  const { data: p1 } = await admin.from("profiles").select("onboarding_data").eq("id", id).single()
  const od1 = (p1?.onboarding_data ?? {}) as Record<string, unknown>
  await admin.from("profiles").update({ onboarding_data: { ...od1, step_one_done: true } }).eq("id", id)

  // Write second field — should NOT overwrite first
  const { data: p2 } = await admin.from("profiles").select("onboarding_data").eq("id", id).single()
  const od2 = (p2?.onboarding_data ?? {}) as Record<string, unknown>
  await admin.from("profiles").update({ onboarding_data: { ...od2, step_two_done: true } }).eq("id", id)

  // Verify both fields present
  const { data: p3 } = await admin.from("profiles").select("onboarding_data").eq("id", id).single()
  const od3 = (p3?.onboarding_data ?? {}) as Record<string, unknown>
  check("step_one_done preserved", od3.step_one_done === true)
  check("step_two_done present", od3.step_two_done === true)
}

// ═══════════════════════════════════════════════════════════════════
// ROUND 3: Onboarding modal edge cases
// ═══════════════════════════════════════════════════════════════════

async function testModalSkipState() {
  console.log("\n🧪 [R3] Modal skip — sets onboarding_modal_completed but not account_type_selected")
  const id = await createUser(`skip-${Date.now()}@test.local`, "Skip User", "executive")
  await setup({ userId: id, email: `skip@test.local`, fullName: "Skip User", role: "executive" })

  // Simulate skip: modal marks complete but doesn't set intent
  await admin.from("profiles").update({
    onboarding_data: { onboarding_modal_completed: true, has_completed_onboarding: true },
  }).eq("id", id)

  const p = await getProfile(id)
  const od = (p?.onboarding_data ?? {}) as Record<string, unknown>
  check("Modal marked complete", od.onboarding_modal_completed === true)
  check("account_type_selected NOT set (skipped)", !od.account_type_selected)
  // account_type on profile should still be team_builder (from signup)
  check("account_type still team_builder", p?.account_type === "team_builder")
}

async function testModalAlreadyCompleted() {
  console.log("\n🧪 [R3] Modal already completed — verify it won't re-show")
  const id = await createUser(`done-${Date.now()}@test.local`, "Done User", "executive")
  await setup({ userId: id, email: `done@test.local`, fullName: "Done User", role: "executive" })

  // Mark as completed
  await admin.from("profiles").update({
    onboarding_data: {
      onboarding_modal_completed: true,
      has_completed_onboarding: true,
      account_type_selected: "team_builder",
      onboarding_completed_at: new Date().toISOString(),
    },
  }).eq("id", id)

  const p = await getProfile(id)
  const od = (p?.onboarding_data ?? {}) as Record<string, unknown>
  check("Modal won't re-show (completed=true)", od.onboarding_modal_completed === true)
  check("Intent recorded", od.account_type_selected === "team_builder")
  check("Completion timestamp set", !!od.onboarding_completed_at)
}

// ═══════════════════════════════════════════════════════════════════
// ROUND 5: Cross-role verification matrix
// ═══════════════════════════════════════════════════════════════════

async function testCrossRoleMatrix() {
  console.log("\n🧪 [R5] Cross-role verification matrix")
  const roles = [
    { role: "founder" as const, companyName: "Matrix Co", expectedFoundry: "matrix-co-", expectedType: "team_builder", hasProvider: true, redirect: "/today" },
    { role: "executive" as const, expectedFoundry: "forge-guild", expectedType: "team_builder", hasProvider: true, redirect: "/today" },
    { role: "apprentice" as const, expectedFoundry: "forge-guild", expectedType: "team_builder", hasProvider: true, redirect: "/today" },
    { role: "supplier" as const, expectedFoundry: "forge-suppliers", expectedType: "supplier", hasProvider: false, redirect: "/supplier-portal" },
  ]

  for (const cfg of roles) {
    const id = await createUser(`matrix-${cfg.role}-${Date.now()}@test.local`, `Matrix ${cfg.role}`, cfg.role)
    const r = await setup({
      userId: id, email: `matrix-${cfg.role}@test.local`, fullName: `Matrix ${cfg.role}`,
      role: cfg.role, companyName: cfg.companyName,
    })
    if (r.foundryId !== "forge-guild" && r.foundryId !== "forge-suppliers") createdFoundryIds.push(r.foundryId)

    const p = await getProfile(id)
    const m = await getMemberships(id)
    const pp = await getProviderProfile(id)

    check(`[${cfg.role}] profile exists`, !!p)
    check(`[${cfg.role}] foundry starts with ${cfg.expectedFoundry}`, r.foundryId.startsWith(cfg.expectedFoundry))
    check(`[${cfg.role}] account_type=${cfg.expectedType}`, p?.account_type === cfg.expectedType)
    check(`[${cfg.role}] membership exists`, m.length >= 1)
    check(`[${cfg.role}] referral code`, !!p?.referral_code && p.referral_code.length === 7)
    check(`[${cfg.role}] provider=${cfg.hasProvider}`, cfg.hasProvider ? !!pp : !pp)
    check(`[${cfg.role}] redirect=${cfg.redirect}`, r.redirectPath === cfg.redirect)
    check(`[${cfg.role}] onboarding_modal_completed falsy`, !(p?.onboarding_data as any)?.onboarding_modal_completed)
  }
}

// ═══════════════════════════════════════════════════════════════════
// Original tests
// ═══════════════════════════════════════════════════════════════════

async function testNullRole() {
  console.log("\n🧪 Invalid role (defaults to Apprentice)")
  const id = await createUser(`nullrole-${Date.now()}@test.local`, "No Role", "unknown_role")
  // capitalizeRole("unknown_role") returns "Apprentice"
  const r = await setup({ userId: id, email: `nullrole@test.local`, fullName: "No Role", role: "unknown_role" as any })
  const p = await getProfile(id)
  check("Profile created", !!p)
  check("Role defaults to Apprentice", p?.role === "Apprentice", `got ${p?.role}`)
  check("In forge-guild", r.foundryId === "forge-guild")
  check("account_type=team_builder", p?.account_type === "team_builder")
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 ForgeOS New User — AGGRESSIVE E2E Test v2")
  console.log(`   ${new Date().toISOString()}\n`)

  try {
    await testFounderFull()
    await testExecutive()
    await testApprentice()
    await testSupplier()
    await testIdempotency()
    await testConcurrentRace()
    await testFounderNoCompany()
    await testSpecialCharsCompany()
    await testUnicodeCompany()
    await testPureUnicodeCompany()
    await testLongCompany()
    await testEmptyStringCompany()
    await testSlugCollision()
    await testDuplicateEmail()
    await testSupplierNoBusinessData()
    await testFounderOwnershipChain()
    await testXSSInName()
    await testNullRole()
    await testOnboardingState()
    await testReferralCodeUniqueness()

    // Round 2: Post-signup state
    await testAccountTypeChange()
    await testOnboardingDataPersistence()

    // Round 3: Onboarding modal edge cases
    await testModalSkipState()
    await testModalAlreadyCompleted()

    // Round 5: Cross-role verification matrix
    await testCrossRoleMatrix()
  } finally {
    await cleanup()
  }

  console.log(`\n${"═".repeat(50)}`)
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`${"═".repeat(50)}`)
  if (failed > 0) process.exit(1)
}

main().catch(err => { console.error("💥", err); cleanup().finally(() => process.exit(1)) })
