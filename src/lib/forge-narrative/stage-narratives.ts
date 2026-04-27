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
    "generating_illustration",
    "matching_suppliers",
    "running_fang_reviews",
    "proofreading",
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
        inFlight: "Generating a hero illustration of the product so the report has something to look at.",
        narrative:
            "Generated a hero illustration of the product so the report has a clean visual on the cover and the executive summary.",
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
