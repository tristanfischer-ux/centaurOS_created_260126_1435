"use server"

/**
 * @file run-fang-sizing.ts — Fang (VP Manufacturing) dimensional sizing
 * orchestrator.
 *
 * @description Runs the Forge sizing engine over a project and persists the
 * result as `cad_lab_projects.dimension_sheet`. Stage fires automatically
 * after Max completes decomposition (see run-max-decomposition.ts::after()),
 * so by the time the founder lands on the Modules page they see dimensioned
 * modules with feasibility + trade-off guidance — not just a decomposition
 * list.
 *
 * Architecture:
 *   1. withAuth → user + foundryId (when invoked from UI)
 *      OR admin path — when invoked from after() in a post-response context
 *      where cookies are gone. Both paths converge on the same internal
 *      implementation once foundryId is known.
 *   2. Load project, verify ownership, pick rules library by industryDomain.
 *   3. Infer targets from research.designBrief.capacity / .targets when the
 *      project hasn't declared them explicitly — default targets come from
 *      the rules library's `targetSpec.default` so sizing is runnable
 *      immediately after decomposition.
 *   4. Run the generic solver, assemble DimensionSheet, persist.
 *   5. Wrap in pipeline_runs (specialist_id='vp-manufacturing', stage='brief.sizing').
 *
 * The orchestrator NEVER fails the pipeline because sizing is an enhancement,
 * not a blocker — `skipped` is a legitimate outcome, logged and reported.
 * Downstream consumers must handle `dimension_sheet IS NULL` gracefully.
 *
 * @related
 *   - Core engine: src/lib/sizing/sizing-engine.ts
 *   - Registry: src/lib/sizing/rules/_registry.ts
 *   - Chained into: src/actions/specialists/run-max-decomposition.ts
 */

import {
    completePipelineRun,
    failPipelineRun,
    startPipelineRun,
} from "@/actions/pipeline-runs"
import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { inferTargetsFromBrief, runSizing } from "@/lib/sizing/sizing-engine"
import { getRulesByDomain } from "@/lib/sizing/rules/_registry"
import type { DimensionSheet, Envelope } from "@/lib/sizing/types"
import type { Database } from "@/types/database.types"

// ─── Subject-text heuristic (fallback when Max didn't populate industryDomain) ───

/**
 * Best-effort domain inference from the project subject. Used when
 * `research.industryDomain` is missing — a Max regression Tristan hit on
 * BESS 931e0220. Returns null if no signal; sizing is skipped gracefully.
 */
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

/**
 * Extract numeric targets from subject text as a final fallback before
 * using library defaults. Patterns: "500 kWh", "~100 kW", "200 m² canopy",
 * "8 kW thermal".
 */
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
        // If only kWh known, assume 0.2C (a common utility-scale C-rate).
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

export type FangSizingChip =
    | "not-started"
    | "running"
    | "done"
    | "failed"
    | "skipped"

export interface RunFangSizingResult {
    ok: true
    runId: string
    feasible: boolean
    conflictCount: number
    domain: string
}

export interface RunFangSizingSkipped {
    ok: false
    skipped: true
    runId: string
    reason: string
}

export interface RunFangSizingError {
    ok: false
    skipped?: false
    error: string
    errorCode?: string
    runId?: string
}

export type RunFangSizingReturn =
    | RunFangSizingResult
    | RunFangSizingSkipped
    | RunFangSizingError

// ─── Constants ─────────────────────────────────────────────────────────

const SPECIALIST_ID = "vp-manufacturing"
const STAGE = "brief.sizing"

// ─── Public actions ────────────────────────────────────────────────────

/**
 * Foreground entry point — call this from UI buttons / manual triggers.
 * Resolves foundry via withAuth and proxies to the admin-path runner.
 */
export async function runFangSizing(
    projectId: string,
    trigger: "manual" | "auto.max-complete" = "manual",
    overrides?: { domainOverride?: string; envelope?: Envelope; targets?: Record<string, number> },
): Promise<RunFangSizingReturn> {
    return withAuth<RunFangSizingReturn>(async ({ foundryId }) => {
        return runFangSizingInternal(projectId, foundryId, trigger, overrides)
    })
}

/**
 * Background entry point — call from `after()` contexts where cookies
 * have already been sent to the client and withAuth would fail. Caller
 * must have ALREADY resolved foundryId from the authenticated context
 * before scheduling.
 */
export async function runFangSizingBackground(
    projectId: string,
    foundryId: string,
    trigger: "auto.max-complete" = "auto.max-complete",
): Promise<RunFangSizingReturn> {
    return runFangSizingInternal(projectId, foundryId, trigger)
}

// ─── Internal runner ───────────────────────────────────────────────────

async function runFangSizingInternal(
    projectId: string,
    foundryId: string,
    trigger: "manual" | "auto.max-complete",
    overrides?: { domainOverride?: string; envelope?: Envelope; targets?: Record<string, number> },
): Promise<RunFangSizingReturn> {
    const admin = createAdminClient()

    // 1. Load project + verify tenant ownership.
    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select(
            "id, foundry_id, subject, modules, research, diagnostic_answers, dimension_sheet",
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
            reason: "No modules yet — sizing skipped. Decompose with Max first.",
        }
    }

    // 2. Extract domain + targets from the research brief (Max populates it).
    // Fallback: when Max didn't populate industryDomain / capacity, infer
    // from the project subject text. This makes sizing robust to the Max
    // schema regression Tristan hit on BESS 931e0220 (research.report
    // existed but industryDomain + capacity came back null).
    const research = (project.research ?? null) as
        | { industryDomain?: string; designBrief?: { capacity?: Record<string, number>; targets?: Record<string, number> } }
        | null
    const subject = typeof project.subject === "string" ? project.subject : ""
    const industryDomain =
        overrides?.domainOverride ??
        research?.industryDomain ??
        inferDomainFromSubject(subject)

    let targets: Record<string, number>
    if (overrides?.targets) {
        targets = overrides.targets
    } else {
        const fromBrief = inferTargetsFromBrief(industryDomain, research?.designBrief)
        const fromSubject = inferTargetsFromSubject(subject, industryDomain)
        // Brief wins when present; subject fills gaps; library defaults fill
        // remaining gaps (the registry-aware path in inferTargetsFromBrief
        // already folds in defaults when no other signal exists).
        targets = { ...fromSubject, ...fromBrief }
        if (industryDomain && Object.keys(targets).length === 0) {
            const rules = getRulesByDomain(industryDomain)
            if (rules) {
                for (const [k, spec] of Object.entries(rules.targetSpec)) {
                    if (spec.default !== undefined) targets[k] = spec.default
                }
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
                targets,
                envelopeKind: overrides?.envelope?.kind ?? "default",
            },
        })
        runId = started.runId
    } catch (err) {
        console.error(
            "[run-fang-sizing] startPipelineRun threw:",
            err instanceof Error ? err.message : err,
        )
        return {
            ok: false,
            error: "Couldn't start the sizing pipeline run.",
            errorCode: "INTERNAL",
        }
    }

    try {
        // 4. Run the solver.
        const outcome = runSizing({
            industryDomain,
            domainOverride: overrides?.domainOverride,
            envelope: overrides?.envelope,
            targets,
            modules,
        })

        if (!outcome.ok) {
            // "skipped" — legitimate outcome, not a failure. Stamp the run as
            // done with output_ref describing why sizing was skipped so the
            // UI can explain it to the founder.
            await completePipelineRun(runId, {
                output_ref: {
                    skipped: true,
                    reason: outcome.reason,
                    message: outcome.message,
                    industryDomain,
                },
            })
            return {
                ok: false,
                skipped: true,
                runId,
                reason: outcome.message,
            }
        }

        // 5. Persist dimension_sheet on the project.
        const sheet: DimensionSheet = outcome.sheet
        const { error: writeErr } = await admin
            .from("cad_lab_projects")
            .update({
                dimension_sheet: sheet as unknown as Database["public"]["Tables"]["cad_lab_projects"]["Row"]["dimension_sheet"],
            })
            .eq("id", projectId)
            .eq("foundry_id", foundryId)
        if (writeErr) {
            await failPipelineRun(runId, "SAVE_FAILED", writeErr.message)
            return {
                ok: false,
                error: writeErr.message,
                errorCode: "SAVE_FAILED",
                runId,
            }
        }

        await completePipelineRun(runId, {
            output_ref: {
                table: "cad_lab_projects",
                column: "dimension_sheet",
                feasible: sheet.feasible,
                conflictCount: sheet.conflicts.length,
                rulesDomain: sheet.rules_domain,
                rulesVersion: sheet.rules_version,
                moduleCount: Object.keys(sheet.module_dimensions).length,
                unmatchedModuleCount: sheet.unmatched_module_ids.length,
            },
        })

        return {
            ok: true,
            runId,
            feasible: sheet.feasible,
            conflictCount: sheet.conflicts.length,
            domain: sheet.rules_domain,
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown sizing error"
        console.error("[run-fang-sizing] unexpected throw:", message)
        try {
            await failPipelineRun(runId, "INTERNAL", message)
        } catch {
            // swallow — pipeline row will be swept by the watchdog
        }
        return { ok: false, error: message, errorCode: "INTERNAL", runId }
    }
}

// ─── Status loader (for UI chip) ──────────────────────────────────────

export async function loadFangSizingStatus(
    projectId: string,
): Promise<{
    chip: FangSizingChip
    dimensionSheet: DimensionSheet | null
    errorMessage: string | null
}> {
    return withAuth<{
        chip: FangSizingChip
        dimensionSheet: DimensionSheet | null
        errorMessage: string | null
    }>(async ({ foundryId }) => {
        const admin = createAdminClient()
        const { data: project } = await admin
            .from("cad_lab_projects")
            .select("foundry_id, dimension_sheet")
            .eq("id", projectId)
            .maybeSingle()
        if (!project || project.foundry_id !== foundryId) {
            return { chip: "not-started", dimensionSheet: null, errorMessage: null }
        }

        const { data: latestRun } = await admin
            .from("pipeline_runs")
            .select("status, error_message, output_ref")
            .eq("project_id", projectId)
            .eq("specialist_id", SPECIALIST_ID)
            .eq("stage", STAGE)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        const dimensionSheet = (project.dimension_sheet as DimensionSheet | null) ?? null

        let chip: FangSizingChip = "not-started"
        if (latestRun) {
            const outputRef = latestRun.output_ref as { skipped?: boolean } | null
            if (latestRun.status === "running") chip = "running"
            else if (latestRun.status === "failed") chip = "failed"
            else if (latestRun.status === "done" && outputRef?.skipped) chip = "skipped"
            else if (latestRun.status === "done") chip = "done"
        }

        return {
            chip,
            dimensionSheet,
            errorMessage: latestRun?.error_message ?? null,
        }
    })
}
