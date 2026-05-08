/**
 * @file index.test.ts — Phase F + Phase H orchestrator integration tests
 *
 * Verifies that the PA path wiring in index.ts:
 *   - Never calls runPolish() on PA path (any reportType)
 *   - Skips runReview() on FEASIBILITY_EXCEPTION and BRIEF_INCOMPLETE paths
 *   - Skips runCouncilScoring() on FEASIBILITY_EXCEPTION and BRIEF_INCOMPLETE paths
 *   - Runs runReview() and runCouncilScoring() on FULL_REPORT PA path
 *   - Legacy path (PA_PIPELINE=false): runPolish, runReview, runCouncilScoring all run
 *
 * Phase H update: PA_PIPELINE is now a RUNTIME GETTER (not a load-time constant),
 * so the jest.isolateModules workaround is no longer needed. Tests can set
 * process.env.PA_PIPELINE directly in beforeEach/afterEach. The runWithMocks helper
 * still calls jest.isolateModulesAsync to get fresh mock registrations per test group,
 * but the env var is now the only mechanism needed to control the pipeline path.
 *
 * Phase H default: PA_PIPELINE defaults to 'true' (PA path is now the default).
 * Tests must set PA_PIPELINE='false' explicitly to test the legacy path.
 */

// Silence noisy pipeline logs in test output
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterAll(() => {
  jest.restoreAllMocks()
})

// ── Mock payload helpers ──────────────────────────────────────────────────

const okResult = (data: unknown = {}) => ({ ok: true, data, durationMs: 1 })

function makeBriefParsingResult(overrides: Record<string, unknown> = {}) {
  return okResult({
    project_id: 'test',
    product_description: 'test', mission_statement: 'test',
    target_customers: 'test', why_now: 'test',
    constraints: {
      unit_cost_ceiling: { value: 180000, currency: 'GBP', source: 'user' },
      max_mass_kg: { value: 28000, source: 'user' },
      max_dimensions_mm: { w: 12192, d: 2438, h: 2896, source: 'user' },
      target_performance: { key_metric: 'energy', value: 3.5, unit: 'MWh', source: 'user' },
      target_process: { value: null, source: 'inferred' },
      target_material: { value: 'LFP', source: 'user' },
      batch_size: { value: 25, source: 'user' },
      design_life: { value: '15 years', source: 'user' },
      operating_environment: { temp_min_c: -20, temp_max_c: 50, source: 'user' },
      safety_standards: [], additional_constraints: [],
    },
    missing_mandatory_fields: [],
    confidence: 'HIGH',
    ...overrides,
  })
}

function makeThinBriefParsingResult() {
  return okResult({
    project_id: 'thin_001',
    product_description: 'A product', mission_statement: 'Build something',
    target_customers: 'Unknown', why_now: 'Unknown',
    constraints: {
      unit_cost_ceiling: { value: null, currency: 'GBP', source: 'inferred' },
      max_mass_kg: { value: null, source: 'inferred' },
      max_dimensions_mm: { w: null, d: null, h: null, source: 'inferred' },
      target_performance: { key_metric: null, value: null, unit: null, source: 'inferred' },
      target_process: { value: null, source: 'inferred' },
      target_material: { value: null, source: 'inferred' },
      batch_size: { value: null, source: 'inferred' },
      design_life: { value: null, source: 'inferred' },
      operating_environment: { temp_min_c: null, temp_max_c: null, source: 'inferred' },
      safety_standards: [], additional_constraints: [],
    },
    // >5 missing → BRIEF_INCOMPLETE
    missing_mandatory_fields: ['unit_cost_ceiling', 'max_mass_kg', 'max_dimensions_mm', 'target_performance', 'batch_size', 'design_life', 'target_customers'],
    confidence: 'LOW',
  })
}

function makeFailFeasibilityResult(blockers: string[]) {
  return {
    status: 'RED',
    reason: blockers.join('; '),
    blockers,
    warnings: [],
    canGenerateFullReport: false,
    allowedSections: [],
    forbiddenSections: [],
    decisionPageData: {
      verdict: 'REBRIEF', biggestBlocker: blockers[0] ?? '',
      missingInputs: [], commercialWarning: '', engineeringWarning: '',
      nextActions: [],
    },
    compactBanner: `INFEASIBLE — ${blockers[0]}`,
  }
}

function makePassFeasibilityResult() {
  return {
    status: 'GREEN',
    reason: 'All checks passed',
    blockers: [], warnings: [],
    canGenerateFullReport: true,
    allowedSections: [], forbiddenSections: [],
    decisionPageData: {
      verdict: 'PROCEED', biggestBlocker: '', missingInputs: [],
      commercialWarning: '', engineeringWarning: '', nextActions: [],
    },
    compactBanner: 'FEASIBLE — all gates pass',
  }
}

const BESS_BRIEF = 'BESS 3.5 MWh battery energy storage system £180,000 cost ceiling 28,000 kg mass limit 40ft ISO container'

// ── Shared mock factory ───────────────────────────────────────────────────

/**
 * Run a pipeline invocation with mocked dependencies.
 *
 * Phase H update: PA_PIPELINE is now a runtime getter, so we no longer need
 * jest.isolateModules to control the pipeline path. We still use
 * jest.isolateModulesAsync to get fresh mock registrations per test group
 * (preventing mock state leaking between groups), but the env var is now
 * the sole control mechanism.
 *
 * Returns an object with the mock spy references so callers can assert on them.
 */
async function runWithMocks({
  paPipeline,
  feasibilityResult = makePassFeasibilityResult(),
  briefParsingResult = makeBriefParsingResult(),
}: {
  paPipeline: boolean
  feasibilityResult?: ReturnType<typeof makePassFeasibilityResult>
  briefParsingResult?: ReturnType<typeof makeBriefParsingResult>
}) {
  // Shared spy references — populated inside isolateModules
  let runPolishSpy!: jest.Mock
  let runReviewSpy!: jest.Mock
  let runCouncilScoringSpy!: jest.Mock
  let runPipeline!: (brief: string) => Promise<unknown>

  // Phase H: PA_PIPELINE is a runtime getter — set env directly (no module reload needed)
  const originalEnv = process.env.PA_PIPELINE
  if (paPipeline) {
    // Default is now true, so either set to 'true' or leave unset (both work)
    process.env.PA_PIPELINE = 'true'
  } else {
    // Legacy path: must explicitly set to 'false' since default is now 'true'
    process.env.PA_PIPELINE = 'false'
  }

  await jest.isolateModulesAsync(async () => {
    // Build fresh spies
    runPolishSpy = jest.fn(() => okResult({ modules: [] }))
    runReviewSpy = jest.fn(() => okResult({ reviews: [], proofreadFindings: null }))
    runCouncilScoringSpy = jest.fn(() => okResult([]))

    // Register all mocks within the isolateModules scope
    jest.doMock('./stages/0-training-data', () => ({
      runTrainingDataDump: jest.fn(() => okResult({ dossier: '' })),
    }))
    jest.doMock('./stages/0-brief-generation', () => ({
      runBriefGeneration: jest.fn(() => okResult({
        briefText: 'brief',
        fields: {
          projectName: 'test', purpose: 'test', objectives: ['obj'],
          requirements: [], constraints: [], inScope: '', outOfScope: [],
          successCriteria: [], costCeiling: null, maxMass: null,
          productionVolume: null, jurisdiction: null, envelope: null,
          operatingTemp: null, standards: [],
        },
      })),
      runBriefParsing: jest.fn(() => Promise.resolve(briefParsingResult)),
    }))
    jest.doMock('./stages/1-research', () => ({
      runResearch: jest.fn(() => okResult({ report: 'report', sources: [], designBrief: null })),
      runResearchSynthesis: jest.fn(() => okResult({
        market_context: 'context', why_now: 'why',
        competitors: [], research_sources: [],
        source_grade_overall: 'E', claims_requiring_verification: [],
      })),
      extractResearchConstraints: jest.fn(() => ({
        benchmarkPrices: [], materialCosts: [], regulatoryCosts: [], competitorSpecs: [],
      })),
    }))
    jest.doMock('./stages/1b-regulatory', () => ({
      runRegulatoryExtraction: jest.fn(() => okResult({ regulatory_entries: [] })),
    }))
    jest.doMock('./stages/2-decompose', () => ({
      runDecompose: jest.fn(() => okResult([{
        id: 'm1', name: 'Module 1', purpose: 'test', inputs: [], outputs: [],
        keyParts: [], leadWeeks: 4, description: 'desc', whyItMatters: 'why',
        failureModes: [], unknowns: [], status: 'active',
      }])),
      runDecomposePA: jest.fn(() => okResult([{
        id: 'm1', name: 'Module 1', purpose: 'test', inputs: [], outputs: [],
        keyParts: [], leadWeeks: 4, description: 'desc', whyItMatters: 'why',
        failureModes: [], unknowns: [], status: 'active',
        expected_parts: [], interfaces: [], failure_modes: [], open_questions: [],
        estimated_mass_kg: null, estimated_dimensions_mm: null,
        estimated_lead_time_weeks: 4, maturity: 'CONCEPTUAL',
      }])),
    }))
    jest.doMock('./stages/3-size-layout', () => ({
      runSizeLayout: jest.fn(() => okResult({
        feasible: true, rules_domain: 'test', envelope: {
          kind: 'iso_container_40ft', label: '40ft ISO',
          interior_w_mm: 12000, interior_d_mm: 2300, interior_h_mm: 2600,
          interior_floor_m2: 27, interior_volume_m3: 70.2,
        },
        target: {}, floor_budget_m2: 27, module_dimensions: {},
        conflicts: [], recommendations: [],
      })),
    }))
    jest.doMock('./stages/4-bom-cost', () => ({
      runBomCost: jest.fn(() => okResult({
        parts: [], bomLines: [],
        costBreakdown: { unitTotalGbp: 150000, ceilingGbp: 180000, perModule: [], overheadMultiplier: 1.5, nreTotalGbp: 0 },
      })),
    }))
    jest.doMock('./stages/4-bom-cost-suppliers', () => ({
      runBomCostSuppliers: jest.fn(() => ({ ok: false, error: 'not used', durationMs: 0 })),
    }))
    jest.doMock('./stages/5-suppliers', () => ({
      runSuppliers: jest.fn(() => okResult([])),
    }))
    jest.doMock('./stages/6-review', () => ({
      runReview: runReviewSpy,
    }))
    jest.doMock('./stages/7-polish', () => ({
      runPolish: runPolishSpy,
    }))
    jest.doMock('./stages/7-pdf', () => ({ default: () => null }))
    jest.doMock('./stages/7-pdf-v3', () => ({ default: () => null }))
    jest.doMock('@react-pdf/renderer', () => ({
      pdf: () => ({ toBlob: async () => new Blob(['%PDF']) }),
      Document: () => null, Page: () => null, View: () => null, Text: () => null,
    }))
    jest.doMock('react', () => ({ createElement: jest.fn(() => null) }))
    jest.doMock('./council-scorer', () => ({
      runCouncilScoring: runCouncilScoringSpy,
    }))
    jest.doMock('./validators', () => ({
      runAllGates: jest.fn(() => []),
    }))
    jest.doMock('./scorer', () => ({
      scoreAllSections: jest.fn(() => []),
    }))
    jest.doMock('./score-rubric', () => ({
      scoreReport: jest.fn(() => ({
        overallScore: 85, briefScore: 80, regulatoryScore: 80,
        modulesScore: 85, bomScore: 80, costScore: 85, risksScore: 80,
      })),
      computeCompoundScore: jest.fn(() => ({
        compound: 85, rubric: 85, councilAvg: null,
        councilScored: 0, councilFailed: 0, formulaVersion: 'f7',
      })),
    }))
    jest.doMock('./lib/scoring-history', () => ({
      recordScoringRun: jest.fn(), deriveBriefLabel: jest.fn(() => 'test'),
    }))
    jest.doMock('./lib/r290-safety', () => ({
      validateR290Safety: jest.fn(() => []),
    }))
    jest.doMock('./lib/cost-constraints', () => ({
      validateCosts: jest.fn(() => []),
    }))
    jest.doMock('./product-classifier', () => ({
      classifyProduct: jest.fn(() => ({
        productClass: 'battery_energy_storage', confidence: 'HIGH',
        technologyDomains: ['energy_storage'], hazardDomains: ['electrical'],
        manufacturingArchetype: 'container_assembly',
      })),
      getRequiredFields: jest.fn(() => []),
    }))
    jest.doMock('./lib/required-parts-manifest', () => ({
      checkRequiredParts: jest.fn(() => ({ missing: [] })),
    }))
    jest.doMock('./brief-validator', () => ({
      validateBrief: jest.fn(() => ({
        isValid: true, missingRequired: [], blockedReasons: [], warnings: [],
      })),
    }))
    jest.doMock('./feasibility-gate', () => ({
      determineFeasibility: jest.fn(() => feasibilityResult),
    }))
    jest.doMock('./db-queries', () => ({
      loadAllGroundingData: jest.fn(() => ({
        materials: [], processes: [], standards: [], totalRecords: 0,
      })),
    }))
    jest.doMock('./lib/spec-extraction', () => ({
      extractSpecs: jest.fn(() => ({})), summariseSpecs: jest.fn(() => 'none'),
    }))
    jest.doMock('./lib/industry-domain', () => ({
      mapProductClassToIndustryDomain: jest.fn(() => 'battery_energy_storage'),
    }))
    jest.doMock('./stages/3.5-brief-revision', () => ({
      runBriefRevision: jest.fn(() => okResult({ hasRevisions: false, changes: [] })),
    }))
    jest.doMock('./universal-scorer', () => ({
      scoreSection: jest.fn(() => ({ score: 8, reasons: [], suggestions: [] })),
    }))

    // Load the orchestrator AFTER mocks
    const { runPipeline: rp } = await import('./index')
    runPipeline = rp
  })

  // Phase H: Run the pipeline BEFORE restoring env, because PA_PIPELINE is now a
  // runtime getter that reads process.env at call time. If we restored env first
  // and then called runPipeline, the getter would see the restored value (default=true)
  // instead of the test's intended value (e.g. 'false' for legacy-path tests).
  await runPipeline(BESS_BRIEF)

  // Now restore env to original value
  if (originalEnv !== undefined) {
    process.env.PA_PIPELINE = originalEnv
  } else {
    // Restoring to unset means PA path is active (default) — correct
    delete process.env.PA_PIPELINE
  }

  return { runPolishSpy, runReviewSpy, runCouncilScoringSpy }
}

// ── Phase F integration tests ─────────────────────────────────────────────

describe('runPipeline — Phase F PA wiring (PA_PIPELINE=true)', () => {

  // ── FULL_REPORT path ──────────────────────────────────────────────────

  describe('FULL_REPORT route (GREEN feasibility)', () => {
    let spies: Awaited<ReturnType<typeof runWithMocks>>

    beforeAll(async () => {
      spies = await runWithMocks({
        paPipeline: true,
        feasibilityResult: makePassFeasibilityResult(),
        briefParsingResult: makeBriefParsingResult(),
      })
    })

    it('runs runReview() on FULL_REPORT PA path', () => {
      expect(spies.runReviewSpy).toHaveBeenCalled()
    })

    it('runs runCouncilScoring() on FULL_REPORT PA path', () => {
      expect(spies.runCouncilScoringSpy).toHaveBeenCalled()
    })

    it('NEVER calls runPolish() on PA path', () => {
      expect(spies.runPolishSpy).not.toHaveBeenCalled()
    })
  })

  // ── FEASIBILITY_EXCEPTION path (2+ blockers) ──────────────────────────

  describe('FEASIBILITY_EXCEPTION route (2+ blockers)', () => {
    let spies: Awaited<ReturnType<typeof runWithMocks>>

    beforeAll(async () => {
      spies = await runWithMocks({
        paPipeline: true,
        feasibilityResult: makeFailFeasibilityResult([
          'Cost check failed — £220,000 > £180,000 ceiling',
          'Sizing infeasible — modules do not fit in envelope',
        ]),
        briefParsingResult: makeBriefParsingResult(),
      })
    })

    it('does NOT call runReview() on FEASIBILITY_EXCEPTION', () => {
      expect(spies.runReviewSpy).not.toHaveBeenCalled()
    })

    it('does NOT call runCouncilScoring() on FEASIBILITY_EXCEPTION', () => {
      expect(spies.runCouncilScoringSpy).not.toHaveBeenCalled()
    })

    it('NEVER calls runPolish() on PA path', () => {
      expect(spies.runPolishSpy).not.toHaveBeenCalled()
    })
  })

  // ── BRIEF_INCOMPLETE path (LOW confidence + >5 missing fields) ────────

  describe('BRIEF_INCOMPLETE route (LOW confidence + 7 missing fields)', () => {
    let spies: Awaited<ReturnType<typeof runWithMocks>>

    beforeAll(async () => {
      spies = await runWithMocks({
        paPipeline: true,
        feasibilityResult: makePassFeasibilityResult(),  // GREEN feasibility
        briefParsingResult: makeThinBriefParsingResult(),   // but thin brief → BRIEF_INCOMPLETE via router
      })
    })

    it('does NOT call runReview() on BRIEF_INCOMPLETE', () => {
      expect(spies.runReviewSpy).not.toHaveBeenCalled()
    })

    it('does NOT call runCouncilScoring() on BRIEF_INCOMPLETE', () => {
      expect(spies.runCouncilScoringSpy).not.toHaveBeenCalled()
    })

    it('NEVER calls runPolish() on PA path', () => {
      expect(spies.runPolishSpy).not.toHaveBeenCalled()
    })
  })

})

// ── Legacy path (PA_PIPELINE=false) ──────────────────────────────────────

describe('runPipeline — Phase F legacy path (PA_PIPELINE=false)', () => {
  let spies: Awaited<ReturnType<typeof runWithMocks>>

  beforeAll(async () => {
    spies = await runWithMocks({
      paPipeline: false,
      feasibilityResult: makePassFeasibilityResult(),
    })
  })

  it('calls runPolish() on legacy path', () => {
    expect(spies.runPolishSpy).toHaveBeenCalled()
  })

  it('calls runReview() on legacy path', () => {
    expect(spies.runReviewSpy).toHaveBeenCalled()
  })

  it('calls runCouncilScoring() on legacy path', () => {
    expect(spies.runCouncilScoringSpy).toHaveBeenCalled()
  })
})
