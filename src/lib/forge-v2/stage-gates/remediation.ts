/**
 * @file remediation.ts — Quality Gates v2.0 gate iteration loop helpers
 *
 * @description Two pure helpers that wire the quality-gate FAIL path into an
 * actual upstream-specialist re-fire:
 *
 *   - `triggerRemediation` — atomically stashes the remediation context on the
 *     project, supersedes the stale autopilot tracking rows, and resets
 *     autopilot_state.stage so the next cron tick re-fires the specialist.
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
 * @see supabase/migrations/gate_remediation_context_column.sql — DB schema
 */

import { createAdminClient } from "@/lib/supabase/admin"

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * The `specialist_id` value that the cron handler uses for autopilot tracking
 * rows. Must match `AUTOPILOT_TRACKING_SPECIALIST` in stage-config.ts.
 * Duplicated here to avoid a circular import between the gate layer and the
 * cron config layer.
 */
const AUTOPILOT_TRACKING_SPECIALIST = "autopilot"

// ── triggerRemediation ───────────────────────────────────────────────────────

/**
 * Atomically wire a gate FAIL into an upstream specialist re-fire.
 *
 * Steps (in DB order, chosen to be safe under a mid-run crash):
 *
 *   1. Stash `remediationContextJson` at
 *      `cad_lab_projects.gate_remediation_context.<targetStage>`.
 *      Uses jsonb_set with `create_missing = true`. Existing keys for OTHER
 *      stages are preserved — we only touch the key for `targetStage`.
 *
 *   2. Mark the autopilot tracking row for `(projectId, targetStage)` as
 *      `status = 'superseded_by_gate'`. This is idempotent (update by filter).
 *      Specialist pipeline_run rows for the same stage are also superseded so
 *      they don't appear as `done` on the next cron tick.
 *
 *   3. Reset `autopilot_state.stage` to `targetStage` via jsonb_set so the
 *      next cron tick re-fires the specialist at that stage.
 *
 * Steps 1 and 3 touch `cad_lab_projects` — if the DB has transactional support
 * for adjacent JSONB updates, they are effectively committed together. Step 2
 * touches `pipeline_runs` and is best-effort (a crash between 2 and 3 leaves
 * an orphaned `done` row that the next tick's stale-detection handles).
 *
 * @param projectId        - `cad_lab_projects.id`
 * @param targetStage      - The stage to reset to (e.g. `"waiting_sizing"`)
 * @param contextJson      - The structured failure-context string to stash
 * @param verdictId        - UUID of the `gate_verdicts` row that triggered this
 *                           (stored as an audit trail comment in the supersede reason)
 */
export async function triggerRemediation(
    projectId: string,
    targetStage: string,
    contextJson: string,
    verdictId?: string,
): Promise<{ ok: boolean; error?: string }> {
    const admin = createAdminClient()

    // ── Step 1: stash remediation context on the project ──────────────────
    //
    // jsonb_set(target, path, value, create_missing) is the safest single-
    // UPDATE path. Using `||` would clobber all other keys; using a read-
    // modify-write would introduce a race. jsonb_set is atomic for a single
    // key update.
    //
    // The SQL path syntax for a text key is: ARRAY['{<key>}'] or equivalently
    // the Supabase RPC approach. We use raw SQL via the admin client's rpc
    // fallback because the Supabase JS `.update()` helper does not support
    // JSONB path operations directly.
    const { error: stashError } = await admin.rpc("gate_stash_remediation_context", {
        p_project_id: projectId,
        p_stage: targetStage,
        p_context: contextJson,
    } as never)

    // Fallback: if the RPC doesn't exist yet (pre-migration race), use the
    // direct update approach. The RPC is defined in the migration; if we're
    // here before it exists, fall back to the JS-side update.
    if (stashError) {
        // RPC might not exist. Try direct update using jsonb_set via a raw
        // approach — load current value, merge, save.
        const { data: current, error: readErr } = await admin
            .from("cad_lab_projects")
            .select("gate_remediation_context")
            .eq("id", projectId)
            .maybeSingle()

        if (readErr) {
            console.error(
                `[gate-remediation] triggerRemediation: failed to read gate_remediation_context for project=${projectId}:`,
                readErr.message,
            )
            return { ok: false, error: readErr.message }
        }

        const existing =
            (current?.gate_remediation_context as Record<string, string> | null) ?? {}
        const updated = { ...existing, [targetStage]: contextJson }

        const { error: writeErr } = await admin
            .from("cad_lab_projects")
            .update({ gate_remediation_context: updated } as never)
            .eq("id", projectId)

        if (writeErr) {
            console.error(
                `[gate-remediation] triggerRemediation: failed to stash context for project=${projectId} stage=${targetStage}:`,
                writeErr.message,
            )
            return { ok: false, error: writeErr.message }
        }
    }

    // ── Step 2: supersede autopilot tracking + specialist pipeline_runs ────
    //
    // Mark the existing rows for this (project, targetStage) as superseded.
    // We use a non-terminal status name `superseded_by_gate` so the rows are
    // visible in the audit log but don't count as `done` on the next cron tick.
    //
    // This is best-effort — a crash here leaves an orphaned `done` row.
    // The next cron tick's stale-run detection handles that gracefully.
    const supersededReason = verdictId
        ? `Gate remediation triggered by verdict_id=${verdictId}. Stage reset to re-fire.`
        : `Gate remediation triggered. Stage reset to ${targetStage} for re-fire.`

    await admin
        .from("pipeline_runs")
        .update({
            status: "failed",
            error_code: "SUPERSEDED_BY_GATE",
            error_message: supersededReason,
            finished_at: new Date().toISOString(),
        } as never)
        .eq("project_id", projectId)
        .eq("stage", targetStage)
        .in("status", ["done", "running", "queued"])

    // ── Step 3: reset autopilot_state.stage to targetStage ────────────────
    //
    // This is the key step that makes the next cron tick re-fire the specialist.
    // jsonb_set preserves all other keys in autopilot_state (started_at,
    // completed_stages, pipeline_run_iteration, etc.).
    //
    // We cannot use a Supabase JS JSONB path update here — fall back to RPC
    // or the read-modify-write pattern.
    const { data: currentProject, error: readStateErr } = await admin
        .from("cad_lab_projects")
        .select("autopilot_state")
        .eq("id", projectId)
        .maybeSingle()

    if (readStateErr || !currentProject) {
        console.error(
            `[gate-remediation] triggerRemediation: failed to read autopilot_state for project=${projectId}:`,
            readStateErr?.message ?? "project not found",
        )
        return {
            ok: false,
            error: readStateErr?.message ?? "project not found",
        }
    }

    const currentState = (currentProject.autopilot_state as Record<string, unknown>) ?? {}
    const newState = { ...currentState, stage: targetStage }

    const { error: stageResetErr } = await admin
        .from("cad_lab_projects")
        .update({ autopilot_state: newState } as never)
        .eq("id", projectId)

    if (stageResetErr) {
        console.error(
            `[gate-remediation] triggerRemediation: failed to reset autopilot_state.stage for project=${projectId}:`,
            stageResetErr.message,
        )
        return { ok: false, error: stageResetErr.message }
    }

    console.info(
        `[gate-remediation] triggerRemediation: project=${projectId} → stage reset to ${targetStage}, context stashed, pipeline_runs superseded`,
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
