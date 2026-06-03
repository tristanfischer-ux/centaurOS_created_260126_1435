/**
 * scripts/lib/orchestrator/auto-planner.ts
 *
 * SCHEMA-DRIVEN AUTO-PLANNER — self-assemble a tool dependency graph for ANY
 * sector/class from declared tool I/O CAPABILITY + the brief's required output
 * quantities. The universality core.
 *
 * Vision (Tristan 2026-05-29): take a sector/class never seen before and
 * compose an amazing, physics-grounded design from the tools/engines we have —
 * SELF-ASSEMBLING tools whose outputs flow downstream to the Engineering
 * Contract → Library → Reviewers → suppliers → Bill of Materials.
 *
 * This replaces hand-authoring a per-class ClassToolPlan (the "old-Tesla
 * per-class manifest"). A tool is selected because the DESIGN NEEDS THE PHYSICS
 * IT PRODUCES — matched by declared I/O quantity keys, NOT by an enumerated
 * class list. So an unseen class composes with zero new code: declare a tool's
 * I/O once, and it auto-wires into any design that needs it.
 *
 * THIS MODULE is the pure graph-assembly layer:
 *   composeToolGraph(requiredOutputs, registry, briefKeys, envelopeClass)
 *     → { order, feeds_into, coupled_pairs, unmet_outputs, unsatisfied_inputs }
 * It depends on NOTHING in the live chain (pure function of its args), so it is
 * unit-testable in isolation and safe to evolve independently. Turning the
 * derived graph into runnable ToolSteps (generic input_from_contract /
 * contract_update from each tool's declared I/O mapping) + wiring it into
 * selectPlan() as the fallback for unseen classes are the downstream
 * integration steps that consume this graph.
 */

export interface ToolIOSchema {
  tool_id: string
  /** Quantity keys this tool READS (from the brief or an upstream tool). */
  input_keys: string[]
  /** Quantity keys this tool PRODUCES. */
  output_keys: string[]
  /** Engineering/physics domain — for diagnostics + deterministic tie-breaks. */
  domain?: string
  /** Optional HARD physical-applicability gate beyond I/O matching (e.g. a
   *  pressure-vessel tool only for submerged/pressurised envelopes). When
   *  omitted, applicability is decided purely by I/O capability — which is the
   *  point: a tool applies to an unseen class iff the design needs its outputs
   *  and something can feed its inputs. */
  applicable?: (envelopeClass: string) => boolean
}

export interface ComposedToolGraph {
  /** Selected tools in topological run order (acyclic condensation order;
   *  members of a coupled cycle are kept adjacent). */
  order: string[]
  /** Derived data-flow edges: A produces a quantity key B consumes. */
  feeds_into: Array<{ from: string; to: string }>
  /** Mutually-dependent tool pairs (cycles in the data-flow graph). These run
   *  in the executor's fixed-point loop. Deterministic order. */
  coupled_pairs: Array<[string, string]>
  /** Required outputs no available tool can produce — honest coverage gaps. */
  unmet_outputs: string[]
  /** Selected tools whose inputs aren't all satisfiable from brief/upstream. */
  unsatisfied_inputs: Array<{ tool_id: string; missing: string[] }>
}

/** Key match for auto-planner edge derivation. Exact (case-insensitive), OR the shorter key is a
 *  full _-token-boundary suffix/prefix of the longer with ≥3 tokens — so `compressor_power_kw`
 *  matches `chiller_compressor_power_kw` (qualifier prefix), but a generic 2-token unit like
 *  `power_kw`/`mass_kg`, or two unrelated keys sharing a mid-string substring, do NOT.
 *  TIGHTENED 2026-06-02 from ">=8-char substring containment", which over-coupled the
 *  backward-chain ACROSS DOMAINS (a 5-output brief pulled in 22 tools across 6 sectors because
 *  generic keys substring-matched unrelated tools). Under-connection (an input reported
 *  unsatisfied → brief-supplied/unmet) is the safe failure mode vs over-selecting irrelevant
 *  physics. Auto-planner-internal only — NOT the production tools-flow diagram. */
function keysMatch(a: string, b: string): boolean {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  if (x === y) return true
  const [shortK, longK] = x.length <= y.length ? [x, y] : [y, x]
  if (shortK.split('_').length < 3) return false  // generic 2-token / single-token keys: exact only
  return longK.endsWith('_' + shortK) || longK.startsWith(shortK + '_')
}

function produces(schema: ToolIOSchema, key: string): boolean {
  return schema.output_keys.some((o) => keysMatch(o, key))
}

/**
 * Self-assemble the tool dependency graph.
 *
 * @param requiredOutputs Quantity keys the finished design must contain (the
 *   brief's targets + the universal buildable-design set: mass, cost, power,
 *   thermal, structure, compliance, …). Drives backward-chaining.
 * @param registry Declared tool I/O capability — the whole tool inventory.
 * @param briefKeys Quantity keys the brief already supplies (chain terminators).
 * @param envelopeClass Class slug for the optional hard-applicability gate.
 */
export function composeToolGraph(
  requiredOutputs: string[],
  registry: ToolIOSchema[],
  briefKeys: string[],
  envelopeClass = 'unknown',
): ComposedToolGraph {
  const byId = new Map(registry.map((s) => [s.tool_id, s]))
  // Deterministic producer search order: registry order (caller sorts once).
  const briefProvides = (key: string) => briefKeys.some((b) => keysMatch(b, key))
  const producesRequired = (schema: ToolIOSchema) =>
    schema.output_keys.some((o) => requiredOutputs.some((r) => keysMatch(o, r)))

  // ── 1. Backward-chain tool selection ──────────────────────────────────
  // To satisfy a needed quantity: if the brief supplies it or a selected tool
  // already produces it, done; else select the first applicable producer and
  // enqueue ITS inputs as new needs. Recurse to a fixed point.
  //
  // `banned` lets a later prune pass RE-CHAIN with a dead-weight producer
  // forbidden, so a legitimate ALTERNATE producer of the same key is found.
  // (A cross-domain outlier that sorts first can DISPLACE the right producer:
  //  it suffix-matches a needed intermediate and `registry.find` picks it, so
  //  the legit producer is never selected. Banning it and re-chaining repairs
  //  that — see the prune loop below.) Pure + deterministic: no clocks/RNG.
  const backwardChain = (banned: ReadonlySet<string>): { selected: Set<string>; unmet: string[] } => {
    const selected = new Set<string>()
    const unmet: string[] = []
    const seenNeed = new Set<string>()
    const queue = [...requiredOutputs]
    while (queue.length > 0) {
      const need = queue.shift() as string
      const nk = need.toLowerCase()
      if (seenNeed.has(nk)) continue
      seenNeed.add(nk)
      if (briefProvides(need)) continue
      let coveredBySelected = false
      for (const id of selected) {
        if (produces(byId.get(id) as ToolIOSchema, need)) { coveredBySelected = true; break }
      }
      if (coveredBySelected) continue
      const producer = registry.find(
        (s) => !banned.has(s.tool_id) && produces(s, need) && (!s.applicable || s.applicable(envelopeClass)),
      )
      if (!producer) { unmet.push(need); continue }
      selected.add(producer.tool_id)
      for (const inp of producer.input_keys) queue.push(inp)
    }
    return { selected, unmet }
  }

  // ── 1b. UNSATISFIABLE-INPUT (cross-domain dead-weight) PRUNE ───────────
  // After selection, DROP any selected tool that BOTH (i) produces NO required
  // output AND (ii) has its inputs ENTIRELY unsatisfiable (not brief-supplied
  // and not produced by another selected tool). Such a tool was pulled in only
  // because its output loosely key-matched an intermediate — it can never run
  // (no input source) and feeds nothing the design actually needs. Pruning it
  // and RE-CHAINING (with it banned) lets a legit alternate producer fill the
  // intermediate it was displacing, so unmet/unsatisfied diagnostics stay true.
  // Bounded by registry size (each pass bans ≥1 tool); deterministic order.
  const banned = new Set<string>()
  let chain = backwardChain(banned)
  let selected = chain.selected
  for (let pass = 0; pass < registry.length; pass++) {
    const cur = [...selected]
    const deadWeight = cur
      .filter((id) => {
        const S = byId.get(id) as ToolIOSchema
        if (producesRequired(S)) return false               // (i) keep anything producing a REQUIRED output
        if (S.input_keys.length === 0) return false          // a source-less producer with no inputs is not "unsatisfiable" — keep
        const everyInputUnsatisfiable = S.input_keys.every((ik) => {
          if (briefProvides(ik)) return false
          return !cur.some((o) => o !== id && produces(byId.get(o) as ToolIOSchema, ik))
        })
        return everyInputUnsatisfiable                       // (ii) ALL inputs unsatisfiable → dead weight
      })
      .sort()
    if (deadWeight.length === 0) break
    for (const id of deadWeight) banned.add(id)
    chain = backwardChain(banned)
    selected = chain.selected
  }
  const unmet = chain.unmet // honest gaps for the FINAL (post-prune, re-chained) selection

  const sel = [...selected].sort() // deterministic node order

  // ── 2. Auto-wire data-flow edges: A → B iff B reads a key A produces ──
  const edges: Array<{ from: string; to: string }> = []
  const adj = new Map<string, Set<string>>(sel.map((id) => [id, new Set<string>()]))
  for (const a of sel) {
    const A = byId.get(a) as ToolIOSchema
    for (const b of sel) {
      if (a === b) continue
      const B = byId.get(b) as ToolIOSchema
      const linked = B.input_keys.some((ik) => A.output_keys.some((ok) => keysMatch(ok, ik)))
      if (linked) {
        edges.push({ from: a, to: b })
        ;(adj.get(a) as Set<string>).add(b)
      }
    }
  }

  // ── 3. Tarjan SCC → coupled_pairs; condensation topo-sort → run order ──
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  let idx = 0
  const sccs: string[][] = []
  const strongconnect = (v: string): void => {
    index.set(v, idx)
    low.set(v, idx)
    idx++
    stack.push(v)
    onStack.add(v)
    for (const w of [...(adj.get(v) as Set<string>)].sort()) {
      if (!index.has(w)) {
        strongconnect(w)
        low.set(v, Math.min(low.get(v) as number, low.get(w) as number))
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v) as number, index.get(w) as number))
      }
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = []
      let w: string
      do {
        w = stack.pop() as string
        onStack.delete(w)
        comp.push(w)
      } while (w !== v)
      sccs.push(comp.sort())
    }
  }
  for (const v of sel) if (!index.has(v)) strongconnect(v)

  // coupled_pairs: every intra-SCC tool pair that has a direct edge (a real
  // mutual/cyclic dependency the fixed-point loop must iterate). Deterministic.
  const sccOf = new Map<string, number>()
  sccs.forEach((comp, i) => comp.forEach((id) => sccOf.set(id, i)))
  const coupled_pairs: Array<[string, string]> = []
  const seenPair = new Set<string>()
  for (const { from, to } of edges) {
    if (sccOf.get(from) === sccOf.get(to)) {
      const key = [from, to].sort().join('::')
      if (!seenPair.has(key)) {
        seenPair.add(key)
        const [a, b] = [from, to].sort() as [string, string]
        coupled_pairs.push([a, b])
      }
    }
  }
  coupled_pairs.sort((p, q) => (p[0].localeCompare(q[0]) || p[1].localeCompare(q[1])))

  // Condensation DAG + Kahn topological sort over SCCs (deterministic).
  const compCount = sccs.length
  const compAdj = new Map<number, Set<number>>(Array.from({ length: compCount }, (_, i) => [i, new Set<number>()]))
  const indeg = new Map<number, number>(Array.from({ length: compCount }, (_, i) => [i, 0]))
  for (const { from, to } of edges) {
    const cf = sccOf.get(from) as number
    const ct = sccOf.get(to) as number
    if (cf !== ct && !(compAdj.get(cf) as Set<number>).has(ct)) {
      ;(compAdj.get(cf) as Set<number>).add(ct)
      indeg.set(ct, (indeg.get(ct) as number) + 1)
    }
  }
  // Tarjan emits SCCs in reverse-topological order; seed Kahn with indeg-0
  // comps, lowest comp-min-tool-id first for determinism.
  const compMinId = (i: number) => [...sccs[i]].sort()[0] ?? ''
  const ready = Array.from({ length: compCount }, (_, i) => i)
    .filter((i) => (indeg.get(i) as number) === 0)
    .sort((a, b) => compMinId(a).localeCompare(compMinId(b)))
  const order: string[] = []
  while (ready.length > 0) {
    const c = ready.shift() as number
    for (const id of [...sccs[c]].sort()) order.push(id)
    const nexts = [...(compAdj.get(c) as Set<number>)].sort((a, b) => compMinId(a).localeCompare(compMinId(b)))
    for (const n of nexts) {
      indeg.set(n, (indeg.get(n) as number) - 1)
      if ((indeg.get(n) as number) === 0) {
        ready.push(n)
        ready.sort((a, b) => compMinId(a).localeCompare(compMinId(b)))
      }
    }
  }

  // ── 4. Diagnostics: which selected tools have unsatisfiable inputs ────
  const unsatisfied_inputs: Array<{ tool_id: string; missing: string[] }> = []
  for (const id of sel) {
    const S = byId.get(id) as ToolIOSchema
    const missing = S.input_keys.filter((ik) => {
      if (briefProvides(ik)) return false
      return !sel.some((other) => other !== id && produces(byId.get(other) as ToolIOSchema, ik))
    })
    if (missing.length > 0) unsatisfied_inputs.push({ tool_id: id, missing })
  }

  return { order, feeds_into: edges, coupled_pairs, unmet_outputs: unmet, unsatisfied_inputs }
}
