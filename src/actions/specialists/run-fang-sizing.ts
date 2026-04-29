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
import {
    consumeRemediationContext,
    buildRemediationPromptBlock,
} from "@/lib/forge-v2/stage-gates/remediation"
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
import {
    areSameProductClass,
    areSameEnvelopeVariant,
    getEnvelopeClassificationTag,
} from "@/lib/forge-v2/envelope-classification"
import {
    hasTopologyRecommendation,
    findTopologyRecommendations,
} from "@/lib/forge-v2/topology-detection"

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
    /**
     * SOLVER_ERROR — Fang produced NULL/feasible=null dimension_sheet.
     *   Pipeline must set autopilot_state.stage = 'solver_error' (terminal).
     *
     * DELIVER_AND_PUSHBACK — alternate envelope is a different product class.
     *   The briefed-class max-feasible sheet is already persisted from attempt 1
     *   with class-fence fields. Pipeline should advance normally; the PDF will
     *   render the trade-off callout from closest_feasible_alternate.
     *
     * NEEDS_MAX_REDECOMPOSITION — solver recommendations contain a topology-level
     *   change (split module into N units, externalise a skid as a separate module,
     *   add an auxiliary subsystem). The current module layout cannot be salvaged
     *   by re-sizing alone. Max must produce a NEW decomposition with the solver's
     *   structural guidance as a hard override constraint. Pipeline sets
     *   autopilot_state.stage = 'waiting_max_redecomposition' (TRANSITIONAL, not
     *   terminal). After Max re-decomposes the pipeline continues normally.
     *
     * All other codes are transient errors that may be retried.
     */
    errorCode?: string | "SOLVER_ERROR" | "DELIVER_AND_PUSHBACK" | "NEEDS_MAX_REDECOMPOSITION"
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
    // Gate-3 remediation may override this with closest_feasible_alternate.envelope
    // (computed below after consumeRemediationContext); see effectiveEnvelope at step 4.
    const briefEnvelope =
        overrides?.envelope ?? inferEnvelopeFromBriefText(briefTextHaystack) ?? undefined

    // 2c. Gate remediation context — consume and record for audit.
    //
    //     When Gate 3 FAILs on a previous attempt and the cron handler
    //     triggers remediation, it stashes a structured context string at
    //     cad_lab_projects.gate_remediation_context["waiting_sizing"].
    //
    //     For Fang sizing specifically, the context signals that attempt 1
    //     was INFEASIBLE. The structured remediation is applied via
    //     closest_feasible_alternate.envelope (computed by the solver on
    //     attempt 1 and stored on dimension_sheet). See remediationEnvelopeOverride
    //     below and effectiveEnvelope at step 4.
    //
    //     Additionally the context provides:
    //       (a) Audit trail: recorded in pipeline_runs.input_ref so the
    //           handover log shows "this run was a gate-remediation re-fire".
    //       (b) Context clearing: the consume-once semantics ensure the
    //           context doesn't persist to a 3rd run if attempt 2 escalates
    //           to Max re-decompose (which targets waiting_max, not waiting_sizing).
    //
    //     SAFETY: returns null when no remediation context exists. Projects
    //     without gate remediation behave exactly as before this change.
    const gateSizingRemediationCtx = await consumeRemediationContext(
        projectId,
        "waiting_sizing",
    )

    // ── Gate 3 remediation path ──────────────────────────────────────────────
    //
    // When Gate 3 FAILs on a previous attempt and the cron handler triggers
    // remediation, it stashes context at gate_remediation_context["waiting_sizing"].
    // The solver's attempt 1 may have stored closest_feasible_alternate.envelope
    // — the alternate we feed into attempt 2.
    //
    // GUARD 1 — NULL / feasible-null = solver error, NOT recoverable
    // ─────────────────────────────────────────────────────────────────
    // If we are in a remediation context (attempt 2) AND the previous
    // dimension_sheet is still null (Fang produced nothing on attempt 1),
    // that is a solver error, not an infeasibility we can retry through.
    // Advancing to matching_suppliers or generating_illustration with a NULL
    // sheet produces a PDF with no actual sizing — the Loop 24 HAPS /
    // Desalination / Hedgerow failure pattern.
    //
    // COUNCIL RULE (GPT-5.5 snippet, gate3-council-2/SYNTHESIS.md 2026-04-29):
    //   if (!dimensionSheet || dimensionSheet.feasible == null) → SOLVER_ERROR
    //
    // We surface this as a `RunFangSizingError` with errorCode SOLVER_ERROR.
    // The autopilot-step handler receiving this error MUST set
    // autopilot_state.stage = 'solver_error' (terminal) so the cron loop
    // stops advancing the project.

    if (gateSizingRemediationCtx) {
        const prevSheet = (project.dimension_sheet as DimensionSheet | null) ?? null
        if (!prevSheet || prevSheet.feasible == null) {
            console.error(
                "[fang-sizing] SOLVER_ERROR: remediation context present but dimension_sheet is null/feasible=null.",
                { projectId, prevSheetPresent: !!prevSheet },
            )
            return {
                ok: false,
                error:
                    "Fang produced no dimension sheet on attempt 1. " +
                    "Solver cannot proceed — this project requires manual brief review.",
                errorCode: "SOLVER_ERROR",
                runId: "",
            }
        }
    }

    // ── Gate 3 remediation: class-fence + deliver-and-pushback ───────────────
    //
    // GUARD 2 — alternate must share the EXACT briefed envelope variant for auto-retry
    // ─────────────────────────────────────────────────────────────────────────
    // Read closest_feasible_alternate from the previous attempt.
    // If the alternate is the SAME envelope variant as the briefed envelope
    // (same kind AND same product class), we can safely retry — the solver
    // proved it fits within the same physical package.
    //
    // If the alternate differs in ANY way — different product class (e.g. 40ft
    // ISO → warehouse_bay) OR same class but different size variant (e.g. 40ft
    // ISO → 20ft ISO, both "transportable_container") — we must NOT silently
    // swap. Instead we annotate the existing dimension_sheet with class-fence
    // fields and return a special `DELIVER_AND_PUSHBACK` errorCode.
    //
    // Loop 25 Desalination Module 3.1 failure: the solver substituted a 20ft
    // enclosure for a briefed 40ft brief. areSameProductClass returned true
    // (both "transportable_container") so Guard 2 did not fire. The GPT-5.5
    // and DeepSeek council holdouts (2026-04-29) labelled this "silent dimension
    // swap — same family of error as phantom-GREEN: the system presents
    // feasibility by mutating the brief." Fix: switch to areSameEnvelopeVariant,
    // which requires kind equality in ADDITION to the class tag match.
    //
    // ANTI-CHEAT: areSameEnvelopeVariant() is a deterministic enum compare.
    // NEVER replaced with an LLM call.

    let remediationEnvelopeOverride: Envelope | undefined = undefined
    if (gateSizingRemediationCtx) {
        const prevSheet = (project.dimension_sheet as DimensionSheet | null)!
        const alternate = prevSheet.closest_feasible_alternate ?? null

        if (alternate?.envelope) {
            const briefedEnvelope = briefEnvelope ?? prevSheet.envelope
            const sameVariant = areSameEnvelopeVariant(briefedEnvelope, alternate.envelope)

            if (!sameVariant) {
                // ── Deliver-and-pushback path ──────────────────────────────────
                // The solver's alternate is a different product class.
                // Annotate the existing sheet with class-fence fields so the PDF
                // can render the "you might consider this" trade-off callout.
                // Then return DELIVER_AND_PUSHBACK — no retry with the alternate.
                const briefedTag = getEnvelopeClassificationTag(briefedEnvelope)
                const alternateTag = getEnvelopeClassificationTag(alternate.envelope)

                // Extract the primary capacity metric from the existing sheet.
                // We look for the first numeric target value as a best-effort proxy.
                const primaryTargetEntry = Object.entries(prevSheet.target ?? {}).find(
                    ([, v]) => typeof v === "number",
                )
                const capacityValue = primaryTargetEntry?.[1] ?? null
                const capacityUnits = primaryTargetEntry?.[0] ?? "units"
                const alternateCapacityValue =
                    alternate.target
                        ? (Object.values(alternate.target).find((v) => typeof v === "number") ?? null)
                        : null

                // Patch the sheet's closest_feasible_alternate with class-fence fields.
                // This is a WRITE to the DB so the PDF export picks it up.
                const patchedAlternate = {
                    ...alternate,
                    briefed_classification_tag: briefedTag,
                    alternate_classification_tag: alternateTag,
                    product_class_match: false as const,
                    capacity_at_briefed_class: {
                        value: capacityValue as number | null,
                        units: capacityUnits,
                        deficit: null,
                        summary: `The briefed ${briefedEnvelope.label} class (${briefedTag}) ` +
                            `cannot achieve the full target. ` +
                            `Maximum feasible: ${capacityValue ?? "see sheet"} ${capacityUnits}.`,
                    },
                    capacity_at_alternate_class: {
                        value: alternateCapacityValue as number | null,
                        units: capacityUnits,
                    },
                    trade_off_note: `If you relax the envelope class from ${briefedTag} ` +
                        `(${briefedEnvelope.label}) to ${alternateTag} ` +
                        `(${alternate.envelope.label}), the full target may be achievable. ` +
                        `Return to the brief and update the envelope to switch. ` +
                        `Otherwise the design proceeds at the maximum feasible capacity ` +
                        `for the briefed class.`,
                }

                // Persist the patched sheet with class-fence fields.
                const admin = createAdminClient()
                const patchedSheet = { ...prevSheet, closest_feasible_alternate: patchedAlternate }
                await admin
                    .from("cad_lab_projects")
                    .update({
                        dimension_sheet: patchedSheet as unknown as Database["public"]["Tables"]["cad_lab_projects"]["Row"]["dimension_sheet"],
                    } as Database["public"]["Tables"]["cad_lab_projects"]["Update"])
                    .eq("id", projectId)

                console.log("[fang-sizing] class-fence DELIVER_AND_PUSHBACK:", {
                    briefedClass: briefedTag,
                    alternateClass: alternateTag,
                    briefedEnvelope: briefedEnvelope.kind,
                    alternateEnvelope: alternate.envelope.kind,
                })

                return {
                    ok: false,
                    error:
                        `Alternate envelope (${alternate.envelope.label}, kind=${alternate.envelope.kind}) ` +
                        `differs from the briefed envelope (${briefedEnvelope.label}, kind=${briefedEnvelope.kind}). ` +
                        `Class-fence or variant-fence triggered. ` +
                        `Delivering briefed-envelope max-feasible result with alternate as a pushback suggestion.`,
                    errorCode: "DELIVER_AND_PUSHBACK",
                    runId: "",
                }
            }

            // ── Guard 3 — topology overflow check ───────────────────────────
            //
            // Same envelope variant confirmed — but before committing to a
            // re-size retry, check whether the solver's recommendations signal
            // a TOPOLOGY-LEVEL structural change. If they do, re-sizing the same
            // module layout is futile: the issue is the decomposition itself, not
            // the sizes.
            //
            // Council R1 P1 framing (gates-council 2026-04-29): "when the gate's
            // remediation requires topology change (split into 2×40ft, externalise
            // PCS skid), Max needs to redecompose, not Fang."
            //
            // When topology recommendations are found, we:
            //   1. Persist the existing (infeasible) dimension_sheet with a note.
            //   2. Build a structured remediation context for Max.
            //   3. Return NEEDS_MAX_REDECOMPOSITION — route handler sets
            //      autopilot_state.stage = 'waiting_max_redecomposition'.
            //
            // ANTI-CHEAT: topology detection is a deterministic regex on the
            // solver's own text — never an LLM call.
            const topologyRecs = findTopologyRecommendations(prevSheet.recommendations ?? [])
            if (topologyRecs.length > 0) {
                const primaryCapacityEntry = Object.entries(prevSheet.target ?? {}).find(
                    ([, v]) => typeof v === "number",
                )
                const constraintsToPreserve: Record<string, number> = {}
                if (primaryCapacityEntry) {
                    constraintsToPreserve[primaryCapacityEntry[0]] = primaryCapacityEntry[1] as number
                }

                const moduleChanges: Array<{ kind: string; reason: string; into_count?: number }> =
                    topologyRecs.map((rec) => {
                        const splitCountMatch = rec.match(/split\s+(?:into\s+)?(\d+)/i)
                        if (splitCountMatch) {
                            return {
                                kind: "split",
                                reason: rec,
                                into_count: parseInt(splitCountMatch[1], 10),
                            }
                        }
                        if (/externalise|externalize/i.test(rec)) {
                            return { kind: "externalise", reason: rec }
                        }
                        return { kind: "restructure", reason: rec }
                    })

                const waitingMaxContext = JSON.stringify({
                    reason: "fang_sizing_topology_overflow",
                    recommended_module_changes: moduleChanges,
                    fang_solver_summary:
                        `The previous module decomposition produced a design that cannot fit ` +
                        `within the briefed ${prevSheet.envelope?.label ?? "envelope"} ` +
                        `due to structural topology constraints (not envelope-class mismatch). ` +
                        `The solver's analysis: ${topologyRecs.join("; ")}`,
                    constraints_to_preserve: constraintsToPreserve,
                    envelope: prevSheet.envelope
                        ? { kind: prevSheet.envelope.kind, label: prevSheet.envelope.label }
                        : null,
                })

                // Persist the sheet with a note so the audit trail is intact.
                const annotatedSheet = {
                    ...prevSheet,
                    notes: [
                        ...(prevSheet.notes ?? []),
                        `TOPOLOGY_OVERFLOW: solver detected ${topologyRecs.length} topology-level change recommendation(s). Max redecomposition triggered.`,
                    ],
                }
                await admin
                    .from("cad_lab_projects")
                    .update({
                        dimension_sheet: annotatedSheet as unknown as Database["public"]["Tables"]["cad_lab_projects"]["Row"]["dimension_sheet"],
                    } as Database["public"]["Tables"]["cad_lab_projects"]["Update"])
                    .eq("id", projectId)

                console.log("[fang-sizing] NEEDS_MAX_REDECOMPOSITION: topology overflow detected", {
                    projectId,
                    topologyRecCount: topologyRecs.length,
                    topologyRecs,
                    envelopeKind: prevSheet.envelope?.kind,
                })

                return {
                    ok: false,
                    error:
                        `Solver detected ${topologyRecs.length} topology-level recommendation(s) that require Max to redecompose: ` +
                        topologyRecs.join("; "),
                    errorCode: "NEEDS_MAX_REDECOMPOSITION",
                    runId: "",
                    _waitingMaxContext: waitingMaxContext,
                } as RunFangSizingError & { _waitingMaxContext: string }
            }

            // Same envelope variant AND no topology change — safe to retry with
            // the alternate envelope.
            remediationEnvelopeOverride = alternate.envelope
            console.log("[fang-sizing] remediation same-variant override applied:", {
                fromEnvelope: prevSheet.envelope?.kind ?? "(none)",
                toEnvelope: remediationEnvelopeOverride.kind,
                briefedClass: getEnvelopeClassificationTag(briefedEnvelope),
                alternateClass: getEnvelopeClassificationTag(alternate.envelope),
                attempt: "gate-remediation-retry",
                contextChars: gateSizingRemediationCtx.length,
            })
        } else {
            // No alternate computed — solver failed without a feasible fallback.
            // Keep briefEnvelope unchanged; the solver will INFEASIBLE again
            // and Gate 3 attempt 2 will escalate to Max re-decompose.
            console.log("[fang-sizing] remediation: no alternate found, retrying with original envelope")
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
                envelopeKind: remediationEnvelopeOverride?.kind ?? overrides?.envelope?.kind ?? "default",
                // Audit trail: record whether this was a gate-remediation re-fire
                ...(gateSizingRemediationCtx
                    ? {
                          gate_remediation: true,
                          gate_context_chars: gateSizingRemediationCtx.length,
                          remediation_envelope_kind: remediationEnvelopeOverride?.kind ?? "none",
                      }
                    : {}),
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
        // When a gate-remediation retry is in flight, prefer the solver's
        // own closest_feasible_alternate.envelope over the brief-inferred
        // envelope — that alternate was already proven feasible by the
        // solver on attempt 1, so this is a legitimate engineering choice,
        // not tolerance relaxation.
        const effectiveEnvelope = remediationEnvelopeOverride ?? briefEnvelope
        let outcome = runSizing({
            industryDomain,
            domainOverride: overrides?.domainOverride,
            envelope: effectiveEnvelope,
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
                envelope: effectiveEnvelope,
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
