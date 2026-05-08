/**
 * @file test-bom-v2.ts — Smoke test for the integrated BOM/Cost/Suppliers stage.
 *
 * Runs the integrated stage against the r1-cgm (Wearable CGM) pipeline state.
 * Uses pre-extracted modules from the r1-cgm brief; does NOT run the full pipeline.
 *
 * Usage: npx tsx src/lib/pdf-engine-v2/test-bom-v2.ts
 */

import { lookupSkuLcsc } from './lib/distributors/lcsc'
import { runBomCostSuppliers } from './stages/4-bom-cost-suppliers'
import type { Module } from './types'

// ── LCSC stub smoke test ──────────────────────────────────────────────────────

async function testLcscStub() {
  console.log('\n[test] === LCSC Stub Test ===')
  // Should return null when LCSC_API_KEY is absent (which it is in this env)
  const wasSet = !!process.env.LCSC_API_KEY
  delete process.env.LCSC_API_KEY

  const result = await lookupSkuLcsc('ATMEGA328P-PU')
  if (result !== null) {
    throw new Error('[test] LCSC stub should return null when API key absent — returned non-null!')
  }
  console.log('[test] ✓ LCSC stub returns null gracefully when LCSC_API_KEY is absent')

  if (wasSet) process.env.LCSC_API_KEY = 'dummy-restored'
}

// ── Minimal module set from r1-cgm brief ─────────────────────────────────────

const CGM_MODULES: Module[] = [
  {
    id: 'sensor-patch',
    name: 'Enzyme-Coated Microneedle Sensor',
    purpose: 'Interstitial glucose sensing at 1 Hz for 14 days',
    inputs: ['skin contact', 'glucose concentration'],
    outputs: ['electrochemical signal'],
    keyParts: ['microneedle array', 'glucose oxidase enzyme layer', 'working electrode', 'reference electrode', 'counter electrode'],
    leadWeeks: 16,
    estimatedMassKg: 0.002,
    description: 'Single-use 14-day disposable patch with enzyme-coated microneedles for continuous glucose sensing',
    whyItMatters: 'Core sensing element — determines MARD and wear duration',
    failureModes: ['enzyme denaturation', 'microneedle breakage', 'fouling'],
    unknowns: ['in vivo calibration drift rate'],
    status: 'concept',
  },
  {
    id: 'asic-potentiostat',
    name: 'Potentiostat ASIC',
    purpose: 'Low-power electrochemical signal conditioning and ADC',
    inputs: ['electrode current signal'],
    outputs: ['digital glucose reading', 'BLE data packet'],
    keyParts: ['custom ASIC', 'LiMnO2 primary cell', 'flexible PCB'],
    leadWeeks: 24,
    estimatedMassKg: 0.003,
    description: 'Custom-designed single-cell potentiostat ASIC on flexible polyimide PCB with primary lithium cell',
    whyItMatters: 'Enables 14-day operation on a primary cell at < 10 µW average current',
    failureModes: ['battery depletion', 'PCB flex fatigue'],
    unknowns: ['ASIC tape-out timeline and NRE'],
    status: 'concept',
  },
  {
    id: 'ble-bridge',
    name: 'Bluetooth Low Energy Bridge',
    purpose: 'Reusable BLE module that receives sensor data and relays to phone',
    inputs: ['RF signal from sensor', 'USB-C power'],
    outputs: ['BLE advertisement to phone app'],
    keyParts: ['Nordic nRF5340', 'BLE antenna', 'overmoulded housing', 'USB-C port'],
    leadWeeks: 12,
    estimatedMassKg: 0.025,
    description: 'Reusable Bluetooth bridge housing with NFC pairing, IP67 rated',
    whyItMatters: 'User-facing device — determines UX and subscription model durability',
    failureModes: ['BLE range degradation', 'housing seal failure'],
    unknowns: ['IP67 certification cost'],
    status: 'concept',
  },
]

// ── Main integrated stage test ────────────────────────────────────────────────

async function testIntegratedStage() {
  console.log('\n[test] === Integrated BOM/Cost/Suppliers Stage Test (r1-cgm) ===')
  console.log('[test] Brief: Wearable Continuous Glucose Monitor')

  const result = await runBomCostSuppliers({
    modules: CGM_MODULES,
    designBrief: {
      useCase: 'Type 2 diabetes continuous glucose monitoring',
      targetProcess: 'electronics assembly',
      targetMaterial: 'cots',
      toleranceTarget: '±0.5 mmol/L',
      quantityTarget: '2000000',
      complianceNotes: 'MDR Class IIb, ISO 13485',
      constraints: {
        unitCostCeilingGbp: 18,
        batchSize: 2000000,
      },
    },
    classification: {
      productClass: 'wearable_medical',
      technologyDomains: ['electronic', 'battery', 'RF_comms', 'regulated_medical'],
      hazardDomains: ['stored_energy'],
      manufacturingArchetype: 'electronics_assembly',
    },
    domain: 'medical',
    ceilingGbp: 18,
    batchSize: 2000000,
  })

  if (!result.ok || !result.data) {
    throw new Error(`[test] Stage failed: ${result.error}`)
  }

  const d = result.data
  console.log(`\n[test] ✓ Stage completed in ${result.durationMs}ms`)
  console.log(`[test] ✓ BOM lines: ${d.bomLines.length}`)
  console.log(`[test] ✓ Parts (backwards compat): ${d.parts.length}`)
  console.log(`[test] ✓ Supplier matches (Make parts): ${d.supplierMatches.length}`)
  console.log(`[test] ✓ Unit cost: £${d.costWaterfall.unitTotalGbp.toFixed(2)}`)
  console.log(`[test] ✓ Quoted cost fraction: ${(d.costWaterfall.quotedCostFraction * 100).toFixed(0)}%`)
  console.log(`[test] ✓ Exceeds ceiling: ${d.costWaterfall.exceedsCeiling}`)

  // Validate section outputs exist and are non-empty
  if (!d.sectionBom || d.sectionBom.length < 20) throw new Error('[test] sectionBom is empty')
  if (!d.sectionCost || d.sectionCost.length < 20) throw new Error('[test] sectionCost is empty')
  if (!d.sectionSuppliers || d.sectionSuppliers.length < 10) throw new Error('[test] sectionSuppliers is empty')
  console.log('[test] ✓ All three section payloads populated')

  // Validate backwards-compat outputs
  if (!d.costBreakdown || d.costBreakdown.unitTotalGbp <= 0) throw new Error('[test] costBreakdown invalid')
  console.log('[test] ✓ CostBreakdown backwards-compat valid')

  // Check Make lines for supplier search flag
  const makeLines = d.bomLines.filter(l => l.partRegime === 'make' || l.partRegime === 'service')
  const reviewLines = makeLines.filter(l => l.needsSourcingReview)
  console.log(`[test] Make lines: ${makeLines.length}, needing sourcing review: ${reviewLines.length}`)

  // Report BOM by regime
  const buyLines = d.bomLines.filter(l => l.partRegime === 'buy')
  console.log(`\n[test] Buy lines: ${buyLines.length}, Make lines: ${makeLines.length}`)

  console.log('\n[test] Sample BOM (first 5 lines):')
  for (const line of d.bomLines.slice(0, 5)) {
    console.log(`  ${line.partNumber} | ${line.name} | ${line.partRegime} | £${line.unitCostGbp.toFixed(2)} | ${line.costSource}`)
  }

  console.log('\n[test] === ALL TESTS PASSED ===')
}

// ── Run ───────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await testLcscStub()
    await testIntegratedStage()
    process.exit(0)
  } catch (err) {
    console.error('\n[test] FAILED:', err)
    process.exit(1)
  }
}

main()
