/**
 * scripts/lib/orchestrator/harvest-tool-io.ts
 *
 * TOOL-I/O MANIFEST GENERATOR — the single reproducible source for
 * `tool-io-manifest.json` (checked in next to this file; loaded at runtime by
 * auto-plan-fallback.ts :: loadToolIORegistry for the auto-planner's
 * backward-chaining).
 *
 * Two harvest passes, merged (E0 backfill, ANVIL-UNIVERSAL-LOOP-PLAN 2026-06-10):
 *
 *  PASS 1 — class-plan static harvest (the original wall-2 seed, 2026-05-31).
 *   Reads the 35 hand-written class-plans and harvests, per tool_id:
 *     - output_keys  = contract keys WRITTEN, anchored on `X: { value: out.` (the
 *                      POST-RENAME canonical contract key, e.g. PyBaMM's output
 *                      mapped onto cell_heat_generation_kw)
 *     - input_keys   = `c.quantities?.X` / `c.quantities.X` reads in input_from_contract
 *     - cost_basis   = macro word_names written into macro_assembly_prices
 *   Unioned across every class-plan that uses a tool_id. This pass covers only
 *   ~half the tools: plans wired through the `genericUpdate(toolId, scope)`
 *   helper store outputs as `<scope>__<raw_field>` dynamically, so NOTHING is
 *   statically harvestable for them — their output_keys came out EMPTY, which
 *   made them invisible to composeToolGraph (it skips empty-output tools).
 *
 *  PASS 2 — Python-wrapper ground truth (harvest-tool-io-runtime.py).
 *   Each tools/*.ts wrapper subprocess-delegates to tools/python/<tool>.py; the
 *   Python script's returned dict keys ARE the tool's real outputs and its
 *   payload.get('...') calls its real inputs. The runtime harvester executes
 *   each tool against the repo .venv (seed payloads for tools that reject `{}`)
 *   and source-parses inputs, yielding raw-field I/O for every wrapped tool.
 *
 *  MERGE policy (canonical beats raw; never guess):
 *     - output_keys: PASS-1 canonical keys when non-empty, else PASS-2 raw
 *       returned-field keys ('error'/'notes'/'_*'/'worked' filtered).
 *     - input_keys:  union of PASS-1 contract reads + PASS-2 payload fields
 *       (both are real reads; the planner's keysMatch is exact/token-boundary).
 *     - tools with NO class-plan usage but a registered wrapper (runtime-only
 *       ids) are included — they are real registered tools the planner may use.
 *     - class-plan tool_ids with NO matching wrapper (dangling ids, e.g.
 *       'control-systems:run' vs the registered 'control-systems:pid-tuning')
 *       stay EMPTY and are listed: backfilling them would be guessing, and
 *       loadToolIORegistry excludes unregistered ids anyway.
 *
 * Usage: npx tsx scripts/lib/orchestrator/harvest-tool-io.ts [--out=path.json]
 *   (default --out is the checked-in scripts/lib/orchestrator/tool-io-manifest.json)
 * Requires the repo .venv (runtime pass); ABORTS without writing if the
 * runtime pass fails, so a partial harvest can never clobber the manifest.
 */
import { readFileSync, readdirSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'

const PLANS_DIR = join(__dirname, 'class-plans')
const DEFAULT_OUT = join(__dirname, 'tool-io-manifest.json')
const OUT = (process.argv.find(a => a.startsWith('--out=')) ?? `--out=${DEFAULT_OUT}`).split('=')[1]

interface ToolIO { input_keys: Set<string>; output_keys: Set<string>; cost_basis: Set<string>; seen_in: Set<string> }
const manifest = new Map<string, ToolIO>()
function get(id: string): ToolIO {
  let m = manifest.get(id)
  if (!m) { m = { input_keys: new Set(), output_keys: new Set(), cost_basis: new Set(), seen_in: new Set() }; manifest.set(id, m) }
  return m
}

// ── PASS 1: class-plan static harvest (canonical contract keys) ─────────────
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
// ── PASS 2: Python-wrapper ground truth via harvest-tool-io-runtime.py ──────
interface RuntimeIO { input_keys: string[]; output_keys: string[]; py_file: string; io_source: string }
const RUNTIME_TMP = join(__dirname, '.tool-io-runtime.tmp.json')
const rt = spawnSync('python3', [join(__dirname, 'harvest-tool-io-runtime.py'), `--out=${RUNTIME_TMP}`], {
  encoding: 'utf-8',
  timeout: 600_000,
})
if (rt.status !== 0 || !existsSync(RUNTIME_TMP)) {
  console.error('[harvest] FATAL: runtime pass (harvest-tool-io-runtime.py) failed — manifest NOT written.')
  console.error(rt.stderr?.slice(0, 800) ?? '(no stderr)')
  process.exit(1)
}
process.stdout.write(rt.stdout ?? '')
const runtime: Record<string, RuntimeIO> = JSON.parse(readFileSync(RUNTIME_TMP, 'utf-8'))
unlinkSync(RUNTIME_TMP)

const RESERVED = new Set(['worked', 'error', 'notes'])
const cleanKeys = (keys: string[]) => keys.filter(k => !k.startsWith('_') && !RESERVED.has(k))

// ── MERGE ────────────────────────────────────────────────────────────────────
interface OutEntry { input_keys: string[]; output_keys: string[]; cost_basis: string[]; seen_in: string[]; output_source: string }
const out: Record<string, OutEntry> = {}
const allIds = [...new Set([...manifest.keys(), ...Object.keys(runtime)])].sort()
for (const id of allIds) {
  const plan = manifest.get(id)
  const py = runtime[id]
  const inputs = new Set<string>(plan ? [...plan.input_keys] : [])
  if (py) for (const k of cleanKeys(py.input_keys)) inputs.add(k)
  let outputs: string[]
  let output_source: string
  if (plan && plan.output_keys.size > 0) {
    outputs = [...plan.output_keys]
    output_source = 'class-plan'
  } else if (py && cleanKeys(py.output_keys).length > 0) {
    outputs = cleanKeys(py.output_keys)
    output_source = `python:${py.io_source}` // 'python:run' (executed live) or 'python:source-parse'
  } else {
    outputs = []
    output_source = 'none' // dangling class-plan tool_id: no wrapper, nothing harvestable
  }
  out[id] = {
    input_keys: [...inputs].sort(),
    output_keys: [...outputs].sort(),
    cost_basis: plan ? [...plan.cost_basis].sort() : [],
    seen_in: plan ? [...plan.seen_in].sort() : [],
    output_source,
  }
}
writeFileSync(OUT, JSON.stringify(out, null, 2))

// ── REPORT ───────────────────────────────────────────────────────────────────
const ids = Object.keys(out)
const withOut = ids.filter(id => out[id].output_keys.length > 0)
const withIn = ids.filter(id => out[id].input_keys.length > 0)
const fromPlan = ids.filter(id => out[id].output_source === 'class-plan')
const fromPy = ids.filter(id => out[id].output_source.startsWith('python:'))
const dangling = ids.filter(id => out[id].output_keys.length === 0)
const runtimeOnly = ids.filter(id => !manifest.has(id))
console.log(`[harvest] ${files.length} class-plans + ${Object.keys(runtime).length} wrapped python tools → ${ids.length} tool_ids`)
console.log(`[harvest] with output_keys: ${withOut.length}/${ids.length} (class-plan canonical: ${fromPlan.length}, python ground truth: ${fromPy.length}) | with input_keys: ${withIn.length}`)
console.log(`[harvest] registered-but-not-in-any-class-plan (runtime-only): ${runtimeOnly.length}${runtimeOnly.length ? ` — ${runtimeOnly.join(', ')}` : ''}`)
console.log(`[harvest] EMPTY output_keys (dangling class-plan ids, no wrapper — irreducible): ${dangling.length}`)
if (dangling.length) console.log(`           ${dangling.join(', ')}`)
console.log(`[harvest] manifest → ${OUT}`)
