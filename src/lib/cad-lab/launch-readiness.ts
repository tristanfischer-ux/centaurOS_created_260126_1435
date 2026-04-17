/**
 * @file launch-readiness.ts — Composite 0-100 score for shipping a first pilot.
 *
 * @description Reads the Forge project's Source + Assemble state and produces a
 * single number that tells a founder: are you ready to ship? Five dimensions,
 * each 0-20 points. Each dimension exposes its own breakdown so the UI can
 * show what's missing.
 *
 * Pure function — no DB calls, no side effects.
 *
 * Dimensions (100 pts total):
 *   1. Supplier coverage (20)   — shortlisted supplier per make-category
 *   2. Dual sourcing (15)       — ≥2 ranked suppliers per make-category
 *   3. FAI readiness (15)       — First Article Inspection checklist per module
 *   4. Compliance packet (20)   — region → regulation → supplier attestation
 *   5. Shipping + fulfilment (15)
 *   6. Manufacturing orders (15) — RFQs sent / awarded / production running
 *
 * @related
 * - Consumer: src/components/cad/launch-readiness-gauge.tsx
 * - Source state: src/app/(platform)/the-forge/cad-lab/source/page.tsx
 * - Assemble state: src/app/(platform)/the-forge/cad-lab/assemble/page.tsx
 */

import type { CategoryNode } from "@/lib/sankey-utils"
import type { ShortlistedSupplier } from "@/app/(platform)/the-forge/cad-lab/source/page"
import type { FAIChecklistState } from "@/lib/cad-lab/fai-state"
import type { CompliancePacketState } from "@/lib/cad-lab/compliance-regulations"

// ─── Public types ────────────────────────────────────────────────────

export interface DimensionScore {
  id: string
  label: string
  score: number
  max: number
  /** Short natural-language hint surfacing what's missing */
  hint: string
}

export interface LaunchReadinessReport {
  totalScore: number
  totalMax: number
  percent: number
  /** "critical" | "at-risk" | "on-track" | "ready" */
  status: "critical" | "at-risk" | "on-track" | "ready"
  dimensions: DimensionScore[]
  /** One-line summary for the gauge label */
  summary: string
  /** Top 3 recommended next actions */
  nextActions: string[]
}

// ─── Inputs ──────────────────────────────────────────────────────────

export interface LaunchReadinessInput {
  /** Make-type categories (buy-type ignored — don't need a supplier match) */
  categories: CategoryNode[]
  /** Shortlisted suppliers keyed by supplier id */
  shortlistedSuppliers: Map<string, ShortlistedSupplier>
  /** Per-category top-3 ordered supplier ids */
  categoryRankings: Map<string, string[]>
  /** FAI checklist state per module */
  faiState: FAIChecklistState
  /** Compliance packet state */
  complianceState: CompliancePacketState
  /** Shipping config filled in? */
  shippingReady: boolean
  /** Branding config filled in? */
  brandingReady: boolean
  /** Number of active manufacturing orders */
  manufacturingOrderCount: number
  /** Total number of modules in the project */
  moduleCount: number
}

// ─── Scoring helpers ─────────────────────────────────────────────────

function scoreSupplierCoverage(
  makeCategories: CategoryNode[],
  categoryRankings: Map<string, string[]>,
): DimensionScore {
  const max = 20
  if (makeCategories.length === 0) {
    return { id: "coverage", label: "Supplier coverage", score: 0, max, hint: "No make-type categories yet — specify modules first." }
  }
  const covered = makeCategories.filter((c) => (categoryRankings.get(c.id) ?? []).length > 0)
  const percent = covered.length / makeCategories.length
  const score = Math.round(percent * max)
  const missing = makeCategories.length - covered.length
  const hint = missing === 0
    ? `All ${makeCategories.length} make-categories have at least one ranked supplier.`
    : `${missing} of ${makeCategories.length} make-categories still need a ranked supplier.`
  return { id: "coverage", label: "Supplier coverage", score, max, hint }
}

function scoreDualSourcing(
  makeCategories: CategoryNode[],
  categoryRankings: Map<string, string[]>,
): DimensionScore {
  const max = 15
  if (makeCategories.length === 0) {
    return { id: "dual-source", label: "Dual sourcing", score: 0, max, hint: "Nothing to assess yet." }
  }
  const dualSourced = makeCategories.filter((c) => (categoryRankings.get(c.id) ?? []).length >= 2)
  const percent = dualSourced.length / makeCategories.length
  const score = Math.round(percent * max)
  const missing = makeCategories.length - dualSourced.length
  const hint = missing === 0
    ? `All make-categories have a backup supplier ranked.`
    : `${missing} categor${missing === 1 ? "y lacks" : "ies lack"} a backup. Rank a 2nd choice in the Shortlist tab.`
  return { id: "dual-source", label: "Dual sourcing", score, max, hint }
}

function scoreFAI(faiState: FAIChecklistState, moduleCount: number): DimensionScore {
  const max = 15
  if (moduleCount === 0) {
    return { id: "fai", label: "FAI readiness", score: 0, max, hint: "No modules specified yet." }
  }
  const perModuleFields = ["dimensional_check", "material_cert", "functional_test", "visual_inspection", "traceability_record"] as const
  let totalFields = 0
  let passedFields = 0
  for (const modId of Object.keys(faiState)) {
    const entry = faiState[modId]
    for (const key of perModuleFields) {
      totalFields++
      if (entry?.[key] === "pass") passedFields++
    }
  }
  // INTENT: Expand total to the "expected" set so missing modules count as zero
  const expected = moduleCount * perModuleFields.length
  const denominator = Math.max(expected, totalFields)
  const percent = denominator === 0 ? 0 : passedFields / denominator
  const score = Math.round(percent * max)
  const hint = passedFields === expected
    ? `All FAI checks passed across ${moduleCount} modules.`
    : `${passedFields} of ${expected} FAI line items passed. Log dimensional, material, functional, visual + traceability for each module.`
  return { id: "fai", label: "First Article Inspection", score, max, hint }
}

function scoreCompliance(state: CompliancePacketState): DimensionScore {
  const max = 20
  const regs = state.regulations ?? []
  if (regs.length === 0) {
    return { id: "compliance", label: "Compliance packet", score: 0, max, hint: "Open the Compliance tab and select your target market regulations." }
  }
  let requiredCount = 0
  let satisfied = 0
  for (const reg of regs) {
    if (!reg.applicable) continue
    requiredCount++
    if (reg.status === "attested" || reg.status === "certified") satisfied++
  }
  if (requiredCount === 0) {
    return { id: "compliance", label: "Compliance packet", score: 0, max, hint: "Mark at least one regulation as applicable in the Compliance tab." }
  }
  const percent = satisfied / requiredCount
  const score = Math.round(percent * max)
  const missing = requiredCount - satisfied
  const hint = missing === 0
    ? `All ${requiredCount} applicable regulations have supplier attestation or certification.`
    : `${missing} of ${requiredCount} regulations still need supplier attestation.`
  return { id: "compliance", label: "Compliance packet", score, max, hint }
}

function scoreFulfilment(shippingReady: boolean, brandingReady: boolean): DimensionScore {
  const max = 15
  let score = 0
  const missing: string[] = []
  if (brandingReady) score += 7
  else missing.push("branding & packaging")
  if (shippingReady) score += 8
  else missing.push("shipping & fulfilment")
  const hint = missing.length === 0
    ? `Branding, packaging and fulfilment are all configured.`
    : `Configure ${missing.join(" + ")} in the Assemble tabs.`
  return { id: "fulfilment", label: "Packaging & shipping", score, max, hint }
}

function scoreOrders(orderCount: number): DimensionScore {
  const max = 15
  if (orderCount === 0) {
    return { id: "orders", label: "Manufacturing orders", score: 0, max, hint: "Create your first RFQ or manufacturing order from the Shortlist tab." }
  }
  // INTENT: Each active order worth 5 points up to 3 orders. More orders = real signal that production is moving.
  const score = Math.min(max, orderCount * 5)
  const hint = orderCount < 3
    ? `${orderCount} active manufacturing order${orderCount === 1 ? "" : "s"}. Creating additional orders increases this score.`
    : `${orderCount} active manufacturing orders — production pipeline is live.`
  return { id: "orders", label: "Manufacturing orders", score, max, hint }
}

// ─── Public — compute the readiness report ───────────────────────────

export function computeLaunchReadiness(input: LaunchReadinessInput): LaunchReadinessReport {
  const makeCategories = input.categories.filter((c) => c.type !== "buy")

  const coverage = scoreSupplierCoverage(makeCategories, input.categoryRankings)
  const dualSource = scoreDualSourcing(makeCategories, input.categoryRankings)
  const fai = scoreFAI(input.faiState, input.moduleCount)
  const compliance = scoreCompliance(input.complianceState)
  const fulfilment = scoreFulfilment(input.shippingReady, input.brandingReady)
  const orders = scoreOrders(input.manufacturingOrderCount)

  const dimensions = [coverage, dualSource, fai, compliance, fulfilment, orders]
  const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0)
  const totalMax = dimensions.reduce((sum, d) => sum + d.max, 0)
  const percent = totalMax === 0 ? 0 : Math.round((totalScore / totalMax) * 100)

  let status: LaunchReadinessReport["status"] = "critical"
  if (percent >= 90) status = "ready"
  else if (percent >= 70) status = "on-track"
  else if (percent >= 40) status = "at-risk"

  const summary =
    status === "ready"
      ? "Ready to ship — all key areas covered."
      : status === "on-track"
      ? "On track — a few gaps left to close."
      : status === "at-risk"
      ? "Launch at risk — material gaps remain."
      : "Not launch-ready yet — foundational work needed."

  // INTENT: Surface the 3 lowest-scoring non-perfect dimensions as next actions
  const nextActions = dimensions
    .filter((d) => d.score < d.max)
    .sort((a, b) => (a.score / a.max) - (b.score / b.max))
    .slice(0, 3)
    .map((d) => d.hint)

  return {
    totalScore,
    totalMax,
    percent,
    status,
    dimensions,
    summary,
    nextActions,
  }
}
