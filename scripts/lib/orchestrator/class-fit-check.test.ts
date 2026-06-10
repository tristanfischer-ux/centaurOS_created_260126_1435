/**
 * scripts/lib/orchestrator/class-fit-check.test.ts
 *
 * W0 STANDALONE TEST HARNESS (tracker #21) — run with:
 *   npx tsx scripts/lib/orchestrator/class-fit-check.test.ts
 *
 * Lives OUTSIDE scripts/regression-harness.tsx because that file is contended
 * (foreign-dirty workstream). FOLLOW-UP: port these into the harness bucket
 * UNIVERSAL.class_fit_* once it stabilises. Same idiom as the sibling
 * envelope-vector.test.ts.
 *
 * Invariants:
 *   T-a  tidal-kite parsed brief + its envelope vector vs wind_turbine
 *        → CONTRADICTION (the W0 wall).
 *   T-b  a minimal onshore-wind fixture vs wind_turbine → fit ok.
 *   T-c  all 8 briefs-rerun parsed briefs vs their ASSIGNED classes → fit ok
 *        (the regression / no-false-positive proof).
 *   T-d  biogas + mushroom holdout briefs vs their nearest WRONG registered
 *        classes (bioreactor, vertical_farm) → reported HONESTLY (may be ok).
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildEnvelopeVector } from './envelope-vector'
import { checkClassFit } from './class-fit-check'
import type { ParsedConstraints } from './types'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..')

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function stripHtmlComments(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, '')
}

function fit(parsedBrief: unknown, slug: string) {
  const constraints = { ...(parsedBrief as any), product_class: slug } as ParsedConstraints
  const vector = buildEnvelopeVector(constraints)
  return { result: checkClassFit(constraints, vector, slug), vector }
}

function main(): void {
  // ── T-a: the W0 wall ────────────────────────────────────────────────
  console.log('\nT-a — tidal-kite parsed brief vs wind_turbine → CONTRADICTION')
  const tidal = JSON.parse(readFileSync(join(REPO, 'out', 'holdout-tidal-kite', '1-parsed-brief.json'), 'utf8'))
  // Flatten constraints the way the chain orchParsedConstraints does.
  const tidalC = { ...tidal, ...(tidal.constraints ?? {}) }
  const tidalFit = fit(tidalC, 'wind_turbine')
  check('tidal-kite → wind_turbine is a CONTRADICTION', tidalFit.result.fit === 'contradiction',
    JSON.stringify(tidalFit.result))
  check('tidal-kite brief_domain = submerged', tidalFit.result.brief_domain === 'submerged',
    tidalFit.result.brief_domain)
  check('tidal-kite has a HIGH mobility/medium finding',
    tidalFit.result.findings.some(f => f.signal === 'mobility_medium' && f.severity === 'high'))
  console.log('     findings:', tidalFit.result.findings.map(f => `[${f.severity}] ${f.detail}`).join('\n               '))

  // ── T-b: real onshore wind fixture → fit ok ─────────────────────────
  console.log('\nT-b — minimal onshore-wind fixture vs wind_turbine → fit ok')
  const windFixture = {
    product_description:
      'A 6 MW onshore horizontal-axis wind turbine for utility-scale generation. ' +
      'A grid-connected fixed installation on a concrete foundation: steel tower, ' +
      'nacelle with gearbox and generator, three-bladed rotor with pitch system and ' +
      'yaw drive. Rated electrical output 6,000 kW at the generator terminals.',
    constraints: {
      target_performance: { value: 6000, unit: 'kW', key_metric: 'rated_power_kw' },
      additional_constraints: [
        { description: 'Rotor diameter 150 m; hub height 120 m' },
        { description: 'Grid-connected at 33 kV; installed on a reinforced concrete pad' },
      ],
    },
  }
  const windC = { ...windFixture, ...windFixture.constraints }
  const windFit = fit(windC, 'wind_turbine')
  check('onshore-wind → wind_turbine is FIT OK', windFit.result.fit === 'ok',
    JSON.stringify(windFit.result))
  console.log('     brief_domain:', windFit.result.brief_domain, '| findings:', windFit.result.findings.length)

  // ── T-c: 8 briefs-rerun vs assigned classes → fit ok (no false positives) ─
  console.log('\nT-c — 8 briefs-rerun vs assigned classes → fit ok (regression proof)')
  const RERUNS = [
    'co2_mineralisation', 'compute_heat_module', 'e_fuel_synthesis', 'edge_ai_server',
    'energy_storage', 'haps', 'satellite_smallsat', 'vertical_farm',
  ]
  for (const slug of RERUNS) {
    const dir = join(REPO, 'out', `rerun-${slug}`)
    const augPath = join(dir, '1-parsed-brief-augmented.json')
    const ecPath = join(dir, '0.5-engineering-contract.json')
    if (!existsSync(augPath) || !existsSync(ecPath)) {
      check(`${slug}: fixture present`, false, `missing ${augPath} or ${ecPath}`)
      continue
    }
    const brief = JSON.parse(readFileSync(augPath, 'utf8')).brief
    const ec = JSON.parse(readFileSync(ecPath, 'utf8'))
    const assigned = String(ec.product_class ?? '')
    const constraints = { ...brief, ...(brief.constraints ?? {}) }
    const r = fit(constraints, assigned).result
    check(`${slug} (assigned "${assigned}") → fit ok`, r.fit === 'ok',
      `verdict=${r.fit} brief_domain=${r.brief_domain} findings=${JSON.stringify(r.findings)}`)
  }

  // ── T-d: biogas + mushroom vs nearest WRONG class → honest report ────
  console.log('\nT-d — biogas/mushroom vs nearest WRONG class → honest (may be ok)')
  const dCases: Array<{ file: string; wrongClass: string }> = [
    { file: 'biogas-digester-chp.md', wrongClass: 'bioreactor' },
    { file: 'mushroom-farm-automated.md', wrongClass: 'vertical_farm' },
  ]
  for (const { file, wrongClass } of dCases) {
    const path = join(REPO, 'briefs-holdout', file)
    if (!existsSync(path)) { check(`${file}: present`, false, path); continue }
    const text = stripHtmlComments(readFileSync(path, 'utf8'))
    const constraints = { product_description: text } as any
    const r = fit(constraints, wrongClass).result
    const verdict = r.fit === 'contradiction' ? 'CAUGHT (contradiction)' : 'NOT caught (fit ok / no-check)'
    console.log(`     ${file} vs ${wrongClass}: ${verdict} — brief_domain=${r.brief_domain}, findings=${r.findings.length}`)
    // Honest: either verdict is ACCEPTABLE per the task. Assert only that the
    // module returned a well-formed result (did not throw / mislabel domains).
    check(`${file} vs ${wrongClass}: well-formed result`, r.fit === 'ok' || r.fit === 'contradiction')
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`PASSED ${passed} / ${passed + failed}`)
  if (failed > 0) {
    console.log(`FAILED: ${failures.join(', ')}`)
    process.exit(1)
  }
}

main()
