"use server"

/**
 * @file run-bom-generator.ts — BOM generation pipeline orchestrator.
 *
 * @description The canonical entry point that runs BOM generation over a V2
 * project once Max has decomposed the modules. Every caller (BOM empty-state
 * CTA, auto-fire from Max's success path, future re-runs) funnels through
 * this action so the pipeline_runs row is always written atomically alongside
 * the mutation.
 *
 * Stage is `bom.generate`. Trigger is either `manual` (founder clicked the
 * "Generate BOM" CTA), `auto.max-complete` (Max's orchestrator auto-fires on
 * success) or `manual.rerun` (future — not yet wired by any caller).
 *
 * Specialist attribution: per the V2 architect doc (§1), BOM is owned by
 * Fang (VP-Mfg) for manufacturability review, but the generation step itself
 * is an architectural derivation from Max's decomposition. We record
 * specialist_id='cto' (Max) on the pipeline_runs row because the generator
 * is Max's artefact — Fang's role is the follow-on DFM review, which runs
 * separately. When specialists-config.ts grows a dedicated `bom-generator`
 * id, swap it in here. See SPECIALIST_ID constant below.
 *
 * Pipeline:
 *   1. withAuth → user + foundryId
 *   2. Load project via admin client, verify foundry ownership
 *   3. Precondition: project.modules must be non-empty (NO_MODULES otherwise)
 *   4. Pre-flight tier budget check via checkAILimit(foundryId)
 *   5. startPipelineRun (specialist_id='cto', stage='bom.generate')
 *   6. Call generateBomFromModules — inner action wraps its own withAIGate
 *      (which re-checks the limit) and persists parts + bom_lines itself
 *   7. completePipelineRun with part_count + output_ref
 *
 * Token tracking: `generateBomFromModules` (src/actions/bom.ts) does not
 * surface token counts today — the Anthropic SDK response isn't threaded
 * back to the caller. We record input_tokens/output_tokens as null here
 * rather than fabricate; the existing `trackAIUsage` path inside
 * `withAIGate` still enforces the monthly quota. When bom.ts is extended
 * to return usage, wire it in (see GOTCHA below).
 *
 * GOTCHA: generateBomFromModules's signature is
 *   Promise<BomGenerationResult | { error: string }>
 * The `{ error }` branch fires when withAIGate's limit check refuses. We
 * treat both branches as `GENERATE_FAILED` on the pipeline_run.
 *
 * Error codes exposed to callers:
 *   - BUDGET_CAPPED          — tier AI budget exhausted; outer check refused
 *   - BUDGET_NOT_CHECKABLE   — foundry tier / usage lookup threw
 *   - PROJECT_NOT_FOUND      — id doesn't exist
 *   - PROJECT_FORBIDDEN      — project belongs to a different foundry
 *   - NO_MODULES             — Max hasn't decomposed yet (project.modules empty)
 *   - GENERATE_FAILED        — inner generateBomFromModules returned success=false
 *   - SAVE_FAILED            — inner path returned a parts-saved-but-BOM-failed error
 *   - INTERNAL               — unclassified throw
 *
 * @related
 *   - Pre-read arch doc: /tmp/forge-v2-pipeline-arch/PIPELINE-ARCHITECTURE.md §1, §7
 *   - Sibling orchestrator: src/actions/specialists/run-max-decomposition.ts
 *   - Inner engine: src/actions/bom.ts (generateBomFromModules)
 *   - Pipeline wrappers: src/actions/pipeline-runs.ts
 *   - UI consumers: src/app/(platform)/the-forge-v2/projects/[id]/bom/
 *                   src/app/(platform)/the-forge-v2/projects/[id]/page.tsx
 */

import { generateBomFromModules } from "@/actions/bom"
import {
    completePipelineRun,
    failPipelineRun,
    loadLatestRunForStage,
    startPipelineRun,
} from "@/actions/pipeline-runs"
import { sweepStalledRuns } from "@/actions/pipeline-runs-watchdog"
// Wave 1d: auto-fire Finn cost on BOM success.
import { runFinnCost } from "@/actions/specialists/run-finn-cost"
import { checkAILimit } from "@/lib/ai/limit-check"
import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import type {
    CadLabDesignBrief,
    CadLabModule,
} from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

// ─── Public types ──────────────────────────────────────────────────────

export type BomRunStatusChip =
    | "not-started"
    | "queued"
    | "running"
    | "done"
    | "failed"
    | "cancelled"

export interface RunBomGeneratorResult {
    ok: true
    runId: string
    partCount: number
}

export interface RunBomGeneratorError {
    ok: false
    error: string
    errorCode?: string
    runId?: string
}

export type RunBomGeneratorReturn =
    | RunBomGeneratorResult
    | RunBomGeneratorError

export interface LoadBomRunStatusResult {
    status: BomRunStatusChip
    startedAt?: string | null
    finishedAt?: string | null
    errorMessage?: string | null
    errorCode?: string | null
    partCount?: number | null
}

// ─── Constants ─────────────────────────────────────────────────────────

/**
 * Specialist id recorded on the pipeline_run row. BOM is owned by Max's
 * decomposition artefact — see file header for the full rationale. If a
 * dedicated `bom-generator` id is added to specialists-config.ts later,
 * update this single constant.
 */
const SPECIALIST_ID = "cto"
const STAGE = "bom.generate"

// ─── runBomGenerator ───────────────────────────────────────────────────

/**
 * Runs BOM generation over the given project's decomposed modules and
 * persists structured parts + bom_lines. Wraps the call in a pipeline_runs
 * row for observability.
 *
 * @param projectId - V2 project UUID
 * @param trigger   - Why this run was kicked off (routed to pipeline_runs.trigger)
 */
export async function runBomGenerator(
    projectId: string,
    trigger: "manual" | "auto.max-complete" | "manual.rerun",
): Promise<RunBomGeneratorReturn> {
    return withAuth<RunBomGeneratorReturn>(async ({ user, foundryId }) => {
        // 1. Load + verify project (foundry scope check via admin client —
        //    identical rationale to runMaxDecomposition: RLS on
        //    cad_lab_projects is keyed on foundry membership, and we never
        //    want to silently operate on another tenant's project.)
        const admin = createAdminClient()
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, subject, modules, research, diagnostic_answers")
            .eq("id", projectId)
            .maybeSingle()

        if (projectErr) {
            return {
                ok: false,
                error: "Couldn't load project",
                errorCode: "INTERNAL",
            }
        }

        if (!project) {
            return {
                ok: false,
                error: "Project not found",
                errorCode: "PROJECT_NOT_FOUND",
            }
        }

        if (project.foundry_id !== foundryId) {
            // SECURITY: don't leak the existence of other-foundry projects
            return {
                ok: false,
                error: "Project not found",
                errorCode: "PROJECT_FORBIDDEN",
            }
        }

        // 2. Precondition: BOM needs Max's modules to exist. Without modules
        //    there's nothing to decompose parts from — fail fast with a
        //    clean error code so the UI can route the founder to Modules.
        const modulesRaw = project.modules as unknown
        const modules = (Array.isArray(modulesRaw) ? modulesRaw : []) as CadLabModule[]

        if (modules.length === 0) {
            return {
                ok: false,
                error:
                    "This project hasn't been decomposed yet — run Max's module decomposition first.",
                errorCode: "NO_MODULES",
            }
        }

        // Brief + diagnostic answers are optional context for BOM generation.
        // When missing we pass undefined through; the inner action handles it.
        const research = project.research as {
            designBrief?: CadLabDesignBrief
        } | null
        const designBrief = research?.designBrief
        const diagnosticAnswers = project.diagnostic_answers as DiagnosticAnswers | null

        // 3. Pre-flight tier budget check.
        //    The inner generateBomFromModules wraps itself in withAIGate
        //    which re-checks this. That duplicate check is authoritative for
        //    per-run enforcement; this outer check exists so the orchestrator
        //    can return a clean BUDGET_CAPPED code before writing a
        //    pipeline_runs row that would otherwise be immediately 'failed'.
        let budgetOk = true
        let budgetMessage: string | null = null
        try {
            const gate = await checkAILimit(foundryId)
            if (!gate.allowed) {
                budgetOk = false
                budgetMessage =
                    gate.message ?? "AI usage limit reached for this billing period."
            }
        } catch (err) {
            // Fail closed with a distinct errorCode so a bad lookup doesn't
            // silently turn into uncharged spend.
            console.error(
                "[run-bom-generator] checkAILimit threw:",
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error:
                    "Couldn't verify your AI usage budget — try again in a moment.",
                errorCode: "BUDGET_NOT_CHECKABLE",
            }
        }

        if (!budgetOk) {
            return {
                ok: false,
                error: budgetMessage ?? "AI usage limit reached.",
                errorCode: "BUDGET_CAPPED",
            }
        }

        // 4. Start pipeline_run. Once this returns, every exit path MUST
        //    either complete or fail the run — otherwise the row hangs in
        //    'running' forever and the UI chip lies.
        let runId: string
        try {
            const started = await startPipelineRun({
                foundry_id: foundryId,
                project_id: projectId,
                specialist_id: SPECIALIST_ID,
                stage: STAGE,
                trigger,
                triggered_by: user.id,
                model_provider: "anthropic",
                input_ref: {
                    source: "modules",
                    moduleCount: modules.length,
                    totalKeyParts: modules.reduce(
                        (acc, m) => acc + (m.keyParts?.length ?? 0),
                        0,
                    ),
                },
            })
            runId = started.runId
        } catch (err) {
            console.error(
                "[run-bom-generator] startPipelineRun threw:",
                err instanceof Error ? err.message : err,
            )
            return {
                ok: false,
                error: "Couldn't start the pipeline run.",
                errorCode: "INTERNAL",
            }
        }

        // From here on: wrap everything in a try/catch that falls through to
        // failPipelineRun so the chip reflects reality even if something
        // unexpected throws.
        try {
            // 5. Call the inner generator. It wraps its own withAIGate +
            //    validates Claude's output + clears + inserts parts + inserts
            //    bom_lines in the same action. Returns the structured result
            //    or { success: false, error }.
            const result = await generateBomFromModules(
                projectId,
                modules,
                designBrief,
                diagnosticAnswers ?? undefined,
            )

            // The `{ error }` branch fires when withAIGate refuses (limit
            // reached) or anything else inside the gate throws without a
            // success field. Both surface as GENERATE_FAILED with the
            // upstream message preserved so the UI can show it verbatim.
            if ("error" in result && !("success" in result)) {
                await failPipelineRun(runId, "GENERATE_FAILED", result.error)
                return {
                    ok: false,
                    runId,
                    error: result.error,
                    errorCode: "GENERATE_FAILED",
                }
            }

            // TypeScript narrow: result is now BomGenerationResult
            const gen = result as Extract<typeof result, { success: boolean }>

            if (!gen.success) {
                // Parts-saved-but-BOM-hierarchy-failed is the documented
                // "Parts saved but BOM hierarchy failed. Try regenerating."
                // case in bom.ts. Treat it as SAVE_FAILED so the UI copy
                // mirrors the upstream message.
                const code = gen.error?.toLowerCase().includes("hierarchy")
                    ? "SAVE_FAILED"
                    : "GENERATE_FAILED"
                await failPipelineRun(
                    runId,
                    code,
                    gen.error || "BOM generation failed.",
                )
                return {
                    ok: false,
                    runId,
                    error: gen.error || "BOM generation failed.",
                    errorCode: code,
                }
            }

            const partCount = gen.parts?.length ?? 0
            const bomLineCount = gen.bomLines?.length ?? 0

            // 6. Done. generateBomFromModules doesn't surface token counts
            //    yet — input/output_tokens stay null. See file header for
            //    why we don't fabricate them.
            await completePipelineRun(runId, {
                input_tokens: null,
                output_tokens: null,
                model_id: null,
                output_ref: {
                    table: "parts",
                    partCount,
                    bomLineCount,
                    moduleCount: modules.length,
                    generationTimeMs: gen.generationTimeMs ?? null,
                },
            })

            // Wave 1d: auto-fire Finn cost on BOM success. Fire-and-forget —
            // any failure surfaces on the Finn pipeline_run row, not here.
            void runFinnCost(projectId, "auto.bom-complete").catch((err) => {
                console.error("[run-bom-generator] Finn auto-fire failed:", err)
            })

            return {
                ok: true,
                runId,
                partCount,
            }
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Unknown BOM generation error"
            console.error("[run-bom-generator] unexpected throw:", message)
            try {
                await failPipelineRun(runId, "INTERNAL", message)
            } catch (failErr) {
                console.error(
                    "[run-bom-generator] failPipelineRun also threw:",
                    failErr instanceof Error ? failErr.message : failErr,
                )
            }
            return {
                ok: false,
                runId,
                error: message,
                errorCode: "INTERNAL",
            }
        }
    })
}

// ─── loadBomRunStatus ──────────────────────────────────────────────────

/**
 * Reads the latest pipeline_runs row for (project_id, specialist='cto',
 * stage='bom.generate') and returns a chip-friendly shape. Used by the
 * BOM page loader and the Workspace page loader.
 *
 * When no row exists the chip shows "not-started". The orchestrator is
 * still safe to call from that state — it writes the first row atomically.
 */
export async function loadBomRunStatus(
    projectId: string,
): Promise<LoadBomRunStatusResult> {
    return withAuth<LoadBomRunStatusResult>(async ({ foundryId }) => {
        // Ownership check — same rationale as runBomGenerator.
        const admin = createAdminClient()
        const { data: project } = await admin
            .from("cad_lab_projects")
            .select("foundry_id")
            .eq("id", projectId)
            .maybeSingle()
        if (!project || project.foundry_id !== foundryId) {
            return { status: "not-started" }
        }

        // Watchdog: flip any stale 'running' row to 'failed' before reading.
        // Prevents infinite-spinner UI when a run hit Vercel's 300s cap.
        // Errors swallowed — a failed sweep must never block the status read.
        await sweepStalledRuns(projectId).catch(() => {})

        const row = await loadLatestRunForStage(projectId, SPECIALIST_ID, STAGE)
        if (!row) {
            return { status: "not-started" }
        }

        const status = mapDbStatusToChip(row.status)
        const partCount =
            row.output_ref && typeof row.output_ref === "object" && row.output_ref !== null
                ? ((row.output_ref as { partCount?: unknown }).partCount as number | undefined)
                : undefined
        return {
            status,
            startedAt: row.started_at,
            finishedAt: row.finished_at,
            errorCode: row.error_code,
            errorMessage: row.error_message,
            partCount: typeof partCount === "number" ? partCount : null,
        }
    })
}

// ─── Internals ─────────────────────────────────────────────────────────

function mapDbStatusToChip(dbStatus: string): BomRunStatusChip {
    switch (dbStatus) {
        case "queued":
            return "queued"
        case "running":
            return "running"
        case "done":
            return "done"
        case "failed":
            return "failed"
        case "cancelled":
            return "cancelled"
        default:
            return "not-started"
    }
}
