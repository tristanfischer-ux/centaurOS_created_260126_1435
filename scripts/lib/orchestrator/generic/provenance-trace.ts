// provenance-trace.ts — make the brief → INPUT traceability EXPLICIT and gate the un-sourced "magic".
//
// Tristan 2026-06-30: "the brief should turn into a long list of requirements and inputs; those inputs
// go to the tools … that translation isn't as explicit as it should be." Today the engineering contract
// carries ~60 `quantities` (the INPUTS that drive every tool, count and size), but only the TOOL-derived
// ones record where they came from (`provenance.tool_id`). The rest appear with `basis:"rated"` and NO
// provenance — an un-traceable number that arrived by magic (e.g. cultivation_container_count=6000,
// actuated_distribution_valve_count=200, both physics-critic-flagged). This module classifies EVERY
// quantity by its source so the chain (and the Excel) can show the full brief→requirement→input thread,
// and a gate can refuse to ship a SIGNIFICANT input that traces to nothing.
//
// UNIVERSAL + DETERMINISTIC — no per-class table, no LLM. A quantity is:
//   • tool       — it records a tool_id / tool source (the already-traceable path);
//   • brief      — its value is STATED in the brief text (the input came straight from a requirement);
//   • derived    — its value equals a simple combination of OTHER quantities (recorded derivation);
//   • unsourced  — none of the above: a number with no thread back to a tool, the brief or another input.
// Only a SIGNIFICANT unsourced value (≥ UNSOURCED_MIN, or any non-unit count) is gate-worthy — a small
// per-equipment 1/2 is noise, the 6000/200-class magic is the target.

export type SourceKind = 'tool' | 'brief' | 'derived' | 'unsourced'
export interface QtyTrace { key: string; value: number; source: SourceKind; detail: string }

// A value at/above this magnitude with no source is a real "magic number"; below it, an unsourced
// small count (1 RO skid, 2 softeners) is not worth blocking the dossier over.
export const UNSOURCED_MIN = 10

// A contract Quantity carries provenance in TWO shapes: tool-derived values record a nested
// `provenance: {tool_id,…}`; calculator/brief/physics values record the FLAT `source`
// ('brief'|'calculator'|'physics_constant'|'override'|'inherited') + a `source_detail` string (the
// actual derivation, e.g. "I = P·1000/(√3·400·0.9)·1.25 = 96 A"). BOTH are real provenance — the
// classifier must read both, or it false-flags fully-derived values as "magic".
interface QtyLike {
  value?: unknown
  basis?: string
  provenance?: unknown
  source?: string
  source_detail?: string
  lineage?: { from?: string[]; via?: string }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : NaN
}

// Does the brief text STATE this number? Conservative: only match a "significant" value (≥10 or
// fractional) as a standalone token, allowing thousands separators ("6,000" / "6000") and a 1-dp form.
// (Matching a bare "2" would hit the brief everywhere and be meaningless.)
export function briefStatesNumber(briefText: string, value: number): string | null {
  if (!Number.isFinite(value)) return null
  if (Math.abs(value) < UNSOURCED_MIN && Number.isInteger(value)) return null
  const norm = (briefText || '').replace(/,/g, '')
  const forms = new Set<string>([String(value)])
  if (Number.isInteger(value)) forms.add(String(Math.round(value)))
  else forms.add(value.toFixed(1))
  for (const f of forms) {
    const esc = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(^|[^0-9.])${esc}([^0-9]|$)`).test(norm)) return f
  }
  return null
}

// The bare basis that means "asserted, no derivation recorded" — the magic tell. Anything ELSE in the
// basis (a measured length, a re-size description, a named correlation) IS a recorded provenance.
function basisIsDescriptive(basis: string | undefined): boolean {
  const b = (basis ?? '').trim().toLowerCase()
  return b.length > 0 && b !== 'rated' && b !== 'assumed' && b !== 'estimate' && b !== 'estimated' && b !== 'default'
}

// NOTE: we deliberately do NOT brute-force-search for a coincidental b·c = value "derivation". With ~60
// values almost any number can be matched by accident (softener_count=2 "= 90÷45"), which would MANUFACTURE
// false traceability and HIDE the magic. A derivation only counts if it was RECORDED (a descriptive basis
// or a provenance source). An honest "unsourced" is better than a fake "derived".

export function traceContractProvenance(
  quantities: Record<string, QtyLike> | undefined,
  briefText: string,
): { traces: QtyTrace[]; unsourced: QtyTrace[] } {
  const entries = Object.entries(quantities ?? {})
  const traces: QtyTrace[] = []
  for (const [key, q] of entries) {
    const value = num(q?.value)
    const prov = q?.provenance as { tool_id?: string; source?: string } | null | undefined
    const flatSource = (q?.source ?? '').trim().toLowerCase()
    const flatDetail = (q?.source_detail ?? '').trim()
    let source: SourceKind = 'unsourced'
    let detail = ''
    if (prov && (prov.tool_id || prov.source)) {
      source = 'tool'
      detail = String(prov.tool_id ?? prov.source ?? '')
    } else if (flatSource === 'brief') {
      // the contract builder marked this value as taken from the brief …
      source = 'brief'
      detail = flatDetail || (Number.isFinite(value) ? `brief states ${briefStatesNumber(briefText, value) ?? value}` : 'brief')
    } else if (flatSource) {
      // ANY recorded non-brief source is a real derivation (calculator / physics_constant / override /
      // inherited / convergence-report / …). The derivation lives in source_detail; a `lineage` records
      // the explicit input keys it was computed FROM. Do NOT enumerate source kinds — any recorded source
      // is provenance (a future source kind must not silently fall through to "magic").
      source = 'derived'
      const lin = q?.lineage?.from?.length ? ` ⟵ ${q.lineage.from.join(', ')}` : ''
      detail = (flatDetail || flatSource) + lin
    } else if (Number.isFinite(value) && briefStatesNumber(briefText, value)) {
      source = 'brief'
      detail = `brief states ${briefStatesNumber(briefText, value)}`
    } else if (basisIsDescriptive(q?.basis)) {
      source = 'derived'
      detail = String(q?.basis)
    }
    traces.push({ key, value, source, detail })
  }
  // gate-worthy = a SIGNIFICANT input asserted with NO source (no tool, not in the brief, only a bare
  // "rated" basis) — the real magic (e.g. an invented capacity/size). A small unsourced count (≤
  // UNSOURCED_MIN, integer) is excluded: a "2 softeners" needs sizing logic but is not ship-blocking.
  const unsourced = traces.filter(
    (t) => t.source === 'unsourced' && (!Number.isInteger(t.value) || Math.abs(t.value) >= UNSOURCED_MIN),
  )
  return { traces, unsourced }
}

// ── TRANSITIVE ROOT-TO-BRIEF (Tristan 2026-06-30: "apart from the brief, nothing should magically appear;
//    everything should be sourced back to the briefing document"). A quantity is BRIEF-ROOTED iff it is a
//    brief number, OR a tool output, OR a derivation whose `lineage.from` inputs are ALL (recursively)
//    brief-rooted. A 'derived/calculator' value with NO structured lineage.from is PROSE-ONLY: the
//    derivation is human-readable but NOT machine-linkable to the brief → it is "rootless" (the real gap).
export interface RootResult { key: string; rooted: boolean; via: SourceKind; chain: string[] }

export function resolveRootToBrief(
  quantities: Record<string, QtyLike> | undefined,
  briefText: string,
): { results: RootResult[]; rootless: RootResult[] } {
  const q = quantities ?? {}
  const memo = new Map<string, RootResult>()
  const visiting = new Set<string>()
  const classify = (key: string): RootResult => {
    if (memo.has(key)) return memo.get(key)!
    if (visiting.has(key)) return { key, rooted: false, via: 'derived', chain: ['…cycle'] } // guard cycles
    visiting.add(key)
    const v = q[key]
    const value = num(v?.value)
    const prov = v?.provenance as { tool_id?: string } | null | undefined
    const flatSource = (v?.source ?? '').trim().toLowerCase()
    let res: RootResult
    if (flatSource === 'brief' || (Number.isFinite(value) && briefStatesNumber(briefText, value))) {
      res = { key, rooted: true, via: 'brief', chain: ['brief'] }
    } else if (prov?.tool_id) {
      res = { key, rooted: true, via: 'tool', chain: [`tool:${prov.tool_id}`] }
    } else if (basisIsDescriptive(v?.basis)) {
      // a MEASURED / correlated value (basis describes how it was obtained, e.g. "measured routed pipe
      // length") is a legitimate engine transform of the deterministic layout — rooted leaf, like a tool.
      res = { key, rooted: true, via: 'derived', chain: [`measured:${String(v?.basis).slice(0, 32)}`] }
    } else {
      const from = v?.lineage?.from?.filter((f) => f in q) ?? []
      if (from.length) {
        const sub = from.map(classify)
        res = {
          key,
          rooted: sub.every((s) => s.rooted),
          via: 'derived',
          chain: [...new Set(sub.flatMap((s) => s.chain))],
        }
      } else {
        // a recorded but PROSE-ONLY derivation (no machine lineage) cannot be proven brief-rooted.
        res = { key, rooted: false, via: flatSource ? 'derived' : 'unsourced', chain: [] }
      }
    }
    visiting.delete(key)
    memo.set(key, res)
    return res
  }
  const results = Object.keys(q).map(classify)
  return { results, rootless: results.filter((r) => !r.rooted) }
}

// ── THE GATE (universal): every contract input must root to the brief ───────────────────────────────
// Shadow by default; enforce with PROVENANCE_ROOTING_ENFORCING. A rootless input is a number that does
// not descend from the briefing document — it must not ship. The fix is always at SOURCE: add the
// `lineage.from` (the input quantity keys) where the value is computed, so the chain closes to the brief.
export interface RootingGate {
  total: number
  rooted: number
  rootless: RootResult[]
  pct: number
  block: boolean
  punchlist: string
}

export function rootingEnforceFromEnv(env: Record<string, string | undefined>): boolean {
  const v = (env.PROVENANCE_ROOTING_ENFORCING ?? '').trim().toLowerCase()
  return v.length > 0 && v !== '0' && v !== 'false' && v !== 'no' && v !== 'shadow' && v !== 'off'
}

export function evaluateRootingGate(
  quantities: Record<string, QtyLike> | undefined,
  briefText: string,
  enforcing: boolean,
): RootingGate {
  const { results, rootless } = resolveRootToBrief(quantities, briefText)
  const total = results.length
  const rooted = total - rootless.length
  const lines = rootless.map(
    (r) => `- **${r.key}** — rootless (${r.via}): no machine lineage to the brief. FIX: add lineage.from (the input quantity keys it is computed from) at its contract setter.`,
  )
  return {
    total,
    rooted,
    rootless,
    pct: total ? Math.round((rooted / total) * 100) : 100,
    block: enforcing && rootless.length > 0,
    punchlist: rootless.length
      ? `# Provenance rooting — ${rooted}/${total} inputs trace to the brief (${rootless.length} ROOTLESS)\n\n${lines.join('\n')}\n`
      : '',
  }
}

// ── selftest (proveCatch) ──────────────────────────────────────────────────────────────────────────
function _selftest(): number {
  let bad = 0
  const brief = 'The plant treats 90 m³/h of water with 120 m3 of storage and a 6,000-container farm.'
  const q: Record<string, QtyLike> = {
    pump_kw: { value: 7.5, basis: 'rated', provenance: { tool_id: 'process:pump-sizing' } }, // tool
    irrigation_demand_m3_h: { value: 90, basis: 'rated' }, // brief states 90 → brief
    water_storage_capacity_m3: { value: 120, basis: 'rated' }, // brief states 120 → brief
    container_count: { value: 6000, basis: 'rated' }, // brief states 6,000 → brief
    breaker_a: { value: 96, basis: 'rated', source: 'calculator', source_detail: 'I = P·1000/(√3·400·0.9)·1.25 = 96 A' }, // recorded calc → derived
    pipe_length_m: { value: 914, basis: 'measured routed pipe length' }, // descriptive basis → derived
    invented_capacity_m3: { value: 250, basis: 'rated' }, // NO source, NO detail, not in brief → unsourced + gate-worthy
    softener_count: { value: 2, basis: 'rated' }, // small unsourced count → NOT gate-worthy
  }
  const { traces, unsourced } = traceContractProvenance(q, brief)
  const byKey = Object.fromEntries(traces.map((t) => [t.key, t]))
  const expect = (k: string, s: SourceKind) => { if (byKey[k].source !== s) { console.log(`  FAIL: ${k} expected ${s}, got ${byKey[k].source}`); bad++ } }
  expect('pump_kw', 'tool')
  expect('irrigation_demand_m3_h', 'brief')
  expect('container_count', 'brief')           // brief-stated 6000 (NOT magic) — the engine just never recorded it
  expect('breaker_a', 'derived')               // source:calculator + a recorded formula is real provenance
  expect('pipe_length_m', 'derived')           // a recorded (measured) basis is real provenance
  expect('invented_capacity_m3', 'unsourced')  // no source, no detail, not in brief → magic
  if (!unsourced.some((u) => u.key === 'invented_capacity_m3')) { console.log('  FAIL: the magic 250 must be gate-worthy'); bad++ }
  if (unsourced.some((u) => u.key === 'softener_count')) { console.log('  FAIL: small unsourced count must NOT be gate-worthy'); bad++ }
  // ROOT-TO-BRIEF: a brief number + a tool output + a lineage'd derivation are rooted; a prose-only
  // 'calculator' with NO lineage.from is ROOTLESS; and rootlessness is TRANSITIVE (a derivation whose
  // input is rootless is itself rootless).
  const rq: Record<string, QtyLike> = {
    demand_m3_h: { value: 90, source: 'brief' },                                           // rooted (brief)
    pump_kw: { value: 7.5, provenance: { tool_id: 'process:pump-sizing' } },               // rooted (tool)
    breaker_a: { value: 96, source: 'calculator', source_detail: 'I=…', lineage: { from: ['demand_m3_h'] } }, // rooted via lineage→brief
    prose_calc: { value: 250, source: 'calculator', source_detail: 'sum of stuff' },        // ROOTLESS (prose-only)
    downstream: { value: 9, source: 'calculator', lineage: { from: ['prose_calc'] } },      // ROOTLESS (transitive)
  }
  const { rootless } = resolveRootToBrief(rq, 'plant treats 90 m³/h')
  const rk = new Set(rootless.map((r) => r.key))
  if (rk.has('demand_m3_h') || rk.has('pump_kw') || rk.has('breaker_a')) { console.log('  FAIL: a brief/tool/lineage-rooted value flagged rootless'); bad++ }
  if (!rk.has('prose_calc')) { console.log('  FAIL: a prose-only calc must be rootless'); bad++ }
  if (!rk.has('downstream')) { console.log('  FAIL: rootlessness must be TRANSITIVE'); bad++ }
  // the GATE: blocks on a rootless input WHEN enforcing, shadows otherwise.
  if (!evaluateRootingGate(rq, 'plant treats 90 m³/h', true).block) { console.log('  FAIL: gate must BLOCK on rootless + enforcing'); bad++ }
  if (evaluateRootingGate(rq, 'plant treats 90 m³/h', false).block) { console.log('  FAIL: gate must NOT block in shadow'); bad++ }
  const cleanGate = evaluateRootingGate({ a: { value: 90, source: 'brief' } }, 'treats 90 m³/h', true)
  if (cleanGate.block || cleanGate.rootless.length) { console.log('  FAIL: an all-rooted contract must pass the gate'); bad++ }
  console.log('provenance-trace selftest:', bad === 0 ? 'OK' : `${bad} FAIL`)
  return bad
}

if (process.argv[1] && /provenance-trace\.ts$/.test(process.argv[1]) && process.argv.includes('--selftest')) {
  process.exit(_selftest() ? 1 : 0)
}
