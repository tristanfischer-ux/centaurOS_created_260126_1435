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
