/**
 * @file council-blocker-3-4.test.ts — Phase C council BLOCKER-3 + BLOCKER-4 fixes
 *
 * BLOCKER-3: PA_PIPELINE=true && !state.parsedBrief must throw a clear error
 * rather than silently falling through to legacy runDecompose with undefined dossier.
 *
 * BLOCKER-4: legacy stages gated by `if (!PA_PIPELINE)` must emit a skip
 * telemetry record on the PA path so the dashboard shows "skipped — superseded
 * by PA Stage X" instead of "never ran".
 *
 * Design note: index.ts cannot be imported by Jest directly (ESM boundary via
 * @react-pdf/renderer). Tests replicate the exact gate patterns from index.ts
 * and verify the fix behaviour in isolation — the same approach used throughout
 * the pdf-engine-v2 test suite.
 */

// ── BLOCKER-3 — PA_PIPELINE=true && !parsedBrief must throw ──────────────────

describe('BLOCKER-3 — PA_PIPELINE=true + !parsedBrief guard', () => {
  /**
   * Replicates the BLOCKER-3 guard added to index.ts before the Research stage:
   *
   *   if (PA_PIPELINE && !state.parsedBrief) {
   *     throw new Error('PA_PIPELINE=true but Brief Parsing failed ...')
   *   }
   */
  function runBlocker3Guard(paPipeline: boolean, parsedBrief: unknown | null): void {
    if (paPipeline && !parsedBrief) {
      throw new Error(
        'PA_PIPELINE=true but Brief Parsing failed to populate state.parsedBrief — ' +
        'pipeline cannot continue safely. Check Brief Parsing stage logs for the root cause.'
      )
    }
  }

  it('throws when PA_PIPELINE=true and parsedBrief is null (Brief Parsing errored)', () => {
    expect(() => runBlocker3Guard(true, null)).toThrow(
      'PA_PIPELINE=true but Brief Parsing failed to populate state.parsedBrief'
    )
  })

  it('throws when PA_PIPELINE=true and parsedBrief is undefined', () => {
    expect(() => runBlocker3Guard(true, undefined)).toThrow(
      'PA_PIPELINE=true but Brief Parsing failed to populate state.parsedBrief'
    )
  })

  it('does NOT throw when PA_PIPELINE=true and parsedBrief is populated', () => {
    const fakeParsedBrief = { project_id: 'test', confidence: 'HIGH' }
    expect(() => runBlocker3Guard(true, fakeParsedBrief)).not.toThrow()
  })

  it('does NOT throw when PA_PIPELINE=false and parsedBrief is null (legacy path)', () => {
    expect(() => runBlocker3Guard(false, null)).not.toThrow()
  })

  it('does NOT throw when PA_PIPELINE=false and parsedBrief is undefined (legacy path)', () => {
    expect(() => runBlocker3Guard(false, undefined)).not.toThrow()
  })
})

// ── BLOCKER-4 — trackSkippedStage emits skip records on PA path ───────────────

describe('BLOCKER-4 — trackSkippedStage emits skip records for legacy stages on PA path', () => {
  /**
   * Replicates the trackSkippedStage helper added to index.ts:
   *
   *   function trackSkippedStage(name: string, reason: string) {
   *     stages.push({ name, ok: true, durationMs: 0, skipped: true, skipReason: reason })
   *     console.log(`[pipeline] ${name}: SKIPPED — ${reason}`)
   *   }
   *
   * And the two call sites:
   *   - Training Data Dump: else branch of `if (!PA_PIPELINE)` block
   *   - Brief Generation: else branch of `if (!PA_PIPELINE)` block
   */

  interface StageRecord {
    name: string
    ok: boolean
    durationMs: number
    skipped?: boolean
    skipReason?: string
  }

  function makeTrackSkippedStage(stages: StageRecord[]) {
    return function trackSkippedStage(name: string, reason: string): void {
      stages.push({ name, ok: true, durationMs: 0, skipped: true, skipReason: reason })
    }
  }

  async function runGateWithSkips(
    paPipeline: boolean,
    stages: StageRecord[]
  ): Promise<void> {
    const trackSkippedStage = makeTrackSkippedStage(stages)

    // ── Training Data Dump gate ────────────────────────────────────────────
    if (!paPipeline) {
      // legacy: would call runTrainingDataDump() and push real stage record
      stages.push({ name: 'training_data', ok: true, durationMs: 10 })
    } else {
      trackSkippedStage(
        'training_data',
        'superseded by PA Stage 1 (Brief Parsing) + PA Stage 3 (Research Synthesis)'
      )
    }

    // ── Brief Generation gate ──────────────────────────────────────────────
    if (!paPipeline) {
      // legacy: would call runBriefGeneration() and push real stage record
      stages.push({ name: 'brief_generation', ok: true, durationMs: 20 })
    } else {
      trackSkippedStage(
        'brief_generation',
        'superseded by PA Stage 1 (Brief Parsing)'
      )
    }
  }

  it('emits skip records for training_data and brief_generation when PA_PIPELINE=true', async () => {
    const stages: StageRecord[] = []
    await runGateWithSkips(true, stages)

    const trainingDataRecord = stages.find(s => s.name === 'training_data')
    const briefGenRecord = stages.find(s => s.name === 'brief_generation')

    expect(trainingDataRecord).toBeDefined()
    expect(trainingDataRecord?.skipped).toBe(true)
    expect(trainingDataRecord?.ok).toBe(true)
    expect(trainingDataRecord?.durationMs).toBe(0)
    expect(trainingDataRecord?.skipReason).toContain('superseded by PA Stage 1')

    expect(briefGenRecord).toBeDefined()
    expect(briefGenRecord?.skipped).toBe(true)
    expect(briefGenRecord?.ok).toBe(true)
    expect(briefGenRecord?.durationMs).toBe(0)
    expect(briefGenRecord?.skipReason).toContain('superseded by PA Stage 1 (Brief Parsing)')
  })

  it('training_data skip reason references both PA Stage 1 and PA Stage 3', async () => {
    const stages: StageRecord[] = []
    await runGateWithSkips(true, stages)
    const record = stages.find(s => s.name === 'training_data')
    expect(record?.skipReason).toContain('PA Stage 3 (Research Synthesis)')
  })

  it('does NOT emit skip records when PA_PIPELINE=false (legacy path)', async () => {
    const stages: StageRecord[] = []
    await runGateWithSkips(false, stages)

    const trainingDataRecord = stages.find(s => s.name === 'training_data')
    const briefGenRecord = stages.find(s => s.name === 'brief_generation')

    // Records exist but are real (not skipped)
    expect(trainingDataRecord?.skipped).toBeUndefined()
    expect(briefGenRecord?.skipped).toBeUndefined()
  })

  it('stage count is 2 for both PA and legacy paths', async () => {
    const paStages: StageRecord[] = []
    const legacyStages: StageRecord[] = []

    await runGateWithSkips(true, paStages)
    await runGateWithSkips(false, legacyStages)

    // Both paths produce exactly 2 stage records (training_data + brief_generation)
    expect(paStages).toHaveLength(2)
    expect(legacyStages).toHaveLength(2)
  })
})

// ── D1 council BLOCKER-D1-3 — Regulatory dual-write guard ───────────────────

describe('[D1-3] Regulatory dual-write force-initialises designBrief when null', () => {
  /**
   * Replicates the D1-3 fix in index.ts:
   *   if (!state.research.designBrief) {
   *     state.research.designBrief = { regulatory: legacyRegulatory } as any
   *   } else {
   *     state.research.designBrief.regulatory = legacyRegulatory
   *   }
   *
   * D1 council BLOCKER-D1-3 fix (5/6 seats: GPT-5.4, Grok, GLM-5.1, Kimi, MiMo):
   * The old guard `if (state.research.designBrief)` silently skipped the write
   * when designBrief was null/undefined. All three downstream consumers saw zero
   * regulatory data. Force-initialise instead.
   */

  function runRegulatoryDualWrite(
    state: { research: any },
    legacyRegulatory: any[]
  ): void {
    if (!state.research.designBrief) {
      state.research.designBrief = { regulatory: legacyRegulatory } as any
    } else {
      state.research.designBrief.regulatory = legacyRegulatory
    }
  }

  const mockRegulatory = [
    { code: 'IEC 62619', name: 'IEC 62619', summary: 'IEC 62619 (UK / EU)', applicability: 'Applies to LFP cells' },
  ]

  it('writes regulatory when designBrief is null (force-initialise path)', () => {
    const state = { research: { designBrief: null as any } }
    runRegulatoryDualWrite(state, mockRegulatory)
    expect(state.research.designBrief).toBeDefined()
    expect(state.research.designBrief.regulatory).toHaveLength(1)
    expect(state.research.designBrief.regulatory[0].code).toBe('IEC 62619')
  })

  it('writes regulatory when designBrief is undefined (force-initialise path)', () => {
    const state = { research: { designBrief: undefined as any } }
    runRegulatoryDualWrite(state, mockRegulatory)
    expect(state.research.designBrief).toBeDefined()
    expect(state.research.designBrief.regulatory).toHaveLength(1)
  })

  it('writes regulatory into existing designBrief without overwriting other fields', () => {
    const state = {
      research: {
        designBrief: {
          useCase: 'Existing use case',
          regulatory: [] as any[],
        },
      },
    }
    runRegulatoryDualWrite(state, mockRegulatory)
    expect(state.research.designBrief.regulatory).toHaveLength(1)
    // Other fields preserved
    expect(state.research.designBrief.useCase).toBe('Existing use case')
  })
})

// ── D1 council BLOCKER-D1-4 — summary != applicability in dual-write ──────────

describe('[D1-4] Regulatory dual-write maps summary to standard_name(jurisdiction), not applicability', () => {
  /**
   * D1 council BLOCKER-D1-4 fix (2/6 seats: GLM-5.1, MiMo):
   * Previously summary: e.applicability — both fields carried identical text.
   * council-scorer.ts reads and displays both independently for scoring signal.
   * Fix: summary = `${e.standard_name} (${e.jurisdiction})` — describes WHAT
   * the regulation is, while applicability retains WHY it applies.
   */

  function buildLegacyRegulatoryEntry(e: {
    standard_name: string
    jurisdiction: string
    applicability: string
    engineering_impact: string
    evidence_required: string
    owner: string
    status: string
    gap_action: string
  }) {
    return {
      code: e.standard_name,
      name: e.standard_name,
      // D1-4 fix: summary is WHAT, applicability is WHY
      summary: `${e.standard_name} (${e.jurisdiction})`,
      status: e.status,
      applicability: e.applicability,
      designImpact: e.engineering_impact,
      evidenceRequired: e.evidence_required,
      ownerRole: e.owner,
      gapAction: e.gap_action,
    }
  }

  const entry = {
    standard_name: 'IEC 62619:2022',
    jurisdiction: 'UK / EU',
    applicability: 'Applies because BESS uses LFP cells exceeding 2 kWh.',
    engineering_impact: 'Requires cell-level abuse testing.',
    evidence_required: 'UKAS-accredited lab report.',
    owner: 'Battery Safety Engineer',
    status: 'not_started',
    gap_action: 'Engage Intertek.',
  }

  it('summary is standard_name + jurisdiction (not applicability)', () => {
    const mapped = buildLegacyRegulatoryEntry(entry)
    expect(mapped.summary).toBe('IEC 62619:2022 (UK / EU)')
    expect(mapped.summary).not.toBe(entry.applicability)
  })

  it('applicability retains the WHY-it-applies text', () => {
    const mapped = buildLegacyRegulatoryEntry(entry)
    expect(mapped.applicability).toBe(entry.applicability)
  })

  it('summary and applicability are distinct values', () => {
    const mapped = buildLegacyRegulatoryEntry(entry)
    expect(mapped.summary).not.toBe(mapped.applicability)
  })
})

// ── D1 council BLOCKER-D1-7 — productClass null guard ─────────────────────────

describe('[D1-7] productClass extracted safely from classification (string or object)', () => {
  /**
   * D1 council BLOCKER-D1-7 fix (2/6 seats: GPT-5.4, MiMo):
   * classification.productClass accessed directly in decompose fork. If
   * classification were a plain string, .productClass is undefined and propagates
   * "undefined" to the LLM prompt. Use a shared helper to extract safely.
   */

  function extractProductClass(classification: string | { productClass?: string }): string {
    return typeof classification === 'string'
      ? classification
      : (classification.productClass ?? 'UNKNOWN')
  }

  it('extracts productClass from a ProductClassification object', () => {
    const classification = { productClass: 'energy_storage', confidence: 0.9 }
    expect(extractProductClass(classification)).toBe('energy_storage')
  })

  it('returns the string directly when classification is a string', () => {
    expect(extractProductClass('medical_device')).toBe('medical_device')
  })

  it('returns UNKNOWN when ProductClassification has no productClass', () => {
    expect(extractProductClass({})).toBe('UNKNOWN')
  })

  it('does NOT produce the string "undefined"', () => {
    const badClassification = {} as any
    const result = extractProductClass(badClassification)
    expect(result).not.toBe('undefined')
  })
})

// ── D1 council BLOCKER-D1-9 — type cast replaced with explicit narrowing ──────

describe('[D1-9] PA decompose result narrowing does not suppress structural divergence', () => {
  /**
   * D1 council BLOCKER-D1-9 fix (3/6 seats: GLM-5.1, Kimi, MiMo):
   * The old cast `paResult as typeof decomposeResult` silenced the compiler for
   * both ok and error branches. The fix uses explicit narrowing — each branch is
   * independently typed so error shapes are not cast to success shapes.
   */

  interface StageResultOk<T> { ok: true; data: T; durationMs: number }
  interface StageResultFail { ok: false; error?: string; durationMs: number }
  type StageResult<T> = StageResultOk<T> | StageResultFail

  type Module = { name: string; purpose: string }
  type ModulePA = Module & { maturity: string; interfaces: any[] }

  function narrowPAResult(
    paResult: StageResult<ModulePA[]>
  ): StageResult<Module[]> {
    // Replicate the D1-9 fix from index.ts
    if (!paResult.ok) {
      return { ok: false, error: paResult.error, durationMs: paResult.durationMs }
    }
    return {
      ok: true,
      data: paResult.data as unknown as Module[],
      durationMs: paResult.durationMs,
    }
  }

  it('ok=false result is preserved without data access', () => {
    const failResult: StageResult<ModulePA[]> = { ok: false, error: 'Stage 5 failed', durationMs: 100 }
    const narrowed = narrowPAResult(failResult)
    expect(narrowed.ok).toBe(false)
    if (!narrowed.ok) {
      expect(narrowed.error).toBe('Stage 5 failed')
    }
  })

  it('ok=true result passes data through as Module[]', () => {
    const successResult: StageResult<ModulePA[]> = {
      ok: true,
      data: [
        { name: 'Battery Rack', purpose: 'Store energy', maturity: 'PRELIMINARY', interfaces: [] },
      ],
      durationMs: 200,
    }
    const narrowed = narrowPAResult(successResult)
    expect(narrowed.ok).toBe(true)
    if (narrowed.ok) {
      expect(narrowed.data[0].name).toBe('Battery Rack')
    }
  })

  it('durationMs is preserved for both ok and error branches', () => {
    const failResult: StageResult<ModulePA[]> = { ok: false, error: 'fail', durationMs: 123 }
    const successResult: StageResult<ModulePA[]> = { ok: true, data: [], durationMs: 456 }

    expect(narrowPAResult(failResult).durationMs).toBe(123)
    expect(narrowPAResult(successResult).durationMs).toBe(456)
  })
})
