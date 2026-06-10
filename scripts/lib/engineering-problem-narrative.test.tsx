/**
 * scripts/lib/engineering-problem-narrative.test.tsx
 *
 * Jest unit test for the deterministic engineering-PROBLEM narrative.
 * Run: npx jest scripts/lib/engineering-problem-narrative.test.tsx
 *
 * Feeds a small SYNTHETIC state whose tools map to exactly THREE domains
 * (capture + reaction + electrical) plus ONE unmapped tool, and asserts the
 * narrative is GATED BY THE TOOLS THAT RAN:
 *   (a) ONLY those three real domains appear (in DOMAIN_ORDER), each naming its
 *       §-tool(s) with the SAME §-numbers the ledger assigns;
 *   (b) a domain whose tool is ABSENT (e.g. 'safety') does NOT appear;
 *   (c) an UNMAPPED tool falls to the generic 'other' domain — named, with NO
 *       invented story (empty authored paragraph);
 *   (d) the opening line lists only the present (non-'other') sub-problems;
 *   (e) the §-numbers cited are exactly the ones that fired (no fabrication);
 *   (f) an empty state yields a well-formed empty narrative.
 * No network, no LLM, no real state file — every fact is derivable from the
 * synthetic object alone (the helper's whole contract: it requires no chain
 * change and re-runs identically).
 */

import {
  buildEngineeringProblemNarrative,
  domainForTool,
} from './engineering-problem-narrative'

/** Four-tool synthetic run wired linearly so the ledger assigns stable
 *  §-numbers by execution order:
 *    absorption:column-htu-ntu (§1)  -> 'capture'
 *    reactor:cstr-pfr-sizing   (§2)  -> 'reaction'
 *    electrical:transformer-sizing (§3) -> 'electrical'
 *    bagging:throughput-sizing (§4)  -> UNMAPPED -> 'other'
 *  NOTE the deliberate ABSENCE of any safety / lifecycle / regeneration tool, so
 *  those domains must NOT appear. The brief carries a capture-efficiency percent
 *  + a primary product rate so BOTH optional slots fill (proving the slot path),
 *  but the test does not hard-code the engine's exact slot wording beyond the
 *  filled value. */
function makeState() {
  return {
    moduleDecomposition: { product_class: 'co2_mineralisation' },
    parsedBrief: {
      constraints: {
        target_performance: {
          key_metric: 'co2_capture_capacity_tpd',
          value: 1,
          unit: 't/day',
          metrics: [
            { key_metric: 'co2_capture_capacity_tpd', value: 1, unit: 't/day', category: 'scale' },
          ],
        },
      },
    },
    orchestratorContract: {
      product_class: 'co2_mineralisation',
      _tools_run: [
        'absorption:column-htu-ntu',
        'reactor:cstr-pfr-sizing',
        'electrical:transformer-sizing',
        'bagging:throughput-sizing',
      ],
      quantities: {
        co2_capture_efficiency_pct: { value: 90, unit: '%', source: 'calculator' },
        capture_capacity_tco2_per_day: { value: 1, unit: 't/day', source: 'brief' },
      },
    },
    toolsUsedPage: {
      title: 'Tools',
      tools: [
        {
          tool_id: 'absorption:column-htu-ntu',
          tool_name: 'Packed Absorption Column',
          claims: [{ field: 'absorber_packed_height_m', value: 8.2, unit: 'm', output_field: 'height_m' }],
        },
        {
          tool_id: 'reactor:cstr-pfr-sizing',
          tool_name: 'Reactor Sizing',
          claims: [{ field: 'reactor_volume_m3', value: 3.1, unit: 'm3', output_field: 'volume_m3' }],
        },
        {
          tool_id: 'electrical:transformer-sizing',
          tool_name: 'Transformer Sizing',
          claims: [{ field: 'transformer_rating_kva', value: 250, unit: 'kVA', output_field: 'kva' }],
        },
        {
          tool_id: 'bagging:throughput-sizing',
          tool_name: 'Bagging Throughput',
          claims: [{ field: 'bagging_rate_bags_per_hour', value: 40, unit: '1/h', output_field: 'bph' }],
        },
      ],
      flow_edges: [
        { from: 'absorption:column-htu-ntu', to: 'reactor:cstr-pfr-sizing' },
        { from: 'reactor:cstr-pfr-sizing', to: 'electrical:transformer-sizing' },
        { from: 'electrical:transformer-sizing', to: 'bagging:throughput-sizing' },
      ],
    },
  }
}

describe('domainForTool', () => {
  it('maps the CO2/process tool ids to their domain keys', () => {
    expect(domainForTool('absorption:column-htu-ntu')).toBe('capture')
    expect(domainForTool('ht:ntu-heat-exchanger')).toBe('regeneration')
    expect(domainForTool('dac:regeneration-energy')).toBe('regeneration')
    expect(domainForTool('reactor:cstr-pfr-sizing')).toBe('reaction')
    expect(domainForTool('reaction:cstr-pfr-sizing')).toBe('reaction')
    expect(domainForTool('reaction:stoichiometry-balance')).toBe('stoichiometry')
    expect(domainForTool('reaction:feasibility-gibbs')).toBe('feasibility')
    expect(domainForTool('crystalliser:evaporator-sizing')).toBe('crystallisation')
    expect(domainForTool('dryer:thermal-sizing')).toBe('separation_drying')
    expect(domainForTool('fluids:pipe-sizing')).toBe('fluid_transport')
    expect(domainForTool('process:pump-sizing')).toBe('fluid_transport')
    expect(domainForTool('electrical:transformer-sizing')).toBe('electrical')
    expect(domainForTool('electrical:cable-sizing')).toBe('electrical')
    expect(domainForTool('control-systems:pid-tuning')).toBe('control')
    expect(domainForTool('noise-emission:dba')).toBe('safety')
    expect(domainForTool('lifecycle-co2:assessment')).toBe('lifecycle')
    expect(domainForTool('pressure-vessel:design')).toBe('pressure_containment')
    expect(domainForTool('coolprop:refrigerant-properties')).toBe('fluid_properties')
    expect(domainForTool('agitation:power')).toBe('mixing')
    expect(domainForTool('mass-aggregator:envelope-check')).toBe('envelope')
  })

  it('the stoichiometry / feasibility rules are NOT swallowed by the broad reaction rule', () => {
    // ordered-rule discipline: the specific reaction:* rules precede reactor:*/cstr*.
    expect(domainForTool('reaction:stoichiometry-balance')).not.toBe('reaction')
    expect(domainForTool('reaction:feasibility-gibbs')).not.toBe('reaction')
  })

  it('an unmapped tool id falls to the generic other domain', () => {
    expect(domainForTool('bagging:throughput-sizing')).toBe('other')
    expect(domainForTool('totally:unknown-tool')).toBe('other')
    expect(domainForTool('')).toBe('other')
  })
})

describe('buildEngineeringProblemNarrative', () => {
  const n = buildEngineeringProblemNarrative(makeState())

  it('emits ONLY the domains whose tools actually ran (capture, reaction, electrical, other)', () => {
    expect(n.problems.map((p) => p.domain)).toEqual([
      'capture',
      'reaction',
      'electrical',
      'other',
    ])
  })

  it('does NOT emit a domain whose tool is absent (safety / lifecycle / regeneration)', () => {
    const domains = n.problems.map((p) => p.domain)
    expect(domains).not.toContain('safety')
    expect(domains).not.toContain('lifecycle')
    expect(domains).not.toContain('regeneration')
    expect(domains).not.toContain('crystallisation')
  })

  it('each present problem names its §-tool(s) with the SAME §-numbers the ledger assigned', () => {
    const capture = n.problems.find((p) => p.domain === 'capture')!
    expect(capture.tools).toEqual([{ num: 1, name: 'Packed Absorption Column' }])
    const reaction = n.problems.find((p) => p.domain === 'reaction')!
    expect(reaction.tools).toEqual([{ num: 2, name: 'Reactor Sizing' }])
    const electrical = n.problems.find((p) => p.domain === 'electrical')!
    expect(electrical.tools).toEqual([{ num: 3, name: 'Transformer Sizing' }])
  })

  it('cites ONLY §-numbers that genuinely fired (no fabricated §)', () => {
    const allNums = n.problems.flatMap((p) => p.tools.map((t) => t.num)).sort((a, b) => a - b)
    // exactly §1..§4 (the four tools that ran), no more, no less.
    expect(allNums).toEqual([1, 2, 3, 4])
  })

  it('the unmapped tool lands in other — NAMED, with NO invented story (empty paragraph)', () => {
    const other = n.problems.find((p) => p.domain === 'other')!
    expect(other.tools).toEqual([{ num: 4, name: 'Bagging Throughput' }])
    // gated narrative: 'other' carries NO authored paragraph (never a fabricated story).
    expect(other.problemParagraph).toBe('')
  })

  it('fills the capture-efficiency + output-rate slots deterministically from state', () => {
    const capture = n.problems.find((p) => p.domain === 'capture')!
    // 90% capture-efficiency contract quantity flows into the capture paragraph.
    expect(capture.problemParagraph).toMatch(/90%/)
    // no unresolved {placeholder} ever reaches the reader.
    expect(capture.problemParagraph).not.toMatch(/\{[a-z_]+\}/i)
    // the authored capture prose is present (assembled, not invented).
    expect(capture.problemParagraph.toLowerCase()).toMatch(/packed column/)
  })

  it('opens by listing only the present (non-other) sub-problems', () => {
    expect(n.opening.toLowerCase()).toMatch(/capturing the target species/)
    expect(n.opening.toLowerCase()).toMatch(/making the product/)
    expect(n.opening.toLowerCase()).toMatch(/powering the plant/)
    // 'other' is NOT enumerated in the opening (it has no real sub-problem).
    expect(n.opening.toLowerCase()).not.toMatch(/supporting calculations/)
    // it states the count of core problems (3 named domains here).
    expect(n.opening).toMatch(/3 core engineering problems/)
  })

  it('drops a slot cleanly when its value is absent (no dangling placeholder)', () => {
    // strip the capture-efficiency sources from state → the slot must vanish, the
    // sentence still reads, and no "{capture_target}" leaks.
    const st = makeState()
    delete (st.orchestratorContract.quantities as any).co2_capture_efficiency_pct
    const n2 = buildEngineeringProblemNarrative(st)
    const capture = n2.problems.find((p) => p.domain === 'capture')!
    expect(capture.problemParagraph).not.toMatch(/\{[a-z_]+\}/i)
    expect(capture.problemParagraph).not.toMatch(/90%/)
    expect(capture.problemParagraph.toLowerCase()).toMatch(/target capture/)
  })

  it('returns a well-formed empty narrative when no orchestrator tools ran', () => {
    const n3 = buildEngineeringProblemNarrative({ moduleDecomposition: { product_class: 'x' } })
    expect(n3.problems).toEqual([])
    expect(n3.opening).toBe('')
  })

  it('never throws on malformed state', () => {
    expect(() => buildEngineeringProblemNarrative(null)).not.toThrow()
    expect(() => buildEngineeringProblemNarrative(undefined)).not.toThrow()
    expect(() => buildEngineeringProblemNarrative({ toolsUsedPage: { tools: 'nope' } })).not.toThrow()
  })
})
