#!/usr/bin/env npx tsx
/**
 * @file scripts/prep-k10-enforcing-pdf-fixtures.tsx
 *
 * @description Prepares two state.json fixtures for visual confirmation of
 *   the K10 enforcing-mode renderer changes:
 *
 *     1. <state>.k10-shadow.json   — k10ShadowResult only (no enforcing
 *        fields, no k10ManualReview). Should produce a PDF whose rendering
 *        is IDENTICAL to the un-touched baseline.
 *
 *     2. <state>.k10-enforcing-fail.json — full enforcing-mode injection:
 *        k10ShadowResult = FAIL_SHADOW, k10EnforcingResult attached,
 *        k10ManualReview = true, k10ManualReviewEdges populated. Should
 *        produce a PDF with the new K10 manual-review badge on the cover,
 *        inline note next to the Module Map (Section 2), and a full entry
 *        in Appendix B's Manual Review Notes.
 *
 *   Both fixtures use the same source state file so the only visible
 *   difference between the rendered PDFs is the K10 badge.
 *
 * @usage  npx tsx scripts/prep-k10-enforcing-pdf-fixtures.tsx <state.json>
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

async function main() {
  const inPath = process.argv[2]
  if (!inPath) {
    console.error('Usage: npx tsx scripts/prep-k10-enforcing-pdf-fixtures.tsx <state.json>')
    process.exit(1)
  }
  const abs = resolve(inPath)
  const state = JSON.parse(readFileSync(abs, 'utf-8'))
  if (!state?.moduleDecomposition) {
    console.error(`state at ${abs} has no moduleDecomposition`)
    process.exit(2)
  }
  const productClass = state.moduleDecomposition.product_class ?? 'unknown'

  // Fixture 1 — shadow mode (PASS_SHADOW). Minimal payload, no enforcing fields.
  {
    const shadowState = JSON.parse(JSON.stringify(state))
    shadowState.moduleDecomposition.k10ShadowResult = {
      class: 'heat-pump-residential',
      product_class: productClass,
      verdict: 'PASS_SHADOW',
      matched_edges: 12,
      missing_required: [],
      extra_emitted: [],
      protocol_mismatches: [],
      ts: new Date().toISOString(),
      mode: 'shadow',
    }
    delete shadowState.moduleDecomposition.k10EnforcingResult
    delete shadowState.moduleDecomposition.k10ManualReview
    delete shadowState.moduleDecomposition.k10ManualReviewEdges
    delete shadowState.k10ManualReview
    delete shadowState.k10ManualReviewEdges
    const outPath = abs.replace(/\.json$/, '.k10-shadow.json')
    writeFileSync(outPath, JSON.stringify(shadowState, null, 2))
    console.log(`[k10-fixtures] shadow-mode fixture → ${outPath}`)
  }

  // Fixture 2 — enforcing mode FAIL with manual-review attached.
  {
    const enforcingState = JSON.parse(JSON.stringify(state))
    const fakeMissing = [
      {
        from_class: 'control_compute_communication',
        to_class: 'sensing_instrumentation',
        protocol: 'Modbus-RTU',
        mechanism: 'sensor_feedback',
        notes: 'Required reference-graph edge — controller must poll the refrigerant low-side pressure transducer for COP optimisation. Re-emit attempts both routed this telemetry through the wrong module (environmental_interface instead of sensing_instrumentation).',
      },
      {
        from_class: 'energy_conversion_transduction',
        to_class: 'mass_fluid_transport_process',
        protocol: 'physical',
        mechanism: 'refrigerant_line',
        notes: 'Required reference-graph edge — refrigerant suction line from evaporator to compressor inlet must be modelled as a fluid_transport edge, not collapsed into the compressor module.',
      },
      {
        from_class: 'safety_protection',
        to_class: 'energy_conversion_transduction',
        protocol: 'Digital-24V',
        mechanism: 'safety_isolation',
        notes: 'Required reference-graph edge — high-pressure cut-out switch must drive compressor contactor open independently of the controller (hard-wired safety chain).',
      },
    ]
    const sharedShadowFields = {
      class: 'heat-pump-residential',
      product_class: productClass,
      verdict: 'FAIL_SHADOW',
      matched_edges: 9,
      missing_required: fakeMissing,
      extra_emitted: [],
      protocol_mismatches: [],
      ts: new Date().toISOString(),
    }
    enforcingState.moduleDecomposition.k10ShadowResult = {
      ...sharedShadowFields,
      mode: 'shadow',
    }
    enforcingState.moduleDecomposition.k10EnforcingResult = {
      ...sharedShadowFields,
      mode: 'enforcing',
      g4_retry_fired: true,
      g4_retries_used: 2,
      manual_review_attached: true,
    }
    enforcingState.moduleDecomposition.k10ManualReview = true
    enforcingState.moduleDecomposition.k10ManualReviewEdges = fakeMissing
    const outPath = abs.replace(/\.json$/, '.k10-enforcing-fail.json')
    writeFileSync(outPath, JSON.stringify(enforcingState, null, 2))
    console.log(`[k10-fixtures] enforcing-mode fail fixture → ${outPath}`)
  }
}

main().catch(err => {
  console.error('FATAL', err)
  process.exit(1)
})
