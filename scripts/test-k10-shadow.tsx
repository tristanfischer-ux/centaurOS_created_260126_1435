#!/usr/bin/env npx tsx
/**
 * @file scripts/test-k10-shadow.tsx — K10 shadow-mode smoke test.
 *
 * @description Loads a state.json, extracts its ModuleDecomposition, runs the
 *   K10 shadow validation (the same function the production pipeline calls
 *   after the G4 grammar gate), and reports the result.
 *
 *   Doubles as the verification path for "did the shadow check actually
 *   attach to state.moduleDecomposition.k10ShadowResult on the real pipeline?"
 *   by walking the state.json directly.
 *
 * @usage  npx tsx scripts/test-k10-shadow.tsx <state.json> [<state.json> ...]
 */

import { readFileSync } from 'fs'
import { runK10ShadowValidation, type K10ShadowResult } from '../src/lib/pdf-engine-v2/stages/1.7-module-decomposition.js'
import type { ModuleDecomposition } from '../src/lib/pdf-engine-v2/types/module-decomposition.js'

async function runOne(path: string): Promise<K10ShadowResult> {
  const raw = readFileSync(path, 'utf-8')
  const state = JSON.parse(raw)
  const md = state?.moduleDecomposition
  if (!md) {
    throw new Error(`state at ${path} has no moduleDecomposition`)
  }
  console.log(`\n[k10-shadow] ${path}`)
  console.log(`  product_class=${md.product_class}, normalised_class=${md.normalised_class ?? '(none)'}, links=${(md.cross_module_grammar_links ?? []).length}`)
  const k10 = await runK10ShadowValidation(md as ModuleDecomposition)
  console.log(`  verdict=${k10.verdict}, class=${k10.class || '(none)'}, matched=${k10.matched_edges}, missing_required=${k10.missing_required.length}, extras=${k10.extra_emitted.length}, proto_mis=${k10.protocol_mismatches.length}`)
  if (k10.reason) console.log(`  reason: ${k10.reason}`)
  if (k10.missing_required.length > 0) {
    console.log('  --- missing required ---')
    for (const m of k10.missing_required) {
      console.log(`    ✗ ${m.from_class} ↔ [${m.protocol ?? m.mechanism ?? '?'}] ${m.to_class}`)
    }
  }
  if (k10.extra_emitted.length > 0) {
    console.log('  --- extras (first 8) ---')
    for (const e of k10.extra_emitted.slice(0, 8)) {
      console.log(`    ? ${e.from_module} ↔ [${e.mechanism ?? e.protocol ?? '?'}] ${e.to_module}`)
    }
    if (k10.extra_emitted.length > 8) console.log(`    …and ${k10.extra_emitted.length - 8} more`)
  }
  if (k10.protocol_mismatches.length > 0) {
    console.log('  --- protocol/mechanism deltas ---')
    for (const m of k10.protocol_mismatches) {
      console.log(`    ! ${m.from_module} → ${m.to_module}: ${m.reason}`)
    }
  }
  return k10
}

async function main() {
  const paths = process.argv.slice(2)
  if (paths.length === 0) {
    console.error('Usage: npx tsx scripts/test-k10-shadow.tsx <state.json> [<state.json> ...]')
    process.exit(1)
  }
  const results: Array<{ path: string; result: K10ShadowResult }> = []
  for (const p of paths) {
    try {
      const r = await runOne(p)
      results.push({ path: p, result: r })
    } catch (err) {
      console.error(`\n[k10-shadow] ${p} FAILED: ${(err as Error).message}`)
    }
  }
  console.log('\n\n═══════ ROLL-UP ═══════')
  for (const { path, result } of results) {
    const slug = result.class || '(no-graph)'
    console.log(`  ${result.verdict.padEnd(13)}  ${slug.padEnd(28)}  matched=${result.matched_edges.toString().padStart(3)}  missing=${result.missing_required.length.toString().padStart(2)}  extras=${result.extra_emitted.length.toString().padStart(2)}  ${path}`)
  }
  // Exit 0 — shadow mode never fails the smoke run.
  process.exit(0)
}

main().catch(err => {
  console.error('FATAL', err)
  process.exit(2)
})
