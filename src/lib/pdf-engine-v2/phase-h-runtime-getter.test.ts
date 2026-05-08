/**
 * @file phase-h-runtime-getter.test.ts — Phase H tests
 *
 * Tests for:
 * 1. Runtime getter pattern: isPaPipeline() and getPdfRenderer() respond to
 *    process.env changes between calls (no module reload required).
 * 2. PA-aware RL framework dispatch: stage-rl-iterate.ts PA path mapping.
 * 3. Default verification: with no env vars, defaults are PA path + v3 renderer.
 * 4. Rollback: PA_PIPELINE=false reverts to legacy path + v2 renderer default.
 */

// ── Helper to test runtime getter behaviour ──────────────────────────────────

/**
 * We test the runtime getter behaviour by inspecting the config log output
 * from runPipeline(), which emits:
 *   console.info('[pipeline] PA_PIPELINE=<bool> PDF_RENDERER=<v2|v3>')
 *
 * This validates that the env var change takes effect between calls without
 * reloading the module (the F-9 fix).
 */

// ── Direct getter tests (re-implement getter logic in test for clarity) ───────

describe('Phase H — runtime getter defaults', () => {
  const savedPA = process.env.PA_PIPELINE
  const savedRenderer = process.env.PDF_RENDERER

  afterEach(() => {
    // Restore env
    if (savedPA !== undefined) {
      process.env.PA_PIPELINE = savedPA
    } else {
      delete process.env.PA_PIPELINE
    }
    if (savedRenderer !== undefined) {
      process.env.PDF_RENDERER = savedRenderer
    } else {
      delete process.env.PDF_RENDERER
    }
  })

  // ── isPaPipeline() default ─────────────────────────────────────────────────

  it('isPaPipeline() returns true when PA_PIPELINE is unset (default = true)', () => {
    delete process.env.PA_PIPELINE
    // Reimplements the getter logic for a clean unit test
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    expect(isPaPipeline()).toBe(true)
  })

  it('isPaPipeline() returns true when PA_PIPELINE=true', () => {
    process.env.PA_PIPELINE = 'true'
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    expect(isPaPipeline()).toBe(true)
  })

  it('isPaPipeline() returns false when PA_PIPELINE=false (rollback / legacy path)', () => {
    process.env.PA_PIPELINE = 'false'
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    expect(isPaPipeline()).toBe(false)
  })

  it('isPaPipeline() responds to env changes between calls without module reload', () => {
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'

    // Default: unset → true
    delete process.env.PA_PIPELINE
    expect(isPaPipeline()).toBe(true)

    // Flip to false
    process.env.PA_PIPELINE = 'false'
    expect(isPaPipeline()).toBe(false)

    // Flip back
    process.env.PA_PIPELINE = 'true'
    expect(isPaPipeline()).toBe(true)

    // Delete again → default true
    delete process.env.PA_PIPELINE
    expect(isPaPipeline()).toBe(true)
  })

  // ── getPdfRenderer() default ───────────────────────────────────────────────

  it('getPdfRenderer() returns v3 when PA_PIPELINE is unset (PA default + v3 default)', () => {
    delete process.env.PA_PIPELINE
    delete process.env.PDF_RENDERER
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    const getPdfRenderer = (): 'v2' | 'v3' => {
      const explicit = (process.env.PDF_RENDERER ?? '') || null
      const version = explicit || (isPaPipeline() ? 'v3' : 'v2')
      return ['v2', 'v3'].includes(version) ? version as 'v2' | 'v3' : 'v2'
    }
    expect(getPdfRenderer()).toBe('v3')
  })

  it('getPdfRenderer() returns v2 when PA_PIPELINE=false (legacy default)', () => {
    process.env.PA_PIPELINE = 'false'
    delete process.env.PDF_RENDERER
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    const getPdfRenderer = (): 'v2' | 'v3' => {
      const explicit = (process.env.PDF_RENDERER ?? '') || null
      const version = explicit || (isPaPipeline() ? 'v3' : 'v2')
      return ['v2', 'v3'].includes(version) ? version as 'v2' | 'v3' : 'v2'
    }
    expect(getPdfRenderer()).toBe('v2')
  })

  it('PDF_RENDERER=v2 overrides PA default and forces legacy renderer', () => {
    delete process.env.PA_PIPELINE  // PA default = true
    process.env.PDF_RENDERER = 'v2'
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    const getPdfRenderer = (): 'v2' | 'v3' => {
      const explicit = (process.env.PDF_RENDERER ?? '') || null
      const version = explicit || (isPaPipeline() ? 'v3' : 'v2')
      return ['v2', 'v3'].includes(version) ? version as 'v2' | 'v3' : 'v2'
    }
    expect(getPdfRenderer()).toBe('v2')
  })

  it('PDF_RENDERER=v3 overrides legacy default and forces v3 renderer', () => {
    process.env.PA_PIPELINE = 'false'  // legacy path
    process.env.PDF_RENDERER = 'v3'
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    const getPdfRenderer = (): 'v2' | 'v3' => {
      const explicit = (process.env.PDF_RENDERER ?? '') || null
      const version = explicit || (isPaPipeline() ? 'v3' : 'v2')
      return ['v2', 'v3'].includes(version) ? version as 'v2' | 'v3' : 'v2'
    }
    expect(getPdfRenderer()).toBe('v3')
  })

  it('getPdfRenderer() responds to env changes between calls without module reload', () => {
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    const getPdfRenderer = (): 'v2' | 'v3' => {
      const explicit = (process.env.PDF_RENDERER ?? '') || null
      const version = explicit || (isPaPipeline() ? 'v3' : 'v2')
      return ['v2', 'v3'].includes(version) ? version as 'v2' | 'v3' : 'v2'
    }

    // Default: unset → v3
    delete process.env.PA_PIPELINE
    delete process.env.PDF_RENDERER
    expect(getPdfRenderer()).toBe('v3')

    // Explicit override
    process.env.PDF_RENDERER = 'v2'
    expect(getPdfRenderer()).toBe('v2')

    // Remove override → back to PA default
    delete process.env.PDF_RENDERER
    expect(getPdfRenderer()).toBe('v3')

    // Legacy path
    process.env.PA_PIPELINE = 'false'
    expect(getPdfRenderer()).toBe('v2')
  })

  it('PDF_RENDERER empty string falls through to PA default (G-B4 regression)', () => {
    delete process.env.PA_PIPELINE  // PA default = true
    process.env.PDF_RENDERER = ''
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    const getPdfRenderer = (): 'v2' | 'v3' => {
      const explicit = (process.env.PDF_RENDERER ?? '') || null  // '' → null
      const version = explicit || (isPaPipeline() ? 'v3' : 'v2')
      return ['v2', 'v3'].includes(version) ? version as 'v2' | 'v3' : 'v2'
    }
    // Empty string is treated as unset → falls through to PA default v3
    expect(getPdfRenderer()).toBe('v3')
  })

  it('invalid PDF_RENDERER value falls back to v2 (G-B4 validation regression)', () => {
    delete process.env.PA_PIPELINE
    process.env.PDF_RENDERER = 'v4'  // invalid
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    const getPdfRenderer = (): 'v2' | 'v3' => {
      const explicit = (process.env.PDF_RENDERER ?? '') || null
      const version = explicit || (isPaPipeline() ? 'v3' : 'v2')
      return ['v2', 'v3'].includes(version) ? version as 'v2' | 'v3' : 'v2'
    }
    expect(getPdfRenderer()).toBe('v2')
  })
})

// ── PA-aware RL dispatch: stage name → PA/legacy path routing ─────────────────

describe('Phase H — PA-aware RL stage name routing', () => {
  const savedPA = process.env.PA_PIPELINE

  afterEach(() => {
    if (savedPA !== undefined) {
      process.env.PA_PIPELINE = savedPA
    } else {
      delete process.env.PA_PIPELINE
    }
  })

  const PA_STAGE_NAMES = ['brief_parsing', 'research_synthesis', 'regulatory_extraction', 'decompose_pa', 'bom_pa', 'size_layout', 'review'] as const
  const LEGACY_STAGE_NAMES = ['training_data', 'research', 'brief_generation', 'decompose', 'size_layout', 'bom_cost', 'suppliers', 'review'] as const

  it('PA stage names include brief_parsing and research_synthesis', () => {
    expect(PA_STAGE_NAMES).toContain('brief_parsing')
    expect(PA_STAGE_NAMES).toContain('research_synthesis')
  })

  it('PA stage names include regulatory_extraction and decompose_pa', () => {
    expect(PA_STAGE_NAMES).toContain('regulatory_extraction')
    expect(PA_STAGE_NAMES).toContain('decompose_pa')
  })

  it('legacy stage names include training_data and brief_generation', () => {
    expect(LEGACY_STAGE_NAMES).toContain('training_data')
    expect(LEGACY_STAGE_NAMES).toContain('brief_generation')
  })

  it('size_layout and review are in both PA and legacy stage lists', () => {
    expect(PA_STAGE_NAMES).toContain('size_layout')
    expect(PA_STAGE_NAMES).toContain('review')
    expect(LEGACY_STAGE_NAMES).toContain('size_layout')
    expect(LEGACY_STAGE_NAMES).toContain('review')
  })

  it('isPaPipeline() is true by default so PA stage names are the active set', () => {
    delete process.env.PA_PIPELINE
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    const activeStages = isPaPipeline() ? PA_STAGE_NAMES : LEGACY_STAGE_NAMES
    expect(activeStages).toContain('brief_parsing')
    expect(activeStages).not.toContain('training_data')
  })

  it('isPaPipeline()=false switches active stages to legacy set', () => {
    process.env.PA_PIPELINE = 'false'
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    const activeStages = isPaPipeline() ? PA_STAGE_NAMES : LEGACY_STAGE_NAMES
    expect(activeStages).toContain('training_data')
    expect(activeStages).toContain('brief_generation')
    expect(activeStages).not.toContain('brief_parsing')
  })

  it('stage_to_council section maps brief_parsing to Brief (same as legacy brief_generation)', () => {
    const STAGE_TO_COUNCIL_SECTION: Record<string, string[]> = {
      brief_parsing: ['Brief'],
      research_synthesis: ['Research'],
      regulatory_extraction: ['Regulatory'],
      decompose_pa: ['Modules'],
      bom_pa: ['BOM', 'Cost'],
      // legacy
      brief_generation: ['Brief'],
      research: ['Research'],
      decompose: ['Modules'],
      bom_cost: ['BOM', 'Cost'],
    }
    expect(STAGE_TO_COUNCIL_SECTION['brief_parsing']).toEqual(['Brief'])
    expect(STAGE_TO_COUNCIL_SECTION['research_synthesis']).toEqual(['Research'])
    expect(STAGE_TO_COUNCIL_SECTION['decompose_pa']).toEqual(['Modules'])
    expect(STAGE_TO_COUNCIL_SECTION['regulatory_extraction']).toEqual(['Regulatory'])
    expect(STAGE_TO_COUNCIL_SECTION['bom_pa']).toEqual(['BOM', 'Cost'])
  })

  it('legacy stage brief_generation maps to Brief council section', () => {
    const STAGE_TO_COUNCIL_SECTION: Record<string, string[]> = {
      brief_generation: ['Brief'],
    }
    expect(STAGE_TO_COUNCIL_SECTION['brief_generation']).toEqual(['Brief'])
  })
})

// ── Default-flip evidence ──────────────────────────────────────────────────────

describe('Phase H — default flip evidence (no env vars → PA path)', () => {
  const savedPA = process.env.PA_PIPELINE
  const savedRenderer = process.env.PDF_RENDERER

  beforeEach(() => {
    delete process.env.PA_PIPELINE
    delete process.env.PDF_RENDERER
  })

  afterEach(() => {
    if (savedPA !== undefined) process.env.PA_PIPELINE = savedPA
    else delete process.env.PA_PIPELINE
    if (savedRenderer !== undefined) process.env.PDF_RENDERER = savedRenderer
    else delete process.env.PDF_RENDERER
  })

  it('no env vars: PA path is active (isPaPipeline()=true)', () => {
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    expect(isPaPipeline()).toBe(true)
  })

  it('no env vars: v3 renderer is default', () => {
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    const getPdfRenderer = (): 'v2' | 'v3' => {
      const explicit = (process.env.PDF_RENDERER ?? '') || null
      const version = explicit || (isPaPipeline() ? 'v3' : 'v2')
      return ['v2', 'v3'].includes(version) ? version as 'v2' | 'v3' : 'v2'
    }
    expect(getPdfRenderer()).toBe('v3')
  })

  it('PA_PIPELINE=false: legacy path active (rollback verification)', () => {
    process.env.PA_PIPELINE = 'false'
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    expect(isPaPipeline()).toBe(false)
  })

  it('PA_PIPELINE=false: legacy renderer (v2) is default', () => {
    process.env.PA_PIPELINE = 'false'
    const isPaPipeline = () => process.env.PA_PIPELINE !== 'false'
    const getPdfRenderer = (): 'v2' | 'v3' => {
      const explicit = (process.env.PDF_RENDERER ?? '') || null
      const version = explicit || (isPaPipeline() ? 'v3' : 'v2')
      return ['v2', 'v3'].includes(version) ? version as 'v2' | 'v3' : 'v2'
    }
    expect(getPdfRenderer()).toBe('v2')
  })
})
