/**
 * @file post-response-handler.ts — Post-response callback factory for specialist conversations.
 *
 * @description After the SSE stream completes, the execute route runs a callback that:
 *   1. Saves the assistant response to the memory thread (stripped of internal directives)
 *   2. Detects and records decisions from the conversation
 *   3. Records the interaction for trust level progression
 *   4. Triggers async memory processing (observe/reflect cycles)
 *   5. Extracts knowledge notes for the Knowledge Vault
 *   6. Logs AI usage for billing
 *   7. Records rollout spans for tracing
 *
 * All operations are independently failable — none blocks the response or crashes
 * the specialist if they fail. The callback runs after the response stream has already
 * been sent to the client.
 *
 * @audit Extracted 2026-02-19 from src/app/api/agents/execute/route.ts
 *        (refactor step 7 of 8). No logic changes — code moved verbatim.
 *        The execute route now calls createPostResponseCallback() which returns
 *        the callback function with the same closure variables passed explicitly.
 *
 * @related
 * - Execute route: src/app/api/agents/execute/route.ts (sole consumer)
 * - Memory: src/lib/agent-memory.ts (conversation storage, observe/reflect)
 * - Decision journal: src/lib/agents/decision-journal.ts (decision tracking)
 * - Knowledge Vault: src/lib/knowledge-vault.ts (knowledge extraction)
 */

import {
    addMemoryMessage,
    processMemory,
} from "@/lib/agent-memory"
import {
    containsDecisionSignal,
    extractDecisionSummary,
    recordDecision,
} from "@/lib/agents/decision-journal"
import { recordInteraction } from "@/lib/agents/founder-preferences"
import { addSpan, finishRollout } from "@/lib/agent-spans"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * All the context needed to construct the post-response callback.
 * These are the closure variables that the inline callback in the
 * execute route previously captured implicitly.
 */
export interface PostResponseContext {
    /** Authenticated Supabase client for usage logging */
    supabase: SupabaseClient
    /** Authenticated user ID */
    userId: string
    /** Foundry ID (null if anonymous — skips most post-processing) */
    foundryId: string | null
    /** Memory thread ID (null if no thread exists — skips memory operations) */
    threadId: string | null | undefined
    /** Specialist ID (null if non-specialist conversation) */
    specialistId: string | null | undefined
    /** The user's raw input text */
    input: string
    /** The assembled final prompt */
    finalPrompt: string
    /** The assembled system prompt (for token estimation) */
    systemPromptWithContext: string
    /** Output modality (text, image, etc.) */
    modality: string
    /** AI provider ID */
    providerId: string
    /** Model ID */
    modelId: string
    /** Whether the user used their own API key */
    keySource: string
    /** Rollout ID for tracing (null if tracing disabled) */
    rolloutId: string | null
}

/**
 * Creates a post-response callback for the execute route's SSE stream.
 *
 * @description Factory function that takes the execution context and returns
 * a callback that handles all post-stream operations. Each operation is wrapped
 * in its own try/catch — failures are logged but never propagated.
 *
 * @param ctx - The execution context captured from the request handler
 * @returns An async function that accepts the full output string
 */
export function createPostResponseCallback(
    ctx: PostResponseContext,
): (fullOutput: string) => Promise<void> {
    const {
        supabase, userId, foundryId, threadId, specialistId,
        input, finalPrompt, systemPromptWithContext,
        modality, providerId, modelId, keySource, rolloutId,
    } = ctx

    return async (fullOutput: string): Promise<void> => {
        // Memory operations (only when thread + foundry exist)
        if (threadId && foundryId) {
            try {
                let cleanOutput = fullOutput.replace(/NEXT_SPECIALIST:\s*\S+\s*\|.*/i, "").trim()
                cleanOutput = cleanOutput.replace(/<!--\s*PROPOSED_ACTIONS\s*[\s\S]*?\s*-->/gi, "").trim()
                await addMemoryMessage(threadId, foundryId, "assistant", cleanOutput || fullOutput)

                try {
                    const userMsg = input.trim() || finalPrompt.slice(0, 500)
                    if (containsDecisionSignal(userMsg) && specialistId) {
                        const summary = extractDecisionSummary(userMsg, fullOutput.slice(0, 500))
                        await recordDecision(foundryId, specialistId, summary, userMsg.slice(0, 500))
                    }
                } catch {
                    // Non-critical — decision tracking is supplementary
                }

                recordInteraction(threadId, foundryId).catch((err) => {
                    console.warn("[PostResponse] Failed to record interaction:", err)
                })

                processMemory(threadId, foundryId).catch((err) => {
                    console.warn("[PostResponse] Memory processing failed:", err)
                })

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
                            console.warn("[PostResponse] Knowledge extraction failed:", err)
                        })
                    }).catch(() => {})
                }
            } catch (err) {
                console.warn("[PostResponse] Failed to record assistant message:", err)
            }
        }

        // Usage logging (requires foundry for billing)
        if (foundryId) {
            try {
                const estimatedInputTokens = Math.ceil((finalPrompt.length + systemPromptWithContext.length) / 4)
                const estimatedOutputTokens = Math.ceil(fullOutput.length / 4)
                const totalTokens = estimatedInputTokens + estimatedOutputTokens

                await supabase.from("ai_usage_log").insert({
                    user_id: userId,
                    foundry_id: foundryId,
                    feature: `specialist-${modality}`,
                    model: `${providerId}/${modelId}`,
                    prompt_tokens: estimatedInputTokens,
                    completion_tokens: estimatedOutputTokens,
                    total_tokens: totalTokens,
                    estimated_cost_usd: 0,
                    key_source: keySource,
                    metadata: { modality, providerId, modelId },
                })
            } catch (err) {
                console.warn("[PostResponse] Failed to log usage:", err)
            }
        }

        // Rollout tracing
        if (rolloutId) {
            const estimatedInputTokens = Math.ceil((finalPrompt.length + systemPromptWithContext.length) / 4)
            const estimatedOutputTokens = Math.ceil(fullOutput.length / 4)
            const promptSnapshot = `${systemPromptWithContext}\n\n---\n\n${finalPrompt}`
            addSpan({
                rolloutId,
                kind: "llm_call",
                promptSnapshot,
                responseSnapshot: fullOutput,
                promptTokens: estimatedInputTokens,
                completionTokens: estimatedOutputTokens,
                metadata: { modality, providerId, modelId },
            }).catch(() => {})
            finishRollout(rolloutId, "finished").catch(() => {})
        }
    }
}
