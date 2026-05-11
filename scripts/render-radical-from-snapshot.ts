#!/usr/bin/env npx tsx
/**
 * scripts/render-radical-from-snapshot.ts
 *
 * Renders the Radical Phase 5 PDF from an existing state.json snapshot —
 * no pipeline run needed. Used to verify renderer changes locally without
 * paying the LLM-call cost of a full pipeline run.
 *
 * Usage:
 *   npx tsx scripts/render-radical-from-snapshot.ts \
 *     --state ~/Downloads/engine-evidence/radical-shadow-20260511T0632/rs-bess/state.json \
 *     --out /tmp/bess-verify.pdf
 *
 * Limitations:
 *   - state.json is "minimal" (writes only resolvedRadicalTree, costSummary,
 *     grammarVerdicts, projectId, legacyCostBomTotal). It does NOT include
 *     parsedBrief, regulatoryExtraction, sourceAttributions, productClass,
 *     etc. So renderer branches that read those fields fall back to their
 *     placeholder paths.
 *   - This means the rendered PDF will look thinner than a real pipeline
 *     run — but it is enough to verify that
 *       (a) the new sections render at all,
 *       (b) the reorder lands them in the right page positions,
 *       (c) the placeholder branches degrade gracefully.
 *   - For full-fidelity verification, run a real pipeline iteration.
 */
import { readFileSync, writeFileSync } from 'fs'
import { pdf } from '@react-pdf/renderer'
import React from 'react'
import PdfRendererV3Radical from '../src/lib/pdf-engine-v2/stages/7b-pdf-v3-radical-document'
import type { PipelineState } from '../src/lib/pdf-engine-v2/types'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const statePath = (() => {
    const i = args.indexOf('--state')
    if (i < 0 || i + 1 >= args.length) {
      console.error('ERROR: --state <path> required')
      process.exit(1)
    }
    return args[i + 1]
  })()
  const outPath = (() => {
    const i = args.indexOf('--out')
    if (i < 0 || i + 1 >= args.length) {
      console.error('ERROR: --out <path> required')
      process.exit(1)
    }
    return args[i + 1]
  })()

  console.log(`[render] Reading snapshot: ${statePath}`)
  const raw = readFileSync(statePath, 'utf8')
  const snapshot = JSON.parse(raw)

  // Hint for the renderer — productClass infers from projectId in the
  // snapshot if absent. Tries to make the placeholder paths cleaner.
  const inferredProductClass = (() => {
    const pid = (snapshot.projectId ?? '').toLowerCase()
    if (pid.includes('battery') || pid.includes('bess')) return 'energy_storage'
    if (pid.includes('heat_pump') || pid.includes('heatpump')) return 'thermal_system'
    if (pid.includes('cgm') || pid.includes('glucose')) return 'wearable_medical'
    if (pid.includes('drone')) return 'drone'
    if (pid.includes('ev_charger')) return 'ev_charger'
    if (pid.includes('bioreactor')) return 'bioreactor'
    if (pid.includes('farm') || pid.includes('vertical')) return 'vertical_farm'
    if (pid.includes('auv')) return 'auv'
    if (pid.includes('haps')) return 'haps'
    if (pid.includes('edge_ai') || pid.includes('inference')) return 'edge_ai_server'
    return null
  })()

  const state: PipelineState = {
    ...snapshot,
    productClass: snapshot.productClass ?? inferredProductClass,
  } as PipelineState

  console.log(`[render] projectId: ${state.projectId}`)
  console.log(`[render] productClass: ${(state as any).productClass ?? '—'}`)
  console.log(`[render] resolved leaves: ${state.resolvedRadicalTree?.resolution_meta?.stats?.total_leaves ?? '—'}`)
  console.log(`[render] grammar verdicts: ${state.grammarVerdicts?.verdicts?.length ?? 0}`)

  const start = Date.now()
  const doc = React.createElement(PdfRendererV3Radical, { state }) as any
  const blob = await pdf(doc).toBlob()
  const buffer = Buffer.from(await blob.arrayBuffer())
  writeFileSync(outPath, buffer)
  const ms = Date.now() - start

  console.log(`[render] OK — ${ms}ms, ${Math.round(buffer.length / 1024)} KB → ${outPath}`)
}

main().catch(err => {
  console.error('[render] FAILED:', err)
  process.exit(1)
})
