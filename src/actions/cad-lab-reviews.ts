"use server"

/**
 * @file cad-lab-reviews.ts — Server actions for specialist design reviews.
 *
 * @description Allows specialists to review individual CAD Lab modules for
 * manufacturability, engineering soundness, system integration, and supply
 * chain viability. Reviews use the specialist's personality, tools, and
 * domain knowledge to produce structured verdicts.
 *
 * @security All actions require authentication and foundry membership.
 * Reviews are stored on the project's `reviews` JSONB column.
 *
 * @related
 * - Context builder: src/lib/ai-context/cad-lab-context.ts
 * - Types: src/lib/cad-lab-types.ts (SpecialistReview)
 * - Registry: src/lib/agents/tools/registry.ts
 * - Personality: src/lib/agents/personality.ts
 */

import { withAIGate } from '@/lib/ai/with-ai-gate'
import type { TrustedContext } from '@/lib/server-action-utils'
import type { Json } from "@/types/database.types"
import type {
    CadLabModule,
    CadLabDesignBrief,
    SpecialistReview,
    ReviewVerdict,
    ReviewIssue,
    ReviewCalculation,
    DecompositionCheckpoint,
    CheckpointSentiment,
} from "@/lib/cad-lab-types"
import { buildCadLabReviewContext } from "@/lib/ai-context/cad-lab-context"
import { getSpecialistById } from "@/lib/agents/specialists-config"
import { compilePersonalityPrompt } from "@/lib/agents/personality"
import { getToolsForSpecialist, executeToolCall } from "@/lib/agents/tools/registry"
import { loadDomainKnowledge } from "@/lib/agents/domain-knowledge"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import { getOrCreateSpecialistThread, getRecentSpecialistOutputs } from "@/actions/agent-memory"
import {
    getMemoryContext,
    formatObservationsForPrompt,
    getConversationHistory,
    addMemoryMessage,
    processMemory,
} from "@/lib/agent-memory"
import type { ConversationMessage } from "@/lib/agent-memory"
import { withLlmPermit } from "@/lib/ai/llm-permit"
import { retrieveEngineeringDataForPrompt } from "@/lib/cad-lab/engineering-data-retriever"

// ─── Constants ──────────────────────────────────────────────────────

// Loop 8 cost cut (2026-04-26 — Tristan flagged "very, very, very expensive"):
// Drop fang.review from claude-opus-4-7 → claude-sonnet-4-6.
//
// Why this is safe: Sonnet 4.6 is already used for QUICK_VERDICT (line ~417)
// and for Chase + Max in the autopilot pipeline at this quality bar. Every
// council benchmark sweep this month (forgeos_specialist_model_swap_findings_20260425
// memory) cleared Sonnet for fang-class structured DFM review. The agents
// surface even moved past Sonnet to Qwen 3 235B for vp-engineering, but
// the Qwen swap inside this file would need an Anthropic-SDK → OpenRouter
// refactor (tool-use streaming has different API surfaces) so we ship the
// 5× cost cut today and leave the 25× cut for a follow-up.
//
// Per-regen impact: 6 projects × 7-9 modules × per-call cost.
// Opus 4.7 ≈ £0.50/call → ~£25-30/regen on fang alone.
// Sonnet 4.6 ≈ £0.10/call → ~£5-6/regen on fang alone.
const REVIEW_MODEL = "claude-sonnet-4-6"
const MAX_TOOL_LOOPS = 5
// Loop 7 critique fix A7 (LOOP-7-CRITIQUE.md): reviews were truncating
// mid-sentence at the 8192 ceiling on every demo. Sample evidence: BESS
// p.12 mid-Failure Mode bullet, Hedgerow p.13 mid-parenthesis, VertFarm
// p.14 "...slot profile (alrea", p.15 '...the "cha'. Sonnet 4.6 supports
// up to 64K output tokens — bump to 16384 for headroom while staying
// inside the per-call budget envelope.
const MAX_TOKENS = 16384

/** Valid moduleId pattern — alphanumeric, hyphens, underscores */
const MODULE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/

/** Specialists allowed to review CAD Lab modules */
const REVIEW_SPECIALISTS = new Set([
    "vp-manufacturing",
    "vp-engineering",
    "cto",
    "vp-supply-chain",
])

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Lean shape of CadLabModule for review payloads — keeps only the fields
 * buildCadLabReviewContext actually reads. Drops imageUrl, imageBase64,
 * svgUrls, templateMatchResult, moduleImagePrompt, conceptSnapshot,
 * costOverrides and the heavy result.svg* / result.code fields.
 *
 * Per forgeos-rules.md R3 (React Flight 4MB limit). On a 10+ module project
 * post-image-gen the full CadLabModule shape can serialize to 5-10 MB.
 *
 * Uses `Pick` on the full CadLabModule["result"] so the lean `result`
 * subset tracks upstream additions to the text/numeric properties without
 * accidentally reintroducing the binary SVG / code fields.
 */
type LeanResultFields = "bbox" | "massGrams" | "volumeMm3" | "fillRatio" | "massProperties" | "dfm" | "validationWarnings" | "assumptions"
type LeanCadLabResult = Pick<NonNullable<CadLabModule["result"]>, LeanResultFields>

export interface ReviewModuleInput {
    id: string
    name: string
    purpose: string
    status: CadLabModule["status"]
    leadWeeks: number
    keyParts: string[]
    inputs: string[]
    outputs: string[]
    description: string
    whyItMatters: string
    failureModes: string[]
    unknowns: string[]
    interfaceDefinition?: string
    /** Lean subset of result — bbox + mass properties + DFM summary only. */
    result?: LeanCadLabResult
}

export interface ReviewRequest {
    projectId: string
    moduleId: string
    specialistId: string
    /** All modules in the project (for system-level context) */
    allModules: ReviewModuleInput[]
    /** Design brief from diagnostics */
    designBrief?: CadLabDesignBrief
    /** Diagnostic answers keyed by module ID */
    diagnosticAnswers?: DiagnosticAnswers
    /** Project subject line */
    projectSubject: string
    /**
     * BOM part numbers for the module being reviewed (Fang only). Pre-loaded
     * by run-fang-review so this action stays free of `parts` table queries.
     * When supplied, surfaces in the review prompt and Fang is asked to
     * reference them verbatim in suggestions + REPLACE_PART tags.
     *
     * L16-G #11c (2026-04-27): closes the keyParts-vs-parts shape mismatch
     * (BLOCK-G-WIRING-HANDOVER.md observation 3).
     */
    bomPartNumbersForModule?: string[]
}

export type ReviewResult =
    | { review: SpecialistReview }
    | { error: string }

/**
 * Requests a specialist review of a specific CAD Lab module.
 *
 * @description Loads the module from the project, builds specialist-specific
 * context, calls the Anthropic API with tools enabled (so the specialist can
 * run engineering calculations), parses the structured review, and saves it
 * back to the project.
 */
export async function requestSpecialistReview(
    req: ReviewRequest,
    trusted?: TrustedContext,
): Promise<ReviewResult> {
    return withAIGate('cad_lab_review', async ({ supabase, foundryId, user }) => {
        const userId = user.id
        const startTime = Date.now()

        // ── Validate inputs ──
        if (!req.projectId || !/^[0-9a-f-]{36}$/.test(req.projectId)) {
            return { error: "Invalid project ID" }
        }
        if (!REVIEW_SPECIALISTS.has(req.specialistId)) {
            return { error: `Specialist "${req.specialistId}" cannot review CAD modules` }
        }

        const specialist = getSpecialistById(req.specialistId)
        if (!specialist) {
            return { error: `Unknown specialist: ${req.specialistId}` }
        }

        // ── Find the module ──
        const targetModule = req.allModules.find(m => m.id === req.moduleId)
        if (!targetModule) {
            return { error: `Module "${req.moduleId}" not found` }
        }
        // ── Build context ──
        const reviewContext = buildCadLabReviewContext(
            {
                module: targetModule,
                allModules: req.allModules,
                designBrief: req.designBrief,
                diagnosticAnswers: req.diagnosticAnswers?.[req.moduleId],
                projectSubject: req.projectSubject,
                bomPartNumbersForModule: req.bomPartNumbersForModule,
            },
            req.specialistId,
        )

        // ── Build specialist system prompt ──
        const domainContext = loadDomainKnowledge(req.specialistId, specialist.description)
        const personalityPrompt = compilePersonalityPrompt(
            `${specialist.name}, the ${specialist.title} specialist`,
            specialist.personality,
            domainContext,
            req.specialistId,
        )

        // Fix 5 (audit Fix 5, 2026-04-27): inject material_properties + process_capabilities
        // into Fang's (vp-manufacturing) review context so it can make database-grounded
        // assertions about tolerances, material properties, and process constraints.
        //
        // Prior behaviour: Fang had zero access to material_properties (47 rows) or
        // process_capabilities (20 rows). All DFM judgments ("FDM cannot achieve ±0.05mm")
        // came from model training priors — factually right, but unverifiable and
        // unattributable to a source. The loop critiques flagged this as "generic risk flags
        // not grounded in real engineering data."
        //
        // New behaviour: detect materials and processes from the module being reviewed,
        // fetch verified engineering data, and prepend it to the system prompt. Fang can
        // now cite specific values ("per our process_capabilities DB, FDM tolerance is
        // typically ±0.3mm, best achievable ±0.1mm") rather than guessing.
        //
        // Only fires for vp-manufacturing (Fang). Other review specialists (vp-engineering,
        // cto, vp-supply-chain) already use different context-building paths.
        let materialPropertiesBlock = ""
        if (req.specialistId === "vp-manufacturing") {
            try {
                const moduleDescription = [
                    targetModule.description ?? "",
                    targetModule.purpose ?? "",
                    (targetModule.keyParts ?? []).join(" "),
                ].join(" ")
                // Extract materials and processes from the brief when available
                const briefMaterials: string[] = []
                const briefProcesses: string[] = []
                if (req.designBrief?.targetMaterial) briefMaterials.push(req.designBrief.targetMaterial)
                if (req.designBrief?.targetProcess) briefProcesses.push(req.designBrief.targetProcess)

                const engData = await retrieveEngineeringDataForPrompt(
                    moduleDescription,
                    briefMaterials,
                    briefProcesses,
                )
                if (engData.content) {
                    materialPropertiesBlock = `\n\n## Engineering Reference Data (from database — cite these values in your review)\n${engData.content}`
                    console.info(
                        `[cad-reviews:fix5] engineering data injected: materials=${engData.materialsCount} processes=${engData.processesCount} hardware=${engData.hardwareCount}`,
                    )
                }
            } catch (engErr) {
                // Non-fatal — Fang review still runs without database grounding
                console.warn(
                    "[cad-reviews:fix5] retrieveEngineeringDataForPrompt failed (non-fatal):",
                    engErr instanceof Error ? engErr.message : engErr,
                )
            }
        }

        // DECISION: Fang (VP Manufacturing) owns the Specify stage. Her reviews
        // include Assembly Notes that carry forward to the Assemble stage as
        // constraints for Chase (VP Supply Chain).
        const assemblyNotesInstructions = req.specialistId === "vp-manufacturing"
            ? `

## Assembly Notes (REQUIRED for manufacturing specialist)
In addition to your DFM review, provide Assembly Notes for this module:
- **Assembly sequence**: Should this module be assembled early, middle, or late in the build?
- **Fixtures & alignment**: What jigs, fixtures, or alignment tools are needed?
- **Critical assembly tolerances**: Which dimensions must be held during assembly (not just manufacturing)?
- **Test points**: What should be verified immediately after this module is assembled?
- **Dependencies**: Which other modules must be assembled before this one?

Include these in your recommendations section with the prefix "ASSEMBLY:" so they can be extracted.`
            : ""

        let systemPrompt = `${personalityPrompt}

## Current Task: Design Review
You are performing a structured design review of a CAD Lab module. Use your tools to verify claims with real data — never guess material properties or process constraints.
${materialPropertiesBlock}

${reviewContext}${assemblyNotesInstructions}`

        // ── Bridge specialist memory (Tier 1) ──
        // Memory is additive — if it fails, reviews still work as before.
        let memoryThreadId: string | null = null
        let memoryHistory: ConversationMessage[] = []
        try {
            const threadRes = await getOrCreateSpecialistThread(req.specialistId)
            memoryThreadId = threadRes.threadId

            if (memoryThreadId) {
                const memoryContext = await getMemoryContext(memoryThreadId, foundryId)
                const observationsBlock = formatObservationsForPrompt(memoryContext)
                memoryHistory = getConversationHistory(memoryContext, 10)

                // Cross-specialist awareness: what other specialists have recently said
                const crossRes = await getRecentSpecialistOutputs(req.specialistId, 3)
                let crossSpecialistBlock = ""
                if (crossRes.data && crossRes.data.length > 0) {
                    crossSpecialistBlock = "\n## Recent Work by Other Specialists\n" +
                        crossRes.data.map(o => `- **${o.specialistId}**: ${o.summary}`).join("\n") +
                        "\n"
                }

                // Inject into system prompt
                if (observationsBlock || crossSpecialistBlock) {
                    systemPrompt += "\n" + observationsBlock + crossSpecialistBlock
                }
            }
        } catch (err) {
            // INTENT: Memory is enhancement, not requirement. If it fails, proceed without it.
            console.warn("[CAD-REVIEWS] Memory bridge failed (non-fatal):", err instanceof Error ? err.message : "Unknown")
        }

        // ── Get tools for this specialist ──
        const tools = getToolsForSpecialist(req.specialistId)
        const anthropicTools = tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters,
        }))

        // Loop 8 cost cut (2026-04-26 — Tristan flagged "very, very, very
        // expensive"): when FANG_REVIEW_VIA=openrouter, bypass the
        // Anthropic SDK + tool-use loop entirely and call OpenRouter once
        // with qwen/qwen3-235b-a22b. The agents-surface vp-engineering
        // already routes here per benchmark
        // (forgeos_specialist_model_swap_findings_20260425 memory:
        // "Qwen 3 235B = best Fang ever measured"). Tools are dropped on
        // this path — Qwen produces the structured review text directly
        // and the downstream parseReviewFromMarkdown extracts what we
        // need. Per-call cost ≈ £0.04 vs ≈ £0.10 on Sonnet vs ≈ £0.50 on
        // the original Opus. Default route stays "anthropic" until this
        // is verified end-to-end on a single project.
        const reviewRoute = process.env.FANG_REVIEW_VIA ?? "anthropic"
        const calculationsPerformedOR: ReviewCalculation[] = []
        if (reviewRoute === "openrouter") {
            const { callOpenRouter } = await import("@/lib/ai/openrouter")
            const userMsg = `Review the module "${targetModule.name}" and provide your structured assessment in the markdown format described above. Engineering claims should be grounded in your domain expertise — show your work in calculations sections.`
            const or = await callOpenRouter({
                model: process.env.FANG_REVIEW_MODEL ?? "qwen/qwen3-235b-a22b",
                system: systemPrompt,
                prompt: userMsg,
                maxTokens: MAX_TOKENS,
                temperature: 0.2,
                timeoutMs: 240_000,
            })
            if (!or.ok) {
                return {
                    error: `OpenRouter Fang review failed: ${or.error}`,
                }
            }
            const reviewOR = parseReviewFromMarkdown(
                or.text,
                req.specialistId,
                specialist.name,
                calculationsPerformedOR,
                Date.now() - startTime,
            )
            try {
                const { error: rpcError } = await supabase.rpc("upsert_cad_lab_review", {
                    p_project_id: req.projectId,
                    p_foundry_id: foundryId,
                    p_module_id: req.moduleId,
                    p_specialist_id: req.specialistId,
                    p_review: reviewOR as unknown as Json,
                })
                if (rpcError) {
                    console.error("[CAD-REVIEWS] Failed to save OR review:", rpcError)
                }
            } catch (err) {
                console.error("[CAD-REVIEWS] Failed to save OR review:", err)
            }
            return { review: reviewOR }
        }

        // ── Call Anthropic with tool loop ──
        const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
        if (!apiKey) {
            return { error: "Anthropic API key not configured" }
        }

        const Anthropic = (await import("@anthropic-ai/sdk")).default
        // SECURITY/RELIABILITY: Cap SDK time to stay under Vercel's 300s
        // function limit. SDK default is 10min + 2 retries, which in a
        // tool loop can silently blow past the ceiling and return 504 with
        // no actionable error. 240s + no retries lets us fail fast and
        // surface the real cause. See forgeos-rules.md R4/R5.
        // maxRetries: 2 — the Anthropic SDK natively honours Retry-After on 429s
// and uses exponential backoff between attempts. With 4 autopilot chains
// running in parallel and ~9 modules each, the blast hits org-level
// rate limits; without retries the call fails immediately and the review
// is marked REVIEW_FAILED. Two retries (~10s + ~20s SDK backoff) absorb
// transient rate-limit spikes while keeping per-call wall-clock under
// the 240s budget. Confirmed against the 4-project demo run on 2026-04-25
// where every Fang review failed with "Too many requests" before maxRetries
// was raised. Total worst-case retry latency: ~30s, still inside timeout.
const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 2 })

        const toolCtx = { foundryId, specialistId: req.specialistId, userId }
        const calculationsPerformed: ReviewCalculation[] = []

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const messages: Array<{ role: "user" | "assistant"; content: string | any[] }> = [
            // Prepend memory history as multi-turn messages for continuity
            ...memoryHistory.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
            {
                role: "user",
                content: `Review the module "${targetModule.name}" and provide your structured assessment. Use your tools to verify engineering claims with real calculations and data lookups.`,
            },
        ]

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createParams: any = {
            model: REVIEW_MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            messages,
            tools: anthropicTools,
            tool_choice: { type: "auto" as const },
        }

        // DECISION: Only use text from the FINAL API response for the review.
        // Intermediate text (during tool-calling turns) may contain partial
        // thinking that shouldn't be in the structured review output.
        let finalText = ""
        let loopCount = 0

        while (loopCount <= MAX_TOOL_LOOPS) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = await withLlmPermit("anthropic", REVIEW_MODEL, () => client.messages.create(createParams)) as any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const content: any[] = response.content ?? []

            // Collect text from THIS response
            let turnText = ""
            for (const block of content) {
                if (block.type === "text" && block.text) {
                    turnText += block.text
                }
            }

            // Check for tool calls
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const toolUseBlocks = content.filter((b: any) => b.type === "tool_use")
            if (toolUseBlocks.length === 0 || loopCount >= MAX_TOOL_LOOPS) {
                // INTENT: This is the final response — use its text as the review
                finalText = turnText
                break
            }

            // Execute tool calls in parallel
            const toolResults = await Promise.all(
                toolUseBlocks.map(async (toolBlock: { name: string; input?: Record<string, unknown>; id: string }) => {
                    const result = await executeToolCall(
                        toolBlock.name,
                        (toolBlock.input ?? {}) as Record<string, unknown>,
                        toolCtx,
                    )

                    // Track for transparency
                    calculationsPerformed.push({
                        tool: toolBlock.name,
                        description: describeToolCall(toolBlock.name, toolBlock.input),
                        result: result.slice(0, 200),
                    })

                    return {
                        type: "tool_result" as const,
                        tool_use_id: toolBlock.id,
                        content: result,
                    }
                }),
            )

            // Append assistant response + tool results
            messages.push({ role: "assistant", content: response.content })
            loopCount++
            const remaining = MAX_TOOL_LOOPS - loopCount
            messages.push({
                role: "user",
                content: [
                    ...toolResults,
                    { type: "text", text: `[System: ${remaining} tool call${remaining === 1 ? "" : "s"} remaining]` },
                ],
            })
            createParams.messages = messages
        }

        // ── Parse structured review from markdown ──
        const review = parseReviewFromMarkdown(
            finalText,
            req.specialistId,
            specialist.name,
            calculationsPerformed,
            Date.now() - startTime,
        )

        // ── Save review to project (atomic upsert) ──
        // SECURITY: RPC filters by foundry_id to prevent IDOR
        // DECISION: Atomic Postgres merge prevents race condition when
        // two specialists review the same module simultaneously
        try {
            const { error: rpcError } = await supabase.rpc("upsert_cad_lab_review", {
                p_project_id: req.projectId,
                p_foundry_id: foundryId,
                p_module_id: req.moduleId,
                p_specialist_id: req.specialistId,
                p_review: review as unknown as Json,
            })

            if (rpcError) {
                console.error("[CAD-REVIEWS] Failed to save review:", rpcError)
            }
        } catch (err) {
            console.error("[CAD-REVIEWS] Failed to save review:", err)
            // Non-fatal — still return the review
        }

        // ── Write review to specialist memory thread ──
        if (memoryThreadId) {
            try {
                // Record the request as a user message
                await addMemoryMessage(
                    memoryThreadId,
                    foundryId,
                    "user",
                    `[CAD Lab Review] Reviewed module "${targetModule.name}" (${targetModule.purpose}) in project "${req.projectSubject}"`,
                )
                // Record the result as an assistant message (compact summary, not full markdown)
                const issuesSummary = review.issues.length > 0
                    ? review.issues.map(i => `${i.severity}: ${i.category}`).join(", ")
                    : "none"
                await addMemoryMessage(
                    memoryThreadId,
                    foundryId,
                    "assistant",
                    `[CAD Lab Review Result] Verdict: ${review.verdict.toUpperCase()} | Module: ${targetModule.name} | Issues: ${issuesSummary} | Summary: ${review.summary}`,
                )
                // Fire-and-forget observation compression
                processMemory(memoryThreadId, foundryId).catch(() => {})
            } catch {
                // INTENT: Memory write is non-critical — review is already saved
            }
        }

        return { review }
    }, trusted)
}

// ─── Quick Verdict (Phase 1 of two-phase review) ────────────────────

const QUICK_VERDICT_MODEL = "claude-sonnet-4-6"
const QUICK_VERDICT_MAX_TOKENS = 256

export interface QuickVerdictResult {
    verdict: ReviewVerdict
    summary: string
}

/**
 * Fast specialist verdict — returns just PASS/WARN/FAIL + one-sentence summary.
 *
 * @description Phase 1 of the two-phase review flow. Uses Sonnet (fast, no tools)
 * with max_tokens: 256 for a ~3-5s response. The caller shows this immediately
 * while the full requestSpecialistReview() runs in the background.
 */
export async function quickSpecialistVerdict(
    req: ReviewRequest,
): Promise<{ quickVerdict: QuickVerdictResult } | { error: string }> {
    return withAIGate('cad_lab_review', async () => {
        // ── Validate inputs ──
        if (!req.projectId || !/^[0-9a-f-]{36}$/.test(req.projectId)) {
            return { error: "Invalid project ID" }
        }
        if (!REVIEW_SPECIALISTS.has(req.specialistId)) {
            return { error: `Specialist "${req.specialistId}" cannot review CAD modules` }
        }

        const specialist = getSpecialistById(req.specialistId)
        if (!specialist) {
            return { error: `Unknown specialist: ${req.specialistId}` }
        }

        const targetModule = req.allModules.find(m => m.id === req.moduleId)
        if (!targetModule) {
            return { error: `Module "${req.moduleId}" not found` }
        }

        // ── Build context (same as full review but no memory bridge) ──
        const reviewContext = buildCadLabReviewContext(
            {
                module: targetModule,
                allModules: req.allModules,
                designBrief: req.designBrief,
                diagnosticAnswers: req.diagnosticAnswers?.[req.moduleId],
                projectSubject: req.projectSubject,
                bomPartNumbersForModule: req.bomPartNumbersForModule,
            },
            req.specialistId,
        )

        const domainContext = loadDomainKnowledge(req.specialistId, specialist.description)
        const personalityPrompt = compilePersonalityPrompt(
            `${specialist.name}, the ${specialist.title} specialist`,
            specialist.personality,
            domainContext,
            req.specialistId,
        )

        const systemPrompt = `${personalityPrompt}

## Current Task: Quick Design Verdict
Give a fast gut-level assessment of this CAD Lab module. No detailed analysis — just your verdict and one sentence explaining why.

${reviewContext}

## Response Format (STRICT)
VERDICT: PASS | WARN | FAIL
SUMMARY: <one sentence explaining the verdict>`

        const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
        if (!apiKey) {
            return { error: "Anthropic API key not configured" }
        }

        const Anthropic = (await import("@anthropic-ai/sdk")).default
        // SECURITY/RELIABILITY: Cap SDK time to stay under Vercel's 300s
        // function limit. SDK default is 10min + 2 retries, which in a
        // tool loop can silently blow past the ceiling and return 504 with
        // no actionable error. 240s + no retries lets us fail fast and
        // surface the real cause. See forgeos-rules.md R4/R5.
        // maxRetries: 2 — the Anthropic SDK natively honours Retry-After on 429s
// and uses exponential backoff between attempts. With 4 autopilot chains
// running in parallel and ~9 modules each, the blast hits org-level
// rate limits; without retries the call fails immediately and the review
// is marked REVIEW_FAILED. Two retries (~10s + ~20s SDK backoff) absorb
// transient rate-limit spikes while keeping per-call wall-clock under
// the 240s budget. Confirmed against the 4-project demo run on 2026-04-25
// where every Fang review failed with "Too many requests" before maxRetries
// was raised. Total worst-case retry latency: ~30s, still inside timeout.
const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 2 })

        const response = await await withLlmPermit("anthropic", QUICK_VERDICT_MODEL, () => client.messages.create({
            model: QUICK_VERDICT_MODEL,
            max_tokens: QUICK_VERDICT_MAX_TOKENS,
            system: systemPrompt,
            messages: [{
                role: "user",
                content: `Quick verdict on module "${targetModule.name}" — PASS, WARN, or FAIL?`,
            }],
        }))

        const text = response.content
            .filter(b => b.type === "text")
            .map(b => b.type === "text" ? b.text : "")
            .join("")

        // Parse verdict
        const verdictMatch = text.match(/VERDICT:\s*(PASS|WARN|FAIL)/i)
        const verdict: ReviewVerdict = verdictMatch
            ? verdictMatch[1].toLowerCase() as ReviewVerdict
            : "warn"

        // Parse summary
        const summaryMatch = text.match(/SUMMARY:\s*(.+?)(?:\n|$)/i)
        const summary = summaryMatch?.[1]?.trim() || `Quick assessment by ${specialist.name}`

        return {
            quickVerdict: { verdict, summary },
        }
    })
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Parse the specialist's markdown response into a structured SpecialistReview.
 *
 * DECISION: Multiple regex patterns per field for resilience — LLMs vary
 * format between "### VERDICT: PASS" and "**Verdict:** Pass" etc.
 */
function parseReviewFromMarkdown(
    markdown: string,
    specialistId: string,
    specialistName: string,
    calculations: ReviewCalculation[],
    reviewTimeMs: number,
): SpecialistReview {
    // Extract verdict — try multiple common LLM formats
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

    // Extract summary — line after verdict header, or first non-empty line
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

    // Extract issues — try multiple bracket/bold formats
    const issues: ReviewIssue[] = []
    const issuePatterns = [
        /\*\*\[(CRITICAL|WARNING|INFO)\]\s*([^:*]+):\*\*\s*(.+)/gi,
        /\[(CRITICAL|WARNING|INFO)\]\s*\*\*([^:*]+):\*\*\s*(.+)/gi,
        /-\s*\*\*(CRITICAL|WARNING|INFO)\*\*:?\s*([^:]+):\s*(.+)/gi,
    ]
    for (const issuePattern of issuePatterns) {
        let issueMatch
        while ((issueMatch = issuePattern.exec(markdown)) !== null) {
            // Avoid duplicates if multiple patterns match the same issue
            const message = issueMatch[3].trim()
            if (issues.some(i => i.message === message)) continue

            const issue: ReviewIssue = {
                severity: issueMatch[1].toLowerCase() as ReviewIssue["severity"],
                category: issueMatch[2].trim(),
                message,
            }
            // Look for suggestion on next line
            const afterIssue = markdown.slice(issueMatch.index + issueMatch[0].length, issueMatch.index + issueMatch[0].length + 500)
            const sugMatch = afterIssue.match(/\*Suggestion:\*\s*(.+)/i)
            if (sugMatch) {
                issue.suggestion = sugMatch[1].trim()
            }
            issues.push(issue)
        }
    }

    // Extract recommendations
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

/**
 * Create a human-readable description of a tool call.
 */
function describeToolCall(toolName: string, input?: Record<string, unknown>): string {
    switch (toolName) {
        case "calculate_stress":
            return `Stress analysis: ${input?.geometry_type ?? "unknown"} geometry, ${input?.load_N ?? "?"}N load`
        case "calculate_thermal":
            return `Thermal analysis: ${input?.power_w ?? "?"}W, ${input?.material ?? "unknown"} material`
        case "calculate_tolerance_stack":
            return `Tolerance stack-up: ${(input?.dimensions as unknown[])?.length ?? "?"} dimensions`
        case "calculate_fastener":
            return `Fastener analysis: ${input?.bolt_size ?? "?"} ${input?.grade ?? ""}`
        case "lookup_material":
            return `Material lookup: ${input?.material_name ?? "unknown"}`
        case "lookup_process":
            return `Process lookup: ${input?.process_name ?? "unknown"}`
        case "run_engineering_calc":
            return `Engineering calculation: ${(input?.description as string) ?? "custom"}`
        default:
            return `${toolName} call`
    }
}

// ─── Decomposition Checkpoints (Tier 2) ─────────────────────────────

/** Max tokens for checkpoint calls — lightweight gut-level assessment */
const CHECKPOINT_MAX_TOKENS = 2048

/** Specialists that run decomposition checkpoints */
const CHECKPOINT_SPECIALISTS = ["cto", "vp-manufacturing"] as const

export interface CheckpointRequest {
    projectId: string
    projectSubject: string
    modules: CadLabModule[]
    researchReport: string
}

export type CheckpointResult =
    | { checkpoints: Record<string, DecompositionCheckpoint> }
    | { error: string }

/**
 * Runs lightweight decomposition checkpoints with Max (CTO) and Fang (VP Mfg)
 * in parallel before expensive CAD generation begins.
 *
 * @description Each specialist gets a fast gut-level assessment prompt focused
 * on their domain. No tools — this is pure reasoning. Results are saved to the
 * project's checkpoints JSONB column and to each specialist's memory thread.
 */
export async function requestDecompositionCheckpoints(
    req: CheckpointRequest,
): Promise<CheckpointResult> {
    return withAIGate('cad_lab_review', async ({ supabase, foundryId }) => {
        if (!req.projectId || !/^[0-9a-f-]{36}$/.test(req.projectId)) {
            return { error: "Invalid project ID" }
        }
        if (req.modules.length === 0) {
            return { error: "No modules to checkpoint" }
        }

        const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
        if (!apiKey) {
            return { error: "Anthropic API key not configured" }
        }

        const Anthropic = (await import("@anthropic-ai/sdk")).default
        // SECURITY/RELIABILITY: Cap SDK time to stay under Vercel's 300s
        // function limit. SDK default is 10min + 2 retries, which in a
        // tool loop can silently blow past the ceiling and return 504 with
        // no actionable error. 240s + no retries lets us fail fast and
        // surface the real cause. See forgeos-rules.md R4/R5.
        // maxRetries: 2 — the Anthropic SDK natively honours Retry-After on 429s
// and uses exponential backoff between attempts. With 4 autopilot chains
// running in parallel and ~9 modules each, the blast hits org-level
// rate limits; without retries the call fails immediately and the review
// is marked REVIEW_FAILED. Two retries (~10s + ~20s SDK backoff) absorb
// transient rate-limit spikes while keeping per-call wall-clock under
// the 240s budget. Confirmed against the 4-project demo run on 2026-04-25
// where every Fang review failed with "Too many requests" before maxRetries
// was raised. Total worst-case retry latency: ~30s, still inside timeout.
const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 2 })

        // Build module summary for the prompt
        const moduleSummary = req.modules.map((m, i) =>
            `${i + 1}. **${m.name}** (id: ${m.id}): ${m.purpose}\n   Key parts: ${m.keyParts.join(", ")}\n   Lead: ${m.leadWeeks}wk | Inputs: ${m.inputs.join(", ")} | Outputs: ${m.outputs.join(", ")}`
        ).join("\n")

        // Run all checkpoint specialists in parallel
        const results = await Promise.allSettled(
            CHECKPOINT_SPECIALISTS.map(async (specialistId) => {
                const startTime = Date.now()
                const specialist = getSpecialistById(specialistId)
                if (!specialist) throw new Error(`Unknown specialist: ${specialistId}`)

                // Build specialist system prompt
                const domainContext = loadDomainKnowledge(specialistId, specialist.description)
                const personalityPrompt = compilePersonalityPrompt(
                    `${specialist.name}, the ${specialist.title} specialist`,
                    specialist.personality,
                    domainContext,
                    specialistId,
                )

                // Inject memory observations if available
                let memoryBlock = ""
                let memoryThreadId: string | null = null
                try {
                    const threadRes = await getOrCreateSpecialistThread(specialistId)
                    memoryThreadId = threadRes.threadId
                    if (memoryThreadId) {
                        const memoryContext = await getMemoryContext(memoryThreadId, foundryId)
                        memoryBlock = formatObservationsForPrompt(memoryContext)
                    }
                } catch {
                    // Non-critical
                }

                const domainFocus = specialistId === "cto"
                    ? "Focus on: module boundaries, interface clarity, missing modules, integration risks, overall architecture quality."
                    : "Focus on: manufacturability, process compatibility, material choices, sizing for manufacturing, DFM concerns."

                const systemPrompt = `${personalityPrompt}

## Current Task: Decomposition Checkpoint
You are performing a quick assessment of a product decomposition BEFORE CAD generation begins. This is a gut-level check — be concise and direct.

${domainFocus}
${memoryBlock}

## Response Format (STRICT — follow exactly)
SENTIMENT: positive | cautious | concerned
SUMMARY: <1-2 sentences>
SUGGESTIONS: <comma-separated list, or "none">
FLAGGED_MODULES: <comma-separated module IDs needing attention, or "none">`

                // DECISION: Use Sonnet for checkpoints — fast gut-level assessment,
                // not full Opus review. Saves cost and latency.
                const response = await await withLlmPermit("anthropic", QUICK_VERDICT_MODEL, () => client.messages.create({
                    model: QUICK_VERDICT_MODEL,
                    max_tokens: CHECKPOINT_MAX_TOKENS,
                    system: systemPrompt,
                    messages: [{
                        role: "user",
                        content: `Assess this module decomposition for "${req.projectSubject}":\n\n${moduleSummary}\n\nResearch context (first 2000 chars):\n${req.researchReport.slice(0, 2000)}`,
                    }],
                }))

                const text = response.content
                    .filter(b => b.type === "text")
                    .map(b => b.type === "text" ? b.text : "")
                    .join("")

                const checkpoint = parseCheckpointResponse(
                    text,
                    specialistId,
                    specialist.name,
                    Date.now() - startTime,
                    req.modules.map(m => m.id),
                )

                // Write to specialist memory thread
                if (memoryThreadId) {
                    try {
                        await addMemoryMessage(
                            memoryThreadId,
                            foundryId,
                            "user",
                            `[CAD Lab Checkpoint] Assessed decomposition for "${req.projectSubject}" (${req.modules.length} modules)`,
                        )
                        await addMemoryMessage(
                            memoryThreadId,
                            foundryId,
                            "assistant",
                            `[CAD Lab Checkpoint Result] Sentiment: ${checkpoint.sentiment} | ${checkpoint.summary}${checkpoint.flaggedModules.length > 0 ? ` | Flagged: ${checkpoint.flaggedModules.join(", ")}` : ""}`,
                        )
                        processMemory(memoryThreadId, foundryId).catch(() => {})
                    } catch {
                        // Non-critical
                    }
                }

                return checkpoint
            }),
        )

        // Collect results, using defaults for failures
        const checkpoints: Record<string, DecompositionCheckpoint> = {}
        for (let i = 0; i < CHECKPOINT_SPECIALISTS.length; i++) {
            const specialistId = CHECKPOINT_SPECIALISTS[i]
            const result = results[i]
            if (result.status === "fulfilled") {
                checkpoints[specialistId] = result.value
            } else {
                console.error(`[CAD-REVIEWS] Checkpoint failed for ${specialistId}:`, result.reason)
                const specialist = getSpecialistById(specialistId)
                checkpoints[specialistId] = {
                    specialistId,
                    specialistName: specialist?.name ?? specialistId,
                    sentiment: "cautious",
                    summary: "Checkpoint assessment unavailable — proceeding with standard review.",
                    suggestions: [],
                    flaggedModules: [],
                    checkpointedAt: new Date().toISOString(),
                    checkpointTimeMs: 0,
                }
            }
        }

        // Save to project
        try {
            // SECURITY: Filter by foundry_id to prevent cross-tenant checkpoint overwrites
            const { error: saveError } = await supabase
                .from("cad_lab_projects")
                .update({ checkpoints: checkpoints as unknown as Json })
                .eq("id", req.projectId)
                .eq("foundry_id", foundryId)

            if (saveError) {
                console.error("[CAD-REVIEWS] Failed to save checkpoints:", saveError)
            }
        } catch (err) {
            console.error("[CAD-REVIEWS] Failed to save checkpoints:", err)
        }

        return { checkpoints }
    })
}

/**
 * Parse the specialist's checkpoint response into a structured DecompositionCheckpoint.
 *
 * @description Uses line-by-line parsing with generous fallbacks — LLMs sometimes
 * deviate slightly from the format. Invalid module IDs are silently dropped.
 */
function parseCheckpointResponse(
    text: string,
    specialistId: string,
    specialistName: string,
    checkpointTimeMs: number,
    validModuleIds: string[],
): DecompositionCheckpoint {
    // Parse sentiment
    const sentimentMatch = text.match(/SENTIMENT:\s*(positive|cautious|concerned)/i)
    const sentiment: CheckpointSentiment = sentimentMatch
        ? sentimentMatch[1].toLowerCase() as CheckpointSentiment
        : "cautious"

    // Parse summary
    const summaryMatch = text.match(/SUMMARY:\s*(.+?)(?:\n|$)/i)
    const summary = summaryMatch?.[1]?.trim() || `Checkpoint completed by ${specialistName}.`

    // Parse suggestions
    const suggestionsMatch = text.match(/SUGGESTIONS:\s*(.+?)(?:\n|$)/i)
    const suggestionsRaw = suggestionsMatch?.[1]?.trim() || ""
    const suggestions = suggestionsRaw.toLowerCase() === "none" || !suggestionsRaw
        ? []
        : suggestionsRaw.split(",").map(s => s.trim()).filter(Boolean).slice(0, 5)

    // Parse flagged modules — only keep valid IDs
    const flaggedMatch = text.match(/FLAGGED_MODULES:\s*(.+?)(?:\n|$)/i)
    const flaggedRaw = flaggedMatch?.[1]?.trim() || ""
    const validIdSet = new Set(validModuleIds)
    const flaggedModules = flaggedRaw.toLowerCase() === "none" || !flaggedRaw
        ? []
        : flaggedRaw.split(",").map(s => s.trim()).filter(id => validIdSet.has(id))

    return {
        specialistId,
        specialistName,
        sentiment,
        summary,
        suggestions,
        flaggedModules,
        checkpointedAt: new Date().toISOString(),
        checkpointTimeMs,
    }
}

// ─── Module Revision from Checkpoint Feedback (Tier 3) ──────────────

export interface RevisedModuleFields {
    purpose: string
    description: string
    keyParts: string[]
    whyItMatters: string
    failureModes: string[]
    unknowns: string[]
}

export interface RevisionRequest {
    // INTENT: Lean module shape — same 8 fields reviseModulesFromReviews uses.
    // Full CadLabModule[] would push post-image-gen projects over the 4MB
    // React Flight limit because modules carry imageUrl/result.svg*/imageBase64/
    // templateMatchResult/conceptSnapshot/costOverrides. The prompt at
    // reviseModulesFromCheckpoints only reads {id, name, purpose, description,
    // keyParts, whyItMatters, failureModes, unknowns}.
    modules: RevisionModuleInput[]
    checkpoints: Record<string, DecompositionCheckpoint>
    researchReport: string
    projectSubject: string
}

/**
 * Revises flagged modules' text fields to address checkpoint specialist concerns.
 *
 * @description After the user acknowledges checkpoint feedback, this action calls
 * Claude (in parallel, one call per flagged module) to revise the module's text
 * fields so they visibly address the specialist concerns. Uses Promise.allSettled
 * for graceful partial failure — if a module revision fails, it's silently skipped.
 *
 * @returns Record of moduleId → revised fields, only for successfully revised modules
 */
/**
 * Richer return shape so the UI can surface partial failure + infeasibility
 * warnings without having to re-parse the specialist concerns itself.
 */
export interface CheckpointRevisionResult {
    /** Successful revisions keyed by module id */
    revised: Record<string, RevisedModuleFields>
    /** Modules that were flagged but whose revision call failed. UI should
     *  prompt the founder to retry and not silently claim success. */
    failedModuleIds: string[]
    /** Count of flagged modules the caller tried to revise */
    attempted: number
    /**
     * True if a specialist used language indicating the design itself won't
     * work (e.g. "not manufacturable at stated wingspan"). This is a signal
     * the RESEARCH REPORT needs to change, not just the module descriptions,
     * and the UI should block proceeding to CAD generation until the founder
     * decides what to do.
     */
    designLevelInfeasibility: boolean
    /** Human-readable concerns that triggered the infeasibility flag */
    infeasibilityEvidence: string[]
}

/**
 * INTENT: Detect specialist language that signals "this design as specified
 * cannot be built" vs. "this module needs tweaking". Module-level concerns
 * are addressed by rewriting module text. DESIGN-level concerns (wingspan
 * impossible, material not viable at scale, etc.) need the research report
 * or top-level spec to change — the current revision pipeline can't do that.
 */
const DESIGN_INFEASIBILITY_PATTERNS: RegExp[] = [
    /not\s+manufactur(?:able|ing)/i,
    /is\s+not\s+achievable/i,
    /is\s+infeasible/i,
    /beyond\s+(?:the\s+)?state[-\s]of[-\s]the[-\s]art/i,
    /is\s+not\s+physically\s+(?:possible|viable)/i,
    /cannot\s+close\s+structurally/i,
    /exceeds?\s+(?:the\s+)?(?:mass|weight|power|energy)\s+budget/i,
    /violates?\s+(?:the\s+)?areal\s+density/i,
]

function detectDesignInfeasibility(checkpoints: Record<string, DecompositionCheckpoint>): { flagged: boolean; evidence: string[] } {
    const evidence: string[] = []
    for (const cp of Object.values(checkpoints)) {
        const fulltext = `${cp.summary}\n${cp.suggestions.join("\n")}`
        for (const pattern of DESIGN_INFEASIBILITY_PATTERNS) {
            if (pattern.test(fulltext)) {
                evidence.push(`${cp.specialistName}: ${cp.summary}`)
                break
            }
        }
    }
    return { flagged: evidence.length > 0, evidence }
}

export async function reviseModulesFromCheckpoints(
    req: RevisionRequest,
): Promise<CheckpointRevisionResult> {
    const emptyResult: CheckpointRevisionResult = {
        revised: {}, failedModuleIds: [], attempted: 0,
        designLevelInfeasibility: false, infeasibilityEvidence: [],
    }
    // SECURITY: Authenticate caller to prevent unauthenticated API credit burn
    return withAIGate('cad_lab_review', async () => {
        const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
        if (!apiKey) {
            console.error("[CAD-REVIEWS] No API key for module revision")
            return emptyResult
        }

        // Collect flagged module IDs from all checkpoints
        const flaggedIds = new Set<string>()
        const concernsByModule = new Map<string, string[]>()

        for (const checkpoint of Object.values(req.checkpoints)) {
            for (const moduleId of checkpoint.flaggedModules) {
                flaggedIds.add(moduleId)
                const existing = concernsByModule.get(moduleId) ?? []
                existing.push(
                    `**${checkpoint.specialistName}** (${checkpoint.sentiment}): ${checkpoint.summary}` +
                    (checkpoint.suggestions.length > 0
                        ? "\n  Suggestions: " + checkpoint.suggestions.join("; ")
                        : ""),
                )
                concernsByModule.set(moduleId, existing)
            }
        }

        // INTENT: Detect design-level infeasibility regardless of flagged module outcome.
        // Even if zero revisions succeed, the UI should see this signal.
        const infeasibility = detectDesignInfeasibility(req.checkpoints)

        if (flaggedIds.size === 0) return {
            ...emptyResult,
            designLevelInfeasibility: infeasibility.flagged,
            infeasibilityEvidence: infeasibility.evidence,
        }

        const flaggedModules = req.modules.filter((m) => flaggedIds.has(m.id))
        if (flaggedModules.length === 0) return {
            ...emptyResult,
            designLevelInfeasibility: infeasibility.flagged,
            infeasibilityEvidence: infeasibility.evidence,
        }

        const Anthropic = (await import("@anthropic-ai/sdk")).default
        // SECURITY/RELIABILITY: Cap SDK time to stay under Vercel's 300s
        // function limit. SDK default is 10min + 2 retries, which in a
        // tool loop can silently blow past the ceiling and return 504 with
        // no actionable error. 240s + no retries lets us fail fast and
        // surface the real cause. See forgeos-rules.md R4/R5.
        // maxRetries: 2 — the Anthropic SDK natively honours Retry-After on 429s
// and uses exponential backoff between attempts. With 4 autopilot chains
// running in parallel and ~9 modules each, the blast hits org-level
// rate limits; without retries the call fails immediately and the review
// is marked REVIEW_FAILED. Two retries (~10s + ~20s SDK backoff) absorb
// transient rate-limit spikes while keeping per-call wall-clock under
// the 240s budget. Confirmed against the 4-project demo run on 2026-04-25
// where every Fang review failed with "Too many requests" before maxRetries
// was raised. Total worst-case retry latency: ~30s, still inside timeout.
const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 2 })

        // INTENT: Stronger JSON contract. Previous prompt said "Return a JSON
        // object with keys: ..." which Claude often violated by wrapping in
        // ```json ...``` fences or adding a preamble. extractAndParseJson
        // handles the fence case but validation still failed ~80% of the time
        // in prod on this project ("1 of 6 revised" when 6 were flagged).
        const systemPrompt = `You revise product module descriptions to address specialist concerns from a design checkpoint review.

Rules:
- Preserve the original intent and level of detail
- Only change what's needed to address the specific concerns raised
- Keep the same writing style and tone
- Address EVERY suggestion in the specialist feedback

Output contract (STRICT):
- Respond with ONLY a single JSON object. No markdown fences. No preamble. No meta-commentary.
- Required keys (all must be present even if unchanged): purpose (string), description (string), keyParts (string[]), whyItMatters (string), failureModes (string[]), unknowns (string[])
- Your first character MUST be { and your last character MUST be }.`

        function buildUserContent(mod: RevisionModuleInput, extraHint: string): string {
            const concerns = concernsByModule.get(mod.id) ?? []
            return `Product: "${req.projectSubject}"

Module: "${mod.name}" (id: ${mod.id})

Current fields:
- Purpose: ${mod.purpose}
- Description: ${mod.description}
- Key Parts: ${JSON.stringify(mod.keyParts)}
- Why It Matters: ${mod.whyItMatters}
- Failure Modes: ${JSON.stringify(mod.failureModes)}
- Unknowns: ${JSON.stringify(mod.unknowns)}

Specialist concerns for this module:
${concerns.join("\n")}

Research context (first 1500 chars):
${req.researchReport.slice(0, 1500)}
${extraHint}
Return the revised fields as a single JSON object now.`
        }

        function validateShape(parsed: Record<string, unknown>): boolean {
            return (
                typeof parsed.purpose === "string" &&
                typeof parsed.description === "string" &&
                Array.isArray(parsed.keyParts) && parsed.keyParts.every((s: unknown) => typeof s === "string") &&
                typeof parsed.whyItMatters === "string" &&
                Array.isArray(parsed.failureModes) && parsed.failureModes.every((s: unknown) => typeof s === "string") &&
                Array.isArray(parsed.unknowns) && parsed.unknowns.every((s: unknown) => typeof s === "string")
            )
        }

        async function reviseOne(mod: RevisionModuleInput): Promise<{ moduleId: string; fields: RevisedModuleFields } | { moduleId: string; error: string }> {
            // Try once, on parse/shape failure retry with a stricter nudge.
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const hint = attempt === 0
                        ? ""
                        : "\n\nIMPORTANT: Your previous response was not valid JSON matching the required shape. Output ONLY the JSON object this time, starting with { and ending with }. No prose.\n"
                    const response = await await withLlmPermit("anthropic", REVIEW_MODEL, () => client.messages.create({
                        model: REVIEW_MODEL,
                        max_tokens: 2048,
                        system: systemPrompt,
                        messages: [{ role: "user", content: buildUserContent(mod, hint) }],
                    }))
                    const text = response.content
                        .filter((b) => b.type === "text")
                        .map((b) => b.type === "text" ? b.text : "")
                        .join("")
                    const parsed = extractAndParseJson(text)
                    if (!parsed) {
                        console.warn(`[CAD-REVIEWS] ${mod.id} attempt ${attempt + 1}: no JSON found`)
                        continue
                    }
                    if (!validateShape(parsed)) {
                        console.warn(`[CAD-REVIEWS] ${mod.id} attempt ${attempt + 1}: invalid shape`, { keys: Object.keys(parsed) })
                        continue
                    }
                    return { moduleId: mod.id, fields: parsed as unknown as RevisedModuleFields }
                } catch (err) {
                    console.warn(`[CAD-REVIEWS] ${mod.id} attempt ${attempt + 1} errored:`, err instanceof Error ? err.message : err)
                }
            }
            return { moduleId: mod.id, error: "Revision parse/shape failed after 2 attempts" }
        }

        const results = await Promise.all(flaggedModules.map((mod) => reviseOne(mod as RevisionModuleInput)))

        const revised: Record<string, RevisedModuleFields> = {}
        const failedModuleIds: string[] = []
        for (const result of results) {
            if ("fields" in result) {
                revised[result.moduleId] = result.fields
            } else {
                failedModuleIds.push(result.moduleId)
            }
        }

        return {
            revised,
            failedModuleIds,
            attempted: flaggedModules.length,
            designLevelInfeasibility: infeasibility.flagged,
            infeasibilityEvidence: infeasibility.evidence,
        }
    })
}

// ─── Module Revision from Review Feedback (Post-Specialist Review) ───

/**
 * Lean module shape for revision — only the fields the prompt actually uses.
 * Dropping imageUrl, imageBase64, result, templateMatchResult, svgUrls,
 * conceptSnapshot, costOverrides, moduleImagePrompt, etc. avoids hitting
 * React Flight's serialization limit (R3 in forgeos-rules.md) and keeps the
 * payload well under 4 MB even for 10+ modules.
 */
export interface RevisionModuleInput {
    id: string
    name: string
    purpose: string
    description: string
    keyParts: string[]
    whyItMatters: string
    failureModes: string[]
    unknowns: string[]
}

export interface ReviewRevisionRequest {
    modules: RevisionModuleInput[]
    /** Accepted issues from the ReviewIssueSummary component, grouped by module */
    acceptedIssues: Array<{
        moduleId: string
        moduleName: string
        specialistName: string
        issue: { severity: string; category: string; message: string; suggestion?: string }
    }>
    /** Diagnostic answers for context (process, material, etc.) */
    diagnosticAnswers?: DiagnosticAnswers
    projectSubject: string
}

/**
 * Revises modules' text fields to address accepted specialist review issues.
 *
 * @description Similar pattern to reviseModulesFromCheckpoints() — calls Claude
 * in parallel per affected module with the specific accepted issues. Returns
 * revised fields for each module.
 *
 * @returns Record of moduleId → revised fields, only for successfully revised modules
 */
export async function reviseModulesFromReviews(
    req: ReviewRevisionRequest,
): Promise<Record<string, RevisedModuleFields>> {
    return withAIGate('cad_lab_review', async () => {
        const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
        if (!apiKey) {
            console.error("[CAD-REVIEWS] No API key for review-based revision")
            return {}
        }

        // Group accepted issues by module
        const issuesByModule = new Map<string, typeof req.acceptedIssues>()
        for (const item of req.acceptedIssues) {
            const existing = issuesByModule.get(item.moduleId) ?? []
            existing.push(item)
            issuesByModule.set(item.moduleId, existing)
        }

        if (issuesByModule.size === 0) return {}

        const affectedModules = req.modules.filter(m => issuesByModule.has(m.id))
        if (affectedModules.length === 0) return {}

        const Anthropic = (await import("@anthropic-ai/sdk")).default
        // SECURITY/RELIABILITY: Cap SDK time to stay under Vercel's 300s
        // function limit. SDK default is 10min + 2 retries, which in a
        // tool loop can silently blow past the ceiling and return 504 with
        // no actionable error. 240s + no retries lets us fail fast and
        // surface the real cause. See forgeos-rules.md R4/R5.
        // maxRetries: 2 — the Anthropic SDK natively honours Retry-After on 429s
// and uses exponential backoff between attempts. With 4 autopilot chains
// running in parallel and ~9 modules each, the blast hits org-level
// rate limits; without retries the call fails immediately and the review
// is marked REVIEW_FAILED. Two retries (~10s + ~20s SDK backoff) absorb
// transient rate-limit spikes while keeping per-call wall-clock under
// the 240s budget. Confirmed against the 4-project demo run on 2026-04-25
// where every Fang review failed with "Too many requests" before maxRetries
// was raised. Total worst-case retry latency: ~30s, still inside timeout.
const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 2 })

        const results = await Promise.allSettled(
            affectedModules.map(async (mod) => {
                const issues = issuesByModule.get(mod.id) ?? []
                const diagnostics = req.diagnosticAnswers?.[mod.id]

                const issueText = issues.map((item, i) =>
                    `${i + 1}. [${item.issue.severity.toUpperCase()}] ${item.issue.category}: ${item.issue.message}${item.issue.suggestion ? `\n   Suggested fix: ${item.issue.suggestion}` : ""}` +
                    `\n   (Raised by: ${item.specialistName})`
                ).join("\n")

                const diagnosticContext = diagnostics
                    ? `\nDiagnostic specs: Process=${diagnostics.mfg_process || "unspecified"}, Material=${diagnostics.material || "unspecified"}, Tolerance=${diagnostics.tolerance || "unspecified"}, Finish=${diagnostics.finish || "unspecified"}, Batch=${diagnostics.batch_size || "unspecified"}`
                    : ""

                const response = await await withLlmPermit("anthropic", REVIEW_MODEL, () => client.messages.create({
                    model: REVIEW_MODEL,
                    max_tokens: 2048,
                    system: `You revise product module descriptions to address specific specialist review issues. Rules:
- Address EVERY accepted issue — don't skip any
- Preserve the original intent and level of detail
- Only change what's needed to address the specific issues
- Keep the same writing style and tone
- Where an issue has a suggested fix, incorporate it
- Return ALL fields (even unchanged ones) as valid JSON
- Do NOT add disclaimers or meta-commentary — just return the revised content`,
                    messages: [{
                        role: "user",
                        content: `Product: "${req.projectSubject}"

Module: "${mod.name}" (id: ${mod.id})
${diagnosticContext}

Current fields:
- Purpose: ${mod.purpose}
- Description: ${mod.description}
- Key Parts: ${JSON.stringify(mod.keyParts)}
- Why It Matters: ${mod.whyItMatters}
- Failure Modes: ${JSON.stringify(mod.failureModes)}
- Unknowns: ${JSON.stringify(mod.unknowns)}

Specialist review issues to address:
${issueText}

Revise the module fields to address all the issues above. Return a JSON object with keys: purpose, description, keyParts, whyItMatters, failureModes, unknowns.`,
                    }],
                }))

                const text = response.content
                    .filter((b) => b.type === "text")
                    .map((b) => b.type === "text" ? b.text : "")
                    .join("")

                const parsed = extractAndParseJson(text)
                if (!parsed) {
                    throw new Error(`No valid JSON found in revision response for module ${mod.id}`)
                }

                if (
                    typeof parsed.purpose !== "string" ||
                    typeof parsed.description !== "string" ||
                    !Array.isArray(parsed.keyParts) || !parsed.keyParts.every((s: unknown) => typeof s === "string") ||
                    typeof parsed.whyItMatters !== "string" ||
                    !Array.isArray(parsed.failureModes) || !parsed.failureModes.every((s: unknown) => typeof s === "string") ||
                    !Array.isArray(parsed.unknowns) || !parsed.unknowns.every((s: unknown) => typeof s === "string")
                ) {
                    throw new Error(`Invalid revision shape for module ${mod.id}`)
                }

                return { moduleId: mod.id, fields: parsed as unknown as RevisedModuleFields }
            }),
        )

        const revised: Record<string, RevisedModuleFields> = {}
        for (const result of results) {
            if (result.status === "fulfilled") {
                revised[result.value.moduleId] = result.value.fields
            } else {
                console.warn("[CAD-REVIEWS] Review revision failed for module:", result.reason)
            }
        }

        return revised
    })
}

/**
 * Extract and parse the first balanced JSON object from LLM output.
 *
 * DECISION: Brace-counting instead of greedy regex — handles cases where the
 * LLM wraps JSON in markdown fences or adds trailing commentary with braces.
 */
function extractAndParseJson(text: string): Record<string, unknown> | null {
    const start = text.indexOf("{")
    if (start === -1) return null

    let depth = 0
    let inString = false
    let escaped = false

    for (let i = start; i < text.length; i++) {
        const ch = text[i]
        if (escaped) { escaped = false; continue }
        if (ch === "\\") { escaped = true; continue }
        if (ch === '"') { inString = !inString; continue }
        if (inString) continue
        if (ch === "{") depth++
        if (ch === "}") {
            depth--
            if (depth === 0) {
                try {
                    return JSON.parse(text.slice(start, i + 1))
                } catch {
                    return null
                }
            }
        }
    }
    return null
}
