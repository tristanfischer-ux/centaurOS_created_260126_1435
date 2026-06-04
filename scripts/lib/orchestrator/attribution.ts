/**
 * scripts/lib/orchestrator/attribution.ts
 *
 * TOOLS-USED ATTRIBUTION RENDERER — produces the PDF end-page that
 * lists every verified engineering tool used to compute the design,
 * with field-level claims linking each numerical quantity to its tool
 * + version + license + source URL + invocation input.
 *
 * Per Tristan reframe (drawer drawer_forgeos_decisions_961c722f0e77d105):
 * "At the end of the PDF we could say explicitly that we used xyz
 * tools to do computations." This is the credibility primitive that
 * separates ForgeOS engineering-reference output from LLM-generated
 * narrative — a reader who installs the same tools can reproduce the
 * same numbers.
 *
 * Per GLM-5.1 round-3: "Credible IF field-level (`tool:PyBaMM:v23.5:
 * cell_temp:°C`), not just 'we used PyBaMM somewhere.' Version-pinned,
 * output-field-tracked, unit-tagged = reproducible. Post-hoc tool
 * listing = marketing."
 */

import type {
  ContractInProgress,
  License,
  Provenance,
  TypedQuantity,
} from './types'

export interface ToolAttributionEntry {
  tool_id: string
  tool_name: string
  tool_version: string
  tool_license: License
  tool_source_url: string
  /** Pinned dependency versions captured at invocation time. */
  pinned_versions: Record<string, string>
  /** Per-claim list — every field this tool computed. */
  claims: Array<{
    /** The Contract quantity key (e.g. 'cell_count'). */
    field: string
    /** The computed value with units. */
    value: number
    unit: string
    /** What the tool was given as input. */
    input_summary: string
    /** Which output field within the tool's response this was from. */
    output_field: string
  }>
  /** Total invocation duration across all claims. */
  total_duration_ms: number
  // Build #19d (2026-05-22): extended provenance pulled from each Python
  // wrapper's `_provenance` block. These propagate from the Python output
  // through the TS wrapper's invocation_input chain to the PDF Tools-Used
  // page. Each tool's PDF entry shows the paper + physics basis + confidence
  // class so an engineer reading the PDF can cite the source of every number.
  tool_paper?: string
  tool_doi?: string
  physics_basis?: string
  physics_paper_doi?: string
  confidence_class?:
    | 'library'
    | 'datasheet'
    | 'textbook'
    | 'standard'
    | 'empirical'
    | 'industry_typical'
    | 'estimated'
  embedded_constants?: Record<string, { source: string; confidence: string; note?: string }>
  last_reviewed_date?: string
}

export interface ToolsUsedPage {
  /** Page title. */
  title: string
  /** Intro paragraph explaining what this page is. */
  intro: string
  /** Per-tool attribution — tools that COMPUTED claims for this design. */
  tools: ToolAttributionEntry[]
  /** Tools that are AVAILABLE in the orchestrator's registry but did NOT
   *  run for this design (either the class plan didn't include them, or
   *  they were declared optional and weren't applicable). Surfaced on
   *  the report so the reader sees the FULL inventory of engineering
   *  tools the system can use, not just the ones invoked this time. */
  available_but_unused: Array<{ tool_id: string; name: string; version: string; license: License; source_url: string; domain: string; what_it_does: string }>
  /** Disclaimer text shown at end of page. */
  disclaimer: string
  /**
   * U9-A: tool→tool dependency edges derived from each ClassToolPlan
   * tool step's `feeds_into` declaration. These represent the REAL
   * causal data-flow graph — e.g. led-par:efficacy feeds_into
   * hvac:load-sizing because LED heat load drives cooling duty.
   * The Engineering Tools Flow diagram (Section 1c) draws these edges
   * in addition to the flat brief→tool and tool→Contract fan-out.
   * Absent when the orchestrator ran without a plan (legacy path).
   */
  flow_edges: Array<{ from: string; to: string }>
}

/** Human-readable description per tool_id for the "available but unused"
 *  section. Per Tristan 2026-05-22: "end of the report you can have a
 *  summary saying which tools are available and what they do." */
const TOOL_DESCRIPTIONS: Record<string, string> = {
  'pybamm:cell-sizing': 'Doyle-Fuller-Newman cell physics simulation: cell sizing, voltage profile, capacity fade, internal resistance, thermal dissipation.',
  'coolprop:refrigerant-properties': 'Thermophysical properties (Tsat, Psat, density, enthalpy, latent heat, specific heat) for 150+ fluids — refrigerants, coolants, water, ammonia.',
  'ngspice:pcs-simulation': 'SPICE-level transient + DC circuit simulation. Used for PCS dissipation, DC-link ripple, switching losses, filter sizing.',
  'pandapower:grid-integration': 'AC/DC power flow + short-circuit analysis. Computes transformer sizing, PCC fault level, voltage profiles, harmonic distortion.',
  'opendss:feeder-flow': 'Distribution feeder load flow (EPRI). Voltage profile along radial/meshed feeders, time-series analysis, EN 50160 compliance check.',
  'cantera:thermochemistry': 'Chemical thermodynamics + kinetics. Combustion equilibrium, refrigerant cycle thermo, fermentation kinetics.',
  'octopart:parts-lookup': 'Real-time parts catalog: availability, pricing, lead times across 22+ component distributors (Digi-Key, Mouser, Farnell).',
  'iec-standards:lookup': 'Mandatory regulatory standards per (class, region). IEC 62619, UL 9540, NFPA 855, ENA G99, EN 14825, etc.',
}

const DEFAULT_INTRO = (
  'Every numerical claim in this document was computed by one of the '
  + 'verified engineering tools listed below. Each tool is open-source '
  + 'or free-to-use under the indicated license; each claim shows the '
  + 'exact input passed to the tool. Anyone with the listed tool version '
  + 'can reproduce the same output from the same input. The ForgeOS PDF '
  + 'Engine v2 (proprietary) orchestrates the tools and renders this PDF '
  + 'but does not itself compute the engineering numbers.'
)

const DEFAULT_DISCLAIMER = (
  'Tool outputs are accurate within their documented operating domains. '
  + 'This design is an engineering reference; certified procurement '
  + 'requires separate engineer sign-off. Open-source license terms apply '
  + 'as indicated; full SPDX records are available on request.'
)

/**
 * Build the Tools-Used attribution page from a finished Contract.
 *
 * Walks every TypedQuantity in contract.quantities. For each quantity
 * sourced from a tool (`provenance.source` starts with 'tool:'), adds
 * it to the corresponding tool's claims list. Tools with zero claims
 * are omitted from the rendered page but listed in unused_tool_ids
 * for audit.
 *
 * @param planFlowEdges  Optional: edges derived from ClassToolPlan
 *   tool steps' `feeds_into` declarations. When provided, each claim's
 *   `input_summary` is replaced with a human-readable provenance string
 *   listing the upstream feeder tools — e.g. "inputs from: led-par:efficacy,
 *   plant-growth:yield, + brief" instead of "(none)". (U9-A / U9-B)
 */
export function buildToolsUsedPage(
  contract: ContractInProgress,
  planFlowEdges?: Array<{ from: string; to: string }>,
): ToolsUsedPage {
  // U9-B: invert the feeds_into edges to get each tool's upstream feeders.
  // e.g. if led-par:efficacy feeds_into ['hvac:load-sizing'], then
  // hvac:load-sizing's upstreamFeeders includes 'led-par:efficacy'.
  // Used to replace "(none)" with a real provenance string for each claim.
  const upstreamFeeders = new Map<string, string[]>()
  const normalised_edges: Array<{ from: string; to: string }> = planFlowEdges ?? []
  for (const edge of normalised_edges) {
    const existing = upstreamFeeders.get(edge.to) ?? []
    if (!existing.includes(edge.from)) existing.push(edge.from)
    upstreamFeeders.set(edge.to, existing)
  }

  const byTool = new Map<string, ToolAttributionEntry>()
  for (const [field, q] of Object.entries(contract.quantities)) {
    if (!isToolSourced(q)) continue
    const tid = q.provenance.tool_id ?? ''
    if (!tid) continue
    // 2026-05-23 (eVTOL chain 2 audit): provenance often omits tool_version
    // even though the registry has the canonical "1.0.0" for every wrapper.
    // The render then prints "vunknown" — confusing for a customer-facing
    // appendix. Look up missing fields from the live registry as a safety
    // net. Lazy require to avoid module cycles (registry imports types from
    // here).
    let registryLookup: any = null
    try {
      const { listTools } = require('./registry') as typeof import('./registry')
      for (const [rtId, rtTool] of listTools()) {
        if (rtId === tid) { registryLookup = rtTool; break }
      }
    } catch { /* registry not ready */ }
    let entry = byTool.get(tid)
    if (!entry) {
      entry = {
        tool_id: tid,
        tool_name: '',
        tool_version: q.provenance.tool_version ?? registryLookup?.version ?? 'unknown',
        tool_license: (q.provenance.tool_license ?? registryLookup?.license ?? 'free-proprietary') as License,
        tool_source_url: q.provenance.tool_source_url ?? registryLookup?.source_url ?? '',
        pinned_versions: q.provenance.pinned_versions ?? {},
        claims: [],
        total_duration_ms: 0,
        // Build #19d (2026-05-22): pull extended provenance fields from the
        // first quantity that carries them — every quantity from the same
        // tool_id should carry an identical extended block.
        tool_paper: q.provenance.tool_paper,
        tool_doi: q.provenance.tool_doi,
        physics_basis: q.provenance.physics_basis,
        physics_paper_doi: q.provenance.physics_paper_doi,
        confidence_class: q.provenance.confidence_class,
        embedded_constants: q.provenance.embedded_constants,
        last_reviewed_date: q.provenance.last_reviewed_date,
      }
      byTool.set(tid, entry)
    }
    // U9-B: prefer feeder-derived input summary over invocation_input.
    // If the plan declared feeds_into edges we know which upstream tools
    // produced the inputs for this tool — list them explicitly so the
    // Tools-Used appendix shows real dependencies instead of "(none)".
    const feeders = upstreamFeeders.get(tid)
    const inputSummary = feeders && feeders.length > 0
      ? `inputs from: ${feeders.join(', ')}${feeders.length > 0 ? ' + brief' : ''}`
      : summariseInput(q.provenance.invocation_input)
    entry.claims.push({
      field,
      value: q.value,
      unit: q.unit,
      input_summary: inputSummary,
      output_field: q.provenance.invocation_output_field ?? field,
    })
    entry.total_duration_ms += q.provenance.duration_ms ?? 0
  }

  // Lookup display names from the tool registry (lazy import to avoid
  // module cycle if attribution is imported before any tools register).
  // 2026-05-28: prefer the REGISTERED tool's real name over humanising the
  // tool_id. Class plans emit provenance without a tool_name, so the old
  // fallback humanised the id — e.g. 'octopart:parts-lookup' rendered as
  // "Octopart Parts Lookup" in the tools-flow diagram even though that id is
  // now the DB-backed distributor cascade. Pulling the registry name fixes the
  // misleading node label universally (every tool, not just this one).
  const registryNames = new Map<string, string>()
  try {
    const { listTools } = require('./registry') as typeof import('./registry')
    for (const [tid, tool] of listTools()) registryNames.set(tid, tool.name)
  } catch { /* registry not available — fall back to humanised ids below */ }
  // Attach each tool's worked calculations (captured on the contract by the executor)
  // so the renderer can show the maths. Universal: any tool whose Python emitted a
  // `worked` list is covered; tools without one get an empty array (no block shown).
  const allWorked: Record<string, any[]> = (contract as any).worked_calculations ?? {}
  for (const entry of byTool.values()) {
    if (!entry.tool_name) entry.tool_name = registryNames.get(entry.tool_id) || humaniseToolId(entry.tool_id)
    ;(entry as any).worked = Array.isArray(allWorked[entry.tool_id]) ? allWorked[entry.tool_id] : []
  }

  // Build #18m: list tools that are AVAILABLE in the registry but did
  // NOT contribute claims to this design. The reader sees the FULL
  // engineering-tool inventory and which subset was applicable.
  const used_tool_ids = new Set(byTool.keys())
  const available_but_unused: ToolsUsedPage['available_but_unused'] = []
  try {
    // Lazy import to avoid module cycle
    const { listTools } = require('./registry') as typeof import('./registry')
    for (const [tool_id, tool] of listTools()) {
      if (used_tool_ids.has(tool_id)) continue
      available_but_unused.push({
        tool_id,
        name: tool.name,
        version: tool.version,
        license: tool.license,
        source_url: tool.source_url,
        domain: tool.domain,
        what_it_does: TOOL_DESCRIPTIONS[tool_id] ?? '(no description registered)',
      })
    }
  } catch {
    // Registry not available — skip the unused-tools section
  }

  return {
    title: 'COMPUTATIONS BY VERIFIED ENGINEERING TOOLS',
    intro: DEFAULT_INTRO,
    tools: Array.from(byTool.values()).sort((a, b) => a.tool_id.localeCompare(b.tool_id)),
    available_but_unused,
    disclaimer: DEFAULT_DISCLAIMER,
    flow_edges: normalised_edges,
  }
}

function isToolSourced(q: TypedQuantity): boolean {
  // Defensive: legacy quantities don't carry provenance. Treat as
  // non-tool-sourced so they're skipped in the Tools-Used page.
  if (!q || typeof q !== 'object' || !q.provenance) return false
  return typeof q.provenance.source === 'string' && q.provenance.source.startsWith('tool:')
}

function summariseInput(input: unknown): string {
  if (input === null || input === undefined) return '(none)'
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    return String(input)
  }
  try {
    const json = JSON.stringify(input)
    return json.length > 120 ? json.slice(0, 117) + '...' : json
  } catch {
    return '(complex)'
  }
}

function humaniseToolId(id: string): string {
  // 'pybamm:cell-sizing' -> 'PyBaMM Cell Sizing'
  const parts = id.split(':')
  return parts.map(p => p.replace(/-/g, ' ').replace(/\b(\w)/g, (m) => m.toUpperCase())).join(' ')
}

/**
 * Render the attribution page as plain text (for log output or
 * console diagnostics). Production PDF rendering happens elsewhere.
 */
export function renderToolsUsedPageAsText(page: ToolsUsedPage): string {
  const lines: string[] = []
  lines.push(page.title)
  lines.push('')
  lines.push(page.intro)
  lines.push('')
  for (const tool of page.tools) {
    lines.push(`  ${tool.tool_name} v${tool.tool_version}  (${tool.tool_license})`)
    lines.push(`    ${tool.tool_source_url}`)
    for (const claim of tool.claims.slice(0, 12)) {
      const v = Number.isFinite(claim.value) ? claim.value.toLocaleString() : String(claim.value)
      lines.push(`      • ${claim.field} = ${v} ${claim.unit}  (from ${claim.output_field}; input: ${claim.input_summary})`)
    }
    if (tool.claims.length > 12) {
      lines.push(`      ... and ${tool.claims.length - 12} more claims`)
    }
    lines.push('')
  }
  // Build #18m: render the available-but-unused section
  if (page.available_but_unused.length > 0) {
    lines.push('')
    lines.push('TOOLS AVAILABLE IN THE ORCHESTRATOR BUT NOT USED FOR THIS DESIGN')
    lines.push('(these tools are wired in and can be invoked for other product classes')
    lines.push(' or for additional analyses; this design did not require their output)')
    lines.push('')
    for (const t of page.available_but_unused) {
      lines.push(`  ${t.name} v${t.version}  (${t.license}, ${t.domain})`)
      lines.push(`    ${t.source_url}`)
      lines.push(`    ${t.what_it_does}`)
      lines.push('')
    }
  }
  lines.push(page.disclaimer)
  return lines.join('\n')
}

// ─── U11 · Deterministic physics narrative ──────────────────────────────────
//
// Generates a prose section titled "How the design was computed — the physics"
// from ACTUAL contract quantities. Every sentence is emitted ONLY when all its
// source quantities are present; no sentence is emitted when a quantity is
// missing. No LLM is involved — this is a deterministic string built from
// numbers, addressing the narrative-drift problem (exit-code gates 5/11/18).
//
// The generator is intentionally generic: a sentence template lists the
// quantity keys it requires; the helper reads them from `quantities` and emits
// the interpolated sentence only when all keys resolve. VF phrasing is the
// first class; additional classes can add their own sentence lists.

export interface PhysicsNarrativeSentence {
  /** Required contract quantity keys. ALL must be present for the sentence to emit. */
  requires: string[]
  /** Tool id that produced the key quantities (cited in the sentence). */
  source_tool: string
  /** Render the sentence from resolved quantity values. */
  render: (vals: Record<string, number>) => string
}

/** A domain group within the physics narrative — a labelled paragraph of sentences. */
export interface PhysicsNarrativeGroup {
  /** Short domain label, e.g. "Thermal & energy". */
  label: string
  /** Emitted (non-skipped) sentences for this domain. */
  sentences: string[]
}

/** A complete physics narrative: a sequence of sentences with a heading. */
export interface PhysicsNarrative {
  heading: string
  sentences: string[]  // only the emitted (non-skipped) sentences — flat, for backward compat
  /** Domain-grouped paragraphs for richer rendering. Empty when no sentences emitted. */
  groups: PhysicsNarrativeGroup[]
  /** Tools cited, in emission order, deduped. */
  tools_cited: string[]
}

function fmt(n: number, dp = 1): string {
  if (!Number.isFinite(n)) return String(n)
  return n.toFixed(dp)
}

/**
 * Domain groupings for the VF physics narrative.  Each group lists the sentence
 * templates that belong to that labelled paragraph.  Sentences are still emitted
 * only when ALL required quantity keys are present — no fabrication.
 */
interface VFSentenceGroup {
  label: string
  sentences: PhysicsNarrativeSentence[]
}

/**
 * Vertical-farm physics causal chain — grouped by engineering domain.
 * Quantity keys are the EXACT keys present in orchestratorContract.quantities
 * (verified against ~/Downloads/bess-iter/iter-vf4/vf-container/state.json).
 */
const VF_PHYSICS_GROUPS: VFSentenceGroup[] = [
  // ── Thermal & energy ──────────────────────────────────────────────────────
  {
    label: 'Thermal & energy',
    sentences: [
      {
        requires: ['canopy_area_m2', 'led_ppfd_umol_m2_s', 'led_installed_power_kw'],
        source_tool: 'led-par:efficacy',
        render: (v) => (
          `The ${fmt(v.canopy_area_m2, 0)} m² canopy operates at ` +
          `${fmt(v.led_ppfd_umol_m2_s, 0)} µmol/m²/s PPFD, ` +
          `drawing ${fmt(v.led_installed_power_kw, 1)} kW of LED input ` +
          `(led-par:efficacy).`
        ),
      },
      {
        requires: ['led_installed_power_kw', 'led_heat_load_kw'],
        source_tool: 'led-par:efficacy',
        render: (v) => {
          const pct = Math.round((v.led_heat_load_kw / v.led_installed_power_kw) * 100)
          return (
            `About ${pct}% of that input (${fmt(v.led_heat_load_kw, 1)} kW) ` +
            `becomes sensible heat the HVAC must reject.`
          )
        },
      },
      {
        requires: ['plant_transpiration_kg_day', 'hvac_latent_load_kw'],
        source_tool: 'plant-growth:yield',
        render: (v) => (
          `The crop transpires ${fmt(v.plant_transpiration_kg_day, 0)} kg/day ` +
          `of moisture (plant-growth:yield), a ${fmt(v.hvac_latent_load_kw, 1)} kW ` +
          `latent load on the HVAC.`
        ),
      },
      {
        requires: ['hvac_total_load_kw', 'hvac_chiller_capacity_kw'],
        source_tool: 'hvac:load-sizing',
        render: (v) => (
          `Combined sensible + latent duty is ${fmt(v.hvac_total_load_kw, 1)} kW; ` +
          `applying a 1.20 safety margin sizes the chiller at ` +
          `${fmt(v.hvac_chiller_capacity_kw, 1)} kW cooling capacity ` +
          `(hvac:load-sizing).`
        ),
      },
      {
        requires: ['chiller_cop_cooling', 'chiller_compressor_power_kw'],
        source_tool: 'refrigeration-cycle:cop',
        render: (v) => (
          `The R290 vapour-compression cycle achieves COP ${fmt(v.chiller_cop_cooling, 2)} ` +
          `(refrigeration-cycle:cop via CoolProp), consuming ` +
          `${fmt(v.chiller_compressor_power_kw, 1)} kW at the compressor shaft.`
        ),
      },
      {
        requires: ['moisture_removed_kg_h'],
        source_tool: 'dehumidification:sizing',
        render: (v) => (
          `Dehumidification removes ${fmt(v.moisture_removed_kg_h, 1)} kg/h of ` +
          `vapour from the recirculated air stream ` +
          `(dehumidification:sizing).`
        ),
      },
      {
        requires: ['hx_effectiveness', 'hx_heat_transfer_kw'],
        source_tool: 'ht:ntu-heat-exchanger',
        render: (v) => (
          `A counter-flow heat exchanger achieves ${fmt(v.hx_effectiveness * 100, 0)}% ` +
          `effectiveness, recovering ${fmt(v.hx_heat_transfer_kw, 1)} kW of exhaust heat ` +
          `back into the supply air stream (ht:ntu-heat-exchanger).`
        ),
      },
      {
        requires: ['chiller_compressor_power_kw', 'led_installed_power_kw', 'total_electrical_kw'],
        source_tool: 'pandapower:grid-integration',
        render: (v) => (
          `The ${fmt(v.chiller_compressor_power_kw, 1)} kW compressor, ` +
          `${fmt(v.led_installed_power_kw, 1)} kW lighting, and ancillaries ` +
          `set the total connected load at ${fmt(v.total_electrical_kw, 1)} kW ` +
          `(pandapower:grid-integration).`
        ),
      },
      {
        requires: ['annual_yield_kg'],
        source_tool: 'plant-growth:yield',
        render: (v) => (
          `The crop model projects ${fmt(v.annual_yield_kg, 0)} kg/year of fresh ` +
          `produce from this canopy area and DLI regime ` +
          `(plant-growth:yield).`
        ),
      },
    ],
  },

  // ── Water & nutrients ──────────────────────────────────────────────────────
  {
    label: 'Water & nutrients',
    sentences: [
      {
        requires: ['irrigation_pump_flow_lpm', 'irrigation_pump_head_m', 'irrigation_pump_motor_kw'],
        source_tool: 'irrigation:pump-sizing',
        render: (v) => (
          `The irrigation pump delivers ${fmt(v.irrigation_pump_flow_lpm, 1)} L/min ` +
          `against ${fmt(v.irrigation_pump_head_m, 1)} m of head, ` +
          `requiring a ${fmt(v.irrigation_pump_motor_kw, 2)} kW motor ` +
          `(irrigation:pump-sizing).`
        ),
      },
      {
        requires: ['irrigation_pipe_pressure_drop_kpa'],
        source_tool: 'fluids:pipe-sizing',
        render: (v) => (
          `Pipe-friction analysis gives a distribution pressure drop of ` +
          `${fmt(v.irrigation_pipe_pressure_drop_kpa, 1)} kPa across the fertigation network ` +
          `(fluids:pipe-sizing).`
        ),
      },
      {
        requires: ['nutrient_target_ec_ms_cm', 'nutrient_target_ph'],
        source_tool: 'nutrient-solution:chemistry',
        render: (v) => (
          `The nutrient solution targets ${fmt(v.nutrient_target_ec_ms_cm, 1)} mS/cm ` +
          `conductivity at pH ${fmt(v.nutrient_target_ph, 1)}, ` +
          `sized by the crop's macro- and micro-nutrient uptake model ` +
          `(nutrient-solution:chemistry).`
        ),
      },
      {
        requires: ['nutrient_dosing_rate_ml_min'],
        source_tool: 'nutrient-solution:chemistry',
        render: (v) => (
          `Nutrient concentrate is dosed at ${fmt(v.nutrient_dosing_rate_ml_min, 1)} mL/min ` +
          `to maintain target conductivity (nutrient-solution:chemistry).`
        ),
      },
    ],
  },

  // ── Biology & atmosphere ───────────────────────────────────────────────────
  {
    label: 'Biology & atmosphere',
    sentences: [
      {
        requires: ['co2_consumption_kg_day', 'co2_tank_size_kg'],
        source_tool: 'co2-enrichment:sizing',
        render: (v) => (
          `CO₂ enrichment consumes ${fmt(v.co2_consumption_kg_day, 2)} kg/day; ` +
          `a ${fmt(v.co2_tank_size_kg, 0)} kg bulk tank provides the on-site buffer ` +
          `(co2-enrichment:sizing).`
        ),
      },
      {
        requires: ['uvc_target_dose_mj_cm2', 'uvc_lamps_required'],
        source_tool: 'pest-control:uvc-dose',
        render: (v) => (
          `Pathogen control requires a UV-C delivered dose of ` +
          `${fmt(v.uvc_target_dose_mj_cm2, 0)} mJ/cm², achieved by ` +
          `${Math.round(v.uvc_lamps_required)} lamps in the recirculation duct ` +
          `(pest-control:uvc-dose).`
        ),
      },
    ],
  },

  // ── Structure, cost & compliance ──────────────────────────────────────────
  {
    label: 'Structure, cost & compliance',
    sentences: [
      {
        requires: ['total_system_mass_kg', 'max_mass_kg', 'mass_budget_utilisation_pct'],
        source_tool: 'mass-aggregator:envelope-check',
        render: (v) => (
          `All components aggregate to ${fmt(v.total_system_mass_kg, 0)} kg — ` +
          `${fmt(v.mass_budget_utilisation_pct, 1)}% of the ` +
          `${fmt(v.max_mass_kg, 0)} kg envelope allowance ` +
          `(mass-aggregator:envelope-check).`
        ),
      },
      {
        requires: ['economics_npv_gbp', 'economics_payback_years', 'economics_capex_gbp'],
        source_tool: 'yield-economics:npv',
        render: (v) => (
          `Net present value is £${Math.round(v.economics_npv_gbp).toLocaleString()} ` +
          `on a £${Math.round(v.economics_capex_gbp).toLocaleString()} capital investment, ` +
          `with a ${fmt(v.economics_payback_years, 1)}-year payback ` +
          `(yield-economics:npv).`
        ),
      },
      {
        requires: ['economics_irr_pct'],
        source_tool: 'yield-economics:npv',
        render: (v) => (
          `The internal rate of return is ${fmt(v.economics_irr_pct, 1)}% ` +
          `(yield-economics:npv).`
        ),
      },
      {
        requires: ['lca_total_co2_kg', 'lca_co2_per_kg_product'],
        source_tool: 'lifecycle-co2:assessment',
        render: (v) => (
          `Lifecycle carbon totals ${fmt(v.lca_total_co2_kg / 1000, 1)} t CO₂e ` +
          `(${fmt(v.lca_co2_per_kg_product, 1)} kg CO₂e per kg of produce) ` +
          `over the design life (lifecycle-co2:assessment).`
        ),
      },
      {
        requires: ['reliability_system_mtbf_hours'],
        source_tool: 'reliability-fmea:system',
        render: (v) => (
          `System-level failure-mode analysis gives a mean time between failures of ` +
          `${Math.round(v.reliability_system_mtbf_hours).toLocaleString()} hours ` +
          `(reliability-fmea:system).`
        ),
      },
      {
        requires: ['transport_transit_days', 'transport_shipping_cost_gbp'],
        source_tool: 'transport-logistics:routing',
        render: (v) => {
          const costStr = v.transport_shipping_cost_gbp > 0
            ? ` at a shipping cost of £${Math.round(v.transport_shipping_cost_gbp).toLocaleString()}`
            : ''
          return (
            `Logistics routing sets a ${Math.round(v.transport_transit_days)}-day transit window` +
            `${costStr} to the delivery site ` +
            `(transport-logistics:routing).`
          )
        },
      },
    ],
  },
]

/**
 * Resolve a quantity value from the contract. Returns undefined when absent.
 */
function resolveQty(quantities: Record<string, any>, key: string): number | undefined {
  const q = quantities[key]
  if (q && typeof q === 'object' && typeof q.value === 'number' && Number.isFinite(q.value)) {
    return q.value
  }
  return undefined
}

/**
 * Generate a deterministic physics narrative section from contract quantities.
 *
 * @param quantities   The `contract.quantities` map (Record<string, TypedQuantity>).
 * @param productClass Optional product class — chooses the sentence set.
 *                     Defaults to 'vertical-farm' (the only class currently wired).
 *
 * Returns null when no quantities are present (no orchestrator run for this
 * chain) so the renderer can skip the section cleanly.
 */
export function generatePhysicsNarrative(
  quantities: Record<string, any>,
  productClass?: string,
  systemLevelToolIds?: Set<string> | null,
): PhysicsNarrative | null {
  if (!quantities || typeof quantities !== 'object') return null

  // VF gets the hand-curated causal prose below. EVERY OTHER class gets the
  // UNIVERSAL data-driven narrative (2026-05-31) — walks each quantity's tool
  // provenance so the section renders for all 35 classes, not just VF. This was
  // VF-only ("the only class currently wired") until now.
  //
  // 2026-06-04 (physics-narrative prune): the per-module "How this is computed"
  // worked blocks now render each module-owned tool's maths WITH its module, so
  // listing every tool's quantities up front duplicated the pressure-vessel /
  // reactor / agitation / fluids / pump lines both here AND at their module. The
  // renderer passes the system-level tool-id set (the complement of the
  // per-module routing) so this front section is pruned to the cross-cutting
  // whole-plant tools only (mass-aggregator, lifecycle-co2, dac-regeneration,
  // property look-ups). When the set is absent (legacy callers / older state) the
  // full universal narrative is emitted, preserving backward behaviour.
  const classKey = (productClass ?? '').toLowerCase()
  const isVF = classKey.includes('vertical') || classKey.includes('farm')
  if (!isVF) return generateUniversalPhysicsNarrative(quantities, systemLevelToolIds)

  const allSentences: string[] = []
  const toolsCited: string[] = []
  const groups: PhysicsNarrativeGroup[] = []

  for (const group of VF_PHYSICS_GROUPS) {
    const groupSentences: string[] = []
    for (const tpl of group.sentences) {
      // Resolve all required quantities.
      const vals: Record<string, number> = {}
      let allPresent = true
      for (const key of tpl.requires) {
        const v = resolveQty(quantities, key)
        if (v === undefined) { allPresent = false; break }
        vals[key] = v
      }
      if (!allPresent) continue  // skip sentence — no fabrication

      const sentence = tpl.render(vals)
      groupSentences.push(sentence)
      allSentences.push(sentence)
      if (!toolsCited.includes(tpl.source_tool)) toolsCited.push(tpl.source_tool)
    }
    if (groupSentences.length > 0) {
      groups.push({ label: group.label, sentences: groupSentences })
    }
  }

  if (allSentences.length === 0) return null

  return {
    heading: 'How the design was computed — the physics',
    sentences: allSentences,
    groups,
    tools_cited: toolsCited,
  }
}

// ── Universal physics narrative (2026-05-31) ─────────────────────────────────
// Class-agnostic "how the design was computed" — for every class that is NOT
// hand-curated above. Reads each contract quantity's provenance.tool_id and
// groups the computed quantities by the tool that produced them, so the section
// renders for all 35 classes from the data the orchestrator already records.
// No fabrication: only quantities that carry a real tool provenance + a finite
// numeric value are included.

const TOOL_DISPLAY_PREFIX: Record<string, string> = {
  pybamm: 'PyBaMM', coolprop: 'CoolProp', ngspice: 'ngspice', pandapower: 'pandapower',
  psychrolib: 'PsychroLib', fluids: 'Fluids', ht: 'Heat-Transfer', hvac: 'HVAC',
  'arc-flash': 'Arc-Flash IEEE 1584', g99: 'G99 Compliance', 'protection-coordination': 'Protection Coordination',
  thermal: 'Thermal', refrigeration: 'Refrigeration Cycle', 'plant-growth': 'Crop-Growth Model',
  irrigation: 'Irrigation Sizing', dehumidification: 'Dehumidification', 'co2-enrichment': 'CO2 Enrichment',
  'nutrient-solution': 'Nutrient Solution', 'led-par': 'LED PAR', sizing: 'Sizing',
}
const PHYS_ACRONYMS = new Set(['dc', 'ac', 'bms', 'pcs', 'soc', 'dod', 'hvac', 'led', 'co2', 'ppfd', 'emc', 'rpn', 'mppt', 'igbt', 'pv', 'ev', 'iso', 'ip', 'ntc', 'afe', 'iec', 'ul', 'nfpa', 'g99', 'pcc', 'cop', 'par', 'dli'])

function titleCasePhys(s: string): string {
  return s.split(/\s+/).map(w => (PHYS_ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
}

function toolDisplayName(toolId: string): string {
  const [prefix, ...rest] = toolId.split(':')
  const head = TOOL_DISPLAY_PREFIX[prefix] ?? titleCasePhys(prefix.replace(/[-_]+/g, ' '))
  const tail = rest.join(' ').replace(/[-_]+/g, ' ').trim()
  return tail ? `${head} (${titleCasePhys(tail)})` : head
}

function humanisePhysKey(key: string): string {
  const noUnit = key.replace(/_(v|a|w|c|m|l|mm|m2|wh|kw|kwh|mwh|gwh|kg|kva|mva|hz|khz|mhz|kv|ka|ma|pct|gbp|cycles|years|days|barg|bar|kpa|mpa|lpm|rpm|kj_kgk|wh_kg|deg_c)$/i, '')
  return noUnit.split('_').filter(Boolean).map(w => (PHYS_ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w)).join(' ').trim()
}

function formatPhysVal(value: number, unit: string): string {
  const u = unit && unit.trim() ? ` ${unit.trim()}` : ''
  const n = Math.abs(value) >= 100
    ? Math.round(value).toLocaleString('en-GB')
    : value.toLocaleString('en-GB', { maximumFractionDigits: 2 })
  return `${n}${u}`
}

function generateUniversalPhysicsNarrative(
  quantities: Record<string, any>,
  systemLevelToolIds?: Set<string> | null,
): PhysicsNarrative | null {
  const byTool = new Map<string, { display: string; items: string[] }>()
  const order: string[] = []

  for (const [key, q] of Object.entries(quantities)) {
    if (!q || typeof q !== 'object') continue
    const toolId: unknown = (q as any).provenance?.tool_id
    // Only real tool-computed quantities. Tool ids look like 'pybamm:cell-sizing';
    // brief-/emitter-/contract-sourced values are excluded so this reflects the
    // TOOLS' calculations, not restated inputs.
    if (typeof toolId !== 'string' || !toolId.includes(':') || /^(brief|emitter|contract|user|derived)/i.test(toolId)) continue
    // 2026-06-04 (physics-narrative prune): when a system-level allowlist is
    // supplied, skip module-owned tools — their worked maths now renders WITH
    // their module, so the front section keeps only the cross-cutting whole-plant
    // tools (the complement of the per-module routing). A non-empty set acts as a
    // strict allowlist; an empty or absent set means "no pruning" (legacy state /
    // a design where every tool maps to a module would otherwise blank the page).
    if (systemLevelToolIds && systemLevelToolIds.size > 0 && !systemLevelToolIds.has(toolId)) continue
    const value: unknown = (q as any).value
    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) continue
    const unit: string = typeof (q as any).unit === 'string' ? (q as any).unit : ''

    if (!byTool.has(toolId)) { byTool.set(toolId, { display: toolDisplayName(toolId), items: [] }); order.push(toolId) }
    byTool.get(toolId)!.items.push(`${humanisePhysKey(key)} = ${formatPhysVal(value, unit)}`)
  }

  if (byTool.size === 0) return null

  const groups: PhysicsNarrativeGroup[] = []
  const sentences: string[] = []
  const toolsCited: string[] = []
  for (const toolId of order) {
    const t = byTool.get(toolId)!
    if (t.items.length === 0) continue
    const items = t.items.slice(0, 12) // cap overlong tool lists
    const more = t.items.length > 12 ? `, and ${t.items.length - 12} more` : ''
    const sentence = `${t.display} computed ${items.join(', ')}${more}.`
    groups.push({ label: t.display, sentences: [sentence] })
    sentences.push(sentence)
    toolsCited.push(toolId)
  }
  if (sentences.length === 0) return null

  return {
    heading: 'How the design was computed — the physics',
    sentences,
    groups,
    tools_cited: toolsCited,
  }
}
