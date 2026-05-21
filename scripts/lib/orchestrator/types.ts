/**
 * scripts/lib/orchestrator/types.ts
 *
 * UNIVERSAL ENGINEERING ORCHESTRATOR — core type definitions.
 *
 * Per 6-seat round-3 council verdict 2026-05-21 (drawer
 * drawer_forgeos_decisions_98d0586eb00a5c7f) refined by LLM-position
 * commitment (drawer drawer_forgeos_decisions_b6ca90761c861622):
 *
 *   - LLM appears at exactly 2 boundary roles: brief parser + prose narrator
 *   - Each LLM use is sandwiched between deterministic validators
 *   - Envelope detection: rules-only (no LLM)
 *   - Tool plan selection: static lookup table per (class, envelope)
 *   - Tool-to-tool integration: typed schemas, cross-tool consistency verifier
 *   - Iterative solver framework for coupled physics
 *   - Field-level provenance (tool:id:version:output_field:unit)
 *
 * Phase 0 investigation (drawer drawer_forgeos_decisions_38d21ae00d436a9b,
 * deliverable /tmp/phase-0-investigation.md) validated 68.2% of Physics
 * Critic plausibility issues are tool-addressable — well above the 50%
 * gate threshold. Phase 1 cleared.
 *
 * This file defines the type vocabulary every other file in
 * `scripts/lib/orchestrator/` consumes.
 */

// ---------------------------------------------------------------------------
// TYPED QUANTITY — every numerical field in the EngineeringContract carries
// units + uncertainty + basis + scope + temporal resolution + provenance.
// This is the schema GLM-5.1 mandated: "Without a FORMAL SCHEMA for contracts
// — units, uncertainty, basis, scope, temporal resolution — you've just
// moved the 1424-line template into 1424 lines of ad-hoc conversion glue."
// ---------------------------------------------------------------------------

export type UnitFamily =
  | 'energy' | 'power' | 'mass' | 'time' | 'length' | 'area' | 'volume'
  | 'force' | 'pressure' | 'temperature' | 'velocity' | 'flow_rate'
  | 'photon_flux_density' | 'currency' | 'yield' | 'frequency'
  | 'voltage' | 'current' | 'resistance' | 'capacitance' | 'inductance'
  | 'angle' | 'angular_velocity' | 'thermal_conductivity'
  | 'specific_heat' | 'viscosity' | 'density' | 'concentration'
  | 'sound_pressure' | 'permeability' | 'dimensionless'

export type QuantityBasis =
  // Energy
  | 'nameplate' | 'usable' | 'gross' | 'net'
  // Power
  | 'continuous' | 'peak' | 'rated' | 'derated' | 'instantaneous'
  // Electrical
  | 'AC' | 'DC' | 'phase' | 'line' | 'rms' | 'peak_to_peak'
  // Mass
  | 'empty' | 'gross_takeoff' | 'payload' | 'fuel' | 'dry'
  // Area
  | 'canopy' | 'wing' | 'aperture' | 'footprint' | 'gross_building' | 'cross_section'
  // Cost (for currency family)
  | 'raw_BoM' | 'factory_COGS' | 'OEM_transfer' | 'channel_list' | 'installed_ASP'
  // Time
  | 'cycle' | 'lifetime' | 'mtbf' | 'duration'
  // Generic
  | 'min' | 'max' | 'typical' | 'mean' | 'median' | 'p50' | 'p95'

export type QuantityScope =
  | 'cell' | 'module' | 'pack' | 'rack' | 'string' | 'system' | 'site'
  | 'envelope' | 'subassembly' | 'component' | 'global'

/**
 * The fundamental quantity type. Replaces the legacy `Quantity` in
 * engineering-contract.ts. Migration is mechanical — every existing
 * `q(...)` call gains the new fields.
 */
export interface TypedQuantity {
  /** The numerical value in the declared unit. */
  value: number

  /** Canonical SI unit string. Examples: 'kWh', 'kg', 'A', 'V', '°C', 'm²'. */
  unit: string

  /** The dimensional family this quantity belongs to. Used by the
   *  cross-tool consistency verifier to enforce unit compatibility. */
  family: UnitFamily

  /** What aspect of the underlying physical quantity this value
   *  represents (nameplate vs usable, peak vs continuous, etc.). */
  basis: QuantityBasis

  /** The structural scope this quantity applies to. */
  scope: QuantityScope

  /** Symmetric uncertainty as a percentage. e.g. 2.5 for ±2.5%. */
  uncertainty_pct: number

  /** Sampling interval in seconds for time-series quantities. null for
   *  static scalars. */
  temporal_resolution_s: number | null

  /** Free-text qualifier (e.g. '25°C ambient, BoL', 'A2/W35'). */
  condition: string | null

  /** Field-level provenance: where this value came from. The cross-tool
   *  consistency verifier reads this to detect orphan quantities. */
  provenance: Provenance
}

// ---------------------------------------------------------------------------
// PROVENANCE — field-level. Every TypedQuantity must declare its source.
// Used by attribution renderer (PDF end-page) + cross-tool verifier
// (detects orphan quantities + unauthorised mutations).
// ---------------------------------------------------------------------------

export type ProvenanceSource =
  | 'brief'                  // extracted from parsed brief
  | 'envelope_detector'      // computed by rules-based envelope detection
  | 'class_anchor'           // class-specific default constant
  | 'physics_constant'       // universal constant (g=9.81, ρ_air=1.225)
  | `tool:${string}`         // computed by a registered tool (id format)
  | 'aggregator'             // computed by Contract aggregator (e.g. ratios)
  | 'closure_validator'      // computed by a closure invariant
  | 'narrator'               // EMITTED BY NARRATOR — should not appear in
                             // structural fields; prose-number validator
                             // rejects designs where narrator-source
                             // quantities exist outside prose fields

export interface Provenance {
  /** The kind of source. For tool-sourced values, format is
   *  `tool:<tool_id>` (e.g. `tool:pybamm:cell-sizing`). */
  source: ProvenanceSource

  /** For tool sources: tool registry ID. Otherwise undefined. */
  tool_id?: string

  /** Pinned tool version (e.g. '23.5'). */
  tool_version?: string

  /** SPDX license identifier (e.g. 'BSD-3-Clause', 'MIT', 'GPL-3.0'). */
  tool_license?: License

  /** Canonical source URL for the tool. */
  tool_source_url?: string

  /** The exact input passed to the tool. Reproducible by anyone with
   *  the same tool version. */
  invocation_input?: unknown

  /** The specific output field this quantity is from. e.g. 'cell_count',
   *  'voltage_profile_at_05c[0].voltage_v'. */
  invocation_output_field?: string

  /** Pinned versions of every dependency the tool transitively used.
   *  e.g. {python: '3.11.4', pybamm: '23.5', numpy: '1.26.0'}. */
  pinned_versions?: Record<string, string>

  /** Wall-clock time the tool was invoked (ISO 8601). */
  timestamp?: string

  /** How long the invocation took, in milliseconds. */
  duration_ms?: number
}

export type License =
  | 'MIT' | 'BSD-2-Clause' | 'BSD-3-Clause' | 'Apache-2.0'
  | 'LGPL-2.1' | 'LGPL-3.0' | 'GPL-2.0' | 'GPL-3.0'
  | 'MPL-2.0' | 'CC-BY-4.0' | 'CC0-1.0'
  | 'free-proprietary'        // free to use but not open-source (e.g. LTSpice)
  | 'proprietary'             // paid / restricted

// ---------------------------------------------------------------------------
// BRIEF ENVELOPE — the structured tuple that gates which (class, scale,
// voltage, form_factor, application) deterministic emitter applies to.
// Computed by `scripts/lib/orchestrator/envelope.ts` from parsed brief
// using RULES ONLY (no LLM). Brief-shape gating is the unanimous council
// requirement (drawer drawer_forgeos_gotchas_b455d6d2555849aa).
// ---------------------------------------------------------------------------

export interface BriefEnvelope {
  /** Product class slug (matches the classifier output: 'bess', 'haps',
   *  'vertical_farm', 'thermal_system', 'wearable_medical', 'drone',
   *  'auv', 'bioreactor', 'edge_ai_server', 'ev_charger', etc.). */
  class: string

  /** Class-specific size tier. Examples:
   *  BESS: 'residential' | 'commercial' | 'utility_containerised' | 'utility_farm'
   *  HAPS: 'small' (<25m) | 'medium' (25-60m) | 'large' (>60m)
   *  Heat pump: 'residential' | 'light_commercial' | 'commercial' | 'industrial'
   *  EV charger: 'ac_slow' | 'dc_fast' | 'ultra_fast' | 'megawatt'
   */
  scale_tier: string

  /** Electrical voltage tier. */
  voltage_tier: 'extra_low' | 'low' | 'medium' | 'high' | 'extra_high'

  /** Form factor / packaging. Examples:
   *  BESS: 'rack_19in' | 'cabinet' | 'half_container' | 'container_20ft'
   *        | 'container_40ft' | 'container_40hc' | 'multi_container'
   *  HAPS: 'fixed_wing' | 'lighter_than_air'
   *  Heat pump: 'monobloc' | 'split' | 'multi_split' | 'vrv_vrf'
   *  EV charger: 'pedestal' | 'wall_mount' | 'kiosk' | 'gantry'
   */
  form_factor: string

  /** Application context. Class-specific. Examples:
   *  BESS: 'behind_the_meter' | 'front_of_meter' | 'micro_grid' | 'off_grid'
   *  HAPS: 'civilian_telecom' | 'commercial_earth_obs' | 'military_isr'
   *  Heat pump: 'residential_dhw' | 'commercial_retrofit' | 'industrial_process'
   */
  application: string

  /** Scale-tier-derived nameplate in kWh (or equivalent class metric).
   *  Allows ad-hoc range checks in tool applicability predicates. */
  nameplate_kwh?: number

  /** Voltage class numeric in V (helpful for tool routing). */
  voltage_class_v?: number
}

// ---------------------------------------------------------------------------
// PARSED CONSTRAINTS — the structured brief output that the envelope
// detector reads. Replaces ad-hoc untyped objects with a contract.
// ---------------------------------------------------------------------------

export interface ParsedConstraints {
  product_class: string
  product_description: string
  target_performance?: { value: number; unit: string }
  max_mass_kg?: { value: number }
  max_dimensions_mm?: { w?: number; d?: number; h?: number }
  unit_cost_ceiling?: { value: number; currency: string }
  operating_temp_min_c?: number
  operating_temp_max_c?: number
  voltage_class_v?: number
  application_context?: string
  region?: 'EU' | 'UK' | 'US' | 'CA' | 'ROW'
  /** Free-form additional fields the brief parser extracted. */
  extra?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// TOOL — the engineering computation unit. Each tool wraps an external
// program (PyBaMM, ngspice, CoolProp, etc.) via subprocess, Python lib,
// or REST API. Tools are PURE in the sense that same input + same pinned
// versions → same output.
// ---------------------------------------------------------------------------

export type ToolDomain =
  | 'battery'                // PyBaMM, batteryarchive
  | 'thermal'                // CoolProp, OpenFOAM, SU2
  | 'power_electronics'      // ngspice, LTSpice
  | 'mechanical'             // CalculiX, code_aster, Elmer
  | 'grid'                   // OpenDSS, PandaPower, GridLAB-D
  | 'aero'                   // OpenVSP, XFOIL, AVL
  | 'process'                // Cantera, DWSIM, COCO
  | 'biochemistry'           // BioSTEAM, Cantera kinetics
  | 'parts_catalog'          // Octopart, Digi-Key, Mouser
  | 'standards'              // IEC, UL, NFPA, ENA, ASME
  | 'photonics'              // LED efficacy, sunlight modelling
  | 'control_systems'        // ArduPilot SITL, PX4
  | 'cad'                    // FreeCAD, OpenCascade
  | 'pcb'                    // KiCad

export interface Tool<TInput = unknown, TOutput = unknown> {
  /** Registry-unique identifier. Convention: '<tool-name>:<sub-capability>'.
   *  Examples: 'pybamm:cell-sizing', 'coolprop:refrigerant-properties',
   *  'ngspice:pcs-simulation', 'octopart:parts-lookup'. */
  id: string

  /** Human-readable name for attribution display. */
  name: string

  /** Pinned version string. Reproducibility depends on this. */
  version: string

  license: License

  /** Canonical URL where the tool's source/docs live. */
  source_url: string

  /** Engineering domain this tool serves. */
  domain: ToolDomain

  /** Pinned versions of every transitively-loaded dependency. Captured
   *  in ToolResult.provenance.pinned_versions per invocation. */
  pinned_environment: Record<string, string>

  /** Returns true if this tool is applicable to the given envelope +
   *  partial Contract. The orchestrator's tool plan validator calls
   *  this; if it returns false for a tool the plan declares, the plan
   *  is rejected. */
  applicable_to(envelope: BriefEnvelope, contract: PartialContract): boolean

  /** Invoke the tool with the given input. Returns a ToolResult with
   *  provenance + output OR an error. The orchestrator's executor
   *  drives this. */
  invoke(input: TInput, contract: PartialContract): Promise<ToolResult<TOutput>>
}

export interface ToolResult<TOutput = unknown> {
  /** True iff the tool produced a usable output. False on error,
   *  timeout, or schema-rejection of the output. */
  ok: boolean

  /** The structured output. null on failure. Type is tool-specific. */
  output: TOutput | null

  /** Field-level provenance for every output field. Provenance.source
   *  is `tool:<id>`. */
  provenance: Provenance

  /** Soft issues that did not fail the tool but should be surfaced:
   *  e.g. "extrapolating beyond tested range", "approximation only
   *  accurate to ±10%". Carried into the design as warnings. */
  warnings: string[]

  /** Hard failure description. Populated iff `ok === false`. */
  error?: string
}

// ---------------------------------------------------------------------------
// TOOL PLAN — the static lookup-table that maps (class, envelope) to an
// ordered sequence of tools. Defined per class in
// `scripts/lib/orchestrator/class-plans/<class>.ts`. NO LLM CHOICE —
// the plan is deterministic given the envelope.
// ---------------------------------------------------------------------------

export interface ToolStep {
  /** Tool registry ID this step invokes. */
  tool_id: string

  /** Derive the tool's input from the (partial) Contract + brief.
   *  Pure function. */
  input_from_contract: (
    c: PartialContract,
    brief: ParsedConstraints,
  ) => unknown

  /** Update the Contract with the tool's output. Pure function. */
  contract_update: (
    c: ContractInProgress,
    output: unknown,
  ) => ContractInProgress

  /** If true, tool failure halts the entire plan. If false, the plan
   *  continues without this tool's contribution. */
  required: boolean

  /** Tool IDs that depend on this step's output. Used by the iterative
   *  solver to detect coupling and trigger fixed-point iteration. */
  feeds_into: string[]
}

export interface ClassToolPlan {
  /** Human-readable plan ID. */
  id: string

  /** Predicate: does this plan apply to the given envelope? */
  envelope_predicate: (e: BriefEnvelope) => boolean

  /** Ordered tool steps. Independent steps run once; coupled steps
   *  (see coupled_pairs) run within the fixed-point loop. */
  tools: ToolStep[]

  /** Pairs of tool IDs that exhibit physical coupling (Tool A's output
   *  affects Tool B's input which can affect Tool A's input). The
   *  executor runs these inside a fixed-point iteration. */
  coupled_pairs: Array<[string, string]>

  /** Maximum iterations of the fixed-point solver. */
  max_iterations: number

  /** Convergence tolerance: when max relative change across coupled
   *  quantities is below this fraction, declare convergence. */
  convergence_tolerance_pct: number

  /** Class-specific consistency rules applied AFTER all tools have run.
   *  Failure rejects the entire tool bundle. */
  consistency_rules: ConsistencyRule[]
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULE — the cross-tool verifier that Grok required as the
// "external verifier with write access to canonical state." Reads the
// completed Contract + raw tool results, returns pass/fail with detail.
// ---------------------------------------------------------------------------

export interface ConsistencyRule {
  /** Stable ID for regression-harness tracking. */
  id: string

  /** Human-readable description of what this rule enforces. */
  description: string

  /** Pure check. Reads the Contract + tool results, returns a result. */
  check(
    contract: ContractInProgress,
    tool_results: Map<string, ToolResult<unknown>>,
  ): ConsistencyResult
}

export interface ConsistencyResult {
  passed: boolean

  /** Short description of pass condition OR failure mode. */
  detail: string

  /** Contract quantity keys (e.g. 'cell_count', 'thermal_rejection_min_kw')
   *  involved in this check. Used for traceability. */
  affected_quantities: string[]

  /** Tool registry IDs whose outputs this check evaluated. */
  affected_tools: string[]

  /** Severity classification. */
  severity: 'fatal' | 'warning' | 'info'
}

// ---------------------------------------------------------------------------
// CONTRACT — the typed-quantity-rich descendant of the existing
// EngineeringContract in engineering-contract.ts. ContractInProgress
// accumulates as tools run; the final aggregated form is Contract.
// ---------------------------------------------------------------------------

export interface ContractInProgress {
  product_class: string
  brief_summary: string
  envelope: BriefEnvelope

  /** All numerical quantities. Keyed by canonical name
   *  (e.g. 'cell_count', 'thermal_rejection_min_kw'). */
  quantities: Record<string, TypedQuantity>

  /** Topology edges (typed constraints between sub-modules). */
  topology: TopologyEdge[]

  /** Closure status: per-invariant pass/warn/fail. */
  closures: ContractClosureResult[]

  /** Macro-assembly pricing (large items with envelope-scaled cost). */
  macro_assembly_prices: MacroAssemblyPrice[]

  /** Diagnostic: tools that have run so far (in order). Used by the
   *  executor for fixed-point iteration tracking. */
  _tools_run: string[]
}

/** Alias for the completed Contract after all tools + verifier passed. */
export type Contract = ContractInProgress

/** Read-only view for use by tool.applicable_to and
 *  tool.invoke (the Contract is not mutated; tools return updates). */
export type PartialContract = Readonly<ContractInProgress>

// ---------------------------------------------------------------------------
// LEGACY-COMPATIBLE TYPES — keep parity with engineering-contract.ts
// so the orchestrator and legacy chain share data structures.
// ---------------------------------------------------------------------------

export interface TopologyEdge {
  from_part: string
  to_part: string
  mechanism:
    | 'electrical_bus' | 'fluid_loop' | 'thermal' | 'mechanical'
    | 'data' | 'control' | 'optical' | 'acoustic'
  constraint_kind:
    | 'current_rating' | 'voltage_rating' | 'thermal_rejection'
    | 'flow_capacity' | 'mass_carry' | 'data_bandwidth'
    | 'material_compatibility' | 'pressure_rating' | 'noise_attenuation'
  required_value?: number
  required_unit?: string
  required_margin_factor?: number
  material_context?: string
}

export interface ContractClosureResult {
  invariant_id: string
  status: 'pass' | 'warn' | 'fail'
  measured: TypedQuantity | number | null
  required: TypedQuantity | number | string
  reason: string
}

export interface MacroAssemblyPrice {
  word_name: string
  unit_price_gbp: number
  dimension_basis:
    | 'metre_length' | 'metre_wingspan' | 'square_metre'
    | 'kwh_capacity' | 'litre_volume' | 'cubic_metre' | 'kg_mass'
    | 'cell_count' | 'kw_power' | 'each'
  dimension_value: number
  total_gbp: number
  source_detail: string
}

// ---------------------------------------------------------------------------
// EXECUTION OUTCOME — what the orchestrator returns to the chain.
// ---------------------------------------------------------------------------

export interface OrchestratorResult {
  /** True iff every required tool ran successfully AND the cross-tool
   *  consistency verifier passed AND the Contract is complete. */
  ok: boolean

  /** The final Contract. Even on partial failure, this contains
   *  whatever was successfully computed for diagnostics. */
  contract: ContractInProgress

  /** Per-tool raw results, indexed by tool_id. */
  tool_results: Map<string, ToolResult<unknown>>

  /** Consistency rule outcomes. */
  consistency_results: ConsistencyResult[]

  /** How many fixed-point iterations the solver took. */
  iterations: number

  /** Reasons the orchestrator could not complete (only populated on
   *  failure). Each entry references a specific tool, rule, or stage. */
  failures: string[]

  /** True iff the chain should fall back to the legacy LLM Generator
   *  path. Set when no plan matches the envelope OR tool plan validator
   *  rejects OR consistency verifier produces a fatal failure. */
  fallback_to_llm: boolean
}

// ---------------------------------------------------------------------------
// HELPER FACTORIES
// ---------------------------------------------------------------------------

/** Construct a TypedQuantity with sensible defaults. */
export function tq(
  value: number,
  unit: string,
  family: UnitFamily,
  basis: QuantityBasis,
  scope: QuantityScope,
  provenance: Provenance,
  opts?: { uncertainty_pct?: number; temporal_resolution_s?: number | null; condition?: string },
): TypedQuantity {
  return {
    value,
    unit,
    family,
    basis,
    scope,
    uncertainty_pct: opts?.uncertainty_pct ?? 0,
    temporal_resolution_s: opts?.temporal_resolution_s ?? null,
    condition: opts?.condition ?? null,
    provenance,
  }
}

/** Construct a Provenance record for a brief-derived value. */
export function provFromBrief(briefPath: string): Provenance {
  return { source: 'brief', invocation_output_field: briefPath }
}

/** Construct a Provenance record for a class-anchor constant. */
export function provFromAnchor(detail: string): Provenance {
  return { source: 'class_anchor', invocation_output_field: detail }
}

/** Construct a Provenance record for a physics constant. */
export function provFromConstant(detail: string): Provenance {
  return { source: 'physics_constant', invocation_output_field: detail }
}

/** Construct a Provenance record for a tool-sourced value. */
export function provFromTool(
  toolId: string,
  outputField: string,
  toolVersion: string,
  toolLicense: License,
  sourceUrl: string,
  pinnedVersions: Record<string, string>,
  invocationInput: unknown,
  durationMs: number,
): Provenance {
  return {
    source: `tool:${toolId}` as ProvenanceSource,
    tool_id: toolId,
    tool_version: toolVersion,
    tool_license: toolLicense,
    tool_source_url: sourceUrl,
    invocation_input: invocationInput,
    invocation_output_field: outputField,
    pinned_versions: pinnedVersions,
    timestamp: new Date().toISOString(),
    duration_ms: durationMs,
  }
}
