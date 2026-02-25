/**
 * @file message-parsers.ts
 *
 * @description Pure parsing, stripping, and validation functions for specialist
 * message content. Extracted from brief-specialist-dialog.tsx to make them
 * independently testable and reusable.
 *
 * All functions here:
 * - Take plain string or typed-object inputs
 * - Have zero React dependencies
 * - Return plain values (string, boolean, typed object, null, or array)
 *
 * @audit Extracted 2026-02-25 from src/app/(platform)/agents/brief-specialist-dialog.tsx
 *        (refactor step 1 of 5). No logic changes — code moved verbatim.
 *
 * @related
 * - Consumer: src/app/(platform)/agents/brief-specialist-dialog.tsx
 * - Execution plan types: src/lib/agents/execution-plan-types.ts
 * - Chart spec: src/lib/agents/tools/chart-spec.ts
 * - External action: src/lib/agents/tools/permission-guard.ts
 * - Page action: src/lib/agents/tools/page-action-types.ts
 * - Structured output: src/lib/agents/tools/structured-output-spec.ts
 */

import type { ExecutionPlan, PlanStep } from "@/lib/agents/execution-plan-types"
import { validateChartSpec } from "@/lib/agents/tools/chart-spec"
import type { ChartSpec } from "@/lib/agents/tools/chart-spec"
import { validateStructuredOutput } from "@/lib/agents/tools/structured-output-spec"
import type { StructuredOutputSpec } from "@/lib/agents/tools/structured-output-spec"
import { validateExternalAction } from "@/lib/agents/tools/permission-guard"
import type { ProposedExternalAction } from "@/lib/agents/tools/permission-guard"
import { validatePageAction } from "@/lib/agents/tools/page-action-types"
import type { ProposedPageAction } from "@/lib/agents/tools/page-action-types"
import type { SpecialistId } from "@/app/(platform)/agents/specialists-data"

// ─── Types ──────────────────────────────────────────────────────────────────

/** Valid action types for specialist proposals. */
export type ProposedActionType = "objective" | "task" | "archive_objective" | "archive_task"

/** Structured proposal from the Specialist for one-click creation or archival (parsed from PROPOSED_ACTIONS block). */
export interface ProposedAction {
    type: ProposedActionType
    title: string
    description?: string
    /** For tasks: exact title of an objective in the same batch to link under. */
    objectiveTitle?: string
    /** For objectives: title of the strategic goal this objective should be nested under. */
    strategicGoalTitle?: string
    /** ISO date (YYYY-MM-DD) for when this item should start. */
    startDate?: string
    /** ISO date (YYYY-MM-DD) for when this item should end. */
    endDate?: string
    /** AI-estimated duration in weeks (1-12). Used to auto-schedule staggered start/end dates. */
    estimatedWeeks?: number
}

interface ProposedEdit {
    artifactId: string
    title: string
    changeSummary: string
}

// ─── Utility ────────────────────────────────────────────────────────────────

/** Strip the hidden complexity classification tag the fast model emits for triage. */
export function stripComplexityTags(text: string): string {
    return text.replace(/<!--\s*complexity\s*:\s*(simple|complex)\s*-->/g, "").trim()
}

/** Whether a proposed action is destructive (archive/remove). */
export function isDestructiveAction(action: ProposedAction): boolean {
    return action.type === "archive_objective" || action.type === "archive_task"
}

// ─── PROPOSED_ACTIONS Parsing ────────────────────────────────────────────────

const PROPOSED_ACTIONS_PATTERNS: RegExp[] = [
    /<!--\s*PROPOSED_ACTIONS\s*([\s\S]*?)\s*-->/i,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?PROPOSED_ACTIONS\s*\n?([\s\S]*?)\s*(?:-->)?\s*```/i,
    /PROPOSED_ACTIONS\s*\n\s*(\[[\s\S]*?\])\s*(?:-->)?/i,
    /PROPOSED_ACTIONS\s*(\[[\s\S]*?\])\s*(?:-->)?/i,
]

const STRIP_PROPOSED_ACTIONS_PATTERNS: RegExp[] = [
    /<!--\s*PROPOSED_ACTIONS\s*[\s\S]*?\s*-->/gi,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?PROPOSED_ACTIONS\s*\n?[\s\S]*?\s*(?:-->)?\s*```/gi,
    /PROPOSED_ACTIONS\s*\n?\s*\[[\s\S]*?\]\s*(?:-->)?/gi,
]

const STRIP_REDUNDANT_JSON_PATTERN =
    /```(?:json)?\s*\n\s*\{[\s\S]*?(?:"objectiveTitle"|"strategicGoalTitle"|"taskTitle"|"objectiveDescription")[\s\S]*?\}\s*\n```/gi

function validateProposedActions(parsed: unknown): ProposedAction[] {
    if (!Array.isArray(parsed)) return []
    const VALID_TYPES: ProposedActionType[] = ["objective", "task", "archive_objective", "archive_task"]
    return parsed.filter(
        (item): item is ProposedAction =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as ProposedAction).type === "string" &&
            typeof (item as ProposedAction).title === "string" &&
            VALID_TYPES.includes((item as ProposedAction).type as ProposedActionType)
    )
}

/**
 * Parse PROPOSED_ACTIONS JSON block from Specialist response.
 *
 * @param content - The raw specialist response text
 * @returns Array of valid ProposedAction items, or empty array if none found
 */
export function parseProposedActions(content: string): ProposedAction[] {
    for (let i = 0; i < PROPOSED_ACTIONS_PATTERNS.length; i++) {
        const pattern = PROPOSED_ACTIONS_PATTERNS[i]
        const match = content.match(pattern)
        if (!match || !match[1]) continue

        try {
            const raw = match[1].trim()
            const parsed = JSON.parse(raw) as unknown
            const actions = validateProposedActions(parsed)
            if (actions.length > 0) {
                if (i > 0) {
                    console.info("[ProposedActions] Parsed via fallback pattern", i, "—", actions.length, "actions found")
                }
                return actions
            }
        } catch (parseErr) {
            console.warn("[ProposedActions] Pattern", i, "matched but JSON parse failed:", {
                snippet: match[1].slice(0, 200),
                error: parseErr instanceof Error ? parseErr.message : "Unknown parse error",
            })
        }
    }

    if (content.includes("PROPOSED_ACTIONS")) {
        console.warn("[ProposedActions] Content contains PROPOSED_ACTIONS keyword but no pattern matched. Tail:", content.slice(-500))
    }

    return []
}

/**
 * Remove PROPOSED_ACTIONS blocks and redundant JSON code blocks from content.
 *
 * @param content - Raw specialist response with potential PROPOSED_ACTIONS blocks
 * @returns Content with all structured data blocks stripped
 */
export function stripProposedActionsBlock(content: string): string {
    let result = content
    for (const pattern of STRIP_PROPOSED_ACTIONS_PATTERNS) {
        result = result.replace(pattern, "")
    }
    result = result.replace(STRIP_REDUNDANT_JSON_PATTERN, "")
    return result.trim()
}

// ─── PROPOSED_PLAN Parsing ───────────────────────────────────────────────────

const PROPOSED_PLAN_PATTERNS: RegExp[] = [
    /<!--\s*PROPOSED_PLAN\s*([\s\S]*?)\s*-->/i,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?PROPOSED_PLAN\s*\n?([\s\S]*?)\s*(?:-->)?\s*```/i,
    /PROPOSED_PLAN\s*\n\s*(\{[\s\S]*?\})\s*(?:-->)?/i,
]

const STRIP_PROPOSED_PLAN_PATTERNS: RegExp[] = [
    /<!--\s*PROPOSED_PLAN\s*[\s\S]*?\s*-->/gi,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?PROPOSED_PLAN\s*\n?[\s\S]*?\s*(?:-->)?\s*```/gi,
    /PROPOSED_PLAN\s*\n?\s*\{[\s\S]*?\}\s*(?:-->)?/gi,
]

/**
 * Parse PROPOSED_PLAN JSON block from specialist response.
 *
 * @param content - The raw specialist response text
 * @param proposedBy - The specialist ID who proposed this plan
 * @returns Parsed ExecutionPlan or null if no valid plan found
 */
export function parseProposedPlan(content: string, proposedBy: string): ExecutionPlan | null {
    for (const pattern of PROPOSED_PLAN_PATTERNS) {
        const match = content.match(pattern)
        if (!match?.[1]) continue
        try {
            const raw = JSON.parse(match[1].trim()) as { title?: string; steps?: unknown[] }
            if (raw.title && Array.isArray(raw.steps) && raw.steps.length >= 2 && raw.steps.length <= 10) {
                const steps: PlanStep[] = raw.steps
                    .filter((s): s is Record<string, unknown> =>
                        typeof s === "object" && s !== null &&
                        typeof (s as Record<string, unknown>).title === "string" &&
                        typeof (s as Record<string, unknown>).prompt === "string"
                    )
                    .map((s, i) => ({
                        index: i,
                        specialistId: (typeof s.specialistId === "string" ? s.specialistId : proposedBy) as SpecialistId,
                        title: s.title as string,
                        prompt: s.prompt as string,
                        description: (typeof s.description === "string" ? s.description : "") as string,
                        outputLabel: (typeof s.outputLabel === "string" ? s.outputLabel : `Step ${i + 1} output`) as string,
                    }))
                if (steps.length >= 2) {
                    return {
                        id: `plan_${Date.now()}`,
                        title: raw.title,
                        proposedBy: proposedBy as SpecialistId,
                        steps,
                        executions: {},
                        currentStep: -1,
                        status: "proposed",
                        createdAt: new Date().toISOString(),
                    }
                }
            }
        } catch {
            // JSON parse failed — try next pattern
        }
    }
    return null
}

/** Remove PROPOSED_PLAN blocks from display content */
export function stripProposedPlanBlock(content: string): string {
    let result = content
    for (const pattern of STRIP_PROPOSED_PLAN_PATTERNS) {
        result = result.replace(pattern, "")
    }
    return result.trim()
}

// ─── PROPOSED_EDIT Parsing ───────────────────────────────────────────────────

const PROPOSED_EDIT_PATTERNS: RegExp[] = [
    /<!--\s*PROPOSED_EDIT\s*([\s\S]*?)\s*-->/i,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?PROPOSED_EDIT\s*\n?([\s\S]*?)\s*(?:-->)?\s*```/i,
    /PROPOSED_EDIT\s*\n\s*(\{[\s\S]*?\})\s*(?:-->)?/i,
]

const STRIP_PROPOSED_EDIT_PATTERNS: RegExp[] = [
    /<!--\s*PROPOSED_EDIT\s*[\s\S]*?\s*-->/gi,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?PROPOSED_EDIT\s*\n?[\s\S]*?\s*(?:-->)?\s*```/gi,
    /PROPOSED_EDIT\s*\n?\s*\{[\s\S]*?\}\s*(?:-->)?/gi,
]

/**
 * Parse PROPOSED_EDIT JSON block from specialist response.
 *
 * @param content - The raw specialist response text
 * @returns Parsed ProposedEdit or null if none found
 */
export function parseProposedEdit(content: string): ProposedEdit | null {
    for (let i = 0; i < PROPOSED_EDIT_PATTERNS.length; i++) {
        const pattern = PROPOSED_EDIT_PATTERNS[i]
        const match = content.match(pattern)
        if (!match?.[1]) continue

        try {
            const raw = JSON.parse(match[1].trim()) as Record<string, unknown>
            if (
                typeof raw.artifactId === "string" &&
                typeof raw.title === "string" &&
                typeof raw.changeSummary === "string"
            ) {
                if (i > 0) {
                    console.info("[ProposedEdit] Parsed via fallback pattern", i)
                }
                return {
                    artifactId: raw.artifactId,
                    title: raw.title,
                    changeSummary: raw.changeSummary,
                }
            }
        } catch (parseErr) {
            console.warn("[ProposedEdit] Pattern", i, "matched but JSON parse failed:", {
                snippet: match[1].slice(0, 200),
                error: parseErr instanceof Error ? parseErr.message : "Unknown parse error",
            })
        }
    }

    if (content.includes("PROPOSED_EDIT")) {
        console.warn("[ProposedEdit] Content contains PROPOSED_EDIT keyword but no pattern matched.")
    }

    return null
}

/** Remove PROPOSED_EDIT blocks from display content */
export function stripProposedEditBlock(content: string): string {
    let result = content
    for (const pattern of STRIP_PROPOSED_EDIT_PATTERNS) {
        result = result.replace(pattern, "")
    }
    return result.trim()
}

// ─── CHART Block Parsing ─────────────────────────────────────────────────────

const CHART_PATTERNS: RegExp[] = [
    /<!--\s*CHART\s*([\s\S]*?)\s*-->/gi,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?CHART\s*\n?([\s\S]*?)\s*(?:-->)?\s*```/gi,
]

const STRIP_CHART_PATTERNS: RegExp[] = [
    /<!--\s*CHART\s*[\s\S]*?\s*-->/gi,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?CHART\s*\n?[\s\S]*?\s*(?:-->)?\s*```/gi,
]

/**
 * Parse all CHART JSON blocks from specialist response.
 *
 * @param content - The raw specialist response text
 * @returns Array of validated ChartSpec objects (empty if none found)
 */
export function parseCharts(content: string): ChartSpec[] {
    const charts: ChartSpec[] = []
    for (const pattern of CHART_PATTERNS) {
        // GOTCHA: Reset lastIndex before each exec loop since patterns use the `g` flag
        pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(content)) !== null) {
            if (!match[1]) continue
            try {
                const parsed = JSON.parse(match[1].trim())
                const validated = validateChartSpec(parsed)
                if (validated) {
                    charts.push(validated)
                }
            } catch {
                // JSON parse failed — skip this match
            }
        }
    }
    return charts
}

/** Remove all CHART blocks from display content. */
export function stripChartBlocks(content: string): string {
    let result = content
    for (const pattern of STRIP_CHART_PATTERNS) {
        result = result.replace(pattern, "")
    }
    return result.trim()
}

// ─── PROPOSED_EXTERNAL_ACTION Parsing ───────────────────────────────────────

const PROPOSED_EXTERNAL_ACTION_PATTERNS: RegExp[] = [
    /<!--\s*PROPOSED_EXTERNAL_ACTION\s*([\s\S]*?)\s*-->/gi,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?PROPOSED_EXTERNAL_ACTION\s*\n?([\s\S]*?)\s*(?:-->)?\s*```/gi,
    /PROPOSED_EXTERNAL_ACTION\s*\n\s*(\{[\s\S]*?\})\s*(?:-->)?/gi,
]

const STRIP_EXTERNAL_ACTION_PATTERNS: RegExp[] = [
    /<!--\s*PROPOSED_EXTERNAL_ACTION\s*[\s\S]*?\s*-->/gi,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?PROPOSED_EXTERNAL_ACTION\s*\n?[\s\S]*?\s*(?:-->)?\s*```/gi,
    /PROPOSED_EXTERNAL_ACTION\s*\n?\s*\{[\s\S]*?\}\s*(?:-->)?/gi,
]

/**
 * Parse all PROPOSED_EXTERNAL_ACTION JSON blocks from specialist response.
 *
 * @param content - The raw specialist response text
 * @returns Array of validated ProposedExternalAction objects (empty if none found)
 */
export function parseExternalActions(content: string): ProposedExternalAction[] {
    const actions: ProposedExternalAction[] = []
    for (const pattern of PROPOSED_EXTERNAL_ACTION_PATTERNS) {
        // GOTCHA: Reset lastIndex before each exec loop since patterns use the `g` flag
        pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(content)) !== null) {
            if (!match[1]) continue
            try {
                const parsed = JSON.parse(match[1].trim())
                const validated = validateExternalAction(parsed)
                if (validated) {
                    actions.push(validated)
                }
            } catch {
                // JSON parse failed — skip this match
            }
        }
    }

    if (actions.length === 0 && content.includes("PROPOSED_EXTERNAL_ACTION")) {
        console.warn("[ExternalActions] Content contains PROPOSED_EXTERNAL_ACTION keyword but no pattern matched.")
    }

    return actions
}

/** Remove all PROPOSED_EXTERNAL_ACTION blocks from display content. */
export function stripExternalActionBlocks(content: string): string {
    let result = content
    for (const pattern of STRIP_EXTERNAL_ACTION_PATTERNS) {
        result = result.replace(pattern, "")
    }
    return result.trim()
}

// ─── PROPOSED_PAGE_ACTION Parsing ───────────────────────────────────────────

const PROPOSED_PAGE_ACTION_PATTERNS: RegExp[] = [
    /<!--\s*PROPOSED_PAGE_ACTION\s*([\s\S]*?)\s*-->/gi,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?PROPOSED_PAGE_ACTION\s*\n?([\s\S]*?)\s*(?:-->)?\s*```/gi,
    /PROPOSED_PAGE_ACTION\s*\n\s*(\{[\s\S]*?\})\s*(?:-->)?/gi,
]

const STRIP_PAGE_ACTION_PATTERNS: RegExp[] = [
    /<!--\s*PROPOSED_PAGE_ACTION\s*[\s\S]*?\s*-->/gi,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?PROPOSED_PAGE_ACTION\s*\n?[\s\S]*?\s*(?:-->)?\s*```/gi,
    /PROPOSED_PAGE_ACTION\s*\n?\s*\{[\s\S]*?\}\s*(?:-->)?/gi,
]

/**
 * Parse all PROPOSED_PAGE_ACTION JSON blocks from specialist response.
 *
 * @param content - The raw specialist response text
 * @returns Array of validated ProposedPageAction objects (empty if none found)
 */
export function parsePageActions(content: string): ProposedPageAction[] {
    const actions: ProposedPageAction[] = []
    for (const pattern of PROPOSED_PAGE_ACTION_PATTERNS) {
        pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(content)) !== null) {
            if (!match[1]) continue
            try {
                const parsed = JSON.parse(match[1].trim())
                const validated = validatePageAction(parsed)
                if (validated) {
                    actions.push(validated)
                }
            } catch {
                // JSON parse failed — skip this match
            }
        }
    }

    if (actions.length === 0 && content.includes("PROPOSED_PAGE_ACTION")) {
        console.warn("[PageActions] Content contains PROPOSED_PAGE_ACTION keyword but no pattern matched.")
    }

    return actions
}

/** Remove all PROPOSED_PAGE_ACTION blocks from display content. */
export function stripPageActionBlocks(content: string): string {
    let result = content
    for (const pattern of STRIP_PAGE_ACTION_PATTERNS) {
        result = result.replace(pattern, "")
    }
    return result.trim()
}

// ─── STRUCTURED_OUTPUT Parsing ───────────────────────────────────────────────

const STRUCTURED_OUTPUT_PATTERNS: RegExp[] = [
    /<!--\s*STRUCTURED_OUTPUT\s*([\s\S]*?)\s*-->/gi,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?STRUCTURED_OUTPUT\s*\n?([\s\S]*?)\s*(?:-->)?\s*```/gi,
]

const STRIP_STRUCTURED_OUTPUT_PATTERNS: RegExp[] = [
    /<!--\s*STRUCTURED_OUTPUT\s*[\s\S]*?\s*-->/gi,
    /```(?:json)?\s*\n?\s*(?:<!--\s*)?STRUCTURED_OUTPUT\s*\n?[\s\S]*?\s*(?:-->)?\s*```/gi,
]

/** Parse all STRUCTURED_OUTPUT JSON blocks from specialist response. */
export function parseStructuredOutputs(content: string): StructuredOutputSpec[] {
    const outputs: StructuredOutputSpec[] = []
    for (const pattern of STRUCTURED_OUTPUT_PATTERNS) {
        pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(content)) !== null) {
            if (!match[1]) continue
            try {
                const parsed = JSON.parse(match[1].trim())
                const validated = validateStructuredOutput(parsed)
                if (validated) {
                    outputs.push(validated)
                }
            } catch {
                // JSON parse failed — skip
            }
        }
    }
    return outputs
}

/** Remove all STRUCTURED_OUTPUT blocks from display content. */
export function stripStructuredOutputBlocks(content: string): string {
    let result = content
    for (const pattern of STRIP_STRUCTURED_OUTPUT_PATTERNS) {
        result = result.replace(pattern, "")
    }
    return result.trim()
}
