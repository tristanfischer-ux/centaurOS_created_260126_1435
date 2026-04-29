"use server"

/**
 * @file run-fang-review-via-modal.ts — Fang per-module review, routed via Modal.
 *
 * Companion to run-fang-review.ts. Same orchestration shell — preflight checks,
 * pipeline_runs lifecycle, review persistence, design cascade, canonical_specs
 * patch derivation — but the long-running LLM tool-loop is offloaded to the
 * Modal serverless app at scripts/modal/fang-review/main.py.
 *
 * Vercel containers SIGKILL at 22 min; aerospace-class Fang reviews can take
 * 15-25 min (HAPS Loop 17 lost 4 of 8 modules). Modal containers run 30 min by
 * default and are configurable.
 *
 * Feature flag FANG_VIA_MODAL=true routes Fang through Modal. Default off.
 *
 * Contract preservation:
 *   - Same input shape as runFangReviewBackground
 *   - Same RunFangReviewReturn output shape
 *   - Same pipeline_runs row lifecycle
 *   - Same cad_lab_projects.reviews[moduleId] JSONB merge
 *   - Same Block G #11b patch wiring (deriveFangPatches + applyDesignPatches)
 *   - Same review markdown shape — Block G extractor sees identical input
 *
 * Env wiring:
 *   - FANG_MODAL_URL              Modal endpoint URL
 *   - FANG_MODAL_AUTH_TOKEN       Header X-Auth-Token
 *   - FANG_TOOL_CALLBACK_URL      Vercel route, e.g. https://fractionalforge.app/api/internal/fang-call-tool
 *   - FANG_TOOL_CALLBACK_TOKEN    Bearer for the callback
 *   - FANG_VIA_MODAL              "true" to enable
 *
 * Rollback: unset FANG_VIA_MODAL. Legacy path untouched.
 */

import { randomUUID } from "node:crypto"

import {
    completePipelineRun,
    failPipelineRun,
    startPipelineRun,
} from "@/actions/pipeline-runs"
import { checkAILimit } from "@/lib/ai/limit-check"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildCadLabReviewContext } from "@/lib/ai-context/cad-lab-context"
import { getSpecialistById } from "@/lib/agents/specialists-config"
import { compilePersonalityPrompt } from "@/lib/agents/personality"
import { getToolsForSpecialist } from "@/lib/agents/tools/registry"
import { loadDomainKnowledge } from "@/lib/agents/domain-knowledge"
import type { ReviewModuleInput } from "@/actions/cad-lab-reviews"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type {
    CadLabDesignBrief,
    CadLabModule,
    SpecialistReview,
    ReviewVerdict,
    ReviewIssue,
    ReviewCalculation,
} from "@/lib/cad-lab-types"
import type { Database, Json } from "@/types/database.types"

// ─── Types ─────────────────────────────────────────────────────────────

export interface RunFangReviewResult {
    ok: true
    runId: string
    moduleId: string
    verdict: SpecialistReview["verdict"]
}

export interface RunFangReviewError {
    ok: false
    error: string
    errorCode?: string
    runId?: string
}

export type RunFangReviewReturn = RunFangReviewResult | RunFangReviewError

// ─── Constants ─────────────────────────────────────────────────────────

const SPECIALIST_ID = "vp-manufacturing"
const STAGE = "module.review.fang"
const REVIEW_MODEL = "claude-sonnet-4-6"
const MAX_TOOL_LOOPS = 5
const MAX_TOKENS = 16384

// ─── Public ───────────────────────────────────────────────────────────

// CONSTRAINT: "use server" files can ONLY export async functions (Next.js
// rule, breaks `next build` even though tsc passes). Keeping this helper
// async-shaped so it can stay co-located with the runner without forcing a
// sibling file. There are no synchronous callers — the route handler at
// /api/autopilot-step inlines its own check.
export async function isFangViaModalEnabled(): Promise<boolean> {
    const v = (process.env.FANG_VIA_MODAL ?? "").trim().toLowerCase()
    return v === "true" || v === "1" || v === "on"
}

export async function runFangReviewBackgroundViaModal(
    projectId: string,
    moduleId: string,
    foundryId: string,
    userId: string | null,
    trigger:
        | "auto.illustration-complete"
        | "auto.supplier-match-complete" = "auto.supplier-match-complete",
): Promise<RunFangReviewReturn> {
    const admin = createAdminClient()
    const user: { id: string | null } = { id: userId }

    if (!user.id) {
        const { data: foundry } = await admin
            .from("foundries")
            .select("owner_id")
            .eq("id", foundryId)
            .maybeSingle()
        if (foundry?.owner_id) user.id = foundry.owner_id
    }

    // Step 1 — ownership + module existence
    const { data: project, error: projectErr } = await admin
        .from("cad_lab_projects")
        .select("id, foundry_id, subject, name, modules, research, diagnostic_answers")
        .eq("id", projectId)
        .maybeSingle()

    if (projectErr) return { ok: false, error: "Couldn't load project", errorCode: "INTERNAL" }
    if (!project) return { ok: false, error: "Project not found", errorCode: "PROJECT_NOT_FOUND" }
    if (project.foundry_id !== foundryId) {
        return { ok: false, error: "Project not found", errorCode: "PROJECT_FORBIDDEN" }
    }

    const modules = (project.modules as CadLabModule[] | null) ?? []
    const targetModule = modules.find((m) => m.id === moduleId)
    if (!targetModule) {
        return {
            ok: false,
            error: "That module isn't on this project — refresh and try again.",
            errorCode: "MODULE_NOT_FOUND",
        }
    }

    // Step 2 — parts gating
    if (!targetModule.keyParts || targetModule.keyParts.length === 0) {
        const { count: partsCount } = await admin
            .from("parts")
            .select("id", { count: "exact", head: true })
            .eq("cad_lab_project_id", projectId)
            .eq("module_id", moduleId)
        if (!partsCount || partsCount === 0) {
            const { count: projectParts } = await admin
                .from("parts")
                .select("id", { count: "exact", head: true })
                .eq("cad_lab_project_id", projectId)
            if (!projectParts || projectParts === 0) {
                // Write a REVIEW_SKIPPED tombstone so the module is visible
                // to the feasibility gate rather than silently absent.
                // Council fix — item 1 (6/6, 2026-04-29).
                const { saveFangReviewSkippedTombstone } = await import(
                    "@/actions/specialists/run-fang-review"
                )
                await saveFangReviewSkippedTombstone(
                    projectId,
                    moduleId,
                    foundryId,
                    "no bill of materials parts found — generate bill of materials first",
                )
                return {
                    ok: false,
                    error:
                        "This module has no parts yet — generate BOM first so Fang has something to review.",
                    errorCode: "MODULE_NO_PARTS",
                }
            }
        }
    }

    // Step 3 — preflight tier budget
    try {
        const gate = await checkAILimit(foundryId)
        if (!gate.allowed) {
            return {
                ok: false,
                error: gate.message ?? "AI usage limit reached for this billing period.",
                errorCode: "BUDGET_CAPPED",
            }
        }
    } catch (err) {
        console.error(
            "[run-fang-review-via-modal] checkAILimit threw:",
            err instanceof Error ? err.message : err,
        )
        return {
            ok: false,
            error: "Couldn't verify your AI usage budget — try again in a moment.",
            errorCode: "BUDGET_NOT_CHECKABLE",
        }
    }

    // Step 4 — open pipeline_runs row
    let runId: string
    try {
        const started = await startPipelineRun({
            foundry_id: foundryId,
            project_id: projectId,
            specialist_id: SPECIALIST_ID,
            stage: STAGE,
            trigger,
            triggered_by: user.id ?? undefined,
            model_provider: "anthropic-via-modal",
            input_ref: { moduleId, viaModal: true },
        })
        runId = started.runId
    } catch (err) {
        console.error(
            "[run-fang-review-via-modal] startPipelineRun threw:",
            err instanceof Error ? err.message : err,
        )
        return {
            ok: false,
            error: "Couldn't start the pipeline run.",
            errorCode: "INTERNAL",
        }
    }

    try {
        const startedAt = Date.now()

        // Step 5 — build same prompt the legacy path builds
        const designBrief = extractDesignBrief(project.research as { designBrief?: unknown } | null)
        const diagnosticAnswers = extractDiagnosticAnswers(project.diagnostic_answers as unknown)
        const projectSubject =
            typeof project.subject === "string" && project.subject.length > 0
                ? project.subject
                : typeof project.name === "string"
                  ? project.name
                  : "Project"

        const allModules: ReviewModuleInput[] = modules.map(toReviewModuleInput)
        const targetModuleLean = allModules.find((m) => m.id === moduleId)
        if (!targetModuleLean) {
            await failPipelineRun(runId, "INTERNAL", "Module disappeared during prompt build")
            return { ok: false, runId, error: "Module not found during prompt build.", errorCode: "INTERNAL" }
        }

        const bomPartNumbersForModule = await loadBomPartNumbersForModule(admin, projectId, moduleId)
        const specialist = getSpecialistById(SPECIALIST_ID)
        if (!specialist) {
            await failPipelineRun(runId, "INTERNAL", "vp-manufacturing specialist config missing")
            return { ok: false, runId, error: "Internal: vp-manufacturing config missing", errorCode: "INTERNAL" }
        }

        const reviewContext = buildCadLabReviewContext(
            {
                module: targetModuleLean,
                allModules,
                designBrief: designBrief ?? undefined,
                diagnosticAnswers: diagnosticAnswers?.[moduleId],
                projectSubject,
                bomPartNumbersForModule,
            },
            SPECIALIST_ID,
        )

        const domainContext = loadDomainKnowledge(SPECIALIST_ID, specialist.description)
        const personalityPrompt = compilePersonalityPrompt(
            `${specialist.name}, the ${specialist.title} specialist`,
            specialist.personality,
            domainContext,
            SPECIALIST_ID,
        )

        const assemblyNotes = `

## Assembly Notes (REQUIRED for manufacturing specialist)
In addition to your DFM review, provide Assembly Notes for this module:
- Assembly sequence: Should this module be assembled early, middle, or late in the build?
- Fixtures and alignment: What jigs, fixtures, or alignment tools are needed?
- Critical assembly tolerances: Which dimensions must be held during assembly?
- Test points: What should be verified immediately after this module is assembled?
- Dependencies: Which other modules must be assembled before this one?

Include these in your recommendations section with the prefix "ASSEMBLY:" so they can be extracted.`

        const systemPrompt = personalityPrompt + "\n\n## Current Task: Design Review\nYou are performing a structured design review of a CAD Lab module. Use your tools to verify claims with real data — never guess material properties or process constraints.\n\n" + reviewContext + assemblyNotes

        const tools = getToolsForSpecialist(SPECIALIST_ID)
        const anthropicTools = tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters,
        }))

        const userMsg = `Review the module "${targetModuleLean.name}" and provide your structured assessment. Use your tools to verify engineering claims with real calculations and data lookups.`

        // Memory bridge omitted for MVP — adds non-trivial cookie/auth resolution
        // inside the prompt-build. Legacy path documents memory as additive
        // ("if it fails, reviews still work as before"). Track as follow-up.

        // Step 6 — call Modal
        const modalUrl = (process.env.FANG_MODAL_URL ?? "").trim()
        const modalAuth = (process.env.FANG_MODAL_AUTH_TOKEN ?? "").trim()
        const callbackUrl = (process.env.FANG_TOOL_CALLBACK_URL ?? "").trim()
        const callbackToken = (process.env.FANG_TOOL_CALLBACK_TOKEN ?? "").trim()

        if (!modalUrl || !modalAuth) {
            await failPipelineRun(runId, "MODAL_MISCONFIGURED", "FANG_MODAL_URL or FANG_MODAL_AUTH_TOKEN missing")
            return { ok: false, runId, error: "Fang Modal endpoint not configured.", errorCode: "MODAL_MISCONFIGURED" }
        }
        if (!callbackUrl || !callbackToken) {
            await failPipelineRun(runId, "MODAL_MISCONFIGURED", "FANG_TOOL_CALLBACK_URL or FANG_TOOL_CALLBACK_TOKEN missing")
            return { ok: false, runId, error: "Fang tool callback endpoint not configured.", errorCode: "MODAL_MISCONFIGURED" }
        }

        const requestId = randomUUID()
        const modalPayload = {
            request_id: requestId,
            model: REVIEW_MODEL,
            system: systemPrompt,
            messages: [{ role: "user" as const, content: userMsg }],
            tools: anthropicTools,
            max_tokens: MAX_TOKENS,
            max_tool_loops: MAX_TOOL_LOOPS,
            tool_callback_url: callbackUrl,
            tool_callback_token: callbackToken,
            tool_callback_ctx: {
                foundryId,
                specialistId: SPECIALIST_ID,
                userId: user.id ?? undefined,
            },
        }

        // 30s headroom under Vercel's 22-min hard cap. Vercel side does no
        // CPU/LLM work — passive HTTP read only — but Vercel still SIGKILLs
        // long-held connections. If the Modal call legitimately exceeds the
        // budget, the watchdog flips the row to failed; next autopilot tick
        // retries from a clean state. Future work: webhook-style return so
        // Vercel never holds the connection open at all.
        const MODAL_TIMEOUT_MS = 22 * 60 * 1000 - 30_000

        let modalResp: Response
        try {
            modalResp = await fetch(modalUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Auth-Token": modalAuth,
                },
                body: JSON.stringify(modalPayload),
                signal: AbortSignal.timeout(MODAL_TIMEOUT_MS),
            })
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            await failPipelineRun(runId, "MODAL_FETCH_FAILED", `Modal call failed: ${msg.slice(0, 400)}`)
            return { ok: false, runId, error: `Modal call failed: ${msg.slice(0, 200)}`, errorCode: "MODAL_FETCH_FAILED" }
        }

        if (!modalResp.ok) {
            const detail = await modalResp.text().catch(() => "")
            await failPipelineRun(runId, "MODAL_HTTP_ERROR", `Modal HTTP ${modalResp.status}: ${detail.slice(0, 400)}`)
            return { ok: false, runId, error: `Modal returned HTTP ${modalResp.status}`, errorCode: "MODAL_HTTP_ERROR" }
        }

        const modalJson = (await modalResp.json()) as {
            ok: boolean
            error?: string
            errorCode?: string
            final_text?: string
            calculations?: ReviewCalculation[]
            tool_loop_count?: number
            elapsed_ms?: number
        }

        if (!modalJson.ok) {
            await failPipelineRun(
                runId,
                modalJson.errorCode ?? "MODAL_RUNTIME_ERROR",
                modalJson.error ?? "Modal run returned ok=false",
            )
            return {
                ok: false,
                runId,
                error: modalJson.error ?? "Modal run failed",
                errorCode: modalJson.errorCode ?? "MODAL_RUNTIME_ERROR",
            }
        }

        const finalText = modalJson.final_text ?? ""
        const calculations = Array.isArray(modalJson.calculations) ? modalJson.calculations : []

        // Step 7 — parse markdown
        const review = parseReviewFromMarkdown(
            finalText,
            SPECIALIST_ID,
            specialist.name,
            calculations,
            Date.now() - startedAt,
        )

        // Step 8 — persist via direct admin client (bypasses the broken RPC,
        // see legacy file's GOTCHA on upsert_cad_lab_review)
        const saveOk = await saveFangReviewDirect(projectId, moduleId, foundryId, review)
        if (!saveOk) {
            await failPipelineRun(runId, "SAVE_FAILED", "Fang produced a review but it could not be persisted")
            // Council fix — item 1 (6/6, 2026-04-29): write tombstone on save failure
            // so the feasibility gate surfaces this as explicitly skipped.
            const { saveFangReviewSkippedTombstone } = await import(
                "@/actions/specialists/run-fang-review"
            )
            await saveFangReviewSkippedTombstone(
                projectId,
                moduleId,
                foundryId,
                "review was produced but could not be persisted — check Postgres logs",
            ).catch(() => undefined)
            return { ok: false, runId, error: "Fang's review couldn't be saved — try again in a moment.", errorCode: "SAVE_FAILED" }
        }

        const persisted = await loadFangReviewForModule(projectId, moduleId, foundryId)
        if (!persisted) {
            await failPipelineRun(runId, "SAVE_FAILED", "Fang review merged but read-back returned nothing")
            // Council fix — item 1 (6/6, 2026-04-29): write tombstone on read-back failure.
            const { saveFangReviewSkippedTombstone } = await import(
                "@/actions/specialists/run-fang-review"
            )
            await saveFangReviewSkippedTombstone(
                projectId,
                moduleId,
                foundryId,
                "review was produced and saved but could not be read back — check Postgres logs",
            ).catch(() => undefined)
            return { ok: false, runId, error: "Fang's review couldn't be saved — try again in a moment.", errorCode: "SAVE_FAILED" }
        }

        // Step 9 — cascade
        const cascade = await applyFangRecommendationsToModule(
            projectId,
            moduleId,
            foundryId,
            user.id,
            review,
        )
        let cascadeApplied = 0
        let cascadePending = 0
        if (cascade.ok) {
            cascadeApplied = cascade.appliedCount
            cascadePending = cascade.pendingCount
        } else {
            console.warn("[run-fang-review-via-modal] cascade failed (non-fatal):", cascade.error)
        }

        // Step 10 — Block G #11b canonical_specs patches
        let patchesEmitted = 0
        let patchesApplied = 0
        try {
            const { deriveFangPatches } = await import("@/lib/cad-lab/fang-patch-generator")
            const targetForPatches = modules.find((m) => m.id === moduleId)
            if (targetForPatches) {
                const patches = deriveFangPatches({
                    review,
                    module: {
                        id: targetForPatches.id,
                        keyParts: Array.isArray(targetForPatches.keyParts)
                            ? (targetForPatches.keyParts as string[])
                            : [],
                        budgetMassKg:
                            typeof (targetForPatches as { budgetMassKg?: number }).budgetMassKg === "number"
                                ? (targetForPatches as { budgetMassKg?: number }).budgetMassKg
                                : null,
                        estimatedMassKg:
                            typeof (targetForPatches as { estimatedMassKg?: number }).estimatedMassKg === "number"
                                ? (targetForPatches as { estimatedMassKg?: number }).estimatedMassKg
                                : null,
                        bomPartNumbers: bomPartNumbersForModule,
                    },
                })
                patchesEmitted = patches.length
                if (patches.length > 0) {
                    const { applyDesignPatches } = await import("@/lib/cad-lab/apply-design-patches")
                    const result = await applyDesignPatches(admin, {
                        projectId,
                        patches,
                        iteration: 0,
                    })
                    if (result.ok) {
                        patchesApplied = result.applied
                        console.info(
                            `[run-fang-review-via-modal] L16-G patch wiring: project=${projectId} module=${moduleId} emitted=${patchesEmitted} applied=${patchesApplied} rejected=${result.rejected} halt=${result.halt.reason}`,
                        )
                    } else {
                        console.warn(
                            `[run-fang-review-via-modal] L16-G patch apply failed (non-fatal): project=${projectId} module=${moduleId} error=${result.error}`,
                        )
                    }
                }
            }
        } catch (patchErr) {
            console.warn(
                "[run-fang-review-via-modal] L16-G patch wiring threw (non-fatal):",
                patchErr instanceof Error ? patchErr.message : patchErr,
            )
        }

        await completePipelineRun(runId, {
            output_ref: {
                table: "cad_lab_projects",
                column: "reviews",
                moduleId,
                verdict: review.verdict,
                issueCount: review.issues.length,
                reviewTimeMs: review.reviewTimeMs,
                cascadeApplied,
                cascadePending,
                patchesEmitted,
                patchesApplied,
                viaModal: true,
                modalElapsedMs: modalJson.elapsed_ms ?? null,
                modalToolLoops: modalJson.tool_loop_count ?? null,
            },
        })

        return {
            ok: true,
            runId,
            moduleId,
            verdict: review.verdict,
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown review error"
        console.error("[run-fang-review-via-modal] unexpected throw:", message)
        try {
            await failPipelineRun(runId, "INTERNAL", message)
        } catch (failErr) {
            console.error(
                "[run-fang-review-via-modal] failPipelineRun also threw:",
                failErr instanceof Error ? failErr.message : failErr,
            )
        }
        // Write a REVIEW_SKIPPED tombstone so the feasibility gate surfaces
        // this module as explicitly skipped rather than silently absent.
        // Council fix — item 1 (6/6, 2026-04-29).
        const { saveFangReviewSkippedTombstone } = await import(
            "@/actions/specialists/run-fang-review"
        )
        await saveFangReviewSkippedTombstone(
            projectId,
            moduleId,
            foundryId,
            `unexpected error during review via Modal: ${message}`,
        ).catch(() => undefined)
        return {
            ok: false,
            runId,
            error: message,
            errorCode: "INTERNAL",
        }
    }
}

// ─── Helpers (parity with run-fang-review.ts) ─────────────────────────

function toReviewModuleInput(m: CadLabModule): ReviewModuleInput {
    const leanResult = m.result
        ? {
              bbox: m.result.bbox,
              massGrams: m.result.massGrams,
              volumeMm3: m.result.volumeMm3,
              fillRatio: m.result.fillRatio,
              massProperties: m.result.massProperties,
              dfm: m.result.dfm,
              validationWarnings: m.result.validationWarnings,
              assumptions: m.result.assumptions,
          }
        : undefined
    return {
        id: m.id,
        name: m.name,
        purpose: m.purpose,
        status: m.status,
        leadWeeks: m.leadWeeks,
        keyParts: m.keyParts,
        inputs: m.inputs,
        outputs: m.outputs,
        description: m.description,
        whyItMatters: m.whyItMatters,
        failureModes: m.failureModes,
        unknowns: m.unknowns,
        ...(m.interfaceDefinition ? { interfaceDefinition: m.interfaceDefinition } : {}),
        ...(leanResult ? { result: leanResult } : {}),
    }
}

function extractDesignBrief(
    research: { designBrief?: unknown } | null,
): CadLabDesignBrief | null {
    if (!research || typeof research !== "object") return null
    const db = (research as { designBrief?: unknown }).designBrief
    if (!db || typeof db !== "object") return null
    return db as CadLabDesignBrief
}

function extractDiagnosticAnswers(raw: unknown): DiagnosticAnswers | null {
    if (!raw || typeof raw !== "object") return null
    return raw as DiagnosticAnswers
}

async function loadBomPartNumbersForModule(
    admin: ReturnType<typeof createAdminClient>,
    projectId: string,
    moduleId: string,
): Promise<string[]> {
    try {
        const { data: srcScoped } = await admin
            .from("parts")
            .select("part_number")
            .eq("cad_lab_project_id", projectId)
            .eq("source_module_id", moduleId)
            .order("part_number", { ascending: true })
            .limit(50)
        const srcPartNumbers = (srcScoped ?? [])
            .map((r) => (typeof r.part_number === "string" ? r.part_number : ""))
            .filter((p) => p.length > 0)
        if (srcPartNumbers.length > 0) return srcPartNumbers

        const { data: projectScoped } = await admin
            .from("parts")
            .select("part_number")
            .eq("cad_lab_project_id", projectId)
            .order("part_number", { ascending: true })
            .limit(50)
        return (projectScoped ?? [])
            .map((r) => (typeof r.part_number === "string" ? r.part_number : ""))
            .filter((p) => p.length > 0)
    } catch (err) {
        console.warn(
            "[run-fang-review-via-modal] loadBomPartNumbersForModule threw (non-fatal):",
            err instanceof Error ? err.message : err,
        )
        return []
    }
}

function parseReviewFromMarkdown(
    markdown: string,
    specialistId: string,
    specialistName: string,
    calculations: ReviewCalculation[],
    reviewTimeMs: number,
): SpecialistReview {
    const verdictPatterns = [
        /#{1,3}\s*VERDICT:\s*(PASS|WARN|FAIL)/i,
        /\*{1,2}VERDICT:?\*{1,2}\s*(PASS|WARN|FAIL)/i,
        /\bverdict:\s*(PASS|WARN|FAIL)\b/i,
    ]
    let verdict: ReviewVerdict = "warn"
    for (const pattern of verdictPatterns) {
        const match = markdown.match(pattern)
        if (match) {
            verdict = match[1].toLowerCase() as ReviewVerdict
            break
        }
    }

    const summaryPatterns = [
        /#{1,3}\s*VERDICT:.*\n+(.+)/i,
        /\*{1,2}VERDICT:?\*{1,2}.*\n+(.+)/i,
    ]
    let summary = `Review completed by ${specialistName}`
    for (const pattern of summaryPatterns) {
        const match = markdown.match(pattern)
        if (match && match[1].trim().length > 10) {
            summary = match[1].trim()
            break
        }
    }

    const issues: ReviewIssue[] = []
    const issuePatterns = [
        /\*\*\[(CRITICAL|WARNING|INFO)\]\s*([^:*]+):\*\*\s*(.+)/gi,
        /\[(CRITICAL|WARNING|INFO)\]\s*\*\*([^:*]+):\*\*\s*(.+)/gi,
        /-\s*\*\*(CRITICAL|WARNING|INFO)\*\*:?\s*([^:]+):\s*(.+)/gi,
    ]
    for (const issuePattern of issuePatterns) {
        let issueMatch
        while ((issueMatch = issuePattern.exec(markdown)) !== null) {
            const message = issueMatch[3].trim()
            if (issues.some((i) => i.message === message)) continue

            const issue: ReviewIssue = {
                severity: issueMatch[1].toLowerCase() as ReviewIssue["severity"],
                category: issueMatch[2].trim(),
                message,
            }
            const afterIssue = markdown.slice(
                issueMatch.index + issueMatch[0].length,
                issueMatch.index + issueMatch[0].length + 500,
            )
            const sugMatch = afterIssue.match(/\*Suggestion:\*\s*(.+)/i)
            if (sugMatch) {
                issue.suggestion = sugMatch[1].trim()
            }
            issues.push(issue)
        }
    }

    const recommendations: string[] = []
    const recsSection = markdown.match(/#{1,3}\s*Recommendations?\s*\n([\s\S]*?)(?=#{1,3}|$)/i)
    if (recsSection) {
        const recPattern = /^\s*[-\d.]+[.)]\s*(.+)/gm
        let recMatch
        while ((recMatch = recPattern.exec(recsSection[1])) !== null) {
            recommendations.push(recMatch[1].trim())
        }
    }

    return {
        specialistId,
        specialistName,
        verdict,
        summary,
        issues,
        recommendations,
        calculations,
        reviewMarkdown: markdown,
        reviewedAt: new Date().toISOString(),
        reviewTimeMs,
    }
}

async function saveFangReviewDirect(
    projectId: string,
    moduleId: string,
    foundryId: string,
    review: SpecialistReview,
): Promise<boolean> {
    const admin = createAdminClient()
    const { data: row, error: readErr } = await admin
        .from("cad_lab_projects")
        .select("reviews")
        .eq("id", projectId)
        .eq("foundry_id", foundryId)
        .maybeSingle()

    if (readErr || !row) {
        console.error(
            "[run-fang-review-via-modal] saveFangReviewDirect: pre-read failed:",
            readErr?.message ?? "no row",
        )
        return false
    }

    const existingReviews = (row.reviews as Record<string, SpecialistReview[]> | null) ?? {}
    const forModule = existingReviews[moduleId] ?? []
    const withoutOldFang = forModule.filter((r) => r.specialistId !== SPECIALIST_ID)
    const mergedForModule = [...withoutOldFang, review]
    const nextReviews = { ...existingReviews, [moduleId]: mergedForModule }

    const { error: writeErr } = await admin
        .from("cad_lab_projects")
        .update({
            reviews: nextReviews as unknown as Database["public"]["Tables"]["cad_lab_projects"]["Row"]["reviews"],
        })
        .eq("id", projectId)
        .eq("foundry_id", foundryId)

    if (writeErr) {
        console.error(
            "[run-fang-review-via-modal] saveFangReviewDirect: update failed:",
            writeErr.message,
        )
        return false
    }
    return true
}

async function loadFangReviewForModule(
    projectId: string,
    moduleId: string,
    foundryId: string,
): Promise<SpecialistReview | null> {
    const admin = createAdminClient()
    const { data, error } = await admin
        .from("cad_lab_projects")
        .select("reviews")
        .eq("id", projectId)
        .eq("foundry_id", foundryId)
        .maybeSingle()
    if (error || !data) return null
    const reviews = data.reviews as Record<string, SpecialistReview[]> | null
    if (!reviews) return null
    const forModule = reviews[moduleId] ?? []
    return forModule.find((r) => r.specialistId === SPECIALIST_ID) ?? null
}

// ─── Cascade ──────────────────────────────────────────────────────────

interface DesignChangeLogEntry {
    at: string
    moduleId: string
    specialistId: string
    specialistName: string
    source: "review:fang"
    kind: "applied" | "pending"
    field: "budgetMassKg" | null
    oldValue: unknown
    newValue: unknown
    reason: string
    severity: "critical" | "warning" | "info"
    category: string
    suggestion: string | null
}

type CascadeResult =
    | { ok: true; appliedCount: number; pendingCount: number }
    | { ok: false; error: string }

function extractMassKg(...sources: Array<string | undefined>): number | null {
    for (const src of sources) {
        if (!src) continue
        const kgMatch = src.match(/(\d+(?:\.\d+)?)\s*kg\b/i)
        if (kgMatch) {
            const v = Number.parseFloat(kgMatch[1])
            if (Number.isFinite(v) && v > 0 && v < 10000) return v
        }
        const gMatch = src.match(/(\d+(?:\.\d+)?)\s*g(?:rams?)?\b/i)
        if (gMatch) {
            const v = Number.parseFloat(gMatch[1])
            if (Number.isFinite(v) && v > 0 && v < 10_000_000) return v / 1000
        }
    }
    return null
}

function isMassCategory(category: string): boolean {
    return /mass|weight/i.test(category)
}

async function applyFangRecommendationsToModule(
    projectId: string,
    moduleId: string,
    foundryId: string,
    userId: string | null,
    review: SpecialistReview,
): Promise<CascadeResult> {
    if (review.verdict !== "warn" && review.verdict !== "fail") {
        return { ok: true, appliedCount: 0, pendingCount: 0 }
    }
    const criticalIssues = review.issues.filter((i) => i.severity === "critical")
    if (criticalIssues.length === 0) {
        return { ok: true, appliedCount: 0, pendingCount: 0 }
    }

    const admin = createAdminClient()
    const { data: row, error: readErr } = await admin
        .from("cad_lab_projects")
        .select("modules, design_change_log")
        .eq("id", projectId)
        .eq("foundry_id", foundryId)
        .maybeSingle()
    if (readErr || !row) {
        return { ok: false, error: readErr?.message ?? "project read failed" }
    }

    const modules = (row.modules as CadLabModule[] | null) ?? []
    const targetIdx = modules.findIndex((m) => m.id === moduleId)
    if (targetIdx === -1) {
        return { ok: false, error: "module not found during cascade" }
    }
    const existingModule = modules[targetIdx]
    const log = Array.isArray(row.design_change_log)
        ? (row.design_change_log as unknown[] as DesignChangeLogEntry[])
        : []

    const now = new Date().toISOString()
    const newEntries: DesignChangeLogEntry[] = []
    const auditWrites: Array<{
        field: "budgetMassKg"
        oldValue: unknown
        newValue: unknown
        reason: string
    }> = []

    let mutatedModule = existingModule
    let appliedCount = 0
    let pendingCount = 0

    for (const issue of criticalIssues) {
        const baseEntry = {
            at: now,
            moduleId,
            specialistId: review.specialistId,
            specialistName: review.specialistName,
            source: "review:fang" as const,
            reason: issue.message,
            severity: issue.severity,
            category: issue.category,
            suggestion: issue.suggestion ?? null,
        }

        if (isMassCategory(issue.category)) {
            const extracted = extractMassKg(issue.suggestion, issue.message)
            if (extracted !== null && extracted !== mutatedModule.budgetMassKg) {
                const oldValue = mutatedModule.budgetMassKg ?? null
                mutatedModule = { ...mutatedModule, budgetMassKg: extracted }
                newEntries.push({
                    ...baseEntry,
                    kind: "applied",
                    field: "budgetMassKg",
                    oldValue,
                    newValue: extracted,
                })
                auditWrites.push({
                    field: "budgetMassKg",
                    oldValue,
                    newValue: extracted,
                    reason: issue.message,
                })
                appliedCount += 1
                continue
            }
        }

        newEntries.push({
            ...baseEntry,
            kind: "pending",
            field: null,
            oldValue: null,
            newValue: null,
        })
        pendingCount += 1
    }

    if (newEntries.length === 0) {
        return { ok: true, appliedCount: 0, pendingCount: 0 }
    }

    const nextModules =
        appliedCount > 0
            ? modules.map((m, i) => (i === targetIdx ? mutatedModule : m))
            : modules
    const nextLog = [...log, ...newEntries]

    type CadLabProjectsRow = Database["public"]["Tables"]["cad_lab_projects"]["Row"]
    const updatePayload: Partial<CadLabProjectsRow> = {
        design_change_log: nextLog as unknown as CadLabProjectsRow["design_change_log"],
    }
    if (appliedCount > 0) {
        updatePayload.modules = nextModules as unknown as CadLabProjectsRow["modules"]
    }

    const { error: writeErr } = await admin
        .from("cad_lab_projects")
        .update(updatePayload)
        .eq("id", projectId)
        .eq("foundry_id", foundryId)

    if (writeErr) {
        return { ok: false, error: writeErr.message }
    }

    for (const w of auditWrites) {
        if (!userId) break
        await admin
            .from("audit_log")
            .insert({
                foundry_id: foundryId,
                user_id: userId,
                actor_specialist: SPECIALIST_ID,
                actor_user_id: userId,
                section: "module:cascade",
                action: "fang-applied",
                event: "module field updated by Fang review cascade (via Modal)",
                entity_type: "cad_lab_module",
                entity_id: `${projectId}:${moduleId}`,
                metadata: {
                    field: w.field,
                    oldValue: w.oldValue,
                    newValue: w.newValue,
                    reason: w.reason,
                    projectId,
                    moduleId,
                    specialistId: SPECIALIST_ID,
                    viaModal: true,
                } as Json,
            })
            .then(({ error }) => {
                if (error) {
                    console.warn(
                        "[run-fang-review-via-modal] audit_log insert failed (non-fatal):",
                        error.message,
                    )
                }
            })
    }

    return { ok: true, appliedCount, pendingCount }
}
