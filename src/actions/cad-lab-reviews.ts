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

import { withAuth } from "@/lib/server-action-utils"
import type { Json } from "@/types/database.types"
import type {
    CadLabModule,
    CadLabDesignBrief,
    SpecialistReview,
    ReviewVerdict,
    ReviewIssue,
    ReviewCalculation,
} from "@/lib/cad-lab-types"
import { buildCadLabReviewContext } from "@/lib/ai-context/cad-lab-context"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
import { compilePersonalityPrompt } from "@/lib/agents/personality"
import { getToolsForSpecialist, executeToolCall } from "@/lib/agents/tools/registry"
import { loadDomainKnowledge } from "@/lib/agents/domain-knowledge"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

// ─── Constants ──────────────────────────────────────────────────────

const REVIEW_MODEL = "claude-sonnet-4-6"
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
    return withAuth(async ({ supabase, foundryId, user }) => {
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
        if (targetModule.status !== "generated" && !targetModule.result) {
            return { error: "Module must be generated before review" }
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

        const systemPrompt = `${personalityPrompt}

## Current Task: Design Review
You are performing a structured design review of a CAD Lab module. Use your tools to verify claims with real data — never guess material properties or process constraints.

${reviewContext}`

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

        return { review }
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
