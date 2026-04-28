/**
 * @file types.ts — Quality Gates v2.0 shared type definitions
 *
 * @description All TypeScript types for the gate verdicts system.
 * Three distinct gate types (per GLM 5.1 council recommendation):
 *   - DeterministicGate: binary pass/fail from code alone (Gates 2, 3, 5, 6)
 *   - LLMVoteGate: 2-of-3 model vote required (Gate 1)
 *   - HybridGate: deterministic primary + LLM secondary for narrative (Gate 4)
 *
 * Phase 2 sub-agents register their gate implementations in registry.ts.
 * This file is import-only — no side effects.
 *
 * @see src/lib/forge-v2/stage-gates/runner.ts    — orchestrator
 * @see src/lib/forge-v2/stage-gates/registry.ts  — gate→stage map
 * @see supabase/migrations/20260428100000_quality_gates_v2.sql — DB schema
 */

// ── Primitive ID types ─────────────────────────────────────────────────────

/** Numeric gate identifier. Gates 1–7 per the spec. */
export type GateId = 1 | 2 | 3 | 4 | 5 | 6 | 7

// ── DB row types ────────────────────────────────────────────────────────────

/**
 * One model's vote, included in `model_votes` JSON for LLM-voted gates.
 * Stored as JSONB in gate_verdicts.model_votes.
 */
export interface ModelVote {
    model: string
    verdict: "PASS" | "FAIL" | "WARN"
    reasoning: string
}

/**
 * Result object for deterministic (code-only) gates.
 * Stored as JSONB in gate_verdicts.deterministic_result.
 */
export interface DeterministicCheckResult {
    check_name: string
    passed: boolean
    /** Human-readable actual value, e.g. 'INFEASIBLE', '2 suppliers' */
    actual: string
    /** Human-readable expected value, e.g. 'FEASIBLE', '≥3 suppliers' */
    expected: string
}

/**
 * Outcome returned by the runner after firing remediation.
 * Stored for audit; the runner persists the verdict row before firing.
 */
export interface RemediationOutcome {
    fired: boolean
    target_stage: string | null
    context_injected: string | null
}

/**
 * Full gate verdict — mirrors the gate_verdicts DB row exactly.
 * One row is written to DB per gate evaluation attempt.
 */
export interface GateVerdict {
    id?: string // UUID, assigned by DB default
    project_id: string
    gate_id: GateId
    /** Incremented when the user triggers a full re-regen */
    pipeline_run_iteration: number
    attempt: 1 | 2
    verdict: "PASS" | "FAIL" | "WARN"
    /** null on PASS */
    severity: "P0" | "P1" | null
    /** null on PASS */
    failure_details: string | null
    /** Populated for LLM-voted gates (1, 4, 7). null for deterministic. */
    model_votes: ModelVote[] | null
    /** Populated for deterministic gates (2, 3, 5, 6). null for LLM gates. */
    deterministic_result: DeterministicCheckResult | null
    remediation_fired: boolean
    remediation_target_stage: string | null
    remediation_context_injected: string | null
    uncertainty_marker_required: boolean
    uncertainty_marker_text: string | null
    created_at?: string // ISO 8601, assigned by DB default
}

// ── Gate input context ─────────────────────────────────────────────────────

/**
 * Minimal project context passed to every gate runner.
 * Narrow on purpose — gates read additional data themselves if needed.
 */
export interface GateContext {
    projectId: string
    pipelineRunIteration: number
    attempt: 1 | 2
}

// ── Gate interface contracts ────────────────────────────────────────────────

/**
 * DeterministicGate — binary pass/fail from code alone.
 * Used by Gates 2 (module key-parts), 3 (solver feasibility),
 * 5 (supplier liveness), 6 (standards hallucination).
 *
 * @typeParam TInput - The shape of data the gate reads from DB/state
 */
export interface DeterministicGate<TInput> {
    kind: "deterministic"
    gateId: GateId
    /** Human-readable name, used in logs and the verdict row */
    name: string
    /** Load the data this gate needs from Supabase */
    loadInput: (ctx: GateContext) => Promise<TInput>
    /** Pure check — no side effects. Returns result synchronously. */
    check: (input: TInput) => DeterministicCheckResult
}

/**
 * LLMVoteGate — 2-of-3 model voting required.
 * Used by Gate 1 (brief scope alignment).
 *
 * Voting protocol:
 *   - 2-of-3 FAIL = block (verdict: FAIL)
 *   - Any single model flagging P0 with specific evidence = block
 *   - 1-of-3 FAIL without P0 evidence = WARN (not block)
 *   - All PASS = PASS
 *   - Model timeout = counted as WARN (per spec)
 *
 * @typeParam TInput - The shape of data the gate reads from DB/state
 */
export interface LLMVoteGate<TInput> {
    kind: "llm_vote"
    gateId: GateId
    name: string
    /** The three models to call in parallel. Must be different lineages. */
    models: [string, string, string]
    loadInput: (ctx: GateContext) => Promise<TInput>
    /** Build the prompt each model receives */
    buildPrompt: (input: TInput) => string
    /** Parse each model's raw text response into a ModelVote */
    parseVote: (modelId: string, rawResponse: string) => ModelVote
    /** Aggregate three votes into a final verdict */
    aggregate: (votes: ModelVote[]) => {
        verdict: "PASS" | "FAIL" | "WARN"
        severity: "P0" | "P1" | null
        failure_details: string | null
    }
}

/**
 * HybridGate — deterministic primary + LLM secondary.
 * Used by Gate 4 (cost realism).
 *
 * Protocol:
 *   - Deterministic check runs first and is the AUTHORITY.
 *   - If deterministic returns FAIL → block, no LLM call.
 *   - If deterministic returns PASS/WARN → run LLM to check
 *     narrative-only contradictions (e.g. Finn says costs are fine
 *     but the BOM total is 3.8× the target).
 *   - NEVER silently rewrite the founder's brief target.
 *
 * @typeParam TInput - The shape of data the gate reads from DB/state
 */
export interface HybridGate<TInput> {
    kind: "hybrid"
    gateId: GateId
    name: string
    /** The three models to call if deterministic check passes */
    models: [string, string, string]
    loadInput: (ctx: GateContext) => Promise<TInput>
    deterministicCheck: (input: TInput) => DeterministicCheckResult
    buildPrompt: (input: TInput, deterministicResult: DeterministicCheckResult) => string
    parseVote: (modelId: string, rawResponse: string) => ModelVote
    aggregate: (
        deterministicResult: DeterministicCheckResult,
        votes: ModelVote[],
    ) => {
        verdict: "PASS" | "FAIL" | "WARN"
        severity: "P0" | "P1" | null
        failure_details: string | null
    }
}

// ── Discriminated union dispatcher type ────────────────────────────────────

/**
 * GateRunner — discriminated union over all three gate types.
 * The runner.ts dispatcher uses this to pick the right execution path.
 *
 * Phase 2 sub-agents export a value satisfying one of these three shapes
 * and register it in registry.ts STAGE_GATE_MAP.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GateRunner = DeterministicGate<any> | LLMVoteGate<any> | HybridGate<any>

// ── Runner return type ─────────────────────────────────────────────────────

/**
 * What runGate() returns to the cron handler after evaluating a gate.
 * The cron handler uses verdict + attempts_remaining to decide whether
 * to re-fire the upstream stage or allow the pipeline to advance.
 */
export interface GateRunResult {
    verdict: "PASS" | "FAIL" | "WARN"
    /** Number of further attempts allowed (0 = no more retries) */
    attempts_remaining: number
    /** How many total FAIL verdicts exist for this gate in this iteration */
    fail_count: number
    /** True when ENABLE_QUALITY_GATES=false — no gate was evaluated */
    skipped?: boolean
    /** The DB row that was written (null if skipped) */
    verdict_row?: GateVerdict
}
