/**
 * @file decompose-pa.test.ts — Phase D1 verification: PA Stage 5 Module Decomposition
 *
 * Tests for validateDecomposeResultPA() and runDecomposePA().
 * Uses mocked fetch — no real LLM calls.
 *
 * Verification criteria from MIGRATION-TRACKER.md Phase D1:
 *   ✅ valid module schema parses correctly
 *   ✅ module with cause='Unknown' rejected
 *   ✅ module without interfaces rejected
 *   ✅ maturity enum enforced
 *   ✅ null estimated_mass_kg rejected
 *   ✅ null estimated_dimensions_mm rejected
 *   ✅ PA prompt is sent (MODULE_DECOMPOSITION_SYSTEM_PA)
 */

import { validateDecomposeResultPA, runDecomposePA } from './2-decompose'
import { MODULE_DECOMPOSITION_SYSTEM_PA } from '../prompts'
import type { StructuredBriefJSON, ModulePA } from '../types'

// ── BESS parsedBrief fixture ──────────────────────────────────────────────────

const BESS_PARSED_BRIEF: StructuredBriefJSON = {
  project_id: 'bess_40ft_lfp_001',
  product_description: 'Containerised 3.5 MWh / 1 MW Battery Energy Storage System using LFP prismatic cells in a 40-foot ISO container.',
  mission_statement: 'Deliver a grid-ready BESS at £180,000 with 15-year design life.',
  target_customers: 'UK grid operators, C&I peak-shaving customers',
  why_now: 'LFP cells have fallen below $60/kWh, making containerised BESS economically viable for grid applications.',
  constraints: {
    unit_cost_ceiling: { value: 180000, currency: 'GBP', source: 'user' },
    max_mass_kg: { value: 28000, source: 'user' },
    max_dimensions_mm: { w: 12192, d: 2438, h: 2896, source: 'user' },
    target_performance: { key_metric: 'usable_energy_mwh', value: 3.5, unit: 'MWh', source: 'user' },
    target_process: { value: 'container fit-out', source: 'inferred' },
    target_material: { value: 'LFP prismatic cells', source: 'user' },
    batch_size: { value: 25, source: 'user' },
    design_life: { value: '15 years or 6000 EFC', source: 'user' },
    operating_environment: { temp_min_c: -20, temp_max_c: 50, source: 'user' },
    safety_standards: [
      { standard: 'IEC 62619', source: 'user' },
      { standard: 'UL 9540A', source: 'user' },
    ],
    additional_constraints: [{ description: 'DC bus ~800V nominal', source: 'user' }],
  },
  missing_mandatory_fields: [],
  confidence: 'HIGH',
}

// ── Valid PA module fixture ────────────────────────────────────────────────────

function makeValidModule(overrides: Partial<any> = {}): any {
  return {
    name: 'Battery Rack Assembly',
    purpose: 'Houses 10 CATL LFP 280Ah prismatic cell racks, providing 3.5 MWh usable energy at 800V DC nominal.',
    why_it_matters: 'Without this module the system stores no energy — total loss of function.',
    technical_description: '10 rack modules, each containing 56 CATL LFP 280Ah prismatic cells in 14S4P configuration. ' +
      'Cells are clamped in aluminium extrusion frames with compression plates to maintain stack pressure at 10±2 kPa. ' +
      'Each rack includes an internal BMS slave board (Orion BMS 2) for per-cell voltage and temperature monitoring.',
    expected_parts: [
      { name: 'CATL LFP 280Ah prismatic cell', quantity: '560', role: 'Primary energy storage cell' },
      { name: 'Aluminium extrusion rack frame', quantity: '10', role: 'Structural cell containment' },
    ],
    interfaces: [
      { type: 'electrical', connects_to: 'DC Bus / Cabling Module', description: '800V DC bus connection via 400A busbars' },
      { type: 'data', connects_to: 'BMS Master Module', description: 'CAN bus per rack for cell voltage/temperature telemetry' },
      { type: 'thermal', connects_to: 'Thermal Management Module', description: 'Coolant manifold connection for liquid cooling plates' },
    ],
    failure_modes: [
      {
        mode: 'Cell internal short circuit propagating to adjacent cells',
        cause: 'Separator fault caused by mechanical damage during installation or lithium plating from high-rate charging below 0°C',
        local_effect: 'Thermal runaway in affected rack with gas venting at >150°C',
        system_effect: 'Potential multi-rack fire; toxic HF/CO off-gas; system outage',
      },
    ],
    open_questions: ['Confirm cell supplier allocation for batch 1 — CATL vs EVE depends on lead time'],
    estimated_mass_kg: 12500,
    estimated_dimensions_mm: { w: 11000, d: 1800, h: 2200 },
    estimated_lead_time_weeks: 16,
    maturity: 'PRELIMINARY',
    ...overrides,
  }
}

function makeValidModulesResponse(modules: any[] = [makeValidModule()]): any {
  return { modules }
}

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeOpenRouterResponse(content: any) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    text: async () => '',
  }
}

const mockFetch = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = mockFetch as unknown as typeof fetch
  process.env.OPENROUTER_API_KEY = 'test-key'
})

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY
})

// ── validateDecomposeResultPA: valid module ───────────────────────────────────

describe('validateDecomposeResultPA — valid schema', () => {
  it('parses a valid BESS module with all PA Stage 5 fields', () => {
    const data = makeValidModulesResponse()
    const modules = validateDecomposeResultPA(data)
    expect(modules).toHaveLength(1)
    const m = modules[0]
    expect(m.name).toBe('Battery Rack Assembly')
    expect(m.expected_parts).toHaveLength(2)
    expect(m.interfaces).toHaveLength(3)
    expect(m.failure_modes).toHaveLength(1)
    expect(m.maturity).toBe('PRELIMINARY')
    expect(m.estimated_mass_kg).toBe(12500)
    expect(m.estimated_dimensions_mm).toEqual({ w: 11000, d: 1800, h: 2200 })
    expect(m.estimated_lead_time_weeks).toBe(16)
  })

  it('auto-generates id from name when id is absent', () => {
    const data = makeValidModulesResponse([makeValidModule({ id: undefined })])
    const modules = validateDecomposeResultPA(data)
    expect(modules[0].id).toBe('battery_rack_assembly')
  })

  it('backfills legacy Module.whyItMatters from why_it_matters', () => {
    const data = makeValidModulesResponse()
    const modules = validateDecomposeResultPA(data)
    expect(modules[0].whyItMatters).toBeDefined()
    expect(modules[0].whyItMatters.length).toBeGreaterThan(0)
  })

  it('backfills legacy Module.description from technical_description', () => {
    const data = makeValidModulesResponse()
    const modules = validateDecomposeResultPA(data)
    expect(modules[0].description).toBeDefined()
    expect(modules[0].description.length).toBeGreaterThan(0)
  })

  it('backfills legacy Module.keyParts from expected_parts', () => {
    const data = makeValidModulesResponse([makeValidModule({ keyParts: undefined })])
    const modules = validateDecomposeResultPA(data)
    expect(Array.isArray(modules[0].keyParts)).toBe(true)
    // Must have derived from expected_parts
    expect(modules[0].keyParts.length).toBeGreaterThan(0)
  })

  it('sets status to "draft" when absent', () => {
    const data = makeValidModulesResponse([makeValidModule({ status: undefined })])
    const modules = validateDecomposeResultPA(data)
    expect(modules[0].status).toBe('draft')
  })

  it('accepts all three valid maturity values', () => {
    for (const maturity of ['CONCEPTUAL', 'PRELIMINARY', 'ENGINEERING'] as const) {
      const data = makeValidModulesResponse([makeValidModule({ maturity })])
      const modules = validateDecomposeResultPA(data)
      expect(modules[0].maturity).toBe(maturity)
    }
  })

  // ── D1 council BLOCKER-D1-1 fix tests ─────────────────────────────────────
  // CONCEPTUAL maturity: null mass and dims MUST pass (spec-following LLMs emit null)
  // PRELIMINARY/ENGINEERING: null mass and dims MUST fail (sizing solver needs estimates)

  it('[D1-1] CONCEPTUAL module with null estimated_mass_kg PASSES validation', () => {
    // A spec-following LLM returns null for CONCEPTUAL modules — must not reject
    const mod = makeValidModule({ maturity: 'CONCEPTUAL', estimated_mass_kg: null })
    const data = makeValidModulesResponse([mod])
    expect(() => validateDecomposeResultPA(data)).not.toThrow()
    const modules = validateDecomposeResultPA(data)
    expect(modules[0].estimated_mass_kg).toBeNull()
  })

  it('[D1-1] CONCEPTUAL module with null estimated_dimensions_mm PASSES validation', () => {
    const mod = makeValidModule({ maturity: 'CONCEPTUAL', estimated_dimensions_mm: null })
    const data = makeValidModulesResponse([mod])
    expect(() => validateDecomposeResultPA(data)).not.toThrow()
    const modules = validateDecomposeResultPA(data)
    expect(modules[0].estimated_dimensions_mm).toBeNull()
  })

  it('[D1-1] CONCEPTUAL module with both null estimates PASSES validation', () => {
    const mod = makeValidModule({
      maturity: 'CONCEPTUAL',
      estimated_mass_kg: null,
      estimated_dimensions_mm: null,
    })
    const data = makeValidModulesResponse([mod])
    expect(() => validateDecomposeResultPA(data)).not.toThrow()
  })
})

// ── validateDecomposeResultPA: rejection cases ────────────────────────────────

describe('validateDecomposeResultPA — rejection cases', () => {
  it('rejects a module with cause="Unknown" in failure_modes', () => {
    const badModule = makeValidModule({
      failure_modes: [
        {
          mode: 'Cell thermal runaway',
          cause: 'Unknown',
          local_effect: 'Rack fire',
          system_effect: 'System outage',
        },
      ],
    })
    const data = makeValidModulesResponse([badModule])
    expect(() => validateDecomposeResultPA(data)).toThrow(/Unknown.*not acceptable|Unknown.*cause/i)
  })

  it('rejects a module with cause="unknown" (lowercase)', () => {
    const badModule = makeValidModule({
      failure_modes: [
        {
          mode: 'BMS communication loss',
          cause: 'unknown',
          local_effect: 'Loss of telemetry',
          system_effect: 'Unable to protect battery from overcharge',
        },
      ],
    })
    const data = makeValidModulesResponse([badModule])
    expect(() => validateDecomposeResultPA(data)).toThrow(/Unknown.*not acceptable|Unknown.*cause/i)
  })

  it('rejects a module with no interfaces', () => {
    const badModule = makeValidModule({ interfaces: [] })
    const data = makeValidModulesResponse([badModule])
    expect(() => validateDecomposeResultPA(data)).toThrow(/no interfaces|interfaces/i)
  })

  it('rejects a module with interfaces=undefined', () => {
    const badModule = makeValidModule({ interfaces: undefined })
    const data = makeValidModulesResponse([badModule])
    expect(() => validateDecomposeResultPA(data)).toThrow(/no interfaces|interfaces/i)
  })

  it('rejects a PRELIMINARY module with null estimated_mass_kg', () => {
    // D1-1: null is NOT allowed for PRELIMINARY/ENGINEERING maturity
    const badModule = makeValidModule({ estimated_mass_kg: null, maturity: 'PRELIMINARY' })
    const data = makeValidModulesResponse([badModule])
    expect(() => validateDecomposeResultPA(data)).toThrow(/estimated_mass_kg/)
  })

  it('rejects an ENGINEERING module with null estimated_mass_kg', () => {
    const badModule = makeValidModule({ estimated_mass_kg: null, maturity: 'ENGINEERING' })
    const data = makeValidModulesResponse([badModule])
    expect(() => validateDecomposeResultPA(data)).toThrow(/estimated_mass_kg/)
  })

  it('rejects a PRELIMINARY module with null estimated_dimensions_mm', () => {
    const badModule = makeValidModule({ estimated_dimensions_mm: null, maturity: 'PRELIMINARY' })
    const data = makeValidModulesResponse([badModule])
    expect(() => validateDecomposeResultPA(data)).toThrow(/estimated_dimensions_mm/)
  })

  it('rejects an invalid maturity value', () => {
    const badModule = makeValidModule({ maturity: 'DETAILED' })
    const data = makeValidModulesResponse([badModule])
    expect(() => validateDecomposeResultPA(data)).toThrow(/maturity/)
  })

  it('rejects a response with no modules array', () => {
    expect(() => validateDecomposeResultPA(null)).toThrow()
    expect(() => validateDecomposeResultPA({})).toThrow()
    expect(() => validateDecomposeResultPA({ modules: 'not an array' })).toThrow()
  })

  it('rejects a module missing name', () => {
    const badModule = makeValidModule({ name: undefined })
    const data = makeValidModulesResponse([badModule])
    expect(() => validateDecomposeResultPA(data)).toThrow(/name/)
  })

  it('[D1-8] rejects a module with missing purpose and no fallback fields', () => {
    // D1 council BLOCKER-D1-8: purpose is required. If technical_description
    // and description are also absent, the module should be rejected.
    const badModule = makeValidModule({
      purpose: undefined,
      description: undefined,
      technical_description: undefined,
    })
    const data = makeValidModulesResponse([badModule])
    expect(() => validateDecomposeResultPA(data)).toThrow(/purpose/)
  })

  it('[D1-8] accepts a module where purpose is absent but technical_description provides a fallback', () => {
    // purpose is absent but technical_description can backfill it
    const mod = makeValidModule({
      purpose: undefined,
      technical_description: 'Technical description used as purpose fallback.',
    })
    const data = makeValidModulesResponse([mod])
    expect(() => validateDecomposeResultPA(data)).not.toThrow()
  })
})

// ── validateDecomposeResultPA: normalisation cases ───────────────────────────

describe('validateDecomposeResultPA — normalisation', () => {
  it('normalises invalid interface type to "mechanical"', () => {
    const mod = makeValidModule({
      interfaces: [
        { type: 'optical', connects_to: 'Sensor Module', description: 'Optical fibre temperature sensor' },
      ],
    })
    const data = makeValidModulesResponse([mod])
    // Should not throw — normalises to mechanical
    const modules = validateDecomposeResultPA(data)
    expect(modules[0].interfaces[0].type).toBe('mechanical')
  })

  it('initialises empty failure_modes array when absent', () => {
    const mod = makeValidModule({ failure_modes: undefined })
    const data = makeValidModulesResponse([mod])
    const modules = validateDecomposeResultPA(data)
    expect(Array.isArray(modules[0].failure_modes)).toBe(true)
  })

  it('rejects a module with absent expected_parts (D1-8 fix: required non-empty)', () => {
    // D1 council BLOCKER-D1-8 fix: expected_parts must be a non-empty array.
    // Previously the validator silently defaulted to [] — now it rejects so
    // downstream BOM stage always has part names to work with.
    const mod = makeValidModule({ expected_parts: undefined })
    const data = makeValidModulesResponse([mod])
    expect(() => validateDecomposeResultPA(data)).toThrow(/expected_parts/)
  })

  it('rejects a module with empty expected_parts array (D1-8 fix)', () => {
    const mod = makeValidModule({ expected_parts: [] })
    const data = makeValidModulesResponse([mod])
    expect(() => validateDecomposeResultPA(data)).toThrow(/expected_parts/)
  })
})

// ── runDecomposePA: orchestration tests ──────────────────────────────────────

describe('runDecomposePA — PA Stage 5 orchestration', () => {
  it('returns ok=true with valid PA modules for BESS brief', async () => {
    const validResponse = makeValidModulesResponse([makeValidModule()])
    mockFetch.mockResolvedValue(makeOpenRouterResponse(validResponse))

    const result = await runDecomposePA(BESS_PARSED_BRIEF, 'energy_storage')
    expect(result.ok).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data!.length).toBeGreaterThan(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('sends MODULE_DECOMPOSITION_SYSTEM_PA as system prompt', async () => {
    const validResponse = makeValidModulesResponse([makeValidModule()])
    mockFetch.mockResolvedValue(makeOpenRouterResponse(validResponse))

    await runDecomposePA(BESS_PARSED_BRIEF, 'energy_storage')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('openrouter.ai')
    const body = JSON.parse(init.body)
    expect(body.messages[0].role).toBe('system')
    // PA Stage 5 distinctive phrase from the verbatim prompt
    expect(body.messages[0].content).toContain('systems engineer decomposing a hardware product into physical modules')
  })

  it('sends parsedBrief JSON and classification in user message', async () => {
    const validResponse = makeValidModulesResponse([makeValidModule()])
    mockFetch.mockResolvedValue(makeOpenRouterResponse(validResponse))

    await runDecomposePA(BESS_PARSED_BRIEF, 'energy_storage')
    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body)
    const userContent = body.messages[1].content as string
    expect(userContent).toContain('bess_40ft_lfp_001')
    expect(userContent).toContain('energy_storage')
  })

  it('includes regulatory context in user message when provided', async () => {
    const validResponse = makeValidModulesResponse([makeValidModule()])
    mockFetch.mockResolvedValue(makeOpenRouterResponse(validResponse))

    const mockRegulatory = {
      regulatory_entries: [
        {
          standard_name: 'IEC 62619:2022',
          version_date: 'Edition 2 (2022)',
          jurisdiction: 'UK / EU',
          owner: 'Battery Safety Engineer',
          status: 'not_started' as const,
          claim_type: 'requirement' as const,
          applicability: 'Applies because the BESS uses LFP prismatic cells in a multi-cell configuration exceeding 2 kWh',
          engineering_impact: 'Requires cell-level short circuit test, overcharge/over-discharge test, and thermal abuse test at accredited lab. Estimated 8-12 weeks, ~£45,000.',
          evidence_required: 'Independent test report from UKAS-accredited laboratory to IEC 62619:2022 clauses 7.2–7.6',
          gap_action: 'Engage Intertek or SGS to schedule IEC 62619 cell-level testing programme before rack assembly begins',
          source_grade: 'C' as const,
          verification_status: 'UNVERIFIED' as const,
          verification_note: 'Claims based on published standard scope. Requires compliance engineer review against actual cell chemistry and BMS configuration.',
        },
      ],
    }

    await runDecomposePA(BESS_PARSED_BRIEF, 'energy_storage', mockRegulatory)
    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body)
    const userContent = body.messages[1].content as string
    expect(userContent).toContain('IEC 62619:2022')
  })

  it('[NOTED-D1-2 reclassified BLOCKER] logs truncation warning when >20 regulatory entries', async () => {
    // D1 council NOTED-D1-2 fix (reclassified BLOCKER, 2 seats: GLM-5.1, MiMo):
    // Regulatory context was truncated at 10 entries. Raised to 20. When >20
    // entries exist, a truncation warning is emitted.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const validResponse = makeValidModulesResponse([makeValidModule()])
    mockFetch.mockResolvedValue(makeOpenRouterResponse(validResponse))

    // Create 21 regulatory entries (exceeds the 20-entry slice limit)
    const manyEntries = Array.from({ length: 21 }, (_, i) => ({
      standard_name: `ISO ${1000 + i}`,
      version_date: '2023',
      jurisdiction: 'UK',
      owner: 'Engineer',
      status: 'not_started' as const,
      claim_type: 'requirement' as const,
      applicability: 'Applies to product.',
      engineering_impact: 'Design impact.',
      evidence_required: 'Test report.',
      gap_action: 'Engage lab.',
      source_grade: 'C' as const,
      verification_status: 'UNVERIFIED' as const,
      verification_note: 'Review required.',
    }))

    await runDecomposePA(BESS_PARSED_BRIEF, 'energy_storage', { regulatory_entries: manyEntries })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('truncated'))
    warnSpy.mockRestore()
  })

  it('[D1-2] runDecomposePA with regulatoryExtraction=undefined does NOT crash (TypeError guard)', async () => {
    // D1 council BLOCKER-D1-2 fix (4/6 seats): PA Stage 4 failure is non-fatal —
    // regulatoryExtraction may be undefined when Stage 4 failed. This must not
    // cause a TypeError in runDecomposePA when building regSummary.
    const validResponse = makeValidModulesResponse([makeValidModule()])
    mockFetch.mockResolvedValue(makeOpenRouterResponse(validResponse))

    // Pass explicit undefined to simulate Stage 4 non-fatal failure
    const result = await runDecomposePA(BESS_PARSED_BRIEF, 'energy_storage', undefined)
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('[D1-2] runDecomposePA with empty regulatory_entries does NOT crash', async () => {
    const validResponse = makeValidModulesResponse([makeValidModule()])
    mockFetch.mockResolvedValue(makeOpenRouterResponse(validResponse))

    const result = await runDecomposePA(BESS_PARSED_BRIEF, 'energy_storage', { regulatory_entries: [] })
    expect(result.ok).toBe(true)
  })

  it('returns ok=false when API call fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal server error' })
    const result = await runDecomposePA(BESS_PARSED_BRIEF, 'energy_storage')
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('returns ok=false when LLM returns invalid JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'not json @@##' } }] }),
      text: async () => '',
    })
    const result = await runDecomposePA(BESS_PARSED_BRIEF, 'energy_storage')
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('produces ModulePA with estimated_mass_kg and estimated_dimensions_mm on PA path', async () => {
    const validResponse = makeValidModulesResponse([makeValidModule()])
    mockFetch.mockResolvedValue(makeOpenRouterResponse(validResponse))

    const result = await runDecomposePA(BESS_PARSED_BRIEF, 'energy_storage')
    expect(result.ok).toBe(true)
    const m = result.data![0] as ModulePA
    expect(m.estimated_mass_kg).toBe(12500)
    expect(m.estimated_dimensions_mm).toEqual({ w: 11000, d: 1800, h: 2200 })
    expect(m.maturity).toBe('PRELIMINARY')
    expect(Array.isArray(m.interfaces)).toBe(true)
    expect(m.interfaces.length).toBeGreaterThan(0)
  })
})

// ── MODULE_DECOMPOSITION_SYSTEM_PA prompt structure check ─────────────────────

describe('MODULE_DECOMPOSITION_SYSTEM_PA prompt integrity', () => {
  it('contains the PA Stage 5 distinctive phrase', () => {
    expect(MODULE_DECOMPOSITION_SYSTEM_PA).toContain('systems engineer decomposing a hardware product into physical modules')
  })

  it('requires interfaces array in the schema', () => {
    expect(MODULE_DECOMPOSITION_SYSTEM_PA).toContain('"interfaces"')
  })

  it('requires failure_modes with cause field', () => {
    expect(MODULE_DECOMPOSITION_SYSTEM_PA).toContain('"failure_modes"')
    expect(MODULE_DECOMPOSITION_SYSTEM_PA).toContain('"cause"')
  })

  it('prohibits "Unknown" cause in failure_modes (stated in Rules section)', () => {
    // The Rules section (not the JSON schema) explicitly states that "Unknown" is not acceptable.
    // The JSON comment was moved out of the schema block to avoid BLOCKER-2 pattern.
    expect(MODULE_DECOMPOSITION_SYSTEM_PA).toContain('"Unknown" is not acceptable')
  })

  it('requires maturity enum', () => {
    expect(MODULE_DECOMPOSITION_SYSTEM_PA).toContain('"CONCEPTUAL"|"PRELIMINARY"|"ENGINEERING"')
  })

  it('requires estimated_mass_kg and estimated_dimensions_mm', () => {
    expect(MODULE_DECOMPOSITION_SYSTEM_PA).toContain('"estimated_mass_kg"')
    expect(MODULE_DECOMPOSITION_SYSTEM_PA).toContain('"estimated_dimensions_mm"')
  })

  it('does not contain JS-style inline comments inside the JSON schema block', () => {
    const lines = MODULE_DECOMPOSITION_SYSTEM_PA.split('\n')
    let insideJsonBlock = false
    for (const line of lines) {
      if (line.trim() === '{') insideJsonBlock = true
      if (line.trim() === '}') insideJsonBlock = false
      if (insideJsonBlock && /^\s*"[^"]+"\s*:.*\/\//.test(line)) {
        throw new Error(
          `Found JS comment inside JSON schema block in MODULE_DECOMPOSITION_SYSTEM_PA:\n  ${line.trim()}`
        )
      }
    }
  })
})
