/**
 * @file brief-validator.test.ts — PA path validation tests
 *
 * Covers the fix introduced in:
 *   fix(pdf-engine-v2): brief-validator allows HIGH+missing>0 to run full pipeline
 *
 * Old behaviour: missingRequired.length === 0 → any missing field blocked the pipeline.
 * New behaviour: only block when core_constraints_present is false (no project_id,
 * no product_description, OR no physical/cost anchor).  Missing optional fields are
 * demoted to warnings; the report-type router (PA Stage 9) decides report length.
 */

import { validateBrief } from './brief-validator'
import type { StructuredBriefJSON } from './types'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeFullBrief(overrides: Partial<StructuredBriefJSON> = {}): StructuredBriefJSON {
  return {
    project_id: 'test-project',
    product_description: 'A pharma bioreactor for cell culture at 50 L scale',
    mission_statement: 'Produce a GMP-ready bioreactor',
    target_customers: 'Biopharma CDMOs',
    why_now: 'Surge in cell therapy demand',
    constraints: {
      unit_cost_ceiling: { value: 45000, currency: 'GBP', source: 'user' },
      max_mass_kg: { value: 120, source: 'user' },
      max_dimensions_mm: { w: 800, d: 600, h: 1800, source: 'user' },
      target_performance: { key_metric: 'dissolved_oxygen', value: 95, unit: '%', source: 'user' },
      target_process: { value: 'fed-batch', source: 'user' },
      target_material: { value: '316L stainless steel', source: 'user' },
      batch_size: { value: 10, source: 'user' },
      design_life: { value: '10 years', source: 'user' },
      operating_environment: { temp_min_c: 15, temp_max_c: 40, source: 'user' },
      safety_standards: [{ standard: 'ISO 13485', source: 'user' }],
      additional_constraints: [],
    },
    missing_mandatory_fields: [],
    confidence: 'HIGH',
    ...overrides,
  }
}

const DUMMY_TEXT = 'bioreactor brief text'
const DUMMY_FIELDS = ['unit_cost_ceiling', 'max_mass_kg']

// ── PA path tests ──────────────────────────────────────────────────────────

describe('validateBrief — PA path (parsedBrief provided)', () => {
  describe('HIGH confidence', () => {
    it('passes when 0 mandatory fields are missing (BESS/drone baseline case)', () => {
      const brief = makeFullBrief({ confidence: 'HIGH', missing_mandatory_fields: [] })
      const result = validateBrief(DUMMY_TEXT, null, 'biomedical', DUMMY_FIELDS, brief)
      expect(result.isValid).toBe(true)
      expect(result.canProceedToFullReport).toBe(true)
      expect(result.blockedReasons).toHaveLength(0)
    })

    it('passes when 3 mandatory fields are missing (bioreactor baseline case)', () => {
      const brief = makeFullBrief({
        confidence: 'HIGH',
        missing_mandatory_fields: ['target_process', 'batch_size', 'design_life'],
      })
      const result = validateBrief(DUMMY_TEXT, null, 'biomedical', DUMMY_FIELDS, brief)
      expect(result.isValid).toBe(true)
      expect(result.canProceedToFullReport).toBe(true)
      expect(result.blockedReasons).toHaveLength(0)
      // Missing fields demoted to warning, not a block
      expect(result.warnings.some(w => w.includes('3 mandatory field(s) missing'))).toBe(true)
    })

    it('passes when 10 mandatory fields are missing (very thin HIGH-confidence brief)', () => {
      const brief = makeFullBrief({
        confidence: 'HIGH',
        missing_mandatory_fields: [
          'target_process', 'batch_size', 'design_life',
          'target_material', 'operating_environment', 'safety_standards',
          'target_performance', 'jurisdiction', 'production_volume', 'architecture_type',
        ],
      })
      const result = validateBrief(DUMMY_TEXT, null, 'industrial', DUMMY_FIELDS, brief)
      expect(result.isValid).toBe(true)
      // Router will decide to produce short-form — validator does NOT block
      expect(result.blockedReasons).toHaveLength(0)
    })
  })

  describe('LOW confidence', () => {
    it('passes when 0 mandatory fields are missing (LOW confidence but complete)', () => {
      const brief = makeFullBrief({ confidence: 'LOW', missing_mandatory_fields: [] })
      const result = validateBrief(DUMMY_TEXT, null, 'biomedical', DUMMY_FIELDS, brief)
      expect(result.isValid).toBe(true)
      expect(result.warnings.some(w => w.includes('LOW'))).toBe(true)
    })

    it('passes when 3 mandatory fields are missing with LOW confidence (router will shorten)', () => {
      const brief = makeFullBrief({
        confidence: 'LOW',
        missing_mandatory_fields: ['target_process', 'batch_size', 'design_life'],
      })
      const result = validateBrief(DUMMY_TEXT, null, 'biomedical', DUMMY_FIELDS, brief)
      // Validator passes — router applies BRIEF_INCOMPLETE cap if >5 missing
      expect(result.isValid).toBe(true)
      expect(result.blockedReasons).toHaveLength(0)
    })
  })

  describe('MEDIUM confidence', () => {
    it('passes with 5 missing fields', () => {
      const brief = makeFullBrief({
        confidence: 'MEDIUM',
        missing_mandatory_fields: ['target_process', 'batch_size', 'design_life', 'jurisdiction', 'safety_standards'],
      })
      const result = validateBrief(DUMMY_TEXT, null, 'industrial', DUMMY_FIELDS, brief)
      expect(result.isValid).toBe(true)
    })
  })

  describe('completely empty / unparseable brief — BLOCKED', () => {
    it('blocks when project_id is missing', () => {
      const brief = makeFullBrief({ project_id: '', missing_mandatory_fields: [] })
      const result = validateBrief(DUMMY_TEXT, null, 'biomedical', DUMMY_FIELDS, brief)
      expect(result.isValid).toBe(false)
      expect(result.blockedReasons.some(r => r.includes('project_id'))).toBe(true)
    })

    it('blocks when product_description is missing', () => {
      const brief = makeFullBrief({ product_description: '', missing_mandatory_fields: [] })
      const result = validateBrief(DUMMY_TEXT, null, 'biomedical', DUMMY_FIELDS, brief)
      expect(result.isValid).toBe(false)
      expect(result.blockedReasons.some(r => r.includes('product_description'))).toBe(true)
    })

    it('blocks when no physical/cost anchor is present (all anchor values are null)', () => {
      const brief = makeFullBrief({
        missing_mandatory_fields: [],
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
      })
      const result = validateBrief(DUMMY_TEXT, null, 'biomedical', DUMMY_FIELDS, brief)
      expect(result.isValid).toBe(false)
      expect(result.blockedReasons.some(r => r.includes('anchor'))).toBe(true)
    })

    it('passes when only max_dimensions_mm.w is non-null (partial anchor is enough)', () => {
      const brief = makeFullBrief({
        missing_mandatory_fields: [],
        constraints: {
          unit_cost_ceiling: { value: null, currency: 'GBP', source: 'inferred' },
          max_mass_kg: { value: null, source: 'inferred' },
          max_dimensions_mm: { w: 800, d: null, h: null, source: 'user' },
          target_performance: { key_metric: null, value: null, unit: null, source: 'inferred' },
          target_process: { value: null, source: 'inferred' },
          target_material: { value: null, source: 'inferred' },
          batch_size: { value: null, source: 'inferred' },
          design_life: { value: null, source: 'inferred' },
          operating_environment: { temp_min_c: null, temp_max_c: null, source: 'inferred' },
          safety_standards: [],
          additional_constraints: [],
        },
      })
      const result = validateBrief(DUMMY_TEXT, null, 'biomedical', DUMMY_FIELDS, brief)
      expect(result.isValid).toBe(true)
    })
  })

  describe('missing_mandatory_fields surfaced as missingRequired', () => {
    it('exposes missing fields on the result even when isValid=true', () => {
      const brief = makeFullBrief({
        confidence: 'HIGH',
        missing_mandatory_fields: ['jurisdiction', 'safety_standards'],
      })
      const result = validateBrief(DUMMY_TEXT, null, 'industrial', DUMMY_FIELDS, brief)
      expect(result.isValid).toBe(true)
      expect(result.missingRequired).toEqual(['jurisdiction', 'safety_standards'])
    })
  })
})

// ── Legacy path tests (no parsedBrief) — existing behaviour unchanged ──────

describe('validateBrief — legacy path (no parsedBrief)', () => {
  it('passes when all required fields are present in designBrief', () => {
    const designBrief = {
      constraints: { unitCostCeilingGbp: 50000 },
      max_mass_kg: 100,
    }
    const result = validateBrief(
      'a full brief with cost and mass details',
      designBrief as any,
      'industrial',
      ['unitCostCeilingGbp'],
      null,
    )
    // Legacy path: checks designBrief fields
    expect(result.isValid).toBe(true)
  })

  it('blocks when unitCostCeilingGbp is £0.00', () => {
    const designBrief = { constraints: { unitCostCeilingGbp: 0 } }
    const result = validateBrief(
      'brief text without cost',
      designBrief as any,
      'industrial',
      [],
      null,
    )
    expect(result.isValid).toBe(false)
    expect(result.blockedReasons.some(r => r.includes('£0.00'))).toBe(true)
  })
})
