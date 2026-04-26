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
import {
    inferTargetsFromBrief,
    inferTargetsFromBriefText,
    inferEnvelopeFromBriefText,
    runSizing,
} from "@/lib/sizing/sizing-engine"
import { decideAutoAdjustment, type BriefAutoAdjustment } from "@/lib/sizing/auto-adjust"
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
        | {
              industryDomain?: string
              designBrief?: {
                  capacity?: Record<string, number>
                  targets?: Record<string, number>
                  useCase?: string
                  mission?: string
                  complianceNotes?: string
                  targetCustomers?: string
                  whyNow?: string
              }
              report?: string | { content?: string }
          }
        | null
    const subject = typeof project.subject === "string" ? project.subject : ""
    const industryDomain =
        overrides?.domainOverride ??
        research?.industryDomain ??
        inferDomainFromSubject(subject)

    // Build a single free-text haystack from every brief field that might
    // mention capacity / form factor / market. Order matters only for
    // debugging — extraction is unit-aware so duplicates are fine.
    const briefTextHaystack = [
        subject,
        research?.designBrief?.useCase ?? "",
        research?.designBrief?.mission ?? "",
        research?.designBrief?.complianceNotes ?? "",
        research?.designBrief?.targetCustomers ?? "",
        research?.designBrief?.whyNow ?? "",
        typeof research?.report === "string"
            ? research.report
            : research?.report?.content ?? "",
    ]
        .filter((s) => typeof s === "string" && s.length > 0)
        .join(" \n ")

    // Track WHERE each target value came from so the orchestrator can flag
    // a default-only fallback as a conflict on the dimension sheet — that's
    // the bug pattern observed on BESS demo (1.5 MW asked, 100 kW returned
    // because brief extraction failed and the engine silently used the
    // library default).
    const targetProvenance: Record<string, "override" | "brief-structured" | "brief-text" | "subject" | "library-default"> = {}
    let targets: Record<string, number>
    if (overrides?.targets) {
        targets = overrides.targets
        for (const k of Object.keys(targets)) targetProvenance[k] = "override"
    } else {
        const fromBriefStructured = inferTargetsFromBrief(industryDomain, research?.designBrief)
        const fromBriefText = inferTargetsFromBriefText(industryDomain, briefTextHaystack)
        const fromSubject = inferTargetsFromSubject(subject, industryDomain)

        // Sizing-target priority (revised 2026-04-25 NIGHT after multi-model
        // critique caught BESS demo sized at 100 kW / 500 kWh when brief said
        // 1500 kW / 3500 kWh — `fromBriefStructured` had Max's default values
        // overriding the founder's real numbers in `fromBriefText`).
        //
        // New rule: take the MAX of all numeric sources. Founders state
        // capacity as a ceiling ("up to 3.5 MWh", "behind-the-meter
        // 1.5 MW"); under-sizing produces a different product. Library
        // defaults still apply only when no other source provides a value.
        // Provenance records the SOURCE OF THE WINNING VALUE for the audit
        // log so the founder can see where the number came from.
        targets = {}
        const merge = (
            src: Record<string, number>,
            label: typeof targetProvenance[string],
        ) => {
            for (const [k, v] of Object.entries(src)) {
                const existing = targets[k]
                if (existing === undefined || v > existing) {
                    targets[k] = v
                    targetProvenance[k] = label
                }
            }
        }
        merge(fromSubject, "subject")
        merge(fromBriefText, "brief-text")
        merge(fromBriefStructured, "brief-structured")

        if (industryDomain) {
            const rules = getRulesByDomain(industryDomain)
            if (rules) {
                for (const [k, spec] of Object.entries(rules.targetSpec)) {
                    if (targets[k] === undefined && spec.default !== undefined) {
                        targets[k] = spec.default
                        targetProvenance[k] = "library-default"
                    }
                }
            }
        }
    }

    // Infer envelope from the brief text BEFORE invoking the solver — this
    // is the VF demo regression fix (brief said "40-foot containerised"
    // but the rule library hardcoded WAREHOUSE_BAY_100 → spatial overflow).
    const briefEnvelope =
        overrides?.envelope ?? inferEnvelopeFromBriefText(briefTextHaystack) ?? undefined

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
        // 4. Run the solver — with auto-adjust loop. When the first pass
        //    returns infeasible, decideAutoAdjustment picks the smallest-
        //    delta target adjustment from sheet.recommendations (or from
        //    sheet.closest_feasible_alternate if populated), persists it
        //    to the audit trail, and re-runs the solver. Up to 2 retries.
        //    Tristan-directed 2026-04-26 NIGHT — "if the brief and
        //    constraints can't coexist, adjust the brief and try again".
        const briefAutoAdjustments: BriefAutoAdjustment[] =
            (((project as { research?: { _brief_auto_adjustments?: BriefAutoAdjustment[] } }).research)?._brief_auto_adjustments) ?? []
        let workingTargets = targets
        let outcome = runSizing({
            industryDomain,
            domainOverride: overrides?.domainOverride,
            envelope: briefEnvelope,
            targets: workingTargets,
            modules,
        })
        const maxAdjustAttempts = 2
        let adjustAttempt = 0
        while (
            outcome.ok &&
            !outcome.sheet.feasible &&
            briefAutoAdjustments.length + adjustAttempt < maxAdjustAttempts
        ) {
            // L9-P3: pass brief constraints so envelope swaps that
            // contradict the declared physical form (e.g. swapping
            // "40ft container" → "warehouse bay") are rejected and the
            // sizing terminal-fails instead of producing a fake-FEASIBLE
            // alternate that's a different product.
            const briefForFormCheck = {
                physicalForm: [
                    research?.designBrief?.useCase ?? "",
                    research?.designBrief?.mission ?? "",
                ]
                    .filter((s) => typeof s === "string" && s.length > 0)
                    .join(" "),
                transportConstraint: [
                    research?.designBrief?.complianceNotes ?? "",
                    research?.designBrief?.useCase ?? "",
                ]
                    .filter((s) => typeof s === "string" && s.length > 0)
                    .join(" "),
            }
            const decision = await decideAutoAdjustment(
                outcome.sheet,
                briefAutoAdjustments,
                briefForFormCheck,
            )
            if (!decision.reRun || !decision.adjustedTarget || !decision.adjustment) {
                break
            }
            briefAutoAdjustments.push(decision.adjustment)
            workingTargets = decision.adjustedTarget as typeof workingTargets
            adjustAttempt++
            console.warn(
                `[run-fang-sizing] auto-adjust attempt ${adjustAttempt}: ${decision.adjustment.field} ${decision.adjustment.fromValue} → ${decision.adjustment.toValue} (${decision.adjustment.reason})`,
            )
            outcome = runSizing({
                industryDomain,
                domainOverride: overrides?.domainOverride,
                envelope: briefEnvelope,
                targets: workingTargets,
                modules,
            })
        }

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

        // Brief-vs-final-config validation. The [FEASIBLE] tag on the sheet
        // only checks "config fits the envelope" — it does NOT check "config
        // matches what the brief asked for". When targets came from the
        // library default rather than the brief, the resolved config is
        // probably solving the wrong problem (BESS asked 1.5 MW / 3.5 MWh,
        // engine returned 100 kW / 500 kWh because brief extraction failed).
        // Surface this as an explicit conflict so downstream consumers (PDF,
        // founder UI, summary card) can flag it instead of trusting the
        // green [FEASIBLE] badge.
        const defaultedKeys = Object.entries(targetProvenance)
            .filter(([, p]) => p === "library-default")
            .map(([k]) => k)
        if (defaultedKeys.length > 0) {
            const rules = getRulesByDomain(sheet.rules_domain)
            const labels = defaultedKeys
                .map((k) => rules?.targetSpec[k]?.label ?? k)
                .join(", ")
            sheet.conflicts.push(
                `BRIEF UNRESOLVED — sizing fell back to library defaults for: ${labels}. The brief did not declare these targets in a recognised form, so the engine sized for the default config, not what the founder asked for. Re-run after declaring targets explicitly in the brief.`,
            )
            sheet.recommendations.unshift(
                `Re-run sizing with explicit ${labels} targets — the [FEASIBLE] badge below reflects envelope fit only, not brief satisfaction.`,
            )
            // Mark the sheet infeasible — even if the config fits the envelope
            // it does not solve the brief, and a green [FEASIBLE] badge here
            // misleads the founder.
            sheet.feasible = false
        }
        // Provenance log so the trace shows where each target came from.
        sheet.notes = [
            ...(sheet.notes ?? []),
            `target provenance: ${Object.entries(targetProvenance)
                .map(([k, p]) => `${k}=${p}`)
                .join(", ")}`,
            briefEnvelope
                ? `envelope: ${briefEnvelope.label} (from brief text)`
                : `envelope: ${sheet.envelope.label} (library default)`,
        ]

        // Persist dimension_sheet AND any auto-adjustments applied during
        // the loop above. The adjustments live in research._brief_auto_adjustments
        // — read by the cover banner so the founder sees what was relaxed.
        const projectUpdate: {
            dimension_sheet: unknown
            research?: unknown
        } = {
            dimension_sheet: sheet as unknown as Database["public"]["Tables"]["cad_lab_projects"]["Row"]["dimension_sheet"],
        }
        if (briefAutoAdjustments.length > 0 && adjustAttempt > 0) {
            const existingResearch = (project as { research?: Record<string, unknown> }).research ?? {}
            projectUpdate.research = {
                ...existingResearch,
                _brief_auto_adjustments: briefAutoAdjustments,
            }
        }
        const { error: writeErr } = await admin
            .from("cad_lab_projects")
            .update(projectUpdate as Database["public"]["Tables"]["cad_lab_projects"]["Update"])
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
