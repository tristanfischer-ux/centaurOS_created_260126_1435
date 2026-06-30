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

interface QtyLike { value?: unknown; basis?: string; provenance?: unknown }

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
    let source: SourceKind = 'unsourced'
    let detail = ''
    if (prov && (prov.tool_id || prov.source)) {
      source = 'tool'
      detail = String(prov.tool_id ?? prov.source ?? '')
    } else if (Number.isFinite(value) && briefStatesNumber(briefText, value)) {
      source = 'brief'
      detail = `brief states ${briefStatesNumber(briefText, value)}`
    } else if (basisIsDescriptive(q?.basis)) {
      // a recorded derivation / measurement / correlation lives in the basis string.
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

// ── selftest (proveCatch) ──────────────────────────────────────────────────────────────────────────
function _selftest(): number {
  let bad = 0
  const brief = 'The plant treats 90 m³/h of water with 120 m3 of storage and a 6,000-container farm.'
  const q: Record<string, QtyLike> = {
    pump_kw: { value: 7.5, basis: 'rated', provenance: { tool_id: 'process:pump-sizing' } }, // tool
    irrigation_demand_m3_h: { value: 90, basis: 'rated' }, // brief states 90 → brief
    water_storage_capacity_m3: { value: 120, basis: 'rated' }, // brief states 120 → brief
    container_count: { value: 6000, basis: 'rated' }, // brief states 6,000 → brief
    pipe_length_m: { value: 914, basis: 'measured routed pipe length' }, // descriptive basis → derived
    invented_capacity_m3: { value: 250, basis: 'rated' }, // NOT in brief, bare rated → unsourced + gate-worthy
    softener_count: { value: 2, basis: 'rated' }, // small unsourced count → NOT gate-worthy
  }
  const { traces, unsourced } = traceContractProvenance(q, brief)
  const byKey = Object.fromEntries(traces.map((t) => [t.key, t]))
  const expect = (k: string, s: SourceKind) => { if (byKey[k].source !== s) { console.log(`  FAIL: ${k} expected ${s}, got ${byKey[k].source}`); bad++ } }
  expect('pump_kw', 'tool')
  expect('irrigation_demand_m3_h', 'brief')
  expect('container_count', 'brief')           // brief-stated 6000 (NOT magic) — the engine just never recorded it
  expect('pipe_length_m', 'derived')           // a recorded (measured) basis is real provenance
  expect('invented_capacity_m3', 'unsourced')  // bare "rated", not in brief → magic
  if (!unsourced.some((u) => u.key === 'invented_capacity_m3')) { console.log('  FAIL: the magic 250 must be gate-worthy'); bad++ }
  if (unsourced.some((u) => u.key === 'softener_count')) { console.log('  FAIL: small unsourced count must NOT be gate-worthy'); bad++ }
  console.log('provenance-trace selftest:', bad === 0 ? 'OK' : `${bad} FAIL`)
  return bad
}

if (process.argv[1] && /provenance-trace\.ts$/.test(process.argv[1]) && process.argv.includes('--selftest')) {
  process.exit(_selftest() ? 1 : 0)
}
