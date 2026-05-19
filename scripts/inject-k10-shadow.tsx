#!/usr/bin/env npx tsx
/**
 * @file scripts/inject-k10-shadow.tsx — one-off helper for the K10 shadow
 *   wire-up smoke test (2026-05-18 dispatch).
 *
 * @description Loads a state.json, runs the K10 shadow validation against
 *   its ModuleDecomposition, attaches the result to
 *   state.moduleDecomposition.k10ShadowResult (matching what the production
 *   pipeline now does inside the public runModuleDecomposition wrapper),
 *   and writes the augmented state to a new file.
 *
 * @rationale Lets us verify the renderer's Appendix B K10 block without
 *   running the full pipeline. Drop-in replacement for an iter cycle.
 *
 * @usage  npx tsx scripts/inject-k10-shadow.tsx <state.json> <out.json>
 */

import { readFileSync, writeFileSync } from 'fs'
import { runK10ShadowValidation } from '../src/lib/pdf-engine-v2/stages/1.7-module-decomposition.js'
import type { ModuleDecomposition } from '../src/lib/pdf-engine-v2/types/module-decomposition.js'

async function main() {
  const [inPath, outPath] = process.argv.slice(2)
  if (!inPath || !outPath) {
    console.error('Usage: npx tsx scripts/inject-k10-shadow.tsx <state.json> <out.json>')
    process.exit(1)
  }
  const state = JSON.parse(readFileSync(inPath, 'utf-8'))
  if (!state?.moduleDecomposition) {
    console.error(`state at ${inPath} has no moduleDecomposition — cannot inject`)
    process.exit(2)
  }
  const k10 = await runK10ShadowValidation(state.moduleDecomposition as ModuleDecomposition)
  state.moduleDecomposition.k10ShadowResult = k10
  writeFileSync(outPath, JSON.stringify(state, null, 2))
  console.log(`[k10-shadow] injected verdict=${k10.verdict} class=${k10.class || '(none)'} missing=${k10.missing_required.length} extras=${k10.extra_emitted.length} → ${outPath}`)
}

main().catch(err => {
  console.error('FATAL', err)
  process.exit(2)
})
