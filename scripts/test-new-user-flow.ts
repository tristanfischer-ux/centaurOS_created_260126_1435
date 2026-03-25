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
  // Unicode gets stripped by generateSlug → slug is "manufacturing-{userId}"
  check("Slug has latin chars", /^[a-z0-9-]+$/.test(f?.slug ?? ""))
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
    await testLongCompany()
    await testEmptyStringCompany()
    await testSlugCollision()
    await testDuplicateEmail()
    await testSupplierNoBusinessData()
    await testFounderOwnershipChain()
    await testXSSInName()
    await testNullRole()
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
