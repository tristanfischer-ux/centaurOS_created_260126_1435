/**
 * @file report-type-router.test.ts — Phase F verification
 *
 * Tests for routeReportType() (PA Stage 9).
 *
 * Verification criteria from Phase F spec:
 *   ✅ BESS brief (one FAIL: cost) routes to FULL_REPORT with warning banner
 *   ✅ Brief with 2+ FAIL checks routes to FEASIBILITY_EXCEPTION with max 12 pages
 *   ✅ Brief with confidence=LOW and >5 missing fields routes to BRIEF_INCOMPLETE
 *   ✅ PASS feasibility routes to FULL_REPORT with no cap
 *   ✅ WARN feasibility, 0 FAIL routes to FULL_REPORT with banners
 *   ✅ excludedSections populated correctly per report type
 */

import { routeReportType } from './report-type-router'
import type { ReportTypeRouterResult } from './report-type-router'
import type { FeasibilityResult } from './feasibility-gate'
import type { StructuredBriefJSON } from './types'

// ── Helpers / fixtures ────────────────────────────────────────────────────

function makeFeasibility(overrides: Partial<FeasibilityResult>): FeasibilityResult {
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
    project_id: 'bess_001',
    product_description: 'BESS',
    mission_statement: 'Build a grid-scale BESS',
    target_customers: 'UK grid operators',
    why_now: 'LFP costs have fallen',
    constraints: {
      unit_cost_ceiling: { value: 180000, currency: 'GBP', source: 'user' },
      max_mass_kg: { value: 28000, source: 'user' },
      max_dimensions_mm: { w: 12192, d: 2438, h: 2896, source: 'user' },
      target_performance: { key_metric: 'energy', value: 3.5, unit: 'MWh', source: 'user' },
      target_process: { value: null, source: 'inferred' },
      target_material: { value: 'LFP', source: 'user' },
      batch_size: { value: 25, source: 'user' },
      design_life: { value: '15 years', source: 'user' },
      operating_environment: { temp_min_c: -20, temp_max_c: 50, source: 'user' },
      safety_standards: [],
      additional_constraints: [],
    },
    missing_mandatory_fields: [],
    confidence: 'HIGH',
    ...overrides,
  }
}

// ── Unit tests — routeReportType() ────────────────────────────────────────

describe('routeReportType — PA Stage 9', () => {

  // ── Rule 1: PASS feasibility → FULL_REPORT ────────────────────────────

  describe('PASS feasibility', () => {
    it('routes to FULL_REPORT with no page cap', () => {
      const feasibility = makeFeasibility({ status: 'GREEN', blockers: [] })
      const result = routeReportType(feasibility)
      expect(result.reportType).toBe('FULL_REPORT')
      expect(result.maxPages).toBe(0)
    })

    it('routes to FULL_REPORT with no excluded sections', () => {
      const feasibility = makeFeasibility({ status: 'GREEN', blockers: [] })
      const result = routeReportType(feasibility)
      expect(result.excludedSections).toHaveLength(0)
    })

    it('routes to FULL_REPORT when PA PASS status used', () => {
      const feasibility = makeFeasibility({ status: 'PASS' as any, blockers: [] })
      const result = routeReportType(feasibility)
      expect(result.reportType).toBe('FULL_REPORT')
    })
  })

  // ── Rule 2: BESS brief — one FAIL check → FULL_REPORT with warning ────

  describe('BESS brief — exactly one FAIL check (cost)', () => {
    it('routes to FULL_REPORT (not FEASIBILITY_EXCEPTION) with exactly one blocker', () => {
      // BESS brief: cost exceeds ceiling — 1 FAIL check only
      const feasibility = makeFeasibility({
        status: 'RED',
        blockers: ['Cost estimate (£220,000) exceeds ceiling (£180,000)'],
        warnings: [],
      })
      const parsedBrief = makeParsedBrief()
      const result = routeReportType(feasibility, parsedBrief)
      expect(result.reportType).toBe('FULL_REPORT')
    })

    it('populates warningBanners with the single fail check description', () => {
      const failCheck = 'Cost estimate (£220,000) exceeds ceiling (£180,000)'
      const feasibility = makeFeasibility({
        status: 'RED',
        blockers: [failCheck],
        warnings: [],
      })
      const result = routeReportType(feasibility, makeParsedBrief())
      expect(result.warningBanners).toBeDefined()
      expect(result.warningBanners).toContain(failCheck)
    })

    it('sets maxPages to 0 (no cap) on single-FAIL FULL_REPORT', () => {
      const feasibility = makeFeasibility({
        status: 'RED',
        blockers: ['single failure'],
      })
      const result = routeReportType(feasibility, makeParsedBrief())
      expect(result.maxPages).toBe(0)
    })
  })

  // ── Rule 3: 2+ FAIL checks → FEASIBILITY_EXCEPTION ────────────────────

  describe('2+ FAIL checks → FEASIBILITY_EXCEPTION', () => {
    it('routes to FEASIBILITY_EXCEPTION when blockers.length > 1', () => {
      const feasibility = makeFeasibility({
        status: 'RED',
        blockers: [
          'Cost estimate exceeds ceiling by 2×',
          'Sizing returned INFEASIBLE — modules do not fit',
        ],
      })
      const result = routeReportType(feasibility)
      expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
    })

    it('sets maxPages to 12 on FEASIBILITY_EXCEPTION', () => {
      const feasibility = makeFeasibility({
        status: 'RED',
        blockers: ['Cost check failed', 'Safety check failed'],
      })
      const result = routeReportType(feasibility)
      expect(result.maxPages).toBe(12)
    })

    it('routes to FEASIBILITY_EXCEPTION with 3 blockers', () => {
      const feasibility = makeFeasibility({
        status: 'RED',
        blockers: ['Blocker A', 'Blocker B', 'Blocker C'],
      })
      const result = routeReportType(feasibility)
      expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
    })
  })

  // ── Rule 4: BRIEF_INCOMPLETE → confidence=LOW and >5 missing ─────────

  describe('BRIEF_INCOMPLETE — confidence=LOW and >5 missing mandatory fields', () => {
    it('routes to BRIEF_INCOMPLETE when confidence=LOW and 7 fields missing', () => {
      const parsedBrief = makeParsedBrief({
        confidence: 'LOW',
        missing_mandatory_fields: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'],
      })
      const feasibility = makeFeasibility({ status: 'GREEN' })
      const result = routeReportType(feasibility, parsedBrief)
      expect(result.reportType).toBe('BRIEF_INCOMPLETE')
    })

    it('sets maxPages to 6 on BRIEF_INCOMPLETE', () => {
      const parsedBrief = makeParsedBrief({
        confidence: 'LOW',
        missing_mandatory_fields: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
      })
      const feasibility = makeFeasibility({ status: 'GREEN' })
      const result = routeReportType(feasibility, parsedBrief)
      expect(result.maxPages).toBe(6)
    })

    it('does NOT route to BRIEF_INCOMPLETE when confidence=LOW but only 5 missing fields', () => {
      const parsedBrief = makeParsedBrief({
        confidence: 'LOW',
        missing_mandatory_fields: ['f1', 'f2', 'f3', 'f4', 'f5'],  // exactly 5, not >5
      })
      const feasibility = makeFeasibility({ status: 'GREEN' })
      const result = routeReportType(feasibility, parsedBrief)
      expect(result.reportType).not.toBe('BRIEF_INCOMPLETE')
    })

    it('does NOT route to BRIEF_INCOMPLETE when confidence=HIGH even with many missing fields', () => {
      const parsedBrief = makeParsedBrief({
        confidence: 'HIGH',
        missing_mandatory_fields: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'],
      })
      const feasibility = makeFeasibility({ status: 'GREEN' })
      const result = routeReportType(feasibility, parsedBrief)
      expect(result.reportType).not.toBe('BRIEF_INCOMPLETE')
    })

    it('does NOT route to BRIEF_INCOMPLETE when parsedBrief is absent', () => {
      const feasibility = makeFeasibility({ status: 'GREEN' })
      const result = routeReportType(feasibility, undefined)
      expect(result.reportType).toBe('FULL_REPORT')
    })
  })

  // ── Rule 5: WARN with 0 FAIL → FULL_REPORT with banners ──────────────

  describe('WARN feasibility with 0 fail checks → FULL_REPORT with banners', () => {
    it('routes to FULL_REPORT', () => {
      const feasibility = makeFeasibility({
        status: 'AMBER',
        blockers: [],
        warnings: ['Cost is 1.2× ceiling — proceed with caution'],
      })
      const result = routeReportType(feasibility)
      expect(result.reportType).toBe('FULL_REPORT')
    })

    it('populates warningBanners from warnings[]', () => {
      const feasibility = makeFeasibility({
        status: 'AMBER',
        blockers: [],
        warnings: ['Cost margin is tight', 'Lead time exceeds design life'],
      })
      const result = routeReportType(feasibility)
      expect(result.warningBanners).toBeDefined()
      expect(result.warningBanners?.length).toBeGreaterThan(0)
    })

    it('sets maxPages to 0 (no cap) on WARN FULL_REPORT', () => {
      const feasibility = makeFeasibility({
        status: 'AMBER',
        blockers: [],
        warnings: ['Some warning'],
      })
      const result = routeReportType(feasibility)
      expect(result.maxPages).toBe(0)
    })

    it('routes to FULL_REPORT using PA WARN status', () => {
      const feasibility = makeFeasibility({
        status: 'WARN' as any,
        blockers: [],
        warnings: ['Warning A'],
      })
      const result = routeReportType(feasibility)
      expect(result.reportType).toBe('FULL_REPORT')
    })
  })

  // ── excludedSections correctness ─────────────────────────────────────

  describe('excludedSections populated correctly per report type', () => {
    it('BRIEF_INCOMPLETE excludes all non-cover/brief sections', () => {
      const parsedBrief = makeParsedBrief({
        confidence: 'LOW',
        missing_mandatory_fields: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
      })
      const feasibility = makeFeasibility({ status: 'GREEN' })
      const result = routeReportType(feasibility, parsedBrief)
      expect(result.excludedSections).toContain('feasibility')
      expect(result.excludedSections).toContain('regulatory')
      expect(result.excludedSections).toContain('sizing')
      expect(result.excludedSections).toContain('modules')
      expect(result.excludedSections).toContain('bom')
      expect(result.excludedSections).toContain('cost')
      expect(result.excludedSections).toContain('suppliers')
      expect(result.excludedSections).toContain('risks')
      expect(result.excludedSections).toContain('research')
      expect(result.excludedSections).toContain('audit_log')
    })

    it('FEASIBILITY_EXCEPTION excludes modules, bom, suppliers, risks, research', () => {
      const feasibility = makeFeasibility({
        status: 'RED',
        blockers: ['Cost check failed', 'Sizing infeasible'],
      })
      const result = routeReportType(feasibility)
      expect(result.excludedSections).toContain('modules')
      expect(result.excludedSections).toContain('bom')
      expect(result.excludedSections).toContain('suppliers')
      expect(result.excludedSections).toContain('risks')
      expect(result.excludedSections).toContain('research')
    })

    it('FULL_REPORT excludes nothing', () => {
      const feasibility = makeFeasibility({ status: 'GREEN', blockers: [] })
      const result = routeReportType(feasibility)
      expect(result.excludedSections).toHaveLength(0)
    })
  })

})
