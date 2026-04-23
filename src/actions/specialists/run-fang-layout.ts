"use server"

/**
 * @file run-fang-layout.ts — Fang (VP Manufacturing) spatial-layout
 * orchestrator.
 *
 * @description Runs the Forge layout engine over a project and persists the
 * result as `cad_lab_projects.spatial_plan`. Stage fires automatically after
 * Fang's sizing pass completes (see forge-v2-autopilot.ts::stepWaitForLayout),
 * so by the time the founder lands on the image-generation stage the spatial
 * plan is ready to anchor module placements.
 *
 * Architecture (mirror of run-fang-sizing.ts):
 *   1. withAuth → user + foundryId (when invoked from UI)
 *      OR admin path — when invoked from after() in a post-response context
 *      where cookies are gone. Both paths converge on the same internal
 *      implementation once foundryId is known.
 *   2. Load project, verify ownership, read industryDomain + dimension_sheet
 *      + modules + targets (same derivation as run-fang-sizing).
 *   3. Call buildSpatialPlan() from the generic layout engine.
 *   4. Persist plan (or null + skipReason) to spatial_plan.
 *   5. Wrap in pipeline_runs (specialist_id='vp-manufacturing', stage='brief.layout').
 *
 * The orchestrator NEVER fails the pipeline because layout is an enhancement,
 * not a blocker — `skipped` is a legitimate outcome, logged and reported.
 * Downstream consumers (image prompts, PDF section) must handle
 * `spatial_plan IS NULL` gracefully.
 *
 * @related
 *   - Core engine: src/lib/layout/layout-engine.ts
 *   - Registry: src/lib/layout/_registry.ts
 *   - Reference: src/actions/specialists/run-fang-sizing.ts
 *   - Chained from: src/actions/forge-v2-autopilot.ts (waiting_layout stage)
 */

import {
    completePipelineRun,
    failPipelineRun,
    startPipelineRun,
} from "@/actions/pipeline-runs"
import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { buildSpatialPlan } from "@/lib/layout/layout-engine"
import type { SpatialPlan } from "@/lib/layout/types"
import { inferTargetsFromBrief } from "@/lib/sizing/sizing-engine"
import { getRulesByDomain } from "@/lib/sizing/rules/_registry"
import type { DimensionSheet } from "@/lib/sizing/types"

// ─── Subject-text heuristic (fallback when Max didn't populate industryDomain) ───
// Duplicated from run-fang-sizing.ts rather than exported cross-module to keep
// both "use server" files independent — a "use server" file can only export
// async functions, and exporting helpers from one into the other creates
// coupling that breaks that constraint the moment someone marks one sync.

function inferDomainFromSubject(subject: string): string | null {
    const s = subject.toLowerCase()
    if (/\bbess\b|battery energy storage|battery.storage|energy.storage|grid.tied.*battery|containerised.*battery/.test(s)) {
        return "battery_energy_storage"
    }
    if (/vertical farm|indoor farm|hydropon|controlled.environment.agric|\bcea\b|leafy green|indoor agricult/.test(s)) {
        return "vertical_farm"
    }
    if (/heat pump|ashp|heatpump|air.source.heat/.test(s)) {
        return "heat_pump"
    }
    return null
}

function inferTargetsFromSubject(subject: string, domain: string | null): Record<string, number> {
    if (!domain) return {}
    const out: Record<string, number> = {}
    const s = subject.toLowerCase()

    const capture = (re: RegExp): number | null => {
        const m = s.match(re)
        if (!m) return null
        const n = Number.parseFloat(m[1])
        return Number.isFinite(n) ? n : null
    }

    if (domain === "battery_energy_storage") {
        const kwh = capture(/(\d+(?:\.\d+)?)\s*kwh/i)
        const kw = capture(/(\d+(?:\.\d+)?)\s*kw(?![a-z])/i)
        if (kwh !== null) out.kwh = kwh
        if (kw !== null) out.kw = kw
        if (out.kwh !== undefined && out.kw === undefined) out.kw = Math.round(out.kwh * 0.2)
    } else if (domain === "vertical_farm") {
        const canopy = capture(/(\d+(?:\.\d+)?)\s*m(?:²|2|\^2)\s*(?:canopy|growing|grow)/i)
        const tiers = capture(/(\d+)\s*tiers?/i)
        if (canopy !== null) out.canopy_m2 = canopy
        if (tiers !== null) out.tiers = tiers
    } else if (domain === "heat_pump") {
        const kw = capture(/(\d+(?:\.\d+)?)\s*kw\s*(?:thermal|output)/i) ??
            capture(/(\d+(?:\.\d+)?)\s*kw(?![a-z])/i)
        if (kw !== null) out.kw_thermal = kw
    }
    return out
}

// ─── Public types ──────────────────────────────────────────────────────

export type FangLayoutChip =
    | "not-started"
    | "running"
    | "done"
    | "failed"
    | "skipped"

export interface RunFangLayoutResult {
    ok: true
    runId: string
    placementCount: number
    featureCount: number
    constraintCount: number
    rulesDomain: string
}

export interface RunFangLayoutSkipped {
    ok: false
    skipped: true
    runId: string
    reason: string
}

export interface RunFangLayoutError {
    ok: false
    skipped?: false
    error: string
    errorCode?: string
    runId?: string
}

export type RunFangLayoutReturn =
    | RunFangLayoutResult
    | RunFangLayoutSkipped
    | RunFangLayoutError

// ─── Constants ─────────────────────────────────────────────────────────

const SPECIALIST_ID = "vp-manufacturing"
const STAGE = "brief.layout"

// ─── Public actions ────────────────────────────────────────────────────

/**
 * Foreground entry point — call this from UI buttons / manual triggers.
 * Resolves foundry via withAuth and proxies to the admin-path runner.
 */
export async function runFangLayout(
    projectId: string,
    trigger: "manual" | "auto.sizing-complete" = "manual",
    overrides?: { layoutDomainOverride?: string },
): Promise<RunFangLayoutReturn> {
    return withAuth<RunFangLayoutReturn>(async ({ foundryId, user }) => {
        return runFangLayoutInternal(
            projectId,
            foundryId,
            user?.id ?? null,
            trigger,
            overrides,
        )
    })
}

/**
 * Background entry point — call from `after()` contexts where cookies
 * have already been sent to the client and withAuth would fail. Caller
 * must have ALREADY resolved foundryId from the authenticated context
 * before scheduling.
 */
export async function runFangLayoutBackground(
    projectId: string,
    foundryId: string,
    userId: string | null,
    trigger: "auto.sizing-complete" | "manual" = "auto.sizing-complete",
): Promise<RunFangLayoutReturn> {
    return runFangLayoutInternal(projectId, foundryId, userId, trigger)
}

// ─── Internal runner ───────────────────────────────────────────────────

async function runFangLayoutInternal(
    projectId: string,
    foundryId: string,
    _userId: string | null,
    trigger: "manual" | "auto.sizing-complete",
    overrides?: { layoutDomainOverride?: string },
): Promise<RunFangLayoutReturn> {
    const admin = createAdminClient()

    // 1. Load project + verify tenant ownership.
    // spatial_plan is a new column on cad_lab_projects; database.types.ts
    // hasn't been regenerated in this branch (shared file, not ours to
    // touch). We don't select it directly — we write to it via a cast on
    // the update path.
    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select(
            "id, foundry_id, subject, modules, research, dimension_sheet",
        )
        .eq("id", projectId)
        .maybeSingle()
    if (projectErr) {
        return { ok: false, error: projectErr.message, errorCode: "PROJECT_READ_FAILED" }
    }
    if (!project) {
        return { ok: false, error: "Project not found.", errorCode: "PROJECT_NOT_FOUND" }
    }
    if (project.foundry_id !== foundryId) {
        return { ok: false, error: "Project not found.", errorCode: "PROJECT_FORBIDDEN" }
    }

    const modules = (project.modules as CadLabModule[] | null) ?? []
    if (modules.length === 0) {
        return {
            ok: false,
            skipped: true,
            runId: "",
            reason: "No modules yet — layout skipped. Decompose with Max first.",
        }
    }

    const dimensionSheet = (project.dimension_sheet as DimensionSheet | null) ?? null

    // 2. Extract domain + targets from the research brief (same shape as
    // runFangSizing reads — we deliberately mirror the derivation so a
    // founder who passed sizing also passes layout).
    const research = (project.research ?? null) as
        | {
              industryDomain?: string
              designBrief?: {
                  capacity?: Record<string, number>
                  targets?: Record<string, number>
              }
          }
        | null
    const subject = typeof project.subject === "string" ? project.subject : ""
    const industryDomain =
        research?.industryDomain ?? inferDomainFromSubject(subject)

    const fromBrief = inferTargetsFromBrief(industryDomain, research?.designBrief)
    const fromSubject = inferTargetsFromSubject(subject, industryDomain)
    const targets: Record<string, number> = { ...fromSubject, ...fromBrief }
    if (industryDomain && Object.keys(targets).length === 0) {
        const sizingRules = getRulesByDomain(industryDomain)
        if (sizingRules) {
            for (const [k, spec] of Object.entries(sizingRules.targetSpec)) {
                if (spec.default !== undefined) targets[k] = spec.default
            }
        }
    }

    // 3. Open pipeline_run row.
    let runId = ""
    try {
        const started = await startPipelineRun({
            foundry_id: foundryId,
            project_id: projectId,
            specialist_id: SPECIALIST_ID,
            stage: STAGE,
            trigger,
            model_provider: "deterministic",
            input_ref: {
                industryDomain,
                layoutDomainOverride: overrides?.layoutDomainOverride ?? null,
                hasDimensionSheet: dimensionSheet !== null,
                dimensionSheetFeasible: dimensionSheet?.feasible ?? false,
                moduleCount: modules.length,
            },
        })
        runId = started.runId
    } catch (err) {
        console.error(
            "[run-fang-layout] startPipelineRun threw:",
            err instanceof Error ? err.message : err,
        )
        return {
            ok: false,
            error: "Couldn't start the layout pipeline run.",
            errorCode: "INTERNAL",
        }
    }

    try {
        // 4. Short-circuit the two documented skip paths BEFORE calling
        // buildSpatialPlan — they produce the same null-plan outcome but
        // with a more specific note we want to surface in pipeline_runs.
        if (!dimensionSheet || !dimensionSheet.feasible) {
            const reason =
                "Layout skipped — sizing did not produce a feasible dimension sheet."
            await persistSpatialPlan(admin, projectId, foundryId, null)
            await completePipelineRun(runId, {
                output_ref: {
                    skipped: true,
                    reason,
                    industryDomain,
                    hasDimensionSheet: dimensionSheet !== null,
                    dimensionSheetFeasible: dimensionSheet?.feasible ?? false,
                },
            })
            return { ok: false, skipped: true, runId, reason }
        }

        // 5. Run the layout engine.
        const outcome = buildSpatialPlan({
            industryDomain,
            dimensionSheet,
            modules,
            targets,
            layoutDomainOverride: overrides?.layoutDomainOverride,
            authoredBy: "fang",
        })

        if (!outcome.plan) {
            // Legitimate skip — no rules library matches the industry
            // domain, or the library's layoutFn threw. Persist null and
            // mark the run done-with-skip so the UI can render "Layout
            // skipped" instead of "Layout failed".
            const reason =
                outcome.skipReason ??
                "Layout engine returned no plan (no matching rules library)."
            await persistSpatialPlan(admin, projectId, foundryId, null)
            await completePipelineRun(runId, {
                output_ref: {
                    skipped: true,
                    reason,
                    industryDomain,
                    rulesDomain: outcome.rules?.domain ?? null,
                    rulesVersion: outcome.rules?.version ?? null,
                },
            })
            return { ok: false, skipped: true, runId, reason }
        }

        // 6. Persist spatial_plan on the project.
        const persistErr = await persistSpatialPlan(
            admin,
            projectId,
            foundryId,
            outcome.plan,
        )
        if (persistErr) {
            await failPipelineRun(runId, "SAVE_FAILED", persistErr)
            return {
                ok: false,
                error: persistErr,
                errorCode: "SAVE_FAILED",
                runId,
            }
        }

        await completePipelineRun(runId, {
            output_ref: {
                table: "cad_lab_projects",
                column: "spatial_plan",
                planType: outcome.plan.plan_type,
                view: outcome.plan.view,
                placementCount: outcome.plan.placements.length,
                featureCount: outcome.plan.features.length,
                constraintCount: outcome.plan.constraints.length,
                rulesDomain: outcome.plan.rules_domain,
                rulesVersion: outcome.plan.rules_version,
            },
        })

        return {
            ok: true,
            runId,
            placementCount: outcome.plan.placements.length,
            featureCount: outcome.plan.features.length,
            constraintCount: outcome.plan.constraints.length,
            rulesDomain: outcome.plan.rules_domain,
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown layout error"
        console.error("[run-fang-layout] unexpected throw:", message)
        try {
            await failPipelineRun(runId, "INTERNAL", message)
        } catch {
            // swallow — pipeline row will be swept by the watchdog
        }
        return { ok: false, error: message, errorCode: "INTERNAL", runId }
    }
}

/**
 * Writes spatial_plan to cad_lab_projects. Returns null on success, an error
 * message string on failure. Cast through `unknown as never` because
 * database.types.ts hasn't been regenerated for the new column yet; the
 * autopilot_state pattern (in forge-v2-autopilot.ts) uses the same shape.
 */
async function persistSpatialPlan(
    admin: ReturnType<typeof createAdminClient>,
    projectId: string,
    foundryId: string,
    plan: SpatialPlan | null,
): Promise<string | null> {
    const { error } = await admin
        .from("cad_lab_projects")
        .update({ spatial_plan: plan } as unknown as never)
        .eq("id", projectId)
        .eq("foundry_id", foundryId)
    return error ? error.message : null
}

// ─── Status loader (for UI chip) ──────────────────────────────────────

export async function loadFangLayoutStatus(
    projectId: string,
): Promise<{
    chip: FangLayoutChip
    spatialPlan: SpatialPlan | null
    errorMessage: string | null
}> {
    return withAuth<{
        chip: FangLayoutChip
        spatialPlan: SpatialPlan | null
        errorMessage: string | null
    }>(async ({ foundryId }) => {
        const admin = createAdminClient()
        // spatial_plan not in generated types yet — cast the row.
        const { data: project } = await admin
            .from("cad_lab_projects")
            .select("foundry_id")
            .eq("id", projectId)
            .maybeSingle()
        if (!project || project.foundry_id !== foundryId) {
            return { chip: "not-started", spatialPlan: null, errorMessage: null }
        }

        // Separate select for spatial_plan — cast through unknown because
        // the generated type doesn't know about the column. Keeps the
        // shared types.ts untouched per the branch's sub-agent rules.
        const { data: planRow } = await admin
            .from("cad_lab_projects")
            .select("spatial_plan" as unknown as "id")
            .eq("id", projectId)
            .maybeSingle()
        const spatialPlan =
            ((planRow as unknown as { spatial_plan: SpatialPlan | null } | null)
                ?.spatial_plan ?? null) as SpatialPlan | null

        const { data: latestRun } = await admin
            .from("pipeline_runs")
            .select("status, error_message, output_ref")
            .eq("project_id", projectId)
            .eq("specialist_id", SPECIALIST_ID)
            .eq("stage", STAGE)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        let chip: FangLayoutChip = "not-started"
        if (latestRun) {
            const outputRef = latestRun.output_ref as { skipped?: boolean } | null
            if (latestRun.status === "running") chip = "running"
            else if (latestRun.status === "failed") chip = "failed"
            else if (latestRun.status === "done" && outputRef?.skipped) chip = "skipped"
            else if (latestRun.status === "done") chip = "done"
        }

        return {
            chip,
            spatialPlan,
            errorMessage: latestRun?.error_message ?? null,
        }
    })
}
