/**
 * scripts/fe-front-run-relevance-sweep.tsx
 *
 * Run the DETERMINISTIC RELEVANCE SWEEP against a live twin and report the
 * capability-judged tool set.
 *
 * WHY (Tristan 2026-08-01): I answered "which tools apply?" with
 * `applicable_to(envelope)` — the CLOSED-WORLD CLASS WHITELIST that this repo's
 * own design doc says "can NEVER serve an unseen class by construction" (153 of
 * 196 tools hard-code a class list; `formula_e_front_mgu` is in almost none of
 * them). That produced 16/196 and it is the KNOWN-BROKEN method's answer.
 *
 * The sweep judges CAPABILITY against the brief's duties, asks a YES/NO for
 * EVERY tool (exhaustive — nothing forgotten), and caches by sha1 of the inputs
 * (deterministic — identical replay). `applicable_to` is passed in as an
 * AUTHOR-SCOPE SIGNAL the model weighs, never as a filter.
 *
 * Usage: npx tsx scripts/fe-front-run-relevance-sweep.tsx --twin out/<dir>
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve(__dirname, '..')
const TOOLS_DIR = join(ROOT, 'scripts/lib/orchestrator/tools')

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

type AnyTool = {
  id?: string
  name?: string
  domain?: string
  description?: string
  applicable_to?: (e: unknown, c?: unknown) => boolean
}

async function loadTools(): Promise<AnyTool[]> {
  const files = readdirSync(TOOLS_DIR).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
  const out: AnyTool[] = []
  for (const f of files) {
    try {
      const mod = await import(join(TOOLS_DIR, f))
      for (const k of Object.keys(mod)) {
        const v = mod[k] as AnyTool
        if (v && typeof v === 'object' && typeof v.id === 'string'
            && typeof v.applicable_to === 'function') out.push(v)
      }
    } catch { /* unimportable module — reported in the count delta */ }
  }
  return out
}

async function main(): Promise<number> {
  const twin = arg('--twin')
  if (!twin) { console.error('usage: --twin out/<dir>'); return 2 }

  const state = JSON.parse(readFileSync(join(twin, 'state.json'), 'utf-8'))
  const q = state?.orchestratorContract?.quantities ?? {}
  const brief = state?.parsedBrief ?? {}
  const klass = brief?.product_class
    ?? state?.orchestratorContract?.product_class ?? 'formula_e_front_mgu'

  const envelope = {
    class: String(klass),
    scale_tier: 'motorsport',
    voltage_tier: 'high' as const,
    form_factor: 'sealed_traction_pack',
  }

  // Duties = the contract's numeric quantities. These are what the sweep judges
  // capability against — "does this tool's physics fit THESE duties?"
  const duties: { key: string; value: number; unit: string }[] = []
  for (const [k, raw] of Object.entries(q)) {
    const r = raw as { value?: unknown; unit?: string } | number
    const v = typeof r === 'object' && r !== null ? Number((r as any).value) : Number(r)
    const u = typeof r === 'object' && r !== null ? String((r as any).unit ?? '') : ''
    if (Number.isFinite(v)) duties.push({ key: k, value: v, unit: u })
  }

  const tools = await loadTools()
  // Use the REPO'S OWN catalogue builder — it carries `output_fields` (what each
  // tool COMPUTES), which is the actual relevance signal the sweep judges on.
  // Hand-rolling the catalogue (my first attempt) dropped that field and crashed
  // the prompt builder — the same "wrote my own instead of using the existing
  // one" mistake this whole thread is about.
  const { buildToolCatalogue } = await import(
    join(ROOT, 'scripts/lib/orchestrator/generic/bootstrap-tool-plan.ts'))
  const catalogue = buildToolCatalogue()

  // AUTHOR-SCOPE SIGNAL — passed as a signal, never a filter.
  const applicableToThisClass = new Map<string, boolean | null>()
  for (const t of tools) {
    try { applicableToThisClass.set(t.id!, !!t.applicable_to!(envelope, {})) }
    catch { applicableToThisClass.set(t.id!, null) }
  }
  const authorYes = [...applicableToThisClass.values()].filter(Boolean).length

  console.log(`twin      : ${twin}`)
  console.log(`class     : ${envelope.class}`)
  console.log(`catalogue : ${catalogue.length} tools`)
  console.log(`duties    : ${duties.length} contract quantities`)
  console.log(`author-scope says YES to ${authorYes}/${catalogue.length} `
    + `(the whitelist answer — a FLOOR, not the truth)\n`)

  const { sweepToolRelevance } = await import(
    join(ROOT, 'scripts/lib/orchestrator/generic/relevance-sweep.ts'))

  console.log('running capability sweep (YES/NO for EVERY tool, batched)…')
  const t0 = Date.now()
  const res = await sweepToolRelevance({
    slug: 'fe-front-mgu',
    brief,
    envelope,
    duties,
    catalogue,
    targetProcess: brief?.constraints?.target_process
      ?? 'Formula E front powertrain kit: 250 kW regenerative front MGU with '
       + 'in-rotor planetary reduction, SiC inverter and liquid cooling.',
    applicableToThisClass,
  } as never)
  const secs = ((Date.now() - t0) / 1000).toFixed(1)

  if (!(res as { ok?: boolean }).ok) {
    console.error(`\nSWEEP FAILED after ${secs}s:`,
      JSON.stringify(res).slice(0, 600))
    console.error('(fail-safe: the chain would keep the FULL catalogue)')
    return 1
  }

  const ok = res as Record<string, unknown>
  // Tolerate either shape: a list of entries or a list of ids, under any of the
  // plausible keys. (Reading the actual return shape beats assuming it.)
  const rawRel = (ok.relevant_tool_ids ?? ok.relevant ?? ok.relevant_tools
    ?? ok.selected ?? []) as ReadonlyArray<unknown>
  const relevantIds = new Set(
    rawRel.map((r) => (typeof r === 'string' ? r : (r as { tool_id: string }).tool_id)))
  if (relevantIds.size === 0) {
    console.error('could not read relevant set; keys =', Object.keys(ok).join(', '))
    return 1
  }
  const byDomain = new Map<string, string[]>()
  for (const c of catalogue) {
    if (!relevantIds.has(c.tool_id)) continue
    byDomain.set(c.domain, [...(byDomain.get(c.domain) ?? []), c.tool_id])
  }

  console.log(`\nSWEEP: ${relevantIds.size}/${catalogue.length} tools RELEVANT `
    + `by capability  (${secs}s)\n`)
  for (const [d, ids] of [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${d} (${ids.length})`)
    for (const id of ids.sort()) {
      const authored = applicableToThisClass.get(id)
      const flag = authored === true ? '' : '   <- author-scope said NO'
      console.log(`     ${id}${flag}`)
    }
  }

  // The headline: tools the whitelist would have STARVED.
  const rescued = [...relevantIds].filter((id) => applicableToThisClass.get(id) !== true)
  console.log(`\n  RESCUED BY CAPABILITY JUDGEMENT: ${rescued.length} tools the `
    + `class whitelist would have excluded`)

  const out = join(twin, 'relevance-sweep.json')
  writeFileSync(out, JSON.stringify({
    schema: 'forgeos.fpk.relevance_sweep_run/v1',
    envelope, catalogue_size: catalogue.length,
    author_scope_yes: authorYes,
    sweep_relevant: relevantIds.size,
    rescued_by_capability: rescued,
    relevant: [...relevantIds].sort(),
    verdicts: (ok.verdicts ?? []) as unknown,
  }, null, 2))
  console.log(`\n→ ${out}`)
  return 0
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
