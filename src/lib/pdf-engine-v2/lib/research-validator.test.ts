import { validateResearchOutput } from './research-validator'

describe('validateResearchOutput', () => {
  it('returns valid for complete research with all fields present', () => {
    const result = validateResearchOutput({
      designBrief: { mission: 'Build a better battery', useCase: 'Grid-scale energy storage' },
      sources: [
        { title: 'Source A', url: 'https://a.example.com' },
        { title: 'Source B', url: 'https://b.example.com' },
        { title: 'Source C', url: 'https://c.example.com' },
      ],
      competitors: [{ name: 'Competitor A' }],
      report: 'A'.repeat(300),
    })

    expect(result.isValid).toBe(true)
    expect(result.missingFields).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
    expect(result.canProceed).toBe(true)
  })

  it('flags missing designBrief as blocking — canProceed is false', () => {
    const result = validateResearchOutput({
      sources: [{ title: 'Source A' }],
      report: 'A'.repeat(300),
    })

    expect(result.isValid).toBe(false)
    expect(result.missingFields).toContain('designBrief')
    expect(result.canProceed).toBe(false)
  })

  it('flags sparse designBrief (no mission or useCase) but canProceed stays true', () => {
    const result = validateResearchOutput({
      designBrief: { targetProcess: 'CNC' },
      sources: [{ title: 'Source A' }],
      report: 'A'.repeat(300),
    })

    expect(result.missingFields).toContain('designBrief.mission or designBrief.useCase')
    expect(result.canProceed).toBe(true)
  })

  it('warns on fewer than 3 sources and short report', () => {
    const result = validateResearchOutput({
      designBrief: { mission: 'Build something' },
      sources: [{ title: 'Only source' }],
      report: 'Short report.',
    })

    expect(result.isValid).toBe(false)
    expect(result.warnings).toHaveLength(2)
    expect(result.warnings[0]).toContain('Only 1 source(s)')
    expect(result.warnings[1]).toContain('characters')
    expect(result.warnings[1]).toContain('200 or more recommended')
    expect(result.canProceed).toBe(true)
  })

  it('handles completely empty input', () => {
    const result = validateResearchOutput({})

    expect(result.isValid).toBe(false)
    expect(result.missingFields).toContain('designBrief')
    expect(result.warnings.length).toBeGreaterThanOrEqual(2)
    expect(result.canProceed).toBe(false)
  })
})
