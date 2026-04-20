"use server"

/**
 * @file pipeline-runs-watchdog.ts — stale-run sweeper.
 *
 * @description Vercel Pro caps server-action `maxDuration` at 300s. If the
 * serverless function hits that ceiling mid-response it is killed — and the
 * in-flight `pipeline_runs` row is left as `status='running'` with no
 * `finished_at`, no `error_code`, no `error_message`. The UI chip then
 * shows an infinite spinner and the founder has no recovery path.
 *
 * `sweepStalledRuns` is the recovery primitive. Every `loadXxxRunStatus`
 * helper calls it as the first step (errors swallowed, never blocks the
 * read). Any `running` row for the given project older than
 * `STALE_AFTER_MINUTES` is flipped to `failed` with `error_code='TIMEOUT_STALL'`
 * so the chip reflects reality and the founder can re-run. Idempotent:
 * safe to call many times; subsequent calls find nothing to sweep.
 *
 * Threshold rationale: Vercel's hard cap is 300s = 5 minutes. Anything
 * still `running` past 6 minutes is either stuck or was killed mid-response.
 * We use 6 to give a one-minute safety margin so we don't flip a run that's
 * legitimately seconds away from completing.
 *
 * Kept in its own file (separate from `pipeline-runs.ts`) so concurrent
 * sub-agents can own different concerns without stepping on each other's
 * commits — see CLAUDE.md §Parallel Sub-Agent Safety Rules.
 */

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Runs older than this are considered stalled. Vercel Pro caps server-action
 * maxDuration at 300s (5 min); 6 min gives a one-minute safety margin so we
 * don't flip a run seconds away from completing.
 */
const STALE_AFTER_MINUTES = 6

/**
 * Called by loadXxxRunStatus helpers before reading the latest row.
 * Marks any `running` row older than STALE_AFTER_MINUTES as `failed`
 * with errorCode='TIMEOUT_STALL' — prevents infinite-spinner UI when
 * the server was killed mid-response by Vercel's 300s cap.
 *
 * Idempotent: safe to call many times. Errors are logged and swallowed
 * so a failed sweep never blocks the status read that follows it.
 *
 * @param projectId - cad_lab_projects.id to sweep; scoped so a bad row
 *                    in one project can never stall another.
 * @returns { swept } - number of rows flipped from running → failed.
 */
export async function sweepStalledRuns(
    projectId: string,
): Promise<{ swept: number }> {
    const db = createAdminClient()
    const cutoff = new Date(
        Date.now() - STALE_AFTER_MINUTES * 60 * 1000,
    ).toISOString()
    const { data, error } = await db
        .from("pipeline_runs")
        .update({
            status: "failed",
            error_code: "TIMEOUT_STALL",
            error_message: `Run exceeded ${STALE_AFTER_MINUTES}-minute threshold and did not complete. Server likely hit Vercel 300s maxDuration.`,
            finished_at: new Date().toISOString(),
        })
        .eq("project_id", projectId)
        .eq("status", "running")
        .lt("started_at", cutoff)
        .select("id")
    if (error) {
        console.error(
            "[pipeline-runs-watchdog] sweep failed:",
            error.message,
        )
        return { swept: 0 }
    }
    return { swept: data?.length ?? 0 }
}
