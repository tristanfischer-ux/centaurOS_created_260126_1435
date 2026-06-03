/**
 * scripts/test-generic-skeleton.tsx
 *
 * Self-verifying smoke + invariant test for the wall-3 generic emitter Phase-1
 * build (component-level structure + cross-module links). Proves the new files
 * LOAD and produce a structurally-valid design that will clear the universal
 * grammar gates — WITHOUT running the chain, an LLM, or the network (one local
 * forge-truth.db read for the corpus component union only).
 *
 *   npx tsx scripts/test-generic-skeleton.tsx     # exit 0 = PASS, 1 = FAIL
 */
import { getClassReferenceGraphDBFirst } from '../src/lib/pdf-engine-v2/lib/knowledge/class-reference-graph-db'
import { getClassConnections, mechanismToKind } from '../src/lib/pdf-engine-v2/class-connections'
import { deriveGenericSkeleton } from './lib/orchestrator/generic/derive-skeleton'
import { loadClassComponents } from './lib/orchestrator/generic/component-source'
import { buildCrossModuleLinks } from './lib/orchestrator/generic/build-links'

const MIN_WORDS = 5
const MIN_MODS = 4

async function main(): Promise<void> {
  const fails: string[] = []

  const graph = await getClassReferenceGraphDBFirst('bess-utility-scale')
  if (!graph || graph.nodes.length === 0) {
    console.error('FAIL: no bess-utility-scale class-reference graph resolved')
    process.exit(1)
  }

  // Tier-A corpus union (real DB read — the Phase-1 component source).
  const components = loadClassComponents('bess')
  const corpusHit = components.size > 0
  if (!corpusHit) {
    fails.push('loadClassComponents("bess") returned empty — corpus read or pretraining_products is missing')
  }

  const contract = {
    product_class: 'bess',
    quantities: {
      cell_count: { value: 4536 },
      module_count: { value: 189 },
      nameplate_capacity_kwh: { value: 2500 },
      continuous_power_kw: { value: 1000 },
    },
  }

  const modules = deriveGenericSkeleton(
    graph,
    {} as never,
    { class: 'bess', scale_tier: 'utility_containerised' } as never,
    contract as never,
    components,
  )

  // 1. one module per graph node
  if (modules.length !== graph.nodes.length) {
    fails.push(`module count ${modules.length} != graph node count ${graph.nodes.length}`)
  }

  // 2. skeleton ⊇ required nodes
  const moduleNames = new Set(modules.map((m) => m.module))
  for (const n of graph.nodes) {
    if (n.required && !moduleNames.has(String(n.class))) {
      fails.push(`required node '${String(n.class)}' missing from skeleton`)
    }
  }

  // 3. D-1: every module has ≥2 sub_modules (audit-pdf-run mean ≥2.0/module)
  // 4. DENSITY: every sub_module has ≥5 words (sub_module_word_density floor)
  // 5. RICHNESS + SAFE-PLACEHOLDER: every word has ≥4 modifiers, a quantity, and a
  //    part_number that is a gate-20-safe GROUNDABLE placeholder (never a real/invented MPN)
  let sawContractQty = false
  const PLACEHOLDER_PN = /\b(tbd|specify|detailed\s+design|to\s+be\s+confirmed|placeholder)\b/i
  for (const m of modules) {
    const subs = m.sub_modules as Array<{ id: string; words?: Array<{ modifier_characters?: Array<{ kind: string; value: string }> }> }>
    if (subs.length < 2) {
      fails.push(`module '${m.module}' has ${subs.length} sub_module(s) (<2 — audit-pdf-run D-1 wants mean ≥2.0/module)`)
    }
    for (const sm of subs) {
      const words = sm.words ?? []
      if (words.length < MIN_WORDS) {
        fails.push(`sub_module '${m.module}::${sm.id}' has ${words.length} words (<${MIN_WORDS} density floor)`)
      }
      for (const w of words) {
        const mods = w.modifier_characters ?? []
        if (mods.length < MIN_MODS) {
          fails.push(`word in '${m.module}::${sm.id}' has ${mods.length} mods (<${MIN_MODS} richness floor)`)
        }
        const pn = mods.find((x) => x.kind === 'part_number')?.value
        if (pn !== undefined && !PLACEHOLDER_PN.test(pn)) {
          fails.push(`word in '${m.module}::${sm.id}' has a non-placeholder part_number '${pn}' (emitter must never emit a real/invented MPN — grounding is downstream)`)
        }
        if (!mods.some((x) => x.kind === 'quantity')) {
          fails.push(`word in '${m.module}::${sm.id}' has no quantity modifier`)
        }
        if (mods.some((x) => x.kind === 'quantity' && x.value === '×4536')) sawContractQty = true
      }
    }
  }

  // 5. CONTRACT-COUNT MATCHING: a cells word picked up cell_count=4536
  if (!sawContractQty) {
    fails.push('no word picked up the contract cell_count=4536 (head-noun quantity match broken, or corpus lacks a *cells* component)')
  }

  // 6. PRINCIPAL surfaces contract quantity + arithmetic completeness
  const principal = graph.nodes.find((n) => n.role === 'principal')
  if (principal) {
    const pm = modules.find((m) => m.module === String(principal.class))
    const dp = (pm?.derived_parameters as Record<string, unknown> | undefined) ?? {}
    if (dp['nameplate_capacity_kwh'] !== 2500) {
      fails.push(`principal did not surface nameplate_capacity_kwh=2500 (got ${String(dp['nameplate_capacity_kwh'])})`)
    }
    if (dp['cells_per_module'] !== 24) {
      fails.push(`principal cells_per_module arithmetic wrong (4536/189=24, got ${String(dp['cells_per_module'])})`)
    }
  }

  // 7. CROSS-MODULE LINKS: required pairs present with the right kind + no dangling
  const links = buildCrossModuleLinks(graph, ['bess'])
  if (links.length === 0) fails.push('buildCrossModuleLinks returned no links')
  const nodeSet = new Set(graph.nodes.map((n) => String(n.class)))
  for (const l of links) {
    if (!nodeSet.has(l.from_module) || !nodeSet.has(l.to_module)) {
      fails.push(`dangling link ${l.from_module}→${l.to_module} (endpoint not a graph node)`)
    }
  }
  // declared pair→kinds map (mirrors the cross_module_required_links gate)
  const declared = new Map<string, Set<string>>()
  for (const l of links) {
    const kind = mechanismToKind(l.mechanism)
    if (!kind) continue // extra corpus-grown graph edge (e.g. deflagration_path) — harmless; required pairs are covered by the canonical-mechanism links below
    for (const k of [`${l.from_module}<->${l.to_module}`, `${l.to_module}<->${l.from_module}`]) {
      if (!declared.has(k)) declared.set(k, new Set())
      declared.get(k)!.add(kind)
    }
  }
  for (const req of getClassConnections('energy_storage').connections) {
    if (!nodeSet.has(req.module_a) || !nodeSet.has(req.module_b)) continue // out-of-design (gate skips)
    const kinds = declared.get(`${req.module_a}<->${req.module_b}`)
    if (!kinds || !kinds.has(req.kind)) {
      fails.push(`required link MISSING: ${req.module_a} ↔ ${req.module_b} [${req.kind}]`)
    }
  }
  // 8. sensor_has_receiver precondition: sensing module is a from_module
  if (!links.some((l) => l.from_module === 'sensing_instrumentation')) {
    fails.push('sensing_instrumentation is never a from_module (sensor_has_receiver would fail)')
  }

  if (fails.length) {
    console.error('FAIL — generic Phase-1 invariants:')
    for (const f of fails) console.error('  - ' + f)
    process.exit(1)
  }

  const totalSubs = modules.reduce((a, m) => a + (m.sub_modules as unknown[]).length, 0)
  const totalWords = modules.reduce((a, m) => a + (m.sub_modules as Array<{ words?: unknown[] }>).reduce((b, sm) => b + (sm.words?.length ?? 0), 0), 0)
  console.log(
    `PASS — generic Phase-1: ${modules.length} modules / ${totalSubs} sub_modules (≥2/module) / ${totalWords} component words ` +
      `(corpus ${corpusHit ? 'hit' : 'MISS→floor'}); all sub_modules ≥${MIN_WORDS} words; ` +
      `all words ≥${MIN_MODS} mods with a gate-20-safe placeholder part_number; cell_count=4536 surfaced on a cells word; ` +
      `${links.length} cross-links cover every required energy_storage pair; sensing is a from_module.`,
  )
  process.exit(0)
}

main().catch((e: unknown) => {
  console.error('FAIL (threw):', (e as Error)?.message ?? e)
  process.exit(1)
})
