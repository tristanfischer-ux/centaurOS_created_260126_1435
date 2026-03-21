/**
 * @file speculative-prompt.ts
 *
 * @description Builds a lightweight system prompt for the "fast" model in
 * speculative dual-stream responses. The fast model serves two purposes:
 *
 * 1. **Simple questions**: Answer fully and naturally (fast model IS the answer)
 * 2. **Complex questions**: Provide a brief engaging acknowledgment while the
 *    deep model works in parallel
 *
 * The fast model self-classifies complexity via a hidden HTML comment tag
 * that the frontend strips and uses to decide whether to show the deep response.
 *
 * @related
 * - src/app/api/agents/execute/route.ts — Orchestrates parallel fast/deep calls
 * - src/lib/agents/personality.ts — Full personality compiler (deep model uses this)
 */

import type { AIProviderId } from "@/lib/ai-providers/types"

// INTENT: Gemini Flash is the ideal fast model — sub-300ms TTFB, very cheap,
// already configured as a fallback in the provider registry. gpt-5.3-instant is
// the backup if Gemini is unavailable.
export const FAST_MODEL_CHAIN: Array<{ providerId: AIProviderId; modelId: string }> = [
    { providerId: "google", modelId: "gemini-3.1-flash-lite" },
    { providerId: "openai", modelId: "gpt-5.3-instant" },
]

/**
 * Builds a trimmed system prompt for the speculative fast model.
 *
 * @param specialistName - Display name (e.g., "Sophia Chen, the Strategist")
 * @param specialistTitle - Role title (e.g., "Chief Strategy Officer")
 * @param workingStyle - One-line working style description
 * @param recentMessages - Last few conversation messages for minimal context
 * @returns System prompt string for the fast model
 */
export function buildSpeculativeFastPrompt(
    specialistName: string,
    specialistTitle: string,
    workingStyle: string,
    recentMessages?: Array<{ role: string; content: string }>,
): string {
    const contextBlock = recentMessages && recentMessages.length > 0
        ? `\n\n## Recent Conversation\n${recentMessages.map(m => `${m.role}: ${m.content}`).join("\n")}`
        : ""

    // DECISION: The prompt asks the fast model to self-classify rather than
    // using a separate classification call. This avoids extra latency while
    // leveraging the model's understanding of question complexity.
    return `You are ${specialistName}, ${specialistTitle}. ${workingStyle}

## Your Task

You are the FAST responder in a dual-model system. A deeper, more thorough model is working on a complete answer in parallel. Your job is to provide an INSTANT response.

### Decision Rules

**Answer fully if the question is:**
- A simple factual question with a clear answer
- A greeting, thank-you, or casual remark
- A short clarification that doesn't need deep analysis
- Something you can answer confidently in 2-3 sentences

When answering fully, write a natural, helpful response. Keep it concise but complete.

**Give a brief acknowledgment if the question:**
- Requires strategic analysis or multi-step reasoning
- Asks for a plan, framework, or detailed recommendation
- Needs data synthesis across multiple domains
- Would benefit from a thorough, structured response

When acknowledging, write 1-2 engaging sentences that show you understood the question and signal you're thinking deeply. Match your specialist personality. Examples:
- "Great question — there are several angles to consider here."
- "That's a critical strategic decision. Let me work through the implications."
- "I want to give you a thorough answer on this one."

### Complexity Tag (REQUIRED)

At the VERY END of your response, you MUST include exactly one of these hidden tags:
- <!--complexity:simple--> (you answered the question fully)
- <!--complexity:complex--> (you gave a brief acknowledgment; the deep model will provide the full answer)

This tag is stripped by the frontend and never shown to the user.${contextBlock}`
}

/**
 * Extracts the complexity classification from a fast model response.
 * Returns the clean response (tag stripped) and the complexity level.
 */
export function parseComplexityTag(response: string): {
    cleanResponse: string
    complexity: "simple" | "complex"
} {
    const simpleMatch = response.match(/<!--\s*complexity\s*:\s*simple\s*-->/)
    const complexMatch = response.match(/<!--\s*complexity\s*:\s*complex\s*-->/)

    let complexity: "simple" | "complex" = "complex"
    if (simpleMatch) complexity = "simple"
    else if (complexMatch) complexity = "complex"

    const cleanResponse = response
        .replace(/<!--\s*complexity\s*:\s*(simple|complex)\s*-->/g, "")
        .trim()

    return { cleanResponse, complexity }
}
