import { scoreAllSections } from './scorer'
import type { PipelineState } from './types'

describe('Deterministic Scorer', () => {
  it('should emit -1 sentinels for all sections (F12 retirement)', () => {
    // Minimal mock pipeline state — only fields the deterministic scorer
    // reads via the individual score* helpers (all now return -1 sentinels
    // so none of these actually need to be populated with real data).
    const state: PipelineState = {
      projectId: 'test-project',
      research: null,
      modules: [],
      dimensionSheet: null,
      parts: [],
      bomLines: [],
      costBreakdown: null,
      reviews: [],
      suppliers: [],
      proofreadFindings: null,
      sourceAttributions: [],
      llmAttributions: [],
      sectionScores: [],
    }

    const scores = scoreAllSections(state)

    expect(scores).toHaveLength(9)

    const expectedSections = [
      'Brief',
      'Regulatory',
      'Sizing',
      'Modules',
      'BOM',
      'Cost',
      'Risks',
      'Suppliers',
      'Research',
    ]

    const actualSections = scores.map(s => s.section)
    expect(actualSections).toEqual(expect.arrayContaining(expectedSections))

    scores.forEach(s => {
      expect(s.score).toBe(-1)
      expect(s.reasons[0]).toContain('F12')
      expect(s.reasons[0]).toContain('retired')
      expect(s.suggestions[0]).toContain('council-scorer')
    })
  })
})

