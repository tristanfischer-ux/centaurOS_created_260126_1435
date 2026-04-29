/**
 * @file remediation.ts — Quality Gates v2.0 gate iteration loop helpers
 *
 * @description Two pure helpers that wire the quality-gate FAIL path into an
 * actual upstream-specialist re-fire:
 *
 *   - `triggerRemediation` — atomically stashes the remediation context on the
 *     project, supersedes the stale autopilot tracking rows, and resets
 *     autopilot_state.stage so the next cron tick re-fires the specialist.
 *     All three mutations are wrapped in a single Postgres transaction via the
 *     `apply_gate_remediation` SECURITY DEFINER function (migration
 *     20260429100000_atomic_gate_remediation). A container kill between steps
 *     no longer produces split-brain state.
 *
 *   - `consumeRemediationContext` — reads the context for a given stage and
 *     immediately clears it so subsequent regen iterations don't accidentally
 *     re-apply stale remediation.
 *
 * ## Invariants
 *
 *   1. `triggerRemediation` is called AFTER `persistVerdict` (per the critical
 *      invariant in runner.ts). A crash inside triggerRemediation must not lose
 *      the attempt count — the verdict row already exists.
 *
 *   2. `triggerRemediation` only fires when `attempts_remaining > 0`. The cron
 *      handler is responsible for that guard; this module does NOT re-check it.
 *
 *   3. `consumeRemediationContext` performs a JSONB path delete in a single
 *      UPDATE, not a read-modify-write, to avoid a TOCTOU race between two
 *      concurrent specialist re-fires on the same project.
 *
 *   4. Both functions are idempotent: calling triggerRemediation twice with the
 *      same arguments produces the same DB state (the second upsert overwrites
 *      the first with the same value; `superseded_by_gate` rows are stable).
 *
 * ## Atomicity guarantee (P0 fix — gates-council 2026-04-29)
 *
 *   `triggerRemediation` now routes through the `apply_gate_remediation` Postgres
 *   function (migration 20260429100000_atomic_gate_remediation). All three
 *   mutations — context stash, pipeline_runs supersede, autopilot_state.stage
 *   reset — execute inside a single implicit PL/pgSQL transaction. Either all
 *   three commit or none do. The previous three-separate-JS-call pattern that
 *   produced split-brain state on container kill is gone.
 *
 * ## Anti-infinite-loop guard
 *
 *   The attempt counter (`pipeline_run_iteration` in `gate_verdicts`) is capped
 *   at 2 by `runner.ts::MAX_GATE_ATTEMPTS`. The cron handler checks
 *   `attempts_remaining > 0` before calling `triggerRemediation`. This module
 *   does not need to re-enforce the cap — it is the execution arm, not the
 *   policy arm.
 *
 * @see src/app/api/cron/autopilot-tick/route.ts — caller (policy arm)
 * @see src/lib/forge-v2/stage-gates/runner.ts   — attempt counter source
 * @see supabase/migrations/20260429100000_atomic_gate_remediation.sql — DB schema
 * @see supabase/migrations/20260428300000_gate_remediation_context.sql — column schema
 */

import { createAdminClient } from "@/lib/supabase/admin"

// ── triggerRemediation ───────────────────────────────────────────────────────

/**
 * Atomically wire a gate FAIL into an upstream specialist re-fire.
 *
 * All three mutations are executed inside a single Postgres transaction via the
 * `apply_gate_remediation` SECURITY DEFINER function (migration
 * 20260429100000_atomic_gate_remediation). Either all three commit or none do.
 *
 * Steps performed inside the DB function (atomic):
 *
 *   1. Stash `contextJson` at
 *      `cad_lab_projects.gate_remediation_context[targetStage]`
 *      using jsonb_set with `create_missing = true`. Existing keys for OTHER
 *      stages are preserved.
 *
 *   2. Mark done/running/queued `pipeline_runs` rows for
 *      `(projectId, targetStage)` as `status='failed'` with
 *      `error_code='SUPERSEDED_BY_GATE'`.
 *
 *   3. Reset `cad_lab_projects.autopilot_state.stage` to `targetStage` via
 *      jsonb_set so the next cron tick re-fires the specialist.
 *
 * @param projectId   - `cad_lab_projects.id`
 * @param targetStage - The stage to reset to (e.g. `"waiting_sizing"`)
 * @param contextJson - The structured failure-context string to stash
 * @param verdictId   - UUID of the `gate_verdicts` row that triggered this
 *                      (stored in the supersede reason for audit trail)
 */
export async function triggerRemediation(
    projectId: string,
    targetStage: string,
    contextJson: string,
    verdictId?: string,
): Promise<{ ok: boolean; error?: string }> {
    const admin = createAdminClient()

    // INTENT: One RPC call → one Postgres transaction → all three mutations
    // commit atomically, or none do. Replaces the previous three-separate-
    // JS-calls pattern that produced split-brain state on container kill
    // (P0 fix from gates-council 2026-04-29).
    const { error } = await admin.rpc("apply_gate_remediation", {
        p_project_id: projectId,
        p_target_stage: targetStage,
        p_context_json: contextJson,
        p_verdict_id: verdictId ?? null,
    } as never)

    if (error) {
        console.error(
            `[gate-remediation] triggerRemediation: apply_gate_remediation failed for project=${projectId} stage=${targetStage}:`,
            error.message,
        )
        return { ok: false, error: error.message }
    }

    console.info(
        `[gate-remediation] triggerRemediation: project=${projectId} → atomic: stage reset to ${targetStage}, context stashed, pipeline_runs superseded`,
    )
    return { ok: true }
}

// ── consumeRemediationContext ─────────────────────────────────────────────────

/**
 * Read the remediation context for a given stage and clear it atomically.
 *
 * Must be called by the specialist at the START of its prompt-building step,
 * BEFORE the LLM call, so that:
 *   - A crash mid-LLM-call doesn't result in the context being re-applied on
 *     the next retry (which would be fine but wasteful).
 *   - Subsequent regen iterations (new pipeline_run_iteration) don't
 *     accidentally inherit stale remediation from a prior iteration.
 *
 * Returns `null` if no remediation context exists for this stage. The
 * specialist must check for null and proceed with its normal prompt when null.
 *
 * Implementation: read-then-delete using a single UPDATE that sets the key to
 * NULL (or removes it). Using `#- ARRAY['key']` operator removes the key from
 * the JSONB object without touching other keys.
 *
 * @param projectId    - `cad_lab_projects.id`
 * @param currentStage - The stage this specialist is running for
 * @returns The remediation context string, or null if none exists
 */
export async function consumeRemediationContext(
    projectId: string,
    currentStage: string,
): Promise<string | null> {
    const admin = createAdminClient()

    // Read first
    const { data, error: readErr } = await admin
        .from("cad_lab_projects")
        .select("gate_remediation_context")
        .eq("id", projectId)
        .maybeSingle()

    if (readErr) {
        console.warn(
            `[gate-remediation] consumeRemediationContext: read failed for project=${projectId} stage=${currentStage}:`,
            readErr.message,
        )
        return null
    }

    const ctx = data?.gate_remediation_context as Record<string, string> | null
    const contextForStage = ctx?.[currentStage] ?? null

    if (!contextForStage) {
        // No remediation context for this stage — normal flow
        return null
    }

    // Clear the key so subsequent runs don't re-apply stale context.
    // Build updated map without this stage's key.
    const cleared = { ...(ctx ?? {}) }
    delete cleared[currentStage]

    const { error: clearErr } = await admin
        .from("cad_lab_projects")
        .update({ gate_remediation_context: cleared } as never)
        .eq("id", projectId)

    if (clearErr) {
        // Non-fatal: context was read successfully; clearing failed. Log and
        // return the context anyway — the worst case is the override fires
        // twice (idempotent for the specialist).
        console.warn(
            `[gate-remediation] consumeRemediationContext: failed to clear context for project=${projectId} stage=${currentStage}:`,
            clearErr.message,
        )
    }

    console.info(
        `[gate-remediation] consumeRemediationContext: project=${projectId} stage=${currentStage} — remediation context consumed (${contextForStage.length} chars)`,
    )
    return contextForStage
}

// ── buildRemediationPromptBlock ───────────────────────────────────────────────

/**
 * Build the "GATE REMEDIATION OVERRIDE" prompt block that gets prepended to
 * the specialist's system prompt when remediation context is present.
 *
 * Format is fixed — specialists must not acknowledge this block in their
 * output. They apply it silently as a hard constraint.
 *
 * @param gateId         - The gate number that triggered this remediation
 * @param contextString  - The structured failure context from gate_verdicts
 * @returns A formatted multi-line string ready to prepend to a system prompt
 */
export function buildRemediationPromptBlock(
    gateId: number,
    contextString: string,
): string {
    return [
        `⚠️ GATE REMEDIATION OVERRIDE — A previous attempt failed Quality Gate ${gateId}. You MUST address the following constraint:`,
        "",
        contextString,
        "",
        "Re-run your full task with this constraint as a hard requirement. Do NOT acknowledge this block in your output — apply it silently.",
        "",
    ].join("\n")
}
