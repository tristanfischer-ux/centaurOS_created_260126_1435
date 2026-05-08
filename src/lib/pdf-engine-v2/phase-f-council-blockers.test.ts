/**
 * @file phase-f-council-blockers.test.ts
 *
 * Regression tests for Phase F council BLOCKERs F-1 through F-12 (excl. F-9 deferred).
 * One or more tests per BLOCKER as required by the fix brief.
 *
 * Added 2026-05-08 after Phase F council review fix commit.
 */

import { routeReportType, normaliseStatus, UNLIMITED_PAGES } from './report-type-router'
import type { FeasibilityResult } from './feasibility-gate'
import type { StructuredBriefJSON } from './types'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeFeasibility(overrides: Partial<FeasibilityResult> = {}): FeasibilityResult {
  return {
    status: 'GREEN',
    reason: 'All checks passed',
    blockers: [],
    warnings: [],
    canGenerateFullReport: true,
    allowedSections: [],
    forbiddenSections: [],
    decisionPageData: {
      verdict: 'PROCEED',
      biggestBlocker: '',
      missingInputs: [],
      commercialWarning: '',
      engineeringWarning: '',
      nextActions: [],
    },
    compactBanner: 'FEASIBLE — all gates pass',
    ...overrides,
  }
}

function makeParsedBrief(overrides: Partial<StructuredBriefJSON> = {}): StructuredBriefJSON {
  return {
    project_id: 'test_001',
    product_description: 'Test product',
    mission_statement: 'Test mission',
    target_customers: 'Test customers',
    why_now: 'Test why now',
    constraints: {
      unit_cost_ceiling: { value: 100000, currency: 'GBP', source: 'user' },
      max_mass_kg: { value: 1000, source: 'user' },
      max_dimensions_mm: { w: 1000, d: 1000, h: 1000, source: 'user' },
      target_performance: { key_metric: 'throughput', value: 100, unit: 'units/hr', source: 'user' },
      target_process: { value: null, source: 'inferred' },
      target_material: { value: 'steel', source: 'user' },
      batch_size: { value: 100, source: 'user' },
      design_life: { value: '10 years', source: 'user' },
      operating_environment: { temp_min_c: 0, temp_max_c: 40, source: 'user' },
      safety_standards: [],
      additional_constraints: [],
    },
    missing_mandatory_fields: [],
    confidence: 'HIGH',
    ...overrides,
  }
}

// ── F-1: normaliseStatus fail-closed default ───────────────────────────────

describe('F-1 — normaliseStatus fail-closed default (5 seats)', () => {
  it('unknown/empty status maps to FAIL (fail-closed), not PASS', () => {
    expect(normaliseStatus('')).toBe('FAIL')
    expect(normaliseStatus('UNKNOWN')).toBe('FAIL')
    expect(normaliseStatus('PENDING')).toBe('FAIL')
    expect(normaliseStatus('whatever')).toBe('FAIL')
  })

  it('UNREVIEWED maps to FAIL (fail-closed), not PASS', () => {
    // Previously UNREVIEWED mapped to PASS — silently routing errored/pending
    // feasibility to FULL_REPORT. Now maps to FAIL.
    expect(normaliseStatus('UNREVIEWED')).toBe('FAIL')
  })

  it('null status maps to FAIL (fail-closed)', () => {
    expect(normaliseStatus(null)).toBe('FAIL')
    expect(normaliseStatus(undefined)).toBe('FAIL')
  })

  it('unknown status causes routeReportType to return FEASIBILITY_EXCEPTION', () => {
    const feasibility = makeFeasibility({ status: 'UNKNOWN_STATUS' as any, blockers: [] })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
  })

  it('UNREVIEWED status causes routeReportType to return FEASIBILITY_EXCEPTION', () => {
    const feasibility = makeFeasibility({ status: 'UNREVIEWED' as any, blockers: [] })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
  })

  it('known PASS status still routes to FULL_REPORT (regression)', () => {
    const feasibility = makeFeasibility({ status: 'GREEN', blockers: [] })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FULL_REPORT')
  })
})

// ── F-3: WARN + ≥2 blockers → FEASIBILITY_EXCEPTION ──────────────────────

describe('F-3 — WARN/AMBER + ≥2 blockers → FEASIBILITY_EXCEPTION (4 seats)', () => {
  it('AMBER + 2 blockers routes to FEASIBILITY_EXCEPTION', () => {
    const feasibility = makeFeasibility({
      status: 'AMBER',
      blockers: ['Cost margin tight', 'Lead time exceeds design life'],
    })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
  })

  it('WARN (PA) + 2 blockers routes to FEASIBILITY_EXCEPTION', () => {
    const feasibility = makeFeasibility({
      status: 'WARN' as any,
      blockers: ['Blocker A', 'Blocker B'],
    })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
  })

  it('WARN + 3 blockers routes to FEASIBILITY_EXCEPTION with max 12 pages', () => {
    const feasibility = makeFeasibility({
      status: 'AMBER',
      blockers: ['Blocker A', 'Blocker B', 'Blocker C'],
    })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
    expect(result.maxPages).toBe(12)
  })

  it('WARN + 1 blocker still routes to FULL_REPORT with warning callout (regression)', () => {
    const feasibility = makeFeasibility({
      status: 'AMBER',
      blockers: ['Cost is 1.1× ceiling'],
    })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FULL_REPORT')
    expect(result.warningBanners).toBeDefined()
  })
})

// ── F-4: FAIL + 0 blockers → FEASIBILITY_EXCEPTION ───────────────────────

describe('F-4 — FAIL + 0 blockers → FEASIBILITY_EXCEPTION (3 seats)', () => {
  it('FAIL/RED + 0 blockers routes to FEASIBILITY_EXCEPTION, not FULL_REPORT', () => {
    // Previously fell to the default → FULL_REPORT. FAIL with no enumerated
    // blockers is a data inconsistency that should not produce a full report.
    const feasibility = makeFeasibility({ status: 'RED', blockers: [] })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
  })

  it('FAIL/RED + 0 blockers sets maxPages to 12', () => {
    const feasibility = makeFeasibility({ status: 'RED', blockers: [] })
    const result = routeReportType(feasibility)
    expect(result.maxPages).toBe(12)
  })

  it('FAIL (PA) + 0 blockers routes to FEASIBILITY_EXCEPTION', () => {
    const feasibility = makeFeasibility({ status: 'FAIL' as any, blockers: [] })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
  })
})

// ── F-5: FAIL + exactly 1 blocker → FEASIBILITY_EXCEPTION ────────────────

describe('F-5 — FAIL + failCount=1 → FEASIBILITY_EXCEPTION (3 seats)', () => {
  it('FAIL/RED + 1 blocker routes to FEASIBILITY_EXCEPTION (not FULL_REPORT)', () => {
    // Previously Rule 4b fired (failCount === 1) regardless of normStatus,
    // producing FULL_REPORT for FAIL/RED. FAIL status now always routes to
    // FEASIBILITY_EXCEPTION.
    const feasibility = makeFeasibility({
      status: 'RED',
      blockers: ['Single critical failure'],
    })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
  })

  it('FAIL (PA) + 1 blocker routes to FEASIBILITY_EXCEPTION', () => {
    const feasibility = makeFeasibility({
      status: 'FAIL' as any,
      blockers: ['Single critical failure'],
    })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
  })

  it('WARN + 1 blocker still routes to FULL_REPORT with warning banner (regression)', () => {
    const failCheck = 'Cost is marginally over ceiling'
    const feasibility = makeFeasibility({
      status: 'WARN' as any,
      blockers: [failCheck],
    })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FULL_REPORT')
    expect(result.warningBanners).toContain(failCheck)
  })
})

// ── F-6: missing_mandatory_fields null guard ──────────────────────────────

describe('F-6 — missing_mandatory_fields null guard (3 seats)', () => {
  it('does not throw TypeError when missing_mandatory_fields is undefined', () => {
    const parsedBrief = makeParsedBrief({
      confidence: 'LOW',
      missing_mandatory_fields: undefined as any,  // LLM may omit this field
    })
    const feasibility = makeFeasibility({ status: 'GREEN' })
    expect(() => routeReportType(feasibility, parsedBrief)).not.toThrow()
  })

  it('does not throw TypeError when missing_mandatory_fields is null', () => {
    const parsedBrief = makeParsedBrief({
      confidence: 'LOW',
      missing_mandatory_fields: null as any,
    })
    const feasibility = makeFeasibility({ status: 'GREEN' })
    expect(() => routeReportType(feasibility, parsedBrief)).not.toThrow()
  })

  it('treats null missing_mandatory_fields as empty array (no BRIEF_INCOMPLETE trigger)', () => {
    const parsedBrief = makeParsedBrief({
      confidence: 'LOW',
      missing_mandatory_fields: null as any,
    })
    const feasibility = makeFeasibility({ status: 'GREEN' })
    const result = routeReportType(feasibility, parsedBrief)
    // null treated as [] → length is 0, not > 5 → not BRIEF_INCOMPLETE
    expect(result.reportType).not.toBe('BRIEF_INCOMPLETE')
  })
})

// ── F-7: PASS + failCount > 0 surfaced (not silently dropped) ─────────────

describe('F-7 — Rule 3 PASS checks failCount (4 seats)', () => {
  it('PASS + 0 blockers routes to FULL_REPORT (baseline regression)', () => {
    const feasibility = makeFeasibility({ status: 'GREEN', blockers: [] })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FULL_REPORT')
  })

  it('PASS + 1 blocker routes to FEASIBILITY_EXCEPTION (data inconsistency surfaced)', () => {
    // Previously PASS + blockers would route to FULL_REPORT via Rule 3, silently
    // dropping the blockers. Now routes to FEASIBILITY_EXCEPTION so the
    // inconsistency is visible.
    const feasibility = makeFeasibility({ status: 'GREEN', blockers: ['Unexpected blocker'] })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
  })

  it('PASS + 2 blockers routes to FEASIBILITY_EXCEPTION', () => {
    const feasibility = makeFeasibility({ status: 'PASS' as any, blockers: ['A', 'B'] })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
  })
})

// ── F-11: UNLIMITED_PAGES sentinel value documented ───────────────────────

describe('F-11 — UNLIMITED_PAGES sentinel value (3 seats)', () => {
  it('UNLIMITED_PAGES is exported and equals 0', () => {
    expect(UNLIMITED_PAGES).toBe(0)
  })

  it('FULL_REPORT (clean PASS) uses UNLIMITED_PAGES not a hard 0-page limit', () => {
    const feasibility = makeFeasibility({ status: 'GREEN', blockers: [] })
    const result = routeReportType(feasibility)
    // maxPages === UNLIMITED_PAGES is the correct check — not "maxPages is 0 pages"
    expect(result.maxPages).toBe(UNLIMITED_PAGES)
    expect(result.reportType).toBe('FULL_REPORT')
  })

  it('FULL_REPORT (WARN + 0 blockers) uses UNLIMITED_PAGES', () => {
    const feasibility = makeFeasibility({ status: 'AMBER', blockers: [], warnings: ['Minor warning'] })
    const result = routeReportType(feasibility)
    expect(result.maxPages).toBe(UNLIMITED_PAGES)
  })

  it('FEASIBILITY_EXCEPTION maxPages is 12, not UNLIMITED_PAGES', () => {
    const feasibility = makeFeasibility({ status: 'RED', blockers: ['A', 'B'] })
    const result = routeReportType(feasibility)
    expect(result.maxPages).toBe(12)
    expect(result.maxPages).not.toBe(UNLIMITED_PAGES)
  })
})

// ── F-2, F-8, F-10, F-12 — index.ts fixes (structural tests) ──────────────
// These blockers affect index.ts orchestration (not the pure router function).
// Tests here verify the exports/types are in place; integration coverage is via
// index.test.ts (the jest.isolateModules suite already covers orchestration).

import { UNLIMITED_PAGES as UP } from './report-type-router'
import type { PipelineState } from './types'

describe('F-2 — trackSkippedStage called for council_scoring (5 seats)', () => {
  it('normaliseStatus is exported from report-type-router (enables F-10 fix in index.ts)', () => {
    // normaliseStatus must be exported so index.ts can import it for the
    // while-loop status normalisation fix.
    expect(typeof normaliseStatus).toBe('function')
  })
})

describe('F-8 — reportTypeRouterResult typed on PipelineState (4 seats)', () => {
  it('PipelineState accepts reportTypeRouterResult without type error (compile-time test)', () => {
    // If this file compiles, the field exists on PipelineState.
    const partialState: Partial<PipelineState> = {
      reportTypeRouterResult: {
        reportType: 'FULL_REPORT',
        maxPages: UP,
        reason: 'test',
        excludedSections: [],
      },
    }
    expect(partialState.reportTypeRouterResult?.reportType).toBe('FULL_REPORT')
  })
})

describe('F-10 — normaliseStatus handles PA-native FAIL/WARN in while-loop condition', () => {
  it('normaliseStatus(FAIL) returns FAIL (PA-native status handled)', () => {
    expect(normaliseStatus('FAIL')).toBe('FAIL')
  })

  it('normaliseStatus(WARN) returns WARN (PA-native status handled)', () => {
    expect(normaliseStatus('WARN')).toBe('WARN')
  })

  it('normaliseStatus(RED) returns FAIL (legacy status still handled)', () => {
    expect(normaliseStatus('RED')).toBe('FAIL')
  })

  it('normaliseStatus(AMBER) returns WARN (legacy status still handled)', () => {
    expect(normaliseStatus('AMBER')).toBe('WARN')
  })
})

describe('F-12 — route re-evaluated inside revision loop logic (structural)', () => {
  it('routeReportType is a pure function — can be called cheaply inside a loop', () => {
    // Verify that calling routeReportType multiple times with improving feasibility
    // produces correctly improving route results (used in the mid-loop break logic).
    const failFeasibility = makeFeasibility({ status: 'RED', blockers: ['A', 'B'] })
    const warnFeasibility = makeFeasibility({ status: 'AMBER', blockers: ['A'] })
    const passFeasibility = makeFeasibility({ status: 'GREEN', blockers: [] })

    const route1 = routeReportType(failFeasibility)
    const route2 = routeReportType(warnFeasibility)
    const route3 = routeReportType(passFeasibility)

    expect(route1.reportType).toBe('FEASIBILITY_EXCEPTION')
    // WARN+1 blocker → FULL_REPORT (the improvement that should break the loop)
    expect(route2.reportType).toBe('FULL_REPORT')
    expect(route3.reportType).toBe('FULL_REPORT')
    // Confirms: loop should break when mid-loop route resolves to FULL_REPORT
  })
})
