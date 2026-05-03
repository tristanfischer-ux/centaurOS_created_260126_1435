"use server"

/**
 * @file run-max-decomposition.ts — Max (CTO) module decomposition orchestrator.
 *
 * @description The canonical entry point that runs Max over a V2 project to
 * produce the module decomposition. Every caller (Modules empty-state CTA,
 * brief-lock auto-trigger, future re-runs) funnels through this action so
 * the pipeline_runs row is always written atomically alongside the mutation.
 *
 * Stage is `brief.decompose`. Trigger is either `manual` (founder clicked
 * the "Decompose with Max" button) or `auto.brief-lock` (brief lock just
 * landed and we're kicking off the first stage of the chain). The wrapper
 * is identical — only the trigger string changes.
 *
 * Pipeline:
 *   1. withAuth → user + foundryId
 *   2. Load project, verify ownership, check preconditions (research.report)
 *   3. Pre-flight tier budget check via checkAILimit(foundryId)
 *   4. startPipelineRun (specialist_id='cto', stage='brief.decompose')
 *   5. skeletonDecompose → skeleton modules
 *   6. expandModuleDetail × N with concurrency cap of 3 (Vercel 300s safety)
 *   7. Merge skeleton + expansions into CadLabModule[]
 *   8. saveCadLabModules
 *   9. completePipelineRun with token totals + output_ref
 *
 * Concurrency cap: expandModuleDetail typically takes 15-30s per module. At
 * concurrency 3, a 9-module decomposition wall-clocks around 45-90s plus
 * ~30s skeleton = well under Vercel's 300s cap. Running unbounded fan-out
 * would race the timeout for anything ≥ 12 modules.
 *
 * Token / cost tracking: both inner actions return tokensIn/tokensOut. We
 * sum them into the pipeline_run row. cost_gbp_pence stays null for now —
 * computing it needs the model's GBP-per-token price table, which today
 * lives in src/lib/ai/usage-tracking.ts and is foundry-tier aware. A
 * future pass wires that in; null is honest, fabricated numbers aren't.
 *
 * Error codes exposed to callers:
 *   - BUDGET_CAPPED    — tier AI budget exhausted; inner check refused
 *   - BUDGET_NOT_CHECKABLE — foundry tier / usage lookup threw
 *   - MISSING_BRIEF    — project has no research.report to decompose from
 *   - PROJECT_NOT_FOUND | PROJECT_FORBIDDEN — ownership guard failed
 *   - SKELETON_FAILED  — inner skeletonDecompose returned success=false
 *   - EXPAND_ALL_FAILED — every module expansion failed (catastrophic)
 *   - SAVE_FAILED      — saveCadLabModules returned an error
 *   - INTERNAL         — unclassified throw
 *
 * @related
 *   - Pre-read arch doc: /tmp/forge-v2-pipeline-arch/PIPELINE-ARCHITECTURE.md
 *   - Inner engines: src/actions/cad-lab.ts (skeletonDecompose, expandModuleDetail)
 *   - Pipeline wrappers: src/actions/pipeline-runs.ts
 *   - UI consumers: src/app/(platform)/the-forge-v2/projects/[id]/modules/
 *                   src/app/(platform)/the-forge-v2/projects/[id]/page.tsx
 */

import { skeletonDecompose, expandModuleDetail } from "@/actions/cad-lab"
import { saveCadLabModules, saveCadLabModulesBackground } from "@/actions/cad-lab-projects"
import {
    completePipelineRun,
    failPipelineRun,
    loadLatestRunForStage,
    startPipelineRun,
} from "@/actions/pipeline-runs"
import { sweepStalledRuns } from "@/actions/pipeline-runs-watchdog"

import { checkAILimit } from "@/lib/ai/limit-check"
import { withAuth } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkDecompositionCompleteness } from "@/lib/product-class-checklists"
import {
    consumeRemediationContext,
    buildRemediationPromptBlock,
    buildMaxTopologyOverrideBlock,
} from "@/lib/forge-v2/stage-gates/remediation"
import {
    emptyCanonicalSpecs,
    loadCanonicalSpecs,
    saveCanonicalSpecs,
    upsertCanonicalSpec,
    type CanonicalSpecs,
    type SpecKey,
} from "@/lib/cad-lab/canonical-ledger"
import type {
    CadLabModule,
    SkeletonModule,
} from "@/lib/cad-lab-types"
import { extractStageSection, extractConstraintAnchors, compressReferenceDossier } from "@/lib/reference-dossier"
import { loadGroundingData } from "@/lib/forge-v2/parallel-llm"
import { getCouncilFeedbackForStage } from "@/lib/forge-v2/stage-scoring"

// ─── Public types ──────────────────────────────────────────────────────

export type MaxRunStatusChip =
    | "not-started"
    | "queued"
    | "running"
    | "done"
    | "failed"
    | "cancelled"

export interface RunMaxDecompositionResult {
    ok: true
    runId: string
    moduleCount: number
}

export interface RunMaxDecompositionError {
    ok: false
    error: string
    errorCode?: string
    runId?: string
}

export type RunMaxDecompositionReturn =
    | RunMaxDecompositionResult
    | RunMaxDecompositionError

export interface LoadMaxRunStatusResult {
    status: MaxRunStatusChip
    startedAt?: string | null
    finishedAt?: string | null
    errorMessage?: string | null
    errorCode?: string | null
    moduleCount?: number | null
}

// ─── Constants ─────────────────────────────────────────────────────────

const SPECIALIST_ID = "cto"
const STAGE = "brief.decompose"
/** Max number of expandModuleDetail calls running concurrently. See header. */
const EXPAND_CONCURRENCY = 3

// ─── runMaxDecomposition ───────────────────────────────────────────────

/**
 * Runs Max over the given project, producing the module decomposition and
 * writing it to cad_lab_projects.modules. Wraps the call in a pipeline_runs
 * row for observability.
 *
 * @param projectId - V2 project UUID
 * @param trigger   - Why this run was kicked off (routed to pipeline_runs.trigger)
 */
export async function runMaxDecomposition(
    projectId: string,
    trigger: "manual" | "auto.brief-lock",
): Promise<RunMaxDecompositionReturn> {
    return withAuth<RunMaxDecompositionReturn>(async ({ user, foundryId }) => {
        return runMaxDecompositionInternal(
            projectId,
            foundryId,
            user.id,
            trigger,
        )
    })
}

/**
 * Background entry — called from `after()` post-response contexts (e.g. the
 * autopilot chain) where cookies are gone and `withAuth` would fail. Caller
 * MUST have already resolved foundryId from an authenticated request.
 *
 * This is the fix for #90. Every chained post-response handoff calls a
 * *Background variant that plumbs foundryId + userId explicitly.
 */
export async function runMaxDecompositionBackground(
    projectId: string,
    foundryId: string,
    userId: string | null,
    trigger: "auto.brief-lock" = "auto.brief-lock",
): Promise<RunMaxDecompositionReturn> {
    return runMaxDecompositionInternal(projectId, foundryId, userId, trigger)
}

async function runMaxDecompositionInternal(
    projectId: string,
    foundryId: string,
    userId: string | null,
    trigger: "manual" | "auto.brief-lock",
): Promise<RunMaxDecompositionReturn> {
    // Shim: expose `user.id` under the original closure name so the body
    // below continues to work. We only need `user.id` for triggered_by.
    // GOTCHA: triggered_by has an FK to auth.users, so passing a zero UUID
    // when the caller didn't supply a userId blows up with a FK violation
    // and kills the whole pipeline_run insert — observed 2026-04-23 on HAPS
    // autopilot run. triggered_by is nullable on the column, so pass null
    // straight through for system-fired runs (autopilot after() chain).
    const user: { id: string | null } = { id: userId }
    // Foundry is already known — skip the withAuth wrapper.
    void foundryId
        const admin = createAdminClient()
        // When autopilot fires this via background (userId null), skeleton
        // + expand still need a trusted identity to skip their internal
        // cookies-backed auth. Fall back to the foundry owner — that's the
        // legitimate "system user" for this tenant. Observed 2026-04-24 on
        // BESS run 6 where Max still failed "Unauthorized" because
        // trustedUserId was null and skeletonDecompose took the cookie path.
        if (!user.id) {
            const { data: foundry } = await admin
                .from("foundries")
                .select("owner_id")
                .eq("id", foundryId)
                .maybeSingle()
            if (foundry?.owner_id) user.id = foundry.owner_id
        }
        // 1. Load + verify project (foundry scope check via admin client —
        //    we can't use the user-scoped client because RLS on cad_lab_projects
        //    is keyed on foundry membership. The withAuth wrapper has already
        //    confirmed the caller is in foundryId; now confirm THIS project
        //    is in the same foundry, so we never accidentally decompose
        //    another tenant's project on behalf of this caller.)
        const { data: project, error: projectErr } = await admin
            .from("cad_lab_projects")
            .select("id, foundry_id, subject, model_id, research, reference_dossier")
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

        // 2. Precondition: Max needs research.report to decompose.
        //    skeletonDecompose accepts a description + researchReport and
        //    produces garbage (or fails) if research hasn't been run yet.
        //    Expose this honestly so the UI can route the founder to
        //    research first rather than showing a silent empty result.
        const research = (project.research ?? null) as
            | { report?: unknown; designBrief?: unknown }
            | null
        const report =
            research && typeof research.report === "string" ? research.report.slice(0, 12000) : ""
        const description =
            typeof project.subject === "string" ? project.subject.trim() : ""

        if (!description) {
            return {
                ok: false,
                error:
                    "This project doesn't have a subject yet — Max needs the founder's concept first.",
                errorCode: "MISSING_BRIEF",
            }
        }

        if (!report || report.trim().length < 200) {
            return {
                ok: false,
                error:
                    "Research hasn't been gathered for this project yet. Run research before decomposing with Max.",
                errorCode: "MISSING_BRIEF",
            }
        }

        // 2b. Gate remediation context — consume and prepend to research report.
        //
        //     When the cron handler triggers a remediation re-fire (after Gate 2
        //     or Gate 3 FAIL), it stashes a structured failure-context block at
        //     cad_lab_projects.gate_remediation_context["waiting_max"]. We read
        //     and clear it here (consume-once semantics) so that:
        //       - The failure context is visible to skeletonDecompose / expandModuleDetail
        //         via the researchReport argument without modifying cad-lab.ts internals.
        //       - Subsequent regen iterations (new pipeline_run_iteration) don't
        //         accidentally inherit stale remediation from a prior iteration.
        //
        //     DECISION: inject into the research report (not a separate argument)
        //     because skeletonDecompose's public interface doesn't have a separate
        //     systemPromptOverride parameter. Prepending as a clearly-labelled block
        //     at the top of the report is the safest pattern — the LLM reads the
        //     document top-to-bottom and will apply the constraint before processing
        //     the research content. The block instructs Max to apply it silently.
        //
        //     SAFETY: The `consumeRemediationContext` call returns null if no context
        //     exists. When null, `reportToUse` is identical to `report`. Projects
        //     without remediation context behave exactly as before this change.
        // Read remediation context from the standard "waiting_max" key first.
        // When this run was triggered by a topology-overflow from Fang sizing
        // (stage = "waiting_max_redecomposition"), the context was stashed at
        // "waiting_max_redecomposition" by triggerRemediation. Check both keys
        // so the prompt override is applied regardless of which path triggered
        // the redecomposition.
        const remediationCtx =
            (await consumeRemediationContext(projectId, "waiting_max")) ??
            (await consumeRemediationContext(projectId, "waiting_max_redecomposition"))

        // When the remediation context comes from a topology-overflow (fang_sizing_topology_overflow),
        // use gate ID 3 (topology gate) in the override block heading; otherwise use gate 2 (the
        // existing convention for brief-mismatch remediations that re-fired Max).
        const remediationGateId = (() => {
            if (!remediationCtx) return 2
            try {
                const parsed = JSON.parse(remediationCtx) as { reason?: string }
                return parsed.reason === "fang_sizing_topology_overflow" ? 3 : 2
            } catch {
                return 2
            }
        })()

        // Build the override prompt block. For topology overrides (gate 3) we use a
        // more specific heading so Max understands this is a structural architecture
        // constraint, not just a sizing refinement.
        const reportToUse = remediationCtx
            ? (remediationGateId === 3
                ? buildMaxTopologyOverrideBlock(remediationCtx)
                : buildRemediationPromptBlock(2, remediationCtx)) + report
            : report

        // 3. Pre-flight tier budget check.
        //    The inner skeletonDecompose / expandModuleDetail actions ALSO
        //    call enforceCadLabLimit(user.id, …) which re-checks this. That
        //    duplicate check is the source of truth for per-run enforcement;
        //    this outer one exists so the orchestrator can return a clean
        //    BUDGET_CAPPED errorCode before we've written a pipeline_runs
        //    row that would otherwise be immediately marked 'failed'.
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
            // Fail closed with a distinct errorCode so we don't silently let a
            // bad lookup turn into uncharged spend.
            console.error(
                "[run-max-decomposition] checkAILimit threw:",
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
        //    either complete or fail the run — otherwise it hangs in
        //    'running' forever and the UI chip lies.
        let runId: string
        try {
            const started = await startPipelineRun({
                foundry_id: foundryId,
                project_id: projectId,
                specialist_id: SPECIALIST_ID,
                stage: STAGE,
                trigger,
                triggered_by: user.id ?? undefined,
                model_provider: "deepseek",
                input_ref: { source: "subject+research", charCount: report.length },
            })
            runId = started.runId
        } catch (err) {
            console.error(
                "[run-max-decomposition] startPipelineRun threw:",
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
            // 5. Skeleton decomposition — fast, single Claude call, produces
            //    id/name/purpose/inputs/outputs for every module.
            //
            // COST TRIAL (2026-04-25): we use parallel-and-compare instead
            // of a single hardcoded model to increase diversity.
            const modelId = (project.model_id || "gpt-5.5") as Parameters<
                typeof skeletonDecompose
            >[2]
            // Load DB grounding data for Max stage (design_standards). Non-fatal
            // if it fails — skeleton proceeds without grounding context.
            let maxGroundingSection = ""
            try {
                maxGroundingSection = await loadGroundingData("waiting_max", projectId)
                if (maxGroundingSection) {
                    console.info("[run-max-decomposition] Injected DB grounding for waiting_max")
                }
            } catch (groundingErr) {
                console.warn("[run-max-decomposition] DB grounding failed (non-fatal):", groundingErr instanceof Error ? groundingErr.message : groundingErr)
            }

            // Council quality-gate feedback for re-runs
            const councilFeedback = await getCouncilFeedbackForStage(
                projectId,
                "waiting_max",
            )

            const maxDossierContext = (() => {
                const groundingBlock = maxGroundingSection ? `\n\n${maxGroundingSection}` : ""
                const councilBlock = councilFeedback ? `\n\n${councilFeedback}` : ""
                if (typeof project.reference_dossier !== "string" || project.reference_dossier.length === 0) return (groundingBlock + councilBlock) || undefined
                const stageSection = extractStageSection(project.reference_dossier, "max")
                const anchors = extractConstraintAnchors(project.reference_dossier)
                if (stageSection && anchors) return `${stageSection}\n\n${anchors}${groundingBlock}${councilBlock}`
                if (stageSection) return `${stageSection}${groundingBlock}${councilBlock}`
                return compressReferenceDossier(project.reference_dossier) + groundingBlock + councilBlock
            })()

            const skeletonResult = await skeletonDecompose(
                description,
                reportToUse, // gate remediation context prepended when present (see step 2b)
                modelId,
                undefined, // domainHint
                maxDossierContext, // documentContext — Stage 0 reference dossier
                user.id ?? undefined, // trustedUserId — use resolved user.id (owner-fallback applied above) not raw userId param
            )

            if (!skeletonResult.success || skeletonResult.modules.length === 0) {
                await failPipelineRun(
                    runId,
                    "SKELETON_FAILED",
                    skeletonResult.error ||
                        "Skeleton decomposition returned no modules.",
                    {
                        input_tokens: skeletonResult.tokensIn,
                        output_tokens: skeletonResult.tokensOut,
                        model_id:
                            typeof skeletonResult.modelUsed === "string"
                                ? skeletonResult.modelUsed
                                : null,
                    },
                )
                return {
                    ok: false,
                    runId,
                    error: skeletonResult.error || "Skeleton decomposition failed.",
                    errorCode: "SKELETON_FAILED",
                }
            }

            const skeletonModules = skeletonResult.modules
            let tokensIn = skeletonResult.tokensIn
            let tokensOut = skeletonResult.tokensOut

            // 6. Fan out per-module expansions with a concurrency cap.
            //    We accept partial success here — if 8 of 9 expand and 1
            //    fails, we still save the 8 and mark the run 'done'. Only
            //    if EVERY expansion fails do we roll back to failed.
            //
            // CROSS-MODULE SYMMETRY FIX (2026-04-25): when a module sets
            // `mirrorOf`, the parallel fan-out raced its primary and the
            // pair came back with different materials (HAPS demo: port wing
            // got monolithic gallium-arsenide cells, starboard got
            // interdigitated-back-contact silicon — same role, opposite
            // substrate). Split the expansion into two phases so the mirror's
            // prompt sees the primary's resolved spec as a consistencyBrief.
            //
            // Phase A: every module that is NOT a mirror (primaries + standalones).
            // Phase B: every module that IS a mirror, with primary's spec injected.
            const primarySkeletons = skeletonModules.filter((sk) => !sk.mirrorOf)
            const mirrorSkeletons = skeletonModules.filter((sk) => !!sk.mirrorOf)

            const primaryExpansions = await runWithConcurrency(
                primarySkeletons,
                EXPAND_CONCURRENCY,
                async (sk) =>
                    expandModuleDetail(
                        skeletonModules,
                        sk.id,
                        description,
                        reportToUse, // gate remediation context prepended when present
                        modelId,
                        undefined, // domainHint
                        undefined, // consistencyBrief — primaries don't need one
                        maxDossierContext, // Stage 0 reference dossier
                        user.id ?? undefined, // trustedUserId
                    ),
            )

            // Build a quick lookup so phase B can read primary specs.
            const primaryExpById = new Map(
                primaryExpansions
                    .filter((e) => e.success && e.expansion)
                    .map((e) => [e.moduleId, e.expansion!]),
            )

            const mirrorExpansions = mirrorSkeletons.length === 0
                ? []
                : await runWithConcurrency(
                      mirrorSkeletons,
                      EXPAND_CONCURRENCY,
                      async (sk) => {
                          // Find the primary's resolved spec — if its expansion
                          // failed, mirror still expands without a brief
                          // (better partial output than no output).
                          const primarySk = skeletonModules.find((s) => s.id === sk.mirrorOf)
                          const primaryExp = primarySk
                              ? primaryExpById.get(primarySk.id)
                              : undefined
                          let consistencyBrief: string | undefined
                          if (primarySk && primaryExp) {
                              consistencyBrief =
                                  `This module is the geometric mirror of "${primarySk.name}". ` +
                                  `It MUST use the same materials, manufacturing processes, key part list, ` +
                                  `and structural specifications as its mirror. The two halves of a symmetric ` +
                                  `product (e.g. port/starboard wings, left/right legs) are produced from the ` +
                                  `same drawings and tooling — they are not independently designed.\n\n` +
                                  `MIRROR'S RESOLVED SPEC:\n` +
                                  `- keyParts: ${JSON.stringify(primaryExp.keyParts)}\n` +
                                  `- description (preview): ${primaryExp.description.slice(0, 400)}${primaryExp.description.length > 400 ? "…" : ""}\n` +
                                  `- estimatedMassKg: ${primaryExp.estimatedMassKg}\n` +
                                  `- leadWeeks: ${primaryExp.leadWeeks}\n\n` +
                                  `Your output MUST mirror these. Diverge ONLY when geometry forces it ` +
                                  `(handedness, mounting orientation) — and even then, materials and ` +
                                  `processes stay identical.`
                          }
                          return expandModuleDetail(
                              skeletonModules,
                              sk.id,
                              description,
                              reportToUse, // gate remediation context prepended when present
                              modelId,
                              undefined, // domainHint
                              consistencyBrief,
                              maxDossierContext, // Stage 0 reference dossier
                              user.id ?? undefined,
                          )
                      },
                  )

            const expansions = [...primaryExpansions, ...mirrorExpansions]

            let successfulExpansions = 0
            for (const exp of expansions) {
                tokensIn += exp.tokensIn
                tokensOut += exp.tokensOut
                if (exp.success) successfulExpansions += 1
            }

            if (successfulExpansions === 0) {
                const firstError = expansions.find((e) => !e.success)?.error
                await failPipelineRun(
                    runId,
                    "EXPAND_ALL_FAILED",
                    firstError ||
                        "Every module expansion failed — decomposition not saved.",
                    {
                        input_tokens: tokensIn,
                        output_tokens: tokensOut,
                    },
                )
                return {
                    ok: false,
                    runId,
                    error:
                        "Max couldn't expand any modules — please try again in a moment.",
                    errorCode: "EXPAND_ALL_FAILED",
                }
            }

            // 7. Merge skeleton + expansions → CadLabModule[].
            const expansionById = new Map(
                expansions
                    .filter((e) => e.success && e.expansion)
                    .map((e) => [e.moduleId, e.expansion!]),
            )
            const modules: CadLabModule[] = skeletonModules.map((sk) =>
                buildCadLabModule(sk, expansionById.get(sk.id)),
            )

            // 7b. Item 6 (2026-04-29): product-class completeness check.
            //     After modules are built, cross-check against the heuristic
            //     checklist for the detected product class. Missing modules
            //     are logged and stored in the pipeline_run output_ref so
            //     the proofreader stage can pass them to computeFeasibilityVerdict
            //     as WARNING-level decomposition_gaps findings.
            //
            //     Non-fatal: a gap is a heuristic signal, not an error. Max
            //     may have legitimately renamed or merged modules. We surface
            //     it as a warning so the founder can verify before procurement.
            const moduleNames = modules.map((m) => m.name ?? "")
            const decompositionGap = checkDecompositionCompleteness(description, moduleNames)
            if (decompositionGap) {
                console.warn(
                    `[run-max-decomposition] Product-class completeness check: project=${projectId} class="${decompositionGap.productClass}" confidence=${Math.round(decompositionGap.confidence * 100)}% missing=${decompositionGap.missingModules.join(", ")}`,
                )
            } else {
                console.log(
                    `[run-max-decomposition] Product-class completeness check: project=${projectId} no product class detected or all expected modules present`,
                )
            }

            // 8. Persist modules. Use the Background variant so cookies-less
            //    autopilot hop contexts can write — saveCadLabModules (withAuth)
            //    returns "Unauthorized" here and fails the whole run despite
            //    skeleton+expansion having actually completed (observed run 8
            //    2026-04-24). The interactive path (not routed here) keeps the
            //    withAuth variant for UI callers.
            const saveResult = userId != null || user.id != null
                ? await saveCadLabModulesBackground(projectId, JSON.stringify(modules))
                : await saveCadLabModules(projectId, JSON.stringify(modules))
            if ("error" in saveResult) {
                await failPipelineRun(runId, "SAVE_FAILED", saveResult.error, {
                    input_tokens: tokensIn,
                    output_tokens: tokensOut,
                })
                return {
                    ok: false,
                    runId,
                    error: saveResult.error,
                    errorCode: "SAVE_FAILED",
                }
            }

            // 8b. L16-G #11d: Populate canonical_specs.modules so the ledger
            //     has Max's structural numeric specs available before BOM /
            //     Sizing / Fang fire. Without this, the ledger is empty until
            //     BOM merge runs (parts only) — module-level mass / power
            //     can't be patched by Fang because the moduleId target
            //     doesn't exist in canonical_specs.modules.
            //
            //     Today Max's expansion only emits `estimatedMassKg` as a
            //     structured numeric (lead-week is time, not a SPEC_KEYS
            //     numeric). Other module-level specs (powerW, voltageV,
            //     pressureBar) are NOT yet emitted — Max's prompt would
            //     need updating to produce a `module.specs` object keyed
            //     to SPEC_KEYS shape. Flagged in handover for council.
            //
            //     Source: max_decomposition (rank 50). Sizing solver
            //     (rank 80) and Fang patches (rank 90) override later via
            //     rank-gated upsert.
            //
            //     Failure here is NON-FATAL: modules array is the primary
            //     artefact (already persisted above). Canonical-specs
            //     failure is logged; downstream stages still run, BOM
            //     merge will populate canonical_specs.parts on its pass,
            //     and the PDF render snapshot is the back-stop.
            try {
                type CanonicalLoadable = Parameters<typeof loadCanonicalSpecs>[0]
                type CanonicalSavable = Parameters<typeof saveCanonicalSpecs>[0]
                const loadResult = await loadCanonicalSpecs(
                    admin as unknown as CanonicalLoadable,
                    projectId,
                )
                let specs: CanonicalSpecs = loadResult.ok
                    ? loadResult.specs
                    : emptyCanonicalSpecs()
                const priorRevision = loadResult.ok ? loadResult.revision : 0

                /**
                 * Phase E (Block G coverage extension, 2026-04-28): helper
                 * that upserts a single SPEC_KEYS key for a module if and
                 * only if the value is a finite positive number. Captures
                 * `specs` ledger by closure.
                 */
                const upsertIfPositive = (
                    moduleId: string,
                    moduleName: string,
                    key: SpecKey,
                    value: number | undefined,
                    rationaleSuffix: string,
                ): boolean => {
                    if (
                        typeof value !== "number" ||
                        !Number.isFinite(value) ||
                        value <= 0
                    ) {
                        return false
                    }
                    specs = upsertCanonicalSpec(specs, {
                        moduleId,
                        moduleName,
                        key,
                        value,
                        source: "max_decomposition",
                        rationale: `Max decomposition initial spec ${key} = ${value} ${rationaleSuffix}`,
                    })
                    return true
                }

                let writeCount = 0
                for (const mod of modules) {
                    if (!mod.id) continue
                    // Mass: legacy field, coalesced into canonical massKg.
                    if (upsertIfPositive(mod.id, mod.name, "massKg" as SpecKey, mod.estimatedMassKg, `for module ${mod.name}`)) {
                        writeCount += 1
                    }
                    // Phase E: full SPEC_KEYS shape.
                    if (mod.specs) {
                        const s = mod.specs
                        if (upsertIfPositive(mod.id, mod.name, "powerW" as SpecKey, s.powerW, `for module ${mod.name}`)) writeCount += 1
                        if (upsertIfPositive(mod.id, mod.name, "voltageV" as SpecKey, s.voltageV, `for module ${mod.name}`)) writeCount += 1
                        if (upsertIfPositive(mod.id, mod.name, "currentA" as SpecKey, s.currentA, `for module ${mod.name}`)) writeCount += 1
                        if (upsertIfPositive(mod.id, mod.name, "pressureBar" as SpecKey, s.pressureBar, `for module ${mod.name}`)) writeCount += 1
                        if (upsertIfPositive(mod.id, mod.name, "flowLpm" as SpecKey, s.flowLpm, `for module ${mod.name}`)) writeCount += 1
                        if (upsertIfPositive(mod.id, mod.name, "torqueNm" as SpecKey, s.torqueNm, `for module ${mod.name}`)) writeCount += 1
                        if (upsertIfPositive(mod.id, mod.name, "energyKwh" as SpecKey, s.energyKwh, `for module ${mod.name}`)) writeCount += 1
                        if (upsertIfPositive(mod.id, mod.name, "capacityWh" as SpecKey, s.capacityWh, `for module ${mod.name}`)) writeCount += 1
                        if (upsertIfPositive(mod.id, mod.name, "enduranceHours" as SpecKey, s.enduranceHours, `for module ${mod.name}`)) writeCount += 1
                        if (upsertIfPositive(mod.id, mod.name, "envelopeXMm" as SpecKey, s.envelopeXMm, `for module ${mod.name}`)) writeCount += 1
                        if (upsertIfPositive(mod.id, mod.name, "envelopeYMm" as SpecKey, s.envelopeYMm, `for module ${mod.name}`)) writeCount += 1
                        if (upsertIfPositive(mod.id, mod.name, "envelopeZMm" as SpecKey, s.envelopeZMm, `for module ${mod.name}`)) writeCount += 1
                    }
                    // Ensure the module entry exists even when no specs
                    // landed — this seeds the linkedPartIds slot so BOM merge's
                    // upsertCanonicalPart can wire parts into the right module.
                    if (!specs.modules[mod.id]) {
                        specs.modules[mod.id] = {
                            moduleId: mod.id,
                            moduleName: mod.name,
                            specs: {},
                            linkedPartIds: [],
                        }
                    }
                }

                const canonicalSaveResult = await saveCanonicalSpecs(
                    admin as unknown as CanonicalSavable,
                    projectId,
                    specs,
                    priorRevision,
                )
                if (!canonicalSaveResult.ok) {
                    console.warn(
                        `[run-max-decomposition] L16-G canonical_specs save non-fatal: project=${projectId} reason=${canonicalSaveResult.error}`,
                    )
                } else {
                    console.log(
                        `[run-max-decomposition] L16-G canonical_specs populated: project=${projectId} modules=${Object.keys(specs.modules).length} writes=${writeCount} revision=${canonicalSaveResult.revision}`,
                    )
                }
            } catch (err) {
                console.warn(
                    `[run-max-decomposition] L16-G canonical_specs populate threw (non-fatal): project=${projectId} err=${err instanceof Error ? err.message : err}`,
                )
            }

            // 9. Done. Record final token counts + output pointer. cost_gbp_pence
            //    stays null — see file header for why.
            //    Item 6: decompositionGap (if any) is stored in output_ref so
            //    run-proofreader.ts can read it when computing the feasibility
            //    verdict without re-running the detection logic.
            await completePipelineRun(runId, {
                input_tokens: tokensIn,
                output_tokens: tokensOut,
                model_id:
                    typeof skeletonResult.modelUsed === "string"
                        ? skeletonResult.modelUsed
                        : null,
                output_ref: {
                    table: "cad_lab_projects",
                    column: "modules",
                    moduleCount: modules.length,
                    expansionsOk: successfulExpansions,
                    expansionsTotal: skeletonModules.length,
                    // Item 6: decomposition gap stored for proofreader to consume.
                    // Cast as unknown → Json because Supabase's Json typedef is
                    // recursive and doesn't accept typed nested objects directly.
                    decompositionGap: (decompositionGap ?? null) as unknown,
                } as unknown as import("@/types/database.types").Json,
            })

            return {
                ok: true,
                runId,
                moduleCount: modules.length,
            }
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Unknown decomposition error"
            console.error("[run-max-decomposition] unexpected throw:", message)
            try {
                await failPipelineRun(runId, "INTERNAL", message)
            } catch (failErr) {
                console.error(
                    "[run-max-decomposition] failPipelineRun also threw:",
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
}

// ─── loadMaxRunStatus ──────────────────────────────────────────────────

/**
 * Reads the latest pipeline_runs row for (project_id, specialist='cto',
 * stage='brief.decompose') and returns a chip-friendly shape. Used by the
 * Modules page loader and the Workspace page loader.
 *
 * When no row exists the chip shows "not-started". The orchestrator is
 * still safe to call from that state — it writes the first row atomically.
 */
export async function loadMaxRunStatus(
    projectId: string,
): Promise<LoadMaxRunStatusResult> {
    return withAuth<LoadMaxRunStatusResult>(async ({ foundryId }) => {
        // Ownership check — same rationale as runMaxDecomposition.
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
        const moduleCount =
            row.output_ref && typeof row.output_ref === "object" && row.output_ref !== null
                ? ((row.output_ref as { moduleCount?: unknown }).moduleCount as number | undefined)
                : undefined
        return {
            status,
            startedAt: row.started_at,
            finishedAt: row.finished_at,
            errorCode: row.error_code,
            errorMessage: row.error_message,
            moduleCount: typeof moduleCount === "number" ? moduleCount : null,
        }
    })
}

// ─── Internals ─────────────────────────────────────────────────────────

/** Merges a skeleton module with its expanded detail (if present).
 *
 * leadTimeSource: Max's expansion prompt returns a raw `leadWeeks: number` but
 * does NOT self-tag its provenance. Without a tag the UI helpers (`leadSourceLabel`
 * on the modules list page, `leadSourceCaption` on the module detail page) and
 * the PDF all render the number with no caption — founders see "14 wk lead"
 * and have no way to judge whether it's a supplier quote or a best-guess.
 *
 * Max IS the specialist and the number IS his estimate, so the honest tag is
 * `specialist-judgement` ("Specialist judgement" in the UI). If a supplier quote
 * or historical analogue later supersedes this, a downstream specialist (Chase
 * via RFQ wins, Sage via benchmark analogue) will overwrite the field. We do
 * NOT backfill pre-existing rows — legacy modules with `leadTimeSource: null`
 * continue to render the honest "Provenance: not yet declared" empty-state in
 * the PDF and nothing (caption hidden) on the list card. */
function buildCadLabModule(
    sk: SkeletonModule,
    expansion:
        | {
              keyParts: string[]
              leadWeeks: number
              estimatedMassKg?: number
              /** Phase E (2026-04-28): forward Max's SPEC_KEYS-shaped specs. */
              specs?: CadLabModule["specs"]
              description: string
              whyItMatters: string
              failureModes: string[]
              unknowns: string[]
              /** Loop 7 P1: forward riskMatrix end-to-end. The previous
               *  builder stripped it silently — Five-Layer Silent Drop. */
              riskMatrix?: CadLabModule["riskMatrix"]
          }
        | undefined,
): CadLabModule {
    if (!expansion) {
        // Expansion failed for this module — keep the skeleton so the UI
        // can still render it, with honest empty details. leadWeeks=0 means
        // "no estimate" so we deliberately leave leadTimeSource unset —
        // there is no provenance to declare.
        return {
            id: sk.id,
            name: sk.name,
            purpose: sk.purpose,
            inputs: sk.inputs,
            outputs: sk.outputs,
            keyParts: [],
            leadWeeks: 0,
            description: "",
            whyItMatters: "",
            failureModes: [],
            unknowns: [],
            status: "pending",
            ...(sk.mirrorOf ? { mirrorOf: sk.mirrorOf } : {}),
        }
    }
    return {
        id: sk.id,
        name: sk.name,
        purpose: sk.purpose,
        inputs: sk.inputs,
        outputs: sk.outputs,
        keyParts: expansion.keyParts,
        leadWeeks: expansion.leadWeeks,
        leadTimeSource: "specialist-judgement",
        description: expansion.description,
        whyItMatters: expansion.whyItMatters,
        failureModes: expansion.failureModes,
        unknowns: expansion.unknowns,
        ...(expansion.riskMatrix && expansion.riskMatrix.length > 0
            ? { riskMatrix: expansion.riskMatrix }
            : {}),
        status: "pending",
        ...(typeof expansion.estimatedMassKg === "number"
            ? { estimatedMassKg: expansion.estimatedMassKg }
            : {}),
        ...(expansion.specs && Object.keys(expansion.specs).length > 0
            ? { specs: expansion.specs }
            : {}),
        ...(sk.mirrorOf ? { mirrorOf: sk.mirrorOf } : {}),
    }
}

/**
 * Runs an async mapper over an array with at most `limit` in flight at
 * once. Returns results in the same order as the input — failures are
 * represented by the awaited result of the mapper (so mapping callers
 * that return `{ success: false }` keep working the same way).
 */
async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let cursor = 0
    const workers: Array<Promise<void>> = []
    const workerCount = Math.max(1, Math.min(limit, items.length))

    async function runOne(): Promise<void> {
        while (true) {
            const idx = cursor++
            if (idx >= items.length) return
            try {
                results[idx] = await mapper(items[idx], idx)
            } catch (err) {
                // Surface as a rejected promise so the caller sees the throw
                // — expandModuleDetail itself never throws (it returns
                // { success: false, ... }), so this path is unexpected and
                // should NOT be silently swallowed.
                throw err instanceof Error
                    ? err
                    : new Error("Concurrent mapper threw non-Error value")
            }
        }
    }

    for (let i = 0; i < workerCount; i += 1) {
        workers.push(runOne())
    }
    await Promise.all(workers)
    return results
}

function mapDbStatusToChip(dbStatus: string): MaxRunStatusChip {
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
