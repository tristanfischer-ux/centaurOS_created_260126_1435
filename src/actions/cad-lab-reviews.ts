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

        let fullText = ""
        let loopCount = 0

        while (loopCount <= MAX_TOOL_LOOPS) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = await client.messages.create(createParams) as any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const content: any[] = response.content ?? []

            // Collect text
            for (const block of content) {
                if (block.type === "text" && block.text) {
                    fullText += block.text
                }
            }

            // Check for tool calls
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const toolUseBlocks = content.filter((b: any) => b.type === "tool_use")
            if (toolUseBlocks.length === 0 || loopCount >= MAX_TOOL_LOOPS) {
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
            fullText,
            req.specialistId,
            specialist.name,
            calculationsPerformed,
            Date.now() - startTime,
        )

        // ── Save review to project ──
        try {
            const { data: project } = await supabase
                .from("cad_lab_projects")
                .select("reviews")
                .eq("id", req.projectId)
                .single()

            const existingReviews = (project?.reviews as Record<string, SpecialistReview[]> | null) ?? {}
            const moduleReviews = existingReviews[req.moduleId] ?? []

            // Replace existing review from same specialist, or append
            const filtered = moduleReviews.filter(r => r.specialistId !== req.specialistId)
            filtered.push(review)
            existingReviews[req.moduleId] = filtered

            await supabase
                .from("cad_lab_projects")
                .update({ reviews: existingReviews as unknown as Json })
                .eq("id", req.projectId)
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
 */
function parseReviewFromMarkdown(
    markdown: string,
    specialistId: string,
    specialistName: string,
    calculations: ReviewCalculation[],
    reviewTimeMs: number,
): SpecialistReview {
    // Extract verdict
    const verdictMatch = markdown.match(/###\s*VERDICT:\s*(PASS|WARN|FAIL)/i)
    const verdict: ReviewVerdict = verdictMatch
        ? (verdictMatch[1].toLowerCase() as ReviewVerdict)
        : "warn"

    // Extract summary (line after VERDICT header)
    const summaryMatch = markdown.match(/###\s*VERDICT:.*\n+(.+)/i)
    const summary = summaryMatch
        ? summaryMatch[1].trim()
        : `Review completed by ${specialistName}`

    // Extract issues
    const issues: ReviewIssue[] = []
    const issuePattern = /\*\*\[(CRITICAL|WARNING|INFO)\]\s*([^:*]+):\*\*\s*(.+)/gi
    let issueMatch
    while ((issueMatch = issuePattern.exec(markdown)) !== null) {
        const issue: ReviewIssue = {
            severity: issueMatch[1].toLowerCase() as ReviewIssue["severity"],
            category: issueMatch[2].trim(),
            message: issueMatch[3].trim(),
        }
        // Look for suggestion on next line
        const afterIssue = markdown.slice(issueMatch.index + issueMatch[0].length, issueMatch.index + issueMatch[0].length + 500)
        const sugMatch = afterIssue.match(/\*Suggestion:\*\s*(.+)/i)
        if (sugMatch) {
            issue.suggestion = sugMatch[1].trim()
        }
        issues.push(issue)
    }

    // Extract recommendations
    const recommendations: string[] = []
    const recsSection = markdown.match(/###\s*Recommendations\s*\n([\s\S]*?)(?=###|$)/i)
    if (recsSection) {
        const recPattern = /^\s*\d+\.\s*(.+)/gm
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
