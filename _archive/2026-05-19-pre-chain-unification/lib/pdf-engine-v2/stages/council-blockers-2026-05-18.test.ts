/**
 * @file council-blockers-2026-05-18.test.ts — BESS smoke verifying the 6
 * council blockers from engine-flow-council-2026-05-18.html.
 *
 * Council brief (TARGET diagram):
 *   B1 — G4 grammar gate: max 2 retries with manual-review badge
 *   B2 — Close FAIL branches on G1b / G3 / G5
 *   B3 — Compliance (G1b) fires BEFORE feasibility (G1)
 *   B4 — Engine A re-emit invariant + Jaccard functional-continuity check
 *   B5 — G0 symbolic physics ledger
 *   B6 — K5 retrieval confidence-grading
 *
 * Tests exercise the new units in isolation (Jest cannot import the
 * orchestrator under @react-pdf ESM boundary — same convention as the
 * existing council-blocker-3-4 + phase-f-council-blockers test suites).
 */

import { runPhysicsLedger, __test as physicsTest } from './0.1-physics-ledger'
import { runComplianceGate } from './3.5-compliance-gate'
import { checkFunctionalContinuity, buildEngineAReEmitPrompt, type BomValidationResult } from './4-bom-cost-suppliers'
import { gradeReferenceConfidence, populateCorpusClassCounts, type ReferenceRecord } from '../retrieve-references'

// ─────────────────────────────────────────────────────────────────────────────
// B5 — G0 Physics Ledger
// ─────────────────────────────────────────────────────────────────────────────

describe('B5 — G0 symbolic physics ledger', () => {
  it('rejects an explicit perpetual-motion brief', async () => {
    const brief = 'Design a perpetual motion machine producing 50 kW continuous output with no input power.'
    const r = await runPhysicsLedger(brief, null, 'energy_storage')
    expect(r.ok).toBe(true)
    expect(r.data?.verdict).toBe('HALT')
    expect(r.data?.violations.some(v => v.law === 'energy_conservation')).toBe(true)
  })

  it('rejects an over-unity output > input claim', async () => {
    const brief = 'BESS that delivers 100 kW of output power drawn from a 10 kW grid input.'
    const r = await runPhysicsLedger(brief, null, 'energy_storage')
    expect(r.ok).toBe(true)
    expect(r.data?.verdict).toBe('HALT')
    expect(r.data?.violations[0].law).toBe('energy_conservation')
  })

  it('rejects a sub-physics-floor BESS cost claim', async () => {
    // £30/kWh is below the £60/kWh stretch floor — must HALT.
    const brief = 'A 2 MWh BESS at £30 per kWh installed.'
    const r = await runPhysicsLedger(brief, null, 'energy_storage')
    expect(r.ok).toBe(true)
    expect(r.data?.verdict).toBe('HALT')
    expect(r.data?.violations.some(v => v.law === 'cost_floor')).toBe(true)
  })

  it('passes a feasible BESS brief at industry-typical cost', async () => {
    const brief = 'A 2 MWh utility-scale BESS at £200/kWh installed, indoor commercial deployment.'
    const r = await runPhysicsLedger(brief, null, 'energy_storage')
    expect(r.ok).toBe(true)
    expect(r.data?.verdict).toBe('PASS')
    expect(r.data?.violations).toHaveLength(0)
  })

  it('rejects a brief claiming solar density above the solar constant', async () => {
    const brief = 'A HAPS platform with solar panels delivering 2000 W/m².'
    const r = await runPhysicsLedger(brief, null, 'haps')
    expect(r.ok).toBe(true)
    expect(r.data?.verdict).toBe('HALT')
    expect(r.data?.violations.some(v => v.law === 'power_density')).toBe(true)
  })

  it('falls open on an unknown class', async () => {
    const brief = 'Build a widget.'
    const r = await runPhysicsLedger(brief, null, 'unknown_class')
    expect(r.ok).toBe(true)
    expect(r.data?.fail_open).toBe(true)
    expect(r.data?.verdict).toBe('PASS')
  })

  it('class-resolver collapses synonyms to canonical keys', () => {
    expect(physicsTest.resolveClassKey('BESS')).toBe('energy_storage')
    expect(physicsTest.resolveClassKey('heat pump')).toBe('thermal_system')
    expect(physicsTest.resolveClassKey('drone')).toBe('drone')
    expect(physicsTest.resolveClassKey('haps')).toBe('haps')
    expect(physicsTest.resolveClassKey('')).toBe('unknown')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B3 — Compliance precedes feasibility (functional behaviour of the gate,
//      not the orchestrator wiring — that is exercised in the smoke test).
// ─────────────────────────────────────────────────────────────────────────────

describe('B3 — Compliance gate (G1b) catches indoor-residential BESS', () => {
  it('HALTs on UL 9540 cited for an indoor residential BESS', async () => {
    const brief = 'An indoor residential BESS for a UK home, certified to UL 9540.'
    const r = await runComplianceGate(brief, null, 'energy_storage')
    expect(r.ok).toBe(true)
    expect(r.data?.verdict).toBe('HALT')
    expect(r.data?.conflicts.some(c => c.standard_code === 'UL 9540')).toBe(true)
  })

  it('PASSes an outdoor commercial BESS with a thermal envelope declared', async () => {
    const brief = 'A commercial outdoor BESS installation for grid-scale utility-scale service.'
    const r = await runComplianceGate(brief, {
      project_id: 'p',
      confidence: 'HIGH',
      product_class: 'energy_storage',
      constraints: {
        operating_environment: { temp_min_c: -20, temp_max_c: 50 },
        safety_standards: [{ code: 'UL 9540', standard: 'UL 9540' }],
      },
    } as any, 'energy_storage')
    expect(r.ok).toBe(true)
    expect(r.data?.verdict).not.toBe('HALT')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B4 — Engine A re-emit invariant + Jaccard check
// ─────────────────────────────────────────────────────────────────────────────

describe('B4 — Engine A re-emit invariant + Jaccard functional-continuity', () => {
  it('re-emit prompt now carries the INVARIANTS section', () => {
    const result: BomValidationResult = {
      in_band: false,
      pct_deviation: 80,
      direction: 'high',
      metric_value: 250,
      metric_label: '£/kWh installed',
      band_low: 100,
      band_high: 150,
      top_outliers: [
        { name: 'LFP cell', id: 'c1', quantity: 4900, unit_price_gbp: 12.5, line_total_gbp: 61250, source: 'unknown' },
      ],
      installed_asp_gbp: 1000000,
      raw_bom_gbp: 250000,
      cost_stack: {} as any,
      class_key: 'energy_storage',
      verdict: 'high',
      diagnostic: 'Over band',
    }
    const prompt = buildEngineAReEmitPrompt(result)
    expect(prompt).toContain('INVARIANTS')
    expect(prompt).toContain('functional decomposition')
    expect(prompt).toContain('functional_category')
    expect(prompt).toContain('NOT allowed: replacing a [function X] component with a [function Y] component')
  })

  it('functional-continuity check PASSES a within-class correction', () => {
    const original = [{ name: '280Ah LFP cell' }, { name: 'PCS inverter' }, { name: 'BMS controller' }]
    const newLines = [{ name: '314Ah LFP cell' }, { name: 'PCS inverter v2' }, { name: 'BMS controller' }]
    const r = checkFunctionalContinuity(original, newLines)
    expect(r.preserved).toBe(true)
    expect(r.missing).toHaveLength(0)
  })

  it('functional-continuity check REJECTS a substitution across functional classes', () => {
    // Original had cell + pcs + bms; new BoM dropped cell entirely and added enclosure + interconnect.
    const original = [{ name: 'LFP cell' }, { name: 'PCS inverter' }, { name: 'BMS controller' }]
    const newLines = [{ name: 'steel cabinet' }, { name: 'busbar set' }, { name: 'wiring harness' }]
    const r = checkFunctionalContinuity(original, newLines)
    expect(r.preserved).toBe(false)
    expect(r.missing).toEqual(expect.arrayContaining(['cell', 'pcs', 'control']))
  })

  it('functional-continuity tolerates a single category disappearing when the rest are preserved', () => {
    // Drop 'safety', preserve cell + pcs + control + enclosure = 1 of 5 missing (20 %).
    const original = [
      { name: 'LFP cell' },
      { name: 'PCS inverter' },
      { name: 'BMS controller' },
      { name: 'steel enclosure' },
      { name: 'fire suppression' },
    ]
    const newLines = [
      { name: 'LFP cell v2' },
      { name: 'PCS inverter v2' },
      { name: 'BMS controller' },
      { name: 'steel enclosure' },
    ]
    const r = checkFunctionalContinuity(original, newLines)
    // 1 missing of 5 originals = 20 %, threshold is ≤ 20 % → preserved.
    expect(r.preserved).toBe(true)
  })

  it('functional-continuity REJECTS addition-inflation (3-seat micro-council follow-up)', () => {
    // Original = 3 categories (cell, pcs, control). LLM keeps all three and
    // pads with 4 new categories to dilute £/kWh. Jaccard = 3 / 7 = 0.429 < 0.8.
    const original = [{ name: 'LFP cell' }, { name: 'PCS inverter' }, { name: 'BMS controller' }]
    const newLines = [
      { name: 'LFP cell' },
      { name: 'PCS inverter' },
      { name: 'BMS controller' },
      { name: 'enclosure cabinet' },
      { name: 'busbar wiring' },
      { name: 'fire suppression' },
      { name: 'civil installation' },
    ]
    const r = checkFunctionalContinuity(original, newLines)
    expect(r.preserved).toBe(false)
    expect(r.jaccard).toBeLessThan(0.8)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B6 — K5 retrieval confidence grading
// ─────────────────────────────────────────────────────────────────────────────

describe('B6 — K5 reference-confidence grading', () => {
  const baseRec: ReferenceRecord = {
    table: 'pretraining_extracted_parts',
    id: 1,
    document_id: 1,
    score: 0.7,
    product_class: 'energy_storage',
    manufacturer_doc: null,
    product_name: null,
    source_url: null,
    part_name: null,
    manufacturer: null,
    part_number: null,
    quantity: null,
    unit_price_gbp: null,
    module_assignment: null,
    spec_key: null,
    spec_value: null,
    spec_unit: null,
    company_name: null,
    role: null,
    standard_name: null,
    scope: null,
    raw_excerpt: null,
    composed_text: null,
  }

  it('grades a canonical product in a dense class as HIGH', () => {
    populateCorpusClassCounts({ energy_storage: 50 })
    const rec: ReferenceRecord = {
      ...baseRec,
      product_name: 'Tesla Megapack',
      score: 0.7,
    }
    expect(gradeReferenceConfidence(rec, 'energy_storage')).toBe('high')
  })

  it('grades a niche product in a sparse class as LOW', () => {
    populateCorpusClassCounts({ energy_storage: 3 })
    const rec: ReferenceRecord = {
      ...baseRec,
      product_name: 'Obscure BESS Inc Model X',
      score: 0.6,
    }
    expect(gradeReferenceConfidence(rec, 'energy_storage')).toBe('low')
  })

  it('grades a low-cosine record as LOW even with a dense class', () => {
    populateCorpusClassCounts({ energy_storage: 50 })
    const rec: ReferenceRecord = {
      ...baseRec,
      product_name: 'Some BESS model',
      score: 0.3,
    }
    expect(gradeReferenceConfidence(rec, 'energy_storage')).toBe('low')
  })

  it('defaults to MODERATE for mid-density / mid-cosine records', () => {
    populateCorpusClassCounts({ energy_storage: 7 })
    const rec: ReferenceRecord = {
      ...baseRec,
      product_name: 'Generic BESS',
      score: 0.55,
    }
    expect(gradeReferenceConfidence(rec, 'energy_storage')).toBe('moderate')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B3 + B5 PIPELINE-ORDER SMOKE — BESS brief flows through the new gates.
//
// The orchestrator (index.ts) cannot be imported by Jest under the @react-pdf
// ESM boundary; this smoke replicates the gate call order from index.ts and
// verifies that an adversarial brief routes to HALT before downstream stages
// see it. Mirrors the pattern in council-blocker-3-4.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

describe('B3 + B5 — adversarial BESS brief smoke through G0 + G1b', () => {
  it('BESS perpetual-motion brief: G0 HALT fires before G1b is consulted', async () => {
    const brief = 'A 50 kW BESS perpetual motion machine for £0 installed.'
    const g0 = await runPhysicsLedger(brief, null, 'energy_storage')
    expect(g0.data?.verdict).toBe('HALT')
    // The pipeline folds G0 HALT into feasibility=RED; G1b would still run
    // (deterministic, cheap) but its verdict is redundant once G0 has halted.
    // Confirm G1b doesn't crash on the same brief.
    const g1b = await runComplianceGate(brief, null, 'energy_storage')
    expect(g1b.ok).toBe(true)
  })

  it('BESS indoor-residential UL 9540 brief: G0 PASS, G1b HALT', async () => {
    const brief = 'A 10 kWh indoor residential BESS for a UK home, certified to UL 9540.'
    const g0 = await runPhysicsLedger(brief, null, 'energy_storage')
    expect(g0.data?.verdict).toBe('PASS')
    const g1b = await runComplianceGate(brief, null, 'energy_storage')
    expect(g1b.data?.verdict).toBe('HALT')
    expect(g1b.data?.conflicts.some(c => c.standard_code === 'UL 9540')).toBe(true)
  })

  it('BESS feasible commercial brief: G0 PASS, G1b PASS or WARN', async () => {
    const brief = 'A 2 MWh outdoor commercial BESS at £200/kWh installed, operating -20 to 50 °C, UL 9540 + NFPA 855.'
    const g0 = await runPhysicsLedger(brief, null, 'energy_storage')
    expect(g0.data?.verdict).toBe('PASS')
    const g1b = await runComplianceGate(brief, {
      project_id: 'p',
      confidence: 'HIGH',
      product_class: 'energy_storage',
      constraints: {
        operating_environment: { temp_min_c: -20, temp_max_c: 50 },
        safety_standards: [
          { code: 'UL 9540', standard: 'UL 9540' },
          { code: 'NFPA 855', standard: 'NFPA 855' },
        ],
      },
    } as any, 'energy_storage')
    expect(g1b.ok).toBe(true)
    expect(g1b.data?.verdict).not.toBe('HALT')
  })
})
