/**
 * scripts/lib/engineering-ledger.ts
 *
 * Increment "ledger" (2026-06-10): a PURE, DETERMINISTIC cross-reference ledger
 * that makes the engineering TRACEABLE. The owner's words: for each calculation
 * he wants to see "what the input is, what the output is, and where it goes",
 * with STABLE numbers so "it went from §1 to §6 — when I go to §6, I can see its
 * input is §1." This module assigns a stable §-number to every auto-selected
 * tool by EXECUTION ORDER and records, per tool, which §-numbers feed it and
 * which §-numbers (or the Bill of Materials) it feeds — so all three render
 * sites (Tool Selection, Engineering Calculations, the per-tool quantity cards)
 * can key their cross-references off one single source of truth.
 *
 * NO LLM. The orchestrator's tool selection + sequencing is itself
 * deterministic, so its trace is too. Everything is composed from data ALREADY
 * present in `state` at render time — NO chain change. Data sources (traced on
 * the real CO2-mineralisation run `out/rerun-co2_mineralisation/state.json`):
 *
 *   • state.orchestratorContract._tools_run     — the EXACT execution ORDER
 *       (an ordered string[] of tool_ids). This is the SAME ordering
 *       tool-selection-narrative.ts uses (readExecutionOrder), so §-numbers are
 *       consistent across every page that calls this helper. On the CO2 run this
 *       is a 20-element list → §1…§20.
 *   • state.toolsUsedPage.tools[]               — { tool_id, tool_name,
 *       claims:[{ field, value, unit, output_field }], … } (built by
 *       scripts/lib/orchestrator/attribution.ts::buildToolsUsedPage). The tool
 *       IDENTITIES + display names; each claim's `field` is (verified on the
 *       live state) the exact contract-quantity KEY the tool produced.
 *   • state.toolsUsedPage.flow_edges[]          — the REAL causal tool→tool
 *       edges ({ from, to } tool_id pairs). DEDUPED here (the live state repeats
 *       e.g. pressure-vessel:design → mass-aggregator:envelope-check twice).
 *   • scripts/lib/orchestrator/tool-io-manifest.json — per tool_id
 *       { input_keys[], output_keys[] }. Used for brief-input detection +
 *       the fuzzy quantity→tool matcher. OPTIONAL: absent/unreadable → degrade.
 *   • state.orchestratorContract.quantities[key].{ source, provenance.tool_id }
 *       — provenance for each contract quantity. `source==='brief'` marks a
 *       brief driver; `provenance.tool_id` (or a `source` of the shape
 *       `tool:<id>`) names the producing tool EXACTLY for ~80 of 116 quantities.
 *
 * Pure + jest-safe: imports nothing from react-pdf or the orchestrator registry;
 * the manifest is read with a __dirname-relative path inside try/catch so jest
 * (CommonJS) and tsx (ESM shim) both degrade gracefully.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

/** A reference to another numbered tool block. */
export interface SectionRef {
  num: number
  name: string
}
/** A brief-sourced input (no §-number — it originates outside the tool graph). */
export interface BriefRef {
  brief: string
}
/** The bill-of-materials / engineering-contract sink (no §-number). */
export type ContractSink = 'Bill of Materials'

export type InputRef = SectionRef | BriefRef
export type OutputRef = SectionRef | ContractSink

export interface LedgerEntry {
  /** Stable §-number, assigned by execution order (1-based). */
  num: number
  /** Tool registry id, e.g. "pressure-vessel:design". */
  id: string
  /** Human-readable tool name (from the tools-used page or humanised id). */
  name: string
  /** Upstream §-refs (edges where to==this) + brief-sourced inputs. */
  inputsFrom: InputRef[]
  /** Downstream §-refs (edges where from==this); 'Bill of Materials' if none. */
  outputsTo: OutputRef[]
  /** True when this tool lies on a directed cycle (a coupled fixed-point loop). */
  inCycle: boolean
}

/** The full ledger: a map keyed by tool_id, plus the ordered tool_id list so a
 *  caller can iterate in §-order without re-deriving it. */
export interface EngineeringLedger {
  byToolId: Map<string, LedgerEntry>
  /** tool_ids in §-order (index 0 == §1). */
  order: string[]
  /** §-number for a quantity contract-key, where confidently attributable.
   *  Populated by exact provenance first, fuzzy output-field/key match second. */
  sectionForQuantity: Map<string, number>
}

// ---------------------------------------------------------------------------
// Type guards (small, exported for the renderer + tests).
// ---------------------------------------------------------------------------

export function isSectionRef(r: InputRef | OutputRef): r is SectionRef {
  return typeof (r as any)?.num === 'number'
}
export function isBriefRef(r: InputRef): r is BriefRef {
  return typeof (r as any)?.brief === 'string'
}

// ---------------------------------------------------------------------------
// Tool-I/O manifest (optional enrichment) — read once, cached, never throws.
// ---------------------------------------------------------------------------

interface ToolIO {
  input_keys?: string[]
  output_keys?: string[]
}
let _manifestCache: Record<string, ToolIO> | null | undefined

function loadManifest(): Record<string, ToolIO> | null {
  if (_manifestCache !== undefined) return _manifestCache
  try {
    // Manifest sits beside the orchestrator (this file is scripts/lib/…). The
    // path mirrors tool-selection-narrative.ts::loadManifest exactly.
    const p = join(__dirname, 'orchestrator', 'tool-io-manifest.json')
    _manifestCache = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, ToolIO>
  } catch {
    _manifestCache = null
  }
  return _manifestCache
}

/** Test seam: drop the manifest cache so a test can force the no-manifest path. */
export function _resetManifestCacheForTests(): void {
  _manifestCache = undefined
}

// ---------------------------------------------------------------------------
// Small deterministic string helpers (self-contained).
// ---------------------------------------------------------------------------

/** "pressure-vessel:design" → "Pressure Vessel Design". */
function humaniseToolId(id: string): string {
  return String(id || '')
    .replace(/[:_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** Unit-ish suffix tokens stripped when normalising a field/key for fuzzy
 *  matching + for humanising a brief key. Mirrors tool-selection-narrative.ts. */
const _UNIT_SUFFIX = new Set([
  'm', 'mm', 'cm', 'km', 'm2', 'm3', 'mm2', 'mm3',
  'kw', 'mw', 'w', 'kwh', 'mwh', 'wh', 'kva', 'va', 'j', 'kj', 'mj',
  'kg', 'g', 't', 'kt', 'lb', 'tonne', 'tonnes', 'tco2', 'co2',
  'h', 'hr', 's', 'sec', 'min', 'day', 'yr', 'year', 'd',
  'k', 'pa', 'kpa', 'mpa', 'bar', 'psi', 'barg',
  'v', 'kv', 'mv', 'a', 'ka', 'ma', 'hz', 'khz', 'mhz',
  'pct', 'percent', 'ppm', 'rpm', 'gbp', 'usd', 'eur',
  'lpm', 'gpm', 'l', 'ml', 'deg', 'degc', 'mol', 'kmol', 'nm', 'um',
  'per', 'wt',
])

/** "absorber_packed_height_m" → "absorber packed height". Strips trailing
 *  unit-ish tokens so a field reads as English, not a column id. */
function humaniseField(field: string): string {
  const toks = String(field || '').split(/[_\s]+/).filter(Boolean)
  while (toks.length > 1 && _UNIT_SUFFIX.has(toks[toks.length - 1].toLowerCase())) toks.pop()
  return toks.join(' ').trim()
}

/** Significant tokens of a field/key for fuzzy overlap: lowercase, split on
 *  separators, drop unit-ish + tiny tokens. ("capture_capacity_tco2_per_day"
 *  → {capture, capacity}; "target_capture_tpd" → {target, capture}.) */
function significantTokens(field: string): Set<string> {
  const out = new Set<string>()
  for (const raw of String(field || '').toLowerCase().split(/[_\s]+/)) {
    const tk = raw.trim()
    if (!tk || tk.length < 3) continue
    if (_UNIT_SUFFIX.has(tk)) continue
    out.add(tk)
  }
  return out
}

// ---------------------------------------------------------------------------
// State accessors (defensive — every path may be absent on a legacy run).
// ---------------------------------------------------------------------------

function readToolsUsedPage(state: any): any | null {
  const candidates = [
    state?.toolsUsedPage,
    state?.orchestrator?.tools_used_page,
    state?.orchestratorResult?.tools_used_page,
  ]
  for (const c of candidates) {
    if (c && typeof c === 'object' && Array.isArray(c.tools)) return c
  }
  return null
}

/** Unique, order-preserving causal edges. Mirrors tool-selection-narrative.ts
 *  exactly so both pages see the SAME graph. Self-edges + blanks dropped. */
function readFlowEdges(page: any): Array<{ from: string; to: string }> {
  const raw: Array<{ from: string; to: string }> = Array.isArray(page?.flow_edges) ? page.flow_edges : []
  const seen = new Set<string>()
  const out: Array<{ from: string; to: string }> = []
  for (const e of raw) {
    const from = String(e?.from ?? '')
    const to = String(e?.to ?? '')
    if (!from || !to || from === to) continue
    const k = `${from}${to}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ from, to })
  }
  return out
}

/** Execution order: prefer the executor's _tools_run; else worked_calculations
 *  insertion order; else the tools-used page order. IDENTICAL precedence to
 *  tool-selection-narrative.ts::readExecutionOrder, so §-numbers line up. */
function readExecutionOrder(state: any, page: any): string[] {
  const tr = state?.orchestratorContract?._tools_run
  if (Array.isArray(tr) && tr.length) {
    return tr.map((x: any) => String(x)).filter(Boolean)
  }
  const wc = state?.orchestratorContract?.worked_calculations
  if (wc && typeof wc === 'object' && !Array.isArray(wc)) {
    const keys = Object.keys(wc)
    if (keys.length) return keys
  }
  const tools: any[] = Array.isArray(page?.tools) ? page.tools : []
  return tools.map((t) => String(t?.tool_id ?? '')).filter(Boolean)
}

function readQuantities(state: any): Record<string, any> {
  const q =
    state?.orchestratorContract?.quantities
    ?? state?.engineeringContract?.quantities
    ?? state?.orchestrator?.contract?.quantities
  return q && typeof q === 'object' ? q : {}
}

/** The producing tool_id for a contract quantity, read from its provenance.
 *  Two encodings seen on the live state: `provenance.tool_id` (preferred) and a
 *  `source` string of the shape `tool:<id>`. Returns '' when not tool-sourced. */
function quantityProducerToolId(entry: any): string {
  const ptid = entry?.provenance?.tool_id
  if (typeof ptid === 'string' && ptid) return ptid
  const src = String(entry?.source ?? '')
  if (src.startsWith('tool:')) return src.slice('tool:'.length)
  return ''
}

// ---------------------------------------------------------------------------
// Graph helpers — coupled-loop detection from the flow edges ALONE.
// ---------------------------------------------------------------------------

/** Tool ids on at least one directed cycle (A → … → A). Iterative Tarjan SCC:
 *  a node is "in a loop" iff its SCC has size > 1 (self-loops already filtered).
 *  Mirrors tool-selection-narrative.ts::toolsInCycles so the two pages agree. */
function toolsInCycles(edges: Array<{ from: string; to: string }>): Set<string> {
  const adj = new Map<string, string[]>()
  const nodes = new Set<string>()
  for (const { from, to } of edges) {
    nodes.add(from); nodes.add(to)
    const l = adj.get(from) ?? []
    l.push(to)
    adj.set(from, l)
  }
  let index = 0
  const idx = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const inLoop = new Set<string>()

  for (const start of nodes) {
    if (idx.has(start)) continue
    const work: Array<[string, number]> = [[start, 0]]
    while (work.length) {
      const frame = work[work.length - 1]
      const v = frame[0]
      if (frame[1] === 0) {
        idx.set(v, index)
        low.set(v, index)
        index += 1
        stack.push(v)
        onStack.add(v)
      }
      const neighbours = adj.get(v) ?? []
      let recursed = false
      while (frame[1] < neighbours.length) {
        const w = neighbours[frame[1]]
        frame[1] += 1
        if (!idx.has(w)) {
          work.push([w, 0])
          recursed = true
          break
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v)!, idx.get(w)!))
        }
      }
      if (recursed) continue
      if (low.get(v) === idx.get(v)) {
        const comp: string[] = []
        while (true) {
          const w = stack.pop()!
          onStack.delete(w)
          comp.push(w)
          if (w === v) break
        }
        if (comp.length > 1) for (const c of comp) inLoop.add(c)
      }
      work.pop()
      if (work.length) {
        const parent = work[work.length - 1][0]
        low.set(parent, Math.min(low.get(parent)!, low.get(v)!))
      }
    }
  }
  return inLoop
}

// ---------------------------------------------------------------------------
// Brief-input detection (best-effort, deterministic).
// ---------------------------------------------------------------------------

/** Generic engineering tokens that collide across UNRELATED quantities — a
 *  lone match on one of these is NOT evidence of a real brief→tool link (e.g. a
 *  pump's `pump_efficiency` input vs the brief's `capture_efficiency_at_design`
 *  both carry `efficiency`; a pump does not read capture efficiency). Excluded
 *  from the fuzzy brief bridge so it never invents a spurious brief input —
 *  "wrong provenance is worse than none". The EXACT path (a manifest input that
 *  IS literally a brief quantity) is never gated by this. */
const _GENERIC_LINK_TOKENS = new Set([
  'efficiency', 'power', 'temp', 'temperature', 'mass', 'flow', 'rate',
  'density', 'pressure', 'length', 'area', 'volume', 'current', 'voltage',
  'energy', 'heat', 'speed', 'velocity', 'force', 'load', 'duty', 'time',
  'cost', 'price', 'value', 'target', 'design', 'total', 'max', 'min', 'avg',
  'input', 'output', 'name', 'type',
])

/** The brief drivers a tool consumes, as short English labels. Two signals,
 *  unioned + de-duped (cap 3 for legibility):
 *    (1) EXACT: a manifest input_key of the tool that is itself a brief-sourced
 *        contract quantity (source==='brief'). Always accepted.
 *    (2) FUZZY (strict): a brief contract quantity that shares ≥2 NON-GENERIC
 *        significant tokens with a SINGLE manifest input_key of the tool —
 *        bridges the physics-internal input names (capture_capacity_g_co2_g_sorbent)
 *        to the brief key (capture_capacity_tco2_per_day, shared {capture,
 *        capacity}) while rejecting BOTH a lone generic-token collision
 *        (pump_efficiency vs capture_efficiency_at_design → only {efficiency},
 *        generic) AND a lone specific-token collision (any "capture" input vs
 *        capture_efficiency_at_design → only {capture}). Two specific tokens
 *        must co-occur, so a spurious one-token brush never invents an input. */
function briefInputsForTool(
  manifestInputs: string[],
  briefKeys: string[],
  quantities: Record<string, any>,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (label: string) => {
    const h = humaniseField(label)
    if (h && !seen.has(h)) { seen.add(h); out.push(h) }
  }
  // (1) exact: manifest input is itself a brief quantity.
  for (const key of manifestInputs) {
    const entry = quantities[key]
    if (entry && typeof entry === 'object' && String(entry.source ?? '') === 'brief') push(key)
  }
  // (2) fuzzy (strict): brief key shares ≥2 non-generic tokens with ONE input
  //     key (or full coverage of a small non-generic set).
  if (manifestInputs.length) {
    const inputTokenSets = manifestInputs.map(significantTokens)
    for (const bk of briefKeys) {
      const bkAll = significantTokens(bk)
      const bkTokens = new Set([...bkAll].filter((t) => !_GENERIC_LINK_TOKENS.has(t)))
      if (bkTokens.size === 0) continue
      const linked = inputTokenSets.some((ins) => {
        let shared = 0
        for (const tk of bkTokens) if (ins.has(tk)) shared++
        // ≥2 shared specific tokens with one input key — a single brushing token
        // (generic OR specific) is never enough to claim a brief input.
        return shared >= 2
      })
      if (linked) push(bk)
    }
  }
  return out.slice(0, 3)
}

// ---------------------------------------------------------------------------
// Fuzzy quantity → producing-tool §-number (step 5).
// ---------------------------------------------------------------------------

/**
 * Map each contract quantity-key to the §-number of the tool that produced it,
 * where CONFIDENT. Two tiers:
 *   • EXACT — the quantity's provenance names a tool_id that has a §. (On the
 *     CO2 run this alone attributes ~80 of 116 quantities.)
 *   • FUZZY — for a quantity with no usable provenance, match against the tools'
 *     output_field / claim.field sets by token overlap. Confident iff the
 *     best tool shares ≥ `threshold` of the quantity's significant tokens AND
 *     strictly beats the runner-up. Where not confident, the quantity is left
 *     UNMAPPED (a wrong provenance is worse than none).
 */
function buildSectionForQuantity(
  quantities: Record<string, any>,
  numByTool: Map<string, number>,
  page: any,
  manifest: Record<string, ToolIO> | null,
  threshold: number,
): { map: Map<string, number>; fuzzyCount: number; fuzzyEligible: number } {
  const map = new Map<string, number>()

  // Per-tool token signatures of everything that tool can produce: its claim
  // fields + claim output_fields + manifest output_keys.
  const toolOutputTokens = new Map<string, Set<string>>()
  const tools: any[] = Array.isArray(page?.tools) ? page.tools : []
  for (const t of tools) {
    const tid = String(t?.tool_id ?? '')
    if (!tid || !numByTool.has(tid)) continue
    const toks = new Set<string>()
    for (const c of (Array.isArray(t?.claims) ? t.claims : [])) {
      for (const tk of significantTokens(String(c?.field ?? ''))) toks.add(tk)
      for (const tk of significantTokens(String(c?.output_field ?? ''))) toks.add(tk)
    }
    for (const ok of (manifest?.[tid]?.output_keys ?? [])) {
      for (const tk of significantTokens(ok)) toks.add(tk)
    }
    toolOutputTokens.set(tid, toks)
  }

  let fuzzyCount = 0
  let fuzzyEligible = 0
  for (const [qk, entry] of Object.entries(quantities)) {
    // EXACT provenance wins outright.
    const producer = quantityProducerToolId(entry)
    if (producer && numByTool.has(producer)) {
      map.set(qk, numByTool.get(producer)!)
      continue
    }
    // FUZZY only for quantities with no usable provenance.
    fuzzyEligible++
    const qTokens = significantTokens(qk)
    if (qTokens.size === 0) continue
    let best: { tid: string; overlap: number } | null = null
    let second = 0
    for (const [tid, toks] of toolOutputTokens) {
      let overlap = 0
      for (const tk of qTokens) if (toks.has(tk)) overlap++
      if (overlap === 0) continue
      if (!best || overlap > best.overlap) {
        second = best ? best.overlap : 0
        best = { tid, overlap }
      } else if (overlap > second) {
        second = overlap
      }
    }
    if (!best) continue
    // Confident iff it covers ≥ threshold of the quantity's tokens AND strictly
    // beats the runner-up (no ambiguous ties → no guess).
    const coverage = best.overlap / qTokens.size
    if (coverage >= threshold && best.overlap > second) {
      map.set(qk, numByTool.get(best.tid)!)
      fuzzyCount++
    }
  }
  return { map, fuzzyCount, fuzzyEligible }
}

/** The fuzzy-match token-coverage threshold (fraction of a quantity's
 *  significant tokens that the producing tool must share). Exported so the
 *  renderer/report can state it. Conservative by design. */
export const LEDGER_FUZZY_THRESHOLD = 0.5

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

/**
 * Build the deterministic engineering ledger from a chain `state` object.
 * Always returns a well-formed object (never throws); empty maps + empty order
 * when no orchestrator tools ran.
 */
export function buildEngineeringLedger(state: any): EngineeringLedger {
  const empty: EngineeringLedger = {
    byToolId: new Map(),
    order: [],
    sectionForQuantity: new Map(),
  }
  try {
    const page = readToolsUsedPage(state)
    if (!page) return empty

    const edges = readFlowEdges(page)
    const rawOrder = readExecutionOrder(state, page)
    const manifest = loadManifest()
    const quantities = readQuantities(state)

    // Tool universe + display names from the tools-used page.
    const nameById = new Map<string, string>()
    for (const t of (Array.isArray(page.tools) ? page.tools : [])) {
      const id = String(t?.tool_id ?? '')
      if (!id) continue
      nameById.set(id, String(t?.tool_name || '').trim() || humaniseToolId(id))
    }

    // §-ORDER: execution order first (deduped), then any tool that has a name or
    // an edge but no recorded order position, appended deterministically by id.
    const order: string[] = []
    const placed = new Set<string>()
    for (const id of rawOrder) {
      if (!placed.has(id) && (nameById.has(id) || edges.some((e) => e.from === id || e.to === id))) {
        order.push(id); placed.add(id)
      }
    }
    const leftover = new Set<string>()
    for (const id of nameById.keys()) leftover.add(id)
    for (const e of edges) { leftover.add(e.from); leftover.add(e.to) }
    for (const id of Array.from(leftover).sort()) {
      if (!placed.has(id)) { order.push(id); placed.add(id) }
    }

    // tool_id → §-number (1-based).
    const numByTool = new Map<string, number>()
    order.forEach((id, i) => numByTool.set(id, i + 1))

    const nameOf = (id: string): string => nameById.get(id) ?? humaniseToolId(id)
    const refOf = (id: string): SectionRef => ({ num: numByTool.get(id)!, name: nameOf(id) })

    // Upstream / downstream tool sets per tool (deduped, §-order preserved).
    const upByTool = new Map<string, string[]>()
    const downByTool = new Map<string, string[]>()
    for (const { from, to } of edges) {
      if (!numByTool.has(from) || !numByTool.has(to)) continue
      const d = downByTool.get(from) ?? []; if (!d.includes(to)) d.push(to); downByTool.set(from, d)
      const u = upByTool.get(to) ?? []; if (!u.includes(from)) u.push(from); upByTool.set(to, u)
    }

    const inCycle = toolsInCycles(edges)
    const briefKeys = Object.keys(quantities).filter(
      (k) => String(quantities[k]?.source ?? '') === 'brief',
    )

    // Build each entry.
    const byToolId = new Map<string, LedgerEntry>()
    for (const id of order) {
      const num = numByTool.get(id)!
      const upstream = (upByTool.get(id) ?? []).slice().sort((a, b) => numByTool.get(a)! - numByTool.get(b)!)
      const downstream = (downByTool.get(id) ?? []).slice().sort((a, b) => numByTool.get(a)! - numByTool.get(b)!)

      const inputsFrom: InputRef[] = upstream.map(refOf)
      const briefInputs = briefInputsForTool(manifest?.[id]?.input_keys ?? [], briefKeys, quantities)
      for (const b of briefInputs) inputsFrom.push({ brief: b })

      const outputsTo: OutputRef[] =
        downstream.length > 0 ? downstream.map(refOf) : ['Bill of Materials']

      byToolId.set(id, {
        num,
        id,
        name: nameOf(id),
        inputsFrom,
        outputsTo,
        inCycle: inCycle.has(id),
      })
    }

    const { map: sectionForQuantity } = buildSectionForQuantity(
      quantities, numByTool, page, manifest, LEDGER_FUZZY_THRESHOLD,
    )

    return { byToolId, order, sectionForQuantity }
  } catch {
    return empty
  }
}

// ---------------------------------------------------------------------------
// Render-helper formatters — small, pure, reused by every render site so the
// §-ref wording is IDENTICAL everywhere (single source of truth).
// ---------------------------------------------------------------------------

/** "§1 DAC Regeneration Energy". */
export function formatSectionRef(r: SectionRef): string {
  return `§${r.num} ${r.name}`
}

/** Inputs clause: "§1 DAC Regeneration Energy, and brief values capture
 *  capacity, mea concentration"; or "the brief envelope" when there is no
 *  recorded upstream or brief input. */
export function formatInputs(entry: LedgerEntry): string {
  const secRefs = entry.inputsFrom.filter(isSectionRef) as SectionRef[]
  const briefRefs = entry.inputsFrom.filter(isBriefRef) as BriefRef[]
  const parts: string[] = []
  if (secRefs.length) parts.push(secRefs.map(formatSectionRef).join(', '))
  if (briefRefs.length) {
    const briefList = briefRefs.map((b) => b.brief).join(', ')
    parts.push(`brief ${briefRefs.length === 1 ? 'value' : 'values'} ${briefList}`)
  }
  if (parts.length === 0) return 'the brief envelope'
  // "A; and B" reads cleanly whether one or both parts are present.
  return parts.length === 1 ? parts[0] : `${parts[0]}; and ${parts[1]}`
}

/** Outputs clause: "§6 Process Pump Sizing, §20 Mass + Envelope Aggregator";
 *  or "the engineering contract / Bill of Materials" for a terminal tool. */
export function formatOutputs(entry: LedgerEntry): string {
  if (entry.outputsTo.length === 1 && entry.outputsTo[0] === 'Bill of Materials') {
    return 'the engineering contract / Bill of Materials'
  }
  return (entry.outputsTo as SectionRef[]).map(formatSectionRef).join(', ')
}

/** The one-line provenance strip for the Engineering Calculations heading:
 *  "Inputs <- §x, §y (brief: …) · Outputs -> §z / Bill of Materials". Compact.
 *  ASCII arrows ("<-" / "->") are used deliberately — the renderer's base
 *  Helvetica font has no U+2190/U+2192 glyph, so a literal ←/→ renders as a
 *  missing-glyph box (verified on the CO2 page render); "<-"/"->" read clearly
 *  and are in the WinAnsi set. The "·" separator IS in the font (kept). */
export function formatProvenanceStrip(entry: LedgerEntry): string {
  const secRefs = entry.inputsFrom.filter(isSectionRef) as SectionRef[]
  const briefRefs = entry.inputsFrom.filter(isBriefRef) as BriefRef[]
  let inStr: string
  if (secRefs.length === 0 && briefRefs.length === 0) {
    inStr = 'the brief'
  } else {
    const bits: string[] = []
    if (secRefs.length) bits.push(secRefs.map((r) => `§${r.num}`).join(', '))
    if (briefRefs.length) bits.push(`brief: ${briefRefs.map((b) => b.brief).join(', ')}`)
    inStr = bits.join(' · ')
  }
  let outStr: string
  if (entry.outputsTo.length === 1 && entry.outputsTo[0] === 'Bill of Materials') {
    outStr = 'Bill of Materials'
  } else {
    outStr = (entry.outputsTo as SectionRef[]).map((r) => `§${r.num}`).join(', ')
  }
  return `Inputs <- ${inStr} · Outputs -> ${outStr}`
}
