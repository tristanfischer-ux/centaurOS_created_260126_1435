/**
 * @file custom-prompts.ts
 *
 * @description Utility module for custom prompts. Provides conversion
 * between database rows (AgentCustomPromptRow) and the client-side
 * CustomPrompt type, plus lookup helpers that operate on in-memory arrays.
 *
 * Previously this module read/wrote localStorage directly. Now all
 * persistence goes through server actions in src/actions/agent-workflows.ts.
 */

import type { CustomPrompt, PromptCategory } from "./agent-types"
import type { AgentCustomPromptRow } from "@/actions/agent-workflows"

// ─── Conversion: DB row → client CustomPrompt ────────────────────────

/**
 * Convert a database row into the client-side CustomPrompt shape.
 *
 * @param row - Database row from agent_custom_prompts table
 * @returns CustomPrompt usable by components
 */
export function dbCustomPromptToLocal(row: AgentCustomPromptRow): CustomPrompt {
    return {
        id: row.id,
        title: row.title,
        description: row.description ?? "",
        category: (row.category ?? "strategy") as PromptCategory,
        icon: row.icon ?? "Sparkles",
        defaultPrompt: row.default_prompt ?? "",
        inputLabel: row.input_label ?? "Your input",
        outputLabel: row.output_label ?? "AI output",
        tags: (row.tags ?? []) as string[],
        suggestedNext: (row.suggested_next ?? []) as string[],
        isCustom: true,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

// ─── Lookup helpers (operate on in-memory arrays) ────────────────────

/**
 * Find a custom prompt by ID from a provided array.
 *
 * @param id - The prompt ID to look up
 * @param prompts - Array of CustomPrompt objects to search
 * @returns The matching CustomPrompt or undefined
 */
export function getCustomPromptById(
    id: string,
    prompts: CustomPrompt[] = []
): CustomPrompt | undefined {
    return prompts.find((p) => p.id === id)
}

// ─── Defaults for new custom prompt form ─────────────────────────────

export const DEFAULT_CUSTOM_PROMPT: Omit<CustomPrompt, "id" | "isCustom" | "createdAt" | "updatedAt"> = {
    title: "",
    description: "",
    category: "strategy" as PromptCategory,
    icon: "Sparkles",
    defaultPrompt: "",
    inputLabel: "Your input",
    outputLabel: "AI output",
    tags: [],
    suggestedNext: [],
}
