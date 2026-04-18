/**
 * @file supplier-enrichment.ts — Server actions for supplier data enrichment features.
 *
 * @description Covers enhancement items #12 (interview response ingestion), #13
 * (post-project ratings), #14 (founder corrections), #16 (RFQ benchmarks), #17
 * (sub-tier risk), #20 (AI supplier briefs). All actions auth-checked + RLS
 * respected except AI brief generation which uses admin client to write the cache
 * (SECURITY: cache write is domain-wide read-only data).
 *
 * @related
 * - Schema: supabase/migrations/20260418030000_supplier_enrichment_foundation.sql
 * - UI: src/components/cad/supplier-enrichment-panel.tsx
 */

"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createHash } from "node:crypto"

// ─── Shared helpers ──────────────────────────────────────────────────

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase, user: null, foundryId: null, error: "Not authenticated" as const }
  // Get foundry_id — AUTH: required for multi-tenant writes
  const { data: profile } = await supabase.from("profiles").select("foundry_id").eq("id", user.id).single()
  return { supabase, user, foundryId: profile?.foundry_id ?? null, error: null }
}

// ─── #13. Post-project supplier rating ───────────────────────────────

export interface SubmitRatingInput {
  listingId: string
  projectId?: string | null
  onTime: number         // 1-5
  quality: number        // 1-5
  responsiveness: number // 1-5
  commercialFairness: number // 1-5
  notes?: string
  isPublic?: boolean
}

export async function submitSupplierRating(input: SubmitRatingInput) {
  const { supabase, user, foundryId, error } = await requireAuth()
  if (error || !user) return { error: "Sign in required" }
  if (!foundryId) return { error: "No foundry context" }

  for (const [k, v] of [["on_time", input.onTime], ["quality", input.quality], ["responsiveness", input.responsiveness], ["commercial_fairness", input.commercialFairness]] as const) {
    if (!Number.isInteger(v) || v < 1 || v > 5) return { error: `Invalid ${k}: must be 1-5` }
  }

  const { data, error: insertError } = await supabase
    .from("supplier_ratings")
    .upsert({
      listing_id: input.listingId,
      foundry_id: foundryId,
      project_id: input.projectId ?? null,
      rated_by: user.id,
      on_time: input.onTime,
      quality: input.quality,
      responsiveness: input.responsiveness,
      commercial_fairness: input.commercialFairness,
      notes: input.notes?.trim() || null,
      is_public: input.isPublic ?? true,
    }, { onConflict: "listing_id,foundry_id,project_id" })
    .select()
    .single()

  if (insertError) {
    console.error("[submitSupplierRating]", insertError.message)
    return { error: "Could not save rating" }
  }
  return { rating: data }
}

export async function getSupplierRatingAggregate(listingId: string) {
  const supabase = await createClient()
  // Public ratings only — aggregate visible marketplace-wide
  const { data, error } = await supabase
    .from("supplier_ratings")
    .select("on_time, quality, responsiveness, commercial_fairness")
    .eq("listing_id", listingId)
    .eq("is_public", true)
  if (error) return { error: "Failed to read ratings" }
  const rows = data ?? []
  if (rows.length === 0) return { count: 0, aggregate: null as null }
  const avg = (k: keyof typeof rows[number]) => {
    const vs = rows.map((r) => r[k]).filter((v): v is number => typeof v === "number")
    return vs.length === 0 ? null : Math.round((vs.reduce((s, v) => s + v, 0) / vs.length) * 10) / 10
  }
  return {
    count: rows.length,
    aggregate: {
      onTime: avg("on_time"),
      quality: avg("quality"),
      responsiveness: avg("responsiveness"),
      commercialFairness: avg("commercial_fairness"),
    },
  }
}

// ─── #14. Founder-contributed corrections ────────────────────────────

export interface SubmitCorrectionInput {
  listingId: string
  fieldName: string
  currentValue?: string | null
  proposedValue: string
  reason?: string
}

export async function submitSupplierCorrection(input: SubmitCorrectionInput) {
  const { supabase, user, foundryId, error } = await requireAuth()
  if (error || !user) return { error: "Sign in required" }
  if (!foundryId) return { error: "No foundry context" }
  if (!input.proposedValue?.trim()) return { error: "Proposed value required" }
  const { data, error: insertError } = await supabase
    .from("supplier_corrections")
    .insert({
      listing_id: input.listingId,
      foundry_id: foundryId,
      submitted_by: user.id,
      field_name: input.fieldName.trim(),
      current_value: input.currentValue?.trim() || null,
      proposed_value: input.proposedValue.trim(),
      reason: input.reason?.trim() || null,
    })
    .select()
    .single()
  if (insertError) {
    console.error("[submitSupplierCorrection]", insertError.message)
    return { error: "Could not submit correction" }
  }
  return { correction: data }
}

// ─── #12. Interview response ingestion ──────────────────────────────

export interface IngestInterviewReplyInput {
  listingId: string
  projectId?: string | null
  rawReply: string
  sharePubliclyContributeToBenchmarks?: boolean
}

/**
 * Parse a free-text supplier reply to the Capability Interview Pack and
 * extract structured fields. Falls back to storing the raw reply + a parse_error
 * if extraction fails.
 */
export async function ingestInterviewReply(input: IngestInterviewReplyInput) {
  const { supabase, user, foundryId, error } = await requireAuth()
  if (error || !user) return { error: "Sign in required" }
  if (!foundryId) return { error: "No foundry context" }
  if (!input.rawReply?.trim() || input.rawReply.length < 50) {
    return { error: "Reply is too short to parse (min 50 chars)" }
  }

  // INTENT: Rule-based extraction. LLM call would be better for robustness but
  // runs synchronously in a user-facing action; keep this deterministic for now.
  // Upgrade path: call src/lib/ai/* with a structured-output schema.
  const parsed = parseInterviewReplyHeuristic(input.rawReply)

  const { data, error: insertError } = await supabase
    .from("supplier_interview_responses")
    .insert({
      listing_id: input.listingId,
      foundry_id: foundryId,
      project_id: input.projectId ?? null,
      submitted_by: user.id,
      raw_reply: input.rawReply.trim(),
      parsed: parsed.raw as never,
      moq_min: parsed.moq_min,
      moq_max: parsed.moq_max,
      tooling_cost_min_gbp: parsed.tooling_cost_min_gbp,
      tooling_cost_max_gbp: parsed.tooling_cost_max_gbp,
      lead_time_days: parsed.lead_time_days,
      payment_terms: parsed.payment_terms,
      unit_price_at_100_gbp: parsed.unit_price_at_100_gbp,
      unit_price_at_1000_gbp: parsed.unit_price_at_1000_gbp,
      unit_price_at_10000_gbp: parsed.unit_price_at_10000_gbp,
      parse_error: parsed.parse_error,
      share_publicly: input.sharePubliclyContributeToBenchmarks ?? false,
    })
    .select()
    .single()
  if (insertError) {
    console.error("[ingestInterviewReply]", insertError.message)
    return { error: "Could not save reply" }
  }
  return { response: data, parsed }
}

interface HeuristicParseResult {
  raw: Record<string, unknown>
  moq_min: number | null
  moq_max: number | null
  tooling_cost_min_gbp: number | null
  tooling_cost_max_gbp: number | null
  lead_time_days: number | null
  payment_terms: string | null
  unit_price_at_100_gbp: number | null
  unit_price_at_1000_gbp: number | null
  unit_price_at_10000_gbp: number | null
  parse_error: string | null
}

function parseInterviewReplyHeuristic(reply: string): HeuristicParseResult {
  const lower = reply.toLowerCase()
  const result: HeuristicParseResult = {
    raw: {},
    moq_min: null, moq_max: null,
    tooling_cost_min_gbp: null, tooling_cost_max_gbp: null,
    lead_time_days: null,
    payment_terms: null,
    unit_price_at_100_gbp: null,
    unit_price_at_1000_gbp: null,
    unit_price_at_10000_gbp: null,
    parse_error: null,
  }

  // MOQ — look for "MOQ" or "minimum order"
  const moqMatch = lower.match(/(?:moq|minimum order|minimum quantity)[^0-9]{0,30}(\d[\d,]*)/)
  if (moqMatch) {
    const n = parseInt(moqMatch[1].replace(/,/g, ""), 10)
    if (!Number.isNaN(n) && n > 0) {
      result.moq_min = n
      result.moq_max = n
    }
  }

  // Lead time — "X days" or "X weeks"
  const leadDaysMatch = lower.match(/(?:lead\s*time|delivery)[^0-9]{0,30}(\d+)\s*(day|week)/)
  if (leadDaysMatch) {
    const n = parseInt(leadDaysMatch[1], 10)
    const unit = leadDaysMatch[2]
    result.lead_time_days = unit.startsWith("week") ? n * 7 : n
  }

  // Tooling — "£X tooling" or "tooling £X"
  const toolingMatch = lower.match(/tooling[^0-9£$]{0,30}[£$]?\s*(\d[\d,]*)/)
  if (toolingMatch) {
    const n = parseInt(toolingMatch[1].replace(/,/g, ""), 10)
    if (!Number.isNaN(n)) {
      result.tooling_cost_min_gbp = n
      result.tooling_cost_max_gbp = n
    }
  }

  // Payment terms — keep raw substring
  const termsMatch = reply.match(/(?:payment terms?|terms?)[^\n.]{0,80}/i)
  if (termsMatch) result.payment_terms = termsMatch[0].slice(0, 200).trim()

  // Per-unit at volume — look for "£X at 100", "£X / 1000 units", etc.
  for (const [tierKey, tier] of [["unit_price_at_100_gbp", 100], ["unit_price_at_1000_gbp", 1000], ["unit_price_at_10000_gbp", 10000]] as const) {
    const pattern = new RegExp(`[£$]\\s*(\\d+(?:\\.\\d+)?)\\s*(?:/|per|at|@|for)\\s*${tier}`, "i")
    const m = reply.match(pattern)
    if (m) {
      const n = parseFloat(m[1])
      if (!Number.isNaN(n)) result[tierKey as keyof HeuristicParseResult] = n as never
    }
  }

  const extracted = {
    moq_min: result.moq_min,
    lead_time_days: result.lead_time_days,
    tooling_cost_min_gbp: result.tooling_cost_min_gbp,
    payment_terms: result.payment_terms,
    unit_price_at_100_gbp: result.unit_price_at_100_gbp,
    unit_price_at_1000_gbp: result.unit_price_at_1000_gbp,
    unit_price_at_10000_gbp: result.unit_price_at_10000_gbp,
  }
  result.raw = extracted
  const hits = Object.values(extracted).filter((v) => v !== null).length
  if (hits === 0) result.parse_error = "No structured fields detected. Saved raw reply."
  return result
}

// ─── #20. AI supplier brief ─────────────────────────────────────────

export interface SupplierBrief {
  listingId: string
  whoLine: string
  greatAtLine: string
  watchForLine: string
  briefMarkdown: string
  generatedAt: string
  fromCache: boolean
}

/**
 * Generate (or read cached) 3-line supplier brief. Inputs hash-cached in the
 * supplier_ai_briefs table so the same underlying DB state yields a stable brief.
 * Pure heuristic for MVP — upgrade path plugs in an LLM.
 */
export async function getSupplierBrief(listingId: string): Promise<SupplierBrief | { error: string }> {
  const supabase = await createClient()
  const { data: listing, error } = await supabase
    .from("marketplace_listings")
    .select("id, title, description, country_iso, country, city, employee_count_exact, founded_year, lead_time, minimum_order, is_verified, iso_14001, data_quality_score, export_controls")
    .eq("id", listingId)
    .single()
  if (error || !listing) return { error: "Supplier not found" }

  const certCountRes = await supabase.from("supplier_certifications").select("cert_label", { count: "exact" }).eq("listing_id", listingId).limit(20)
  const capCountRes = await supabase.from("supplier_capabilities").select("process_category, materials, tolerance_min_mm", { count: "exact" }).eq("listing_id", listingId).limit(20)

  const certs = (certCountRes.data ?? []).map((c) => c.cert_label)
  const caps = capCountRes.data ?? []

  // Stable input hash for cache
  const input = { ...listing, certs, caps }
  const inputHash = createHash("sha1").update(JSON.stringify(input)).digest("hex")

  const cachedRes = await supabase.from("supplier_ai_briefs").select("*").eq("listing_id", listingId).eq("input_hash", inputHash).maybeSingle()
  if (cachedRes.data) {
    return {
      listingId,
      whoLine: cachedRes.data.who_line ?? "",
      greatAtLine: cachedRes.data.great_at_line ?? "",
      watchForLine: cachedRes.data.watch_for_line ?? "",
      briefMarkdown: cachedRes.data.brief_markdown,
      generatedAt: cachedRes.data.generated_at,
      fromCache: true,
    }
  }

  // Generate heuristic brief
  const who = buildWhoLine(listing as ListingRow)
  const greatAt = buildGreatAtLine(listing as ListingRow, certs, caps as CapabilityRow[])
  const watchFor = buildWatchForLine(listing as ListingRow, certs, caps as CapabilityRow[])
  const briefMarkdown = `**Who.** ${who}\n\n**Great at.** ${greatAt}\n\n**Watch for.** ${watchFor}`

  // Write cache (SECURITY: admin client — cache row is marketplace-wide read-only; foundry_id N/A: table is not tenant-scoped)
  const admin = createAdminClient()
  await admin.from("supplier_ai_briefs").upsert({
    listing_id: listingId,
    brief_markdown: briefMarkdown,
    who_line: who,
    great_at_line: greatAt,
    watch_for_line: watchFor,
    generated_model: "heuristic_v1",
    generated_at: new Date().toISOString(),
    input_hash: inputHash,
  })

  return {
    listingId,
    whoLine: who,
    greatAtLine: greatAt,
    watchForLine: watchFor,
    briefMarkdown,
    generatedAt: new Date().toISOString(),
    fromCache: false,
  }
}

interface ListingRow {
  title: string | null
  description: string | null
  country_iso: string | null
  country: string | null
  city: string | null
  employee_count_exact: number | null
  founded_year: number | null
  lead_time: string | null
  minimum_order: string | null
  is_verified: boolean | null
  iso_14001: boolean | null
  data_quality_score: number | null
  export_controls: string | null
}
interface CapabilityRow {
  process_category: string | null
  materials: string[] | null
  tolerance_min_mm: number | null
}

function buildWhoLine(l: ListingRow): string {
  const parts: string[] = []
  parts.push(l.title ?? "This supplier")
  const loc = [l.city, l.country_iso || l.country].filter(Boolean).join(", ")
  if (loc) parts.push(`based in ${loc}`)
  if (l.founded_year) parts.push(`founded ${l.founded_year}`)
  if (l.employee_count_exact) parts.push(`${l.employee_count_exact} employees`)
  return parts.join(", ") + "."
}

function buildGreatAtLine(l: ListingRow, certs: string[], caps: CapabilityRow[]): string {
  const processes = [...new Set(caps.map((c) => c.process_category).filter(Boolean) as string[])]
  const materials = [...new Set(caps.flatMap((c) => c.materials ?? []))].slice(0, 4)
  const tightestTolerance = caps.map((c) => c.tolerance_min_mm).filter((t): t is number => typeof t === "number").sort((a, b) => a - b)[0]
  const parts: string[] = []
  if (processes.length > 0) parts.push(`${processes.slice(0, 3).join(", ").replace(/_/g, " ")}`)
  if (materials.length > 0) parts.push(`working in ${materials.slice(0, 3).join(", ")}`)
  if (tightestTolerance !== undefined) parts.push(`holds tolerances to ±${tightestTolerance}mm`)
  if (certs.length > 0) parts.push(`certified to ${certs.slice(0, 3).join(", ")}`)
  if (parts.length === 0 && l.description) return (l.description.slice(0, 200) + (l.description.length > 200 ? "…" : ""))
  if (parts.length === 0) return "Scope of capability not yet detailed in our records — ask them directly."
  return parts.join("; ") + "."
}

function buildWatchForLine(l: ListingRow, certs: string[], caps: CapabilityRow[]): string {
  const watchPoints: string[] = []
  if (!l.is_verified) watchPoints.push("not yet verified in our marketplace")
  if ((l.data_quality_score ?? 0) < 40) watchPoints.push("sparse data profile — may be a small or recently-listed shop")
  if (!l.minimum_order) watchPoints.push("MOQ not disclosed — ask before quoting")
  if (!l.lead_time) watchPoints.push("lead time not disclosed — ask before quoting")
  if (certs.length === 0) watchPoints.push("no certifications on file")
  if (caps.length === 0) watchPoints.push("capability detail limited — request a site visit or video walk")
  if (l.export_controls && /itar|ear|dual.?use/i.test(l.export_controls)) watchPoints.push("export-controlled capability — check your licence position")
  if (watchPoints.length === 0) return "No obvious concerns on file. Still run a Capability Interview Pack before award."
  return watchPoints.slice(0, 4).join("; ") + "."
}

// ─── #16. RFQ response benchmarks ───────────────────────────────────

export interface RFQBenchmark {
  category: string
  responseCount: number
  medianPriceGbp: number | null
  minPriceGbp: number | null
  maxPriceGbp: number | null
  medianTimelineWeeks: number | null
}

/**
 * Aggregate historical rfq_responses by RFQ category to provide "typical quote"
 * benchmarks. Marketplace-wide read (all foundries' awarded/non-awarded quotes
 * anonymised — only stats are returned).
 */
export async function getRfqBenchmarks(categoryFilter?: string[]): Promise<{ benchmarks: RFQBenchmark[] } | { error: string }> {
  const supabase = await createClient()
  let query = supabase
    .from("rfqs")
    .select("id, category, rfq_responses(quoted_price, timeline_weeks)")
    .not("category", "is", null)
  if (categoryFilter && categoryFilter.length > 0) query = query.in("category", categoryFilter)
  const { data, error } = await query
  if (error) return { error: "Failed to load benchmarks" }

  const byCategory = new Map<string, { prices: number[]; weeks: number[] }>()
  for (const rfq of data ?? []) {
    const cat = rfq.category
    if (!cat) continue
    const bucket = byCategory.get(cat) ?? { prices: [], weeks: [] }
    const responses = (rfq.rfq_responses ?? []) as Array<{ quoted_price: number | null; timeline_weeks: number | null }>
    for (const r of responses) {
      if (typeof r.quoted_price === "number" && r.quoted_price > 0) bucket.prices.push(r.quoted_price)
      if (typeof r.timeline_weeks === "number" && r.timeline_weeks > 0) bucket.weeks.push(r.timeline_weeks)
    }
    byCategory.set(cat, bucket)
  }

  function median(xs: number[]): number | null {
    if (xs.length === 0) return null
    const sorted = [...xs].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  }

  const benchmarks: RFQBenchmark[] = []
  for (const [cat, { prices, weeks }] of byCategory) {
    if (prices.length === 0 && weeks.length === 0) continue
    benchmarks.push({
      category: cat,
      responseCount: prices.length,
      medianPriceGbp: median(prices),
      minPriceGbp: prices.length > 0 ? Math.min(...prices) : null,
      maxPriceGbp: prices.length > 0 ? Math.max(...prices) : null,
      medianTimelineWeeks: median(weeks),
    })
  }
  benchmarks.sort((a, b) => b.responseCount - a.responseCount)
  return { benchmarks }
}

// ─── #17. Sub-tier risk propagation ─────────────────────────────────

export interface SubTierRiskReport {
  /** listingId → related supplier ids one hop away */
  hops: Record<string, { listingId: string; name: string; relationshipType: string }[]>
  /** any downstream supplier currently flagged */
  downstreamSanctions: Array<{ upstream: string; downstream: string; listName: string }>
}

export async function getSubTierRisk(supplierIds: string[]): Promise<SubTierRiskReport> {
  if (supplierIds.length === 0) return { hops: {}, downstreamSanctions: [] }
  const supabase = await createClient()
  // Upstream → downstream edges (follow 'subcontracts_to', 'owned_by', 'subsidiary_of')
  const { data: edges } = await supabase
    .from("supplier_relationships")
    .select("parent_listing_id, child_listing_id, relationship_type, child:marketplace_listings!supplier_relationships_child_listing_id_fkey(id, title)")
    .in("parent_listing_id", supplierIds)
    .in("relationship_type", ["subcontracts_to", "owned_by", "subsidiary_of"])

  const hops: SubTierRiskReport["hops"] = {}
  const downstreamIds: string[] = []
  for (const e of edges ?? []) {
    const childRow = Array.isArray(e.child) ? e.child[0] : e.child
    const child = childRow as { id: string; title: string | null } | null
    if (!child) continue
    const list = hops[e.parent_listing_id] ?? []
    list.push({ listingId: child.id, name: child.title ?? "Unknown", relationshipType: e.relationship_type })
    hops[e.parent_listing_id] = list
    downstreamIds.push(child.id)
  }

  // Check downstream suppliers for active sanctions flags
  const downstreamSanctions: SubTierRiskReport["downstreamSanctions"] = []
  if (downstreamIds.length > 0) {
    const { data: flags } = await supabase
      .from("supplier_sanctions_flags")
      .select("listing_id, list_name")
      .in("listing_id", downstreamIds)
      .eq("active", true)
    for (const flag of flags ?? []) {
      // Find which upstream triggered this
      for (const [upstream, list] of Object.entries(hops)) {
        if (list.some((h) => h.listingId === flag.listing_id)) {
          downstreamSanctions.push({ upstream, downstream: flag.listing_id, listName: flag.list_name })
        }
      }
    }
  }
  return { hops, downstreamSanctions }
}

// ─── Supplier certification list (for UI display) ──────────────────

export async function getSupplierCertifications(listingId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("supplier_certifications")
    .select("cert_code, cert_label, issuer, issued_at, expires_at, verified, evidence_url")
    .eq("listing_id", listingId)
    .order("cert_label")
  if (error) return { error: "Failed to load certifications" }
  return { certifications: data ?? [] }
}
