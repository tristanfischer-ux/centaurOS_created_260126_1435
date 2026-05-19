/**
 * @file test-class-registry-generator.tsx — Test harness for the organic
 * class-registry generator (scripts/generate-class-registry.ts).
 *
 * Picks 3 plausibly unknown classes (not in the curated baseline of ~15),
 * invokes the generator, validates the structural payload, and reports cost
 * + verdict per class.
 *
 * The harness is cost-bounded: it caps each generation at one Grok call and
 * aborts the run if any single class exceeds an estimated £3 (a safety net
 * — Grok 4.3 typical generation is ~£1-2). Default total budget is the
 * dispatch cap of £15 (3 classes + 1-2 retries if structure validation
 * fails).
 *
 * Usage:
 *   set -a; source ~/.claude/secrets/openrouter.env; set +a
 *   npx tsx scripts/test-class-registry-generator.tsx
 *
 * Flags:
 *   --classes=<csv>   Override the default test class list.
 *   --force           Bypass cache and force fresh LLM calls.
 *   --budget=<gbp>    Override the total budget cap (default £15).
 *
 * @author Tristan Fischer 2026-05-18 (task #87 dispatch)
 */

import {
  generateClassRegistryEntry,
  validatePayload,
  openAutoClassRegistryDb,
  type AutoClassPayload,
  type GeneratorOutput,
  type ValidationResult,
} from './generate-class-registry.js'

// ---------------------------------------------------------------------------
// Test classes
// ---------------------------------------------------------------------------

interface TestClass {
  slug: string
  brief_excerpt: string
}

const DEFAULT_TEST_CLASSES: TestClass[] = [
  {
    slug: 'tidal_turbine',
    brief_excerpt: [
      'A 500 kW horizontal-axis tidal stream turbine intended for shallow-water',
      'tidal sites (10-30 m depth) in the Pentland Firth and the Bristol Channel.',
      'Bidirectional yaw-controlled rotor (3 blades, 16 m diameter), permanent-',
      'magnet direct-drive generator, subsea power-conversion electronics in a',
      'pressure-rated nacelle, 11 kV three-phase output via dynamic submarine',
      'cable to a shore-side grid-connection substation. Marine biofouling',
      'mitigation via copper-alloy nose cone and antifouling coating. Designed',
      'for 20-year service life with 5-year planned overhauls.',
    ].join(' '),
  },
  {
    slug: 'drone_swarm_router',
    brief_excerpt: [
      'A drone-swarm mesh-network router airborne payload — sits inside a',
      'small unmanned aerial vehicle (1-3 kg take-off mass) and provides a',
      'self-healing mesh between 50-500 drones in a swarm operating over an',
      'area up to 25 km². Dual-band radio (2.4 GHz + 5.8 GHz) with',
      'beam-forming, time-division multiple-access (TDMA) scheduling, and',
      'failover routing. Onboard ARM Cortex-A78 compute, 16 GB LPDDR5, 256 GB',
      'NVMe. Targets defence + agriculture inspection markets. UK / EU CE-RED',
      '+ FCC Part 15 + MIL-STD-810H environmental qualification.',
    ].join(' '),
  },
  {
    slug: 'lab_centrifuge',
    brief_excerpt: [
      'A benchtop laboratory centrifuge for clinical biochemistry labs —',
      '12-position fixed-angle rotor (1.5 mL Eppendorf tubes), variable speed',
      'to 15,000 rpm (~21,000 × g), brushless DC motor with closed-loop',
      'tachometer feedback, microcontroller-driven user interface with rotor',
      'imbalance detection and lid interlock. Targets the £400-800 retail',
      'price band sold via Cole-Parmer and VWR. Compliance: CE-LVD, EMC, IEC',
      '61010-1 (lab equipment safety), IEC 61010-2-020 (centrifuge specific).',
      '230 VAC mains powered, 200 W peak.',
    ].join(' '),
  },
]

// ---------------------------------------------------------------------------
// Reporting types
// ---------------------------------------------------------------------------

interface ClassResult {
  slug: string
  outcome:
    | 'ALIAS'
    | 'GENERATED'
    | 'CACHE_HIT'
    | 'GENERATION_FAILED'
    | 'VALIDATION_FAILED'
  alias_resolved_to?: string
  cost_gbp: number
  input_tokens: number
  output_tokens: number
  validation?: ValidationResult
  sub_module_excerpt?: string[]
  required_modules?: string[]
  generated_payload?: AutoClassPayload
  error?: string
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(): { classes: TestClass[]; force: boolean; budget: number } {
  const args = process.argv.slice(2)
  const classesArg = args.find(a => a.startsWith('--classes='))
  const budgetArg = args.find(a => a.startsWith('--budget='))
  const force = args.includes('--force')
  let classes = DEFAULT_TEST_CLASSES
  if (classesArg) {
    const csv = classesArg.slice('--classes='.length)
    classes = csv.split(',').map(s => ({
      slug: s.trim(),
      brief_excerpt: '(no brief provided via flag)',
    }))
  }
  const budget = budgetArg ? Number(budgetArg.slice('--budget='.length)) : 15
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error(`Invalid --budget value: ${budgetArg}`)
  }
  return { classes, force, budget }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runOne(
  testClass: TestClass,
  force: boolean,
  db: ReturnType<typeof openAutoClassRegistryDb>,
): Promise<ClassResult> {
  const slug = testClass.slug
  const brief = testClass.brief_excerpt
  let out: GeneratorOutput
  try {
    out = await generateClassRegistryEntry(slug, {
      briefExcerpt: brief,
      db,
      forceRefresh: force,
    })
  } catch (err) {
    return {
      slug,
      outcome: 'GENERATION_FAILED',
      cost_gbp: 0,
      input_tokens: 0,
      output_tokens: 0,
      error: `generator threw: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (!out.ok) {
    return {
      slug,
      outcome: 'GENERATION_FAILED',
      cost_gbp: 0,
      input_tokens: 0,
      output_tokens: 0,
      error: out.error,
    }
  }

  if (out.alias) {
    return {
      slug,
      outcome: 'ALIAS',
      alias_resolved_to: out.resolved_slug,
      cost_gbp: 0,
      input_tokens: 0,
      output_tokens: 0,
    }
  }

  const v = validatePayload(out.payload)
  const requiredModules = out.payload.modules
    .filter(m => m.applicability === 'required')
    .map(m => m.module)
  // Excerpt: 1-2 sub-modules from the first 2 required modules.
  const excerpt: string[] = []
  for (const m of out.payload.modules.filter(m => m.applicability === 'required').slice(0, 2)) {
    for (const sm of (m.sub_modules ?? []).slice(0, 2)) {
      excerpt.push(`${m.module} :: ${sm.id} — ${sm.display}`)
    }
  }
  // CACHE_HIT vs GENERATED detection: if the generated_at timestamp is older
  // than 5 minutes, this is a cache hit (we just retrieved a previously
  // persisted row). Fresh generation always stamps within this window.
  const ageMs = Date.now() - new Date(out.audit.generated_at).getTime()
  const isFresh = ageMs < 5 * 60 * 1000
  return {
    slug,
    outcome: v.ok
      ? isFresh
        ? 'GENERATED'
        : 'CACHE_HIT'
      : 'VALIDATION_FAILED',
    cost_gbp: isFresh ? out.audit.estimated_cost_gbp : 0,
    input_tokens: out.audit.input_tokens,
    output_tokens: out.audit.output_tokens,
    validation: v,
    sub_module_excerpt: excerpt,
    required_modules: requiredModules,
    generated_payload: out.payload,
    error: v.ok ? undefined : v.errors.join('; '),
  }
}

async function main(): Promise<void> {
  const { classes, force, budget } = parseArgs()
  console.log('─'.repeat(78))
  console.log(`Class-Registry Generator — test harness`)
  console.log(`  Classes:   ${classes.map(c => c.slug).join(', ')}`)
  console.log(`  Force:     ${force}`)
  console.log(`  Budget:    £${budget.toFixed(2)}`)
  console.log('─'.repeat(78))
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('⚠ OPENROUTER_API_KEY is not set — only cache hits + alias resolutions will succeed.')
  }

  const db = openAutoClassRegistryDb()
  const results: ClassResult[] = []
  let totalCost = 0
  try {
    for (const tc of classes) {
      console.log('')
      console.log(`▶ ${tc.slug}`)
      console.log(`  brief excerpt: ${tc.brief_excerpt.slice(0, 120)}...`)
      const result = await runOne(tc, force, db)
      results.push(result)
      totalCost += result.cost_gbp
      console.log(`  outcome:       ${result.outcome}`)
      if (result.outcome === 'ALIAS') {
        console.log(`  → aliased to:  ${result.alias_resolved_to}`)
      } else if (result.outcome === 'GENERATION_FAILED') {
        console.log(`  ✗ error:       ${result.error}`)
      } else if (result.outcome === 'VALIDATION_FAILED') {
        console.log(`  ✗ validation:  ${result.error}`)
        if (result.validation?.warnings.length) {
          console.log(`    warnings:    ${result.validation.warnings.join(' | ')}`)
        }
      } else {
        // GENERATED or CACHE_HIT
        console.log(
          `  tokens:        in=${result.input_tokens} out=${result.output_tokens}` +
          `   cost: £${result.cost_gbp.toFixed(3)}`,
        )
        console.log(
          `  multiplier:    ${result.validation?.cost_stack_multiplier.toFixed(2)}× raw→installed`,
        )
        console.log(
          `  required mods: ${(result.required_modules ?? []).join(', ') || '(none)'}`,
        )
        if (result.sub_module_excerpt && result.sub_module_excerpt.length > 0) {
          console.log(`  sub-module excerpt:`)
          for (const e of result.sub_module_excerpt) {
            console.log(`     · ${e}`)
          }
        }
        if (result.validation?.warnings.length) {
          console.log(`  ⚠ warnings:   ${result.validation.warnings.join(' | ')}`)
        }
      }
      if (totalCost > budget) {
        console.error(
          `\n‼ BUDGET BREACHED — total £${totalCost.toFixed(2)} > cap £${budget.toFixed(2)}; aborting remaining classes.`,
        )
        break
      }
    }
  } finally {
    db.close()
  }

  // Final summary.
  console.log('')
  console.log('─'.repeat(78))
  console.log('SUMMARY')
  console.log('─'.repeat(78))
  let okCount = 0
  let failCount = 0
  let aliasCount = 0
  for (const r of results) {
    const verdict =
      r.outcome === 'GENERATED' || r.outcome === 'CACHE_HIT'
        ? r.validation?.ok
          ? 'VALID'
          : 'INVALID'
        : r.outcome === 'ALIAS'
          ? 'ALIAS'
          : 'FAILED'
    if (verdict === 'VALID') okCount += 1
    else if (verdict === 'ALIAS') aliasCount += 1
    else failCount += 1
    const costStr = r.cost_gbp > 0 ? `£${r.cost_gbp.toFixed(3)}` : '£0.000'
    console.log(`  ${r.slug.padEnd(34)} ${verdict.padEnd(8)} ${costStr.padStart(8)}  ${r.outcome}`)
  }
  console.log('─'.repeat(78))
  console.log(`  Total cost:    £${totalCost.toFixed(3)} / £${budget.toFixed(2)} budget`)
  console.log(`  Valid:         ${okCount}`)
  console.log(`  Alias:         ${aliasCount}`)
  console.log(`  Failed:        ${failCount}`)
  console.log('─'.repeat(78))

  if (failCount > 0) {
    process.exit(2)
  }
}

main().catch(err => {
  console.error('[test-class-registry-generator] FATAL:', err)
  process.exit(99)
})
