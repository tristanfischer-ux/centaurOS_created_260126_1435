import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/security/rate-limit"
import { getTextProvider, getImageProvider, getAudioProvider, getVideoProvider } from "@/lib/ai-providers/registry"
import { decryptApiKey } from "@/lib/ai-providers/key-vault"
import type { AIProviderId, OutputModality } from "@/lib/ai-providers/types"
import { PROVIDER_REGISTRY } from "@/lib/ai-providers/types"
import {
    getMemoryContext,
    formatObservationsForPrompt,
    getConversationHistory,
    addMemoryMessage,
    processMemory,
} from "@/lib/agent-memory"
import type { ConversationMessage } from "@/lib/agent-memory"
import { buildAIContext } from "@/lib/ai-context/builder"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
import type { SpecialistId } from "@/app/(platform)/agents/specialists-data"
import { compilePersonalityPrompt } from "@/lib/agents/personality"
import { compileTemporalPrompt } from "@/lib/agents/temporal-context"
import { compileEmotionalPrompt } from "@/lib/agents/emotional-context"
import {
    getFounderPreferences,
    getSpecialistRelationship,
    compileFounderPreferencesPrompt,
    recordInteraction,
} from "@/lib/agents/founder-preferences"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min for video generation

const SYSTEM_PROMPT = `You are a world-class business strategist and AI assistant helping startup founders and operators build, grow, and scale their companies.

## Your Standards
- Be direct and actionable. Every recommendation should be something the reader can act on this week.
- Write for busy founders — use clear structure, short paragraphs, and bullet points. No filler, no fluff, no corporate speak.
- Use markdown formatting: headers for sections, tables for comparative data, bold for key terms, bullet points for lists.
- When presenting numbers, use tables. When comparing options, use tables. When showing timelines, use tables.

## Honesty & Accuracy
- Clearly distinguish between: (1) data the user provided, (2) widely-accepted industry knowledge, and (3) your estimates or assumptions.
- Flag assumptions explicitly: "Assumption: ..." or mark estimates with "~" or "[estimated]".
- Never fabricate specific statistics, company names, or benchmark numbers. If you don't have real data, say so and provide ranges or directional guidance instead.
- When uncertain, say "I'd recommend validating this with..." rather than presenting guesses as facts.

## Output Quality
- Prioritize depth on the 2-3 most important points over shallow coverage of everything.
- End with clear next steps: who does what, by when.
- If the user's input is missing critical information, note what's missing and work with what you have rather than asking questions (since this is a one-shot prompt, not a conversation).
- Calibrate your response length to the complexity of the request — don't pad short answers.`

const SLIDES_SYSTEM_PROMPT = `You are a slide deck creator. Generate a structured slide deck in JSON format.

Return ONLY valid JSON wrapped in a markdown code block. Use this exact structure:

\`\`\`json
{
  "title": "Deck Title",
  "slides": [
    {
      "title": "Slide Title",
      "subtitle": "Optional subtitle",
      "bullets": ["Point 1", "Point 2", "Point 3"],
      "notes": "Speaker notes",
      "layout": "title"
    }
  ],
  "theme": {
    "primaryColor": "EA580C",
    "secondaryColor": "1E293B"
  }
}
\`\`\`

Layout options: "title" (first slide), "content" (standard), "two-column" (split bullets), "closing" (last slide).
Create 6-12 slides with clear, concise bullet points. Make the content professional and actionable.`

// ─── Provider Failover Configuration ─────────────────────────────────

/**
 * Model tier type matching specialists-data.ts modelTier field.
 * Used to look up the fallback chain when a primary provider fails.
 */
type ModelTier = "claude" | "qwen" | "qwen-local" | "minimax"

interface ProviderTarget {
    providerId: AIProviderId
    modelId: string
}

/**
 * Ordered fallback chains per model tier. When the primary provider returns
 * a retryable error (503, rate limit, network), the system tries the next
 * provider in the chain. The first entry is the primary (same as MODEL_TIERS
 * on the client). "qwen-local" has no fallbacks — local-only by design.
 *
 * @security Failover never crosses the qwen-local boundary. If you chose
 * local inference for privacy, a cloud fallback would violate that contract.
 */
const FALLBACK_CHAINS: Record<ModelTier, ProviderTarget[]> = {
    claude: [
        { providerId: "anthropic", modelId: "claude-opus-4-6" },
        { providerId: "openai", modelId: "gpt-4o" },
        { providerId: "google", modelId: "gemini-2.0-flash" },
    ],
    qwen: [
        { providerId: "qwen", modelId: "qwen3.5-plus" },
        { providerId: "minimax", modelId: "MiniMax-M2.5" },
        { providerId: "openai", modelId: "gpt-4o" },
    ],
    minimax: [
        { providerId: "minimax", modelId: "MiniMax-M2.5" },
        { providerId: "qwen", modelId: "qwen3.5-plus" },
        { providerId: "openai", modelId: "gpt-4o" },
    ],
    "qwen-local": [
        { providerId: "qwen-local", modelId: "qwen3:30b-a3b" },
        // No fallbacks — local-only for privacy
    ],
}

/**
 * Determines whether a raw provider error is retryable via failover.
 *
 * @description Retryable errors indicate the provider is the problem (overloaded,
 * rate-limited, unreachable). Non-retryable errors indicate the request itself is
 * invalid (too long, content filtered, bad auth) — retrying on another provider
 * would produce the same failure or violate the user's intent.
 *
 * @param rawError - The raw error string from the provider
 * @returns true if the error is retryable on a different provider
 */
function isRetryableError(rawError: string): boolean {
    const lower = rawError.toLowerCase()

    // Non-retryable: request-side problems
    if (lower.includes("too many tokens") || lower.includes("context_length") || lower.includes("maximum context") || lower.includes("too long")) return false
    if (lower.includes("content_filter") || lower.includes("safety") || lower.includes("blocked") || lower.includes("content_policy")) return false
    if (lower.includes("authentication") || lower.includes("invalid api key") || lower.includes("unauthorized") || lower.includes("401")) return false

    // Retryable: provider-side problems
    if (lower.includes("overloaded") || lower.includes("503") || lower.includes("capacity") || lower.includes("server_error")) return true
    if (lower.includes("rate_limit") || lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) return true
    if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("timeout") || lower.includes("network") || lower.includes("fetch failed")) return true
    if (lower.includes("500") || lower.includes("internal server error")) return true

    // Unknown errors default to non-retryable to avoid wasting fallback attempts
    return false
}

/**
 * Resolves the platform API key for a given provider from environment variables.
 *
 * @description Centralises the env var → API key mapping so both the primary
 * request path and failover attempts use the same resolution logic.
 *
 * @param pid - The provider ID to resolve an API key for
 * @returns The API key string, or null if not configured
 */
function resolveApiKeyForProvider(pid: AIProviderId): string | null {
    const envMap: Partial<Record<AIProviderId, string>> = {
        openai: process.env.OPENAI_API_KEY ?? "",
        anthropic: process.env.ANTHROPIC_API_KEY ?? "",
        google: process.env.GOOGLE_AI_API_KEY ?? "",
        qwen: process.env.DASHSCOPE_API_KEY ?? "",
        "qwen-local": "ollama",
        stability: process.env.STABILITY_API_KEY ?? "",
        elevenlabs: process.env.ELEVENLABS_API_KEY ?? "",
        replicate: process.env.REPLICATE_API_TOKEN ?? "",
        minimax: process.env.MINIMAX_API_KEY ?? "",
    }
    const key = envMap[pid]
    return key || null
}

export async function POST(request: Request) {
    // 1. Authenticate
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // SECURITY: Rate limit to prevent API cost abuse (AI calls are expensive)
    const rateLimitResult = await rateLimit('api', `agent-execute:${user.id}`, { limit: 30, window: 3600 * 1000 })
    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: "Rate limit exceeded. Please wait before running more AI agents." },
            { status: 429 }
        )
    }

    // 2. Parse body
    let prompt: string
    let input: string
    let providerId: AIProviderId
    let modelId: string
    let modality: OutputModality
    let threadId: string | undefined
    let customSystemPromptSuffix: string | undefined
    let specialistId: string | undefined
    let enableThinking: boolean
    let videoConfig: { duration?: number; resolution?: string; promptOptimizer?: boolean } | undefined
    let firstFrameImage: string | undefined
    let modelTier: ModelTier | undefined

    try {
        const body = await request.json()
        prompt = body.prompt
        input = body.input ?? ""
        providerId = body.providerId ?? "anthropic"
        modelId = body.modelId ?? "claude-opus-4-6"
        modality = body.modality ?? "text"
        threadId = body.threadId ?? undefined
        customSystemPromptSuffix =
            typeof body.customSystemPromptSuffix === "string"
                ? body.customSystemPromptSuffix.slice(0, 2000)
                : undefined
        specialistId = typeof body.specialistId === "string" ? body.specialistId : undefined
        enableThinking = body.enableThinking === true
        videoConfig = body.videoConfig ?? undefined
        firstFrameImage = typeof body.firstFrameImage === "string" ? body.firstFrameImage : undefined
        modelTier = (typeof body.modelTier === "string" && body.modelTier in FALLBACK_CHAINS)
            ? body.modelTier as ModelTier
            : undefined

        if (!prompt || typeof prompt !== "string") {
            return NextResponse.json({ error: "prompt is required" }, { status: 400 })
        }
        if (typeof input !== "string") {
            return NextResponse.json({ error: "input must be a string" }, { status: 400 })
        }
        if (prompt.length > 50_000) {
            return NextResponse.json({ error: "prompt too long (max 50k chars)" }, { status: 400 })
        }
        if (input.length > 100_000) {
            return NextResponse.json({ error: "input too long (max 100k chars)" }, { status: 400 })
        }
        if (!PROVIDER_REGISTRY[providerId]) {
            return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 400 })
        }
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    // 3. Resolve API key
    // Platform provides AI — use env vars by default.
    // Users can optionally bring their own key (BYOK) to override.
    let apiKey: string | null = resolveApiKeyForProvider(providerId)
    let keySource: "platform" | "user" = "platform"

    // Allow user's own key to override (BYOK), if configured
    const { data: keyRow } = await supabase
        .from("ai_provider_keys")
        .select("encrypted_key")
        .eq("user_id", user.id)
        .eq("provider_id", providerId)
        .single()

    if (keyRow?.encrypted_key) {
        try {
            const userKey = decryptApiKey(keyRow.encrypted_key)
            if (userKey) {
                apiKey = userKey
                keySource = "user"
            }
        } catch (err) {
            // Non-critical — fall back to platform key
            console.warn("[agents/execute] User key decrypt failed, using platform key:", err)
        }
    }

    if (!apiKey) {
        const providerName = PROVIDER_REGISTRY[providerId]?.name ?? providerId
        console.error("[agents/execute] No API key configured for provider:", { providerId, modelId })
        return NextResponse.json(
            {
                error: `${providerName} is not configured. Try again later or add an API key in settings.`,
                code: "PROVIDER_UNAVAILABLE",
                providerId,
            },
            { status: 503 }
        )
    }

    // 4. Build rich company context using the AI Context Builder
    const foundryId = await resolveFoundryId(supabase, user.id)

    // 4a. Fetch user profile for identity context (so the agent knows who they're speaking with)
    const { data: userProfile } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .single()

    // 4b. Validate threadId belongs to user's foundry (IDOR prevention)
    if (threadId && foundryId) {
        const { data: thread } = await supabase
            .from("agent_memory_threads")
            .select("id")
            .eq("id", threadId)
            .eq("foundry_id", foundryId)
            .single()
        if (!thread) {
            return NextResponse.json(
                { error: "Invalid or inaccessible thread" },
                { status: 403 }
            )
        }
    }
    let companyContext = ""
    try {
        if (foundryId) {
            companyContext = await buildAIContext(foundryId, user.id, {
                includeActivity: true,
                includeObjectives: true,
                includeUserProfile: false, // Skip heavy profile for streaming performance
                includeInsightHistory: false,
            })
        }
    } catch (err) {
        // Non-critical — proceed without company context
        console.warn("[agents/execute] Could not load company context:", err)
    }

    // 5. Build the final prompt
    let finalPrompt = prompt.replace(/\{\{input\}\}/g, input)
    finalPrompt = finalPrompt.replace(/\{\{company_context\}\}/g, companyContext)

    // 6. Build system prompt with agent memory (observations only) and
    //    extract conversation history as proper multi-turn messages.
    //    Observations (compressed summaries of older conversations) go into the
    //    system prompt. Recent messages become real user/assistant turns in the
    //    messages array so the model properly tracks the conversation.
    let memoryBlock = ""
    let conversationHistory: ConversationMessage[] = []

    if (threadId && foundryId) {
        try {
            const memoryContext = await getMemoryContext(threadId, foundryId, true)

            // Observations → system prompt (compressed background context)
            memoryBlock = formatObservationsForPrompt(memoryContext)

            // Recent messages → proper multi-turn messages array
            conversationHistory = getConversationHistory(memoryContext)

            // Record the user's ACTUAL input as a message in the memory thread.
            // We save `input` (what the user typed) rather than `finalPrompt`
            // (which includes the full template + company context) so that
            // conversation history reads naturally when fetched back.
            const userMessageForHistory = input.trim() || finalPrompt.slice(0, 500)
            await addMemoryMessage(threadId, foundryId, "user", userMessageForHistory)
        } catch (err) {
            // Non-critical — proceed without memory context
            console.warn("[agents/execute] Could not load agent memory:", err)
        }
    }

    // Build system prompt: personality FIRST (identity leads), then context layers.
    // Structure: personality → temporal → emotional → company → memory → custom suffix
    // This ensures the specialist's identity is the dominant instruction, not a footnote.

    let systemPromptWithContext = ""

    // Inject specialist personality FIRST — identity leads, everything else is context.
    if (specialistId) {
        const specialist = getSpecialistById(specialistId)
        if (specialist) {
            const personalityPrompt = compilePersonalityPrompt(
                `${specialist.name}, the ${specialist.title} specialist`,
                specialist.personality,
                specialist.description,
                specialistId,
            )
            systemPromptWithContext = personalityPrompt

            // Inject relationship awareness for cross-specialist dynamics
            if (specialist.personality.relationships) {
                const { compileRelationshipContext } = await import("@/lib/agents/personality")
                const relationshipBlock = compileRelationshipContext(
                    specialist.name,
                    specialist.personality.relationships,
                    typeof customSystemPromptSuffix === "string" && customSystemPromptSuffix.includes("CROSS_SPECIALIST_CONTEXT")
                        ? customSystemPromptSuffix
                        : undefined,
                )
                if (relationshipBlock) {
                    systemPromptWithContext += `\n\n${relationshipBlock}`
                }
            }

            // Proposed actions: allow specialist to suggest tasks/objectives
            systemPromptWithContext += `

## Suggesting Actions (Create and Archive) — CRITICAL REQUIREMENT

**THIS IS THE MOST IMPORTANT INSTRUCTION IN THIS PROMPT.**

When your recommendation includes ANY concrete next steps — tasks to do, objectives to create, items to remove, strategy changes — you **MUST** output a PROPOSED_ACTIONS block. This is the ONLY mechanism that renders interactive checkboxes in the UI. Without it, the user sees static text they cannot act on.

### What NEVER to do
- **NEVER use markdown tables** (| Action | Owner | Deadline |) for action items. Tables are static text. The user CANNOT tick, execute, or interact with them.
- **NEVER use bullet lists** for assignments (- Do X by Friday). Those are also non-interactive.
- **NEVER describe actions only in prose** without the structured block. The user will see words but no way to execute.

If you catch yourself writing a markdown table with action items, STOP and convert it to PROPOSED_ACTIONS format instead.

### Format
In the same response where you explain your recommendation in prose, include this HTML comment block with valid JSON at the END of your response:

\`\`\`
<!-- PROPOSED_ACTIONS
[
  { "type": "archive_objective", "title": "Exact title from objectives list", "description": "Why" },
  { "type": "archive_task", "title": "Exact task title", "description": "Why" },
  { "type": "objective", "title": "New objective title", "description": "Details", "strategicGoalTitle": "Parent goal title" },
  { "type": "task", "title": "New task title", "description": "Details", "objectiveTitle": "Parent objective title" }
]
-->
\`\`\`

### Action types
- \`"archive_objective"\` — Remove an existing objective (soft-delete). Use the EXACT title from the objectives list above.
- \`"archive_task"\` — Remove an existing task (soft-delete). Use the EXACT title.
- \`"objective"\` — Create a new objective. Set \`"strategicGoalTitle"\` to nest it under the right parent.
- \`"task"\` — Create a new task. Set \`"objectiveTitle"\` to link it to an objective.

### Example: Recommending to kill a feature and consolidate strategy
If the user has duplicate objectives like "raise 50m funding" and "raise 60m funding", and you recommend consolidating:

\`\`\`
<!-- PROPOSED_ACTIONS
[
  { "type": "archive_objective", "title": "raise 50m funding", "description": "Duplicate — consolidating into single fundraising strategy" },
  { "type": "archive_objective", "title": "raise 60m funding", "description": "Duplicate — consolidating into single fundraising strategy" },
  { "type": "objective", "title": "Raise $50M Series A", "description": "Consolidated fundraising objective with clear milestones", "strategicGoalTitle": "Consolidate Fundraising Strategy" }
]
-->
\`\`\`

This renders as interactive cards with checkboxes. The user ticks which ones to archive, which to create, and clicks one button.

### Rules
1. **ALWAYS include PROPOSED_ACTIONS when you recommend actions.** This is mandatory, not optional. The user explicitly expects interactive checkboxes.
2. **When recommending cleanup or strategy changes, include BOTH archive AND create actions.** Archive the old, create the new — in one block.
3. **Use EXACT titles from the objectives/tasks list** for archive actions. Title matching is case-insensitive but must be exact otherwise.
4. **Put archive actions BEFORE create actions** in the array.
5. **For new objectives, always set "strategicGoalTitle"** to an existing strategic goal title so they nest correctly.
6. Only skip the block for purely informational responses with zero actionable recommendations.
7. The visible prose should read naturally. The PROPOSED_ACTIONS block is supplementary — describe actions in words, then include the structured block at the end.`

            // Workflow capabilities: let the specialist know what they can produce
            const { getSpecialistWorkflows } = await import("@/lib/agents/specialist-workflows")
            const workflows = getSpecialistWorkflows(specialistId as SpecialistId)
            if (workflows.length > 0) {
                const workflowList = workflows
                    .map(
                        (w) =>
                            `- "${w.name}": ${w.description} (triggered by phrases like: ${w.triggers.slice(0, 2).join(", ")})`,
                    )
                    .join("\n")
                systemPromptWithContext += `\n\n## Your Executable Workflows
You can produce these deliverables when the founder asks. Mention them naturally when relevant:
${workflowList}

When the founder triggers one of these (e.g., "draft the plan", "run the numbers"), produce the full deliverable in your response. Don't just outline it — actually write it out completely and thoroughly.`
            }
        }
    }

    // If no specialist, fall back to generic system prompt
    if (!systemPromptWithContext) {
        systemPromptWithContext = SYSTEM_PROMPT
    }

    // Add core business standards (condensed — the specialist personality already
    // covers most of the behavioral guidance)
    systemPromptWithContext += `\n\n## Response Standards
- Be direct and actionable. Use markdown: headers, tables, bullets.
- Distinguish between data the user provided, industry knowledge, and your estimates.
- Flag assumptions explicitly. Never fabricate statistics.
- End with clear next steps: who does what, by when.`

    // User identity: address them by name
    if (userProfile?.full_name) {
        const roleSuffix = userProfile.role ? ` (${userProfile.role})` : ""
        systemPromptWithContext += `\n\n## User Identity\nYou are speaking with ${userProfile.full_name}${roleSuffix}. Address them by name when natural.`
    }

    // Founder preferences: learned communication style, trust level, pet peeves
    if (foundryId && specialistId && threadId) {
        try {
            const [founderPrefs, specialistRel] = await Promise.all([
                getFounderPreferences(foundryId),
                getSpecialistRelationship(threadId, foundryId),
            ])
            const specialist = getSpecialistById(specialistId)
            const prefsBlock = compileFounderPreferencesPrompt(
                founderPrefs,
                specialistRel,
                specialist?.name ?? specialistId,
            )
            if (prefsBlock) {
                systemPromptWithContext += `\n\n${prefsBlock}`
            }
        } catch (err) {
            // Non-critical — proceed without preferences
            console.warn("[agents/execute] Could not load founder preferences:", err)
        }
    }

    // Specialist emotional state and relationship depth
    if (foundryId && threadId && specialistId) {
        try {
            const { getSpecialistState, compileSpecialistStatePrompt } = await import("@/lib/agents/specialist-state")
            const specialist = getSpecialistById(specialistId)
            const { emotional, relationship } = await getSpecialistState(threadId, foundryId)
            const stateBlock = compileSpecialistStatePrompt(emotional, relationship, specialist?.name ?? specialistId)
            if (stateBlock) {
                systemPromptWithContext += `\n\n${stateBlock}`
            }
        } catch (err) {
            // Non-critical — proceed without state context
            console.warn("[agents/execute] Could not load specialist state:", err)
        }
    }

    // Decision journal: past decisions for "remember when" references
    if (foundryId && specialistId) {
        try {
            const { getRecentDecisions, compileDecisionJournalPrompt, detectDecisionPatterns } = await import("@/lib/agents/decision-journal")
            const decisions = await getRecentDecisions(foundryId, specialistId, 10)
            const journalBlock = compileDecisionJournalPrompt(decisions)
            if (journalBlock) {
                systemPromptWithContext += `\n\n${journalBlock}`
            }
            // Add pattern recognition for deep relationships
            const allDecisions = await getRecentDecisions(foundryId, undefined, 50)
            const patterns = detectDecisionPatterns(allDecisions)
            if (patterns.length > 0) {
                systemPromptWithContext += `\n\n## Founder Decision Patterns\n${patterns.join('\n')}`
            }
        } catch (err) {
            console.warn("[agents/execute] Could not load decision journal:", err)
        }
    }

    // External intelligence: recent reports from monitoring sweeps
    if (foundryId && specialistId) {
        try {
            const { getRecentIntelligenceReports } = await import("@/lib/agents/intelligence-sweep-orchestrator")
            const { compileIntelligencePrompt } = await import("@/lib/agents/external-intelligence")
            const reports = await getRecentIntelligenceReports(foundryId, 3, specialistId)
            const intelligenceBlock = compileIntelligencePrompt(reports, specialistId as SpecialistId)
            if (intelligenceBlock) {
                systemPromptWithContext += `\n\n${intelligenceBlock}`
            }
        } catch (err) {
            // Non-critical: intelligence context is supplementary
            console.warn("[agents/execute] Failed to load intelligence context:", err)
        }
    }

    // Knowledge Vault: inject relevant organizational knowledge
    if (foundryId && specialistId) {
        try {
            const { searchKnowledgeForSpecialist } = await import("@/lib/knowledge-vault")
            const vaultContext = await searchKnowledgeForSpecialist(
                foundryId,
                input || finalPrompt.slice(0, 500),
                specialistId,
                8
            )
            if (vaultContext) {
                systemPromptWithContext += `\n\n${vaultContext}`
            }
        } catch (err) {
            // Non-critical — Knowledge Vault is supplementary context
            console.warn("[agents/execute] Could not load Knowledge Vault context:", err)
        }
    }

    // Temporal awareness: what time/day it is, how to adjust behavior
    // Also includes milestone awareness if we know when the foundry was created
    let foundryCreatedAt: string | null = null
    if (foundryId) {
        try {
            const { data: foundryData } = await supabase
                .from("foundries")
                .select("created_at")
                .eq("id", foundryId)
                .single()
            foundryCreatedAt = foundryData?.created_at ?? null
        } catch {
            // Non-critical
        }
    }
    const temporalBlock = compileTemporalPrompt(undefined, foundryCreatedAt)
    systemPromptWithContext += `\n\n${temporalBlock}`

    // Emotional awareness: detect founder's emotional state from their message
    const emotionalBlock = compileEmotionalPrompt(input)
    if (emotionalBlock) {
        systemPromptWithContext += `\n\n${emotionalBlock}`
    }

    if (companyContext) {
        systemPromptWithContext += `\n\n${companyContext}`
    }
    if (memoryBlock) {
        systemPromptWithContext += `\n\n## Agent Memory\n${memoryBlock}`
    }
    if (customSystemPromptSuffix) {
        systemPromptWithContext += customSystemPromptSuffix
    }

    // 7. Route to the right provider based on modality
    // AUDIT: Log usage for metered billing and track AI costs
    const logUsageAfterCompletion = async (outputLength: number): Promise<void> => {
        if (!foundryId) return // Can't log without a foundry

        try {
            // Estimate token counts: ~4 chars per token is a reasonable approximation
            const estimatedInputTokens = Math.ceil((finalPrompt.length + systemPromptWithContext.length) / 4)
            const estimatedOutputTokens = Math.ceil(outputLength / 4)
            const totalTokens = estimatedInputTokens + estimatedOutputTokens

            await supabase.from("ai_usage_log").insert({
                user_id: user.id,
                foundry_id: foundryId,
                feature: `specialist-${modality}`,
                model: `${providerId}/${modelId}`,
                prompt_tokens: estimatedInputTokens,
                completion_tokens: estimatedOutputTokens,
                total_tokens: totalTokens,
                estimated_cost_usd: 0, // Will be calculated by billing system
                key_source: keySource,
                metadata: { modality, providerId, modelId },
            })
        } catch (err) {
            // Non-critical — don't fail the request over usage logging
            console.warn("[agents/execute] Failed to log usage:", err)
        }
    }

    // Memory callback: record assistant response, process memory, and track interaction
    const memoryCallback = threadId && foundryId
        ? async (fullOutput: string) => {
            try {
                // Strip internal directives before saving to history (NEXT_SPECIALIST, PROPOSED_ACTIONS)
                let cleanOutput = fullOutput.replace(/NEXT_SPECIALIST:\s*\S+\s*\|.*/i, "").trim()
                cleanOutput = cleanOutput.replace(/<!--\s*PROPOSED_ACTIONS\s*[\s\S]*?\s*-->/gi, "").trim()
                await addMemoryMessage(threadId!, foundryId, "assistant", cleanOutput || fullOutput)

                // Detect and record decisions from the user's message
                try {
                    const { containsDecisionSignal, extractDecisionSummary, recordDecision } = await import("@/lib/agents/decision-journal")
                    const userMsg = input.trim() || finalPrompt.slice(0, 500)
                    if (containsDecisionSignal(userMsg) && specialistId) {
                        const summary = extractDecisionSummary(userMsg, fullOutput.slice(0, 500))
                        await recordDecision(foundryId, specialistId, summary, userMsg.slice(0, 500))
                    }
                } catch {
                    // Non-critical — decision tracking is supplementary
                }

                // Track this interaction for trust level progression (fire-and-forget)
                recordInteraction(threadId!, foundryId).catch((err) => {
                    console.warn("[agents/execute] Failed to record interaction:", err)
                })

                // Process memory asynchronously (observe/reflect if thresholds hit)
                processMemory(threadId!, foundryId).catch((err) => {
                    console.warn("[agents/execute] Memory processing failed:", err)
                })

                // Knowledge extraction: extract atomic notes from the conversation
                // Runs asynchronously — doesn't block the response
                if (specialistId && foundryId) {
                    import("@/lib/knowledge-vault").then(({ extractKnowledge }) => {
                        const userMsg = input.trim() || finalPrompt.slice(0, 500)
                        extractKnowledge({
                            messages: [
                                { role: "user", content: userMsg },
                                { role: "assistant", content: cleanOutput || fullOutput },
                            ],
                            specialistId: specialistId!,
                            threadId: threadId!,
                            foundryId,
                        }).catch((err) => {
                            console.warn("[agents/execute] Knowledge extraction failed:", err)
                        })
                    }).catch(() => {
                        // Module loading failed — non-critical
                    })
                }
            } catch (err) {
                console.warn("[agents/execute] Failed to record assistant message:", err)
            }
            // AUDIT: Log usage after successful completion
            await logUsageAfterCompletion(fullOutput.length)
        }
        : async (fullOutput: string) => {
            // Even without memory thread, log usage for billing
            await logUsageAfterCompletion(fullOutput.length)
        }

    // Build the fallback chain for text modalities.
    // If the client sent modelTier, use that chain. Otherwise fall back to single-provider (no failover).
    const fallbackChain: ProviderTarget[] = modelTier
        ? FALLBACK_CHAINS[modelTier]
        : [{ providerId, modelId }]

    try {
        if (modality === "text") {
            return await handleTextStreaming(fallbackChain, finalPrompt, systemPromptWithContext, memoryCallback, enableThinking, conversationHistory)
        }
        if (modality === "slides") {
            // Slides use text generation with a structured output prompt (no conversation history needed)
            return await handleTextStreaming(fallbackChain, finalPrompt, SLIDES_SYSTEM_PROMPT, memoryCallback)
        }
        if (modality === "image") {
            const result = await handleImageGeneration(apiKey, providerId, modelId, finalPrompt)
            // Log usage for non-streaming modalities
            logUsageAfterCompletion(0).catch(() => {})
            return result
        }
        if (modality === "audio") {
            const result = await handleAudioGeneration(apiKey, providerId, modelId, finalPrompt)
            logUsageAfterCompletion(0).catch(() => {})
            return result
        }
        if (modality === "video") {
            const result = await handleVideoGeneration(apiKey, providerId, modelId, finalPrompt, videoConfig, firstFrameImage)
            logUsageAfterCompletion(0).catch(() => {})
            return result
        }

        return NextResponse.json({ error: `Unsupported modality: ${modality}` }, { status: 400 })
    } catch (err) {
        console.error(`[agents/execute] ${providerId}/${modality} error:`, err)
        return NextResponse.json(
            { error: "Failed to execute prompt" },
            { status: 500 }
        )
    }
}

// ─── Error Classification ────────────────────────────────────────────

/**
 * Classifies a raw streaming error into a user-friendly message.
 *
 * @description Maps provider-specific errors to actionable messages the
 * client can display. Never leaks API keys, internal paths, or raw
 * stack traces — only returns safe, helpful error descriptions.
 *
 * @param rawError - The raw error string from the provider or stream
 * @returns A user-friendly error message
 */
function classifyStreamError(rawError: string): string {
    const lower = rawError.toLowerCase()

    // Context window / prompt too long
    if (lower.includes("too many tokens") || lower.includes("context_length") || lower.includes("maximum context") || lower.includes("too long")) {
        return "The conversation is too long for this model. Try starting a new conversation or using a shorter message."
    }

    // Rate limiting from the AI provider
    if (lower.includes("rate_limit") || lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
        return "The AI provider is rate-limiting requests. Please wait a moment and try again."
    }

    // Authentication / API key issues
    if (lower.includes("authentication") || lower.includes("invalid api key") || lower.includes("unauthorized") || lower.includes("401")) {
        return "AI provider authentication failed. The platform API key may need to be updated."
    }

    // Provider overloaded
    if (lower.includes("overloaded") || lower.includes("503") || lower.includes("capacity") || lower.includes("server_error")) {
        return "The AI provider is temporarily overloaded. Please try again in a few seconds."
    }

    // Network / connection issues
    if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("timeout") || lower.includes("network") || lower.includes("fetch failed")) {
        return "Could not reach the AI provider. This is usually temporary — please try again."
    }

    // Content filtering / safety
    if (lower.includes("content_filter") || lower.includes("safety") || lower.includes("blocked") || lower.includes("content_policy")) {
        return "The response was blocked by the AI provider's content filter. Try rephrasing your message."
    }

    // Generic fallback — don't leak raw error details
    return "Stream interrupted. Please try sending your message again."
}

// ─── Text Streaming Handler (with Provider Failover) ─────────────────

/**
 * Streams a text generation response back to the client via SSE,
 * with automatic failover across providers in the fallback chain.
 *
 * @description Tries each provider in the chain sequentially. If the primary
 * provider throws a retryable error (503, rate limit, network) during stream
 * setup, the next provider in the chain is attempted. Mid-stream errors
 * (after chunks have already been sent) are NOT retried — the partial
 * response is abandoned and the error is surfaced to the client.
 *
 * @param chain - Ordered list of {providerId, modelId} to try
 * @param finalPrompt - The user prompt with placeholders resolved
 * @param customSystemPrompt - System prompt override
 * @param onComplete - Callback fired after streaming completes (for memory + usage logging)
 * @param enableThinking - When true, enables Anthropic extended thinking for deeper reasoning
 * @param history - Optional conversation history for multi-turn context
 *
 * @security Failover never leaves the declared chain. qwen-local chains
 * have no cloud fallbacks, preserving the privacy contract.
 */
async function handleTextStreaming(
    chain: ProviderTarget[],
    finalPrompt: string,
    customSystemPrompt?: string,
    onComplete?: (fullOutput: string) => Promise<void>,
    enableThinking?: boolean,
    history?: ConversationMessage[]
): Promise<Response> {
    // Convert ConversationMessage[] to ChatMessage[] for the provider (shared across attempts)
    const conversationHistory = history?.map((msg) => ({
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
    }))

    const encoder = new TextEncoder()
    let fullOutput = ""

    const readable = new ReadableStream({
        async start(controller) {
            let lastError = "No providers available"

            for (let i = 0; i < chain.length; i++) {
                const target = chain[i]
                const streamFn = getTextProvider(target.providerId)
                if (!streamFn) {
                    console.warn("[agents/execute] Provider does not support text:", target.providerId)
                    continue
                }

                const targetApiKey = resolveApiKeyForProvider(target.providerId)
                if (!targetApiKey) {
                    console.warn("[agents/execute] No API key for fallback provider:", target.providerId)
                    continue
                }

                // Extended thinking requires more output headroom
                const maxTokens = enableThinking ? 32768 : 16384
                // Extended thinking only works with Anthropic models
                const useThinking = enableThinking && target.providerId === "anthropic"

                if (i > 0) {
                    console.info("[agents/execute] Failover attempt:", {
                        attempt: i + 1,
                        from: `${chain[i - 1].providerId}/${chain[i - 1].modelId}`,
                        to: `${target.providerId}/${target.modelId}`,
                        reason: lastError,
                    })
                }

                try {
                    // Wrap streamFn in a promise so we can catch setup-phase errors
                    // and distinguish them from mid-stream errors.
                    await new Promise<void>((resolve, reject) => {
                        let hasStartedStreaming = false

                        streamFn({
                            apiKey: targetApiKey,
                            modelId: target.modelId,
                            systemPrompt: customSystemPrompt ?? SYSTEM_PROMPT,
                            userPrompt: finalPrompt,
                            conversationHistory,
                            maxTokens,
                            enableThinking: useThinking,
                            onChunk(text) {
                                hasStartedStreaming = true
                                fullOutput += text
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                            },
                            onDone() {
                                controller.enqueue(encoder.encode("data: [DONE]\n\n"))
                                controller.close()
                                if (onComplete && fullOutput) {
                                    onComplete(fullOutput).catch(() => {})
                                }
                                resolve()
                            },
                            onError(error) {
                                if (hasStartedStreaming) {
                                    // Mid-stream error — can't failover, surface to client
                                    console.error("[agents/execute] Mid-stream error (no failover):", {
                                        provider: target.providerId,
                                        model: target.modelId,
                                        error,
                                    })
                                    const errorDetail = classifyStreamError(error)
                                    controller.enqueue(
                                        encoder.encode(`data: ${JSON.stringify({ error: errorDetail })}\n\n`)
                                    )
                                    controller.close()
                                    resolve() // Resolve — we've handled it, no retry
                                } else {
                                    // Pre-stream error — candidate for failover
                                    reject(new Error(error))
                                }
                            },
                        }).catch(reject) // Catch promise-level rejections from the stream fn
                    })

                    // If we reach here, streaming completed successfully
                    if (i > 0) {
                        console.info("[agents/execute] Failover succeeded:", {
                            provider: target.providerId,
                            model: target.modelId,
                            attempt: i + 1,
                        })
                    }
                    return // Exit the ReadableStream start — response is streaming
                } catch (err) {
                    const errorStr = err instanceof Error ? err.message : String(err)
                    lastError = errorStr

                    if (isRetryableError(errorStr) && i < chain.length - 1) {
                        // Retryable error with more providers available — continue to next
                        console.warn("[agents/execute] Retryable error, trying next provider:", {
                            failedProvider: target.providerId,
                            failedModel: target.modelId,
                            error: errorStr,
                            remainingProviders: chain.length - i - 1,
                        })
                        continue
                    }

                    // Non-retryable error OR last provider in chain — surface to client
                    if (!isRetryableError(errorStr)) {
                        console.error("[agents/execute] Non-retryable error:", {
                            provider: target.providerId,
                            model: target.modelId,
                            error: errorStr,
                        })
                    } else {
                        console.error("[agents/execute] All providers exhausted:", {
                            chainLength: chain.length,
                            lastProvider: target.providerId,
                            lastError: errorStr,
                        })
                    }

                    const errorDetail = classifyStreamError(errorStr)
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ error: errorDetail })}\n\n`)
                    )
                    controller.close()
                    return
                }
            }

            // All providers skipped (no streamFn or no API key) — should be very rare
            console.error("[agents/execute] No viable provider in fallback chain:", {
                chain: chain.map(t => t.providerId),
                lastError,
            })
            const errorDetail = classifyStreamError(lastError)
            controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ error: errorDetail })}\n\n`)
            )
            controller.close()
        },
    })

    return new Response(readable, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    })
}

// ─── Image Generation Handler ────────────────────────────────────────

async function handleImageGeneration(
    apiKey: string,
    providerId: AIProviderId,
    modelId: string,
    finalPrompt: string
): Promise<Response> {
    const genFn = getImageProvider(providerId)
    if (!genFn) {
        return NextResponse.json(
            { error: `${PROVIDER_REGISTRY[providerId].name} does not support image generation` },
            { status: 400 }
        )
    }

    const result = await genFn({ apiKey, modelId, prompt: finalPrompt })
    return NextResponse.json({ modality: "image", imageUrl: result.imageUrl })
}

// ─── Audio Generation Handler ────────────────────────────────────────

async function handleAudioGeneration(
    apiKey: string,
    providerId: AIProviderId,
    modelId: string,
    finalPrompt: string
): Promise<Response> {
    const genFn = getAudioProvider(providerId)
    if (!genFn) {
        return NextResponse.json(
            { error: `${PROVIDER_REGISTRY[providerId].name} does not support audio generation` },
            { status: 400 }
        )
    }

    const result = await genFn({ apiKey, modelId, text: finalPrompt })
    return NextResponse.json({ modality: "audio", audioUrl: result.audioUrl })
}

// ─── Video Generation Handler ────────────────────────────────────────

/**
 * Handles video generation with optional configuration and first-frame image.
 *
 * @param videoConfig - Optional duration, resolution, and prompt optimizer settings
 * @param firstFrameImage - Optional image URL for Image-to-Video mode (I2V)
 */
async function handleVideoGeneration(
    apiKey: string,
    providerId: AIProviderId,
    modelId: string,
    finalPrompt: string,
    videoConfig?: { duration?: number; resolution?: string; promptOptimizer?: boolean },
    firstFrameImage?: string,
): Promise<Response> {
    const genFn = getVideoProvider(providerId)
    if (!genFn) {
        return NextResponse.json(
            { error: `${PROVIDER_REGISTRY[providerId].name} does not support video generation` },
            { status: 400 }
        )
    }

    const result = await genFn({
        apiKey,
        modelId,
        prompt: finalPrompt,
        duration: videoConfig?.duration,
        resolution: videoConfig?.resolution,
        promptOptimizer: videoConfig?.promptOptimizer,
        firstFrameImage,
    })
    return NextResponse.json({ modality: "video", videoUrl: result.videoUrl })
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Resolves the active foundry ID for a user.
 *
 * @param supabase - Authenticated Supabase client
 * @param userId - The authenticated user's ID
 * @returns The foundry ID, or null if not found
 */
async function resolveFoundryId(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string
): Promise<string | null> {
    const { data: profile } = await supabase
        .from("profiles")
        .select("foundry_id, active_foundry_id")
        .eq("id", userId)
        .single()

    return profile?.active_foundry_id || profile?.foundry_id || null
}
