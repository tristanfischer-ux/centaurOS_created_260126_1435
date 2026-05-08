/**
 * @file research-synthesis.test.ts — Phase B verification
 *
 * Tests for runResearchSynthesis() (PA Stage 3).
 * Uses mocked fetch — no real LLM calls.
 *
 * Verification criteria from MIGRATION-TRACKER.md Phase B:
 *   ✅ state.researchSynthesis.competitors.length >= 3 for BESS brief
 *   ✅ state.researchSynthesis.claims_requiring_verification non-empty
 *   ✅ source_grade_overall === 'E'
 *   ✅ market_context contains domain-relevant keywords
 *   ✅ Returns valid ResearchSynthesis even when parsedBrief has many null constraints
 *   ✅ Anti-invention: pricing with no published price uses hedged language
 */

import { runResearchSynthesis } from './1-research'
import { mapProductClassToIndustryDomain } from '../lib/industry-domain'
import { RESEARCH_SYNTHESIS_SYSTEM_PA } from '../prompts'
import type { StructuredBriefJSON, ResearchSynthesis } from '../types'

// ── BESS parsedBrief fixture (matches Phase A brief-parsing.test.ts) ─────────

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
      { standard: 'NFPA 855', source: 'user' },
    ],
    additional_constraints: [{ description: 'DC bus ~800V nominal', source: 'user' }],
  },
  missing_mandatory_fields: [],
  confidence: 'HIGH',
}

/** Thin brief: everything null, low confidence */
const THIN_PARSED_BRIEF: StructuredBriefJSON = {
  project_id: 'drone_001',
  product_description: 'A drone.',
  mission_statement: 'Build a drone.',
  target_customers: 'Unknown',
  why_now: 'Unknown',
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
    safety_standards: [],
    additional_constraints: [],
  },
  missing_mandatory_fields: [
    'unit_cost_ceiling', 'max_mass_kg', 'max_dimensions_mm',
    'target_performance', 'batch_size', 'design_life', 'target_customers',
  ],
  confidence: 'LOW',
}

// ── Mock LLM responses ────────────────────────────────────────────────────────

/** Realistic PA Stage 3 output for the BESS brief */
const BESS_SYNTHESIS_RESPONSE: ResearchSynthesis = {
  market_context:
    'Industry reports suggest the UK grid-scale battery storage market has grown significantly, ' +
    'driven by Contracts for Difference and capacity market auctions. LFP technology, favoured for ' +
    'stationary storage due to its thermal stability and cycle life, now dominates new UK installations. ' +
    'Published data indicates grid frequency response services (FFR, DC, BM) are increasingly procured ' +
    'from battery assets rather than gas peakers.\n\n' +
    'The C&I peak-shaving segment is expanding as half-hourly settlement reform increases exposure to ' +
    'time-of-use pricing. Containerised BESS products, factory-assembled to IEC 62619 and UL 9540A, ' +
    'allow rapid site deployment and reduce civil works costs.',
  why_now:
    'Industry analysts suggest LFP prismatic cell prices have declined materially since 2022, ' +
    'improving project economics for grid-scale BESS. UK government policy (Electricity Storage ' +
    'Flexibility and Grid Services, 2024 consultation) has clarified co-location with generation ' +
    'and standalone storage permitting, reducing planning risk.',
  competitors: [
    {
      company: 'Sungrow',
      product: 'PowerTitan ST2236UX-US (liquid-cooled containerised BESS)',
      pricing: 'Listed at approximately $200/kWh installed (industry estimates suggest)',
      key_specs: '2.5 MWh per 20ft container, LFP cells, active liquid cooling, G99-compliant PCS options',
      strengths: ['High volume manufacturing', 'Established UK installer network', 'IEC 62619 certified'],
      weaknesses: ['Minimum order quantities favour utility scale', 'Limited UK service presence'],
      differentiation_angle: 'Proposed product targets the £180k ex-works price point and 40ft ISO form factor — differentiated by lower per-unit cost than Sungrow for sub-5 MWh applications.',
    },
    {
      company: 'BYD',
      product: 'BYD Battery-Box Premium LVS / MC Cube (commercial scale)',
      pricing: 'Pricing not publicly listed; industry reports suggest £120–160/kWh at system level',
      key_specs: 'Modular LFP stacks, scalable from 100 kWh to multi-MWh, BMS integrated',
      strengths: ['Vertically integrated cell manufacturing', 'Strong cycle life data (6000+ cycles)'],
      weaknesses: ['MC Cube sizing starts at 5 MWh, over-specified for 3.5 MWh target', 'EU-centric certs'],
      differentiation_angle: 'Proposed product is factory-road-transport-ready at 28,000 kg vs BYD multi-unit site assembly, reducing installation time.',
    },
    {
      company: 'Tesla',
      product: 'Megapack 2XL',
      pricing: 'Listed at approximately $1.3M per unit (industry reports suggest ~$300/kWh all-in)',
      key_specs: '3.9 MWh per unit, NMC/LFP mix, integrated PCS, Autobidder SCADA',
      strengths: ['Best-in-class power electronics integration', 'Direct grid connection support'],
      weaknesses: ['NMC chemistry raises thermal management complexity vs LFP', 'Premium pricing tier'],
      differentiation_angle: 'Proposed product is LFP-only (better thermal stability, longer cycle life) and priced at £180k vs Tesla Megapack tier, targeting C&I and smaller grid developers.',
    },
  ],
  research_sources: [
    {
      title: 'IEC 62619:2022 — Safety requirements for secondary lithium cells and batteries',
      type: 'standard',
      year: 2022,
      relevance: 'Mandatory cell-level safety standard for LFP BESS in UK/EU markets',
      source_grade: 'A',
    },
    {
      title: 'NFPA 855:2023 — Standard for the Installation of Stationary Energy Storage Systems',
      type: 'standard',
      year: 2023,
      relevance: 'Governs container spacing, suppression system design, and thermal runaway mitigation for BESS installations',
      source_grade: 'A',
    },
    {
      title: 'BloombergNEF Energy Storage Market Outlook 2024',
      type: 'market_report',
      year: 2024,
      relevance: 'Source for LFP cell pricing trends and UK storage capacity forecasts',
      source_grade: 'B',
    },
  ],
  source_grade_overall: 'E',
  claims_requiring_verification: [
    'LFP prismatic cell prices have declined below $60/kWh (BNEF 2024)',
    'UK grid-scale battery storage market growth rate',
    'Tesla Megapack all-in pricing ~$300/kWh',
    'Sungrow PowerTitan installed cost ~$200/kWh',
  ],
}

/** Minimal synthesis for thin brief — all arrays populated even if sparse */
const THIN_SYNTHESIS_RESPONSE: ResearchSynthesis = {
  market_context:
    'Industry reports suggest the commercial drone market is growing, driven by logistics and inspection use cases.',
  why_now: 'Published data indicates regulatory changes in BVLOS operations may open new markets.',
  competitors: [
    {
      company: 'DJI',
      product: 'Matrice 350 RTK',
      pricing: 'Listed at approximately £5,000 per unit (published price)',
      key_specs: '55-min flight time, IP55 rated, 2.7 kg payload',
      strengths: ['Market-leading reliability', 'Established ecosystem'],
      weaknesses: ['Chinese origin creates procurement barriers for some UK clients'],
      differentiation_angle: 'Proposed product would differentiate if UK-manufactured and BVLOS-certified.',
    },
    {
      company: 'Wingcopter',
      product: 'Wingcopter 198',
      pricing: 'Pricing not publicly listed',
      key_specs: 'Fixed-wing VTOL, 75 km range, 6 kg payload',
      strengths: ['Long range', 'Medical delivery deployments'],
      weaknesses: ['High unit cost', 'Complex maintenance'],
      differentiation_angle: 'Proposed product competes on cost if targeting short-range applications.',
    },
    {
      company: 'Parrot',
      product: 'ANAFI USA',
      pricing: 'Listed at approximately £6,500 per unit (published price)',
      key_specs: '32x zoom, 32-min flight time, NATO-compliant',
      strengths: ['NATO-approved supply chain', 'Privacy-by-design'],
      weaknesses: ['Camera-centric, limited payload'],
      differentiation_angle: 'Proposed product must define a clear use-case differentiation from inspection-focused platforms.',
    },
  ],
  research_sources: [
    {
      title: 'UK Civil Aviation Authority — BVLOS Operations Policy',
      type: 'government_policy',
      year: 2023,
      relevance: 'Regulatory framework for UK drone operations',
      source_grade: 'B',
    },
  ],
  source_grade_overall: 'E',
  claims_requiring_verification: [
    'Commercial drone market growth rate',
    'BVLOS regulatory changes timeline',
  ],
}

// ── Mock helpers ─────────────────────────────────────────────────────────────

function makeOpenRouterResponse(content: ResearchSynthesis) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    text: async () => '',
  }
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

const mockFetch = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = mockFetch as unknown as typeof fetch
  process.env.OPENROUTER_API_KEY = 'test-key'
})

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runResearchSynthesis — PA Stage 3', () => {

  // ── BESS brief fixture ──────────────────────────────────────────────────────

  describe('BESS brief fixture', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(makeOpenRouterResponse(BESS_SYNTHESIS_RESPONSE))
    })

    it('returns ok=true with valid ResearchSynthesis', async () => {
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('competitors.length >= 3 for BESS brief', async () => {
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      expect((result.data?.competitors ?? []).length).toBeGreaterThanOrEqual(3)
    })

    it('claims_requiring_verification.length >= 1 (at least one statistic flagged)', async () => {
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      expect((result.data?.claims_requiring_verification ?? []).length).toBeGreaterThanOrEqual(1)
    })

    it('source_grade_overall === "E"', async () => {
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      expect(result.data?.source_grade_overall).toBe('E')
    })

    it('market_context contains domain-relevant keywords (LFP, BESS, grid)', async () => {
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      const ctx = result.data?.market_context ?? ''
      // At least one of the key BESS/grid terms must appear
      const hasDomainKeywords = /LFP|BESS|grid|battery|storage/i.test(ctx)
      expect(hasDomainKeywords).toBe(true)
    })

    it('sends the PA Stage 3 system prompt to OpenRouter', async () => {
      await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toContain('openrouter.ai')
      const body = JSON.parse(init.body)
      expect(body.messages[0].role).toBe('system')
      // PA Stage 3 system prompt distinctive phrase
      expect(body.messages[0].content).toContain('market research analyst for engineered hardware products')
    })

    it('sends the structured brief JSON as user message', async () => {
      await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body)
      expect(body.messages[1].role).toBe('user')
      // User content must contain the parsedBrief JSON
      const userContent = body.messages[1].content as string
      expect(userContent).toContain('bess_40ft_lfp_001')
      expect(userContent).toContain('unit_cost_ceiling')
    })

    it('normalises each competitor with required ResearchCompetitor fields', async () => {
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      for (const c of result.data?.competitors ?? []) {
        expect(typeof c.company).toBe('string')
        expect(typeof c.product).toBe('string')
        expect(typeof c.pricing).toBe('string')
        expect(typeof c.key_specs).toBe('string')
        expect(Array.isArray(c.strengths)).toBe(true)
        expect(Array.isArray(c.weaknesses)).toBe(true)
        expect(typeof c.differentiation_angle).toBe('string')
      }
    })

    it('normalises research_sources with valid type and grade fields', async () => {
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      for (const s of result.data?.research_sources ?? []) {
        expect(['standard', 'market_report', 'datasheet', 'competitor_spec', 'government_policy']).toContain(s.type)
        expect(['A', 'B', 'C', 'D', 'E']).toContain(s.source_grade)
        expect(typeof s.title).toBe('string')
        expect(typeof s.relevance).toBe('string')
      }
    })
  })

  // ── Thin brief fixture ────────────────────────────────────────────────────

  describe('thin brief — many null constraints', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(makeOpenRouterResponse(THIN_SYNTHESIS_RESPONSE))
    })

    it('returns valid ResearchSynthesis even when parsedBrief has many null constraints', async () => {
      const result = await runResearchSynthesis(THIN_PARSED_BRIEF, 'generic')
      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      // Must not throw — all fields normalised
      expect(Array.isArray(result.data?.competitors)).toBe(true)
      expect(Array.isArray(result.data?.research_sources)).toBe(true)
      expect(Array.isArray(result.data?.claims_requiring_verification)).toBe(true)
    })

    it('does not throw when constraints are entirely null', async () => {
      // Should not throw even with fully-null constraints
      await expect(
        runResearchSynthesis(THIN_PARSED_BRIEF, 'generic')
      ).resolves.not.toThrow()
    })

    it('source_grade_overall is "E" for thin brief too', async () => {
      const result = await runResearchSynthesis(THIN_PARSED_BRIEF, 'generic')
      expect(result.ok).toBe(true)
      expect(result.data?.source_grade_overall).toBe('E')
    })
  })

  // ── Anti-invention: pricing hedging ─────────────────────────────────────

  describe('anti-invention: pricing hedging', () => {
    it('leaves already-hedged pricing intact', async () => {
      const hedgedResponse = {
        ...BESS_SYNTHESIS_RESPONSE,
        competitors: [
          {
            ...BESS_SYNTHESIS_RESPONSE.competitors[0],
            // Already has hedging language
            pricing: 'Listed at approximately $200/kWh installed (industry estimates suggest)',
          },
        ],
      }
      mockFetch.mockResolvedValue(makeOpenRouterResponse(hedgedResponse as ResearchSynthesis))
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      const pricing = result.data?.competitors[0].pricing ?? ''
      expect(pricing).not.toBe('')
      // Hedging words must be present
      expect(/approx|listed|estimated|from|starting|around|roughly|industry/i.test(pricing)).toBe(true)
    })

    it('wraps a bare number with "Listed at approximately" hedging', async () => {
      const bareNumberResponse = {
        ...BESS_SYNTHESIS_RESPONSE,
        competitors: [
          {
            ...BESS_SYNTHESIS_RESPONSE.competitors[0],
            // Bare price — no hedging language
            pricing: '£150,000',
          },
          BESS_SYNTHESIS_RESPONSE.competitors[1],
          BESS_SYNTHESIS_RESPONSE.competitors[2],
        ],
      }
      mockFetch.mockResolvedValue(makeOpenRouterResponse(bareNumberResponse as ResearchSynthesis))
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      const pricing = result.data?.competitors[0].pricing ?? ''
      // Must not be a raw number — must have hedge language
      expect(pricing).not.toBe('£150,000')
      expect(/approx|listed|estimated|from|starting|around|roughly|industry/i.test(pricing)).toBe(true)
    })

    it('handles null/undefined pricing gracefully with a safe placeholder', async () => {
      const nullPricingResponse = {
        ...BESS_SYNTHESIS_RESPONSE,
        competitors: [
          {
            ...BESS_SYNTHESIS_RESPONSE.competitors[0],
            pricing: null as any,
          },
          BESS_SYNTHESIS_RESPONSE.competitors[1],
          BESS_SYNTHESIS_RESPONSE.competitors[2],
        ],
      }
      mockFetch.mockResolvedValue(makeOpenRouterResponse(nullPricingResponse as ResearchSynthesis))
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      const pricing = result.data?.competitors[0].pricing ?? ''
      // Must be a non-empty string — not null/undefined
      expect(pricing.length).toBeGreaterThan(0)
    })
  })

  // ── Error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns ok=false when API call fails', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal server error' })
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('returns ok=false when LLM returns invalid JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'not valid json at all @@##' } }] }),
        text: async () => '',
      })
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('normalises invalid source_type to "standard"', async () => {
      const badTypeResponse = {
        ...BESS_SYNTHESIS_RESPONSE,
        research_sources: [
          { ...BESS_SYNTHESIS_RESPONSE.research_sources[0], type: 'blog_post' as any },
        ],
      }
      mockFetch.mockResolvedValue(makeOpenRouterResponse(badTypeResponse as ResearchSynthesis))
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      expect(result.data?.research_sources[0].type).toBe('standard')
    })

    it('normalises invalid source_grade to "E"', async () => {
      const badGradeResponse = {
        ...BESS_SYNTHESIS_RESPONSE,
        research_sources: [
          { ...BESS_SYNTHESIS_RESPONSE.research_sources[0], source_grade: 'Z' as any },
        ],
      }
      mockFetch.mockResolvedValue(makeOpenRouterResponse(badGradeResponse as ResearchSynthesis))
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      expect(result.data?.research_sources[0].source_grade).toBe('E')
    })

    it('always forces source_grade_overall to "E" even if LLM returns something else', async () => {
      const badOverallGrade = {
        ...BESS_SYNTHESIS_RESPONSE,
        source_grade_overall: 'B' as any,
      }
      mockFetch.mockResolvedValue(makeOpenRouterResponse(badOverallGrade as ResearchSynthesis))
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      // Always E regardless of what LLM returns
      expect(result.data?.source_grade_overall).toBe('E')
    })

    it('normalises missing arrays to empty arrays', async () => {
      const missingArrays = {
        market_context: 'Some context.',
        why_now: 'Some timing.',
        // competitors and research_sources intentionally omitted
        source_grade_overall: 'E',
        claims_requiring_verification: ['Some claim'],
      }
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(missingArrays) } }] }),
        text: async () => '',
      })
      const result = await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
      expect(result.ok).toBe(true)
      expect(Array.isArray(result.data?.competitors)).toBe(true)
      expect(Array.isArray(result.data?.research_sources)).toBe(true)
    })
  })
})

// ── BLOCKER-3 fix: classification injected into user message ─────────────────
// Verifies that `runResearchSynthesis()` includes the productClass string
// in the user message sent to the LLM (BLOCKER-3 fix).

describe('BLOCKER-3 fix — classification injected into user message', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = mockFetch as unknown as typeof fetch
    process.env.OPENROUTER_API_KEY = 'test-key'
    mockFetch.mockResolvedValue(makeOpenRouterResponse(BESS_SYNTHESIS_RESPONSE))
  })

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
  })

  it('user message contains the productClass string (BLOCKER-3)', async () => {
    await runResearchSynthesis(BESS_PARSED_BRIEF, 'battery_energy_storage')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, init] = mockFetch.mock.calls[0]
    const body = JSON.parse(init.body)
    const userContent = body.messages[1].content as string
    // BLOCKER-3: classification must appear in the user message
    expect(userContent).toContain('battery_energy_storage')
  })
})

// ── BLOCKER-1 fix: mapProductClassToIndustryDomain ──────────────────────────
// Verifies that heat_pump (thermal_system) and BESS (energy_storage) productClass
// values produce the correct industryDomain strings used by downstream validation.

describe('BLOCKER-1 fix — mapProductClassToIndustryDomain', () => {
  it('maps energy_storage → battery_energy_storage', () => {
    expect(mapProductClassToIndustryDomain('energy_storage')).toBe('battery_energy_storage')
  })

  it('maps thermal_system → heat_pump (triggers HVAC safety check at index.ts line ~947)', () => {
    // Critical mapping: thermal_system → heat_pump so the domain-specific
    // validation (hvac_and_refrigeration / heat_pump check) runs on the PA path.
    expect(mapProductClassToIndustryDomain('thermal_system')).toBe('heat_pump')
  })

  it('maps unknown/structural_product → generic (no domain-specific validation)', () => {
    expect(mapProductClassToIndustryDomain('structural_product')).toBe('generic')
    expect(mapProductClassToIndustryDomain('unknown')).toBe('generic')
  })
})

// ── BLOCKER-2 fix: no JS comment inside JSON schema block in PA prompt ────────
// Verifies that RESEARCH_SYNTHESIS_SYSTEM_PA contains no `//` comment
// inside a JSON schema block.

describe('BLOCKER-2 fix — no JS comment inside JSON schema in RESEARCH_SYNTHESIS_SYSTEM_PA', () => {
  it('prompt does not contain a JS-style inline comment on the source_grade_overall line', () => {
    // The exact bug: `"source_grade_overall": "E",  // Always E — this is LLM-generated`
    // After the fix, the comment must be outside the JSON block.
    const lines = RESEARCH_SYNTHESIS_SYSTEM_PA.split('\n')
    let insideJsonBlock = false
    for (const line of lines) {
      if (line.trim() === '{') insideJsonBlock = true
      if (line.trim() === '}') insideJsonBlock = false
      if (insideJsonBlock && /^\s*"[^"]+"\s*:.*\/\//.test(line)) {
        throw new Error(
          `Found JS comment inside JSON schema block in RESEARCH_SYNTHESIS_SYSTEM_PA:\n  ${line.trim()}`
        )
      }
    }
  })
})
