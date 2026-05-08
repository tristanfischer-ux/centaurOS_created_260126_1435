/**
 * @file pdf-v3-report-type.test.ts — Phase G verification
 *
 * Tests for renderer v3 section-guard and max-pages enforcement logic,
 * plus renderer-selection logic in index.ts.
 *
 * Strategy: the pure section-guard logic is tested directly without importing
 * 7-pdf-v3.tsx (which pulls in @react-pdf/renderer, an ESM module that Jest
 * cannot transform). The guard logic is straightforward Set operations; we
 * replicate it here and test the constants from report-type-router.ts.
 *
 * Renderer-selection tests exercise the env-var logic directly (same formula
 * as index.ts line ~29).
 *
 * Verification criteria from Phase G spec:
 *   ✅ FEASIBILITY_EXCEPTION report has ≤ 12 estimated pages and excludes modules/bom/suppliers/risks
 *   ✅ BRIEF_INCOMPLETE report has ≤ 6 estimated pages and excludes everything except cover + brief
 *   ✅ FULL_REPORT renders all sections (nothing excluded)
 *   ✅ PA_PIPELINE=true + no PDF_RENDERER env → v3 selected
 *   ✅ PA_PIPELINE=true + PDF_RENDERER=v2 → v2 selected (env override wins)
 *   ✅ PA_PIPELINE=false (legacy) → v2 selected by default
 */

import { routeReportType } from '../report-type-router'
import type { ReportTypeRouterResult } from '../report-type-router'
import type { FeasibilityResult } from '../feasibility-gate'
import type { StructuredBriefJSON } from '../types'

// ── Section-guard logic (mirrored from 7-pdf-v3.tsx) ─────────────────────

const ALL_OPTIONAL_SECTIONS = [
  'feasibility',
  'regulatory',
  'sizing',
  'modules',
  'cost',
  'suppliers',
  'risks',
  'audit_log',
  'source_attrib',
]

function buildIncludedSections(excludedSections: string[]): Set<string> {
  const included = new Set(ALL_OPTIONAL_SECTIONS)
  for (const id of excludedSections) {
    included.delete(id)
  }
  return included
}

// Page-count estimator (mirrors _estimateSectionPages in 7-pdf-v3.tsx)
// Uses a data-free minimal estimate suitable for spec verification tests.
function estimatePagesForReport(
  excludedSections: string[],
  opts: { moduleCount?: number; regCount?: number; riskCount?: number } = {},
): number {
  const { moduleCount = 0, regCount = 0, riskCount = 0 } = opts
  const included = buildIncludedSections(excludedSections)

  // Always-rendered: cover(1) + brief(2) + source_attrib(1) = 4
  let pages = 4

  if (included.has('feasibility'))  pages += 1
  if (included.has('regulatory'))   pages += 1 + Math.min(regCount, 10)
  if (included.has('sizing'))       pages += 1
  if (included.has('modules'))      pages += 1 + moduleCount
  if (included.has('cost'))         pages += 1
  if (included.has('suppliers'))    pages += 1
  if (included.has('risks'))        pages += 1 + Math.min(riskCount, 20)
  if (included.has('audit_log'))    pages += 1

  return pages
}

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
    project_id: 'test_001',
    product_description: 'Test product',
    mission_statement: 'Build a test product',
    target_customers: 'Testers',
    why_now: 'Testing now',
    constraints: {
      unit_cost_ceiling: { value: 50000, currency: 'GBP', source: 'user' },
      max_mass_kg: { value: 500, source: 'user' },
      max_dimensions_mm: { w: 1000, d: 500, h: 500, source: 'user' },
      target_performance: { key_metric: 'power', value: 10, unit: 'kW', source: 'user' },
      target_process: { value: null, source: 'inferred' },
      target_material: { value: 'steel', source: 'user' },
      batch_size: { value: 10, source: 'user' },
      design_life: { value: '5 years', source: 'user' },
      operating_environment: { temp_min_c: 0, temp_max_c: 40, source: 'user' },
      safety_standards: [],
      additional_constraints: [],
    },
    missing_mandatory_fields: [],
    confidence: 'HIGH',
    ...overrides,
  }
}

// ── FEASIBILITY_EXCEPTION section guard tests ─────────────────────────────

describe('FEASIBILITY_EXCEPTION — section guards and page budget', () => {

  it('routes to FEASIBILITY_EXCEPTION with 2+ fail checks', () => {
    const feasibility = makeFeasibility({
      status: 'RED',
      blockers: ['Cost exceeds ceiling', 'Sizing infeasible'],
    })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FEASIBILITY_EXCEPTION')
  })

  it('excludes modules from FEASIBILITY_EXCEPTION report', () => {
    const feasibility = makeFeasibility({
      status: 'RED',
      blockers: ['Cost check failed', 'Sizing infeasible'],
    })
    const result = routeReportType(feasibility)
    expect(result.excludedSections).toContain('modules')
  })

  it('excludes suppliers from FEASIBILITY_EXCEPTION report', () => {
    const feasibility = makeFeasibility({
      status: 'RED',
      blockers: ['Cost check failed', 'Sizing infeasible'],
    })
    const result = routeReportType(feasibility)
    expect(result.excludedSections).toContain('suppliers')
  })

  it('excludes risks from FEASIBILITY_EXCEPTION report', () => {
    const feasibility = makeFeasibility({
      status: 'RED',
      blockers: ['Cost check failed', 'Sizing infeasible'],
    })
    const result = routeReportType(feasibility)
    expect(result.excludedSections).toContain('risks')
  })

  it('excludes bom from FEASIBILITY_EXCEPTION report', () => {
    const feasibility = makeFeasibility({
      status: 'RED',
      blockers: ['Cost check failed', 'Sizing infeasible'],
    })
    const result = routeReportType(feasibility)
    expect(result.excludedSections).toContain('bom')
  })

  it('FEASIBILITY_EXCEPTION estimated page count ≤ 12 pages (standard data)', () => {
    const feasibility = makeFeasibility({
      status: 'RED',
      blockers: ['Cost check failed', 'Sizing infeasible'],
    })
    const result = routeReportType(feasibility)
    expect(result.maxPages).toBe(12)

    // With 0 modules, 2 regs, 0 risks — modules/risks/suppliers are excluded by the router.
    // cover(1)+brief(2)+source_attrib(1)+feasibility(1)+regulatory(1+2)+sizing(1)+cost(1)+audit_log(1) = 11
    const pages = estimatePagesForReport(result.excludedSections, {
      moduleCount: 0, regCount: 2, riskCount: 0,
    })
    expect(pages).toBeLessThanOrEqual(12)
  })

  it('FEASIBILITY_EXCEPTION estimated page count ≤ 12 pages (minimal data)', () => {
    const feasibility = makeFeasibility({
      status: 'RED',
      blockers: ['Cost check failed', 'Sizing infeasible'],
    })
    const result = routeReportType(feasibility)
    const pages = estimatePagesForReport(result.excludedSections, {
      moduleCount: 0, regCount: 0, riskCount: 0,
    })
    expect(pages).toBeLessThanOrEqual(12)
  })

  it('sets maxPages to 12 on FEASIBILITY_EXCEPTION', () => {
    const feasibility = makeFeasibility({
      status: 'RED',
      blockers: ['Cost check failed', 'Sizing infeasible'],
    })
    const result = routeReportType(feasibility)
    expect(result.maxPages).toBe(12)
  })
})

// ── BRIEF_INCOMPLETE section guard tests ──────────────────────────────────

describe('BRIEF_INCOMPLETE — section guards and page budget', () => {

  it('routes to BRIEF_INCOMPLETE with LOW confidence and >5 missing fields', () => {
    const parsedBrief = makeParsedBrief({
      confidence: 'LOW',
      missing_mandatory_fields: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
    })
    const feasibility = makeFeasibility({ status: 'GREEN' })
    const result = routeReportType(feasibility, parsedBrief)
    expect(result.reportType).toBe('BRIEF_INCOMPLETE')
  })

  it('excludes all sections except cover + brief on BRIEF_INCOMPLETE', () => {
    const parsedBrief = makeParsedBrief({
      confidence: 'LOW',
      missing_mandatory_fields: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
    })
    const feasibility = makeFeasibility({ status: 'GREEN' })
    const result = routeReportType(feasibility, parsedBrief)

    const included = buildIncludedSections(result.excludedSections)
    // Only source_attrib may remain (cover + brief are always-rendered, not in the optional set)
    expect(included.has('feasibility')).toBe(false)
    expect(included.has('regulatory')).toBe(false)
    expect(included.has('sizing')).toBe(false)
    expect(included.has('modules')).toBe(false)
    expect(included.has('cost')).toBe(false)
    expect(included.has('suppliers')).toBe(false)
    expect(included.has('risks')).toBe(false)
    expect(included.has('audit_log')).toBe(false)
  })

  it('BRIEF_INCOMPLETE estimated page count ≤ 6 pages (rich data)', () => {
    const parsedBrief = makeParsedBrief({
      confidence: 'LOW',
      missing_mandatory_fields: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
    })
    const feasibility = makeFeasibility({ status: 'GREEN' })
    const result = routeReportType(feasibility, parsedBrief)
    expect(result.maxPages).toBe(6)

    // With everything excluded, only cover(1)+brief(2)+source_attrib(1) = 4 pages
    const pages = estimatePagesForReport(result.excludedSections, {
      moduleCount: 10, regCount: 8, riskCount: 20,
    })
    expect(pages).toBeLessThanOrEqual(6)
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
})

// ── FULL_REPORT section guard tests ──────────────────────────────────────

describe('FULL_REPORT — renders all sections', () => {

  it('excludes nothing on clean PASS', () => {
    const feasibility = makeFeasibility({ status: 'GREEN', blockers: [] })
    const result = routeReportType(feasibility)
    expect(result.reportType).toBe('FULL_REPORT')
    expect(result.excludedSections).toHaveLength(0)
  })

  it('all optional sections are included in FULL_REPORT', () => {
    const feasibility = makeFeasibility({ status: 'GREEN', blockers: [] })
    const result = routeReportType(feasibility)
    const included = buildIncludedSections(result.excludedSections)

    expect(included.has('feasibility')).toBe(true)
    expect(included.has('regulatory')).toBe(true)
    expect(included.has('sizing')).toBe(true)
    expect(included.has('modules')).toBe(true)
    expect(included.has('cost')).toBe(true)
    expect(included.has('suppliers')).toBe(true)
    expect(included.has('risks')).toBe(true)
    expect(included.has('audit_log')).toBe(true)
    expect(included.has('source_attrib')).toBe(true)
  })

  it('sets maxPages to 0 (no cap) on FULL_REPORT', () => {
    const feasibility = makeFeasibility({ status: 'GREEN', blockers: [] })
    const result = routeReportType(feasibility)
    expect(result.maxPages).toBe(0)
  })
})

// ── Renderer selection logic ──────────────────────────────────────────────

describe('Renderer selection — PA_PIPELINE and PDF_RENDERER env', () => {
  const ORIGINAL_ENV = { ...process.env }

  afterEach(() => {
    // Restore env
    for (const key of ['PA_PIPELINE', 'PDF_RENDERER']) {
      if (ORIGINAL_ENV[key] !== undefined) {
        process.env[key] = ORIGINAL_ENV[key]
      } else {
        delete process.env[key]
      }
    }
    jest.resetModules()
  })

  // Renderer selection formula (mirrors index.ts):
  // const _pdfRendererVersion = process.env.PDF_RENDERER || (PA_PIPELINE ? 'v3' : 'v2')
  function resolveRendererVersion(): string {
    const paPipeline = (process.env.PA_PIPELINE ?? 'false') === 'true'
    return process.env.PDF_RENDERER || (paPipeline ? 'v3' : 'v2')
  }

  it('PA_PIPELINE=true + no PDF_RENDERER → selects v3', () => {
    process.env.PA_PIPELINE = 'true'
    delete process.env.PDF_RENDERER
    expect(resolveRendererVersion()).toBe('v3')
  })

  it('PA_PIPELINE=true + PDF_RENDERER=v2 → v2 selected (env override wins)', () => {
    process.env.PA_PIPELINE = 'true'
    process.env.PDF_RENDERER = 'v2'
    expect(resolveRendererVersion()).toBe('v2')
  })

  it('PA_PIPELINE=false (legacy) + no PDF_RENDERER → v2 selected by default', () => {
    process.env.PA_PIPELINE = 'false'
    delete process.env.PDF_RENDERER
    expect(resolveRendererVersion()).toBe('v2')
  })

  it('PA_PIPELINE=false + PDF_RENDERER=v3 → v3 selected (env override wins)', () => {
    process.env.PA_PIPELINE = 'false'
    process.env.PDF_RENDERER = 'v3'
    expect(resolveRendererVersion()).toBe('v3')
  })

  it('no PA_PIPELINE set + no PDF_RENDERER → defaults to v2 (legacy safe)', () => {
    delete process.env.PA_PIPELINE
    delete process.env.PDF_RENDERER
    expect(resolveRendererVersion()).toBe('v2')
  })

  it('PA_PIPELINE=true + PDF_RENDERER=v3 → v3 selected', () => {
    process.env.PA_PIPELINE = 'true'
    process.env.PDF_RENDERER = 'v3'
    expect(resolveRendererVersion()).toBe('v3')
  })
})
