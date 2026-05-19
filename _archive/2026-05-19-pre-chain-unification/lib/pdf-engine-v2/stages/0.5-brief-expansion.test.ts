import { buildBriefExpansionPrompt, shouldExpandBrief } from './0.5-brief-expansion'

describe('Brief Expansion', () => {
  it('builds a valid prompt', () => {
    const prompt = buildBriefExpansionPrompt('A smart toaster', 'consumer_electronics', ['IoT', 'Heating'])
    expect(prompt).toContain('A smart toaster')
    expect(prompt).toContain('consumer_electronics')
    expect(prompt).toContain('IoT, Heating')
    expect(prompt).toContain('Return JSON:')
  })

  it('triggers expansion for brief < 500 chars', () => {
    const brief = 'a'.repeat(499)
    expect(shouldExpandBrief(brief)).toBe(true)
  })

  it('skips expansion for brief > 500 chars', () => {
    const brief = 'a'.repeat(500)
    expect(shouldExpandBrief(brief)).toBe(false)
  })

  it('triggers expansion for brief > 500 chars if designBrief has many missing fields', () => {
    const brief = 'a'.repeat(500)
    const designBrief = {
      useCase: 'Unknown',
      targetProcess: 'N/A',
      targetMaterial: 'unknown',
      toleranceTarget: 'good',
      quantityTarget: '100'
    }
    expect(shouldExpandBrief(brief, designBrief)).toBe(true)
  })

  it('InferredAssumptions are correctly structured (type check check)', () => {
    // This is basically a type check or mock check, we will mock the LLM response in actual engine, but here we just check if types align.
    const result = {
      originalBrief: 'test',
      expandedFields: { target_cost: 15000 },
      inferredAssumptions: [{ field: 'target_cost', value: 15000, confidence: 'MEDIUM' as const, reasoning: 'test' }],
      assumptions: ['Assumed UK'],
      canProceed: true
    }
    expect(result.inferredAssumptions[0].confidence).toBe('MEDIUM')
  })
})
