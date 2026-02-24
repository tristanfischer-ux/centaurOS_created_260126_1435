/**
 * @file domain-knowledge.ts — Loads curated domain knowledge for specialist personalities.
 *
 * @description Each specialist has an optional markdown file in ./domain-knowledge/{specialist-id}.md
 * containing curated frameworks, methodologies, and mental models from world-class practitioners.
 * This knowledge is injected as the "YOUR EXPERTISE:" section in the personality prompt,
 * shaping how the specialist thinks and responds.
 *
 * @related
 * - Personality compiler: src/lib/agents/personality.ts
 * - Specialist definitions: src/app/(platform)/agents/specialists-data.ts
 * - Execute route: src/app/api/agents/execute/route.ts
 */

import { readFileSync } from "fs"
import { join } from "path"

// INTENT: Cache domain knowledge in memory after first load — these files never change at runtime.
const domainKnowledgeCache = new Map<string, string>()

/**
 * Loads the curated domain knowledge for a specialist.
 *
 * @param specialistId - The specialist identifier (e.g., "strategist", "cto")
 * @param fallback - Fallback text if no domain knowledge file exists (typically specialist.description)
 * @returns The domain knowledge markdown content, or the fallback string
 */
export function loadDomainKnowledge(specialistId: string, fallback?: string): string | undefined {
    // Check cache first
    const cached = domainKnowledgeCache.get(specialistId)
    if (cached) return cached

    try {
        const filePath = join(process.cwd(), "src", "lib", "agents", "domain-knowledge", `${specialistId}.md`)
        const content = readFileSync(filePath, "utf-8").trim()

        if (content) {
            domainKnowledgeCache.set(specialistId, content)
            return content
        }
    } catch {
        // DECISION: Silent fallback — missing file is not an error, just means no curated knowledge yet.
    }

    return fallback
}
