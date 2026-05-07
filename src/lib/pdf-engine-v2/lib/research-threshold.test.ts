import { checkResearchThresholds } from './research-threshold'

describe('checkResearchThresholds', () => {
  it('passes all thresholds', () => {
    const research = {
      sources: Array(5).fill({ title: 'Source' }),
      competitors: Array(3).fill({ name: 'Comp' }),
      standardCodes: ['ISO123'],
      report: 'A'.repeat(500)
    }
    const result = checkResearchThresholds(research)
    expect(result.passed).toBe(true)
    expect(result.issues.length).toBe(0)
    expect(result.sourceCount).toBe(5)
    expect(result.competitorCount).toBe(3)
    expect(result.standardCount).toBe(1)
  })

  it('fails on too few sources', () => {
    const research = {
      sources: Array(4).fill({ title: 'Source' }),
      competitors: Array(3).fill({ name: 'Comp' }),
      standardCodes: ['ISO123'],
      report: 'A'.repeat(500)
    }
    const result = checkResearchThresholds(research)
    expect(result.passed).toBe(false)
    expect(result.issues).toContain('Research has 4 sources, expected ≥5')
  })

  it('fails on no competitors', () => {
    const research = {
      sources: Array(5).fill({ title: 'Source' }),
      competitors: [],
      standardCodes: ['ISO123'],
      report: 'A'.repeat(500)
    }
    const result = checkResearchThresholds(research)
    expect(result.passed).toBe(false)
    expect(result.issues).toContain('Research has 0 competitors, expected ≥3')
  })

  it('fails on no standards', () => {
    const research = {
      sources: Array(5).fill({ title: 'Source' }),
      competitors: Array(3).fill({ name: 'Comp' }),
      standardCodes: [],
      report: 'A'.repeat(500)
    }
    const result = checkResearchThresholds(research)
    expect(result.passed).toBe(false)
    expect(result.issues).toContain('No regulatory standards identified')
  })

  it('fails on short report', () => {
    const research = {
      sources: Array(5).fill({ title: 'Source' }),
      competitors: Array(3).fill({ name: 'Comp' }),
      standardCodes: ['ISO123'],
      report: 'A'.repeat(499)
    }
    const result = checkResearchThresholds(research)
    expect(result.passed).toBe(false)
    expect(result.issues).toContain('Research report suspiciously short (499 chars)')
  })
})
