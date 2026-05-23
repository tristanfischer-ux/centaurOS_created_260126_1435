/**
 * Smoke test for splitDenseSubModulesByRadical().
 *
 * Loads real state.json outputs from past chain runs, runs the splitter
 * against each design, and reports the before/after sub-module count.
 *
 * Pass criteria:
 *   - bioreactor: density 1.0 → ≥2.0 (THIN → MED)
 *   - VF: density 2.5 → unchanged (RICH passes through)
 *   - HAPS: density 2.5 → unchanged
 *   - Content-preserving: every word in input must appear in output
 *
 * Run: npx tsx scripts/test-splitter-smoke.ts
 */

import { readFileSync, existsSync } from 'node:fs'
import { splitDenseSubModulesByRadical } from './lib/orchestrator/submodule-splitter'
import type { DesignJSON } from './lib/orchestrator/assembler'

interface RunCase {
  label: string
  state_path: string
  expect_density_min?: number
  expect_unchanged?: boolean
}

const cases: RunCase[] = [
  { label: 'bioreactor (orchestrator, THIN)', state_path: '/tmp/test-bioreactor-l7-normaliser/state.json', expect_density_min: 1.8 },
  { label: 'wind_turbine-l5 (orchestrator, THIN)', state_path: '/tmp/test-windturbine-l5/state.json', expect_density_min: 1.8 },
  { label: 'h2-l5 (orchestrator, THIN)', state_path: '/tmp/test-h2-l5/state.json', expect_density_min: 1.8 },
  { label: 'evcharger-l4 (orchestrator, THIN)', state_path: '/tmp/test-evcharger-l4/state.json', expect_density_min: 1.8 },
  { label: 'solar-l5 (orchestrator, THIN)', state_path: '/tmp/test-solar-l5/state.json', expect_density_min: 1.8 },
  { label: 'vf-postfix7 (RICH, should pass through)', state_path: '/tmp/test-vf-postfix7/state.json', expect_unchanged: true },
  { label: 'haps-chain10 (RICH, should pass through)', state_path: '/tmp/test-haps-chain10/state.json', expect_unchanged: true },
]

function densityOf(design: DesignJSON): { mods: number; subs: number; words: number; density: number } {
  const mods = (design.modules ?? []) as Array<{ sub_modules?: unknown[] }>
  let subs = 0
  let words = 0
  for (const m of mods) {
    const ss = (m.sub_modules ?? []) as Array<{ words?: unknown[] }>
    subs += ss.length
    for (const s of ss) {
      words += (s.words ?? []).length
    }
  }
  return { mods: mods.length, subs, words, density: mods.length > 0 ? subs / mods.length : 0 }
}

function allWordIds(design: DesignJSON): string[] {
  const ids: string[] = []
  for (const m of (design.modules ?? []) as Array<{ sub_modules?: unknown[] }>) {
    for (const s of (m.sub_modules ?? []) as Array<{ words?: Array<{ id?: string; name_human?: string }> }>) {
      for (const w of s.words ?? []) {
        ids.push(w.id ?? w.name_human ?? 'unknown')
      }
    }
  }
  return ids.sort()
}

let pass = 0
let fail = 0

console.log('\n══ SUB-MODULE SPLITTER SMOKE TEST ════════════════════════════════════\n')

for (const c of cases) {
  if (!existsSync(c.state_path)) {
    console.log(`  SKIP ${c.label} — state file missing`)
    continue
  }

  const state = JSON.parse(readFileSync(c.state_path, 'utf-8'))
  const md = state.moduleDecomposition
  if (!md || !md.modules) {
    console.log(`  SKIP ${c.label} — no moduleDecomposition.modules`)
    continue
  }

  // Build a minimal DesignJSON shape — splitter only reads modules.
  const designIn: DesignJSON = {
    modules: md.modules,
    cross_module_grammar_links: md.cross_module_grammar_links ?? [],
    excluded_modules: md.excluded_modules ?? [],
    rationale_excluded: md.rationale_excluded ?? '',
    brief_overview_prose: md.brief_overview_prose ?? { overview_and_context: '', mission_statement: '', target_customers: '', why_now: '' },
  }

  const before = densityOf(designIn)
  const beforeIds = allWordIds(designIn)
  const designOut = splitDenseSubModulesByRadical(designIn)
  const after = densityOf(designOut)
  const afterIds = allWordIds(designOut)

  // Content-preservation check
  const sameContent = beforeIds.length === afterIds.length && beforeIds.every((id, i) => id === afterIds[i])

  // Density check
  let densityOk = true
  if (c.expect_unchanged) {
    densityOk = Math.abs(after.density - before.density) < 0.01
  } else if (c.expect_density_min) {
    densityOk = after.density >= c.expect_density_min
  }

  const status = (sameContent && densityOk) ? '✓' : '✗'
  if (sameContent && densityOk) pass++
  else fail++

  console.log(`  ${status} ${c.label}`)
  console.log(`     before: ${before.mods} mods, ${before.subs} subs, ${before.words} words, density=${before.density.toFixed(2)}`)
  console.log(`     after:  ${after.mods} mods, ${after.subs} subs, ${after.words} words, density=${after.density.toFixed(2)}`)
  if (!sameContent) {
    console.log(`     ✗ content lost! before=${beforeIds.length} words, after=${afterIds.length} words`)
  }
  if (!densityOk) {
    if (c.expect_unchanged) {
      console.log(`     ✗ expected unchanged density, got ${after.density.toFixed(2)} vs ${before.density.toFixed(2)}`)
    } else if (c.expect_density_min) {
      console.log(`     ✗ expected density ≥ ${c.expect_density_min}, got ${after.density.toFixed(2)}`)
    }
  }
  console.log()
}

console.log('══════════════════════════════════════════════════════════════════════')
console.log(`Pass: ${pass}  Fail: ${fail}`)
process.exit(fail > 0 ? 1 : 0)
