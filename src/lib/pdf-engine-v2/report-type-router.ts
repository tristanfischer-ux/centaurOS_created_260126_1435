/**
 * @file report-type-router.ts — PA Stage 9: Report Type Router
 *
 * Deterministic lookup table that maps FeasibilityResult + StructuredBriefJSON
 * to a ReportType, page budget, and excluded-sections list.
 *
 * Phase F of the Strict PA Adoption Migration (2026-05-08).
 * Reference: ~/Downloads/prompt_architecture.pdf, Section 1 stage table + PA Stage 9.
 *
 * Rules (verbatim from STRICT-ADOPTION-MIGRATION-PLAN.md Phase F spec):
 *
 *   BRIEF_INCOMPLETE (max 6 pages):
 *     parsedBrief.confidence === 'LOW' AND missing_mandatory_fields.length > 5
 *
 *   FEASIBILITY_EXCEPTION (max 12 pages):
 *     feasibilityResult.status === 'FAIL' AND failChecks.length > 1
 *     OR (legacy path) feasibilityResult.status === 'RED' AND blockers.length > 1
 *
 *   FULL_REPORT (no cap):
 *     feasibilityResult.status === 'PASS' → no cap, no banners
 *     feasibilityResult.status === 'WARN' + zero FAIL checks → warning banners
 *     feasibilityResult.status === 'WARN' + exactly one FAIL check → prominent callout
 *     (legacy) status === 'GREEN' or 'AMBER' → FULL_REPORT
 *
 * Note on PA vs legacy status vocabulary:
 *   PA uses  'PASS' | 'WARN' | 'FAIL'
 *   Legacy uses 'GREEN' | 'AMBER' | 'RED' | 'UNREVIEWED'
 *   Both vocabularies are accepted here so the router works regardless of which
 *   feasibility gate produced the result.
 */

import type { StructuredBriefJSON } from './types'
import type { FeasibilityResult } from './feasibility-gate'

// ── PA Stage 9 Report Type Router ─────────────────────────────────────────

export type ReportType = 'FULL_REPORT' | 'FEASIBILITY_EXCEPTION' | 'BRIEF_INCOMPLETE'

export interface ReportTypeRouterResult {
  /** The resolved report type */
  reportType: ReportType
  /** Maximum pages to render. 0 = no cap; 12 for FEASIBILITY_EXCEPTION; 6 for BRIEF_INCOMPLETE */
  maxPages: number
  /** Human-readable explanation of why this route was chosen */
  reason: string
  /** Section keys to omit from the renderer. Empty array = render everything */
  excludedSections: string[]
  /**
   * Warning banners to surface on FULL_REPORT with one WARN-FAIL check.
   * Populated when reportType === 'FULL_REPORT' and exactly one fail check exists.
   */
  warningBanners?: string[]
}

// Sections to always omit when the report is abbreviated
const BRIEF_INCOMPLETE_EXCLUDED: string[] = [
  'feasibility',
  'regulatory',
  'sizing',
  'modules',
  'bom',
  'cost',
  'suppliers',
  'risks',
  'research',
  'audit_log',
]

const FEASIBILITY_EXCEPTION_EXCLUDED: string[] = [
  'modules',    // detailed module descriptions omitted — too much detail for exception report
  'bom',        // only summary table shown, not full BOM
  'suppliers',  // supplier list omitted on exception path
  'risks',      // only top 3 risks shown — full FMEA is omitted
  'research',   // only headline market context shown
]

/**
 * Count FAIL-level checks from a FeasibilityResult.
 *
 * The legacy FeasibilityResult uses `blockers[]` as the FAIL-equivalent list.
 * PA-native results may use a `checks[]` array with machine IDs; for now the
 * router reads `blockers` (present on both paths) and falls back to status.
 */
function countFailChecks(feasibilityResult: FeasibilityResult): number {
  return (feasibilityResult.blockers ?? []).length
}

/**
 * Map a FeasibilityResult status to a PA-normalised tier.
 * Returns 'PASS' | 'WARN' | 'FAIL'.
 */
function normaliseStatus(status: string): 'PASS' | 'WARN' | 'FAIL' {
  const s = (status ?? '').toUpperCase()
  // PA vocabulary
  if (s === 'PASS') return 'PASS'
  if (s === 'WARN') return 'WARN'
  if (s === 'FAIL') return 'FAIL'
  // Legacy vocabulary
  if (s === 'GREEN') return 'PASS'
  if (s === 'AMBER') return 'WARN'
  if (s === 'RED') return 'FAIL'
  if (s === 'UNREVIEWED') return 'PASS'  // treat unreviewed as pass (safe default)
  return 'PASS'
}

/**
 * PA Stage 9 — Report Type Router
 *
 * Deterministic lookup: no LLM, no I/O. Pure function of the two inputs.
 *
 * @param feasibilityResult - Output from the Feasibility Gate (PA Stage 8 / determineFeasibility)
 * @param parsedBrief       - Optional PA Stage 1 output; when absent defaults to FULL_REPORT
 */
export function routeReportType(
  feasibilityResult: FeasibilityResult,
  parsedBrief?: StructuredBriefJSON,
): ReportTypeRouterResult {
  // ── Rule 1: BRIEF_INCOMPLETE ──────────────────────────────────────────
  // Triggered only when PA Stage 1 produced a parsedBrief — without it we
  // cannot evaluate confidence or missing_mandatory_fields, so we default
  // to FULL_REPORT and let the feasibility gate decide.
  if (
    parsedBrief &&
    parsedBrief.confidence === 'LOW' &&
    parsedBrief.missing_mandatory_fields.length > 5
  ) {
    return {
      reportType: 'BRIEF_INCOMPLETE',
      maxPages: 6,
      reason: `Brief confidence is LOW and ${parsedBrief.missing_mandatory_fields.length} mandatory fields are missing (${parsedBrief.missing_mandatory_fields.slice(0, 3).join(', ')}…). Cannot produce a full engineering report without a complete brief.`,
      excludedSections: BRIEF_INCOMPLETE_EXCLUDED,
    }
  }

  const normStatus = normaliseStatus(feasibilityResult.status)
  const failCount = countFailChecks(feasibilityResult)

  // ── Rule 2: FEASIBILITY_EXCEPTION ────────────────────────────────────
  // Triggered when status is FAIL/RED with more than one fail check.
  // If there is exactly one fail check, we route to FULL_REPORT with a
  // prominent warning callout instead (Rule 4b).
  if (normStatus === 'FAIL' && failCount > 1) {
    return {
      reportType: 'FEASIBILITY_EXCEPTION',
      maxPages: 12,
      reason: `Feasibility gate returned ${feasibilityResult.status} with ${failCount} fail checks. Rendering abbreviated exception report (cover + feasibility gate + brief + reduction paths).`,
      excludedSections: FEASIBILITY_EXCEPTION_EXCLUDED,
    }
  }

  // ── Rule 3: FULL_REPORT — clean PASS ─────────────────────────────────
  if (normStatus === 'PASS') {
    return {
      reportType: 'FULL_REPORT',
      maxPages: 0,
      reason: 'Feasibility gate passed all checks. Full report rendered.',
      excludedSections: [],
    }
  }

  // ── Rule 4a: FULL_REPORT — WARN with zero fail checks ─────────────────
  if (normStatus === 'WARN' && failCount === 0) {
    const banners = (feasibilityResult.warnings ?? []).map(w => `Warning: ${w}`)
    return {
      reportType: 'FULL_REPORT',
      maxPages: 0,
      reason: `Feasibility gate returned ${feasibilityResult.status} with ${feasibilityResult.warnings?.length ?? 0} warnings and zero fail checks. Full report rendered with warning banners.`,
      excludedSections: [],
      warningBanners: banners,
    }
  }

  // ── Rule 4b: FULL_REPORT — WARN/FAIL with exactly one fail check ──────
  // Includes: WARN with exactly 1 fail check, or FAIL with exactly 1 fail check.
  if (failCount === 1) {
    const failCheck = feasibilityResult.blockers?.[0] ?? 'One feasibility check failed'
    return {
      reportType: 'FULL_REPORT',
      maxPages: 0,
      reason: `Feasibility gate returned ${feasibilityResult.status} with exactly one fail check. Full report rendered with prominent warning callout.`,
      excludedSections: [],
      warningBanners: [failCheck],
    }
  }

  // ── Default: FULL_REPORT ──────────────────────────────────────────────
  // Catches any edge case not covered above (e.g. WARN with >1 fail but not >1 blocker).
  return {
    reportType: 'FULL_REPORT',
    maxPages: 0,
    reason: `Default route: status=${feasibilityResult.status}, failCount=${failCount}. Rendering full report.`,
    excludedSections: [],
  }
}
