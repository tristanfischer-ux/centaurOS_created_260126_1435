/**
 * scripts/fe-front-tool-router-query.tsx
 *
 * ROUTER QUERY — ask the tool registry which of its tools apply to a twin.
 *
 * INTENT (Tristan 2026-07-31): "the whole purpose of all of these engines (and
 * there are over 200, nearly 300 of them now) is that you use them... it feels
 * that there's a bigger problem, which is an understanding of which tools to use
 * and why. If you don't get that part right, then you're not gonna get anything
 * right downstream from it."
 *
 * He is right, and the failure was mine: I hand-picked 3 solvers out of one
 * directory of 26 while a 197-tool registry — in which EVERY tool declares its
 * own `applicable_to(envelope, contract)` — sat unused. Tool selection is a
 * COMPUTED question in this codebase. Answering it by guessing is why the
 * downstream engineering was wrong.
 *
 * This script makes the computed answer visible: it loads every tool module,
 * builds the twin's envelope, and asks each tool whether it applies. The output
 * is the authoritative "what should have run" list.
 *
 * Usage: npx tsx scripts/fe-front-tool-router-query.tsx --twin out/<dir>
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve(__dirname, '..')
const TOOLS_DIR = join(ROOT, 'scripts/lib/orchestrator/tools')

type AnyTool = {
  id?: string
  name?: string
  domain?: string
  applicable_to?: (envelope: unknown, contract?: unknown) => boolean
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function loadAllTools(): Promise<AnyTool[]> {
  const files = readdirSync(TOOLS_DIR).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'),
  )
  const tools: AnyTool[] = []
  let failed = 0
  for (const f of files) {
    try {
      const mod = await import(join(TOOLS_DIR, f))
      for (const key of Object.keys(mod)) {
        const v = mod[key] as AnyTool
        if (v && typeof v === 'object' && typeof v.id === 'string'
            && typeof v.applicable_to === 'function') {
          tools.push(v)
        }
      }
    } catch {
      failed += 1
    }
  }
  if (failed) console.error(`  (${failed} tool module(s) failed to import)`)
  return tools
}

function buildEnvelope(twin: string): Record<string, unknown> {
  const state = JSON.parse(readFileSync(join(twin, 'state.json'), 'utf-8'))
  const q = state?.orchestratorContract?.quantities ?? {}
  const num = (k: string): number | undefined => {
    const r = q[k]
    const v = r && typeof r === 'object' ? r.value : r
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  const klass =
    state?.parsedBrief?.product_class ??
    state?.orchestratorContract?.product_class ??
    state?.moduleDecomposition?.product_class ??
    'formula_e_front_mgu'
  return {
    class: String(klass),
    scale_tier: 'motorsport',
    voltage_tier: 'high',
    form_factor: 'sealed_traction_pack',
    // Common numeric envelope hints tools may key on.
    rated_power_kw: num('continuous_electrical_power_kw') ?? 250,
    dc_bus_voltage_v: num('dc_bus_voltage_v') ?? 750,
    max_speed_rpm: num('max_rotor_speed_rpm') ?? 19500,
  }
}

async function main(): Promise<number> {
  const twin = arg('--twin')
  if (!twin) {
    console.error('usage: --twin out/<dir>')
    return 2
  }
  const envelope = buildEnvelope(twin)
  console.log(`envelope: class=${envelope.class} form=${envelope.form_factor} `
    + `power=${envelope.rated_power_kw}kW bus=${envelope.dc_bus_voltage_v}V`)

  const tools = await loadAllTools()
  console.log(`tools loaded: ${tools.length}\n`)

  const applies: AnyTool[] = []
  const rejects: AnyTool[] = []
  const errored: string[] = []
  for (const t of tools) {
    try {
      if (t.applicable_to!(envelope, {})) applies.push(t)
      else rejects.push(t)
    } catch {
      errored.push(t.id!)
    }
  }

  const byDomain = new Map<string, AnyTool[]>()
  for (const t of applies) {
    const d = t.domain ?? 'unknown'
    byDomain.set(d, [...(byDomain.get(d) ?? []), t])
  }

  console.log(`THE REGISTRY SAYS ${applies.length} TOOLS APPLY TO THIS ENVELOPE:\n`)
  for (const [domain, ts] of [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${domain} (${ts.length})`)
    for (const t of ts.sort((a, b) => a.id!.localeCompare(b.id!))) {
      console.log(`     ${t.id}`)
    }
  }
  console.log(`\n  not applicable : ${rejects.length}`)
  console.log(`  applicable_to threw : ${errored.length}`)

  const out = join(twin, 'tool-router-query.json')
  writeFileSync(out, JSON.stringify({
    schema: 'forgeos.fpk.tool_router_query/v1',
    envelope,
    tools_loaded: tools.length,
    applicable: applies.map((t) => ({ id: t.id, name: t.name, domain: t.domain })),
    applicable_count: applies.length,
    not_applicable_count: rejects.length,
    errored,
  }, null, 2))
  console.log(`\n→ ${out}`)
  return 0
}

main().then((c) => process.exit(c))
