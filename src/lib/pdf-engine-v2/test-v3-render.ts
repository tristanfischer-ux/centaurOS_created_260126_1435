#!/usr/bin/env npx tsx
/**
 * @file test-v3-render.ts — Test render for 7-pdf-v3.tsx
 *
 * Usage:
 *   npx tsx src/lib/pdf-engine-v2/test-v3-render.ts
 *
 * Renders the v3 renderer against a sparse PipelineState that simulates
 * r1-cgm (most upstream fields missing — the Path B fallback scenario).
 * Writes output to /tmp/test-v3-render.pdf
 */

import React from 'react'
import { pdf } from '@react-pdf/renderer'
import { writeFileSync } from 'fs'
import PdfRendererV3 from './stages/7-pdf-v3'
import type { PipelineState } from './types'

// Sparse state simulating r1-cgm: most upstream fields are missing.
// The renderer must not crash and must show fallback text.
const sparseState: PipelineState = {
  projectId: 'r1-cgm-test',
  briefText: 'A wearable continuous glucose monitor for diabetic patients. Target cost £150, batch 500/year, CE marked for EU market.',
  productClass: 'medical_device',
  research: {
    report: 'CGM device research...',
    sources: [],
    industryDomain: 'medical_device',
    designBrief: {
      useCase: 'Wearable continuous glucose monitor for Type 1 and Type 2 diabetic patients',
      targetProcess: 'Injection moulding + PCB assembly',
      targetMaterial: 'Medical-grade polymer + electronics',
      toleranceTarget: '±0.1mm',
      quantityTarget: '500 units/year',
      complianceNotes: 'CE marking required, ISO 13485',
      mission: 'Enable continuous glucose monitoring for diabetic patients with a discreet, comfortable wearable device at a price accessible to NHS procurement.',
      targetCustomers: 'NHS procurement, private healthcare, and direct-to-consumer in EU/UK markets.',
      whyNow: 'CGM technology is reaching the maturity point where costs are dropping sufficiently for mass-market adoption.',
      constraints: {
        unitCostCeilingGbp: 150,
        maxMassKg: 0.05,
        batchSize: 500,
        jurisdiction: 'UK/EU',
      },
      regulatory: [
        {
          code: 'MDR 2017/745',
          name: 'EU Medical Device Regulation',
          summary: 'Applies to all medical devices sold in the EU including Class IIb diagnostic devices.',
          status: 'not-started',
          applicability: 'CGM is classified as Class IIb under MDR. Requires notified body assessment.',
          designImpact: 'All design decisions must be documented under Design History File. QMS required.',
          evidenceRequired: 'Clinical evidence, biocompatibility testing, software validation.',
          ownerRole: 'Regulatory Affairs Manager',
          gapAction: 'Engage notified body (e.g. BSI, SGS) for conformity assessment pathway.',
        },
        {
          code: 'ISO 13485:2016',
          name: 'Medical Devices Quality Management System',
          summary: 'QMS standard for medical device design and manufacture.',
          status: 'not-started',
          applicability: 'Required for MDR compliance.',
          designImpact: 'Full design controls, risk management, and traceability required.',
          evidenceRequired: 'Certified QMS, design controls documentation.',
          ownerRole: 'Quality Manager',
          gapAction: 'Implement ISO 13485 QMS before design freeze.',
        },
      ],
      sources: [
        {
          title: 'MHRA CGM guidance 2023',
          type: 'Regulatory guidance',
          relevance: 'UK post-Brexit CGM classification guidance',
        },
      ],
    },
  },
  modules: [
    {
      id: 'mod-sensor',
      name: 'Biosensor Module',
      purpose: 'Electrochemical glucose measurement using enzyme-based biosensor chemistry.',
      inputs: ['interstitial fluid glucose'],
      outputs: ['glucose concentration signal'],
      keyParts: ['glucose oxidase enzyme', 'platinum electrode', 'membrane'],
      leadWeeks: 12,
      estimatedMassKg: 0.005,
      description: 'Enzymatic amperometric glucose sensor with three-electrode configuration.',
      whyItMatters: 'Core measurement technology — determines accuracy and sensor lifetime.',
      failureModes: ['enzyme degradation', 'electrode fouling', 'membrane delamination'],
      unknowns: ['long-term drift rate', 'calibration frequency'],
      status: 'concept',
      riskMatrix: [
        {
          id: 'R001',
          hazard: 'Sensor reading drift leading to incorrect insulin dosing',
          cause: 'Enzyme degradation over sensor lifetime',
          consequence: 'Patient over- or under-doses insulin with potential clinical harm',
          existingControls: 'Factory calibration, on-device calibration prompts',
          severity: 9,
          likelihood: 4,
          detection: 3,
          mitigation: 'Implement drift detection algorithm with mandatory recalibration alert',
          verificationTest: 'ISO 15197 accuracy testing across 14-day wear period',
          owner: 'Systems Engineer',
        },
      ],
    },
    {
      id: 'mod-electronics',
      name: 'Electronics and Connectivity Module',
      purpose: 'Signal processing, Bluetooth LE transmission, and power management.',
      inputs: ['sensor signal'],
      outputs: ['glucose readings via Bluetooth LE'],
      keyParts: ['ASIC', 'BLE SoC', 'battery'],
      leadWeeks: 8,
      estimatedMassKg: 0.015,
      description: 'Low-power electronics board with dedicated glucose signal ASIC, BLE 5.0 SoC, and coin cell battery.',
      whyItMatters: 'Enables wireless data transmission to smartphone app and determines battery life.',
      failureModes: ['battery depletion', 'BLE connection loss', 'ASIC fault'],
      unknowns: ['RF interference in clinical settings'],
      status: 'concept',
      riskMatrix: [],
    },
  ],
  dimensionSheet: {
    feasible: true,
    rules_domain: 'wearable_medical',
    envelope: {
      kind: 'wearable_patch',
      label: 'Wearable patch envelope',
      interior_w_mm: 45,
      interior_d_mm: 35,
      interior_h_mm: 8,
      interior_floor_m2: 0.001575,
      interior_volume_m3: 0.0000126,
    },
    target: { floor_m2: 0.001575 },
    floor_budget_m2: 0.001575,
    module_dimensions: {
      'Biosensor Module': { w_mm: 20, d_mm: 15, h_mm: 2, floor_m2: 0.0003, mount: 'adhesive', scaled_by: 'nominal' },
      'Electronics Module': { w_mm: 30, d_mm: 25, h_mm: 4, floor_m2: 0.00075, mount: 'adhesive', scaled_by: 'nominal' },
    },
    conflicts: [],
    recommendations: ['Thermal management not required at this power level.'],
  },
  parts: [
    {
      id: 'part-001',
      partNumber: 'CGM-SNS-001',
      name: 'Glucose Oxidase Enzyme Biosensor Strip',
      sourceModuleId: 'mod-sensor',
      isPurchased: true,
      estimatedUnitCostGbp: 8.5,
    },
    {
      id: 'part-002',
      partNumber: 'CGM-BLE-001',
      name: 'Nordic nRF5340 BLE SoC',
      sourceModuleId: 'mod-electronics',
      isPurchased: true,
      estimatedUnitCostGbp: 3.2,
    },
    {
      id: 'part-003',
      partNumber: 'CGM-BAT-001',
      name: 'CR2032 Coin Cell Battery',
      sourceModuleId: 'mod-electronics',
      isPurchased: true,
      estimatedUnitCostGbp: 0.45,
    },
    {
      id: 'part-004',
      partNumber: 'CGM-ENC-001',
      name: 'Medical Grade Polymer Housing',
      sourceModuleId: 'mod-electronics',
      isPurchased: false,
      estimatedUnitCostGbp: 4.2,
      process: 'injection moulding',
      material: 'medical grade polycarbonate',
    },
  ],
  bomLines: [
    { childPartId: 'CGM-SNS-001', quantity: 1 },
    { childPartId: 'CGM-BLE-001', quantity: 1 },
    { childPartId: 'CGM-BAT-001', quantity: 2 },
    { childPartId: 'CGM-ENC-001', quantity: 1 },
  ],
  costBreakdown: {
    unitTotalGbp: 98.5,
    ceilingGbp: 150,
    perModule: [
      { moduleName: 'Biosensor Module', totalGbp: 8.5 },
      { moduleName: 'Electronics and Connectivity Module', totalGbp: 8.3 },
    ],
    overheadMultiplier: 1.5,
    nreTotalGbp: 120000,
    rawBomCostGbp: 65.67,
  },
  reviews: [],
  suppliers: [],
  proofreadFindings: null,
  sourceAttributions: [
    { section: 'research', source: 'llm', detail: 'Claude Opus' },
  ],
  llmAttributions: [],
  sectionScores: [],
}

async function main() {
  console.log('[test-v3] Rendering v3 PDF against sparse r1-cgm state...')
  console.log(`[test-v3] State: ${sparseState.modules.length} modules, ${sparseState.parts.length} parts`)

  try {
    const doc = React.createElement(PdfRendererV3, { state: sparseState }) as any
    const blob = await pdf(doc).toBlob()
    const buffer = Buffer.from(await blob.arrayBuffer())
    const outPath = '/tmp/test-v3-render.pdf'
    writeFileSync(outPath, buffer)
    console.log(`[test-v3] SUCCESS — ${buffer.length} bytes written to ${outPath}`)
    console.log('[test-v3] Fallback test PASSED — no crash on sparse state.')
  } catch (err) {
    console.error('[test-v3] FAILED:', err)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('[test-v3] Unhandled error:', err)
  process.exit(1)
})
