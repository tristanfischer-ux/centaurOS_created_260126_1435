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
    throw new Error(`startPipelineRun failed: ${error?.message}`)
  }
  return { runId: data.id }
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
