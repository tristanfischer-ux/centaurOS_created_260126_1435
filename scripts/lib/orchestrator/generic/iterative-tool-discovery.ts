/**
 * scripts/lib/orchestrator/generic/iterative-tool-discovery.ts
 *
 * ITERATIVE TOOL DISCOVERY — re-sweep as the design reveals new duties.
 *
 * INTENT (Tristan 2026-08-01): "after the expanded brief there needs to be a
 * mechanism that looks at the expanded brief requirements and then selects all
 * the tools that directly address all the brief requirements and also indirectly
 * address them and also NEW ONES THAT ARE LOADED AFTER THE FIRST TOOLS DO
 * SOMETHING and then there is a realisation that more tools are needed
 * downstream of that — in the same way that you decided to create a bunch of
 * hand written new tools."
 *
 * THE GAP THIS CLOSES: `sweepToolRelevance` is exhaustive and deterministic, but
 * it runs ONCE, against the expanded brief. Nothing re-runs it after tools
 * execute. Verified by grep: no caller re-invokes the sweep post-execution. So a
 * tool whose relevance only becomes apparent AFTER an earlier tool computes
 * something is never found.
 *
 * That is precisely the failure I performed by hand on the FE front kit: I ran a
 * magnetics solve, realised I needed a rotordynamic answer, and WROTE MY OWN
 * instead of re-asking the catalogue. The architecture has the same blind spot.
 *
 * HOW IT WORKS — a fixpoint over the duty set:
 *   round 0 : duties = brief duties            -> sweep -> T0
 *   round n : duties += output_fields of T(n-1) -> sweep -> Tn
 *   stop when Tn adds nothing (CONVERGED) or max_rounds (BUDGET).
 *
 * A tool's `output_fields` is what it COMPUTES, so adding them to the duty set
 * is exactly "the first tools did something, now more is known". The sweep's
 * cache key already includes the duties, so an enriched duty set produces a new
 * key and a genuine re-judgement — while an unchanged duty set replays the cache
 * and costs nothing. Determinism is preserved by construction.
 *
 * CAPABILITY GAPS: a duty that no tool in the catalogue computes is reported as
 * a gap. That is the honest trigger for AUTHORING a new tool — the decision I
 * made ad hoc and invisibly. Here it is a named output.
 */

export interface DiscoveryToolEntry {
  tool_id: string
  domain: string
  output_fields: string[]
}

export interface DiscoveryRound {
  round: number
  duty_count: number
  relevant: string[]
  new_this_round: string[]
  cache_key?: string
  llm_cost_usd?: number
  from_cache?: boolean
}

export interface IterativeDiscoveryResult {
  rounds: DiscoveryRound[]
  converged: boolean
  final_tool_set: string[]
  /** Tools found ONLY because an earlier round's outputs enriched the duties. */
  found_by_iteration: string[]
  /** Duties nothing in the catalogue computes — candidates for a NEW tool. */
  capability_gaps: string[]
  total_llm_cost_usd: number
}

/** A sweep callable, so this is testable without an API key. */
export type SweepFn = (duties: ReadonlyArray<string>) => Promise<{
  ok: boolean
  relevant_tool_ids?: string[]
  cache_key?: string
  llm_cost_usd?: number
  from_cache?: boolean
}>

/**
 * Run the discovery fixpoint.
 *
 * @param seedDuties duty keys from the expanded brief / contract quantities.
 * @param catalogue  every tool with its declared output_fields.
 * @param sweep      the relevance sweep, bound to the twin's brief + envelope.
 * @param maxRounds  budget. 4 is generous: convergence is typically 2-3.
 * @param requiredDuties optional duties that MUST be computed by some tool;
 *        any left uncomputed are reported as capability gaps.
 */
export async function iterativeToolDiscovery(
  seedDuties: ReadonlyArray<string>,
  catalogue: ReadonlyArray<DiscoveryToolEntry>,
  sweep: SweepFn,
  maxRounds = 4,
  requiredDuties: ReadonlyArray<string> = [],
): Promise<IterativeDiscoveryResult> {
  const byId = new Map(catalogue.map((c) => [c.tool_id, c]))
  const duties = new Set<string>(seedDuties)
  const selected = new Set<string>()
  const rounds: DiscoveryRound[] = []
  let converged = false
  let cost = 0

  for (let round = 0; round < maxRounds; round += 1) {
    const res = await sweep([...duties])
    if (!res.ok) break
    const relevant = res.relevant_tool_ids ?? []
    const fresh = relevant.filter((id) => !selected.has(id))
    cost += res.llm_cost_usd ?? 0
    rounds.push({
      round,
      duty_count: duties.size,
      relevant: [...relevant].sort(),
      new_this_round: [...fresh].sort(),
      cache_key: res.cache_key,
      llm_cost_usd: res.llm_cost_usd,
      from_cache: res.from_cache,
    })
    if (fresh.length === 0) {
      converged = true
      break
    }
    for (const id of fresh) {
      selected.add(id)
      // "The first tools did something" — their computed fields become known
      // quantities, which is what can make a further tool relevant.
      for (const f of byId.get(id)?.output_fields ?? []) duties.add(f)
    }
  }

  // A duty nothing computes is a CAPABILITY GAP — the honest trigger to author
  // a new tool, rather than quietly hand-rolling one as I did.
  const computable = new Set<string>()
  for (const id of selected) {
    for (const f of byId.get(id)?.output_fields ?? []) computable.add(f)
  }
  const gaps = [...new Set(requiredDuties)]
    .filter((d) => !computable.has(d))
    .sort()

  const round0 = new Set(rounds[0]?.relevant ?? [])
  return {
    rounds,
    converged,
    final_tool_set: [...selected].sort(),
    found_by_iteration: [...selected].filter((id) => !round0.has(id)).sort(),
    capability_gaps: gaps,
    total_llm_cost_usd: Number(cost.toFixed(4)),
  }
}

// ---------------------------------------------------------------------------
// proveCatch
// ---------------------------------------------------------------------------

export async function _selftest(): Promise<void> {
  const catalogue: DiscoveryToolEntry[] = [
    { tool_id: 'em:torque', domain: 'em', output_fields: ['rotor_speed_rpm', 'rotor_mass_kg'] },
    // Only becomes relevant once a rotor speed EXISTS — the downstream case.
    { tool_id: 'rotordyn:critical-speed', domain: 'mechanical', output_fields: ['critical_speed_rpm'] },
    // Only relevant once critical speed exists — a SECOND hop.
    { tool_id: 'bearing:life', domain: 'mechanical', output_fields: ['bearing_l10_h'] },
    { tool_id: 'irrelevant:thing', domain: 'other', output_fields: ['nothing_useful'] },
  ]
  // A sweep that mimics reality: relevance depends on what is KNOWN.
  const sweep: SweepFn = async (duties) => {
    const d = new Set(duties)
    const rel = ['em:torque']
    if (d.has('rotor_speed_rpm')) rel.push('rotordyn:critical-speed')
    if (d.has('critical_speed_rpm')) rel.push('bearing:life')
    return { ok: true, relevant_tool_ids: rel, llm_cost_usd: 0.1 }
  }

  const res = await iterativeToolDiscovery(['power_kw'], catalogue, sweep, 5,
    ['bearing_l10_h', 'magnet_demag_margin'])

  // The whole point: a single sweep would have found ONLY em:torque.
  if (res.rounds[0].relevant.length !== 1) {
    throw new Error(`round 0 should find only the directly-relevant tool, got ${res.rounds[0].relevant}`)
  }
  if (!res.final_tool_set.includes('rotordyn:critical-speed')) {
    throw new Error('a tool relevant only AFTER the first tool ran must be discovered')
  }
  if (!res.final_tool_set.includes('bearing:life')) {
    throw new Error('two-hop discovery must work (outputs of outputs)')
  }
  if (res.found_by_iteration.length !== 2) {
    throw new Error(`exactly the 2 downstream tools are iteration-found, got ${res.found_by_iteration}`)
  }
  if (!res.converged) throw new Error('must reach a fixpoint, not run to the budget')
  if (res.final_tool_set.includes('irrelevant:thing')) {
    throw new Error('iteration must not drag in irrelevant tools')
  }
  // The capability gap is the trigger to AUTHOR a tool.
  if (!res.capability_gaps.includes('magnet_demag_margin')) {
    throw new Error('a duty no tool computes must be reported as a capability gap')
  }
  if (res.capability_gaps.includes('bearing_l10_h')) {
    throw new Error('a duty that IS computed must not be a gap')
  }

  // Budget guard: a non-converging sweep must stop, not spin.
  const endless: SweepFn = async (duties) => ({
    ok: true,
    relevant_tool_ids: [`t${duties.length}`],
    llm_cost_usd: 0.1,
  })
  const growing: DiscoveryToolEntry[] = Array.from({ length: 50 }, (_, i) => ({
    tool_id: `t${i}`, domain: 'x', output_fields: [`f${i}`],
  }))
  const capped = await iterativeToolDiscovery(['a'], growing, endless, 3)
  if (capped.rounds.length > 3) throw new Error('maxRounds must cap the loop')
  if (capped.converged) throw new Error('a non-converging sweep must NOT claim convergence')

  // A failing sweep must not throw or fabricate a set.
  const dead: SweepFn = async () => ({ ok: false })
  const failed = await iterativeToolDiscovery(['a'], catalogue, dead, 3)
  if (failed.final_tool_set.length !== 0) throw new Error('a failed sweep selects nothing')

  console.log('iterative-tool-discovery _selftest: OK — 2-hop downstream discovery, '
    + 'fixpoint convergence, budget cap, capability gaps, fail-safe')
}

if (process.argv[1] && process.argv[1].endsWith('iterative-tool-discovery.ts')) {
  _selftest().catch((e) => { console.error(e); process.exit(1) })
}
