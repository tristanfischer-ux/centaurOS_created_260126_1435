#!/usr/bin/env -S npx tsx
/**
 * smoke-compliance-gate.tsx — run the P5b deterministic compliance gate
 * against 3 sample briefs (BESS / heat pump / CGM) and print the verdict +
 * any hard / soft conflicts + revision suggestion.
 *
 * Pure-deterministic — no LLM cost. Use for regression-checking the gate
 * after edits to class-standards.ts or the rule list.
 *
 * Usage:  npx tsx scripts/smoke-compliance-gate.tsx
 */

import { runComplianceGate } from '../src/lib/pdf-engine-v2/stages/3.5-compliance-gate'
import type { StructuredBriefJSON } from '../src/lib/pdf-engine-v2/types'

interface Sample {
  label: string
  brief: string
  parsed: StructuredBriefJSON | null
  productClass: string
}

function emptyConstraints(extra: Partial<StructuredBriefJSON['constraints']> = {}): StructuredBriefJSON['constraints'] {
  return {
    unit_cost_ceiling: { value: null, currency: 'GBP', source: 'missing' },
    max_mass_kg: { value: null, source: 'missing' },
    max_dimensions_mm: { w: null, d: null, h: null, source: 'missing' },
    target_performance: { key_metric: null, value: null, unit: null, source: 'missing' },
    target_process: { value: null, source: 'missing' },
    target_material: { value: null, source: 'missing' },
    batch_size: { value: null, source: 'missing' },
    design_life: { value: null, source: 'missing' },
    operating_environment: { temp_min_c: null, temp_max_c: null, source: 'missing' },
    safety_standards: [],
    additional_constraints: [],
    ...extra,
  }
}

function mkParsedBrief(opts: { product_description: string; safety_codes?: string[]; env?: { min: number | null; max: number | null } }): StructuredBriefJSON {
  return {
    project_id: 'smoke-test',
    product_description: opts.product_description,
    mission_statement: '',
    target_customers: '',
    why_now: '',
    constraints: emptyConstraints({
      safety_standards: (opts.safety_codes ?? []).map(c => ({ standard: c, code: c, source: 'user' })),
      operating_environment: {
        temp_min_c: opts.env?.min ?? null,
        temp_max_c: opts.env?.max ?? null,
        source: opts.env ? 'user' : 'missing',
      },
    }),
    missing_mandatory_fields: [],
    confidence: 'HIGH',
  }
}

const SAMPLES: Sample[] = [
  // 1. BESS — indoor residential citing UL 9540 → HARD CONFLICT (P5b key example)
  {
    label: 'BESS · indoor residential citing UL 9540 (HALT)',
    brief:
      '5 kWh battery energy storage system for indoor residential use, wall-mounted in a UK home utility room. LFP cells, certified to UL 9540 for safe operation. AC-coupled to the home consumer unit.',
    parsed: mkParsedBrief({
      product_description: 'Indoor residential 5 kWh BESS, UK home, LFP, UL 9540 certified',
      safety_codes: ['UL 9540', 'IEC 62619'],
    }),
    productClass: 'energy_storage',
  },
  // 2. Heat pump — UK residential, R290, no EN 378 acknowledgement → HALT
  {
    label: 'Heat pump · R290 indoor residential no EN 378 (HALT)',
    brief:
      'Air-source heat pump for residential UK homes. Uses R290 (propane) refrigerant for low GWP. 5 kW heating output. MCS certified for Boiler Upgrade Scheme eligibility.',
    parsed: mkParsedBrief({
      product_description: 'R290 air-source heat pump, UK residential, 5 kW, MCS-certified',
      safety_codes: ['MCS', 'EU 517/2014'],
    }),
    productClass: 'thermal_system',
  },
  // 3. CGM — UK only, IVDR named, no FDA → PASS (no US targeting; should be clean)
  {
    label: 'CGM · UK-only IVDR-targeted (expected PASS or WARN only)',
    brief:
      'Continuous glucose monitor patch for adults with Type 2 diabetes. UK and EU markets. 14-day wear time. Compliant with EU IVDR 2017/746, ISO 13485 QMS, ISO 14971 risk management, IEC 62304 software life-cycle. BLE 5.2 link to companion app.',
    parsed: mkParsedBrief({
      product_description: 'UK/EU CGM patch, 14 d, IVDR + ISO 13485 + ISO 14971 + IEC 62304',
      safety_codes: ['EU IVDR 2017/746', 'ISO 13485', 'ISO 14971', 'IEC 62304'],
    }),
    productClass: 'wearable_medical',
  },
  // Extra positive control for CGM US → HALT
  {
    label: 'CGM · US-targeted no FDA pathway (HALT control)',
    brief:
      'Continuous glucose monitor patch for US market. 14-day wear time, BLE 5.2 link to phone, accuracy ≥95 % within ±15 mg/dL.',
    parsed: mkParsedBrief({
      product_description: 'US CGM patch, no FDA pathway named',
      safety_codes: ['ISO 13485'],
    }),
    productClass: 'wearable_medical',
  },
]

async function main() {
  console.log('# P5b Compliance Gate smoke test\n')
  for (const s of SAMPLES) {
    console.log(`────────────────────────────────────────────────────────`)
    console.log(`SAMPLE: ${s.label}`)
    console.log(`Class:  ${s.productClass}`)
    console.log(`Brief:  ${s.brief.slice(0, 140)}…`)
    const r = await runComplianceGate(s.brief, s.parsed, s.productClass)
    if (!r.ok || !r.data) {
      console.log(`  RESULT: gate ERRORED — ${r.error}`)
      continue
    }
    console.log(`  VERDICT: ${r.data.verdict}`)
    console.log(`  REASON:  ${r.data.reason}`)
    console.log(`  POSTURE: ${r.data.posture_summary}`)
    if (r.data.conflicts.length > 0) {
      console.log(`  CONFLICTS (${r.data.conflicts.length}):`)
      for (const c of r.data.conflicts) {
        console.log(`    • ${c.severity.toUpperCase()} · ${c.standard_code} · ${c.conflict_type}`)
        console.log(`      ${c.reason.slice(0, 180)}…`)
      }
    }
    if (r.data.revision_suggestion) {
      console.log(`  REVISION SUGGESTION (field: ${r.data.revision_suggestion.field}):`)
      console.log(`    original  → ${r.data.revision_suggestion.original}`)
      console.log(`    suggested → ${r.data.revision_suggestion.suggested}`)
    }
    console.log(`  Duration: ${r.durationMs}ms`)
  }
  console.log('\n# done')
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
