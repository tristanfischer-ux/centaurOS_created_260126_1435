/**
 * scripts/test-generic-skeleton.tsx
 *
 * Self-verifying smoke + invariant test for the wall-3 generic structure
 * deriver (scaffold). Proves the new files LOAD and the deriver produces a
 * structurally-valid, gate-23-shaped skeleton from the BESS class graph —
 * WITHOUT running the chain, an LLM, or the network (one local forge-truth.db
 * read only).
 *
 *   npx tsx scripts/test-generic-skeleton.tsx     # exit 0 = PASS, 1 = FAIL
 */
import { getClassReferenceGraphDBFirst } from '../src/lib/pdf-engine-v2/lib/knowledge/class-reference-graph-db'
import { deriveGenericSkeleton } from './lib/orchestrator/generic/derive-skeleton'

async function main(): Promise<void> {
  const fails: string[] = []

  const graph = await getClassReferenceGraphDBFirst('bess-utility-scale')
  if (!graph || graph.nodes.length === 0) {
    console.error('FAIL: no bess-utility-scale class-reference graph resolved')
    process.exit(1)
  }

  const modules = deriveGenericSkeleton(
    graph,
    {} as never,
    { class: 'bess', scale_tier: 'utility_containerised' } as never,
    { quantities: { nameplate_capacity_kwh: { value: 2500 } } } as never,
  )

  // 1. one module per graph node
  if (modules.length !== graph.nodes.length) {
    fails.push(`module count ${modules.length} != graph node count ${graph.nodes.length}`)
  }

  // 2. skeleton ⊇ required nodes (every required node class appears as a module)
  const moduleNames = new Set(modules.map((m) => m.module))
  for (const n of graph.nodes) {
    if (n.required && !moduleNames.has(String(n.class))) {
      fails.push(`required node '${String(n.class)}' missing from skeleton`)
    }
  }

  // 3. gate-23 shape: every module has ≥1 sub_module with ≥1 word carrying a
  //    part_number modifier (the completeness check shape the chain enforces)
  for (const m of modules) {
    const sms = m.sub_modules as Array<{
      words?: Array<{ modifier_characters?: Array<{ kind: string }> }>
    }>
    const ok = sms.some((sm) =>
      (sm.words ?? []).some((w) =>
        (w.modifier_characters ?? []).some((mc) => mc.kind === 'part_number'),
      ),
    )
    if (!ok) fails.push(`module '${m.module}' has no part_number-bearing word (gate-23 shape)`)
  }

  // 4. principal node surfaces the contract quantity (numbers flow, nothing invented)
  const principal = graph.nodes.find((n) => n.role === 'principal')
  if (principal) {
    const pm = modules.find((m) => m.module === String(principal.class))
    const got = (pm?.derived_parameters as Record<string, unknown> | undefined)?.nameplate_capacity_kwh
    if (got !== 2500) {
      fails.push(`principal module did not surface contract quantity nameplate_capacity_kwh=2500 (got ${String(got)})`)
    }
  }

  if (fails.length) {
    console.error('FAIL — generic skeleton invariants:')
    for (const f of fails) console.error('  - ' + f)
    process.exit(1)
  }

  console.log(
    `PASS — generic skeleton: ${modules.length} modules from ${graph.nodes.length} graph nodes; ` +
      `all required nodes present; gate-23 shape ok; principal quantity surfaced.`,
  )
  process.exit(0)
}

main().catch((e: unknown) => {
  console.error('FAIL (threw):', (e as Error)?.message ?? e)
  process.exit(1)
})
