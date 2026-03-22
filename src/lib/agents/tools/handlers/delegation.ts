/**
 * @file delegation.ts — Specialist-to-specialist delegation tool handler.
 *
 * @description Enables any specialist to ask another specialist for a brief
 * opinion on a topic. Does NOT recurse into the full execute route. Instead:
 *   1. Loads target specialist's personality prompt
 *   2. Runs target's primary data tool for context
 *   3. Makes a single cheap LLM call (MiniMax M2.5) with personality + data + question
 *   4. Returns the quoted response
 *
 * @security
 * - Cannot self-delegate (guard in handler)
 * - Max 2 delegations per tool loop (tracked via _delegationCount on context)
 * - Foundry isolation via executeToolCall context passthrough
 *
 * @related
 * - Tool definition: src/lib/agents/tools/definitions.ts (TOOL_ASK_SPECIALIST)
 * - Personality compiler: src/lib/agents/personality.ts
 * - Sweep data tools map: src/lib/agents/sweep-orchestrator.ts (SWEEP_DATA_TOOLS)
 * - Specialist roster: src/app/(platform)/agents/specialists-data.ts
 */

import type { ToolHandler, ToolHandlerContext } from "./common"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
import { compilePersonalityPrompt } from "@/lib/agents/personality"
import { getOpenAIClient } from "@/lib/ai/openai-lazy"
import { executeToolCall } from "../registry"

const DELEGATION_MODEL = "MiniMax-M2.7"
const MAX_DELEGATION_TOKENS = 2048

/** Maps specialist IDs to their primary data tool for delegation context. */
const DELEGATION_DATA_TOOLS: Record<string, string> = {
    "finance-lead": "query_financial_overview",
    "vp-engineering": "query_engineering_metrics",
    "product-lead": "query_product_roadmap",
    "hiring-team": "query_team_overview",
    strategist: "query_strategic_goals",
    "chief-of-staff": "query_activity_metrics",
    cto: "query_engineering_metrics",
    "fundraising-advisor": "query_financial_overview",
    "sales-lead": "query_financial_overview",
    "vp-manufacturing": "query_activity_metrics",
    "vp-supply-chain": "query_activity_metrics",
    "growth-marketer": "query_growth_metrics",
    "legal-counsel": "query_compliance_status",
}

// INTENT: Track delegation count per handler context to enforce the 2-delegation limit.
// We use a WeakMap keyed on the context object to avoid polluting the interface.
const delegationCounts = new WeakMap<ToolHandlerContext, number>()

export const handleAskSpecialist: ToolHandler = async (args, ctx) => {
    const targetId = args.specialist_id as string
    const question = args.question as string

    if (!targetId || !question) {
        return "Error: Both `specialist_id` and `question` are required."
    }

    // Guard: cannot self-delegate
    if (targetId === ctx.specialistId) {
        return "Error: Cannot delegate to yourself. Formulate your own answer."
    }

    // Guard: max 2 delegations per tool loop
    const count = delegationCounts.get(ctx) ?? 0
    if (count >= 2) {
        return "Error: Maximum 2 delegations per conversation turn. Synthesise from the answers you already have."
    }
    delegationCounts.set(ctx, count + 1)

    // Load target specialist data
    const target = getSpecialistById(targetId)
    if (!target) {
        return `Error: Unknown specialist "${targetId}". Valid IDs: strategist, cto, vp-engineering, vp-manufacturing, vp-supply-chain, product-lead, growth-marketer, sales-lead, chief-of-staff, finance-lead, fundraising-advisor, hiring-team, legal-counsel.`
    }

    // Compile target's personality prompt (abbreviated — no domain context needed for a brief consult)
    const personalityPrompt = compilePersonalityPrompt(target.name, target.personality, undefined, target.id)

    // Fetch target's primary data tool for grounding
    const primaryTool = DELEGATION_DATA_TOOLS[targetId] ?? "query_objectives"
    let dataContext = ""
    try {
        const toolResult = await executeToolCall(primaryTool, {}, { foundryId: ctx.foundryId })
        if (toolResult && !toolResult.startsWith("Error") && !toolResult.startsWith("No ") && !toolResult.startsWith("Unknown tool")) {
            dataContext = `\n\n## Company Data\n${toolResult}`
        }
    } catch {
        // INTENT: Non-breaking — if data fetch fails, delegation proceeds without it
    }

    // Make a single cheap LLM call
    const apiKey = process.env.MINIMAX_API_KEY?.trim()
    if (!apiKey) {
        return `Error: Delegation service unavailable (no API key configured).`
    }

    try {
        const OpenAI = await getOpenAIClient()
        const client = new OpenAI({ apiKey, baseURL: "https://api.minimax.io/v1" })

        const completion = await client.chat.completions.create({
            model: DELEGATION_MODEL,
            messages: [
                {
                    role: "system",
                    content: [
                        personalityPrompt,
                        dataContext,
                        "",
                        "You are being consulted by a colleague specialist. Give a brief, focused answer to their question.",
                        "Keep your response under 300 words. Be direct and actionable.",
                    ].join("\n"),
                },
                {
                    role: "user",
                    content: question,
                },
            ],
            max_tokens: MAX_DELEGATION_TOKENS,
            temperature: 0.4,
        })

        const answer = completion.choices?.[0]?.message?.content?.trim()
        if (!answer) {
            return `${target.name} (${target.title}) was unable to provide an answer at this time.`
        }

        return `> **${target.name} (${target.title}):** ${answer}`
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[Delegation] Failed to consult ${target.name}:`, msg)
        return `Error consulting ${target.name}: ${msg}`
    }
}
