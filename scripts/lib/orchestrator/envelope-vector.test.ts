/**
 * scripts/lib/orchestrator/envelope-vector.test.ts
 *
 * E1 STANDALONE TEST HARNESS — run with:
 *   npx tsx scripts/lib/orchestrator/envelope-vector.test.ts            # deterministic only
 *   E1_LIVE_LLM=1 npx tsx scripts/lib/orchestrator/envelope-vector.test.ts  # + live tier (c)
 *
 * Lives OUTSIDE scripts/regression-harness.tsx because that file is dirty
 * in the E0 agent's workstream — FOLLOW-UP: port these invariants into the
 * harness (bucket UNIVERSAL.envelope_vector_*) once it stabilises.
 *
 * Invariants covered:
 *   I-E1-1  all 8 briefs-rerun/*.md take tier (a) with envelopes IDENTICAL
 *           to HEAD behaviour (baseline captured pre-change at ee07e6105
 *           into envelope-vector.baseline.json) — the no-regression proof.
 *   I-E1-2  payload-led HAPS holdout brief: sync detectEnvelope is
 *           NON-NULL (class haps — exit-7 path dead) and, with the live
 *           LLM tier, resolveEnvelopeUniversal infers a wingspan with
 *           provenance=inferred and resolves a real HAPS scale tier.
 *   I-E1-3  "50 kW backup generator for a 10 MW server farm" selects
 *           50 kW; the 10 MW is rejected by NEGATIVE-EXTRACTION
 *           (context_binding) — deterministic, no LLM needed.
 *   I-E1-4  analogue-reference trap ("similar to a 60 m turbine") does
 *           NOT pick 60 m (rejected analogue_reference).
 *   I-E1-5  tidal-kite / biogas / mushroom holdout briefs each produce a
 *           non-null vector with a sensible primary metric.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { detectEnvelope, detectEnvelopeStrict } from './envelope'
import {
  buildEnvelopeVector,
  resolveEnvelopeUniversal,
  INFERENCE_CONSUME_THRESHOLD,
} from './envelope-vector'
import type { ParsedConstraints } from './types'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..')

// ── .env.local self-load (council-scorer idiom) ─────────────────────────
const envLocal = join(REPO, '.env.local')
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}

// ── tiny assert runner ───────────────────────────────────────────────────
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

function constraintsFromMd(path: string, productClass: string): ParsedConstraints {
  const text = stripHtmlComments(readFileSync(path, 'utf8'))
  return { product_class: productClass, product_description: text }
}

async function main(): Promise<void> {
  // ── I-E1-1: 8-brief no-regression proof ─────────────────────────────
  console.log('\nI-E1-1 — briefs-rerun no-regression (tier a identical to HEAD baseline)')
  const baseline = JSON.parse(readFileSync(join(HERE, 'envelope-vector.baseline.json'), 'utf8'))
  const RERUNS = [
    'co2_mineralisation', 'compute_heat_module', 'e_fuel_synthesis', 'edge_ai_server',
    'energy_storage', 'haps', 'satellite_smallsat', 'vertical_farm',
  ]
  for (const slug of RERUNS) {
    const dir = join(REPO, 'out', `rerun-${slug}`)
    const brief = JSON.parse(readFileSync(join(dir, '1-parsed-brief-augmented.json'), 'utf8')).brief
    const ec = JSON.parse(readFileSync(join(dir, '0.5-engineering-contract.json'), 'utf8'))
    const constraints = { ...brief, ...(brief.constraints ?? {}), product_class: ec.product_class } as ParsedConstraints
    const now = detectEnvelope(constraints)
    const strict = detectEnvelopeStrict(constraints)
    check(
      `${slug}: envelope identical to HEAD baseline`,
      JSON.stringify(now) === JSON.stringify(baseline[slug]),
      `now=${JSON.stringify(now)} baseline=${JSON.stringify(baseline[slug])}`,
    )
    check(
      `${slug}: took tier (a) — strict === cascade output`,
      JSON.stringify(now) === JSON.stringify(strict),
    )
  }

  // ── I-E1-2: payload-led HAPS holdout ────────────────────────────────
  console.log('\nI-E1-2 — payload-led HAPS holdout (briefs-holdout/haps-cold-payload-led.md)')
  const hapsCold = constraintsFromMd(join(REPO, 'briefs-holdout', 'haps-cold-payload-led.md'), 'haps')
  check('HAPS-cold: tier (a) strict detector misses (the W1 wall)', detectEnvelopeStrict(hapsCold) === null)
  const hapsSync = detectEnvelope(hapsCold)
  check('HAPS-cold: sync detectEnvelope NON-NULL (exit-7 path dead)', hapsSync !== null, JSON.stringify(hapsSync))
  check('HAPS-cold: sync envelope keeps class haps', hapsSync?.class === 'haps')
  check(
    'HAPS-cold: sync tier (b) did NOT fake a tier from altitude/coverage (scale_tier generic without LLM)',
    hapsSync?.scale_tier === 'generic',
    `scale_tier=${hapsSync?.scale_tier}`,
  )
  const hapsVec = buildEnvelopeVector(hapsCold)
  check('HAPS-cold: vector non-null with quantities', hapsVec.capacities.length + hapsVec.other_quantities.length > 0)
  check('HAPS-cold: payload power 1.2 kW recorded but NOT scale-eligible',
    hapsVec.capacities.some(q => q.family === 'power_kw' && Math.abs(q.value - 1.2) < 0.01 && !q.scale_eligible))
  check('HAPS-cold: no geometry candidate eligible (altitude/coverage denied)',
    !hapsVec.physical_dims.some(q => q.scale_eligible))

  const liveLlm = process.env.E1_LIVE_LLM === '1'
  if (liveLlm) {
    const res = await resolveEnvelopeUniversal(hapsCold)
    console.log(`  [tier c] inference: ${JSON.stringify(res.inference)}`)
    check('HAPS-cold LIVE: envelope non-null', res.envelope !== null)
    check('HAPS-cold LIVE: tier (c) used', res.tier === 'c', `tier=${res.tier}`)
    check('HAPS-cold LIVE: a wingspan/length metric was inferred',
      res.inference !== null && /wingspan|span/i.test(res.inference.metric_key))
    check('HAPS-cold LIVE: inferred value physically plausible (20-80 m for 50 kg / 9-day HAPS)',
      res.inference !== null && (() => {
        const v = res.inference!.unit.toLowerCase() === 'm' ? res.inference!.value : NaN
        return v >= 20 && v <= 80
      })(),
      `value=${res.inference?.value} ${res.inference?.unit}`)
    check('HAPS-cold LIVE: provenance=inferred recorded in vector',
      res.vector.physical_dims.some(q => q.provenance === 'inferred') ||
      res.vector.capacities.some(q => q.provenance === 'inferred'))
    if (res.inference && res.inference.confidence >= INFERENCE_CONSUME_THRESHOLD) {
      check('HAPS-cold LIVE: consumed proposal resolves a real HAPS tier',
        res.inference.consumed && res.envelope?.scale_tier !== 'generic',
        `consumed=${res.inference.consumed} tier=${res.envelope?.scale_tier}`)
    } else {
      check('HAPS-cold LIVE: below-threshold proposal flagged in contradictions, not consumed',
        res.vector.contradictions.some(c => c.includes('not consumed')) && res.envelope?.scale_tier === 'generic')
    }
    if (res.inference?.llm_cost_usd != null) {
      console.log(`  [tier c] LLM spend: $${res.inference.llm_cost_usd.toFixed(6)} (${res.inference.model})`)
    }
  } else {
    console.log('  (live LLM tier skipped — set E1_LIVE_LLM=1 to exercise tier c)')
  }

  // ── I-E1-3: semantic binding — 50 kW genset for a 10 MW server farm ─
  console.log('\nI-E1-3 — semantic binding (negative-extraction, deterministic)')
  const genset: ParsedConstraints = {
    product_class: 'backup_generator',
    product_description:
      'A 50 kW backup generator for a 10 MW server farm. Automatic transfer switch, 8 hour fuel autonomy, outdoor enclosure.',
  }
  const gensetVec = buildEnvelopeVector(genset)
  check('genset: primary = 50 kW', gensetVec.primary?.family === 'power_kw' && gensetVec.primary?.value === 50,
    JSON.stringify(gensetVec.primary))
  check('genset: 10 MW rejected as context_binding',
    gensetVec.rejected.some(r => r.reason === 'context_binding' && r.value === 10 && /mw/i.test(r.unit)))
  check('genset: 10 MW never recorded as a capacity',
    !gensetVec.capacities.some(q => q.family === 'power_kw' && q.value === 10_000))

  // ── I-E1-4: analogue-reference trap ─────────────────────────────────
  console.log('\nI-E1-4 — analogue trap ("similar to a 60 m turbine")')
  const trap: ParsedConstraints = {
    product_class: 'rooftop_wind_device',
    product_description:
      'A novel rooftop wind energy device, similar to a 60 m turbine in aerodynamic principle, with rated output of 4 kW and a 1.8 m rotor.',
  }
  const trapVec = buildEnvelopeVector(trap)
  check('trap: 60 m rejected as analogue_reference',
    trapVec.rejected.some(r => r.reason === 'analogue_reference' && r.value === 60))
  check('trap: 60 m never recorded as a physical dim',
    !trapVec.physical_dims.some(q => Math.abs(q.value - 60) < 0.001))
  check('trap: primary = 4 kW (rated output)',
    trapVec.primary?.family === 'power_kw' && trapVec.primary?.value === 4,
    JSON.stringify(trapVec.primary))

  // ── I-E1-5: holdout briefs — sensible primaries ─────────────────────
  console.log('\nI-E1-5 — holdout briefs (tidal kite / biogas / mushroom)')
  const tidal = buildEnvelopeVector(constraintsFromMd(join(REPO, 'briefs-holdout', 'tidal-kite-generator.md'), 'tidal_kite'))
  check('tidal kite: vector non-null with primary', tidal.primary !== null)
  check('tidal kite: primary = 500 kW rated output (capacity-primary via rated-output override)',
    tidal.primary?.family === 'power_kw' && tidal.primary?.value === 500,
    JSON.stringify(tidal.primary))
  check('tidal kite: marine platform + seawater medium',
    tidal.mobility_class === 'marine_platform' && tidal.environment.medium === 'seawater',
    `${tidal.mobility_class}/${tidal.environment.medium}`)
  check('tidal kite: 12 m wing recorded in physical_dims',
    tidal.physical_dims.some(q => Math.abs(q.value - 12) < 0.001))

  const biogas = buildEnvelopeVector(constraintsFromMd(join(REPO, 'briefs-holdout', 'biogas-digester-chp.md'), 'biogas_chp'))
  check('biogas: vector non-null with primary', biogas.primary !== null)
  check('biogas: primary = 250 kWe electrical output',
    biogas.primary?.family === 'power_kw' && biogas.primary?.value === 250,
    JSON.stringify(biogas.primary))

  const mushroom = buildEnvelopeVector(constraintsFromMd(join(REPO, 'briefs-holdout', 'mushroom-farm-automated.md'), 'mushroom_farm'))
  check('mushroom: vector non-null with primary', mushroom.primary !== null)
  check('mushroom: primary = fresh-mushroom throughput ≈ 26 t/yr',
    mushroom.primary?.family === 'throughput_tpy' && Math.abs((mushroom.primary?.value ?? 0) - 26) < 1.5,
    JSON.stringify(mushroom.primary))

  // ── summary ──────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed${failed ? ` — FAILURES: ${failures.join(' | ')}` : ''}`)
  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
