/**
 * @file regulatory-extraction.test.ts — Phase D1 verification: PA Stage 4 Regulatory Extraction
 *
 * Tests for runRegulatoryExtraction().
 * Uses mocked fetch — no real LLM calls.
 *
 * Verification criteria from MIGRATION-TRACKER.md Phase D1:
 *   ✅ BESS brief produces regulatory entries with source_grade === 'C'
 *   ✅ All entries have verification_status === 'UNVERIFIED'
 *   ✅ Entries are product-specific (not generic standard text)
 *   ✅ Anti-invention: source_grade and verification_status are hardcoded regardless of LLM output
 *   ✅ PA Stage 4 system prompt is sent verbatim
 */

import { runRegulatoryExtraction } from './1b-regulatory'
import { REGULATORY_EXTRACTION_SYSTEM } from '../prompts'
import type { StructuredBriefJSON, RegulatoryExtraction } from '../types'

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
      { standard: 'NFPA 855', source: 'user' },
    ],
    additional_constraints: [{ description: 'DC bus ~800V nominal', source: 'user' }],
  },
  missing_mandatory_fields: [],
  confidence: 'HIGH',
}

// ── Realistic PA Stage 4 response fixture ─────────────────────────────────────

const BESS_REGULATORY_RESPONSE: RegulatoryExtraction = {
  regulatory_entries: [
    {
      standard_name: 'IEC 62619:2022',
      version_date: 'Edition 2 (2022)',
      jurisdiction: 'UK / EU',
      owner: 'Battery Safety Engineer',
      status: 'not_started',
      claim_type: 'requirement',
      applicability:
        'Applies to this BESS because it uses LFP prismatic cells in a multi-cell configuration ' +
        'with usable energy >2 kWh — IEC 62619 clause 4.1 defines applicability for stationary secondary lithium cells.',
      engineering_impact:
        'Requires cell-level abuse testing: overcharge to 110% SOC, external short circuit at 0°C and 25°C, ' +
        'thermal abuse to 130°C, forced discharge to 0V. Each test destroys one cell. ' +
        'Estimated 8-12 weeks at accredited lab, ~£35,000-45,000 depending on test scope. ' +
        'Constrains cell selection to tested chemistry — switching from CATL to EVE cells requires re-testing.',
      evidence_required:
        'Independent test report from a UKAS-accredited or IEC-recognised laboratory, ' +
        'testing to IEC 62619:2022 clauses 7.2 (overcharge), 7.3 (forced discharge), 7.4 (external short circuit), ' +
        '7.5 (impact/crush), 7.6 (thermal abuse). Report must identify each cell lot number tested.',
      gap_action:
        'Engage Intertek Wilton or SGS Redhill to schedule IEC 62619 cell-level testing programme. ' +
        'Submit test plan within 4 weeks of cell supplier selection to avoid lead time impact.',
      source_grade: 'C',
      verification_status: 'UNVERIFIED',
      verification_note:
        'Applicability and clause references based on published IEC 62619:2022 standard scope. ' +
        'Requires compliance engineer review against actual cell chemistry, BMS configuration, and installation class.',
    },
    {
      standard_name: 'UL 9540A:2023',
      version_date: 'Edition 2023',
      jurisdiction: 'UK (NFPA 855 adoption) / International',
      owner: 'Fire Safety Engineer',
      status: 'not_started',
      claim_type: 'requirement',
      applicability:
        'Applies to this BESS because UK NFPA 855 adoption (NFPA 855-2023 section 4.3) requires ' +
        'UL 9540A system-level fire propagation testing for ESS installations in occupied buildings or ' +
        'within 3 m of building openings. At 3.5 MWh per 40ft container, propagation risk is classified HIGH.',
      engineering_impact:
        'UL 9540A test burns one production-representative cell, then rack, then full system. ' +
        'Test is destructive — one full system consumed. Estimated cost £200,000-350,000. ' +
        '20-26 weeks lead time at FM Global Research campus or Exponent. ' +
        'Result determines maximum allowable installation separation distance — if propagation exceeds 1 m, ' +
        'container spacing requirements increase, affecting site civil design.',
      evidence_required:
        'UL 9540A test report from FM Approvals, Exponent, or UL-certified laboratory. ' +
        'Report must include cell-level, module-level, and unit-level test results for the exact cell lot and BMS firmware version used.',
      gap_action:
        'Issue RFQ to FM Global Research and Exponent for UL 9540A system-level test programme. ' +
        'Confirm whether cell-level IEC 62619 results can be cross-referenced to reduce scope.',
      source_grade: 'C',
      verification_status: 'UNVERIFIED',
      verification_note:
        'UL 9540A applicability threshold based on NFPA 855-2023 public review draft. ' +
        'Final adopted text may vary. Requires compliance engineer to confirm applicable edition and threshold.',
    },
    {
      standard_name: 'G99:2019+A1-A5',
      version_date: 'Issue 1, Amendment 5 (2023)',
      jurisdiction: 'UK (NGET/DNO network)',
      owner: 'Grid Connection Engineer',
      status: 'not_started',
      claim_type: 'requirement',
      applicability:
        'G99 applies to this BESS because it connects to the public electricity network at LV or HV ' +
        'and has peak export power >16A per phase (1 MW = ~1445A at 400V). ' +
        'Connection to 11kV or 33kV distribution network requires G99 compliance for the PCS inverter.',
      engineering_impact:
        'PCS inverter must meet G99 type-tested voltage and frequency ride-through profiles. ' +
        'ROCOF setting (default 1 Hz/s) must be configurable. DNO registration required before energisation. ' +
        'Type-tested G99 inverter constrains PCS supplier selection — only type-tested models acceptable.',
      evidence_required:
        'G99 type test certificate for the PCS inverter model selected, issued by a UKAS-accredited test house. ' +
        'DNO pre-registration confirmation from the relevant Distribution Network Operator.',
      gap_action:
        'Select PCS inverter with existing G99 type test certificate (e.g. SMA Sunny Central, ABB PVS800). ' +
        'Submit G99 connection application to DNO minimum 12 weeks before planned energisation date.',
      source_grade: 'C',
      verification_status: 'UNVERIFIED',
      verification_note:
        'G99 connection requirements based on ENA Engineering Recommendation G99 public document. ' +
        'Specific DNO requirements (e.g. UKPN, WPD) may impose additional conditions.',
    },
  ],
}

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeOpenRouterResponse(content: RegulatoryExtraction) {
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runRegulatoryExtraction — PA Stage 4', () => {

  // ── BESS brief fixture ──────────────────────────────────────────────────────

  describe('BESS brief fixture', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(makeOpenRouterResponse(BESS_REGULATORY_RESPONSE))
    })

    it('returns ok=true with valid RegulatoryExtraction', async () => {
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('produces regulatory entries for BESS brief (at least 3)', async () => {
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(true)
      expect((result.data?.regulatory_entries ?? []).length).toBeGreaterThanOrEqual(3)
    })

    // ── Anti-invention: source_grade always 'C' ─────────────────────────────

    it('ALL entries have source_grade === "C" (anti-invention rule)', async () => {
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(true)
      for (const entry of result.data?.regulatory_entries ?? []) {
        expect(entry.source_grade).toBe('C')
      }
    })

    // ── Anti-invention: verification_status always 'UNVERIFIED' ────────────

    it('ALL entries have verification_status === "UNVERIFIED" (anti-invention rule)', async () => {
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(true)
      for (const entry of result.data?.regulatory_entries ?? []) {
        expect(entry.verification_status).toBe('UNVERIFIED')
      }
    })

    // ── Product-specificity: entries must reference BESS-relevant standards ─

    it('entries are product-specific — contain BESS/battery-relevant standard names', async () => {
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(true)
      const standardNames = (result.data?.regulatory_entries ?? []).map(e => e.standard_name)
      const isBessRelevant = standardNames.some(name =>
        /IEC 62619|UL 9540|NFPA 855|G99|BS EN 61439|IEC 62477/i.test(name)
      )
      expect(isBessRelevant).toBe(true)
    })

    it('entries have non-empty applicability, engineering_impact, evidence_required, gap_action', async () => {
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(true)
      for (const entry of result.data?.regulatory_entries ?? []) {
        expect(entry.applicability.length).toBeGreaterThan(0)
        expect(entry.engineering_impact.length).toBeGreaterThan(0)
        expect(entry.evidence_required.length).toBeGreaterThan(0)
        expect(entry.gap_action.length).toBeGreaterThan(0)
      }
    })

    it('sends REGULATORY_EXTRACTION_SYSTEM as system prompt', async () => {
      await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toContain('openrouter.ai')
      const body = JSON.parse(init.body)
      expect(body.messages[0].role).toBe('system')
      // PA Stage 4 distinctive phrase
      expect(body.messages[0].content).toContain('regulatory compliance analyst for engineered hardware products')
    })

    it('sends parsedBrief JSON and classification in user message', async () => {
      await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body)
      const userContent = body.messages[1].content as string
      expect(userContent).toContain('bess_40ft_lfp_001')
      expect(userContent).toContain('energy_storage')
    })
  })

  // ── Anti-invention: hardcoded fields override LLM output ─────────────────

  describe('anti-invention: source_grade and verification_status always forced', () => {
    it('forces source_grade to "C" even when LLM returns "A"', async () => {
      const badGradeResponse = {
        regulatory_entries: [
          {
            ...BESS_REGULATORY_RESPONSE.regulatory_entries[0],
            source_grade: 'A' as any,
          },
        ],
      }
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(badGradeResponse) } }] }),
        text: async () => '',
      })
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(true)
      // Must be 'C' regardless of LLM output
      expect(result.data!.regulatory_entries[0].source_grade).toBe('C')
    })

    it('forces verification_status to "UNVERIFIED" even when LLM returns "VERIFIED"', async () => {
      const badStatusResponse = {
        regulatory_entries: [
          {
            ...BESS_REGULATORY_RESPONSE.regulatory_entries[0],
            verification_status: 'VERIFIED' as any,
          },
        ],
      }
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(badStatusResponse) } }] }),
        text: async () => '',
      })
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(true)
      expect(result.data!.regulatory_entries[0].verification_status).toBe('UNVERIFIED')
    })

    it('normalises invalid status to "not_started"', async () => {
      const badStatusEntry = {
        regulatory_entries: [
          {
            ...BESS_REGULATORY_RESPONSE.regulatory_entries[0],
            status: 'unknown_status' as any,
          },
        ],
      }
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(badStatusEntry) } }] }),
        text: async () => '',
      })
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(true)
      expect(result.data!.regulatory_entries[0].status).toBe('not_started')
    })

    it('normalises invalid claim_type to "requirement"', async () => {
      const badClaimType = {
        regulatory_entries: [
          {
            ...BESS_REGULATORY_RESPONSE.regulatory_entries[0],
            claim_type: 'mandatory' as any,
          },
        ],
      }
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(badClaimType) } }] }),
        text: async () => '',
      })
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(true)
      expect(result.data!.regulatory_entries[0].claim_type).toBe('requirement')
    })
  })

  // ── Schema defaults ───────────────────────────────────────────────────────

  describe('schema defaults', () => {
    it('returns empty regulatory_entries array when LLM omits the field', async () => {
      const emptyResponse = {}
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(emptyResponse) } }] }),
        text: async () => '',
      })
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(true)
      expect(Array.isArray(result.data!.regulatory_entries)).toBe(true)
    })

    it('populates verification_note with default when LLM omits it', async () => {
      const noNoteResponse = {
        regulatory_entries: [
          {
            ...BESS_REGULATORY_RESPONSE.regulatory_entries[0],
            verification_note: undefined,
          },
        ],
      }
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(noNoteResponse) } }] }),
        text: async () => '',
      })
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(true)
      expect(result.data!.regulatory_entries[0].verification_note.length).toBeGreaterThan(0)
    })
  })

  // ── Error handling ────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns ok=false when API call fails', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal server error' })
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('returns ok=false when LLM returns invalid JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'not valid json @@##' } }] }),
        text: async () => '',
      })
      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, 'energy_storage')
      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  // ── ProductClassification object ─────────────────────────────────────────

  describe('accepts ProductClassification object as classification parameter', () => {
    it('extracts productClass string from ProductClassification object', async () => {
      mockFetch.mockResolvedValue(makeOpenRouterResponse(BESS_REGULATORY_RESPONSE))

      const classificationObj = {
        productClass: 'energy_storage',
        confidence: 0.9,
        technologyDomains: ['electrochemistry', 'power_electronics'],
        hazardDomains: ['fire_thermal_runaway', 'high_voltage'],
        manufacturingArchetype: 'electronic_assembly',
      }

      const result = await runRegulatoryExtraction(BESS_PARSED_BRIEF, classificationObj as any)
      expect(result.ok).toBe(true)

      // Check that productClass string was used in user message
      const [, init] = mockFetch.mock.calls[0]
      const body = JSON.parse(init.body)
      const userContent = body.messages[1].content as string
      expect(userContent).toContain('energy_storage')
    })
  })
})

// ── REGULATORY_EXTRACTION_SYSTEM prompt integrity ────────────────────────────

describe('REGULATORY_EXTRACTION_SYSTEM prompt integrity', () => {
  it('contains the PA Stage 4 distinctive phrase', () => {
    expect(REGULATORY_EXTRACTION_SYSTEM).toContain('regulatory compliance analyst for engineered hardware products')
  })

  it('specifies source_grade as "C"', () => {
    expect(REGULATORY_EXTRACTION_SYSTEM).toContain('"source_grade": "C"')
  })

  it('specifies verification_status as "UNVERIFIED"', () => {
    expect(REGULATORY_EXTRACTION_SYSTEM).toContain('"verification_status": "UNVERIFIED"')
  })

  it('prohibits claiming standards are met or complied with', () => {
    expect(REGULATORY_EXTRACTION_SYSTEM).toContain('NEVER claim a standard is met or complied with')
  })

  it('requires product-specific applicability explanation', () => {
    expect(REGULATORY_EXTRACTION_SYSTEM).toContain('WHY it applies to THIS specific product')
  })

  it('requires gap_action to be a concrete step with a verb', () => {
    expect(REGULATORY_EXTRACTION_SYSTEM).toContain('concrete next step with a verb')
  })

  it('does not contain JS-style inline comments inside the JSON schema block', () => {
    const lines = REGULATORY_EXTRACTION_SYSTEM.split('\n')
    let insideJsonBlock = false
    for (const line of lines) {
      if (line.trim() === '{') insideJsonBlock = true
      if (line.trim() === '}') insideJsonBlock = false
      if (insideJsonBlock && /^\s*"[^"]+"\s*:.*\/\//.test(line)) {
        throw new Error(
          `Found JS comment inside JSON schema block in REGULATORY_EXTRACTION_SYSTEM:\n  ${line.trim()}`
        )
      }
    }
  })
})
