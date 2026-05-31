/**
 * scripts/lib/orchestrator/harvest-tool-io.ts
 *
 * Wall-2 increment-0 SEED generator (design council 2026-05-31). Statically reads
 * the 35 hand-written class-plans and harvests, per tool_id:
 *   - output_keys  = contract keys WRITTEN, anchored on `X: { value: out.` (the
 *                    POST-RENAME contract key, e.g. PyBaMM's output mapped onto
 *                    cell_heat_generation_kw — NOT the raw `output as {...}` field)
 *   - input_keys   = `c.quantities?.X` / `c.quantities.X` reads in input_from_contract
 *   - cost_basis   = macro word_names written into macro_assembly_prices
 * Unioned across every class-plan that uses a tool_id.
 *
 * This is a ~30% SEED, NOT the manifest. The council flagged: the 119 no-arg
 * `input_from_contract: () =>` tools have no harvestable reads (input_keys must be
 * hand-authored), and applicable_to allowlists are added by hand from the tool files.
 *
 * Usage: npx tsx scripts/lib/orchestrator/harvest-tool-io.ts [--out=path.json]
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const PLANS_DIR = '/Users/tristanfischer/Developer/CentaurOS created 260126 1435/scripts/lib/orchestrator/class-plans'
const OUT = (process.argv.find(a => a.startsWith('--out=')) ?? '--out=/tmp/tool-io-seed.json').split('=')[1]

interface ToolIO { input_keys: Set<string>; output_keys: Set<string>; cost_basis: Set<string>; seen_in: Set<string> }
const manifest = new Map<string, ToolIO>()
function get(id: string): ToolIO {
  let m = manifest.get(id)
  if (!m) { m = { input_keys: new Set(), output_keys: new Set(), cost_basis: new Set(), seen_in: new Set() }; manifest.set(id, m) }
  return m
}

const files = readdirSync(PLANS_DIR).filter(f => f.endsWith('.ts') && f !== 'index.ts')
for (const f of files) {
  const src = readFileSync(join(PLANS_DIR, f), 'utf-8')
  // Slice the file into per-tool segments at each `tool_id: '...'` boundary.
  const marks: Array<{ id: string; idx: number }> = []
  const idRe = /tool_id:\s*'([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = idRe.exec(src)) !== null) marks.push({ id: m[1], idx: m.index })
  for (let i = 0; i < marks.length; i++) {
    const body = src.slice(marks[i].idx, i + 1 < marks.length ? marks[i + 1].idx : src.length)
    const io = get(marks[i].id)
    io.seen_in.add(f.replace('.ts', ''))
    for (const mm of body.matchAll(/c\.quantities\??\.(\w+)/g)) io.input_keys.add(mm[1])
    for (const mm of body.matchAll(/(\w+):\s*\{\s*value:\s*out\./g)) io.output_keys.add(mm[1])
    for (const mm of body.matchAll(/word_name:\s*'([^']+)'/g)) io.cost_basis.add(mm[1])
  }
}

const out: Record<string, { input_keys: string[]; output_keys: string[]; cost_basis: string[]; seen_in: string[] }> = {}
for (const [id, io] of [...manifest.entries()].sort())
  out[id] = { input_keys: [...io.input_keys].sort(), output_keys: [...io.output_keys].sort(), cost_basis: [...io.cost_basis].sort(), seen_in: [...io.seen_in].sort() }
writeFileSync(OUT, JSON.stringify(out, null, 2))

const ids = Object.keys(out)
const withOut = ids.filter(id => out[id].output_keys.length > 0)
const withIn = ids.filter(id => out[id].input_keys.length > 0)
const withMacro = ids.filter(id => out[id].cost_basis.length > 0)
const noIO = ids.filter(id => out[id].output_keys.length === 0 && out[id].input_keys.length === 0)
console.log(`[harvest] ${files.length} class-plans → ${ids.length} distinct tool_ids`)
console.log(`[harvest] with output_keys: ${withOut.length} | with input_keys: ${withIn.length} | with cost_basis macros: ${withMacro.length}`)
console.log(`[harvest] NO harvestable I/O (hand-author needed): ${noIO.length}`)
if (noIO.length) console.log(`           ${noIO.join(', ')}`)
console.log(`[harvest] seed → ${OUT}`)
console.log('\n=== sample: pybamm:cell-sizing ===')
const sampleId = out['pybamm:cell-sizing'] ? 'pybamm:cell-sizing' : ids.find(i => i.includes('pybamm'))
if (sampleId) console.log(JSON.stringify(out[sampleId], null, 2))
