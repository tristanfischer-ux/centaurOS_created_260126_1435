/**
 * @file module-decomposition.ts — Type contracts for Iter 3 (Stage 1.5).
 *
 * SKELETON ONLY — no runtime code, no implementations.
 * This file declares the contracts the new Stage 1.5 (Module Decomposition)
 * produces and the per-module Stage 2 path consumes.
 *
 * Design doc: ../radical/ITER3-ARCHITECTURE-DESIGN.md (read first).
 *
 * Implementation lives in (when commissioned in a separate work item):
 *   ../stages/1.7-module-decomposition.ts          — runModuleDecomposition()
 *   ../stages/2-decompose.ts                        — runDecomposeRadicalPerModule()
 *   ../prompts.ts                                   — prompt templates
 *   ../radical/character-hierarchy.ts               — universalModuleToSentenceIds map
 *
 * Backward compatibility: gated by env flag RADICAL_PHASE_3_PER_MODULE.
 */

import type { ProductClass } from '../radical/character-hierarchy.js'
import type { LeafRecord } from '../radical/structural-builder.js'

// ---------------------------------------------------------------------------
// 1. Universal functional taxonomy (the 12 modules — see §3 of design doc)
// ---------------------------------------------------------------------------

/**
 * The 12 universal engineering modules every product is decomposed against.
 * No product class is allowed to invent new modules — the LLM may only
 * (a) instantiate these for the product, or (b) mark them as excluded.
 *
 * Order matches the canonical taxonomy table in the design doc §3.
 *
 * History: Originally 9 modules. Council (Grok + Gemini + GLM, 2026-05-11)
 * unanimously added `actuation_kinematics`, `mass_fluid_transport_process`,
 * and `hmi_ergonomics` after demonstrating the 9-module set forced
 * shoehorning on 11/15 test products (drone rotors, bioreactor impellers,
 * RO desalination flows, surgical robot grip, etc.). See
 * `../COUNCIL-UNIVERSAL-TAXONOMY-2026-05-11.md` for the reasoning.
 *
 * `interface` was renamed to `environmental_interface` to avoid collision
 * with the data-interface concept used in Stage 2 PA validation.
 */
export const UNIVERSAL_MODULES = [
  'energy_storage_source',
  'energy_conversion_transduction',
  'structure_containment',
  'sensing_instrumentation',
  'control_compute_communication',
  'safety_protection',
  'environmental_interface',
  'power_distribution',
  'maintenance_serviceability',
  'actuation_kinematics',
  'mass_fluid_transport_process',
  'hmi_ergonomics',
] as const

export type UniversalModule = typeof UNIVERSAL_MODULES[number]

/**
 * Human-readable label for each module, for prompt rendering and PDF output.
 */
export type UniversalModuleLabels = Record<UniversalModule, string>

/**
 * One-sentence definition for each module, embedded in the Stage 1.5 prompt
 * so the LLM has a stable definition to anchor its decisions.
 */
export type UniversalModuleDefinitions = Record<UniversalModule, string>

/**
 * Human-readable labels for the 12 modules. Used in the PDF design-modules
 * section, in council-validation reports, and (optionally) in prompts.
 */
export const MODULE_LABELS: UniversalModuleLabels = {
  energy_storage_source: 'Energy Storage / Source / Dissipation',
  energy_conversion_transduction: 'Energy Conversion / Transduction',
  structure_containment: 'Structure / Containment',
  sensing_instrumentation: 'Sensing / Instrumentation',
  control_compute_communication: 'Control / Compute / Communication',
  safety_protection: 'Safety / Protection',
  environmental_interface: 'Environmental Interface',
  power_distribution: 'Power Distribution',
  maintenance_serviceability: 'Maintenance / Serviceability',
  actuation_kinematics: 'Actuation / Kinematics / Mechanisms',
  mass_fluid_transport_process: 'Mass / Fluid Transport & Process',
  hmi_ergonomics: 'Human-Machine Interface & Ergonomics',
}

/**
 * Canonical one-sentence definitions for the 12 modules.
 * Mirrors §3 of `radical/ITER3-ARCHITECTURE-DESIGN.md` and is rendered into
 * Stage 1.5 prompts and council-review reports.
 */
export const MODULE_DEFINITIONS: UniversalModuleDefinitions = {
  energy_storage_source:
    'Stores or sources the primary working energy/material the product uses (battery, fuel tank, capacitor bank, accumulator, biomass feedstock, water reservoir).',
  energy_conversion_transduction:
    'Converts energy or material between forms (inverter, motor, heat exchanger, fermenter, RO membrane, solar cell, turbine generator).',
  structure_containment:
    'Carries load, contains pressure/fluid, and provides geometric form (pressure vessel, frame, enclosure, container shell, hull, chassis). Passive integrity only.',
  sensing_instrumentation:
    'Measures physical state — temperature, pressure, flow, voltage, biochemistry, position, gas concentration.',
  control_compute_communication:
    'Closed-loop control, supervisory compute, and on/off-board comms (PLC, MCU, EMS, SCADA, radio, CAN bus, edge inference).',
  safety_protection:
    'Detects and mitigates hazards via ACTIVE mitigation devices (fire suppression, surge protection, pressure relief valves, e-stops, interlocks, BMS protection circuits). Operation-time hazards only.',
  environmental_interface:
    'Handles the physical boundary with the operating environment (thermal management, ingress protection, EMC shielding, lightning, anti-icing, biofouling protection).',
  power_distribution:
    'Distributes electrical or fluid power within the product via UNINTERRUPTED routing only (busbars, switchgear cabling, harnesses, manifolds, conduit). Interrupting devices live in safety_protection.',
  maintenance_serviceability:
    'Affords OFFLINE inspection, swap, calibration, decommissioning (access doors, lifting eyes, drain valves, test points, spare-parts kits, labels). Operation-time protection lives in safety_protection.',
  actuation_kinematics:
    'Applies converted energy to KINEMATIC INTENT: joints, gears, linkages, propellers, rotors, control surfaces, end-effector jaws, dish actuators, turbine blades, impellers, agitators. Distinct from energy_conversion_transduction (which only changes energy domain).',
  mass_fluid_transport_process:
    "Internal pumping, valving, mixing, filtration, separation, phase change, biological/chemical processing. The product's INTERNAL matter flow lives here — distinct from passive containment in structure_containment and from environmental heat/mass exchange in environmental_interface.",
  hmi_ergonomics:
    'Operator-facing touchpoints and ergonomic surfaces: touchscreens, haptics, displays, manual controls, sight glasses, ergonomic grips, biocompatible/wearable interfaces. Operator-facing only; external connectors stay in power_distribution (electrical) or mass_fluid_transport_process (fluid).',
}

/**
 * Default allowed_radicals subset per module. Mirrors §5.2 of
 * `radical/ITER3-ARCHITECTURE-DESIGN.md`. Stage 1.5 may refine the per-module
 * `allowed_radicals` array based on the brief specifics, but defaults here
 * are used (a) when the LLM omits the field, (b) for the per-module Stage 2
 * call when the secondary_modules union needs a base set, (c) when the
 * fallback ClassModulePriors path constructs synthetic ModuleSpec objects.
 *
 * IMPORTANT: every ID in these lists MUST appear in `KNOWN_RADICALS` in
 * `stages/2-decompose.ts`. Validator must reject any radical not in the
 * known set.
 */
export const MODULE_DEFAULT_ALLOWED_RADICALS: Record<UniversalModule, string[]> = {
  energy_storage_source: [
    'electrochemical_energy_function',
    'lithium_iron_phosphate_chemistry',
    'fluid_flow_state',
    'pressure_vessel_function',
  ],
  energy_conversion_transduction: [
    'silicon_semiconductor_function',
    'magnetic_coupling_function',
    'electromechanical_switching_function',
    'thermal_transfer_function',
    'mechanical_kinetic_function',
    'optical_transduction_function',
    'biochemical_sensing_function',
    'electrochemical_reaction_function',
    'refrigerant_fluid',
  ],
  structure_containment: [
    'steel',
    'aluminium_alloy',
    'carbon_fibre_composite',
    'polymer_thermoplastic',
    'mineral_fibre_material',
    'pressure_vessel_function',
  ],
  sensing_instrumentation: [
    'silicon_semiconductor_function',
    'optical_sensing_function',
    'chemical_sensing_function',
    'biochemical_sensing_function',
    'digital_logic_function',
  ],
  control_compute_communication: [
    'silicon_semiconductor_function',
    'digital_logic_function',
    'electrical_conducting_function',
    'copper',
  ],
  safety_protection: [
    'chemical_suppressant_material',
    'optical_sensing_function',
    'chemical_sensing_function',
    'electromechanical_switching_function',
    'pressure_vessel_function',
  ],
  environmental_interface: [
    'thermal_transfer_function',
    'refrigerant_fluid',
    'fluid_flow_state',
    'polymer_thermoplastic',
    'mineral_fibre_material',
  ],
  power_distribution: [
    'copper',
    'electrical_conducting_function',
    'electromechanical_switching_function',
    'polymer_thermoplastic',
    'fluid_flow_state',
  ],
  maintenance_serviceability: [
    'steel',
    'polymer_thermoplastic',
    'electrical_conducting_function',
  ],
  actuation_kinematics: [
    'silicon_semiconductor_function',
    'copper',
    'magnetic_coupling_function',
    'electromechanical_switching_function',
    'polymer_thermoplastic',
    'mineral_fibre_material',
    'mechanical_kinetic_function',
  ],
  mass_fluid_transport_process: [
    'pressure_vessel_function',
    'fluid_flow_state',
    'copper',
    'steel',
    'polymer_thermoplastic',
    'chemical_sensing_function',
    'refrigerant_fluid',
    'electrochemical_reaction_function',
  ],
  hmi_ergonomics: [
    'silicon_semiconductor_function',
    'polymer_thermoplastic',
    'optical_sensing_function',
    'mechanical_kinetic_function',
    'digital_logic_function',
    'thermal_transfer_function',
  ],
}

// ---------------------------------------------------------------------------
// 2. ModuleSpec — per-module decomposition output
// ---------------------------------------------------------------------------

/**
 * Confidence the LLM assigns to its claim that THIS module applies to THIS
 * product. `low` triggers council scrutiny; ≥2 `low`s in a single
 * decomposition triggers `NEEDS_MAJOR` regardless of seat agreement.
 */
export type ApplicabilityConfidence = 'high' | 'medium' | 'low'

/**
 * Per-module derived parameters. Free-form key/value because parameter
 * vocabulary varies per product class (`capacity_kwh` for BESS,
 * `permeate_flow_lph` for RO, `dish_diameter_m` for ground station).
 *
 * Numeric values must be finite and non-negative. String values must be
 * a single word/short phrase, not prose. Implementation validators must
 * strip prose values.
 *
 * Range checks on numerics are performed against
 * `MODULE_PARAMETER_RANGES` (implementation-side constant table).
 */
export type DerivedParameters = Record<string, string | number>

/**
 * The output spec for one of the 12 universal modules, instantiated for
 * THIS product. Stage 1.5 emits 5–12 of these (one per applicable module).
 */
export interface ModuleSpec {
  /** Which of the 12 universal modules this is (PRIMARY classification). */
  module: UniversalModule

  /**
   * 2–3 sentence description of what THIS module does on THIS product.
   * NOT a generic definition — must reference the brief's specifics
   * (e.g. "Stores 3.5 MWh at the rack level using LFP prismatic cells.
   *  Provides 1 MW C-rate discharge for grid-balancing duty.").
   */
  module_brief: string

  /**
   * Quantitative parameters Stage 2 needs to size this module.
   * Examples:
   *   energy_storage_source on a BESS:
   *     { capacity_kwh: 3500, dod_fraction: 0.80, cell_count: 4375 }
   *   energy_conversion_transduction on a heat pump:
   *     { rated_thermal_kw: 30, cop_target: 4.5, refrigerant: "R290" }
   *   structure_containment on a tidal generator:
   *     { nacelle_mass_kg: 12000, design_pressure_bar: 6 }
   */
  derived_parameters: DerivedParameters

  /**
   * Subset of the 22 universal radicals this module is allowed to use.
   * Stage 2 narrows the LLM's character library to characters whose
   * radicals are entirely within this set. Wrong-domain leakage becomes
   * structurally impossible at this layer.
   *
   * Default mapping per module is the engine's prior; Stage 1.5 may
   * refine the list per product (e.g. add `photovoltaic` to a
   * solar-charged BESS's `energy_storage_source.allowed_radicals`).
   *
   * Validator must reject any value not in the known radicals set
   * (currently 22; reference: KNOWN_RADICALS in stages/2-decompose.ts).
   */
  allowed_radicals: string[]

  /**
   * LLM's confidence this module applies. Drives council scrutiny.
   * Cannot be omitted — implementations must default to 'low' when the
   * LLM omits the field rather than silently passing.
   */
  applicability_confidence: ApplicabilityConfidence

  /**
   * Optional secondary classifications. A single component or sub-system
   * can legitimately serve more than one universal function — `secondary_modules`
   * lets the LLM express dual-classification on a single ModuleSpec without
   * forcing a single-bucket pick that destroys the secondary signal.
   *
   * Canonical examples:
   *   - A pump's PRIMARY is `actuation_kinematics` (it imparts kinematic intent
   *     to a fluid via an impeller); SECONDARY is `mass_fluid_transport_process`
   *     (it moves the working fluid through the system).
   *   - A BESS container shell is PRIMARY `structure_containment` (load + form);
   *     SECONDARY `environmental_interface` (IP55, weatherproof, fire-rated).
   *   - A solar panel is PRIMARY `energy_conversion_transduction` (PV cells);
   *     SECONDARY `structure_containment` (the rigid module body itself
   *     is part of the array's mechanical structure).
   *
   * Iter 3 v1 BEHAVIOUR (CONSUMED, not deferred):
   *   - Stage 2 per-module radical translation may use `secondary_modules`
   *     to broaden `allowed_radicals` for that module (union of primary
   *     + secondary defaults), preserving multi-domain BoM completeness.
   *   - The deterministic builder treats the leaf set the same way; the
   *     secondary classification is a HINT to widen the candidate library,
   *     not a fork in the decomposition.
   *
   * Why baked into v1 (not Iter 3.5): multi-classification matters for
   * unseen-class universality probes. Without it, products like pumps,
   * solar arrays, and refrigerated structural enclosures shatter their
   * BoM cohesion across two adjacent modules.
   */
  secondary_modules?: UniversalModule[]
}

// ---------------------------------------------------------------------------
// 3. ModuleDecomposition — Stage 1.5 top-level output
// ---------------------------------------------------------------------------

/**
 * Per-seat verdict (one of these per CouncilSeatReview).
 *   OK           — seat approves the catalog as-is.
 *   NEEDS_MINOR  — seat would polish (notes attached) but does not block.
 *   NEEDS_MAJOR  — seat blocks: fundamental structural issue.
 */
export type SeatVerdict = 'OK' | 'NEEDS_MINOR' | 'NEEDS_MAJOR'

/**
 * Aggregate council verdict on the generated module catalog.
 *
 * SYNTHESIS RULE (4-seat council, 2026-05-11):
 *   - 2+ NEEDS_MAJOR seats           → 'NEEDS_MAJOR' (BLOCK; retry Stage 1.5
 *                                       once with notes appended; if still
 *                                       NEEDS_MAJOR, fail the stage).
 *                                       50% threshold: ≥2 of 4 = block.
 *   - 1 NEEDS_MAJOR seat             → take the worst non-block verdict
 *                                       across the other three seats:
 *                                       any NEEDS_MINOR → 'NEEDS_MINOR';
 *                                       all OK          → 'NEEDS_MINOR'
 *                                       (the lone NEEDS_MAJOR is logged).
 *   - 0 NEEDS_MAJOR + ≥1 NEEDS_MINOR → 'NEEDS_MINOR' (log council_notes,
 *                                       proceed with warning).
 *   - All OK                         → 'OK', proceed.
 *
 * Additionally: ≥2 modules at 'low' applicability_confidence force the
 * verdict to NEEDS_MAJOR regardless of seat agreement (data-quality gate).
 */
export type CouncilVerdict = 'OK' | 'NEEDS_MINOR' | 'NEEDS_MAJOR'

/**
 * The 4 council seats (canonical names, in invocation order).
 * Models pinned in env config; do not change without a re-validation run.
 */
export type CouncilSeatId = 'grok' | 'gemini' | 'glm' | 'sonnet'

/**
 * One council seat's structured review of the decomposition.
 * Aggregator computes the overall CouncilVerdict from these per the
 * synthesis rule documented on `CouncilVerdict`.
 */
export interface CouncilSeatReview {
  /**
   * Stable seat identifier. Must be one of the 4 canonical seats so
   * the aggregator can index reproducibly.
   */
  seat: CouncilSeatId
  /** This seat's overall verdict on the catalog. */
  verdict: SeatVerdict
  /** Q1: does the module list cover the functional surface? */
  coverage_ok: boolean
  /** Q2: are any listed modules genuinely N/A? */
  no_spurious_modules: boolean
  /** Q3: are derived_parameters numerically plausible? */
  parameters_plausible: boolean
  /** Specific challenges / suggestions surfaced by this seat. */
  notes: string[]
}

/**
 * Top-level Stage 1.5 output. Returned wrapped in `StageResult<ModuleDecomposition>`.
 */
export interface ModuleDecomposition {
  /**
   * Echoed from the upstream classification stage. Stored on the
   * decomposition so downstream stages don't need to re-resolve.
   */
  product_class: string

  /**
   * Normalised product class (one of ProductClass) when the
   * classification could be normalised; null for unseen classes
   * (the engine still proceeds — see §7 universality probes).
   */
  normalised_class: ProductClass | null

  /**
   * The applicable modules for this product, in the canonical order
   * defined by UNIVERSAL_MODULES (NOT in confidence order).
   * Length: 3–12 (a product with <3 modules is structurally suspect
   * and Stage 1.5 must reject).
   */
  modules: ModuleSpec[]

  /**
   * Modules explicitly marked N/A for this product. Sum of
   * modules.length + excluded_modules.length must equal 12 (every
   * universal module is accounted for, either applied or excluded).
   */
  excluded_modules: UniversalModule[]

  /**
   * Per-excluded-module rationale ("why N/A"). Sparse: only
   * populated for excluded modules. Used in council validation
   * and surfaced to the user in the PDF design-modules section.
   */
  rationale_excluded: Partial<Record<UniversalModule, string>>

  /**
   * Council aggregate verdict. Drives whether Stage 2 proceeds,
   * retries Stage 1.5, or fails.
   */
  council_verdict: CouncilVerdict

  /**
   * Per-seat reviews retained for diagnostics. Length: 4.
   * Order matches `CouncilSeatId` declaration: grok, gemini, glm, sonnet.
   */
  council_seats: CouncilSeatReview[]

  /**
   * Flat list of council notes (deduped, surfaced from all seats).
   * Used in the PDF and in dual-run diff diagnostics.
   */
  council_notes: string[]

  /**
   * Wall-clock + token-cost telemetry for cost-discipline monitoring.
   */
  telemetry: ModuleDecompositionTelemetry
}

/**
 * Cost + latency telemetry. Surfaced to the cost monitor so
 * §6.3 budget projections can be validated against reality.
 */
export interface ModuleDecompositionTelemetry {
  /** Wall-clock for the LLM call (ms). */
  llm_call_ms: number
  /** Wall-clock for council aggregation (ms). */
  council_ms: number
  /** Total input tokens across LLM + council. */
  input_tokens: number
  /** Total output tokens across LLM + council. */
  output_tokens: number
  /** Estimated GBP cost — for cost-monitor watchdog. */
  estimated_cost_gbp: number
  /** Did Stage 1.5 retry? (NEEDS_MAJOR triggers one retry.) */
  retried: boolean
}

// ---------------------------------------------------------------------------
// 4. Per-module radical sub-tree (Stage 2 per-module output)
// ---------------------------------------------------------------------------

/**
 * Output of one per-module Stage 2 LLM call.
 * Aggregated across modules into the product-level RadicalTree by
 * the existing buildTreeFromLeaves() (no change to the deterministic builder).
 */
export interface ModuleRadicalSubTree {
  /** Which universal module this sub-tree decomposes. */
  module: UniversalModule

  /**
   * Flat leaf list emitted by the per-module LLM call. Reuses the
   * existing LeafRecord shape so the deterministic builder can
   * consume the union without translation.
   */
  leaves: LeafRecord[]

  /** For diagnostics: how many distinct characters this module produced. */
  characters_count: number

  /** For diagnostics: how many UNKNOWN leaves the LLM emitted. */
  unknown_count: number

  /** Per-call telemetry — propagated to Stage 2's aggregate telemetry. */
  telemetry: PerModuleCallTelemetry
}

/**
 * Per-module LLM call cost + latency.
 */
export interface PerModuleCallTelemetry {
  llm_call_ms: number
  input_tokens: number
  output_tokens: number
  estimated_cost_gbp: number
  /** Which model served this call (primary or fallback). */
  model_used: string
  /** Did this call retry (validation failure)? */
  retried: boolean
}

/**
 * Aggregate output of the per-module Stage 2 loop.
 * Returned wrapped in StageResult<PerModuleDecompositionResult>.
 *
 * The deterministic builder consumes `aggregated_leaves` to produce
 * the final RadicalTree (no change to buildTreeFromLeaves contract).
 */
export interface PerModuleDecompositionResult {
  /** One sub-tree per module from Stage 1.5. */
  sub_trees: ModuleRadicalSubTree[]

  /** Union of all leaves across all modules — input to buildTreeFromLeaves. */
  aggregated_leaves: LeafRecord[]

  /** Total leaf count after dedup; for cell-≥8 metric correlation. */
  total_leaf_count: number

  /** Modules that returned 0 leaves (data-quality signal). */
  empty_modules: UniversalModule[]

  /** Sum of per-module telemetry. */
  aggregate_telemetry: AggregatePerModuleTelemetry
}

export interface AggregatePerModuleTelemetry {
  /** Sum of llm_call_ms across all modules (parallel calls so wall-clock < this). */
  total_llm_call_ms_serial: number
  /** Wall-clock for the parallel Promise.all of all per-module calls. */
  wall_clock_ms: number
  total_input_tokens: number
  total_output_tokens: number
  total_estimated_cost_gbp: number
  /** Number of per-module calls that retried. */
  retry_count: number
}

// ---------------------------------------------------------------------------
// 5. Per-class module priors (mitigation for §8.1 hallucination risk)
// ---------------------------------------------------------------------------

/**
 * For the 10 baseline product classes, the engine declares which
 * modules MUST appear. Stage 1.5's LLM output is cross-checked
 * against these priors and discrepancies are flagged.
 *
 * For unseen classes (universality probes §7), the priors map has
 * no entry — Stage 1.5 accepts the LLM output subject to council only.
 *
 * Implementation must export:
 *   export const CLASS_MODULE_PRIORS: ClassModulePriors = { ... }
 */
export interface ModulePrior {
  /** Modules that MUST appear in any decomposition of this class. */
  required: UniversalModule[]
  /**
   * Modules that are typically present but may legitimately be omitted
   * if the brief excludes them (e.g. EMS may be absent from a small
   * stand-alone home-battery brief).
   */
  optional: UniversalModule[]
  /**
   * Modules that should NOT appear for this class. Stage 1.5 rejects
   * the decomposition if the LLM lists one of these as applicable.
   */
  forbidden: UniversalModule[]
}

export type ClassModulePriors = Partial<Record<ProductClass, ModulePrior>>

// ---------------------------------------------------------------------------
// 6. Validation result types (used by implementation, declared here for
//    contract stability)
// ---------------------------------------------------------------------------

/**
 * Result of validating a Stage 1.5 LLM output against schema + priors.
 * Drives whether Stage 1.5 proceeds, retries, or fails.
 */
export interface ModuleDecompositionValidation {
  /** True if the decomposition is structurally usable. */
  ok: boolean
  /** Hard schema errors (invalid module key, count out of range, etc.). */
  schema_errors: string[]
  /** Prior-mismatch warnings (missing required, listed forbidden, etc.). */
  prior_warnings: string[]
  /** Numeric parameter values that failed range checks. */
  parameter_warnings: string[]
}

/**
 * Result of validating a per-module Stage 2 output.
 */
export interface ModuleRadicalSubTreeValidation {
  ok: boolean
  /** Leaves whose character_id is not in the known library. */
  unknown_character_ids: string[]
  /** Leaves whose radicals fall outside module.allowed_radicals. */
  out_of_scope_leaves: number
  /** Leaves with multiplicity ≤ 0 or non-finite. */
  invalid_multiplicity_count: number
}
