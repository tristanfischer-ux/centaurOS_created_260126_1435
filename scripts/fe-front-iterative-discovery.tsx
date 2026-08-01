/**
 * Run ITERATIVE TOOL DISCOVERY against a live twin.
 *
 * Round 0 sweeps the brief duties. Each later round adds the OUTPUT FIELDS of
 * the tools already chosen, so a tool that only becomes relevant once an earlier
 * tool has computed something is found. Stops at a fixpoint.
 *
 * Usage: npx tsx scripts/fe-front-iterative-discovery.tsx --twin out/<dir>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve(__dirname, '..')

function arg(f: string): string | undefined {
  const i = process.argv.indexOf(f)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<number> {
  const twin = arg('--twin')
  if (!twin) { console.error('usage: --twin out/<dir>'); return 2 }

  const state = JSON.parse(readFileSync(join(twin, 'state.json'), 'utf-8'))
  const q = state?.orchestratorContract?.quantities ?? {}
  const brief = state?.parsedBrief ?? {}
  const envelope = {
    class: String(brief?.product_class ?? 'formula_e_front_mgu'),
    scale_tier: 'motorsport',
    voltage_tier: 'high' as const,
    form_factor: 'sealed_traction_pack',
  }

  // The registry is populated by MODULE-LOAD SIDE EFFECTS (each tool file calls
  // registerTool at import). Skip this and buildToolCatalogue() returns 0.
  const { readdirSync } = await import('node:fs')
  const TOOLS_DIR = join(ROOT, 'scripts/lib/orchestrator/tools')
  for (const f of readdirSync(TOOLS_DIR).filter(
    (x) => x.endsWith('.ts') && !x.endsWith('.test.ts') && !x.endsWith('.d.ts'))) {
    try { await import(join(TOOLS_DIR, f)) } catch { /* unimportable */ }
  }

  const { buildToolCatalogue } = await import(
    join(ROOT, 'scripts/lib/orchestrator/generic/bootstrap-tool-plan.ts'))
  const { sweepToolRelevance } = await import(
    join(ROOT, 'scripts/lib/orchestrator/generic/relevance-sweep.ts'))
  const { iterativeToolDiscovery } = await import(
    join(ROOT, 'scripts/lib/orchestrator/generic/iterative-tool-discovery.ts'))

  const catalogue = buildToolCatalogue()
  const seedDuties: string[] = []
  const dutyVals = new Map<string, { value: number; unit: string }>()
  for (const [k, raw] of Object.entries(q)) {
    const r = raw as { value?: unknown; unit?: string } | number
    const v = typeof r === 'object' && r !== null ? Number((r as any).value) : Number(r)
    const u = typeof r === 'object' && r !== null ? String((r as any).unit ?? '') : ''
    if (Number.isFinite(v)) { seedDuties.push(k); dutyVals.set(k, { value: v, unit: u }) }
  }

  console.log(`twin      : ${twin}`)
  console.log(`catalogue : ${catalogue.length} tools`)
  console.log(`seed duties: ${seedDuties.length}\n`)

  const sweep = async (duties: ReadonlyArray<string>) => {
    const res = await sweepToolRelevance({
      slug: 'fe-front-mgu',
      brief,
      envelope,
      duties: duties.map((k) => ({
        key: k,
        value: dutyVals.get(k)?.value ?? 1,
        unit: dutyVals.get(k)?.unit ?? '',
      })),
      catalogue,
      targetProcess: 'Formula E front powertrain kit: 250 kW regenerative front '
        + 'MGU, in-rotor planetary reduction, SiC inverter, liquid cooling.',
    } as never) as Record<string, unknown>
    return {
      ok: !!res.ok,
      relevant_tool_ids: (res.relevant_tool_ids ?? []) as string[],
      cache_key: res.cache_key as string | undefined,
      llm_cost_usd: res.llm_cost_usd as number | undefined,
      from_cache: res.from_cache as boolean | undefined,
    }
  }

  // Duties the design MUST have computed. Anything left is a capability gap —
  // the honest trigger to author a tool (rather than hand-rolling one silently).
  const required = [
    'rotor_critical_speed_rpm',
    'magnet_demagnetisation_margin',
    'winding_temperature_c',
    'gear_bending_stress_mpa',
    'bearing_l10_life_h',
  ]

  const res = await iterativeToolDiscovery(
    seedDuties,
    catalogue.map((c: { tool_id: string; domain: string; output_fields: string[] }) => ({
      tool_id: c.tool_id, domain: c.domain, output_fields: c.output_fields ?? [],
    })),
    sweep, 4, required,
  )

  for (const r of res.rounds) {
    const cache = r.from_cache ? ' [cache]' : ''
    console.log(`round ${r.round}: duties=${r.duty_count}  relevant=${r.relevant.length}`
      + `  NEW=${r.new_this_round.length}${cache}`)
    for (const id of r.new_this_round) console.log(`    + ${id}`)
  }
  console.log(`\nconverged            : ${res.converged}`)
  console.log(`final tool set       : ${res.final_tool_set.length}`)
  console.log(`FOUND BY ITERATION   : ${res.found_by_iteration.length}`
    + (res.found_by_iteration.length ? `  -> ${res.found_by_iteration.join(', ')}` : ''))
  console.log(`capability gaps      : ${res.capability_gaps.length}`)
  for (const g of res.capability_gaps) console.log(`    ! ${g}  (no catalogue tool computes this)`)
  console.log(`llm cost             : $${res.total_llm_cost_usd}`)

  const out = join(twin, 'iterative-tool-discovery.json')
  writeFileSync(out, JSON.stringify({
    schema: 'forgeos.fpk.iterative_tool_discovery/v1', ...res,
  }, null, 2))
  console.log(`\n→ ${out}`)
  return 0
}

main().then((c) => process.exit(c)).catch((e) => { console.error('FATAL', e); process.exit(1) })
