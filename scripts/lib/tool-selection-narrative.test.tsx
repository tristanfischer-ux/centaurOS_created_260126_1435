/**
 * scripts/lib/tool-selection-narrative.test.tsx
 *
 * Jest unit test for the deterministic tool-selection narrative (increment 1A).
 * Run: npx jest scripts/lib/tool-selection-narrative.test.tsx
 *
 * Feeds a small SYNTHETIC state (3 tools wired by feeds_into) and asserts the
 * narrative (a) names every tool, (b) states each tool's inputs + outputs,
 * (c) orders them by the recorded execution order, and (d) surfaces the
 * coupled fixed-point loop + the aggregation sink. No network, no LLM, no real
 * state file — every fact is derivable from the synthetic object alone, which
 * is the whole contract: the narrative requires no chain change.
 */

import { buildToolSelectionNarrative } from './tool-selection-narrative'

/** Three-tool synthetic run:
 *    sizing:vessel  →  agg:envelope        (vessel mass into the aggregator)
 *    heat:exchanger →  agg:envelope        (HX duty into the aggregator)
 *    heat:exchanger →  sizing:vessel       AND  sizing:vessel → heat:exchanger
 *      → a genuine A↔B cycle, so both are reported as a coupled loop.
 *  agg:envelope is fed by 2 producers — but the sink threshold is ≥3, so this
 *  fixture deliberately keeps it BELOW the "aggregation sink" bar to prove the
 *  sink is only claimed when it genuinely aggregates (see the 4-tool case). */
function makeState() {
  return {
    moduleDecomposition: { product_class: 'demo_widget' },
    orchestratorContract: {
      product_class: 'demo_widget',
      // Recorded execution order — the narrative must follow THIS.
      _tools_run: ['heat:exchanger', 'sizing:vessel', 'agg:envelope'],
      quantities: {
        // brief-sourced driver that heat:exchanger consumes (per manifest it
        // won't be in the checked-in manifest, so describeBriefInputs returns
        // [] here — that's fine; upstream/downstream still prove inputs/outputs)
        duty_kw: { value: 100, unit: 'kW', source: 'brief', source_detail: 'brief duty' },
      },
    },
    toolsUsedPage: {
      title: 'Tools',
      intro: '',
      disclaimer: '',
      tools: [
        {
          tool_id: 'heat:exchanger',
          tool_name: 'Shell-and-Tube Heat Exchanger',
          claims: [
            { field: 'exchanger_area_m2', value: 42, unit: 'm2', output_field: 'area_m2', input_summary: '(none)' },
            { field: 'exchanger_duty_kw', value: 100, unit: 'kW', output_field: 'duty_kw', input_summary: '(none)' },
          ],
        },
        {
          tool_id: 'sizing:vessel',
          tool_name: 'Pressure Vessel Sizing',
          claims: [
            { field: 'vessel_mass_kg', value: 685, unit: 'kg', output_field: 'mass_kg', input_summary: '(none)' },
          ],
        },
        {
          tool_id: 'agg:envelope',
          tool_name: 'Mass + Envelope Aggregator',
          claims: [
            { field: 'total_mass_kg', value: 1200, unit: 'kg', output_field: 'mass_kg', input_summary: '(none)' },
          ],
        },
      ],
      available_but_unused: [],
      flow_edges: [
        { from: 'heat:exchanger', to: 'agg:envelope' },
        { from: 'sizing:vessel', to: 'agg:envelope' },
        // a coupled pair (cycle): HX ↔ vessel
        { from: 'heat:exchanger', to: 'sizing:vessel' },
        { from: 'sizing:vessel', to: 'heat:exchanger' },
        // duplicate edge — must be de-duped, not double-counted
        { from: 'heat:exchanger', to: 'agg:envelope' },
      ],
    },
  }
}

describe('buildToolSelectionNarrative', () => {
  const narrative = buildToolSelectionNarrative(makeState())

  it('names every selected tool exactly once, in execution order', () => {
    expect(narrative.tools.map((t) => t.id)).toEqual([
      'heat:exchanger',
      'sizing:vessel',
      'agg:envelope',
    ])
    // each entry carries the human name from the tools-used page
    expect(narrative.tools[0].name).toBe('Shell-and-Tube Heat Exchanger')
    expect(narrative.tools[2].name).toBe('Mass + Envelope Aggregator')
  })

  it('opens with the count + class + flow + ordering sentence', () => {
    expect(narrative.summary).toMatch(/^3 tools were auto-selected for this demo widget brief\./)
    // ordering is explained as deterministic + recorded
    expect(narrative.summary.toLowerCase()).toMatch(/order/)
    expect(narrative.summary.toLowerCase()).toMatch(/deterministic/)
  })

  it('states what each tool OWNS (the physics/quantity it computes)', () => {
    const hx = narrative.tools.find((t) => t.id === 'heat:exchanger')!
    expect(hx.owns.toLowerCase()).toMatch(/exchanger area/)
    expect(hx.owns.toLowerCase()).toMatch(/exchanger duty/)
    const v = narrative.tools.find((t) => t.id === 'sizing:vessel')!
    expect(v.owns.toLowerCase()).toMatch(/vessel mass/)
  })

  it('states each tool’s INPUTS (upstream feeders)', () => {
    // vessel is fed by the heat exchanger (the cycle edge HX → vessel)
    const v = narrative.tools.find((t) => t.id === 'sizing:vessel')!
    expect(v.inputs.toLowerCase()).toMatch(/upstream/)
    expect(v.inputs).toMatch(/Shell-and-Tube Heat Exchanger/)
  })

  it('states each tool’s OUTPUTS (downstream consumers)', () => {
    const hx = narrative.tools.find((t) => t.id === 'heat:exchanger')!
    // HX feeds both the aggregator and the vessel
    expect(hx.outputs).toMatch(/Mass \+ Envelope Aggregator/)
    expect(hx.outputs).toMatch(/Pressure Vessel Sizing/)
    // the aggregator is terminal (nothing downstream)
    const agg = narrative.tools.find((t) => t.id === 'agg:envelope')!
    expect(agg.outputs.toLowerCase()).toMatch(/terminal/)
  })

  it('reports the step order and the coupled fixed-point loop', () => {
    const hx = narrative.tools.find((t) => t.id === 'heat:exchanger')!
    expect(hx.sequencing).toMatch(/step 1 of 3/)
    expect(hx.sequencing.toLowerCase()).toMatch(/coupled fixed-point loop/)
    const v = narrative.tools.find((t) => t.id === 'sizing:vessel')!
    expect(v.sequencing).toMatch(/step 2 of 3/)
    expect(v.sequencing.toLowerCase()).toMatch(/coupled fixed-point loop/)
    // the aggregator is NOT in the cycle
    const agg = narrative.tools.find((t) => t.id === 'agg:envelope')!
    expect(agg.sequencing.toLowerCase()).not.toMatch(/coupled fixed-point loop/)
  })

  it('de-dupes repeated flow edges (no double-counted consumer)', () => {
    const hx = narrative.tools.find((t) => t.id === 'heat:exchanger')!
    // "Mass + Envelope Aggregator" must appear once in outputs despite the
    // duplicated edge in the fixture.
    const occurrences = hx.outputs.split('Mass + Envelope Aggregator').length - 1
    expect(occurrences).toBe(1)
  })

  it('names the aggregation sink when ≥3 producers converge on it', () => {
    // 4-tool fixture: 3 producers all feed the aggregator → it is the sink.
    const state = makeState()
    state.orchestratorContract._tools_run = ['t:a', 't:b', 't:c', 'agg:envelope']
    state.toolsUsedPage.tools = [
      { tool_id: 't:a', tool_name: 'Tool A', claims: [{ field: 'a_kw', value: 1, unit: 'kW', output_field: 'kw', input_summary: '' }] },
      { tool_id: 't:b', tool_name: 'Tool B', claims: [{ field: 'b_kg', value: 2, unit: 'kg', output_field: 'kg', input_summary: '' }] },
      { tool_id: 't:c', tool_name: 'Tool C', claims: [{ field: 'c_m', value: 3, unit: 'm', output_field: 'm', input_summary: '' }] },
      { tool_id: 'agg:envelope', tool_name: 'Aggregator', claims: [{ field: 'total_kg', value: 9, unit: 'kg', output_field: 'kg', input_summary: '' }] },
    ] as any
    state.toolsUsedPage.flow_edges = [
      { from: 't:a', to: 'agg:envelope' },
      { from: 't:b', to: 'agg:envelope' },
      { from: 't:c', to: 'agg:envelope' },
    ]
    const n = buildToolSelectionNarrative(state)
    expect(n.summary.toLowerCase()).toMatch(/converge/)
    const agg = n.tools.find((t) => t.id === 'agg:envelope')!
    expect(agg.sequencing.toLowerCase()).toMatch(/aggregation point/)
    expect(agg.sequencing).toMatch(/3 upstream tools/)
  })

  it('returns a well-formed empty narrative when no tool plan ran', () => {
    const n = buildToolSelectionNarrative({ moduleDecomposition: { product_class: 'x_class' } })
    expect(n.tools).toEqual([])
    expect(n.summary.toLowerCase()).toMatch(/no deterministic engineering-tool plan/)
  })
})
