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
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
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

// ─── Constants ──────────────────────────────────────────────────────

const REVIEW_MODEL = "claude-opus-4-6"
const MAX_TOOL_LOOPS = 5
const MAX_TOKENS = 8192

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

export interface ReviewRequest {
    projectId: string
    moduleId: string
    specialistId: string
    /** All modules in the project (for system-level context) */
    allModules: CadLabModule[]
    /** Design brief from diagnostics */
    designBrief?: CadLabDesignBrief
    /** Diagnostic answers keyed by module ID */
    diagnosticAnswers?: DiagnosticAnswers
    /** Project subject line */
    projectSubject: string
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

        let systemPrompt = `${personalityPrompt}

## Current Task: Design Review
You are performing a structured design review of a CAD Lab module. Use your tools to verify claims with real data — never guess material properties or process constraints.

${reviewContext}`

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

        // ── Call Anthropic with tool loop ──
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
            return { error: "Anthropic API key not configured" }
        }

        const Anthropic = (await import("@anthropic-ai/sdk")).default
        const client = new Anthropic({ apiKey })

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
            const response = await client.messages.create(createParams) as any
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
    })
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

        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
            return { error: "Anthropic API key not configured" }
        }

        const Anthropic = (await import("@anthropic-ai/sdk")).default
        const client = new Anthropic({ apiKey })

        const response = await client.messages.create({
            model: QUICK_VERDICT_MODEL,
            max_tokens: QUICK_VERDICT_MAX_TOKENS,
            system: systemPrompt,
            messages: [{
                role: "user",
                content: `Quick verdict on module "${targetModule.name}" — PASS, WARN, or FAIL?`,
            }],
        })

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

        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
            return { error: "Anthropic API key not configured" }
        }

        const Anthropic = (await import("@anthropic-ai/sdk")).default
        const client = new Anthropic({ apiKey })

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

                const response = await client.messages.create({
                    model: REVIEW_MODEL,
                    max_tokens: CHECKPOINT_MAX_TOKENS,
                    system: systemPrompt,
                    messages: [{
                        role: "user",
                        content: `Assess this module decomposition for "${req.projectSubject}":\n\n${moduleSummary}\n\nResearch context (first 2000 chars):\n${req.researchReport.slice(0, 2000)}`,
                    }],
                })

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
            const { error: saveError } = await supabase
                .from("cad_lab_projects")
                .update({ checkpoints: checkpoints as unknown as Json })
                .eq("id", req.projectId)

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
    modules: CadLabModule[]
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
export async function reviseModulesFromCheckpoints(
    req: RevisionRequest,
): Promise<Record<string, RevisedModuleFields>> {
    // SECURITY: Authenticate caller to prevent unauthenticated API credit burn
    return withAIGate('cad_lab_review', async () => {
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
            console.error("[CAD-REVIEWS] No API key for module revision")
            return {}
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

        if (flaggedIds.size === 0) return {}

        const flaggedModules = req.modules.filter((m) => flaggedIds.has(m.id))
        if (flaggedModules.length === 0) return {}

        const Anthropic = (await import("@anthropic-ai/sdk")).default
        const client = new Anthropic({ apiKey })

        const results = await Promise.allSettled(
            flaggedModules.map(async (mod) => {
                const concerns = concernsByModule.get(mod.id) ?? []

                const response = await client.messages.create({
                    model: REVIEW_MODEL,
                    max_tokens: 2048,
                    system: `You revise product module descriptions to address specialist concerns from a design checkpoint review. Rules:
- Preserve the original intent and level of detail
- Only change what's needed to address the specific concerns raised
- Keep the same writing style and tone
- Return ALL fields (even unchanged ones) as valid JSON
- Do NOT add disclaimers or meta-commentary — just return the revised content`,
                    messages: [{
                        role: "user",
                        content: `Product: "${req.projectSubject}"

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

Revise the module fields to address the specialist concerns. Return a JSON object with keys: purpose, description, keyParts, whyItMatters, failureModes, unknowns.`,
                    }],
                })

                const text = response.content
                    .filter((b) => b.type === "text")
                    .map((b) => b.type === "text" ? b.text : "")
                    .join("")

                // Extract JSON — find the outermost balanced braces to avoid greedy regex issues
                const parsed = extractAndParseJson(text)
                if (!parsed) {
                    throw new Error(`No valid JSON found in revision response for module ${mod.id}`)
                }

                // Validate required fields exist with correct types
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

        // Collect successful revisions
        const revised: Record<string, RevisedModuleFields> = {}
        for (const result of results) {
            if (result.status === "fulfilled") {
                revised[result.value.moduleId] = result.value.fields
            } else {
                console.warn("[CAD-REVIEWS] Module revision failed:", result.reason)
            }
        }

        return revised
    })
}

// ─── Module Revision from Review Feedback (Post-Specialist Review) ───

export interface ReviewRevisionRequest {
    modules: CadLabModule[]
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
        const apiKey = process.env.ANTHROPIC_API_KEY
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
        const client = new Anthropic({ apiKey })

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

                const response = await client.messages.create({
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
                })

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
