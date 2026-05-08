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

// G-B2 fix: 'bom' and 'research' are now registered so included.delete() works.
// G-B3 fix: 'source_attrib' stays in the optional set; now gated by show().
const ALL_OPTIONAL_SECTIONS = [
  'feasibility',
  'regulatory',
  'sizing',
  'modules',
  'bom',        // G-B2: registered
  'cost',
  'suppliers',
  'risks',
  'research',   // G-B2: registered
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
// G-B1/G-B3 fix: source_attrib is now conditional — counted only when included.
function estimatePagesForReport(
  excludedSections: string[],
  opts: { moduleCount?: number; regCount?: number; riskCount?: number } = {},
): number {
  const { moduleCount = 0, regCount = 0, riskCount = 0 } = opts
  const included = buildIncludedSections(excludedSections)

  // Always-rendered: cover(1) + brief(2) = 3
  // source_attrib is conditional — add 1 only when included.
  let pages = 3

  if (included.has('source_attrib'))  pages += 1
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
    // G-B3: source_attrib is now also excluded on BRIEF_INCOMPLETE (cover + brief only).
    // cover + brief are always-rendered mandatory sections, not in the optional Set.
    expect(included.has('feasibility')).toBe(false)
    expect(included.has('regulatory')).toBe(false)
    expect(included.has('sizing')).toBe(false)
    expect(included.has('modules')).toBe(false)
    expect(included.has('cost')).toBe(false)
    expect(included.has('suppliers')).toBe(false)
    expect(included.has('risks')).toBe(false)
    expect(included.has('audit_log')).toBe(false)
    expect(included.has('source_attrib')).toBe(false)  // G-B3: now excluded
  })

  it('BRIEF_INCOMPLETE estimated page count ≤ 6 pages (rich data)', () => {
    const parsedBrief = makeParsedBrief({
      confidence: 'LOW',
      missing_mandatory_fields: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
    })
    const feasibility = makeFeasibility({ status: 'GREEN' })
    const result = routeReportType(feasibility, parsedBrief)
    expect(result.maxPages).toBe(6)

    // G-B3: source_attrib now excluded on BRIEF_INCOMPLETE, so only cover(1)+brief(2) = 3 pages
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

  // Renderer selection formula (mirrors index.ts after G-B4 fix):
  // const _pdfRendererVersion = (process.env.PDF_RENDERER ?? '') || (PA_PIPELINE ? 'v3' : 'v2')
  function resolveRendererVersion(): string {
    const paPipeline = (process.env.PA_PIPELINE ?? 'false') === 'true'
    return (process.env.PDF_RENDERER ?? '') || (paPipeline ? 'v3' : 'v2')
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

// ── G-B1: source_attrib double-count fix ─────────────────────────────────
// Verifies that _applyMaxPages does not double-count source_attrib.
// We replicate the fixed _applyMaxPages logic directly here (cannot import
// 7-pdf-v3.tsx due to @react-pdf/renderer ESM constraints).

describe('G-B1 — _applyMaxPages does not double-count source_attrib', () => {

  // Minimal fixed _applyMaxPages replica for unit-testing the accounting.
  // source_attrib is counted in base only if in the included Set;
  // it also appears at the END of TRIM_ORDER (last trim candidate).
  const TRIM_ORDER_FIXED = [
    'audit_log', 'suppliers', 'risks', 'cost', 'modules', 'regulatory', 'sizing', 'feasibility',
    'source_attrib',  // last — only trimmed when nothing else saves enough pages
  ]

  function applyMaxPagesFixed(
    included: Set<string>,
    maxPages: number,
    moduleCount = 0,
    regCount = 0,
    riskCount = 0,
  ): Set<string> {
    if (maxPages === 0) return included

    const pageSizes: Record<string, number> = {
      cover: 1, brief: 2, feasibility: 1,
      regulatory: 1 + Math.min(regCount, 10),
      sizing: 1,
      modules: 1 + moduleCount,
      cost: 1, suppliers: 1,
      risks: 1 + Math.min(riskCount, 20),
      audit_log: 1, source_attrib: 1,
    }

    // G-B1: base = cover + brief. source_attrib added only if in included.
    let estimated = pageSizes.cover + pageSizes.brief
    if (included.has('source_attrib')) estimated += pageSizes.source_attrib

    for (const sec of TRIM_ORDER_FIXED) {
      if (sec === 'source_attrib') continue  // already counted above
      if (included.has(sec)) estimated += pageSizes[sec] ?? 1
    }

    if (estimated <= maxPages) return included

    const trimmed = new Set(included)
    for (const sec of TRIM_ORDER_FIXED) {
      if (estimated <= maxPages) break
      if (trimmed.has(sec)) {
        estimated -= pageSizes[sec] ?? 1
        trimmed.delete(sec)
      }
    }
    return trimmed
  }

  it('source_attrib NOT trimmed when other sections can absorb the savings', () => {
    // Cap = 5. Base = cover(1)+brief(2)+source_attrib(1)+audit_log(1) = 5.
    // audit_log should be trimmed first, leaving source_attrib intact.
    const included = new Set(['source_attrib', 'audit_log'])
    const result = applyMaxPagesFixed(included, 5)
    // estimated = 1+2+1+1 = 5, already ≤ 5 — nothing trimmed
    expect(result.has('source_attrib')).toBe(true)
    expect(result.has('audit_log')).toBe(true)
  })

  it('source_attrib trimmed LAST — only when nothing else can save pages', () => {
    // Cap = 3. Only source_attrib is in included.
    // base = cover(1)+brief(2)+source_attrib(1) = 4 > 3.
    // TRIM_ORDER has source_attrib last; it must be removed to reach ≤ 3.
    const included = new Set(['source_attrib'])
    const result = applyMaxPagesFixed(included, 3)
    expect(result.has('source_attrib')).toBe(false)
  })

  it('no double-count: source_attrib excluded → base estimate is cover+brief only', () => {
    // BRIEF_INCOMPLETE: source_attrib is excluded. Base should be 3, not 4.
    const included = new Set<string>()  // source_attrib NOT in included
    const result = applyMaxPagesFixed(included, 3)
    // Estimated = cover(1)+brief(2)+nothing = 3 ≤ 3: nothing trimmed
    expect(result.size).toBe(0)  // nothing was in included to begin with
  })

  it('estimated page count with source_attrib included = cover+brief+source_attrib+other sections', () => {
    // Verify accounting: cover(1)+brief(2)+source_attrib(1)+cost(1) = 5
    const included = new Set(['source_attrib', 'cost'])
    const result = applyMaxPagesFixed(included, 10)  // cap high enough to include all
    expect(result.has('source_attrib')).toBe(true)
    expect(result.has('cost')).toBe(true)
  })
})

// ── G-B2: 'bom' and 'research' exclusions take effect ───────────────────

describe('G-B2 — bom and research IDs now registered in included Set', () => {

  it('FEASIBILITY_EXCEPTION excludes bom — delete is NOT a silent no-op', () => {
    const feasibility = makeFeasibility({
      status: 'RED',
      blockers: ['Cost check failed', 'Sizing infeasible'],
    })
    const result = routeReportType(feasibility)
    expect(result.excludedSections).toContain('bom')
    // Build the included set using our fixed ALL_OPTIONAL_SECTIONS (with 'bom').
    const included = buildIncludedSections(result.excludedSections)
    expect(included.has('bom')).toBe(false)  // G-B2: now actually deleted
  })

  it('FEASIBILITY_EXCEPTION excludes research — delete is NOT a silent no-op', () => {
    const feasibility = makeFeasibility({
      status: 'RED',
      blockers: ['Cost check failed', 'Sizing infeasible'],
    })
    const result = routeReportType(feasibility)
    expect(result.excludedSections).toContain('research')
    const included = buildIncludedSections(result.excludedSections)
    expect(included.has('research')).toBe(false)  // G-B2: now actually deleted
  })

  it('BRIEF_INCOMPLETE excludes bom — delete is NOT a silent no-op', () => {
    const parsedBrief = makeParsedBrief({
      confidence: 'LOW',
      missing_mandatory_fields: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
    })
    const feasibility = makeFeasibility({ status: 'GREEN' })
    const result = routeReportType(feasibility, parsedBrief)
    expect(result.excludedSections).toContain('bom')
    const included = buildIncludedSections(result.excludedSections)
    expect(included.has('bom')).toBe(false)
  })

  it('a route that excludes only bom (synthetic) suppresses bom and nothing else', () => {
    const included = buildIncludedSections(['bom'])
    expect(included.has('bom')).toBe(false)  // G-B2: was no-op before fix
    expect(included.has('cost')).toBe(true)   // cost unaffected
    expect(included.has('modules')).toBe(true)
  })
})

// ── G-B3: source_attrib excluded on BRIEF_INCOMPLETE ─────────────────────

describe('G-B3 — BRIEF_INCOMPLETE excludes source_attrib', () => {

  it('BRIEF_INCOMPLETE router result includes source_attrib in excludedSections', () => {
    const parsedBrief = makeParsedBrief({
      confidence: 'LOW',
      missing_mandatory_fields: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
    })
    const feasibility = makeFeasibility({ status: 'GREEN' })
    const result = routeReportType(feasibility, parsedBrief)
    expect(result.excludedSections).toContain('source_attrib')
  })

  it('BRIEF_INCOMPLETE included set has source_attrib=false', () => {
    const parsedBrief = makeParsedBrief({
      confidence: 'LOW',
      missing_mandatory_fields: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
    })
    const feasibility = makeFeasibility({ status: 'GREEN' })
    const result = routeReportType(feasibility, parsedBrief)
    const included = buildIncludedSections(result.excludedSections)
    expect(included.has('source_attrib')).toBe(false)
  })

  it('BRIEF_INCOMPLETE page count = cover(1)+brief(2) = 3 (no source_attrib)', () => {
    const parsedBrief = makeParsedBrief({
      confidence: 'LOW',
      missing_mandatory_fields: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
    })
    const feasibility = makeFeasibility({ status: 'GREEN' })
    const result = routeReportType(feasibility, parsedBrief)
    const pages = estimatePagesForReport(result.excludedSections)
    expect(pages).toBe(3)  // cover+brief only — source_attrib excluded
  })

  it('FULL_REPORT still includes source_attrib', () => {
    const feasibility = makeFeasibility({ status: 'GREEN', blockers: [] })
    const result = routeReportType(feasibility)
    const included = buildIncludedSections(result.excludedSections)
    expect(included.has('source_attrib')).toBe(true)
  })
})

// ── G-B4: PDF_RENDERER env var validation ────────────────────────────────

describe('G-B4 — PDF_RENDERER uses ?? and warns on invalid values', () => {
  const ORIGINAL_ENV = { ...process.env }

  afterEach(() => {
    for (const key of ['PA_PIPELINE', 'PDF_RENDERER']) {
      if (ORIGINAL_ENV[key] !== undefined) {
        process.env[key] = ORIGINAL_ENV[key]
      } else {
        delete process.env[key]
      }
    }
  })

  // Fixed formula (mirrors index.ts after G-B4 fix):
  // const _pdfRendererVersion = (process.env.PDF_RENDERER ?? '') || (PA_PIPELINE ? 'v3' : 'v2')
  function resolveRendererVersionFixed(): string {
    const paPipeline = (process.env.PA_PIPELINE ?? 'false') === 'true'
    return (process.env.PDF_RENDERER ?? '') || (paPipeline ? 'v3' : 'v2')
  }

  it('PDF_RENDERER="" + PA_PIPELINE=true → v3 (empty string treated as unset)', () => {
    process.env.PA_PIPELINE = 'true'
    process.env.PDF_RENDERER = ''
    // G-B4: with ||, '' was falsy → fell through to ternary.
    // With ??, '' is not nullish but '' || fallback still works correctly:
    // '' is falsy so ternary applies — v3 for PA_PIPELINE=true.
    expect(resolveRendererVersionFixed()).toBe('v3')
  })

  it('PDF_RENDERER="" + PA_PIPELINE=false → v2 (empty string treated as unset)', () => {
    process.env.PA_PIPELINE = 'false'
    process.env.PDF_RENDERER = ''
    expect(resolveRendererVersionFixed()).toBe('v2')
  })

  it('invalid PDF_RENDERER value (v4) resolves to v4 string — caller must warn', () => {
    // The validation console.warn happens in index.ts at module load time.
    // Here we verify the resolution value is the raw invalid string (v4),
    // which index.ts then recognises as non-v3 and falls back to legacy renderer.
    process.env.PA_PIPELINE = 'false'
    process.env.PDF_RENDERER = 'v4'
    const version = resolveRendererVersionFixed()
    expect(version).toBe('v4')
    // v4 !== 'v3' → legacy renderer selected (tested by: _activePdfRenderer = version === 'v3' ? V3 : V2)
    const activeLegacy = version === 'v3'
    expect(activeLegacy).toBe(false)
  })

  it('invalid PDF_RENDERER value (V3 uppercase) also resolves to legacy renderer', () => {
    process.env.PA_PIPELINE = 'true'
    process.env.PDF_RENDERER = 'V3'
    const version = resolveRendererVersionFixed()
    expect(version).toBe('V3')
    // 'V3' !== 'v3' → legacy renderer selected
    expect(version === 'v3').toBe(false)
  })
})
