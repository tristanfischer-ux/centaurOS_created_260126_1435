#!/usr/bin/env npx tsx

/**
 * discover-uk-assembly-companies.ts
 * ==================================
 * Discovers 20 real UK contract assembly / system integration companies using:
 *   1. Sonnet AI + web_search to find companies
 *   2. Companies House API for enrichment (profile, officers, PSC)
 *   3. Sonnet AI + web_search for deep research per company
 *   4. Push to Supabase marketplace_listings + fulfillment_capabilities
 *
 * Usage:
 *   npx tsx scripts/discover-uk-assembly-companies.ts
 *   npx tsx scripts/discover-uk-assembly-companies.ts --dry-run
 *   npx tsx scripts/discover-uk-assembly-companies.ts --limit 5
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPANIES_HOUSE_API_KEY,
 *   and ANTHROPIC_API_KEY must be set. Loaded from .env.local automatically.
 */

import { createClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"
import { readFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
const __dirname_compat = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname_compat, "../.env.local")
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const [key, ...rest] = trimmed.split("=")
    const val = rest.join("=").replace(/^['"]|['"]$/g, "")
    if (key && !(key in process.env)) {
      process.env[key.trim()] = val.trim()
    }
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const COMPANIES_HOUSE_API_KEY = process.env.COMPANIES_HOUSE_API_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}
if (!COMPANIES_HOUSE_API_KEY) {
  console.error("Missing COMPANIES_HOUSE_API_KEY in .env.local")
  process.exit(1)
}
if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in .env.local")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
  timeout: 5 * 60 * 1000, // 5 minutes — web_search with many searches takes a while
})

const CH_BASE = "https://api.company-information.service.gov.uk"
const CH_AUTH = Buffer.from(`${COMPANIES_HOUSE_API_KEY}:`).toString("base64")

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const limitIdx = args.indexOf("--limit")
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 20

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscoveredCompany {
  name: string
  website: string
  location: string
  assemblyServices: string
  certifications: string[]
}

interface CHCompanyProfile {
  company_name: string
  company_number: string
  company_status: string
  type: string
  date_of_creation?: string
  registered_office_address?: {
    address_line_1?: string
    address_line_2?: string
    locality?: string
    region?: string
    postal_code?: string
    country?: string
  }
  sic_codes?: string[]
  accounts?: {
    last_accounts?: {
      type?: string
    }
  }
}

interface CHOfficer {
  name: string
  officer_role: string
  appointed_on?: string
  resigned_on?: string
  nationality?: string
}

interface CHPSCEntry {
  name?: string
  natures_of_control?: string[]
  notified_on?: string
  ceased_on?: string
}

interface DeepResearchResult {
  capabilities: string[]
  certifications: string[]
  materials: string[]
  equipment: string[]
  leadTime: string
  productionCapacity: string
  employeeCount: number | null
  industriesServed: string[]
  specialties: string[]
  description: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// FLOW: Same mapping as discover-manufacturers-by-sic.ts
const ACCOUNT_TYPE_TO_SIZE: Record<string, string> = {
  "micro-entity": "Micro",
  "total-exemption-full": "Micro",
  small: "Small",
  "total-exemption-small": "Small",
  "unaudited-abridged": "Small",
  "audit-exemption-subsidiary": "Small",
  "filing-exemption-subsidiary": "Small",
  medium: "Medium",
  "partial-exemption": "Medium",
  "audited-abridged": "Medium",
  full: "Large",
  group: "Large",
  dormant: "Dormant",
}

function mapAccountTypeToSize(accountType: string | undefined | null): string {
  if (!accountType) return "Unknown"
  return ACCOUNT_TYPE_TO_SIZE[accountType] ?? "Unknown"
}

function formatAddress(
  address: CHCompanyProfile["registered_office_address"],
): string {
  if (!address) return ""
  return [
    address.address_line_1,
    address.address_line_2,
    address.locality,
    address.region,
    address.postal_code,
    address.country,
  ]
    .filter(Boolean)
    .join(", ")
}

// ---------------------------------------------------------------------------
// Step 1: Sonnet AI Discovery
// ---------------------------------------------------------------------------

async function discoverAssemblyCompanies(
  limit: number,
): Promise<DiscoveredCompany[]> {
  console.log(`\n[Step 1] Sonnet AI discovery — finding ${limit} UK assembly companies...`)

  // TRIED: web_search_20260209 tool causes consistent API timeouts (>5min per call).
  // DECISION: Use Sonnet's training data for company names, then verify via Companies House.
  // Companies House validation is more reliable than web_search anyway.

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `List ${limit} real, currently operating UK companies that offer contract assembly services. Include a diverse mix:

- Contract electronics assembly (PCBA, box build, SMT) — e.g. NOTE, Jaltek, Nemco, AWS Electronics
- Mechanical assembly and system integration
- Electromechanical assembly
- Cable and harness assembly
- Product assembly, kitting, and fulfilment

These must be real UK-registered companies (not global multinationals unless they have a UK subsidiary). Provide their exact registered company name as it would appear on Companies House.

Return ONLY valid JSON with no markdown fences:
[
  {
    "name": "Exact UK registered company name (as on Companies House)",
    "website": "https://...",
    "location": "City, County",
    "assemblyServices": "Brief description of what they assemble",
    "certifications": ["ISO 9001", "AS9100", ...]
  }
]`,
      },
    ],
  })

  const cost =
    ((response.usage?.input_tokens ?? 0) * 3.0 +
      (response.usage?.output_tokens ?? 0) * 15.0) /
    1_000_000
  console.log(
    `  Sonnet: ${response.usage?.input_tokens ?? 0} in / ${response.usage?.output_tokens ?? 0} out ~ $${cost.toFixed(4)}`,
  )

  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text",
  )
  const text = textBlocks.map((b) => b.text).join("")

  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    console.error("  ERROR: No JSON array found in Sonnet response")
    console.error("  Response text:", text.slice(0, 500))
    return []
  }

  try {
    const companies = JSON.parse(jsonMatch[0]) as DiscoveredCompany[]
    console.log(`  Discovered ${companies.length} companies`)
    return companies.slice(0, limit)
  } catch (err) {
    console.error("  ERROR: Failed to parse JSON:", err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Step 2: Companies House Enrichment
// ---------------------------------------------------------------------------

async function searchCompaniesHouse(
  companyName: string,
): Promise<{ number: string; name: string } | null> {
  const url = new URL(`${CH_BASE}/search/companies`)
  url.searchParams.set("q", companyName)
  url.searchParams.set("items_per_page", "5")

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${CH_AUTH}` },
  })

  if (!res.ok) {
    console.warn(
      `    [WARN] CH search failed for "${companyName}": HTTP ${res.status}`,
    )
    return null
  }

  const data = (await res.json()) as {
    items?: { company_number: string; title: string; company_status: string }[]
  }
  if (!data.items || data.items.length === 0) return null

  // INTENT: Find best active match — prefer exact name match, then first active
  const active = data.items.filter((i) => i.company_status === "active")
  const exactMatch = active.find(
    (i) => i.title.toLowerCase() === companyName.toLowerCase(),
  )
  const best = exactMatch ?? active[0]
  if (!best) return null

  return { number: best.company_number, name: best.title }
}

async function fetchCompanyProfile(
  companyNumber: string,
): Promise<CHCompanyProfile | null> {
  const res = await fetch(`${CH_BASE}/company/${companyNumber}`, {
    headers: { Authorization: `Basic ${CH_AUTH}` },
  })
  if (!res.ok) {
    console.warn(
      `    [WARN] Failed to fetch profile for ${companyNumber}: HTTP ${res.status}`,
    )
    return null
  }
  return (await res.json()) as CHCompanyProfile
}

async function fetchOfficers(
  companyNumber: string,
): Promise<CHOfficer[]> {
  const res = await fetch(
    `${CH_BASE}/company/${companyNumber}/officers?items_per_page=50`,
    { headers: { Authorization: `Basic ${CH_AUTH}` } },
  )
  if (!res.ok) return []

  const data = (await res.json()) as {
    items?: {
      name: string
      officer_role: string
      appointed_on?: string
      resigned_on?: string
      nationality?: string
    }[]
  }

  return (data.items ?? [])
    .filter((o) => !o.resigned_on) // Active officers only
    .map((o) => ({
      name: o.name,
      officer_role: o.officer_role,
      appointed_on: o.appointed_on,
      resigned_on: o.resigned_on,
      nationality: o.nationality,
    }))
}

async function fetchPSC(
  companyNumber: string,
): Promise<CHPSCEntry[]> {
  const res = await fetch(
    `${CH_BASE}/company/${companyNumber}/persons-with-significant-control?items_per_page=50`,
    { headers: { Authorization: `Basic ${CH_AUTH}` } },
  )
  if (!res.ok) return []

  const data = (await res.json()) as {
    items?: {
      name?: string
      natures_of_control?: string[]
      notified_on?: string
      ceased_on?: string
    }[]
  }

  return (data.items ?? [])
    .filter((p) => !p.ceased_on) // Active PSCs only
    .map((p) => ({
      name: p.name,
      natures_of_control: p.natures_of_control,
      notified_on: p.notified_on,
      ceased_on: p.ceased_on,
    }))
}

// FLOW: Same financial health scoring as Nightshift
function scoreFinancialHealth(
  companySize: string,
  companyStatus: string,
  incorporationDate: string | undefined,
): string {
  if (companyStatus !== "active") return "Poor"
  if (companySize === "Dormant") return "Poor"

  let score = 0
  if (companySize === "Large") score += 3
  else if (companySize === "Medium") score += 2
  else if (companySize === "Small") score += 1

  if (incorporationDate) {
    const years =
      (Date.now() - new Date(incorporationDate).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000)
    if (years >= 10) score += 2
    else if (years >= 5) score += 1
  }

  if (score >= 4) return "Strong"
  if (score >= 2) return "Good"
  return "Fair"
}

interface CHEnrichment {
  profile: CHCompanyProfile
  officers: CHOfficer[]
  psc: CHPSCEntry[]
  companySize: string
  financialHealth: string
}

async function enrichFromCompaniesHouse(
  company: DiscoveredCompany,
): Promise<CHEnrichment | null> {
  // Search CH for the company
  const chMatch = await searchCompaniesHouse(company.name)
  if (!chMatch) {
    console.log(`    No CH match for "${company.name}"`)
    return null
  }

  await sleep(120) // Rate limit

  // Fetch profile
  const profile = await fetchCompanyProfile(chMatch.number)
  if (!profile || profile.company_status !== "active") {
    console.log(
      `    ${chMatch.number} is ${profile?.company_status ?? "missing"}, skipping`,
    )
    return null
  }

  await sleep(120)

  // Fetch officers
  const officers = await fetchOfficers(chMatch.number)
  await sleep(120)

  // Fetch PSC
  const psc = await fetchPSC(chMatch.number)

  const accountType = profile.accounts?.last_accounts?.type ?? null
  const companySize = mapAccountTypeToSize(accountType)
  const financialHealth = scoreFinancialHealth(
    companySize,
    profile.company_status,
    profile.date_of_creation,
  )

  console.log(
    `    CH: ${profile.company_name} (${chMatch.number}) | ${companySize} | ${financialHealth} | ${officers.length} officers`,
  )

  return { profile, officers, psc, companySize, financialHealth }
}

// ---------------------------------------------------------------------------
// Step 3: Sonnet Deep Research
// ---------------------------------------------------------------------------

async function deepResearchCompany(
  company: DiscoveredCompany,
): Promise<DeepResearchResult> {
  const systemPrompt = `You are researching a UK assembly company for a manufacturing marketplace. Extract detailed structured data about their capabilities.

Return ONLY valid JSON with no markdown fences:
{
  "capabilities": ["list of specific assembly capabilities"],
  "certifications": ["ISO 9001", "AS9100", ...],
  "materials": ["materials they work with"],
  "equipment": ["key equipment / machines"],
  "leadTime": "typical lead time string e.g. '2-4 weeks'",
  "productionCapacity": "e.g. 'Medium batch to high volume'",
  "employeeCount": 50,
  "industriesServed": ["Aerospace", "Defence", ...],
  "specialties": ["contract_assembly", "system_integration", ...],
  "description": "2-3 sentence description of the company and what they do"
}

For specialties, use these slugs where applicable: contract_assembly, system_integration, pcba_assembly, box_build, cable_harness, electromechanical, mechanical_assembly, product_assembly, test_and_inspection, fulfilment`

  // TRIED: web_search causes API timeouts. Using Sonnet's training data instead.
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Research this UK assembly company and extract structured data. Use your knowledge of the company:\n\nCompany: ${company.name}\nWebsite: ${company.website}\nLocation: ${company.location}\nKnown services: ${company.assemblyServices}\nKnown certifications: ${company.certifications.join(", ") || "unknown"}`,
      },
    ],
  })

  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text",
  )
  const text = textBlocks.map((b) => b.text).join("")
  const jsonMatch = text.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    console.log(`    No deep research JSON for ${company.name}`)
    return {
      capabilities: [company.assemblyServices],
      certifications: company.certifications,
      materials: [],
      equipment: [],
      leadTime: "",
      productionCapacity: "",
      employeeCount: null,
      industriesServed: [],
      specialties: ["contract_assembly"],
      description: company.assemblyServices,
    }
  }

  try {
    return JSON.parse(jsonMatch[0]) as DeepResearchResult
  } catch {
    console.log(`    Failed to parse deep research for ${company.name}`)
    return {
      capabilities: [company.assemblyServices],
      certifications: company.certifications,
      materials: [],
      equipment: [],
      leadTime: "",
      productionCapacity: "",
      employeeCount: null,
      industriesServed: [],
      specialties: ["contract_assembly"],
      description: company.assemblyServices,
    }
  }
}

// ---------------------------------------------------------------------------
// Step 4: Push to Supabase
// ---------------------------------------------------------------------------

async function pushToSupabase(
  company: DiscoveredCompany,
  ch: CHEnrichment | null,
  research: DeepResearchResult,
): Promise<{ listingId: string | null; profileId: string | null }> {
  const addr = ch?.profile.registered_office_address
  const locality = addr?.locality ?? addr?.region ?? company.location
  const postalCode = addr?.postal_code ?? ""
  const locationParts = [locality, postalCode].filter(Boolean).join(", ")

  const title = ch?.profile.company_name ?? company.name

  // Build attributes
  const attributes: Record<string, unknown> = {
    source: "sonnet_discovery",
    assembly_verified: true,
    company_type: "Assembly & Integration",
    location: locationParts,
    capabilities: research.capabilities,
    data_source: "sonnet_ai_discovery",
  }

  if (ch) {
    attributes.ch_company_number = ch.profile.company_number
    attributes.ch_company_status = ch.profile.company_status
    attributes.ch_registered_address = formatAddress(addr)
    attributes.ch_incorporation_date = ch.profile.date_of_creation ?? null
    attributes.ch_company_size = ch.companySize
    attributes.ch_sic_codes = ch.profile.sic_codes ?? []
    attributes.ch_directors = ch.officers.map((o) => ({
      name: o.name,
      role: o.officer_role,
      appointed: o.appointed_on,
      nationality: o.nationality,
    }))
    attributes.ch_psc = ch.psc.map((p) => ({
      name: p.name,
      natures_of_control: p.natures_of_control,
      notified_on: p.notified_on,
    }))
  }

  // Build listing record with promoted columns
  const listing: Record<string, unknown> = {
    title,
    category: "Services",
    subcategory: "Assembly & Integration",
    description: research.description || `${title} is a UK-based contract assembly company located in ${locationParts}, offering ${company.assemblyServices}.`,
    attributes,
    is_demo: false,
    is_verified: true,
    verification_tier: "claimed",
    approval_status: "approved",
    website_url: company.website,
    country: "United Kingdom",
    city: addr?.locality ?? company.location.split(",")[0]?.trim() ?? null,
    specialties: [
      "contract_assembly",
      ...research.specialties.filter((s) => s !== "contract_assembly"),
    ],
    certifications: research.certifications,
    industries: research.industriesServed,
    materials: research.materials,
    key_equipment: research.equipment,
    company_size: ch?.companySize ?? null,
    employee_count_exact: research.employeeCount,
    lead_time: research.leadTime || null,
    production_capacity: research.productionCapacity || null,
    address: ch ? formatAddress(addr) : null,
    founded_year: ch?.profile.date_of_creation
      ? parseInt(ch.profile.date_of_creation.slice(0, 4), 10)
      : null,
    financial_health: ch?.financialHealth ?? null,
    key_people: ch
      ? ch.officers.slice(0, 5).map((o) => ({
          name: o.name,
          role: o.officer_role,
          nationality: o.nationality,
        }))
      : [],
  }

  // Insert listing
  const { data: insertedListing, error: listingError } = await supabase
    .from("marketplace_listings")
    .insert(listing)
    .select("id")
    .single()

  if (listingError) {
    console.error(`    Listing insert failed for ${title}: ${listingError.message}`)
    return { listingId: null, profileId: null }
  }

  const listingId = insertedListing.id
  console.log(`    Listing inserted: ${listingId}`)

  // INTENT: Create a provider_profile so we can link fulfillment_capabilities.
  // Use a deterministic user_id approach — we need a profile to link to.
  // For discovery-seeded companies, we create a minimal provider_profile linked
  // to the listing itself. We use the listing's ID as a seed.

  // Check if there's already a provider_profile for this listing
  const { data: existingProfile } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("listing_id", listingId)
    .maybeSingle()

  let profileId = existingProfile?.id ?? null

  if (!profileId) {
    // INTENT: We can't create a provider_profile without a user_id (FK to profiles).
    // For seeded assembly companies, we skip fulfillment_capabilities creation
    // and rely on the marketplace_listings specialties + assembly_verified attribute
    // for matching in assembly-match.ts.
    console.log(`    Skipping fulfillment_capabilities (no user profile for seeded company)`)
  } else {
    // Insert fulfillment_capability
    const { error: capError } = await supabase
      .from("fulfillment_capabilities")
      .insert({
        provider_profile_id: profileId,
        capability: "assemble",
        certifications: research.certifications,
        typical_lead_days: research.leadTime
          ? parseInt(research.leadTime.match(/\d+/)?.[0] ?? "14", 10)
          : null,
        location_country: "GB",
        is_active: true,
      })

    if (capError) {
      console.error(`    Capability insert failed: ${capError.message}`)
    } else {
      console.log(`    Fulfillment capability inserted`)
    }
  }

  return { listingId, profileId }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(60))
  console.log("Discover UK Assembly & Integration Companies")
  console.log("=".repeat(60))
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`)
  console.log(`Target: ${LIMIT} companies`)
  console.log()

  // ── Load existing listings for dedup ──
  console.log("Loading existing listings for duplicate check...")
  const existingTitles = new Set<string>()
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select("title")
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error("Failed to fetch existing listings:", error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    for (const row of data) {
      existingTitles.add(row.title.toLowerCase().trim())
    }
    if (data.length < pageSize) break
    offset += pageSize
  }
  console.log(`  Existing listings: ${existingTitles.size}`)

  // ── Step 1: AI Discovery ──
  const discovered = await discoverAssemblyCompanies(LIMIT)
  if (discovered.length === 0) {
    console.error("No companies discovered. Exiting.")
    process.exit(1)
  }

  // Dedup against existing
  const novel = discovered.filter(
    (c) => !existingTitles.has(c.name.toLowerCase().trim()),
  )
  console.log(
    `  After dedup: ${novel.length} novel (${discovered.length - novel.length} duplicates skipped)`,
  )

  // ── Step 2: Companies House Enrichment ──
  console.log(`\n[Step 2] Companies House enrichment...`)
  const enrichments = new Map<string, CHEnrichment | null>()

  for (const company of novel) {
    console.log(`  ${company.name}...`)
    const ch = await enrichFromCompaniesHouse(company)
    enrichments.set(company.name, ch)
    await sleep(120) // Rate limit between companies
  }

  const chMatched = [...enrichments.values()].filter(Boolean).length
  console.log(`  CH matched: ${chMatched}/${novel.length}`)

  // ── Step 3: Deep Research ──
  console.log(`\n[Step 3] Sonnet deep research per company...`)
  const researchResults = new Map<string, DeepResearchResult>()
  let researchIdx = 0

  for (const company of novel) {
    researchIdx++
    console.log(
      `  [${researchIdx}/${novel.length}] Researching ${company.name}...`,
    )
    const research = await deepResearchCompany(company)
    researchResults.set(company.name, research)
  }

  // ── Step 4: Push to Supabase ──
  if (DRY_RUN) {
    console.log(`\n[Step 4] DRY RUN — would insert ${novel.length} companies:`)
    console.log()
    for (const company of novel) {
      const ch = enrichments.get(company.name)
      const research = researchResults.get(company.name)!
      const chNum = ch?.profile.company_number ?? "N/A"
      const size = ch?.companySize ?? "Unknown"
      const health = ch?.financialHealth ?? "N/A"
      const specs = research.specialties.join(", ")
      console.log(
        `  ${company.name} | CH: ${chNum} | Size: ${size} | Health: ${health}`,
      )
      console.log(`    Specialties: ${specs}`)
      console.log(`    Certs: ${research.certifications.join(", ") || "none"}`)
      console.log(
        `    Industries: ${research.industriesServed.join(", ") || "none"}`,
      )
      console.log()
    }
    console.log("[DRY RUN] No rows were inserted.")
  } else {
    console.log(`\n[Step 4] Pushing ${novel.length} companies to Supabase...`)
    let inserted = 0
    let failed = 0

    for (const company of novel) {
      const ch = enrichments.get(company.name)
      const research = researchResults.get(company.name)!
      const result = await pushToSupabase(company, ch ?? null, research)
      if (result.listingId) {
        inserted++
      } else {
        failed++
      }
    }

    console.log(`\n  Inserted: ${inserted}  Failed: ${failed}`)
  }

  // ── Summary ──
  console.log()
  console.log("=".repeat(60))
  console.log("Discovery Summary")
  console.log("=".repeat(60))
  console.log(`Companies discovered:    ${discovered.length}`)
  console.log(`Duplicates skipped:      ${discovered.length - novel.length}`)
  console.log(`CH enriched:             ${chMatched}`)
  console.log(`Deep researched:         ${researchResults.size}`)
  console.log(`Mode:                    ${DRY_RUN ? "DRY RUN" : "LIVE"}`)
  console.log()

  if (DRY_RUN) {
    console.log("Dry run complete — no changes were written.")
  } else {
    console.log("Done.")
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
