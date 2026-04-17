/**
 * @file supply-risk.ts — Compute supply chain risk signals for a Forge project.
 *
 * @description Reads shortlisted suppliers + per-category rankings and produces
 * a risk assessment: dual-sourcing gaps, geographic concentration, trade-lane
 * exposure, and tariff-sensitive origin warnings.
 *
 * Pure function — no DB calls, no side effects. Feed it the UI state and it
 * returns a structured { alerts, summary } object for the Supply Risk Radar.
 *
 * @related
 * - Consumer: src/components/cad/supply-risk-radar.tsx
 * - Shortlist state: src/app/(platform)/the-forge/cad-lab/source/page.tsx
 */

import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"
import type { ShortlistedSupplier } from "@/app/(platform)/the-forge/cad-lab/source/page"

// ─── Tariff / trade-lane reference data ─────────────────────────────

// INTENT: Countries that trigger US Section 301 tariff exposure when shipping
// into the US. Not exhaustive — conservative set that catches obvious flags.
// Founders selling into the US market need to see this signal.
const US_SECTION_301_ORIGINS = new Set<string>([
  "china",
  "hong kong",
  "taiwan",
])

// INTENT: Single-port / single-lane dependency signals. Country name substring
// matches — we use country strings loosely because marketplace_listings.country
// is free text and varies in casing.
const TRADE_LANE_CLUSTERS: Record<string, string[]> = {
  "east asia": ["china", "hong kong", "taiwan", "south korea", "japan", "vietnam"],
  "eu": ["germany", "france", "italy", "spain", "netherlands", "poland", "czech republic", "czechia"],
  "uk": ["united kingdom", "uk", "england", "scotland", "wales", "northern ireland"],
  "north america": ["united states", "usa", "us", "canada", "mexico"],
  "south asia": ["india", "pakistan", "bangladesh"],
}

// ─── Public types ────────────────────────────────────────────────────

export type RiskSeverity = "info" | "warning" | "critical"

export interface SupplyRiskAlert {
  id: string
  severity: RiskSeverity
  title: string
  body: string
  /** Optional action hint — e.g., "Add backup supplier for Category X" */
  action?: string
  /** Optional list of affected IDs (supplier or category) */
  affected?: string[]
}

export interface GeographicBreakdown {
  country: string
  supplierCount: number
  percent: number
  supplierIds: string[]
}

export interface SupplyRiskReport {
  alerts: SupplyRiskAlert[]
  /** Countries sorted by supplier count, descending */
  geography: GeographicBreakdown[]
  /** Trade-lane cluster rollup (east asia, eu, etc.) */
  lanes: { lane: string; supplierCount: number; percent: number }[]
  /** True if any critical alert exists */
  hasCriticalRisk: boolean
  /** High-level summary string for screen readers + bots */
  summary: string
}

// ─── Inputs ──────────────────────────────────────────────────────────

export interface SupplyRiskInput {
  /** Shortlisted suppliers keyed by supplier id */
  shortlistedSuppliers: Map<string, ShortlistedSupplier>
  /** Per-category top-3 rankings: category id → ordered supplier ids */
  categoryRankings: Map<string, string[]>
  /** Supplier matches by module, used to look up enriched fields (country, etc.) */
  supplierMatches: Map<string, CadLabSupplierMatch[]>
  /** Category labels (for alerting) — optional, keyed by category id */
  categoryLabels?: Map<string, string>
  /** Where the product ships. If "US", triggers Section 301 warnings. */
  targetMarket?: "US" | "UK" | "EU" | "other"
}

// ─── Helper — build a lookup from supplier id → enriched match ─────

function buildMatchIndex(
  supplierMatches: Map<string, CadLabSupplierMatch[]>,
): Map<string, CadLabSupplierMatch> {
  const idx = new Map<string, CadLabSupplierMatch>()
  for (const matches of supplierMatches.values()) {
    for (const m of matches) {
      const existing = idx.get(m.id)
      // INTENT: Keep the highest-score entry so we have the best enrichment data
      if (!existing || m.matchScore > existing.matchScore) idx.set(m.id, m)
    }
  }
  return idx
}

function normaliseCountry(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed
}

function laneFor(countryLower: string): string | null {
  for (const [lane, countries] of Object.entries(TRADE_LANE_CLUSTERS)) {
    for (const c of countries) {
      if (countryLower.includes(c)) return lane
    }
  }
  return null
}

// ─── Public — compute the risk report ────────────────────────────────

export function computeSupplyRisk(input: SupplyRiskInput): SupplyRiskReport {
  const {
    shortlistedSuppliers,
    categoryRankings,
    supplierMatches,
    categoryLabels,
    targetMarket = "UK",
  } = input

  const matchIndex = buildMatchIndex(supplierMatches)
  const alerts: SupplyRiskAlert[] = []

  // ── Dual-sourcing check ──
  // A category is high-risk if it has 0 or 1 ranked suppliers.
  const singleSourceCategories: { categoryId: string; label: string; rankedCount: number }[] = []
  for (const [catId, ranked] of categoryRankings) {
    if (ranked.length < 2) {
      const label = categoryLabels?.get(catId) ?? catId
      singleSourceCategories.push({ categoryId: catId, label, rankedCount: ranked.length })
    }
  }
  if (singleSourceCategories.length > 0) {
    const zeroSources = singleSourceCategories.filter((c) => c.rankedCount === 0)
    const oneSource = singleSourceCategories.filter((c) => c.rankedCount === 1)
    if (zeroSources.length > 0) {
      alerts.push({
        id: "dual-source-missing",
        severity: "critical",
        title: `${zeroSources.length} categor${zeroSources.length === 1 ? "y has" : "ies have"} no shortlisted supplier`,
        body: `You cannot build these categories until a supplier is ranked: ${zeroSources.map((c) => c.label).join(", ")}.`,
        action: "Open the Shortlist tab and rank at least one supplier per category.",
        affected: zeroSources.map((c) => c.categoryId),
      })
    }
    if (oneSource.length > 0) {
      alerts.push({
        id: "dual-source-single",
        severity: "warning",
        title: `${oneSource.length} categor${oneSource.length === 1 ? "y has" : "ies have"} only one supplier`,
        body: `A single supplier per category is a launch risk. If they can't deliver, you cannot build.`,
        action: `Add a second-rank backup for: ${oneSource.map((c) => c.label).join(", ")}.`,
        affected: oneSource.map((c) => c.categoryId),
      })
    }
  }

  // ── Geographic concentration ──
  const byCountry = new Map<string, string[]>() // country → supplier ids
  const supplierIdsInScope = [...shortlistedSuppliers.keys()]
  for (const supplierId of supplierIdsInScope) {
    const match = matchIndex.get(supplierId)
    const country = normaliseCountry(match?.country)
    if (!country) continue
    const list = byCountry.get(country) ?? []
    list.push(supplierId)
    byCountry.set(country, list)
  }

  const totalGeocoded = [...byCountry.values()].reduce((sum, arr) => sum + arr.length, 0)
  const geography: GeographicBreakdown[] = [...byCountry.entries()]
    .map(([country, supplierIds]) => ({
      country,
      supplierCount: supplierIds.length,
      percent: totalGeocoded > 0 ? Math.round((supplierIds.length / totalGeocoded) * 100) : 0,
      supplierIds,
    }))
    .sort((a, b) => b.supplierCount - a.supplierCount)

  if (geography.length > 0) {
    const top = geography[0]
    if (top.percent >= 70 && top.supplierCount >= 2) {
      alerts.push({
        id: "geo-concentration",
        severity: top.percent >= 85 ? "critical" : "warning",
        title: `${top.percent}% of your shortlisted suppliers are in ${top.country}`,
        body: `Geographic concentration increases exposure to tariffs, export controls, shipping disruption, and currency swings. Aim for at least one qualified backup in a different region.`,
        action: `Open Suppliers tab and shortlist a backup in a different country.`,
        affected: top.supplierIds,
      })
    }
  }

  // ── Trade-lane clusters ──
  const laneBuckets = new Map<string, number>()
  for (const geo of geography) {
    const lane = laneFor(geo.country.toLowerCase())
    if (lane) laneBuckets.set(lane, (laneBuckets.get(lane) ?? 0) + geo.supplierCount)
  }
  const lanes = [...laneBuckets.entries()]
    .map(([lane, supplierCount]) => ({
      lane,
      supplierCount,
      percent: totalGeocoded > 0 ? Math.round((supplierCount / totalGeocoded) * 100) : 0,
    }))
    .sort((a, b) => b.supplierCount - a.supplierCount)

  // ── Section 301 tariff exposure (US-bound products) ──
  if (targetMarket === "US") {
    const exposed = geography.filter((g) =>
      US_SECTION_301_ORIGINS.has(g.country.toLowerCase()),
    )
    const exposedCount = exposed.reduce((sum, g) => sum + g.supplierCount, 0)
    if (exposedCount > 0 && totalGeocoded > 0) {
      const pct = Math.round((exposedCount / totalGeocoded) * 100)
      alerts.push({
        id: "tariff-exposure-us",
        severity: pct >= 50 ? "warning" : "info",
        title: `${pct}% of suppliers sit in a US Section 301 tariff region`,
        body: `Products shipped into the US from these origins may face additional tariffs of 7.5-25%+ on top of base duties. Build this into your landed-cost model.`,
        action: `Discuss US tariff treatment with each supplier during the RFQ stage.`,
        affected: exposed.flatMap((g) => g.supplierIds),
      })
    }
  }

  // ── Headline summary (for a11y + AI context) ──
  const supplierCount = shortlistedSuppliers.size
  const criticalCount = alerts.filter((a) => a.severity === "critical").length
  const warningCount = alerts.filter((a) => a.severity === "warning").length
  const summary = supplierCount === 0
    ? "No shortlisted suppliers yet — risk radar will populate once you shortlist."
    : `${supplierCount} supplier${supplierCount === 1 ? "" : "s"} shortlisted across ${geography.length} countr${geography.length === 1 ? "y" : "ies"}. ${criticalCount} critical + ${warningCount} warning${warningCount === 1 ? "" : "s"}.`

  return {
    alerts,
    geography,
    lanes,
    hasCriticalRisk: criticalCount > 0,
    summary,
  }
}
