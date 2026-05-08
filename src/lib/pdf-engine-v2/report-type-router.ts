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
 *
 * F-1 fix (5 seats): unknown/null/UNREVIEWED status now maps to FEASIBILITY_EXCEPTION
 * (fail-closed), not PASS (fail-open). Callers receiving FEASIBILITY_EXCEPTION from
 * an unknown status should treat the result as worst-case.
 */
export function normaliseStatus(status: string | null | undefined): 'PASS' | 'WARN' | 'FAIL' {
  const s = ((status ?? '') as string).toUpperCase()
  // PA vocabulary — explicit handling for every known value
  if (s === 'PASS') return 'PASS'
  if (s === 'WARN') return 'WARN'
  if (s === 'FAIL') return 'FAIL'
  // Legacy vocabulary
  if (s === 'GREEN') return 'PASS'
  if (s === 'AMBER') return 'WARN'
  if (s === 'RED') return 'FAIL'
  // F-1: UNREVIEWED and any unknown string → FAIL (fail-closed; treat as worst case).
  // Previously this defaulted to PASS which silently routed errored/pending
  // feasibility results to FULL_REPORT with zero banners.
  return 'FAIL'
}

/**
 * Sentinel value for "no page cap" on FULL_REPORT paths.
 *
 * F-11 fix (3 seats): using the named constant + JSDoc makes the convention
 * explicit so renderers (Phase G) cannot misread 0 as "zero pages allowed".
 * Phase G renderer must check `maxPages === UNLIMITED_PAGES` before applying
 * any page cap — never interpret 0 as a hard limit of zero pages.
 */
export const UNLIMITED_PAGES = 0

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
    // F-6 fix (3 seats): guard against undefined/null array before .length access.
    // LLMs may omit missing_mandatory_fields even when schema declares it required.
    (parsedBrief.missing_mandatory_fields ?? []).length > 5
  ) {
    return {
      reportType: 'BRIEF_INCOMPLETE',
      maxPages: 6,
      reason: `Brief confidence is LOW and ${(parsedBrief.missing_mandatory_fields ?? []).length} mandatory fields are missing (${(parsedBrief.missing_mandatory_fields ?? []).slice(0, 3).join(', ')}…). Cannot produce a full engineering report without a complete brief.`,
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
  // F-7 fix (4 seats): added failCount === 0 guard. PASS + blockers>0 is a
  // data inconsistency (gate says pass but blockers list is non-empty). Rather
  // than silently dropping blockers, we route to FEASIBILITY_EXCEPTION so the
  // inconsistency is surfaced to the user, not hidden.
  if (normStatus === 'PASS' && failCount === 0) {
    return {
      reportType: 'FULL_REPORT',
      maxPages: UNLIMITED_PAGES,
      reason: 'Feasibility gate passed all checks. Full report rendered.',
      excludedSections: [],
    }
  }

  // ── Rule 3b: PASS + blockers>0 — data inconsistency ─────────────────
  // F-7 fix: PASS status with non-zero blockers is a data inconsistency.
  // Route to FEASIBILITY_EXCEPTION so blockers are visible, not silently dropped.
  if (normStatus === 'PASS' && failCount > 0) {
    return {
      reportType: 'FEASIBILITY_EXCEPTION',
      maxPages: 12,
      reason: `Feasibility gate returned ${feasibilityResult.status} (PASS) but ${failCount} blocker(s) are present — data inconsistency. Routing to FEASIBILITY_EXCEPTION to surface blockers.`,
      excludedSections: FEASIBILITY_EXCEPTION_EXCLUDED,
    }
  }

  // ── Rule 4a: FULL_REPORT — WARN with zero fail checks ─────────────────
  if (normStatus === 'WARN' && failCount === 0) {
    const banners = (feasibilityResult.warnings ?? []).map(w => `Warning: ${w}`)
    return {
      reportType: 'FULL_REPORT',
      maxPages: UNLIMITED_PAGES,
      reason: `Feasibility gate returned ${feasibilityResult.status} with ${feasibilityResult.warnings?.length ?? 0} warnings and zero fail checks. Full report rendered with warning banners.`,
      excludedSections: [],
      warningBanners: banners,
    }
  }

  // ── Rule 4b: FULL_REPORT — WARN with exactly one fail check ──────────
  // F-5 fix (3 seats): this rule now only fires for WARN status. FAIL status
  // with exactly 1 blocker previously fell here (Rule 4b had no normStatus
  // guard), producing a FULL_REPORT for a FAIL/RED feasibility result.
  // FAIL + any blocker count → FEASIBILITY_EXCEPTION (handled below in Rule 5).
  if (normStatus === 'WARN' && failCount === 1) {
    const failCheck = feasibilityResult.blockers?.[0] ?? 'One feasibility check failed'
    return {
      reportType: 'FULL_REPORT',
      maxPages: UNLIMITED_PAGES,
      reason: `Feasibility gate returned ${feasibilityResult.status} (WARN) with exactly one fail check. Full report rendered with prominent warning callout.`,
      excludedSections: [],
      warningBanners: [failCheck],
    }
  }

  // ── Rule 4c: FEASIBILITY_EXCEPTION — WARN with ≥2 fail checks ────────
  // F-3 fix (4 seats): WARN + ≥2 blockers previously fell through to the
  // default route → FULL_REPORT with no banners. Per PA Stage 9 spec,
  // WARN with multiple blockers should not be treated as a clean pass.
  if (normStatus === 'WARN' && failCount >= 2) {
    return {
      reportType: 'FEASIBILITY_EXCEPTION',
      maxPages: 12,
      reason: `Feasibility gate returned ${feasibilityResult.status} (WARN) with ${failCount} fail checks. Multiple concurrent warnings require exception report.`,
      excludedSections: FEASIBILITY_EXCEPTION_EXCLUDED,
    }
  }

  // ── Rule 5: FEASIBILITY_EXCEPTION — FAIL with any blocker count ───────
  // F-4 fix (3 seats): FAIL + 0 blockers previously fell to the default → FULL_REPORT.
  // F-5 fix: FAIL + 1 blocker previously fell to Rule 4b → FULL_REPORT.
  // Both are now caught here. FAIL status NEVER produces an uncapped full report.
  if (normStatus === 'FAIL') {
    return {
      reportType: 'FEASIBILITY_EXCEPTION',
      maxPages: 12,
      reason: `Feasibility gate returned ${feasibilityResult.status} (FAIL) with ${failCount} fail check(s). FAIL status always routes to FEASIBILITY_EXCEPTION regardless of blocker count.`,
      excludedSections: FEASIBILITY_EXCEPTION_EXCLUDED,
    }
  }

  // ── Default: FEASIBILITY_EXCEPTION (fail-closed) ─────────────────────
  // F-1 / F-3 / F-4 fix: the default is now FEASIBILITY_EXCEPTION, not FULL_REPORT.
  // Any status combination that reaches here is unexpected. Fail closed so the
  // inconsistency is visible rather than silently producing an uncapped report.
  return {
    reportType: 'FEASIBILITY_EXCEPTION',
    maxPages: 12,
    reason: `Unexpected route: status=${feasibilityResult.status} (normalised=${normStatus}), failCount=${failCount}. Defaulting to FEASIBILITY_EXCEPTION (fail-closed).`,
    excludedSections: FEASIBILITY_EXCEPTION_EXCLUDED,
  }
}
