/**
 * @file council-scorer.test.ts — F8: verify per-judge breakdown is populated
 *
 * Tests that runCouncilScoring produces judgeBreakdown entries with
 * model, score, and criteria_scores for each judge that responded.
 */

import { runCouncilScoring } from './council-scorer'
import type { PipelineState } from './types'

// Mock global fetch to simulate 3 OpenRouter judges returning valid scores.
const mockFetch = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = mockFetch as unknown as typeof fetch
  process.env.OPENROUTER_API_KEY = 'test-key'
})

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY
})

/** Build a minimal PipelineState with enough data for council scoring. */
function makeState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    projectId: 'test-f8',
    research: {
      report: 'A'.repeat(200),
      sources: [{ title: 'Test Source', url: 'https://example.com' }],
      standardCodes: ['BS EN 378'],
      industryDomain: 'heat_pump',
      designBrief: {
        mission: 'Build a heat pump',
        useCase: 'Residential heating',
        targetCustomers: 'UK homeowners',
        whyNow: 'Net zero targets',
        targetProcess: 'CNC machining',
        targetMaterial: 'Copper',
        toleranceTarget: '±0.1mm',
        quantityTarget: '1000',
        complianceNotes: 'BS EN 378',
        constraints: { unitCostCeilingGbp: 5000, maxMassKg: 80 },
        regulatory: [],
      },
    } as any,
    modules: Array.from({ length: 4 }, (_, i) => ({
      id: `mod-${i}`,
      name: `Module ${i}`,
      description: 'A'.repeat(120),
      purpose: 'Heating',
      keyParts: ['part-a', 'part-b', 'part-c'],
      failureModes: ['overheat'],
      riskMatrix: [{ hazard: 'fire', severity: 4, likelihood: 2, cause: 'short', mitigation: 'fuse', owner: 'eng' }],
    })),
    dimensionSheet: {
      feasible: true,
      envelope: { kind: 'box', interior_w_mm: 500, interior_d_mm: 400, interior_h_mm: 300, interior_volume_m3: 0.06 },
      floor_budget_m2: 0.2,
      module_dimensions: {},
      conflicts: [],
    } as any,
    parts: Array.from({ length: 15 }, (_, i) => ({
      partNumber: `P${i}`,
      name: `Part ${i}`,
      process: 'CNC',
      estimatedUnitCostGbp: 10 + i,
      massKg: 0.5,
      sourceModuleId: `mod-${i % 4}`,
    })),
    bomLines: [],
    costBreakdown: {
      unitTotalGbp: 3500,
      ceilingGbp: 5000,
      nreTotalGbp: 20000,
      overheadMultiplier: 1.3,
      perModule: [
        { moduleName: 'Module 0', totalGbp: 800 },
        { moduleName: 'Module 1', totalGbp: 900 },
        { moduleName: 'Module 2', totalGbp: 700 },
        { moduleName: 'Module 3', totalGbp: 600 },
      ],
    },
    reviews: [],
    suppliers: [
      { partName: 'Part 0', suppliers: [{ name: 'Acme Ltd', score: 85 }] },
      { partName: 'Part 1', suppliers: [{ name: 'Beta Corp', score: 72 }] },
    ],
    proofreadFindings: null,
    sourceAttributions: [],
    llmAttributions: [],
    sectionScores: [],
    ...overrides,
  }
}

/**
 * Build a mock fetch response that returns a valid judge JSON payload.
 * Each judge returns slightly different scores to verify the spread.
 */
function judgeResponse(modelIndex: number) {
  // Three different scoring personalities: harsh, mid, lenient
  const baseScores = [5, 7, 9]
  const base = baseScores[modelIndex] || 7

  const payload = {
    criteria_scores: [
      { criterion: 'Technical Accuracy', score: base, reason: `Judge ${modelIndex} assessment` },
      { criterion: 'Safety Compliance', score: base + 1, reason: 'Adequate' },
      { criterion: 'Cost Realism', score: base - 1, reason: 'Acceptable' },
      { criterion: 'Manufacturing Feasibility', score: base, reason: 'Feasible' },
      { criterion: 'Design Completeness', score: base, reason: 'Complete' },
    ],
    overall_score: base,
    overall_reasons: [`Judge ${modelIndex} observation`],
    code_change_recommendations: [`Fix ${modelIndex}`],
    source_attributions: [],
  }

  return {
    ok: true,
    json: () => Promise.resolve({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
  }
}

describe('F8: Per-judge score breakdown (council-scorer)', () => {
  it('populates judgeBreakdown with model, score, and criteria_scores for each judge', async () => {
    // Return different scores per judge call (3 judges x multiple sections)
    let callIndex = 0
    mockFetch.mockImplementation(() => {
      const result = Promise.resolve(judgeResponse(callIndex % 3))
      callIndex++
      return result
    })

    const state = makeState()
    const result = await runCouncilScoring(state)

    expect(result.ok).toBe(true)
    expect(result.data).toBeDefined()

    // Find a council-scored section (Brief, BOM, Cost, Suppliers, Risks)
    const councilSections = result.data!.filter(
      sc => sc.judgeBreakdown && sc.judgeBreakdown.length > 0
    )
    expect(councilSections.length).toBeGreaterThan(0)

    for (const sc of councilSections) {
      expect(sc.judgeBreakdown).toBeDefined()
      expect(sc.judgeBreakdown!.length).toBeGreaterThanOrEqual(1)
      expect(sc.judgeBreakdown!.length).toBeLessThanOrEqual(3)

      for (const judge of sc.judgeBreakdown!) {
        expect(judge.model).toBeTruthy()
        expect(typeof judge.model).toBe('string')
        expect(typeof judge.score).toBe('number')
        expect(judge.score).toBeGreaterThanOrEqual(1)
        expect(judge.score).toBeLessThanOrEqual(10)
        expect(Array.isArray(judge.criteria_scores)).toBe(true)
        expect(judge.criteria_scores.length).toBeGreaterThan(0)

        for (const cs of judge.criteria_scores) {
          expect(typeof cs.criterion).toBe('string')
          expect(typeof cs.score).toBe('number')
        }
      }
    }
  })

  it('records the correct judge model identifiers', async () => {
    const modelsSeen: string[] = []
    mockFetch.mockImplementation((url: string, opts: any) => {
      const body = JSON.parse(opts.body)
      modelsSeen.push(body.model)
      return Promise.resolve(judgeResponse(modelsSeen.length % 3))
    })

    const state = makeState()
    await runCouncilScoring(state)

    // B2 fix (2026-05-08): MiMo replaced by GPT-5.4 in council-scorer judges.
    // D1-6 council BLOCKER fix: MiMo is a content generator, not precision extractor.
    // The three judges should be Grok, GPT-5.4, GLM (engine-lineage excluded per SCORE-F9)
    const uniqueModels = [...new Set(modelsSeen)]
    expect(uniqueModels).toContain('x-ai/grok-4.3')
    expect(uniqueModels).toContain('openai/gpt-5.4')
    expect(uniqueModels).toContain('z-ai/glm-5.1')
  })

  it('judge spread reflects individual judge scores, not just the average', async () => {
    // Return clearly different scores: 5, 7, 9
    let callIdx = 0
    mockFetch.mockImplementation(() => {
      const result = Promise.resolve(judgeResponse(callIdx % 3))
      callIdx++
      return result
    })

    const state = makeState()
    const result = await runCouncilScoring(state)

    const withBreakdown = result.data!.filter(sc => sc.judgeBreakdown && sc.judgeBreakdown.length >= 3)
    expect(withBreakdown.length).toBeGreaterThan(0)

    for (const sc of withBreakdown) {
      const scores = sc.judgeBreakdown!.map(j => j.score)
      const spread = Math.max(...scores) - Math.min(...scores)
      // Judges return 5, 7, 9 → spread should be 4
      expect(spread).toBeGreaterThanOrEqual(2)
      // The averaged score should be between the extremes
      expect(sc.score).toBeGreaterThanOrEqual(Math.min(...scores))
      expect(sc.score).toBeLessThanOrEqual(Math.max(...scores))
    }
  })
})

// ── SCORE-BP1: Brief section uses parsedBrief (StructuredBriefJSON) when present ──
//
// Regression test for scorer mis-calibration discovered in RL Round 1 Iteration 1
// (2026-05-09). The scorer was reading state.research.designBrief (seeded with only
// useCase + 2 constraints from brief_parsing) instead of state.parsedBrief (the actual
// StructuredBriefJSON output). Judges saw 9 near-empty fields and scored 2/10, which
// was not the brief_parsing prompt's fault — it was a data extraction bug.
describe('SCORE-BP1: Brief section extraction with parsedBrief', () => {
  it('includes parsedBrief fields in Brief section when parsedBrief is present', async () => {
    const capturedPrompts: string[] = []

    mockFetch.mockImplementation((_url: string, opts: any) => {
      const body = JSON.parse(opts.body)
      if (body.messages) {
        capturedPrompts.push(...body.messages.map((m: any) => m.content as string))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: JSON.stringify({
            criteria_scores: [],
            overall_score: 7,
            overall_reasons: ['good'],
            code_change_recommendations: [],
            source_attributions: [],
          }) } }],
        }),
      })
    })

    const parsedBrief = {
      project_id: 'test-cgm',
      product_description: 'A disposable CGM patch for continuous glucose monitoring.',
      mission_statement: 'Enable real-time glucose tracking for diabetic patients.',
      target_customers: 'Type 1 diabetics seeking non-invasive monitoring.',
      why_now: 'FDA cleared comparable devices in 2025, opening market window.',
      confidence: 'HIGH' as const,
      missing_mandatory_fields: ['operating_environment.max_temperature_c'],
      constraints: {
        unit_cost_ceiling: { value: 15.00, currency: 'GBP' as const, source: 'user' as const },
        max_mass_kg: { value: 0.05, source: 'user' as const },
        max_dimensions_mm: { length_mm: 40, width_mm: 30, depth_mm: 5, source: 'user' as const },
        target_performance: { metric: 'MARD', value: '10%', source: 'inferred' as const },
        target_process: { value: 'roll-to-roll screen printing', source: 'inferred' as const },
        target_material: { value: 'medical-grade adhesive', source: 'inferred' as const },
        batch_size: { value: 100000, source: 'inferred' as const },
        design_life: { value: '14 days', source: 'user' as const },
        operating_environment: {
          min_temperature_c: 10,
          max_temperature_c: 40,
          max_humidity_pct: 95,
          ingress_protection: 'IP22',
          source: 'inferred' as const,
        },
        safety_standards: [
          { code: 'ISO 13485', name: 'Medical devices QMS', source_grade: 'A' as const },
          { code: 'IEC 60601-1', name: 'Medical electrical equipment', source_grade: 'A' as const },
        ],
        additional_constraints: [
          { name: 'biocompatibility', value: 'ISO 10993', source: 'inferred' as const },
        ],
      },
    }

    // State with parsedBrief but sparse designBrief (mirrors what brief_parsing produces)
    const state = makeState({
      parsedBrief,
      research: {
        report: '',
        sources: [],
        designBrief: {
          useCase: parsedBrief.product_description,
          constraints: { unitCostCeilingGbp: 15.00, maxMassKg: 0.05 },
        },
      } as any,
    } as any)

    await runCouncilScoring(state)

    // Check that the Brief judge prompt contains parsedBrief fields, not just empty designBrief fields
    const briefPrompts = capturedPrompts.filter(p => p.includes('product_description'))
    expect(briefPrompts.length).toBeGreaterThan(0)

    const briefPrompt = briefPrompts[0]
    // Should contain rich StructuredBriefJSON fields
    expect(briefPrompt).toContain('product_description')
    expect(briefPrompt).toContain('mission_statement')
    expect(briefPrompt).toContain('target_customers')
    expect(briefPrompt).toContain('why_now')
    expect(briefPrompt).toContain('source_grade')
    expect(briefPrompt).toContain('ISO 13485')
    expect(briefPrompt).toContain('IEC 60601-1')
    expect(briefPrompt).toContain('missing_mandatory_fields')
    expect(briefPrompt).toContain('CGM patch') // product_description content
    // Should NOT use the empty designBrief Mission/Process/Material proxy fields
    expect(briefPrompt).not.toContain('Mission: \nUse Case:')
  })

  it('falls back to designBrief when parsedBrief is absent (legacy path)', async () => {
    const capturedPrompts: string[] = []

    mockFetch.mockImplementation((_url: string, opts: any) => {
      const body = JSON.parse(opts.body)
      if (body.messages) {
        capturedPrompts.push(...body.messages.map((m: any) => m.content as string))
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: JSON.stringify({
            criteria_scores: [],
            overall_score: 6,
            overall_reasons: ['ok'],
            code_change_recommendations: [],
            source_attributions: [],
          }) } }],
        }),
      })
    })

    // State WITHOUT parsedBrief (legacy path) but WITH designBrief
    const state = makeState({
      research: {
        report: 'Legacy research report text with content here.',
        sources: [],
        designBrief: {
          mission: 'Build a heat pump',
          useCase: 'Residential heating',
          targetCustomers: 'UK homeowners',
          whyNow: 'Net zero',
          targetProcess: 'CNC',
          targetMaterial: 'Copper',
          toleranceTarget: '±0.1mm',
          quantityTarget: '1000',
          complianceNotes: 'BS EN 378',
          constraints: { unitCostCeilingGbp: 5000, maxMassKg: 80 },
        },
      } as any,
    })
    // Ensure parsedBrief is absent
    delete (state as any).parsedBrief

    await runCouncilScoring(state)

    // Brief prompt should use legacy designBrief fields
    const briefPrompts = capturedPrompts.filter(p => p.includes('Use Case:'))
    expect(briefPrompts.length).toBeGreaterThan(0)
    expect(briefPrompts[0]).toContain('Mission:')
    expect(briefPrompts[0]).toContain('Use Case:')
    expect(briefPrompts[0]).toContain('Residential heating')
  })
})
