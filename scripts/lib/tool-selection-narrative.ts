/**
 * scripts/lib/tool-selection-narrative.ts
 *
 * Increment 1A (2026-06-10): a PURE, DETERMINISTIC helper that explains, in
 * prose, WHY each engineering tool was auto-selected and HOW the tools
 * interact + sequence — so a reader of the dossier can judge the engine's
 * (deterministic) tool selection. NO LLM: the orchestrator's tool selection is
 * itself deterministic (a per-class ToolStep plan keyed on the brief envelope),
 * so its explanation must be deterministic too.
 *
 * The narrative is composed ENTIRELY from data ALREADY present in `state` at
 * render time — it requires NO chain change. Data sources (traced on the real
 * CO2-mineralisation run `out/verify-b3-fix/co2_mineralisation/state.json`):
 *
 *   • state.orchestratorContract._tools_run     — the EXACT execution ORDER
 *       (an ordered string[] of tool_ids; orchestrate.ts executor appends each
 *       tool as it runs). This is the only in-state record of sequence.
 *   • state.toolsUsedPage.tools[]               — built by
 *       scripts/lib/orchestrator/attribution.ts::buildToolsUsedPage. Each entry:
 *       { tool_id, tool_name, claims:[{ field, value, unit, output_field }], … }.
 *       The `claims` are the contract quantities the tool COMPUTED.
 *   • state.toolsUsedPage.flow_edges[]          — the REAL causal tool→tool
 *       edges, derived in orchestrate.ts (step 7) from each ClassToolPlan tool
 *       step's `feeds_into` declaration ({ from, to }; may contain duplicates).
 *   • scripts/lib/orchestrator/tool-io-manifest.json — per tool_id
 *       { input_keys[], output_keys[] }, harvested from the 35 class-plans.
 *       Used to name a tool's primary OWNED physics + its declared inputs when
 *       the claims list is thin. OPTIONAL: absent / unreadable → degrade.
 *   • state.orchestratorContract.quantities[key].{ source, source_detail }
 *       — provenance for each contract quantity; used to say whether a tool's
 *       input came from the brief vs an upstream tool.
 *
 * KNOWN LIMIT (reported honestly): the ClassToolPlan `coupled_pairs` +
 * `max_iterations` + `convergence_tolerance_pct` live in the class-plan SOURCE
 * (scripts/lib/orchestrator/class-plans/<class>.ts), NOT in state. So the
 * "coupled fixed-point loop" signal here is INFERRED from the flow graph: a
 * tool is reported as part of a coupled loop only when the edges prove a cycle
 * (A → … → A). The plant-wide aggregation SINK (a tool that almost every other
 * tool feeds, e.g. mass-aggregator:envelope-check) is named as the convergence
 * point. A tool plan can declare a coupled pair the edges don't show as a
 * cycle; that nuance is not recoverable from state alone.
 *
 * Exclusively string-producing + jest-safe: imports nothing from the
 * orchestrator registry or react-pdf; the manifest is read with a __dirname
 * relative path inside try/catch so jest (no file / CJS) degrades gracefully.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface ToolNarrativeEntry {
  /** Tool registry id, e.g. "pressure-vessel:design". */
  id: string
  /** Human-readable tool name (from the tools-used page or humanised id). */
  name: string
  /** The physics / quantity this tool OWNS (computes). */
  owns: string
  /** Why the engine selected it (the outputs the design/contract needs). */
  whySelected: string
  /** What it consumes (brief values / upstream tool outputs). */
  inputs: string
  /** What it feeds downstream. */
  outputs: string
  /** Step order + coupled-loop membership. */
  sequencing: string
}

export interface ToolSelectionNarrative {
  /** Opening paragraph: count + overall flow + how order is determined. */
  summary: string
  /** One block per selected tool, in execution order. */
  tools: ToolNarrativeEntry[]
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
    // Manifest sits beside the orchestrator (this file is scripts/lib/…).
    // __dirname works under tsx (ESM shim, as render-minimal-pdf.tsx relies on
    // at lines 12586/12828) and natively under jest's CommonJS transform.
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
// Small deterministic string helpers (self-contained; no external humanise).
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

/** "absorber_packed_height_m" → "absorber packed height". Strips a trailing
 *  unit-ish token so a field name reads as English, not a column id. */
const _UNIT_SUFFIX = new Set([
  'm', 'mm', 'cm', 'km', 'm2', 'm3', 'mm2', 'mm3',
  'kw', 'mw', 'w', 'kwh', 'mwh', 'wh', 'kva', 'va', 'j', 'kj', 'mj',
  'kg', 'g', 't', 'kt', 'lb', 'tonne', 'tonnes',
  'h', 'hr', 's', 'sec', 'min', 'day', 'yr', 'year', 'd',
  'k', 'pa', 'kpa', 'mpa', 'bar', 'psi', 'barg',
  'v', 'kv', 'mv', 'a', 'ka', 'ma', 'hz', 'khz', 'mhz',
  'pct', 'percent', 'ppm', 'rpm', 'gbp', 'usd', 'eur',
  'lpm', 'gpm', 'l', 'ml', 'deg', 'degc', 'mol', 'kmol', 'nm', 'um',
])
function humaniseField(field: string): string {
  const toks = String(field || '').split('_').filter(Boolean)
  while (toks.length > 1 && _UNIT_SUFFIX.has(toks[toks.length - 1].toLowerCase())) toks.pop()
  return toks.join(' ').trim()
}

/** Join a list as English: "a", "a and b", "a, b, c and d".
 *  NO TRUNCATION (2026-06-10, Tristan: "I don't want '+6 more' — give ALL the
 *  information; you won't get another chance to see it"). When `max` is omitted
 *  (the default), EVERY item is listed; the old "(+N more)" cap is gone. A caller
 *  may still pass an explicit `max` to cap a genuinely-unbounded list, in which
 *  case the remainder is still summarised as "(+N more)" — but no internal caller
 *  does, so the per-tool "What it computes" / "why selected" lines now enumerate
 *  every quantity the tool produces. */
function joinEnglish(items: string[], max?: number): string {
  const xs = items.filter(Boolean)
  if (xs.length === 0) return ''
  const shown = max != null ? xs.slice(0, max) : xs
  const more = xs.length - shown.length
  let s: string
  if (shown.length === 1) s = shown[0]
  else s = `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
  if (more > 0) s += ` (+${more} more)`
  return s
}

/** De-duplicate a string list, preserving first-seen order. Used so a full
 *  (uncapped) enumeration of humanised fields doesn't repeat a label when two
 *  contract keys humanise to the same English phrase. */
function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const it of items) {
    if (!it || seen.has(it)) continue
    seen.add(it)
    out.push(it)
  }
  return out
}

function titleClass(cls: string): string {
  const s = String(cls || '').replace(/[_-]+/g, ' ').trim()
  return s || 'engineering'
}

// ---------------------------------------------------------------------------
// State accessors (defensive — every path may be absent on a legacy run).
// ---------------------------------------------------------------------------

function readProductClass(state: any): string {
  return String(
    state?.moduleDecomposition?.product_class ??
    state?.orchestratorContract?.product_class ??
    state?.engineeringContract?.product_class ??
    state?.keyMetrics?.product_class ??
    '',
  )
}

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

/** Unique, order-preserving causal edges from the tools-used page. */
function readFlowEdges(page: any): Array<{ from: string; to: string }> {
  const raw: Array<{ from: string; to: string }> = Array.isArray(page?.flow_edges) ? page.flow_edges : []
  const seen = new Set<string>()
  const out: Array<{ from: string; to: string }> = []
  for (const e of raw) {
    const from = String(e?.from ?? '')
    const to = String(e?.to ?? '')
    if (!from || !to || from === to) continue
    const k = `${from} ${to}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ from, to })
  }
  return out
}

/** Execution order: prefer the executor's _tools_run; else worked_calculations
 *  insertion order; else the (alpha-sorted) tools-used page order. */
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

// ---------------------------------------------------------------------------
// Graph helpers — coupled-loop inference from the flow edges ALONE.
// ---------------------------------------------------------------------------

/** Tool ids that lie on at least one directed cycle (A → … → A). Tarjan-lite:
 *  a node is "in a loop" iff it belongs to a strongly-connected component of
 *  size > 1, OR it has a self-loop (already filtered out, so size>1 only). */
function toolsInCycles(edges: Array<{ from: string; to: string }>): Set<string> {
  const adj = new Map<string, string[]>()
  const nodes = new Set<string>()
  for (const { from, to } of edges) {
    nodes.add(from); nodes.add(to)
    const l = adj.get(from) ?? []
    l.push(to)
    adj.set(from, l)
  }
  // Iterative Tarjan SCC (avoid recursion depth issues on big graphs).
  let index = 0
  const idx = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const inLoop = new Set<string>()

  for (const start of nodes) {
    if (idx.has(start)) continue
    // work stack of frames: [node, neighbourPointer]
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
      // done with v's neighbours
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

/** The plant-wide aggregation SINK: the tool that the most OTHER tools feed
 *  into (the convergence point of the data-flow graph). Returns its id, the
 *  in-degree, and the total number of distinct producer tools — so the summary
 *  can say "all N tools converge on X". null when no clear sink. */
function findAggregationSink(
  edges: Array<{ from: string; to: string }>,
): { id: string; inDegree: number } | null {
  const inDeg = new Map<string, Set<string>>()
  for (const { from, to } of edges) {
    const s = inDeg.get(to) ?? new Set<string>()
    s.add(from)
    inDeg.set(to, s)
  }
  let best: { id: string; inDegree: number } | null = null
  for (const [id, producers] of inDeg) {
    const d = producers.size
    if (!best || d > best.inDegree || (d === best.inDegree && id < best.id)) {
      best = { id, inDegree: d }
    }
  }
  // Only call it a SINK if it genuinely aggregates (≥3 distinct producers).
  if (best && best.inDegree >= 3) return best
  return null
}

// ---------------------------------------------------------------------------
// Per-tool fact extraction.
// ---------------------------------------------------------------------------

interface ToolFacts {
  id: string
  name: string
  /** Contract fields this tool produced (from its claims). */
  producedFields: string[]
  /** Tools this tool feeds. */
  downstream: string[]
  /** Tools that feed this tool. */
  upstream: string[]
  /** Declared input keys from the manifest (may be empty). */
  manifestInputs: string[]
  /** Declared output keys from the manifest (may be empty). */
  manifestOutputs: string[]
}

function gatherFacts(
  state: any,
  page: any,
  edges: Array<{ from: string; to: string }>,
  manifest: Record<string, ToolIO> | null,
): Map<string, ToolFacts> {
  const facts = new Map<string, ToolFacts>()
  const toolEntries: any[] = Array.isArray(page?.tools) ? page.tools : []
  const nameById = new Map<string, string>()
  const producedById = new Map<string, string[]>()
  for (const t of toolEntries) {
    const id = String(t?.tool_id ?? '')
    if (!id) continue
    nameById.set(id, String(t?.tool_name || '').trim() || humaniseToolId(id))
    const claims: any[] = Array.isArray(t?.claims) ? t.claims : []
    const fields: string[] = []
    const seen = new Set<string>()
    for (const c of claims) {
      const f = String(c?.field ?? '')
      if (f && !seen.has(f)) { seen.add(f); fields.push(f) }
    }
    producedById.set(id, fields)
  }

  const downByTool = new Map<string, string[]>()
  const upByTool = new Map<string, string[]>()
  for (const { from, to } of edges) {
    const d = downByTool.get(from) ?? []; if (!d.includes(to)) d.push(to); downByTool.set(from, d)
    const u = upByTool.get(to) ?? []; if (!u.includes(from)) u.push(from); upByTool.set(to, u)
  }

  // Union of every tool id we have any signal for.
  const allIds = new Set<string>([
    ...nameById.keys(),
    ...downByTool.keys(),
    ...upByTool.keys(),
  ])
  for (const id of allIds) {
    const io = manifest?.[id]
    facts.set(id, {
      id,
      name: nameById.get(id) ?? humaniseToolId(id),
      producedFields: producedById.get(id) ?? [],
      downstream: downByTool.get(id) ?? [],
      upstream: upByTool.get(id) ?? [],
      manifestInputs: Array.isArray(io?.input_keys) ? io!.input_keys! : [],
      manifestOutputs: Array.isArray(io?.output_keys) ? io!.output_keys! : [],
    })
  }
  return facts
}

// ---------------------------------------------------------------------------
// Prose composition.
// ---------------------------------------------------------------------------

function nameOf(facts: Map<string, ToolFacts>, id: string): string {
  return facts.get(id)?.name ?? humaniseToolId(id)
}

/** The physics / quantity a tool OWNS — the human-readable summary of what it
 *  computes. Prefers the actual contract fields it produced; falls back to the
 *  manifest output keys; finally to the humanised tool id. */
function describeOwns(f: ToolFacts): string {
  const fields = f.producedFields.length ? f.producedFields : f.manifestOutputs
  // NO cap (2026-06-10, item 1): list EVERY quantity the tool computes so the
  // consolidated per-tool "What it computes" line is complete — no "(+N more)".
  const human = dedupePreserveOrder(fields.map(humaniseField).filter(Boolean))
  if (human.length) return joinEnglish(human)
  return humaniseToolId(f.id).toLowerCase()
}

function buildEntry(
  f: ToolFacts,
  facts: Map<string, ToolFacts>,
  state: any,
  order: string[],
  inCycle: Set<string>,
  sink: { id: string; inDegree: number } | null,
): ToolNarrativeEntry {
  const owns = describeOwns(f)

  // whySelected — the outputs the design/contract needs from this tool. NO cap
  // (item 1): every produced quantity is named, not just the first three.
  const producedHuman = dedupePreserveOrder(f.producedFields.map(humaniseField).filter(Boolean))
  let whySelected: string
  if (producedHuman.length) {
    whySelected = `Selected because the engineering contract needs ${joinEnglish(producedHuman)}; this is the in-class tool that produces ${producedHuman.length > 1 ? 'those quantities' : 'that quantity'} deterministically from first principles.`
  } else if (f.manifestOutputs.length) {
    whySelected = `Selected by the ${titleClass(readProductClass(state))} tool plan to compute ${joinEnglish(dedupePreserveOrder(f.manifestOutputs.map(humaniseField)))}.`
  } else {
    whySelected = `Selected by the ${titleClass(readProductClass(state))} tool plan as part of the deterministic tool sequence.`
  }

  // inputs — brief values + upstream tool outputs.
  const upstreamNames = f.upstream.map((u) => nameOf(facts, u))
  const briefInputs = describeBriefInputs(f, state)
  const inputParts: string[] = []
  if (upstreamNames.length) inputParts.push(`takes upstream results from ${joinEnglish(dedupePreserveOrder(upstreamNames))}`)
  if (briefInputs.length) inputParts.push(`reads ${joinEnglish(briefInputs)} from the brief`)
  let inputs: string
  if (inputParts.length) {
    inputs = capitalise(inputParts.join('; ')) + '.'
  } else if (f.manifestInputs.length) {
    inputs = `Consumes ${joinEnglish(dedupePreserveOrder(f.manifestInputs.map(humaniseField)))}.`
  } else {
    inputs = 'Runs from the brief envelope and the partial engineering contract.'
  }

  // outputs — downstream consumers. NO cap (item 1): every downstream consumer.
  const downstreamNames = f.downstream.map((d) => nameOf(facts, d))
  let outputs: string
  if (downstreamNames.length) {
    outputs = `Feeds ${joinEnglish(dedupePreserveOrder(downstreamNames))}.`
  } else {
    outputs = 'Terminal in the data-flow graph — its results land directly in the engineering contract (no downstream tool depends on them).'
  }

  // sequencing — step order + coupled-loop membership.
  const pos = order.indexOf(f.id)
  const stepStr = pos >= 0 ? `Runs at step ${pos + 1} of ${order.length}` : 'Order not recorded in state'
  const cycleStr = inCycle.has(f.id)
    ? ', inside a coupled fixed-point loop (the solver re-runs it until the coupled quantities converge)'
    : ''
  const sinkStr = sink && f.id === sink.id
    ? `, and is the plant-wide aggregation point where ${sink.inDegree} upstream tools converge`
    : ''
  const sequencing = `${stepStr}${cycleStr}${sinkStr}.`

  return {
    id: f.id,
    name: f.name,
    owns: capitalise(owns) + (owns.endsWith('.') ? '' : '.'),
    whySelected,
    inputs,
    outputs,
    sequencing,
  }
}

/** Brief-sourced inputs for a tool: scan the contract quantities this tool
 *  PRODUCED and, where a quantity's provenance says it came from the brief,
 *  surface a couple of those brief drivers. Best-effort + deterministic. */
function describeBriefInputs(f: ToolFacts, state: any): string[] {
  const q = state?.orchestratorContract?.quantities
  if (!q || typeof q !== 'object') return []
  const out: string[] = []
  const seen = new Set<string>()
  // Use the tool's manifest INPUT keys (what it consumes) and check which of
  // those are brief-sourced contract quantities.
  for (const key of f.manifestInputs) {
    const entry = q[key]
    if (!entry || typeof entry !== 'object') continue
    const src = String((entry as any).source ?? '')
    if (src === 'brief') {
      const h = humaniseField(key)
      if (h && !seen.has(h)) { seen.add(h); out.push(h) }
    }
    if (out.length >= 3) break
  }
  return out
}

function capitalise(s: string): string {
  const t = String(s || '')
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

/**
 * Build the deterministic tool-selection narrative from a chain `state` object.
 * Always returns a well-formed object (never throws); an empty `tools` list +
 * a one-line summary when no orchestrator tools ran (legacy / LLM-fallback).
 */
export function buildToolSelectionNarrative(state: any): ToolSelectionNarrative {
  const page = readToolsUsedPage(state)
  const cls = readProductClass(state)
  const clsHuman = titleClass(cls)

  if (!page) {
    return {
      summary: `No deterministic engineering-tool plan ran for this ${clsHuman} brief, so there is no tool-selection trace to show.`,
      tools: [],
    }
  }

  const edges = readFlowEdges(page)
  const order = readExecutionOrder(state, page)
  const manifest = loadManifest()
  const facts = gatherFacts(state, page, edges, manifest)
  const inCycle = toolsInCycles(edges)
  const sink = findAggregationSink(edges)

  // Order the tools by execution order; any tool with facts but no recorded
  // order position is appended (deterministically, by id) at the end.
  const ordered: string[] = []
  const placed = new Set<string>()
  for (const id of order) {
    if (facts.has(id) && !placed.has(id)) { ordered.push(id); placed.add(id) }
  }
  for (const id of Array.from(facts.keys()).sort()) {
    if (!placed.has(id)) { ordered.push(id); placed.add(id) }
  }

  const tools = ordered.map((id) => buildEntry(facts.get(id)!, facts, state, order, inCycle, sink))

  // ── summary ──────────────────────────────────────────────────────────────
  const n = tools.length
  const orderKnown = Array.isArray(state?.orchestratorContract?._tools_run) &&
    state.orchestratorContract._tools_run.length > 0
  const sinkName = sink ? nameOf(facts, sink.id) : ''
  const cycleCount = inCycle.size

  const orderSentence = orderKnown
    ? 'The order is fixed by the deterministic class tool plan (each tool is a typed step whose inputs are derived from the brief envelope and the partial engineering contract); the sequence below is the actual execution order the orchestrator recorded.'
    : 'The order below follows the tool plan’s declared step sequence; the engine did not record a separate run order for this dossier.'

  const flowSentence = sink
    ? `Each tool’s output flows along the dependency graph into the tools that consume it, and the chain converges on ${sinkName}, which aggregates the plant-wide mass + envelope before the contract is finalised.`
    : 'Each tool’s output flows along the dependency graph into the tools that consume it; the combined results assemble the engineering contract.'

  const couplingSentence = cycleCount > 0
    ? ` ${cycleCount} of these tools sit inside a coupled fixed-point loop, where the solver re-runs them until the shared (coupled) quantities stop changing.`
    : ''

  const summary =
    `${n} tool${n === 1 ? ' was' : 's were'} auto-selected for this ${clsHuman} brief. ` +
    flowSentence + ' ' + orderSentence + couplingSentence

  return { summary, tools }
}
