/**
 * scripts/lib/orchestrator/verify-tool-io-manifest.ts
 *
 * E0 VERIFICATION (ANVIL-UNIVERSAL-LOOP-PLAN) — loads `tool-io-manifest.json`
 * EXACTLY the way auto-plan-fallback.ts does (registered-tool filter + empty-
 * output skip) and reports what the auto-planner can see, then composes the
 * universal-required-outputs graph against the eligible registry. Pass a
 * second manifest path to diff (e.g. the pre-backfill manifest):
 *
 *   npx tsx scripts/lib/orchestrator/verify-tool-io-manifest.ts [old-manifest.json]
 *
 * No chain runs, no LLM calls — pure manifest + registry + graph assembly.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import './register-all'
import { getTool } from './registry'
import { composeToolGraph, type ToolIOSchema } from './auto-planner'

type RawManifest = Record<string, { input_keys?: string[]; output_keys?: string[] }>

// Mirror of auto-plan-fallback.ts :: loadToolIORegistry projection (kept in
// sync by the harness invariant UNIVERSAL.tool_io_manifest_backfilled).
function projectRegistry(raw: RawManifest): ToolIOSchema[] {
  const schemas: ToolIOSchema[] = []
  for (const [tool_id, io] of Object.entries(raw)) {
    const output_keys = io.output_keys ?? []
    if (output_keys.length === 0) continue
    const tool = getTool(tool_id)
    if (!tool) continue
    schemas.push({ tool_id, input_keys: io.input_keys ?? [], output_keys, domain: tool.domain })
  }
  schemas.sort((a, b) => a.tool_id.localeCompare(b.tool_id))
  return schemas
}

// Same universal required-output set as auto-plan-fallback.ts.
const UNIVERSAL_REQUIRED_OUTPUTS = ['total_system_mass_kg', 'cost_estimate_gbp', 'transport_cost_gbp']

function report(label: string, raw: RawManifest): ToolIOSchema[] {
  const total = Object.keys(raw).length
  const nonEmpty = Object.values(raw).filter((v) => (v.output_keys ?? []).length > 0).length
  const eligible = projectRegistry(raw)
  console.log(`\n=== ${label} ===`)
  console.log(`manifest tools: ${total} | with output_keys: ${nonEmpty} | planner-eligible (registered + non-empty): ${eligible.length}`)
  const g = composeToolGraph(UNIVERSAL_REQUIRED_OUTPUTS, eligible, [], 'novel-verify-class')
  console.log(`composeToolGraph(universal outputs): selected ${g.order.length} tools, ${g.feeds_into.length} edges, ${g.coupled_pairs.length} coupled pairs`)
  console.log(`  order: ${g.order.join(' → ') || '(none)'}`)
  console.log(`  unmet_outputs: ${g.unmet_outputs.join(', ') || '(none)'}`)
  console.log(`  unsatisfied_inputs: ${g.unsatisfied_inputs.map((u) => `${u.tool_id}[${u.missing.join(',')}]`).join('; ') || '(none)'}`)
  return eligible
}

const current: RawManifest = JSON.parse(readFileSync(join(__dirname, 'tool-io-manifest.json'), 'utf-8'))
const oldPath = process.argv[2]
if (oldPath) {
  const before: RawManifest = JSON.parse(readFileSync(oldPath, 'utf-8'))
  report(`BEFORE (${oldPath})`, before)
}
const eligible = report('AFTER (checked-in tool-io-manifest.json)', current)
console.log(`\n[verify] planner-visible tool inventory: ${eligible.length}`)
