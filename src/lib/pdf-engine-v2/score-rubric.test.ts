import { computeCompoundScore } from './score-rubric'

describe('computeCompoundScore (SCORE-001)', () => {
  it('combines rubric 40% + council average 60% × 10', () => {
    // rubric 95, council avg 6.0 → 95*0.4 + 60*0.6 = 38 + 36 = 74
    const result = computeCompoundScore(95, [
      { section: 'BOM', score: 4 },
      { section: 'Cost', score: 5 },
      { section: 'Risks', score: 8 },
      { section: 'Regulatory', score: 7 },
    ])
    // avg = (4+5+8+7)/4 = 6.0. compound = round(95*0.4 + 6.0*10*0.6) = 74
    expect(result.compound).toBe(74)
    expect(result.rubric).toBe(95)
    expect(result.councilAvg).toBeCloseTo(6.0, 3)
    expect(result.councilScored).toBe(4)
    expect(result.councilFailed).toBe(0)
  })

  it('reveals the rubric-vs-council divergence from real runs', () => {
    // BESS run from 2026-05-07: rubric 97, council avg 6.3 (one failed)
    // Compound = round(97*0.4 + 6.3*10*0.6) = round(38.8 + 37.8) = 77
    const result = computeCompoundScore(97, [
      { section: 'Brief', score: -1 },       // council failed
      { section: 'Regulatory', score: 8 },
      { section: 'Sizing', score: 6 },
      { section: 'Modules', score: 8 },
      { section: 'BOM', score: 4 },
      { section: 'Cost', score: 4 },
      { section: 'Risks', score: 8 },
      { section: 'Suppliers', score: 8 },
      { section: 'Research', score: 6 },
    ])
    // scored (8 sections, excluding Brief which failed) avg = (8+6+8+4+4+8+8+6)/8 = 6.5
    expect(result.councilAvg).toBeCloseTo(6.5, 3)
    expect(result.councilScored).toBe(8)
    expect(result.councilFailed).toBe(1)
    // compound = round(97*0.4 + 6.5*10*0.6) = round(38.8 + 39) = 78
    expect(result.compound).toBe(78)
  })

  it('excludes failed-to-score sections from the average', () => {
    // Two sections failed, two scored at 9
    const result = computeCompoundScore(80, [
      { section: 'A', score: -1 },
      { section: 'B', score: -1 },
      { section: 'C', score: 9 },
      { section: 'D', score: 9 },
    ])
    expect(result.councilAvg).toBe(9)
    expect(result.councilScored).toBe(2)
    expect(result.councilFailed).toBe(2)
    // compound = round(80*0.4 + 9*10*0.6) = round(32 + 54) = 86
    expect(result.compound).toBe(86)
  })

  it('falls back to rubric alone when every council section failed', () => {
    const result = computeCompoundScore(80, [
      { section: 'A', score: -1 },
      { section: 'B', score: -1 },
    ])
    expect(result.compound).toBe(80)
    expect(result.councilAvg).toBeNull()
    expect(result.councilScored).toBe(0)
    expect(result.councilFailed).toBe(2)
  })

  it('handles an empty council-scores array (all deterministic)', () => {
    const result = computeCompoundScore(80, [])
    expect(result.compound).toBe(80)
    expect(result.councilAvg).toBeNull()
    expect(result.councilFailed).toBe(0)
    expect(result.councilScored).toBe(0)
  })

  it('rounds the compound score to an integer', () => {
    // Rubric 95, council avg 6.333 → 95*0.4 + 63.33*0.6 = 38 + 38 = 76
    const result = computeCompoundScore(95, [
      { section: 'A', score: 6 },
      { section: 'B', score: 6 },
      { section: 'C', score: 7 },
    ])
    expect(Number.isInteger(result.compound)).toBe(true)
  })

  it('reveals what the old display hid: low council but high rubric', () => {
    // A BESS report with perfect completeness (99/100 rubric) but awful
    // content (3/10 council) — compound should be low, exposing the
    // quality problem that the old single score hid.
    const result = computeCompoundScore(99, [
      { section: 'BOM', score: 3 },
      { section: 'Cost', score: 3 },
      { section: 'Brief', score: 3 },
    ])
    // compound = round(99*0.4 + 3*10*0.6) = round(39.6 + 18) = 58
    expect(result.compound).toBe(58)
    // Old behaviour would have shown 99/100. New compound 58/100 is
    // in the amber band and visible to the founder.
  })
})
