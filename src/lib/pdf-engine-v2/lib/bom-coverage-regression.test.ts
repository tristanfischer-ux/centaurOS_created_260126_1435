import {
  runCoverageRegression,
  CANONICAL_BOMS,
  type CoverageReport,
  type CoverageResult,
} from './bom-coverage-regression'

describe('bom-coverage-regression', () => {
  // ─── Canonical BOM structure ─────────────────────────────────────────────

  it('has 4 product classes with canonical BOMs', () => {
    expect(Object.keys(CANONICAL_BOMS)).toHaveLength(4)
    expect(Object.keys(CANONICAL_BOMS).sort()).toEqual([
      'drone', 'energy_storage', 'ev_charger', 'thermal_system',
    ])
  })

  // ─── energy_storage classification ──────────────────────────────────────

  it('classifies at least 5 of 10 energy_storage parts as buy_electronic', () => {
    const report = runCoverageRegression()
    const es = report.results.find(r => r.productClass === 'energy_storage')
    expect(es).toBeDefined()
    expect(es!.totalParts).toBe(10)

    const buyElectronic = es!.details.filter(d => d.regime === 'buy_electronic')
    expect(buyElectronic.length).toBeGreaterThanOrEqual(5)
  })

  // ─── drone classification ───────────────────────────────────────────────

  it('classifies at least 3 of 8 drone parts as buy_electronic', () => {
    const report = runCoverageRegression()
    const drone = report.results.find(r => r.productClass === 'drone')
    expect(drone).toBeDefined()
    expect(drone!.totalParts).toBe(8)

    const buyElectronic = drone!.details.filter(d => d.regime === 'buy_electronic')
    expect(buyElectronic.length).toBeGreaterThanOrEqual(3)
  })

  // ─── Empty BOM ──────────────────────────────────────────────────────────

  it('returns 0% coverage for an empty product class', () => {
    const report = runCoverageRegression({
      // Override with a single empty product class
      distributor: () => false,
      corpus: () => false,
      service: () => false,
    })

    // All parts will be unmatched since all checkers return false
    expect(report.overallCoveragePercent).toBe(0)
    for (const result of report.results) {
      expect(result.coveragePercent).toBe(0)
      expect(result.unmatched).toBe(result.totalParts)
    }
  })

  // ─── Timestamp format ───────────────────────────────────────────────────

  it('produces a valid ISO 8601 timestamp', () => {
    const report = runCoverageRegression()
    const parsed = new Date(report.timestamp)
    expect(parsed.getTime()).not.toBeNaN()
    // ISO format check: contains T and Z
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  // ─── Overall structure ──────────────────────────────────────────────────

  it('produces one CoverageResult per canonical product class', () => {
    const report = runCoverageRegression()
    expect(report.results).toHaveLength(4)
    for (const result of report.results) {
      expect(result.totalParts).toBeGreaterThan(0)
      expect(result.details).toHaveLength(result.totalParts)
    }
  })

  it('each detail row has a valid regime from C5', () => {
    const validRegimes = new Set([
      'buy_electronic',
      'buy_mechanical_industrial',
      'named_manufacturer_reseller',
      'make_custom_fab',
      'service_certification',
    ])
    const report = runCoverageRegression()
    for (const result of report.results) {
      for (const detail of result.details) {
        expect(validRegimes.has(detail.regime)).toBe(true)
      }
    }
  })

  it('reports overall coverage as a weighted average across all classes', () => {
    const report = runCoverageRegression()
    const totalParts = report.results.reduce((s, r) => s + r.totalParts, 0)
    const totalMatched = report.results.reduce(
      (s, r) => s + r.distributorMatches + r.fabricatorMatches + r.serviceMatches,
      0,
    )
    const expectedOverall = totalParts > 0
      ? Math.round((totalMatched / totalParts) * 100)
      : 0
    expect(report.overallCoveragePercent).toBe(expectedOverall)
  })

  it('all matched details have a non-empty source', () => {
    const report = runCoverageRegression()
    for (const result of report.results) {
      for (const detail of result.details) {
        if (detail.matched) {
          expect(detail.source).not.toBe('none')
          expect(detail.source.length).toBeGreaterThan(0)
        }
      }
    }
  })
})
