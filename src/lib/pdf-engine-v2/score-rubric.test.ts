import { computeCompoundScore } from './score-rubric'

describe('computeCompoundScore (SCORE-001 + F7 reweight)', () => {
  it('combines rubric 15% + council average 85% × 10 (F7 weights)', () => {
    // rubric 95, council avg 6.0 → 95*0.15 + 60*0.85 = 14.25 + 51 = 65
    const result = computeCompoundScore(95, [
      { section: 'BOM', score: 4 },
      { section: 'Cost', score: 5 },
      { section: 'Risks', score: 8 },
      { section: 'Regulatory', score: 7 },
    ])
    // avg = (4+5+8+7)/4 = 6.0. compound = round(95*0.15 + 6.0*10*0.85) = 65
    expect(result.compound).toBe(65)
    expect(result.rubric).toBe(95)
    expect(result.councilAvg).toBeCloseTo(6.0, 3)
    expect(result.councilScored).toBe(4)
    expect(result.councilFailed).toBe(0)
    expect(result.formulaVersion).toBe('f7')
  })

  it('reveals the rubric-vs-council divergence from real runs', () => {
    // BESS run from 2026-05-07: rubric 97, council avg 6.5 (one failed)
    // Compound = round(97*0.15 + 6.5*10*0.85) = round(14.55 + 55.25) = 70
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
    expect(result.councilAvg).toBeCloseTo(6.5, 3)
    expect(result.councilScored).toBe(8)
    expect(result.councilFailed).toBe(1)
    expect(result.compound).toBe(70)
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
    // compound = round(80*0.15 + 9*10*0.85) = round(12 + 76.5) = 89
    expect(result.compound).toBe(89)
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
    expect(result.formulaVersion).toBe('f7')
  })

  it('handles an empty council-scores array (all deterministic)', () => {
    const result = computeCompoundScore(80, [])
    expect(result.compound).toBe(80)
    expect(result.councilAvg).toBeNull()
    expect(result.councilFailed).toBe(0)
    expect(result.councilScored).toBe(0)
  })

  it('rounds the compound score to an integer', () => {
    const result = computeCompoundScore(95, [
      { section: 'A', score: 6 },
      { section: 'B', score: 6 },
      { section: 'C', score: 7 },
    ])
    expect(Number.isInteger(result.compound)).toBe(true)
  })

  it('F7 honesty check: a high-rubric-but-bad-content report no longer reads as 99', () => {
    // Under old 40/60 weights: 99*0.4 + 3*10*0.6 = 39.6 + 18 = 58
    // Under F7 weights:       99*0.15 + 3*10*0.85 = 14.85 + 25.5 = 40
    // Much more honest — a report with 3/10 content across the board
    // should read in the red zone.
    const result = computeCompoundScore(99, [
      { section: 'BOM', score: 3 },
      { section: 'Cost', score: 3 },
      { section: 'Brief', score: 3 },
    ])
    expect(result.compound).toBe(40)
    // Below the amber/red threshold — honest red-zone scoring
    expect(result.compound).toBeLessThan(50)
  })
})

