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

    // B2 (2026-05-08): MiMo replaced by GPT-5.4.
    // Iter-09 (2026-05-13): Mistral Large replaced by Gemini Flash-Lite (HTTP 400 unreliability).
    // Current 3-judge rotation: Grok 4.3 + GPT-5.4 + Gemini 3.1 Flash-Lite (engine-lineage excluded per SCORE-F9).
    const uniqueModels = [...new Set(modelsSeen)]
    expect(uniqueModels).toContain('x-ai/grok-4.3')
    expect(uniqueModels).toContain('openai/gpt-5.4')
    expect(uniqueModels).toContain('google/gemini-3.1-flash-lite')
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

// ── SCORE-ES1: ExecutiveSummary extraction on PA path ─────────────────────────

/**
 * Tests for SCORE-ES1 (2026-05-09): ExecutiveSummary was a 5-line stub that
 * only read projectId, unitTotalGbp, dimensionSheet.feasible, and module count.
 * On PA path, researchSynthesis + parsedBrief + regulatoryExtraction should be
 * synthesised into a rich multi-section summary.
 */
describe('SCORE-ES1: ExecutiveSummary PA-path extraction', () => {
  /** Helper that captures all judge prompt strings */
  function capturePromptsSetup() {
    const captured: string[] = []
    mockFetch.mockImplementation((_url: string, opts: any) => {
      const body = JSON.parse(opts.body)
      if (body.messages) captured.push(...body.messages.map((m: any) => m.content as string))
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: JSON.stringify({
            criteria_scores: [],
            overall_score: 7,
            overall_reasons: ['ok'],
            code_change_recommendations: [],
            source_attributions: [],
          }) } }],
        }),
      })
    })
    return captured
  }

  it('includes researchSynthesis market_context and competitors when present on PA path', async () => {
    const captured = capturePromptsSetup()

    const state = makeState({
      researchSynthesis: {
        market_context: 'The BESS market is growing at 24% CAGR driven by grid stabilisation demand.',
        why_now: 'IRA incentives made grid-scale BESS economically viable from 2023.',
        competitors: [{ company: 'Tesla Energy', product: 'Megapack 2XL', pricing: '$400/kWh', key_specs: '3.9 MWh', strengths: ['proven'], weaknesses: ['lead time'], differentiation_angle: 'software' }],
        research_sources: [],
        source_grade_overall: 'E',
        claims_requiring_verification: ['CAGR figure needs verification'],
      },
    } as any)

    await runCouncilScoring(state)

    const esPrompts = captured.filter(p => p.includes('MARKET RESEARCH') || p.includes('market_context') || p.includes('BESS market'))
    expect(esPrompts.length).toBeGreaterThan(0)
    expect(esPrompts[0]).toContain('24% CAGR')
    expect(esPrompts[0]).toContain('Tesla Energy')
    expect(esPrompts[0]).toContain('IRA incentives')
  })

  it('includes parsedBrief product_description and mission_statement in ExecutiveSummary', async () => {
    const captured = capturePromptsSetup()

    const state = makeState({
      parsedBrief: {
        project_id: 'bess-test',
        product_description: 'A 3.5 MWh containerised battery energy storage system for grid ancillary services.',
        mission_statement: 'Enable renewable energy grid stabilisation at utility scale.',
        target_customers: 'UK DNOs and independent power producers',
        why_now: 'NESO battery storage contracts opened in Q1 2025.',
        confidence: 'HIGH',
        missing_mandatory_fields: [],
        constraints: {
          unit_cost_ceiling: { value: 350000, currency: 'GBP', source: 'user' },
          max_mass_kg: { value: 20000, source: 'user' },
          max_dimensions_mm: { w: null, d: null, h: null, source: 'inferred' },
          target_performance: { key_metric: null, value: null, unit: null, source: 'inferred' },
          target_process: { value: null, source: 'inferred' },
          target_material: { value: null, source: 'inferred' },
          batch_size: { value: 5, source: 'user' },
          design_life: { value: '15 years', source: 'user' },
          operating_environment: { temp_min_c: -20, temp_max_c: 50, source: 'user' },
          safety_standards: [],
          additional_constraints: [],
        },
      },
      researchSynthesis: {
        market_context: 'Grid storage context.',
        why_now: 'NESO opened.',
        competitors: [],
        research_sources: [],
        source_grade_overall: 'E',
        claims_requiring_verification: [],
      },
    } as any)

    await runCouncilScoring(state)

    const esPrompts = captured.filter(p => p.includes('3.5 MWh') || p.includes('BRIEF'))
    expect(esPrompts.length).toBeGreaterThan(0)
    expect(esPrompts[0]).toContain('3.5 MWh')
    expect(esPrompts[0]).toContain('grid stabilisation')
  })

  it('includes regulatoryExtraction in ExecutiveSummary when present', async () => {
    const captured = capturePromptsSetup()

    const state = makeState({
      researchSynthesis: {
        market_context: 'Market context.',
        why_now: 'Now.',
        competitors: [],
        research_sources: [],
        source_grade_overall: 'E',
        claims_requiring_verification: [],
      },
      regulatoryExtraction: {
        regulatory_entries: [
          { standard_name: 'IEC 62619', version_date: '2022', jurisdiction: 'International', owner: 'Electrical Engineer', status: 'not_started', claim_type: 'requirement', applicability: 'Mandatory for BESS cells', engineering_impact: 'Requires BMS fault isolation within 100ms', evidence_required: 'Type test report IEC 62619:2022', gap_action: 'Commission BMS type test', source_grade: 'C', verification_status: 'UNVERIFIED', verification_note: 'Needs compliance engineer review' },
          { standard_name: 'UL 9540A', version_date: '2023', jurisdiction: 'USA', owner: 'Safety Engineer', status: 'not_started', claim_type: 'requirement', applicability: 'Required for US market', engineering_impact: 'Fire propagation test at module level', evidence_required: 'UL 9540A fire test report', gap_action: 'Budget $150k for UL 9540A test', source_grade: 'C', verification_status: 'UNVERIFIED', verification_note: 'Needs compliance engineer review' },
        ],
      },
    } as any)

    await runCouncilScoring(state)

    const esPrompts = captured.filter(p => p.includes('REGULATORY') || p.includes('IEC 62619') || p.includes('UL 9540A'))
    expect(esPrompts.length).toBeGreaterThan(0)
    expect(esPrompts[0]).toContain('IEC 62619')
    expect(esPrompts[0]).toContain('UL 9540A')
  })
})

// ── SCORE-RK1: Risks extraction on PA path ────────────────────────────────────

describe('SCORE-RK1: Risks PA-path extraction', () => {
  function capturePromptsSetup() {
    const captured: string[] = []
    mockFetch.mockImplementation((_url: string, opts: any) => {
      const body = JSON.parse(opts.body)
      if (body.messages) captured.push(...body.messages.map((m: any) => m.content as string))
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: JSON.stringify({
            criteria_scores: [], overall_score: 7, overall_reasons: ['ok'],
            code_change_recommendations: [], source_attributions: [],
          }) } }],
        }),
      })
    })
    return captured
  }

  it('extracts ModulePA.failure_modes[] as FMEA rows in Risks section', async () => {
    const captured = capturePromptsSetup()

    const state = makeState({
      modules: [{
        id: 'mod-bms',
        name: 'Battery Management System',
        description: 'BMS with cell balancing and fault isolation.',
        purpose: 'Manage cell voltages, temperatures, and SOC',
        keyParts: ['cell balancer IC', 'shunt resistors'],
        failureModes: [],
        riskMatrix: [{
          id: 'R-001',
          hazard: 'Thermal runaway',
          cause: 'Cell overtemperature from external short circuit',
          consequence: 'Fire and toxic gas release',
          existingControls: 'Temperature sensors, cell-level fusing',
          severity: 5,
          likelihood: 2,
          detection: 3,
          mitigation: 'Cell-level temperature cutoff at 60°C + venting channels',
          verificationTest: 'IEC 62619 overtemperature test at module level',
          owner: 'Electrical Engineer',
          residualSeverity: 3,
          residualLikelihood: 1,
          residualDetection: 2,
        }],
        // PA ModulePA fields
        failure_modes: [
          { mode: 'Cell voltage imbalance', cause: 'Degradation mismatch between cells', local_effect: 'Reduced capacity', system_effect: 'Early cycle-life termination' },
          { mode: 'BMS firmware fault', cause: 'Stack overflow in interrupt handler', local_effect: 'BMS reset', system_effect: 'Unprotected cell operation' },
        ],
        open_questions: ['Confirm minimum cell balancing current for 280Ah cells'],
        maturity: 'PRELIMINARY',
      } as any],
    })

    await runCouncilScoring(state)

    // Filter specifically for the Risks section judge prompt, which contains the
    // RISK: / FMEA: keywords AND the section criteria for "Domain-Specific Hazards"
    const riskPrompts = captured.filter(p =>
      (p.includes('Thermal runaway') || p.includes('FMEA:')) &&
      p.includes('Domain-Specific Hazards')
    )
    expect(riskPrompts.length).toBeGreaterThan(0)

    const rp = riskPrompts[0]
    // RiskRow full fields
    expect(rp).toContain('Thermal runaway')
    expect(rp).toContain('Consequence: Fire and toxic gas release')
    expect(rp).toContain('Existing controls: Temperature sensors')
    expect(rp).toContain('Verification test: IEC 62619')
    expect(rp).toContain('Residual: S3xL1xD2')
    // PA failure_modes
    expect(rp).toContain('FMEA: Cell voltage imbalance')
    expect(rp).toContain('System effect: Early cycle-life termination')
    expect(rp).toContain('FMEA: BMS firmware fault')
    // Open questions
    expect(rp).toContain('Open questions: Confirm minimum cell balancing current')
  })

  it('extracts RPN (Severity × Likelihood × Detection) in Risks extraction', async () => {
    const captured = capturePromptsSetup()

    const state = makeState({
      modules: [{
        id: 'mod-1',
        name: 'Power Electronics',
        description: 'DC/AC inverter',
        purpose: 'Convert DC to AC',
        keyParts: ['IGBT modules'],
        failureModes: [],
        riskMatrix: [{
          id: 'R-002',
          hazard: 'IGBT shoot-through',
          cause: 'Gate drive under-voltage',
          consequence: 'Device destruction',
          existingControls: 'UVLO on gate driver',
          severity: 4,
          likelihood: 2,
          detection: 4,
          mitigation: 'Deadtime insertion + DESAT protection',
          verificationTest: 'High-voltage short circuit test IEC 61000-4-5',
          owner: 'Power Electronics Engineer',
        }],
      } as any],
    })

    await runCouncilScoring(state)

    // Filter for Risks section judge prompt specifically (has "Domain-Specific Hazards" criterion)
    const riskPrompts = captured.filter(p =>
      p.includes('IGBT shoot-through') && p.includes('Domain-Specific Hazards')
    )
    expect(riskPrompts.length).toBeGreaterThan(0)
    // RPN = 4 × 2 × 4 = 32
    expect(riskPrompts[0]).toContain('RPN=32')
    expect(riskPrompts[0]).toContain('Detection=4')
  })
})

// ── SCORE-SZ1: Sizing extraction on PA path ───────────────────────────────────

describe('SCORE-SZ1: Sizing PA-path extraction (DimensionSheetPA)', () => {
  function capturePromptsSetup() {
    const captured: string[] = []
    mockFetch.mockImplementation((_url: string, opts: any) => {
      const body = JSON.parse(opts.body)
      if (body.messages) captured.push(...body.messages.map((m: any) => m.content as string))
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: JSON.stringify({
            criteria_scores: [], overall_score: 7, overall_reasons: ['ok'],
            code_change_recommendations: [], source_attributions: [],
          }) } }],
        }),
      })
    })
    return captured
  }

  it('extracts DimensionSheetPA zones, utilisation, and mass margin into Sizing section', async () => {
    const captured = capturePromptsSetup()

    const state = makeState({
      dimensionSheet: {
        feasible: true,
        rules_domain: 'battery_energy_storage',
        envelope: {
          kind: 'iso_20ft_container',
          interior_w_mm: 2352,
          interior_d_mm: 5900,
          interior_h_mm: 2385,
          interior_floor_m2: 13.87,
          interior_volume_m3: 33.08,
          label: '20ft ISO container',
        },
        floor_budget_m2: 13.87,
        module_dimensions: {
          battery_zone: { w_mm: 2352, d_mm: 4500, h_mm: 2000, floor_m2: 10.58, mount: 'floor', scaled_by: 'capacity' },
        },
        conflicts: [],
        recommendations: ['Add 200mm maintenance aisle along east wall'],
        target: {},
        // PA DimensionSheetPA extended fields
        externalDimensionsMm: { w: 2438, d: 6058, h: 2591 },
        internalDimensionsMm: { w: 2352, d: 5900, h: 2385 },
        tareMassKg: 2200,
        availablePayloadMassKg: 17800,
        volumeUtilisationPct: 87,
        massUtilisationPct: 94,
        massMarginNote: 'Mass margin is tight at 6% — verify actual cell module weights with manufacturer',
        clearanceNotes: '600mm maintenance aisle on south wall; cable trays routed overhead on north wall',
        zones: [
          { name: 'Battery Zone', lengthMm: 4500, volumeM3: 22.3, massKg: 14500, contents: '16× CATL 280Ah rack modules, 8 per row' },
          { name: 'BMS/PCS Zone', lengthMm: 1400, volumeM3: 7.84, massKg: 2100, contents: 'BMS cabinet + 250kW PCS inverter + metering' },
        ],
      } as any,
    })

    await runCouncilScoring(state)

    const szPrompts = captured.filter(p => p.includes('iso_20ft_container') || p.includes('Battery Zone') || p.includes('Volume utilisation'))
    expect(szPrompts.length).toBeGreaterThan(0)

    const sp = szPrompts[0]
    expect(sp).toContain('Volume utilisation: 87%')
    expect(sp).toContain('Mass utilisation: 94%')
    expect(sp).toContain('tight at 6%')
    expect(sp).toContain('Battery Zone')
    expect(sp).toContain('CATL 280Ah')
    expect(sp).toContain('BMS/PCS Zone')
    expect(sp).toContain('External envelope: 2438')
    expect(sp).toContain('maintenance aisle on south wall')
  })
})

// ── SCORE-SUP1: Suppliers extraction on PA path ───────────────────────────────

describe('SCORE-SUP1: Suppliers PA-path extraction', () => {
  function capturePromptsSetup() {
    const captured: string[] = []
    mockFetch.mockImplementation((_url: string, opts: any) => {
      const body = JSON.parse(opts.body)
      if (body.messages) captured.push(...body.messages.map((m: any) => m.content as string))
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: JSON.stringify({
            criteria_scores: [], overall_score: 7, overall_reasons: ['ok'],
            code_change_recommendations: [], source_attributions: [],
          }) } }],
        }),
      })
    })
    return captured
  }

  it('uses sectionSuppliers v2 markdown when present (BOM_PIPELINE=v2 path)', async () => {
    const captured = capturePromptsSetup()

    const v2SuppliersMarkdown = `### Battery Enclosure (BE-001)
- **UK Enclosures Ltd** (score: 0.823) — https://ukenclosures.co.uk · GB · verified: process+material
  Custom IP65 steel enclosures for industrial battery systems. EN 1090-2 certified, ±0.5mm laser cut.
- **Rittal GmbH** (score: 0.791) — https://rittal.com · DE · verified: process
  Global cabinet manufacturer with UK distribution. ISO 9001:2015.

### Thermal Management Assembly (TM-002)
> **Fewer than three suppliers matched — needs sourcing review**
- **Aavid Thermalloy** (score: 0.745) — https://aavid.com · US · verified: material
  Specialist heat exchanger fabricator with UK fulfilment.
`

    const state = makeState({
      sectionSuppliers: v2SuppliersMarkdown,
    } as any)

    await runCouncilScoring(state)

    const supPrompts = captured.filter(p => p.includes('UK Enclosures') || p.includes('Rittal') || p.includes('process+material'))
    expect(supPrompts.length).toBeGreaterThan(0)

    const sp = supPrompts[0]
    expect(sp).toContain('UK Enclosures Ltd')
    expect(sp).toContain('process+material')
    expect(sp).toContain('needs sourcing review')
    expect(sp).toContain('Aavid Thermalloy')
    expect(sp).toContain('IP65 steel enclosures')
  })

  it('uses enriched SupplierMatch fields on legacy path (reason, country, processMatch, certifications)', async () => {
    const captured = capturePromptsSetup()

    const state = makeState({
      // No sectionSuppliers → falls back to state.suppliers
      suppliers: [
        {
          partId: 'p-001',
          partName: 'Lithium iron phosphate cells',
          suppliers: [
            {
              name: 'CATL UK Distribution',
              url: 'https://catl.com/uk',
              reason: 'CATL produces LFP cells with 4000-cycle life at C1 rate, shipped from Gigafactory 3.',
              score: 92,
              country: 'GB',
              processMatch: 'process+material',
              certifications: ['IEC 62619', 'UN 38.3'],
              processes: ['LFP cell assembly', 'cell-level formation cycling'],
              domainTags: ['energy_storage', 'lithium_ion'],
            },
          ],
        },
      ],
    })

    await runCouncilScoring(state)

    const supPrompts = captured.filter(p => p.includes('CATL') || p.includes('LFP cells') || p.includes('IEC 62619'))
    expect(supPrompts.length).toBeGreaterThan(0)

    const sp = supPrompts[0]
    expect(sp).toContain('CATL UK Distribution')
    expect(sp).toContain('[verified: process+material]')
    expect(sp).toContain('4000-cycle life')
    expect(sp).toContain('IEC 62619')
    expect(sp).toContain('LFP cell assembly')
  })
})

// ── SCORE-FE1: Feasibility extraction on PA path ──────────────────────────────

describe('SCORE-FE1: Feasibility PA-path extraction', () => {
  function capturePromptsSetup() {
    const captured: string[] = []
    mockFetch.mockImplementation((_url: string, opts: any) => {
      const body = JSON.parse(opts.body)
      if (body.messages) captured.push(...body.messages.map((m: any) => m.content as string))
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: JSON.stringify({
            criteria_scores: [], overall_score: 7, overall_reasons: ['ok'],
            code_change_recommendations: [], source_attributions: [],
          }) } }],
        }),
      })
    })
    return captured
  }

  it('extracts FeasibilityResult warnings, decisionPageData, and compactBanner', async () => {
    const captured = capturePromptsSetup()

    const state = makeState({
      feasibility: {
        status: 'AMBER',
        reason: 'Estimated unit cost £42,000 exceeds ceiling £35,000 by 20%',
        compactBanner: 'FEASIBLE WITH WARNINGS — cost 20% above ceiling',
        canGenerateFullReport: true,
        blockers: [],
        warnings: [
          'Unit cost £42,000 exceeds ceiling £35,000 by 20%',
          'Mass margin is below 5% — tolerance stack-up risk',
        ],
        decisionPageData: {
          verdict: 'PROCEED WITH CAUTION',
          biggestBlocker: 'Cost ceiling exceeded',
          missingInputs: ['Thermal dissipation requirement'],
          commercialWarning: 'Cost 20% above target — value engineering needed',
          engineeringWarning: 'Mass margin < 5%',
          nextActions: ['Value-engineer BOM to reduce cost by £7,000', 'Re-run with revised mass budget'],
        },
        allowedSections: ['cover', 'feasibility', 'brief', 'sizing', 'modules', 'audit'],
        forbiddenSections: [],
        reportType: 'FULL_REPORT',
        reportTypeRouterResult: null,
      } as any,
      parsedBrief: {
        project_id: 'test',
        product_description: 'Test product',
        mission_statement: 'Test mission',
        target_customers: 'Test customers',
        why_now: 'Test why now',
        confidence: 'HIGH',
        missing_mandatory_fields: ['thermal_dissipation_w'],
        constraints: {
          unit_cost_ceiling: { value: 35000, currency: 'GBP', source: 'user' },
          max_mass_kg: { value: 500, source: 'user' },
          max_dimensions_mm: { w: null, d: null, h: null, source: 'inferred' },
          target_performance: { key_metric: null, value: null, unit: null, source: 'inferred' },
          target_process: { value: 'sheet metal fabrication', source: 'inferred' },
          target_material: { value: 'mild steel', source: 'inferred' },
          batch_size: { value: 10, source: 'user' },
          design_life: { value: '20 years', source: 'user' },
          operating_environment: { temp_min_c: -10, temp_max_c: 45, source: 'inferred' },
          safety_standards: [{ standard: 'IEC 62619', source: 'inferred' }],
          additional_constraints: [],
        },
      },
    } as any)

    await runCouncilScoring(state)

    const feasPrompts = captured.filter(p => p.includes('AMBER') || p.includes('FEASIBLE WITH WARNINGS') || p.includes('Biggest blocker'))
    expect(feasPrompts.length).toBeGreaterThan(0)

    const fp = feasPrompts[0]
    expect(fp).toContain('AMBER')
    expect(fp).toContain('FEASIBLE WITH WARNINGS — cost 20% above ceiling')
    expect(fp).toContain('Mass margin is below 5%')
    expect(fp).toContain('PROCEED WITH CAUTION')
    expect(fp).toContain('Biggest blocker: Cost ceiling exceeded')
    expect(fp).toContain('Value-engineer BOM')
    expect(fp).toContain('PA Constraints')
    expect(fp).toContain('35000 GBP')
    expect(fp).toContain('sheet metal fabrication')
    expect(fp).toContain('IEC 62619')
  })
})
