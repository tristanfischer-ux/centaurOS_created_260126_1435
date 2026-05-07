import { computeCorpusCoverage } from './corpus-coverage'

describe('computeCorpusCoverage', () => {
  it('handles empty parts array', () => {
    const report = computeCorpusCoverage([])
    expect(report.totalParts).toBe(0)
    expect(report.coveragePercent).toBe(0)
    expect(report.unmatched).toBe(0)
    expect(report.breakdown.length).toBe(0)
  })

  it('handles all matched', () => {
    const parts = [
      { name: 'R1', regime: 'buy_electronic', regimeRouterResult: { source: 'distributor' } },
      { name: 'M1', regime: 'make_custom_fab', suppliers: [{ name: 'Supplier A' }] }
    ]
    const report = computeCorpusCoverage(parts)
    expect(report.totalParts).toBe(2)
    expect(report.distributorMatches).toBe(1)
    expect(report.fabricatorMatches).toBe(1)
    expect(report.unmatched).toBe(0)
    expect(report.coveragePercent).toBe(100)
    expect(report.breakdown.length).toBe(2)
  })

  it('handles none matched', () => {
    const parts = [
      { name: 'R1', regime: 'buy_electronic', regimeRouterResult: { source: 'manufacturer' } },
      { name: 'M1', regime: 'make_custom_fab' }
    ]
    const report = computeCorpusCoverage(parts)
    expect(report.totalParts).toBe(2)
    expect(report.distributorMatches).toBe(0)
    expect(report.fabricatorMatches).toBe(0)
    expect(report.unmatched).toBe(2)
    expect(report.coveragePercent).toBe(0)
  })

  it('handles mixed', () => {
    const parts = [
      { name: 'R1', regime: 'buy_electronic', regimeRouterResult: { source: 'distributor' } },
      { name: 'R2', regime: 'buy_electronic' },
      { name: 'M1', regime: 'make_custom_fab', suppliers: [{ name: 'Supplier A' }] },
      { name: 'O1', regime: 'other', suppliers: [{ name: 'Supplier B' }] },
      { name: 'O2', regime: 'other' }
    ]
    const report = computeCorpusCoverage(parts)
    expect(report.totalParts).toBe(5)
    expect(report.distributorMatches).toBe(1)
    expect(report.fabricatorMatches).toBe(1)
    expect(report.unmatched).toBe(2)
    expect(report.coveragePercent).toBe(60)
  })
})
