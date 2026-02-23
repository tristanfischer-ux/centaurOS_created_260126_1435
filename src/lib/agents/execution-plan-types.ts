/**
 * @file execution-plan-types.ts
 *
 * @description Types and helpers for multi-step execution plans.
 * Specialists can propose plans with 2-5 sequential steps, each producing
 * a deliverable that feeds into the next. Steps can span multiple specialists
 * (e.g., Sage → Finn → Fiona for fundraising prep).
 *
 * Plans are proposed via <!-- PROPOSED_PLAN --> blocks in specialist responses,
 * parsed client-side, and rendered as interactive ExecutionPlanCards.
 *
 * @related
 * - Parsing: src/app/(platform)/agents/brief-specialist-dialog.tsx
 * - UI: src/components/specialists/execution-plan-card.tsx
 * - Execute route: src/app/api/agents/execute/route.ts
 */

import type { SpecialistId } from "@/app/(platform)/agents/specialists-data"

// ─── Types ──────────────────────────────────────────────────────────

/** A single step in a multi-step execution plan */
export interface PlanStep {
    /** Step index (0-based) */
    index: number
    /** Which specialist owns this step */
    specialistId: SpecialistId
    /** Human-readable title */
    title: string
    /** The prompt to execute for this step */
    prompt: string
    /** Description shown to the user before execution */
    description: string
    /** Label for what this step produces (used in context threading) */
    outputLabel: string
}

/** Execution status for a single step */
export type StepStatus = "pending" | "running" | "review" | "approved" | "error" | "skipped"

/** Runtime state for a step during execution */
export interface StepExecution {
    status: StepStatus
    /** The full response output from executing this step */
    output?: string
    /** Error message if the step failed */
    error?: string
    startedAt?: string
    completedAt?: string
}

/** Overall plan status */
export type PlanStatus = "proposed" | "running" | "paused" | "completed" | "cancelled"

/** A complete execution plan as proposed by a specialist */
export interface ExecutionPlan {
    /** Unique plan ID (generated client-side) */
    id: string
    /** Human-readable plan title */
    title: string
    /** Which specialist proposed this plan */
    proposedBy: SpecialistId
    /** The ordered steps */
    steps: PlanStep[]
    /** Runtime execution state per step index */
    executions: Record<number, StepExecution>
    /** Current step index (-1 if not started, steps.length if complete) */
    currentStep: number
    /** Overall plan status */
    status: PlanStatus
    /** ISO timestamp when plan was created */
    createdAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Build upstream context string from completed steps.
 *
 * Concatenates all approved step outputs into a markdown document
 * that gets injected as context for the next step. This is how
 * Step 2 "knows" what Step 1 produced.
 *
 * @param plan - The execution plan
 * @param upToIndex - Build context from steps 0..(upToIndex-1)
 * @returns Markdown string with all prior step outputs
 */
export function buildStepContext(plan: ExecutionPlan, upToIndex: number): string {
    const parts: string[] = []
    for (let i = 0; i < upToIndex; i++) {
        const step = plan.steps[i]
        const exec = plan.executions[i]
        if (exec?.status === "approved" && exec.output) {
            parts.push(`## Step ${i + 1}: ${step.title} (${step.outputLabel})\n\n${exec.output}`)
        }
    }
    return parts.length > 0
        ? `# Prior Step Outputs\n\n${parts.join("\n\n---\n\n")}`
        : ""
}

/**
 * Calculate the number of completed (approved) steps in a plan.
 */
export function countCompletedSteps(plan: ExecutionPlan): number {
    return Object.values(plan.executions).filter((e) => e.status === "approved").length
}

/**
 * Get the next pending step index, or -1 if all steps are done.
 */
export function getNextPendingStep(plan: ExecutionPlan): number {
    for (let i = 0; i < plan.steps.length; i++) {
        const exec = plan.executions[i]
        if (!exec || exec.status === "pending") return i
    }
    return -1
}
