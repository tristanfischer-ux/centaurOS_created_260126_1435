/**
 * @file strip-think-tags.ts
 *
 * @description Strip <think>...</think> blocks from AI model responses.
 * MiniMax M2.5 and similar models emit chain-of-thought reasoning inline;
 * these utilities filter that content so users only see the final response.
 *
 * @related
 * - brief-specialist-dialog.tsx — streaming and final display
 * - text-chat-engine.ts — SSE response processing
 */

/**
 * Strip complete <think>...</think> blocks from AI responses.
 * Handles multiline content.
 *
 * @param text - Raw model output that may contain think blocks
 * @returns Text with think blocks removed
 */
export function stripThinkTags(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
}

/**
 * For streaming: hide content inside incomplete think blocks.
 * Removes complete blocks and truncates at any unclosed <think> tag.
 *
 * @param text - Partial streamed response
 * @returns Text safe to display (think content hidden)
 */
export function stripPartialThinkTags(text: string): string {
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "")
    const openIdx = cleaned.lastIndexOf("<think>")
    if (openIdx !== -1) {
        cleaned = cleaned.slice(0, openIdx)
    }
    return cleaned.trim()
}
