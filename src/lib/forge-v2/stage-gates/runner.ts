/**
 * @file runner.ts — Quality Gates v2.0 gate orchestrator
 *
 * @description Pure orchestrator for the quality-gates system. Handles:
 *   1. Feature-flag check (ENABLE_QUALITY_GATES env var)
 *   2. Pipeline-stage lock acquisition (prevents re-fire races)
 *   3. Attempt counting from gate_verdicts history
 *   4. Verdict persistence to DB BEFORE firing remediation
 *   5. Dispatching to the correct gate runner (deterministic / llm_vote / hybrid)
 *   6. Lock release on completion or timeout
 *
 * Individual gate implementations live in gate-N.ts files.
 * The registry.ts file maps stages to gate runners.
 *
 * CRITICAL INVARIANT (per GLM 5.1 council):
 *   Persist the verdict row BEFORE firing any remediation. A crash
 *   mid-remediation must not lose the attempt count.
 *
 * @see src/lib/forge-v2/stage-gates/types.ts    — interfaces
 * @see src/lib/forge-v2/stage-gates/registry.ts — stage→gate map
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type {
    GateRunner,
    GateContext,
    GateVerdict,
    GateRunResult,
    ModelVote,
    DeterministicCheckResult,
} from "./types"

// ── Feature flag ────────────────────────────────────────────────────────────

/**
 * Check once per process startup. Gates are a no-op until this is 'true'.
 * Flip the Vercel env var to enable — no code deploy required.
 */
function isGatesEnabled(): boolean {
    return process.env.ENABLE_QUALITY_GATES === "true"
}

// ── Stage lock helpers ──────────────────────────────────────────────────────

const LOCK_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes; stale locks are presumed dead

/**
 * Acquire a pipeline_stage_locks row for (project_id, stage).
 * Returns true if the lock was acquired, false if someone else holds it.
 * Stale locks (>10 min old) are automatically overwritten.
 */
async function acquireLock(
    projectId: string,
    stage: string,
    lockedBy: string,
): Promise<boolean> {
    const admin = createAdminClient()
    const staleCutoff = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString()

    // Delete any stale lock first so our upsert can succeed
    await admin
        .from("pipeline_stage_locks")
        .delete()
        .eq("project_id", projectId)
        .eq("stage", stage)
        .lt("locked_at", staleCutoff)

    const { error } = await admin.from("pipeline_stage_locks").insert({
        project_id: projectId,
        stage,
        locked_by: lockedBy,
        locked_at: new Date().toISOString(),
    })

    if (error) {
        // Unique-key violation (23505) means another process holds a fresh lock
        if (error.code === "23505") return false
        // Any other error: log but treat as non-blocking (don't fail the gate)
        console.warn(
            `[gate-runner] acquireLock error for project=${projectId} stage=${stage}:`,
            error.message,
        )
        return true // proceed optimistically
    }

    return true
}

/**
 * Release the pipeline_stage_locks row for (project_id, stage).
 * Best-effort: if this fails, the lock will naturally expire in 10 min.
 */
async function releaseLock(projectId: string, stage: string): Promise<void> {
    const admin = createAdminClient()
    await admin
        .from("pipeline_stage_locks")
        .delete()
        .eq("project_id", projectId)
        .eq("stage", stage)
}

// ── Attempt counting ────────────────────────────────────────────────────────

/** Maximum gate evaluation attempts per pipeline iteration. Hard-coded to 2 per spec. */
const MAX_GATE_ATTEMPTS = 2

/**
 * Count how many FAIL verdicts exist for a given gate in the current iteration.
 * This is the attempt counter that the spec requires to survive cron-tick crashes
 * (it's in the DB, not in-memory).
 */
async function countFailedAttempts(
    projectId: string,
    gateId: number,
    pipelineRunIteration: number,
): Promise<number> {
    const admin = createAdminClient()
    const { count, error } = await admin
        .from("gate_verdicts")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("gate_id", gateId)
        .eq("pipeline_run_iteration", pipelineRunIteration)
        .eq("verdict", "FAIL")

    if (error) {
        console.warn(
            `[gate-runner] countFailedAttempts error gate_id=${gateId}:`,
            error.message,
        )
        return 0
    }

    return count ?? 0
}

// ── Verdict persistence ─────────────────────────────────────────────────────

/**
 * Persist a gate_verdicts row to the DB.
 * Called BEFORE any remediation fires — per the critical invariant above.
 */
async function persistVerdict(
    verdict: Omit<GateVerdict, "id" | "created_at">,
): Promise<GateVerdict> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from("gate_verdicts")
        .insert(verdict)
        .select()
        .single()

    if (error) {
        console.error("[gate-runner] persistVerdict failed:", error.message)
        // Return the verdict without a DB id so the caller can still act on it
        return verdict as GateVerdict
    }

    return data as GateVerdict
}

// ── Deterministic gate runner ───────────────────────────────────────────────

async function runDeterministicGate(
    gate: import("./types").DeterministicGate<unknown>,
    ctx: GateContext,
): Promise<{
    verdict: "PASS" | "FAIL" | "WARN"
    severity: "P0" | "P1" | null
    failure_details: string | null
    deterministic_result: DeterministicCheckResult
}> {
    const input = await gate.loadInput(ctx)
    // `check` may be sync (Gates 2/3/6) or async (Gate 5 — HEAD/GET liveness).
    // `await` handles both: a sync return is awaited as a resolved value;
    // an async Promise is awaited normally. Without this, async gates returned
    // a Promise object whose `.passed`/`.check_name`/`.actual`/`.expected` were
    // all `undefined`, producing the "undefined: expected undefined, got undefined"
    // failure_details we saw on Loop 20 (commit 4c957755 era).
    const result = await gate.check(input)

    return {
        verdict: result.passed ? "PASS" : "FAIL",
        severity: result.passed ? null : "P1",
        failure_details: result.passed
            ? null
            : `${result.check_name}: expected ${result.expected}, got ${result.actual}`,
        deterministic_result: result,
    }
}

// ── LLM vote gate runner ────────────────────────────────────────────────────

const LLM_VOTE_TIMEOUT_MS = 30_000 // 30 s; timeout → counted as WARN per spec

async function callModelWithTimeout(
    modelId: string,
    prompt: string,
): Promise<string> {
    // INTENT: Each gate's LLM call goes through the existing ask_alt_llm MCP
    // tool. This function is a stub for the Phase 2 gate implementations to
    // fill in with their specific OpenRouter/MCP call. The runner itself does
    // not import ask_alt_llm directly — gates own their model calls.
    //
    // DECISION: The runner does not know HOW to call models. It only knows
    // how to aggregate votes. This keeps the runner stable across model swaps.
    //
    // For Phase 2 gates: implement callModel() in your gate-N.ts file and pass
    // the result via parseVote. The runner calls parseVote on your raw output.
    void modelId
    void prompt
    void LLM_VOTE_TIMEOUT_MS
    throw new Error(
        "callModelWithTimeout is a stub. LLM gate implementations must supply their own model call in gate-N.ts and invoke the runner's runGate via the context.",
    )
}

async function runLLMVoteGate(
    gate: import("./types").LLMVoteGate<unknown>,
    ctx: GateContext,
): Promise<{
    verdict: "PASS" | "FAIL" | "WARN"
    severity: "P0" | "P1" | null
    failure_details: string | null
    model_votes: ModelVote[]
}> {
    const input = await gate.loadInput(ctx)
    const prompt = gate.buildPrompt(input)

    // Call the three models in parallel with a 30 s timeout each.
    // Timed-out models count as WARN per spec.
    const rawResults = await Promise.allSettled(
        gate.models.map((modelId) => callModelWithTimeout(modelId, prompt)),
    )

    const votes: ModelVote[] = rawResults.map((result, i) => {
        const modelId = gate.models[i]
        if (result.status === "fulfilled") {
            return gate.parseVote(modelId, result.value)
        }
        // Timeout or error → WARN (not FAIL — don't penalise network hiccups)
        return {
            model: modelId,
            verdict: "WARN" as const,
            reasoning: `Model call failed or timed out: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        }
    })

    const aggregated = gate.aggregate(votes)
    return { ...aggregated, model_votes: votes }
}

// ── Hybrid gate runner ──────────────────────────────────────────────────────

async function runHybridGate(
    gate: import("./types").HybridGate<unknown>,
    ctx: GateContext,
): Promise<{
    verdict: "PASS" | "FAIL" | "WARN"
    severity: "P0" | "P1" | null
    failure_details: string | null
    deterministic_result: DeterministicCheckResult
    model_votes: ModelVote[] | null
}> {
    const input = await gate.loadInput(ctx)
    const deterministicResult = gate.deterministicCheck(input)

    // Deterministic check is the AUTHORITY. If it fails, block immediately.
    if (!deterministicResult.passed) {
        return {
            verdict: "FAIL",
            severity: "P0",
            failure_details: `${deterministicResult.check_name}: expected ${deterministicResult.expected}, got ${deterministicResult.actual}`,
            deterministic_result: deterministicResult,
            model_votes: null,
        }
    }

    // Deterministic passed → run LLM secondary for narrative contradictions
    const prompt = gate.buildPrompt(input, deterministicResult)
    const rawResults = await Promise.allSettled(
        gate.models.map((modelId) => callModelWithTimeout(modelId, prompt)),
    )

    const votes: ModelVote[] = rawResults.map((result, i) => {
        const modelId = gate.models[i]
        if (result.status === "fulfilled") {
            return gate.parseVote(modelId, result.value)
        }
        return {
            model: modelId,
            verdict: "WARN" as const,
            reasoning: `Model call failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        }
    })

    const aggregated = gate.aggregate(deterministicResult, votes)
    return { ...aggregated, deterministic_result: deterministicResult, model_votes: votes }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * runGate — evaluate a gate for a project stage.
 *
 * Call this from the cron handler AFTER a stage's `done` advance and
 * BEFORE advancing to the next stage.
 *
 * Behaviour when ENABLE_QUALITY_GATES !== 'true':
 *   Returns { verdict: 'PASS', skipped: true, attempts_remaining: 2, fail_count: 0 }
 *   with zero DB writes or LLM calls.
 *
 * @param gate - The gate runner implementation (from registry.ts)
 * @param projectId - The cad_lab_projects.id being evaluated
 * @param stage - The stage that just completed (used as lock key)
 * @param pipelineRunIteration - Current iteration counter (bump on re-regen)
 */
export async function runGate(
    gate: GateRunner,
    projectId: string,
    stage: string,
    pipelineRunIteration: number = 1,
): Promise<GateRunResult> {
    // ── Feature flag — no-op path ──
    if (!isGatesEnabled()) {
        return {
            verdict: "PASS",
            attempts_remaining: MAX_GATE_ATTEMPTS,
            fail_count: 0,
            skipped: true,
        }
    }

    const failedSoFar = await countFailedAttempts(
        projectId,
        gate.gateId,
        pipelineRunIteration,
    )
    const thisAttempt = (Math.min(failedSoFar + 1, MAX_GATE_ATTEMPTS) as 1 | 2)

    // Acquire lock before doing any work
    const lockKey = `gate_${gate.gateId}_${stage}`
    const locked = await acquireLock(projectId, lockKey, `gate_runner_${gate.gateId}`)
    if (!locked) {
        // Another tick is already evaluating this gate — skip
        console.info(
            `[gate-runner] gate=${gate.gateId} project=${projectId} stage=${stage} — lock held, skipping`,
        )
        return {
            verdict: "WARN",
            attempts_remaining: MAX_GATE_ATTEMPTS - failedSoFar,
            fail_count: failedSoFar,
        }
    }

    const ctx: GateContext = {
        projectId,
        pipelineRunIteration,
        attempt: thisAttempt,
    }

    let evalResult: {
        verdict: "PASS" | "FAIL" | "WARN"
        severity: "P0" | "P1" | null
        failure_details: string | null
        deterministic_result?: DeterministicCheckResult
        model_votes?: ModelVote[] | null
    }

    try {
        switch (gate.kind) {
            case "deterministic":
                evalResult = await runDeterministicGate(gate, ctx)
                break
            case "llm_vote":
                evalResult = await runLLMVoteGate(gate, ctx)
                break
            case "hybrid":
                evalResult = await runHybridGate(gate, ctx)
                break
            default: {
                // Exhaustiveness check
                const _exhaustive: never = gate
                throw new Error(`Unknown gate kind: ${JSON.stringify(_exhaustive)}`)
            }
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(
            `[gate-runner] gate=${gate.gateId} project=${projectId} evaluation threw:`,
            msg,
        )
        await releaseLock(projectId, lockKey)
        // Evaluation error → treat as WARN, don't block the pipeline
        return {
            verdict: "WARN",
            attempts_remaining: MAX_GATE_ATTEMPTS - failedSoFar,
            fail_count: failedSoFar,
        }
    }

    // ── Persist verdict BEFORE any remediation (critical invariant) ─────────
    const verdictRow = await persistVerdict({
        project_id: projectId,
        gate_id: gate.gateId,
        pipeline_run_iteration: pipelineRunIteration,
        attempt: thisAttempt,
        verdict: evalResult.verdict,
        severity: evalResult.severity,
        failure_details: evalResult.failure_details,
        model_votes: evalResult.model_votes ?? null,
        deterministic_result: evalResult.deterministic_result ?? null,
        remediation_fired: false,
        remediation_target_stage: null,
        remediation_context_injected: null,
        uncertainty_marker_required: false,
        uncertainty_marker_text: null,
    })

    await releaseLock(projectId, lockKey)

    const newFailCount = evalResult.verdict === "FAIL" ? failedSoFar + 1 : failedSoFar
    const attemptsRemaining = Math.max(0, MAX_GATE_ATTEMPTS - newFailCount)

    return {
        verdict: evalResult.verdict,
        attempts_remaining: attemptsRemaining,
        fail_count: newFailCount,
        verdict_row: verdictRow,
    }
}

/**
 * markUncertainty — stamp an uncertainty marker on a verdict row.
 *
 * Called by the cron handler when a gate has exhausted its attempts
 * and the pipeline is allowed to advance (with a caveat marker on the PDF).
 */
export async function markUncertainty(
    projectId: string,
    gate: GateRunner,
    result: GateRunResult,
    markerText?: string,
): Promise<void> {
    if (!result.verdict_row?.id) return

    const admin = createAdminClient()
    const defaultMarkerText =
        markerText ??
        `Gate ${gate.gateId} (${gate.name}) failed after ${MAX_GATE_ATTEMPTS} attempts. ` +
            `This section may contain errors. Human review recommended.`

    await admin
        .from("gate_verdicts")
        .update({
            uncertainty_marker_required: true,
            uncertainty_marker_text: defaultMarkerText,
        } as never)
        .eq("id", result.verdict_row.id)
}
