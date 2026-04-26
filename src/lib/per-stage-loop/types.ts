/**
 * @file per-stage-loop/types.ts — types for the per-stage improvement loop.
 *
 * @description Tristan-directed (2026-04-26 NIGHT): each pipeline stage
 * (Chase, Max, BOM, Finn, Suppliers, Fang, Proofreader, Oracle) gets its
 * own iteration loop with: (a) per-stage golden-input regression set,
 * (b) per-stage scoring rubric, (c) per-stage council, (d) loop counter
 * independent of full-pipeline regens. Improvements compound async.
 *
 * Full-pipeline regens become integration tests, not the only feedback
 * loop. Wall-clock per iteration drops 5-10×.
 */

export type StageName =
    | "chase-regulatory"
    | "max-decompose"
    | "max-expand"
    | "bom-skeleton"
    | "bom-expand"
    | "finn-cost"
    | "supplier-match"
    | "fang-review"
    | "proofreader"
    | "oracle"

/** Per-stage golden input — one input case from a frozen regression set. */
export interface StageGoldenInput {
    /** Stable identifier so we can diff outputs across loops. */
    id: string
    /** Human-readable description for the run report. */
    label: string
    /** The actual input payload. Shape is stage-specific; cast at the call site. */
    payload: Record<string, unknown>
}

/** Per-stage output — what the specialist produced for one input case. */
export interface StageOutput {
    inputId: string
    /** Loop number when this output was produced. */
    loop: number
    /** Engine commit SHA at the time. */
    engineCommit: string
    /** Wall-clock ms for the specialist call. */
    elapsedMs: number
    /** Cost in pence (rough estimate from token usage if available). */
    costPence: number
    /** The specialist's raw output — shape is stage-specific. */
    output: Record<string, unknown>
    /** Errors / warnings surfaced during the run (empty array on clean run). */
    diagnostics: string[]
}

/** Per-stage council critique on one output. */
export interface StageScore {
    inputId: string
    /** Aggregate 0-10 score. */
    score: number
    /** Per-dimension breakdown — names are stage-specific. */
    dimensions: Record<string, number>
    /** One-line summary council members agreed on. */
    summary: string
    /** Top concrete fix the council surfaced (if score < 8). */
    nextFix: string | null
    /** Cost in pence for the critique. */
    costPence: number
}

/** Result of one full per-stage loop iteration. */
export interface StageLoopResult {
    stage: StageName
    loop: number
    engineCommit: string
    inputs: number
    outputs: StageOutput[]
    scores: StageScore[]
    /** Mean score across all inputs. */
    aggregateScore: number
    /** Did this loop improve vs the prior loop's score? Null for first loop. */
    deltaSincePrior: number | null
    /** Total cost (council + specialist) in pence. */
    totalCostPence: number
    completedAt: string
}

/** Per-stage adapter — concrete stages implement this interface. */
export interface StageAdapter {
    name: StageName
    /** Load the frozen golden input set. */
    loadGoldenInputs(): Promise<StageGoldenInput[]>
    /** Run the specialist in isolation against one input. */
    runOne(input: StageGoldenInput): Promise<StageOutput>
    /** Build the council critique prompt for one output. */
    buildCouncilPrompt(input: StageGoldenInput, output: StageOutput): string
    /** Run the council against an output. Returns aggregated score + dim breakdown. */
    fireCouncil(input: StageGoldenInput, output: StageOutput): Promise<StageScore>
    /** Sanity check that the loop is set up properly (golden inputs present, etc.). */
    selfCheck(): Promise<{ ok: boolean; error?: string }>
}
