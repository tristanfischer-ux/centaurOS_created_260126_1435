/**
 * @file stage-narratives.ts — founder-facing labels + narrative lines per autopilot stage.
 *
 * @description Maps the 12 internal autopilot stages to plain-English
 * narrative content. Used by NarrativeProgressView to show what is
 * happening without exposing specialist names, internal table names,
 * or any of the engine plumbing the founder does not need.
 *
 * Voice rules (per CLAUDE.md "Writing for Tristan"):
 *   - Never assume the user's situation or state of mind
 *   - No failure-mode framing — lead with the useful thing
 *   - British spelling
 *   - No acronyms — spell every term out (bill of materials, not the abbreviation)
 *   - Specific numbers over adjectives
 *   - One clear next action per piece
 *
 * Founder-facing labels deliberately do not name any specialist.
 * The "show the work" thesis belongs in marketing copy, not in the
 * progress experience.
 */

import type { AutopilotStage } from "@/actions/forge-v2-autopilot"

export interface StageNarrative {
    /** Founder-facing label shown in the timeline. */
    label: string
    /** 1-3 sentence narrative shown next to the label when the stage completes. */
    narrative: string
    /** Short caption shown while the stage is in flight (present tense). */
    inFlight: string
}

/**
 * Ordered list of stages as they run end-to-end. Source of truth for the
 * timeline order. Mirrors the server-side stage chain in
 * src/actions/forge-v2-autopilot.ts but as a pure data array.
 *
 * `done` is intentionally absent — it is rendered as a separate "ready"
 * state, not a timeline row.
 */
export const NARRATIVE_STAGE_ORDER: AutopilotStage[] = [
    "waiting_chase",
    "locking_brief",
    "waiting_max",
    "waiting_sizing",
    "waiting_layout",
    "waiting_bom",
    "waiting_finn",
    "matching_suppliers",
    "running_fang_reviews",
    "proofreading",
    "generating_illustration",
    "generating_pdf",
]

export const STAGE_NARRATIVES: Record<AutopilotStage, StageNarrative> = {
    waiting_chase: {
        label: "Researching your market",
        inFlight: "Reading the regulatory landscape and what comparable products already exist.",
        narrative:
            "Pulled the regulatory standards that apply to this kind of product, the closest comparable systems on the market, and the typical United Kingdom build cost band so the rest of the plan can be grounded in reality.",
    },
    locking_brief: {
        label: "Locking the brief",
        inFlight: "Turning the words you typed into a structured engineering specification.",
        narrative:
            "Captured the targets, constraints, and the customer you are building for as a structured specification. Every later step reads from this lock so nothing drifts.",
    },
    waiting_max: {
        label: "Architecting the system",
        inFlight: "Breaking the product into the modules that have to exist.",
        narrative:
            "Decomposed the product into its modules — each one a sub-system that solves a specific problem. The shape of your bill of materials is now visible.",
    },
    waiting_sizing: {
        label: "Sizing the engineering",
        inFlight: "Working out how big each module needs to be — power, mass, dimensions, margin of safety.",
        narrative:
            "Sized every module against the brief's targets — power budget, mass budget, dimensions, endurance — and confirmed which configurations actually fit inside the envelope you specified.",
    },
    waiting_layout: {
        label: "Laying it out",
        inFlight: "Placing each module inside the physical envelope and checking what shares space, cooling, and power.",
        narrative:
            "Placed every module inside the physical envelope and worked through what shares space, cooling, and power feed. Nothing collides; service access is preserved.",
    },
    waiting_bom: {
        label: "Building the bill of materials",
        inFlight: "Drafting the actual parts list — each row with quantity, unit cost, and where it lives.",
        narrative:
            "Drafted the bill of materials — every part, the quantity, the unit cost, and the module it belongs to. This is the load-bearing list the rest of the report reads from.",
    },
    waiting_finn: {
        label: "Costing the build",
        inFlight: "Adding up parts, labour, overhead, and contingency. Checking against your target cost.",
        narrative:
            "Rolled up the unit cost — parts, labour, overhead, contingency — and compared it to the target you set in the brief. The cost waterfall is ready.",
    },
    generating_illustration: {
        label: "Drawing the system",
        inFlight: "Generating a hero illustration and per-module renders so the report has visuals throughout.",
        narrative:
            "Generated a hero illustration and per-module renders so the report has clean visuals on the cover, the executive summary, and the module pages.",
    },
    matching_suppliers: {
        label: "Finding suppliers",
        inFlight: "Matching every part on the bill of materials to real United Kingdom and European manufacturers.",
        narrative:
            "Matched every priced part on the bill of materials to real United Kingdom and European manufacturers and ranked them by likely spend so you know where the money goes first.",
    },
    running_fang_reviews: {
        label: "Engineering reviews",
        inFlight: "Reading the design module by module — checking the assumptions, flagging the risks.",
        narrative:
            "Reviewed every module against the brief — checked the engineering assumptions, flagged the risks that need attention, and called out anything that would not survive contact with a manufacturer.",
    },
    proofreading: {
        label: "Final pass",
        inFlight: "Reading the whole report end to end — catching contradictions, tightening the writing.",
        narrative:
            "Read the whole report end to end. Caught the contradictions between sections, tightened the writing, and made sure the numbers agree across the bill of materials, the cost waterfall, and the module pages.",
    },
    generating_pdf: {
        label: "Rendering the report",
        inFlight: "Compiling everything into a downloadable PDF — cover, brief, modules, bill of materials, suppliers, risks.",
        narrative:
            "Compiled everything into a downloadable PDF — cover summary, brief, modules, bill of materials, suppliers, risks, regulatory matrix, and the audit log of what the engine did and why.",
    },
    done: {
        // Not used in the timeline; "done" is rendered as the ready state
        // by NarrativeProgressView. Keeping a placeholder here so the
        // Record<AutopilotStage, ...> type stays exhaustive.
        label: "Your plan is ready",
        inFlight: "",
        narrative: "Your plan is ready. The full report is below as a downloadable PDF.",
    },
    failed: {
        // Set by recordFailure() when retries are exhausted on a stage.
        // Cron filter excludes by `stage NOT IN ('done','failed')`.
        // Placeholder to satisfy Record<AutopilotStage, ...> exhaustiveness.
        label: "Stopped — retries exhausted",
        inFlight: "",
        narrative: "The autopilot stopped because a stage exhausted its retries. The most recent error is in the project's autopilot state.",
    },
    solver_error: {
        // v1.6 (2026-04-29 Loop 24): terminal stage set when the sizing solver
        // returns INFEASIBLE after all retries. Projects in this state need a
        // brief revision before the pipeline can continue.
        // Placeholder to satisfy Record<AutopilotStage, ...> exhaustiveness.
        label: "Sizing could not find a feasible configuration",
        inFlight: "",
        narrative: "The engineering solver could not find a configuration that fits inside the brief's envelope and cost ceiling. The most useful next step is to revise the brief — adjust the target scale, cost ceiling, or physical constraints — and start a fresh run.",
    },
    preflight_blocked: {
        // v1.7 (2026-04-29 Gates Council R1+R2 P1): TERMINAL stage set when
        // runPreflightOracle() detected a physics violation before the pipeline
        // started. Verdict details are in feasibility_verdict column.
        label: "Brief blocked — physics violation",
        inFlight: "",
        narrative: "The brief contains a physics violation detected before the pipeline ran. Review the pre-flight verdict and revise the brief before starting a new run.",
    },
    waiting_max_redecomposition: {
        // v1.8: transitional stage set when Fang sizing detects a topology-level
        // overflow requiring Max to re-decompose. NOT terminal — cron must NOT exclude.
        label: "Requesting a revised module breakdown",
        inFlight: "Max is reviewing the sizing constraints and producing an updated module breakdown.",
        narrative: "The sizing solver found the current module layout cannot fit within the brief's constraints. Max is revising the decomposition to resolve the conflict.",
    },
    gate_1_blocked: {
        // v1.9: terminal stage set when gate1Check() found a numeric mismatch
        // (>= 3x) between the founder's brief and Chase's extraction at brief-lock.
        label: "Brief blocked — numeric mismatch at gate 1",
        inFlight: "",
        narrative: "The pre-pipeline gate detected a significant numeric mismatch between the brief and Chase's structured extraction. Confirm or revise the brief values before starting a new run.",
    },
}

/**
 * Compute the founder-facing index of a server-side stage. Returns the
 * 0-based position in NARRATIVE_STAGE_ORDER, or -1 if the stage is
 * `done` or otherwise not in the timeline.
 */
export function stageIndex(stage: AutopilotStage): number {
    return NARRATIVE_STAGE_ORDER.indexOf(stage)
}

export const TOTAL_STAGES = NARRATIVE_STAGE_ORDER.length
