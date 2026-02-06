import type { CustomPrompt, PromptCategory } from "./agent-types"

const STORAGE_KEY = "forgeos-custom-prompts"

// ─── CRUD ────────────────────────────────────────────────────────────

export function loadCustomPrompts(): CustomPrompt[] {
    if (typeof window === "undefined") return []
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

export function saveCustomPrompts(prompts: CustomPrompt[]) {
    if (typeof window === "undefined") return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts))
}

export function addCustomPrompt(
    prompt: Omit<CustomPrompt, "id" | "isCustom" | "createdAt" | "updatedAt">
): CustomPrompt {
    const now = new Date().toISOString()
    const newPrompt: CustomPrompt = {
        ...prompt,
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        isCustom: true,
        createdAt: now,
        updatedAt: now,
    }
    const existing = loadCustomPrompts()
    existing.push(newPrompt)
    saveCustomPrompts(existing)
    return newPrompt
}

export function updateCustomPrompt(id: string, updates: Partial<CustomPrompt>): CustomPrompt | null {
    const prompts = loadCustomPrompts()
    const idx = prompts.findIndex((p) => p.id === id)
    if (idx === -1) return null

    prompts[idx] = {
        ...prompts[idx],
        ...updates,
        updatedAt: new Date().toISOString(),
    }
    saveCustomPrompts(prompts)
    return prompts[idx]
}

export function deleteCustomPrompt(id: string): boolean {
    const prompts = loadCustomPrompts()
    const filtered = prompts.filter((p) => p.id !== id)
    if (filtered.length === prompts.length) return false
    saveCustomPrompts(filtered)
    return true
}

export function getCustomPromptById(id: string): CustomPrompt | undefined {
    return loadCustomPrompts().find((p) => p.id === id)
}

// ─── Defaults for new custom prompt ──────────────────────────────────

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
