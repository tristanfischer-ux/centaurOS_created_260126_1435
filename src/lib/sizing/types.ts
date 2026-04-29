/**
 * @file src/lib/sizing/types.ts — Shared types for the Forge sizing engine.
 *
 * @description The sizing engine solves the "circular allocation" problem that
 * every physical product design has: given a bounded envelope (container /
 * room / chassis / cabinet), a primary payload target (kWh, canopy m²,
 * thermal kW, ...), and a library of engineering coefficients, produce a
 * self-consistent per-module dimension sheet OR report infeasibility with
 * ranked trade-offs.
 *
 * Per-domain rule libraries (bess-v1, vertical-farm-v1, heat-pump-v1, ...)
 * plug into a single generic solver (`sizing-engine.ts::solveSizing`). The
 * output is persisted on `cad_lab_projects.dimension_sheet` and injected
 * downstream into image prompts + BOM validation + Fang manufacturability.
 *
 * Prototype reference: `/tmp/bess-sizing-engine.mjs` — the exact BESS trial
 * that validated the approach on 5 configurations (500 → 3000 kWh).
 */

// ─── Envelope ──────────────────────────────────────────────────────────

/**
 * The physical boundary the design must fit inside. The solver treats
 * envelope as read-only — if the domain target can't fit, the recommended
 * fix is to grow the envelope (2×40ft, 53ft HC, larger bay, ...).
 */
export interface Envelope {
    kind:
        | "container_40ft_iso"
        | "container_20ft_iso"
        | "container_53ft_hc"
        | "warehouse_bay"
        | "room"
        | "chassis"
        | "cabinet"
        | "plot"
        | "custom"
    label: string
    interior_w_mm: number
    interior_d_mm: number
    interior_h_mm: number
    /** Computed m² = (w * d) / 1_000_000. Provided by `makeEnvelope` helper. */
    interior_floor_m2: number
    /** Computed m³. */
    interior_volume_m3: number
}

// ─── Domain rules contract ─────────────────────────────────────────────

/**
 * A domain rules library is the expertise bundle for one engineering domain
 * (battery storage, vertical farming, heat pumps, ...). It declares:
 *
 *   - `domain` / `version` for provenance + compatibility
 *   - `applicableIndustries` — strings Max's industryDomain classifier emits
 *     that the registry matches against when auto-picking a library
 *   - `targetSpec` — named numeric targets the solver expects (kWh, canopy_m², kW_thermal)
 *   - `defaultEnvelope` — sensible default when the project hasn't declared one
 *   - `slots` — canonical module kinds with coefficients, aliases, and mount
 *   - `solve` — the actual allocation function
 *
 * Keeping `solve` per-library (rather than a fully-generic solver) lets each
 * domain encode its own physics (BESS: payload is linear in kWh; vertical
 * farm: layers × canopy × tier height; heat pump: compressor sized to
 * thermal load + COP). The generic "solveSizing" wrapper handles module-id
 * matching, envelope budgeting, and dimension-sheet assembly around it.
 */
export interface DomainRules {
    domain: string
    version: string
    /** Human label shown in the UI ("BESS — 40ft ISO containerised"). */
    label: string
    applicableIndustries: string[]
    /**
     * What targets the solver needs to run. UI uses this to render the
     * right sizing form (kWh + kW for BESS; canopy_m² + crop_turnover for VF).
     * Numeric. Keys are domain-specific and mirrored into the persisted
     * dimension_sheet under `target`.
     */
    targetSpec: Record<string, TargetFieldSpec>
    defaultEnvelope: Envelope
    slots: Record<string, SlotDefinition>
    /**
     * Allocation function. Receives the targets + envelope + (optional) module
     * list from Max. Produces the allocation result — which the generic
     * wrapper then matches back onto Max's module IDs.
     */
    solve: (input: DomainSolveInput) => DomainSolveResult
}

export interface TargetFieldSpec {
    label: string
    unit: string
    min?: number
    max?: number
    default?: number
    /** If true, the UI renders this as a required field. */
    required: boolean
}

/**
 * A canonical "slot" the domain knows how to size. Examples:
 *   - BESS: `battery_racks`, `pcs_inverter`, `dc_distribution`, `hvac`, ...
 *   - VF:    `grow_trays`, `lighting`, `water_delivery`, `climate`, ...
 *   - HP:    `compressor`, `heat_exchanger`, `controls`, ...
 *
 * Aliases let a Max module named "Battery Subsystem" or "Battery Pack" map
 * to the `battery_racks` slot without requiring Max to use canonical IDs.
 * Matching is case-insensitive and substring-based, in priority order.
 */
export interface SlotDefinition {
    /** Human label ("Battery racks"). */
    label: string
    /**
     * Name substrings / keyParts hints that map Max modules to this slot.
     * First match wins. Substring-matched case-insensitively against
     * `module.name + " " + module.keyParts.join(" ")`.
     */
    matchAliases: string[]
    /** Where this slot lives: floor / ceiling / wall / envelope. */
    defaultMount: "floor" | "ceiling" | "wall" | "envelope"
    /** Default visual-prompt hint when injected into image generation. */
    promptHint?: string
}

// ─── Domain solve I/O ──────────────────────────────────────────────────

export interface DomainSolveInput {
    envelope: Envelope
    targets: Record<string, number>
    /**
     * Optional Max modules. When provided, the solver can use keyParts to
     * refine estimates (e.g. counting battery racks from the parts list
     * rather than deriving it from kWh alone). When absent, solver works
     * purely from targets + defaults.
     */
    modules?: Array<{
        id: string
        name: string
        purpose?: string
        keyParts?: string[]
    }>
}

export interface DomainSolveResult {
    feasible: boolean
    /** floor area budget after deducting fixed overhead (aisle, walls). */
    floor_budget_m2: number
    /** Per-slot allocation: slot name → ModuleDimensions. */
    slot_dimensions: Record<string, ModuleDimensions>
    /** Iterations recorded during solve — useful for debugging + UI trace. */
    iterations: SolverIteration[]
    /** Human-readable conflicts when infeasible. */
    conflicts: string[]
    /** Human-readable ranked recommendations. */
    recommendations: string[]
    /** Notes / assumptions worth surfacing on the UI. */
    notes?: string[]
    /** Optimisation grid + winner + alternatives + levers. Present when the
     *  rule library opted into grid-sweeping instead of single-pass solve. */
    optimisation?: OptimisationResult
}

export interface SolverIteration {
    iter: number
    used_floor_m2: number
    remaining_floor_m2: number
    utilization_pct: number
    allocations: Record<string, number>
    /** Target parameters used for this trial (e.g. { canopy_m2: 40, tiers: 5 }).
     *  Present when the library is running a grid sweep; omitted for
     *  single-pass solves. */
    targets?: Record<string, number>
    feasible?: boolean
    /** One-line conflict summary if infeasible — makes the grid readable. */
    conflict_summary?: string | null
}

// ─── Optimisation output (P1 feedback-loop surface) ───────────────────

/**
 * The optimisation grid + winner + trade-off analysis that domain libraries
 * can produce when they want to record the "how did we get here" trail
 * rather than a single analytic pass. Surfaced in the PDF as the
 * "Sizing optimisation" section.
 */
export interface OptimisationResult {
    /** Every trial the engine ran, including infeasible ones. */
    trials: Array<{
        targets: Record<string, number>
        feasible: boolean
        utilization_pct: number
        used_floor_m2: number
        conflict_summary: string | null
    }>
    /** The chosen config — usually the founder's requested target, or the
     *  nearest-feasible alternative when the request didn't fit. */
    winner: {
        targets: Record<string, number>
        rationale: string
    }
    /** Other feasible configs worth considering, ranked by proximity to
     *  the founder's target + headroom quality. */
    top_alternatives: Array<{
        targets: Record<string, number>
        trade_offs: string
    }>
    /** "What you'd gain by" — actionable levers the founder can pull. */
    levers: Array<{
        action: string
        gain: string
        cost: string
    }>
}

// ─── Module dimensions (the artefact downstream consumes) ──────────────

/**
 * The dimension record for a single slot / module. Shape is stable across
 * all domains — downstream consumers (image prompts, BOM check, Fang
 * cascade) rely on these fields existing, even if the slot itself is
 * domain-specific.
 */
export interface ModuleDimensions {
    w_mm: number
    d_mm: number
    h_mm: number
    floor_m2: number
    mount: "floor" | "ceiling" | "wall" | "envelope"
    /**
     * What this slot scales with, in human form.
     * ("target_kWh", "target_kW", "canopy_m²", "thermal_kW × COP").
     * Rendered as a one-liner provenance caption in the UI.
     */
    scaled_by: string
    /** Optional rack/shelf/pallet count hint. */
    count_hint?: string
    /** Ceiling-mounted slots expose the thermal/agent requirement here. */
    requirement?: { label: string; value: number; unit: string }
    /** Prompt hint injected into image generation for this slot. */
    prompt_hint?: string
}

// ─── Final persisted artefact ──────────────────────────────────────────

/**
 * The shape persisted as `cad_lab_projects.dimension_sheet` JSONB.
 *
 * `module_dimensions` is keyed by **Max module id** (not slot name) so the
 * image-generator / BOM / UI can look up by the same id they already have.
 * Slot → module-id matching happens inside `solveSizing`.
 */
export interface DimensionSheet {
    /** Always present; downstream code checks this before trusting dimensions. */
    feasible: boolean
    rules_domain: string
    rules_version: string
    envelope: Envelope
    target: Record<string, number>
    floor_budget_m2: number
    module_dimensions: Record<string, ModuleDimensions>
    /** Unmatched module ids — Max produced a module the rules library doesn't recognise. */
    unmatched_module_ids: string[]
    /** Unmatched slot names — rules library expected this slot but Max didn't produce a module for it. */
    unmatched_slot_ids: string[]
    conflicts: string[]
    recommendations: string[]
    notes: string[]
    iterations: SolverIteration[]
    /** Present when the library ran a grid sweep rather than a single-pass solve. */
    optimisation?: OptimisationResult
    /** Loop 8 L5-P4 sizing universalisation: when the primary attempt
     *  is INFEASIBLE, the wrapper runs alternates (smaller targets,
     *  alternate envelopes) and stores the largest feasible result here.
     *  PDF render shows ORIGINAL TARGET (INFEASIBLE) + CLOSEST FEASIBLE
     *  ALTERNATE side-by-side so the founder sees both the brief gap
     *  and the achievable design. Null when (a) primary was already
     *  feasible (no need) or (b) no alternate worked either. */
    closest_feasible_alternate?: {
        envelope: Envelope
        target: Record<string, number>
        floor_budget_m2: number
        module_dimensions: Record<string, ModuleDimensions>
        /** Human-readable summary of what changed vs the primary attempt. */
        delta_from_primary: string

        // ── Loop 24 class-fence fields (gate-3 council R2 P0) ──────────
        //
        // INTENT: deterministic class-fence fields added 2026-04-29 so the
        // gate can distinguish "solver picked a bigger container" (same class,
        // safe auto-retry) from "solver picked a warehouse bay" (different
        // product class, deliver-and-pushback required).
        //
        // ANTI-CHEAT: product_class_match is computed deterministically by
        // comparing EnvelopeClassificationTag values. NEVER set by an LLM.

        /** EnvelopeClassificationTag of the BRIEFED envelope. */
        briefed_classification_tag?: string
        /** EnvelopeClassificationTag of THIS alternate envelope. */
        alternate_classification_tag?: string
        /**
         * True only when both tags are equal AND neither is "unknown".
         * Computed deterministically by areSameProductClass() in
         * src/lib/forge-v2/envelope-classification.ts.
         * NEVER set by an LLM.
         */
        product_class_match?: boolean
        /**
         * Capacity achievable within the BRIEFED product class envelope.
         * Set when product_class_match === false so the PDF can show
         * "1.4 MWh achievable in 40ft container vs 3.5 MWh briefed".
         */
        capacity_at_briefed_class?: {
            value: number | null
            units: string
            deficit: number | null
            summary: string
        }
        /**
         * Capacity achievable in the ALTERNATE (different-class) envelope.
         * Set when product_class_match === false.
         */
        capacity_at_alternate_class?: {
            value: number | null
            units: string
        }
        /**
         * Human-readable trade-off note for the PDF callout.
         * e.g. "If you relax container → warehouse bay, the full 3.5 MWh target is achievable."
         */
        trade_off_note?: string
    } | null
    generated_at: string
}
