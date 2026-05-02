"use server"
// Atomic helpers for writing pipeline_runs rows. Every specialist action
// that needs observability must use these — never hand-insert.
//
// INTENT: pipeline_runs is the source of truth for "is Max still
// decomposing?", "why did Fang fail on module 7?", "how much did we
// spend on Finn's last rollup?" — see supabase/migrations/20260422000000
// and /tmp/forge-v2-pipeline-arch/PIPELINE-ARCHITECTURE.md §3b.
//
// SECURITY: Direct client writes are blocked via RLS (INSERT/UPDATE
// policies are WITH CHECK false). These wrappers use the service-role
// admin client and MUST be called from authenticated server actions
// that have already resolved the caller's foundry_id.

import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/types/database.types"

type Row = Database["public"]["Tables"]["pipeline_runs"]["Row"]
type Insert = Database["public"]["Tables"]["pipeline_runs"]["Insert"]

export async function startPipelineRun(
  input: Omit<Insert, "status" | "started_at">
): Promise<{ runId: string }> {
  const db = createAdminClient()
  const { data, error } = await db
    .from("pipeline_runs")
    .insert({
      ...input,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single()
  if (error || !data) {
    // 23505 = Postgres unique_violation. With the partial unique index
    // pipeline_runs_no_duplicate_in_flight (migration 20260425020000), this
    // means another caller just won the race to start the same
    // (project_id, specialist_id, stage) triple while status IN
    // ('queued','running'). Look up the existing in-flight row + return
    // its id so the caller treats this attempt as an idempotent no-op
    // success. See RED-TEAM-2-STATE-MACHINE.md §3 (BESS dc8c1def twin-BOM
    // incident 2026-04-23 17:22:07) for the motivating failure mode.
    if (error?.code === "23505") {
      // First pass: look for the in-flight winner (queued/running), BUT
      // treat rows that have been running >5min as stale-abandoned. Vercel
      // can kill containers mid-flight and leave the pipeline_runs row
      // stuck at 'running' forever — if a new caller 23505s on such a
      // zombie, reusing its runId means the chain wedges permanently.
      // Mark the zombie failed and INSERT fresh. Observed 2026-04-24
      // run 13: Finn cost.estimate for project 3e6c39b1 died with no
      // logs at the 300s timeout, row stayed 'running', cron's repeated
      // dispatches kept reusing the dead runId and never recovered.
      const STALE_RUNNING_MS = 5 * 60 * 1000
      const { data: inFlight } = await db
        .from("pipeline_runs")
        .select("id, started_at")
        .eq("project_id", input.project_id)
        .eq("specialist_id", input.specialist_id)
        .eq("stage", input.stage)
        .in("status", ["queued", "running"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (inFlight) {
        const startedMs = inFlight.started_at
          ? new Date(inFlight.started_at).getTime()
          : Date.now()
        const ageMs = Date.now() - startedMs
        if (ageMs > STALE_RUNNING_MS) {
          // Zombie: container died mid-flight. Fail it out so the partial
          // unique index releases the (project, specialist, stage) triple,
          // then retry the insert once. If the retry also hits 23505, fall
          // through to the original behaviour (shouldn't happen since we
          // just freed the slot).
          console.warn(
            `[startPipelineRun] stale-running row ${inFlight.id} (${Math.round(ageMs / 1000)}s old) ` +
              `for ${input.specialist_id}:${input.stage} on project ${input.project_id} — marking failed and retrying insert`,
          )
          await db
            .from("pipeline_runs")
            .update({
              status: "failed",
              error_code: "STALE_ABANDONED",
              error_message: `Run sat at 'running' for ${Math.round(ageMs / 1000)}s with no completion — container presumed killed. Auto-recovered by startPipelineRun.`,
              finished_at: new Date().toISOString(),
            })
            .eq("id", inFlight.id)
          const retry = await db
            .from("pipeline_runs")
            .insert({
              ...input,
              status: "running",
              started_at: new Date().toISOString(),
            })
            .select("id")
            .single()
          if (retry.data) {
            console.info(
              `[startPipelineRun] stale-recovery insert succeeded, new runId=${retry.data.id}`,
            )
            return { runId: retry.data.id }
          }
          console.error(
            `[startPipelineRun] stale-recovery insert failed:`,
            retry.error?.message,
          )
          // Fall through to the normal in-flight handler below — safest
          // if the retry hit a different error.
        } else {
          console.info(
            `[startPipelineRun] duplicate-in-flight detected for ${input.specialist_id}:${input.stage} on project ${input.project_id}; reusing run ${inFlight.id}`,
          )
          return { runId: inFlight.id }
        }
      }
      // Fast-stage race: on sub-100ms stages (sizing skip, layout skip)
      // the winner can already be `done` by the time we do this lookup.
      // Observed 2026-04-24 run 10: sizing completed in 78ms, a racing
      // second attempt hit 23505 but the original row was already done,
      // inFlight lookup returned null, function threw. Fall back to the
      // most-recent `done` row within a short window — treat as idempotent
      // success (the stage did complete, we just lost the race).
      const { data: recentDone } = await db
        .from("pipeline_runs")
        .select("id, finished_at")
        .eq("project_id", input.project_id)
        .eq("specialist_id", input.specialist_id)
        .eq("stage", input.stage)
        .eq("status", "done")
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (recentDone) {
        console.info(
          `[startPipelineRun] duplicate race on ${input.specialist_id}:${input.stage} but winner already done — reusing runId ${recentDone.id}`
        )
        return { runId: recentDone.id }
      }
    }
    throw new Error(`startPipelineRun failed: ${error?.message}`)
  }
  return { runId: data.id }
}

export async function updatePipelineHeartbeat(runId: string): Promise<void> {
  const db = createAdminClient()
  await db
    .from("pipeline_runs")
    .update({ heartbeat_at: new Date().toISOString() } as never)
    .eq("id", runId)
    .eq("status", "running")
}

export async function completePipelineRun(
  runId: string,
  patch: Partial<Row>
): Promise<void> {
  const db = createAdminClient()
  const { error } = await db
    .from("pipeline_runs")
    .update({
      ...patch,
      status: "done",
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId)
  if (error) throw new Error(`completePipelineRun failed: ${error.message}`)
}

export async function failPipelineRun(
  runId: string,
  errorCode: string,
  errorMessage: string,
  patch?: Partial<Row>
): Promise<void> {
  const db = createAdminClient()
  const { error } = await db
    .from("pipeline_runs")
    .update({
      ...(patch ?? {}),
      status: "failed",
      error_code: errorCode,
      error_message: errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId)
  if (error) throw new Error(`failPipelineRun failed: ${error.message}`)
}

/**
 * Bump the last_heartbeat timestamp on a running pipeline_runs row.
 * Call every 60 seconds from within a specialist execution to signal
 * liveness. The cron stale-detection threshold is 3 minutes — if no
 * heartbeat lands within that window the row is treated as STALE_ABANDONED
 * and re-fired. Fire-and-forget safe (errors are swallowed at call sites
 * so a failed heartbeat never aborts the specialist's main work).
 */
export async function updatePipelineHeartbeat(runId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from("pipeline_runs")
    .update({ last_heartbeat: new Date().toISOString() })
    .eq("id", runId)
}

export async function loadLatestRunForStage(
  projectId: string,
  specialistId: string,
  stage: string
): Promise<Row | null> {
  const db = createAdminClient()
  const { data } = await db
    .from("pipeline_runs")
    .select("*")
    .eq("project_id", projectId)
    .eq("specialist_id", specialistId)
    .eq("stage", stage)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}
