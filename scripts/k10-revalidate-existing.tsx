#!/usr/bin/env npx tsx
/**
 * @file scripts/k10-revalidate-existing.tsx — cheap K10 shadow re-validation
 *   against the already-synthesised JSON outputs from a prior multi-emit run.
 *
 *   Reads /tmp/k10-multiemit-out/<name>.synthesised.json and runs K10 shadow
 *   validation against it. Same logic as test-k10-prompt-addenda-multiemit's
 *   K10 step, but skips the £3+ LLM dispatch — useful for verifying a K10
 *   graph change (e.g. moving an edge's to_class) without re-running the
 *   whole multi-emit pipeline.
 *
 * @usage  npx tsx scripts/k10-revalidate-existing.tsx
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

for (const envPath of [
  resolve(process.cwd(), '.env.local'),
  resolve(homedir(), '.claude/secrets/openrouter.env'),
]) {
  try {
    const c = readFileSync(envPath, 'utf-8')
    for (const line of c.split('\n')) {
      const t = line.trim()
      if (t && !t.startsWith('#') && t.includes('=')) {
        const [k, ...rest] = t.split('=')
        const v = rest.join('=').replace(/^["']|["']$/g, '')
        if (!process.env[k]) process.env[k] = v
      }
    }
  } catch { /* missing env file ok */ }
}

import { runK10ShadowValidation } from '../src/lib/pdf-engine-v2/stages/1.7-module-decomposition'
import { ensureGraphsRegistered } from '../src/lib/pdf-engine-v2/class-reference-graph'
import type { ModuleDecomposition } from '../src/lib/pdf-engine-v2/types/module-decomposition'

const DATAPOINTS = [
  { name: 'bess1',    baselineMissing: 0 },
  { name: 'bess2',    baselineMissing: 0 },
  { name: 'heatpump', baselineMissing: 0 },
  { name: 'ev',       baselineMissing: 1 },
] as const

async function main() {
  await ensureGraphsRegistered()
  console.log('K10 shadow re-validation against /tmp/k10-multiemit-out/*.synthesised.json (cached emissions)')
  console.log(`Baseline (iter3): bess1=0 bess2=0 heatpump=0 ev=1`)
  console.log()
  let passes = 0
  const results: Array<{ name: string; baseline: number; missing: number; verdict: string }> = []
  for (const dp of DATAPOINTS) {
    const path = resolve('/tmp/k10-multiemit-out', `${dp.name}.synthesised.json`)
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    const md: ModuleDecomposition = {
      product_class: raw.product_class,
      modules: raw.modules ?? [],
      excluded_modules: raw.excluded_modules ?? [],
      rationale_excluded: raw.rationale_excluded ?? {},
      cross_module_grammar_links: raw.cross_module_grammar_links ?? [],
    } as ModuleDecomposition
    const k10 = await runK10ShadowValidation(md)
    const delta = k10.missing_required.length - dp.baselineMissing
    const pass = k10.missing_required.length <= 1
    if (pass) passes++
    console.log(
      `  ${dp.name.padEnd(10)} baseline=${dp.baselineMissing}  now=${k10.missing_required.length}  Δ=${delta >= 0 ? '+' : ''}${delta}  verdict=${k10.verdict.padEnd(13)}  ${pass ? 'PASS_le_1' : 'FAIL'}`,
    )
    results.push({ name: dp.name, baseline: dp.baselineMissing, missing: k10.missing_required.length, verdict: k10.verdict })
    for (const e of k10.missing_required) {
      console.log(`      ✗ ${e.from_class} ↔ ${e.to_class} mech=${e.mechanism ?? '?'} proto=${(e as any).protocol ?? '?'}`)
    }
  }
  console.log()
  console.log(`Pass criteria (≤ 1 on ≥ 3 of 4 datapoints): ${passes >= 3 ? 'PASS' : 'FAIL'}  (${passes}/${DATAPOINTS.length})`)
  process.exit(passes >= 3 ? 0 : 1)
}

main().catch(err => {
  console.error('FATAL', err)
  process.exit(2)
})
