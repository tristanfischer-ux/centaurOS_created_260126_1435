/**
 * @file cad-lab-supplier-snapshot.ts — Per-module marketplace aggregate.
 *
 * @description Phase 5D of the Source overhaul. Surfaces a "Real-World Supplier
 * Snapshot" on the Specify → Design for Manufacture tab for each diagnosed
 * module: how many marketplace suppliers match the process + material, how
 * many hold regulated-industry certifications, typical lead-time band,
 * regional spread.
 *
 * The snapshot complements the semantic technique library (which is about the
 * process) with a reality check on who could actually make the part today.
 *
 * @security `createClient()` — RLS on marketplace_listings is already
 * permissive for authenticated reads; the extra `auth.getUser()` gate here
 * prevents anonymous scraping of aggregate counts.
 *
 * @related
 * - UI consumer: src/components/cad/manufacturing-intelligence-tab.tsx
 * - Cert taxonomy: src/actions/cad-lab-supplier-match.ts (REGULATORY_CERTS)
 */

"use server"

import { createClient } from "@/lib/supabase/server"

export interface SupplierSnapshotInput {
  /** Module identifier — echoed back for client-side mapping. */
  moduleId: string
  /** Primary manufacturing process, e.g. "CNC Machining" or "Composite Layup". */
  process?: string | null
  /** Primary material, e.g. "Aluminium 6061" or "CFRP". */
  material?: string | null
  /**
   * Project-level industries. When present, the snapshot additionally reports
   * "N hold aerospace certs" / "N hold medical certs" counts aligned to the
   * project context, using the same regulated-cert taxonomy as the matcher.
   */
  projectIndustries?: string[]
}

export interface SupplierSnapshot {
  moduleId: string
  /** Total marketplace listings matching process AND/OR material. */
  total: number
  /** Subset marked is_verified=true. */
  verified: number
  /** Subset whose certifications include any regulated-industry fingerprint
   *  aligned to the project's industries (e.g. AS9100 for aerospace). */
  regulatedCertCount: number
  /**
   * Human-readable label for the regulated-cert count, e.g. "aerospace-certified"
   * or "medical-certified". null when no projectIndustries were supplied.
   */
  regulatedCertLabel: string | null
  /** Lead-time band inferred from free-text parsing (best-effort). */
  leadTimeDaysMin: number | null
  leadTimeDaysMax: number | null
  /** Top 4 country ISO codes by count. */
  topCountries: Array<{ country: string; count: number }>
  /** Top 4 region buckets (EU / UK / North America / Asia / Other) by count. */
  topRegions: Array<{ region: string; count: number }>
}

const REGULATORY_CERTS: Record<string, string[]> = {
  aerospace: ["as9100", "as 9100", "nadcap", "easa part"],
  medical: ["iso 13485", "iso13485", "fda registered", "ce medical", "mdr"],
  automotive: ["iatf 16949", "iatf16949", "ts 16949", "ts16949"],
  defence: ["itar", "cmmc", "mil-std", "di-mil", "dfars"],
  nuclear: ["nqa-1", "asme nqa"],
  food: ["haccp", "fssc 22000", "brc"],
}

const REGION_BUCKETS: Record<string, string> = {
  GB: "UK",
  IE: "UK",
  // EU
  DE: "EU", FR: "EU", IT: "EU", ES: "EU", PT: "EU", NL: "EU", BE: "EU",
  AT: "EU", CH: "EU", CZ: "EU", PL: "EU", SE: "EU", DK: "EU", FI: "EU",
  NO: "EU", RO: "EU", HU: "EU", GR: "EU", SK: "EU", SI: "EU", HR: "EU",
  EE: "EU", LV: "EU", LT: "EU", BG: "EU", LU: "EU",
  // North America
  US: "North America", CA: "North America", MX: "North America",
  // Asia
  CN: "Asia", JP: "Asia", KR: "Asia", IN: "Asia", TW: "Asia", SG: "Asia",
  TH: "Asia", VN: "Asia", MY: "Asia",
}

function toRegion(countryIso: string | null | undefined): string {
  if (!countryIso) return "Other"
  return REGION_BUCKETS[countryIso.toUpperCase()] ?? "Other"
}

/**
 * Best-effort parse of a free-text lead_time field into a (min, max) day range.
 * Handles shapes like "4-6 weeks", "10 days", "8 weeks", "2-3 months".
 * Returns null if the string doesn't look like a duration.
 */
function parseLeadTimeDays(raw: string | null | undefined): [number, number] | null {
  if (!raw) return null
  const s = raw.toLowerCase()
  const rangeMatch = s.match(/(\d+)\s*(?:-|to|–)\s*(\d+)\s*(day|week|month)/)
  if (rangeMatch) {
    const [, a, b, unit] = rangeMatch
    const mult = unit === "day" ? 1 : unit === "week" ? 7 : 30
    return [Number(a) * mult, Number(b) * mult]
  }
  const singleMatch = s.match(/(\d+)\s*(day|week|month)/)
  if (singleMatch) {
    const [, a, unit] = singleMatch
    const mult = unit === "day" ? 1 : unit === "week" ? 7 : 30
    const v = Number(a) * mult
    return [v, v]
  }
  return null
}

function pickStringArray(topLevel: unknown, attrs: Record<string, unknown>, attrKey: string): string[] {
  if (Array.isArray(topLevel) && topLevel.length > 0) {
    return topLevel.filter((v): v is string => typeof v === "string")
  }
  const fromAttrs = attrs[attrKey]
  if (Array.isArray(fromAttrs)) {
    return fromAttrs.filter((v): v is string => typeof v === "string")
  }
  return []
}

export async function getSupplierSnapshotForModule(
  input: SupplierSnapshotInput,
): Promise<SupplierSnapshot> {
  const empty: SupplierSnapshot = {
    moduleId: input.moduleId,
    total: 0,
    verified: 0,
    regulatedCertCount: 0,
    regulatedCertLabel: null,
    leadTimeDaysMin: null,
    leadTimeDaysMax: null,
    topCountries: [],
    topRegions: [],
  }

  const process = input.process?.trim().toLowerCase() ?? ""
  const material = input.material?.trim().toLowerCase() ?? ""
  if (!process && !material) return empty

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return empty

  // Fetch a bounded candidate set matching either process OR material on the
  // free-text surface of the listing. We over-fetch (200 cap) then aggregate
  // in memory — marketplace_listings has ~10k rows so this is cheap.
  const escaped = (s: string) => s.replace(/[,()*]/g, " ").trim()
  const orParts: string[] = []
  if (process) {
    const p = escaped(process)
    orParts.push(`title.ilike.%${p}%`, `description.ilike.%${p}%`, `subcategory.ilike.%${p}%`)
  }
  if (material) {
    const m = escaped(material)
    orParts.push(`title.ilike.%${m}%`, `description.ilike.%${m}%`)
  }

  if (orParts.length === 0) return empty

  const { data: listings, error } = await supabase
    .from("marketplace_listings")
    .select("id, is_verified, country, country_iso, lead_time, attributes, certifications, materials, industries")
    .eq("category", "Services")
    .or(orParts.join(","))
    .limit(200)

  if (error || !listings) {
    if (error) {
      console.warn("[getSupplierSnapshotForModule] select failed:", error.message)
    }
    return empty
  }

  // Aggregate
  let verified = 0
  let regulatedCertCount = 0
  const countryCounts = new Map<string, number>()
  const regionCounts = new Map<string, number>()
  const leadTimeMins: number[] = []
  const leadTimeMaxs: number[] = []

  const projectIndustries = new Set(
    (input.projectIndustries ?? []).map((i) => i.toLowerCase()),
  )

  // Build the combined regulated-cert fingerprint set for the project's industries.
  const regulatedFingerprints: string[] = []
  for (const ind of projectIndustries) {
    const fps = REGULATORY_CERTS[ind]
    if (fps) regulatedFingerprints.push(...fps)
  }

  // Label: "aerospace-certified" if the first industry is aerospace, else "regulated-cert".
  const firstInd = [...projectIndustries][0]
  const regulatedCertLabel =
    projectIndustries.size === 0
      ? null
      : firstInd
          ? `${firstInd}-certified`
          : "regulated-cert"

  for (const listing of listings) {
    if (listing.is_verified === true) verified++

    const iso = (listing.country_iso ?? listing.country ?? "").toString().trim().toUpperCase()
    if (iso && iso.length <= 3) {
      countryCounts.set(iso, (countryCounts.get(iso) ?? 0) + 1)
      const region = toRegion(iso)
      regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1)
    } else {
      regionCounts.set("Other", (regionCounts.get("Other") ?? 0) + 1)
    }

    if (regulatedFingerprints.length > 0) {
      const attrs = (listing.attributes as Record<string, unknown>) || {}
      const certs = pickStringArray(listing.certifications, attrs, "certifications")
      const lowerCerts = certs.map((c) => c.toLowerCase())
      if (lowerCerts.some((c) => regulatedFingerprints.some((fp) => c.includes(fp)))) {
        regulatedCertCount++
      }
    }

    const parsed = parseLeadTimeDays(listing.lead_time as string | null)
    if (parsed) {
      leadTimeMins.push(parsed[0])
      leadTimeMaxs.push(parsed[1])
    }
  }

  // Lead-time band: 20th/80th percentile to dodge outliers.
  const percentile = (arr: number[], p: number): number | null => {
    if (arr.length === 0) return null
    const sorted = [...arr].sort((a, b) => a - b)
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))
    return sorted[idx]
  }

  const topCountries = [...countryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([country, count]) => ({ country, count }))

  const topRegions = [...regionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([region, count]) => ({ region, count }))

  return {
    moduleId: input.moduleId,
    total: listings.length,
    verified,
    regulatedCertCount,
    regulatedCertLabel,
    leadTimeDaysMin: percentile(leadTimeMins, 0.2),
    leadTimeDaysMax: percentile(leadTimeMaxs, 0.8),
    topCountries,
    topRegions,
  }
}

/**
 * Batch helper — fetches snapshots for many modules in parallel, capped at 10
 * concurrent queries to avoid Supabase connection thrash.
 */
export async function getSupplierSnapshotsForModules(
  inputs: SupplierSnapshotInput[],
): Promise<Record<string, SupplierSnapshot>> {
  const results: Record<string, SupplierSnapshot> = {}
  const CONCURRENCY = 5

  for (let i = 0; i < inputs.length; i += CONCURRENCY) {
    const batch = inputs.slice(i, i + CONCURRENCY)
    const snapshots = await Promise.all(
      batch.map((input) => getSupplierSnapshotForModule(input)),
    )
    for (const snap of snapshots) {
      results[snap.moduleId] = snap
    }
  }

  return results
}
