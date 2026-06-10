/**
 * scripts/lib/engineering-ledger.test.tsx
 *
 * Jest unit test for the deterministic engineering cross-reference ledger.
 * Run: npx jest scripts/lib/engineering-ledger.test.tsx
 *
 * Feeds a small SYNTHETIC state (3 tools wired A → B → C) and asserts the ledger
 * (a) assigns §1/§2/§3 in execution order, (b) records B's input as §1 and B's
 * output as §3, (c) labels a brief-sourced input, (d) sends the terminal tool C
 * to the Bill of Materials, and (e) attributes a tool-sourced quantity to its
 * producing tool's §. No network, no LLM, no real state file — every fact is
 * derivable from the synthetic object alone (the helper's whole contract: it
 * requires no chain change).
 */

import {
  buildEngineeringLedger,
  isSectionRef,
  isBriefRef,
  formatInputs,
  formatOutputs,
  formatInputsDetailed,
  formatOutputsDetailed,
  formatProvenanceStrip,
  type SectionRef,
  type BriefRef,
} from './engineering-ledger'

/** Three-tool linear chain A → B → C.
 *   tool:a (§1)  →  tool:b (§2)  →  tool:c (§3, terminal)
 *  tool:a's manifest input_keys include a brief-sourced quantity, so A's
 *  inputsFrom must carry a labelled brief value. tool:c has no downstream tool,
 *  so it must output to the Bill of Materials. A duplicate edge is included to
 *  prove de-duplication. */
function makeState() {
  return {
    moduleDecomposition: { product_class: 'demo_widget' },
    orchestratorContract: {
      product_class: 'demo_widget',
      _tools_run: ['tool:a', 'tool:b', 'tool:c'],
      quantities: {
        // brief-sourced driver; tool:a's manifest input_keys are unknown to the
        // checked-in manifest, so the EXACT brief-input path won't fire — but the
        // tool:a claim below carries no brief link either. We assert the brief
        // label via the FORMATTER on a hand-built entry too (belt + braces),
        // and rely on the dedicated brief fixture test below for the data path.
        widget_throughput_t_day: { value: 10, unit: 't/day', source: 'brief', source_detail: 'brief throughput' },
        // tool-sourced quantity → must attribute to its producer's §.
        vessel_mass_kg: {
          value: 685, unit: 'kg', source: 'tool:tool:b',
          provenance: { source: 'tool:tool:b', tool_id: 'tool:b' },
        },
      },
    },
    toolsUsedPage: {
      title: 'Tools',
      tools: [
        {
          tool_id: 'tool:a',
          tool_name: 'Alpha Sizer',
          claims: [{ field: 'alpha_kw', value: 12, unit: 'kW', output_field: 'kw' }],
        },
        {
          tool_id: 'tool:b',
          tool_name: 'Beta Vessel',
          claims: [{ field: 'vessel_mass_kg', value: 685, unit: 'kg', output_field: 'mass_kg' }],
        },
        {
          tool_id: 'tool:c',
          tool_name: 'Gamma Aggregator',
          claims: [{ field: 'total_mass_kg', value: 1200, unit: 'kg', output_field: 'mass_kg' }],
        },
      ],
      flow_edges: [
        { from: 'tool:a', to: 'tool:b' },
        { from: 'tool:b', to: 'tool:c' },
        // duplicate edge — must be de-duped, not double-counted
        { from: 'tool:a', to: 'tool:b' },
      ],
    },
  }
}

describe('buildEngineeringLedger', () => {
  const ledger = buildEngineeringLedger(makeState())

  it('assigns §1/§2/§3 by execution order', () => {
    expect(ledger.order).toEqual(['tool:a', 'tool:b', 'tool:c'])
    expect(ledger.byToolId.get('tool:a')!.num).toBe(1)
    expect(ledger.byToolId.get('tool:b')!.num).toBe(2)
    expect(ledger.byToolId.get('tool:c')!.num).toBe(3)
    expect(ledger.byToolId.get('tool:a')!.name).toBe('Alpha Sizer')
  })

  it('records B.inputsFrom as §1 and B.outputsTo as §3', () => {
    const b = ledger.byToolId.get('tool:b')!
    const inSecs = b.inputsFrom.filter(isSectionRef) as SectionRef[]
    expect(inSecs.map((r) => r.num)).toEqual([1])
    expect(inSecs[0].name).toBe('Alpha Sizer')

    const outSecs = b.outputsTo.filter(isSectionRef) as SectionRef[]
    expect(outSecs.map((r) => r.num)).toEqual([3])
    expect(outSecs[0].name).toBe('Gamma Aggregator')

    // formatter wording (the §-ref strings the renderer prints). ASCII arrows
    // ("<-"/"->") are used because the renderer's Helvetica lacks ←/→ glyphs.
    expect(formatInputs(b)).toMatch(/§1 Alpha Sizer/)
    expect(formatOutputs(b)).toMatch(/§3 Gamma Aggregator/)
    expect(formatProvenanceStrip(b)).toBe('Inputs <- §1 · Outputs -> §3')
  })

  it('de-dupes the repeated A → B edge (B fed by §1 exactly once)', () => {
    const b = ledger.byToolId.get('tool:b')!
    const inSecs = b.inputsFrom.filter(isSectionRef) as SectionRef[]
    expect(inSecs.length).toBe(1)
  })

  it('sends the terminal tool C to the Bill of Materials', () => {
    const c = ledger.byToolId.get('tool:c')!
    expect(c.outputsTo).toEqual(['Bill of Materials'])
    expect(formatOutputs(c)).toMatch(/Bill of Materials/)
    expect(formatProvenanceStrip(c)).toMatch(/Outputs -> Bill of Materials/)
  })

  it('attributes a tool-sourced quantity to its producing tool §', () => {
    // vessel_mass_kg is produced by tool:b (§2) via provenance.tool_id.
    expect(ledger.sectionForQuantity.get('vessel_mass_kg')).toBe(2)
  })

  it('labels a brief-sourced input when the manifest links it', () => {
    // Build a fixture whose tool's manifest input_keys are also brief quantities
    // by FUZZY token overlap: the brief key shares a significant token with a
    // manifest input key of a real manifest tool. We use a real registered tool
    // id ("dac:regeneration-energy") whose manifest input_keys include
    // "target_capture_tpd" + "capture_capacity_g_co2_g_sorbent"; a brief key
    // "capture_capacity_tco2_per_day" shares the {capture, capacity} tokens.
    const st = {
      moduleDecomposition: { product_class: 'co2_mineralisation' },
      orchestratorContract: {
        _tools_run: ['dac:regeneration-energy', 'tool:z'],
        quantities: {
          capture_capacity_tco2_per_day: { value: 1, unit: 't/day', source: 'brief' },
        },
      },
      toolsUsedPage: {
        tools: [
          { tool_id: 'dac:regeneration-energy', tool_name: 'DAC Regeneration Energy', claims: [] },
          { tool_id: 'tool:z', tool_name: 'Z', claims: [] },
        ],
        flow_edges: [{ from: 'dac:regeneration-energy', to: 'tool:z' }],
      },
    }
    const lg = buildEngineeringLedger(st)
    const dac = lg.byToolId.get('dac:regeneration-energy')!
    const briefRefs = dac.inputsFrom.filter(isBriefRef) as BriefRef[]
    expect(briefRefs.length).toBeGreaterThanOrEqual(1)
    // the label is the humanised brief key (units stripped)
    expect(briefRefs.map((b) => b.brief).join(' ')).toMatch(/capture capacity/)
    // and the formatter surfaces it
    expect(formatInputs(dac).toLowerCase()).toMatch(/brief value/)
  })

  it('flags a coupled fixed-point loop (cycle) member', () => {
    const st: any = makeState()
    // add a back-edge C → A → genuine cycle A→B→C→A
    st.toolsUsedPage.flow_edges.push({ from: 'tool:c', to: 'tool:a' })
    const lg = buildEngineeringLedger(st)
    expect(lg.byToolId.get('tool:a')!.inCycle).toBe(true)
    expect(lg.byToolId.get('tool:b')!.inCycle).toBe(true)
    expect(lg.byToolId.get('tool:c')!.inCycle).toBe(true)
  })

  it('returns a well-formed empty ledger when no tool plan ran', () => {
    const lg = buildEngineeringLedger({ moduleDecomposition: { product_class: 'x' } })
    expect(lg.order).toEqual([])
    expect(lg.byToolId.size).toBe(0)
    expect(lg.sectionForQuantity.size).toBe(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Per-quantity edge resolution (item 2, 2026-06-10): name the SPECIFIC quantity
// per destination/source, with a tool-level fallback for unresolved links.
// Uses REAL registered tool ids so the checked-in tool-io-manifest.json supplies
// the input_keys/output_keys the resolver matches against (the synthetic tool:a/
// b/c ids carry no manifest, so they exercise the no-edge fallback path).
// ───────────────────────────────────────────────────────────────────────────
describe('engineering-ledger per-quantity edges (item 2)', () => {
  // fluids:pipe-sizing emits pipe_diameter_mm; process:pump-sizing's manifest
  // input_keys include pipe_diameter_mm → the value-level link must resolve.
  // mass-aggregator:envelope-check is a terminal sink whose input_keys include
  // mea_pump_motor (via *_pump_motor_kw) — a second resolved destination.
  function pipeChainState() {
    return {
      moduleDecomposition: { product_class: 'co2_mineralisation' },
      orchestratorContract: {
        _tools_run: ['fluids:pipe-sizing', 'process:pump-sizing', 'mass-aggregator:envelope-check'],
        quantities: {},
      },
      toolsUsedPage: {
        tools: [
          {
            tool_id: 'fluids:pipe-sizing',
            tool_name: 'Fluids Pipe Sizing',
            claims: [
              { field: 'pipe_diameter_mm', value: 50, unit: 'mm', output_field: 'pipe_diameter_mm' },
            ],
          },
          {
            tool_id: 'process:pump-sizing',
            tool_name: 'Process Pump Sizing',
            claims: [
              { field: 'mea_pump_motor_kw', value: 0.75, unit: 'kW', output_field: 'pump_motor_kw' },
            ],
          },
          { tool_id: 'mass-aggregator:envelope-check', tool_name: 'Mass Aggregator', claims: [] },
        ],
        flow_edges: [
          { from: 'fluids:pipe-sizing', to: 'process:pump-sizing' },
          { from: 'fluids:pipe-sizing', to: 'mass-aggregator:envelope-check' },
          { from: 'process:pump-sizing', to: 'mass-aggregator:envelope-check' },
        ],
      },
    }
  }

  const lg = buildEngineeringLedger(pipeChainState())

  it('resolves a specific output quantity to its consuming §', () => {
    const pipe = lg.byToolId.get('fluids:pipe-sizing')!
    // pipe diameter feeds the pump sizing (§2): a per-quantity OUTPUT edge.
    const toPump = pipe.outputEdges.find((e) => e.to.num === 2)
    expect(toPump).toBeTruthy()
    expect(toPump!.quantity).toMatch(/pipe diameter/)
  })

  it('names the quantity in the detailed Outputs clause, tool-level fallback for the rest', () => {
    const pipe = lg.byToolId.get('fluids:pipe-sizing')!
    const out = formatOutputsDetailed(pipe)
    // pipe diameter -> §2 named; the mass-aggregator (§3) has no resolved
    // quantity from pipe sizing, so it falls back to a tool-level "also feeds §3".
    expect(out).toMatch(/pipe diameter -> §2/)
    expect(out).toMatch(/also feeds §3/)
    // it must NOT invent a quantity name for the §3 fallback.
    expect(out).not.toMatch(/-> §3/)
  })

  it('resolves a specific input quantity to its producing § (mirror direction)', () => {
    const pump = lg.byToolId.get('process:pump-sizing')!
    // the pump reads pipe_diameter_mm from §1 (fluids) — a per-quantity INPUT edge.
    const fromFluids = pump.inputEdges.find((e) => e.from.num === 1)
    expect(fromFluids).toBeTruthy()
    expect(fromFluids!.quantity).toMatch(/pipe diameter/)
    const ins = formatInputsDetailed(pump)
    expect(ins).toMatch(/pipe diameter \(from §1\)/)
  })

  it('never fabricates a value-level link when keys do not match', () => {
    // A tool whose output shares NO specific token with the downstream input
    // keys gets ZERO output edges and the detailed clause degrades to the plain
    // tool-level §-ref (formatOutputs), never a fabricated "<quantity> -> §n".
    const st = {
      moduleDecomposition: { product_class: 'co2_mineralisation' },
      orchestratorContract: {
        _tools_run: ['noise-emission:dba', 'mass-aggregator:envelope-check'],
        quantities: {},
      },
      toolsUsedPage: {
        tools: [
          {
            tool_id: 'noise-emission:dba',
            tool_name: 'Noise Emission',
            claims: [{ field: 'sound_pressure_level_dba', value: 72, unit: 'dBA', output_field: 'spl_dba' }],
          },
          { tool_id: 'mass-aggregator:envelope-check', tool_name: 'Mass Aggregator', claims: [] },
        ],
        flow_edges: [{ from: 'noise-emission:dba', to: 'mass-aggregator:envelope-check' }],
      },
    }
    const l2 = buildEngineeringLedger(st)
    const noise = l2.byToolId.get('noise-emission:dba')!
    expect(noise.outputEdges.length).toBe(0)
    // detailed === plain tool-level when nothing resolved.
    expect(formatOutputsDetailed(noise)).toBe(formatOutputs(noise))
    expect(formatOutputsDetailed(noise)).not.toMatch(/->\s*§/)
  })

  it('the synthetic manifest-less chain yields no per-quantity edges (degrades cleanly)', () => {
    // tool:a/b/c carry no manifest entry → resolver finds no input_keys → no
    // edges, and the detailed formatter equals the tool-level one.
    const l3 = buildEngineeringLedger(makeState())
    const b = l3.byToolId.get('tool:b')!
    expect(b.outputEdges.length).toBe(0)
    expect(b.inputEdges.length).toBe(0)
    expect(formatOutputsDetailed(b)).toBe(formatOutputs(b))
    expect(formatInputsDetailed(b)).toBe(formatInputs(b))
  })
})
