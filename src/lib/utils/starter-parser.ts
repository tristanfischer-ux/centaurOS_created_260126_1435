/**
 * @file starter-parser.ts
 *
 * @description Parses structured conversation starters from the STARTERS:
 * block in specialist greetings. Supports optional category + description
 * format: `[CATEGORY] prompt text | description`
 */

export type StarterDepth = 'quick' | 'medium' | 'deep'

export interface StructuredStarter {
    /** Category label (e.g., STRATEGY, FINANCE). Defaults to 'GENERAL'. */
    category: string
    /** The prompt text to send */
    prompt: string
    /** Optional description explaining what this starter does */
    description: string | null
    /** Estimated conversation depth */
    depth: StarterDepth
}

/**
 * Parses a STARTERS: block into structured starters.
 *
 * @description Supports two formats:
 * - Simple: `- prompt text`
 * - Structured: `- [CATEGORY] prompt text | description`
 *
 * @param startersBlock - Raw text of the STARTERS: block (lines after "STARTERS:")
 * @returns Parsed starters with categories and descriptions
 */
export function parseStarters(startersBlock: string): StructuredStarter[] {
    const lines = startersBlock
        .split('\n')
        .map((line) => line.replace(/^\s*-\s*/, '').trim())
        .filter((s) => s.length > 0)

    return lines.map((line) => {
        // Try to extract [CATEGORY] prefix
        const categoryMatch = line.match(/^\[([A-Z][A-Z0-9 _-]*)\]\s*(.+)$/i)
        const category = categoryMatch ? categoryMatch[1].toUpperCase() : 'GENERAL'
        const remainder = categoryMatch ? categoryMatch[2] : line

        // Try to extract description after |
        const pipeIdx = remainder.indexOf(' | ')
        const prompt = pipeIdx >= 0 ? remainder.slice(0, pipeIdx).trim() : remainder.trim()
        const description = pipeIdx >= 0 ? remainder.slice(pipeIdx + 3).trim() : null

        // Estimate depth by prompt length and keywords
        const depth = estimateDepth(prompt)

        return { category, prompt, description, depth }
    }).slice(0, 6)
}

function estimateDepth(prompt: string): StarterDepth {
    const lower = prompt.toLowerCase()
    const deepKeywords = ['analyze', 'strategy', 'plan', 'build', 'design', 'review', 'audit', 'evaluate']
    const quickKeywords = ['what', 'how much', 'when', 'status', 'check', 'quick']

    if (deepKeywords.some((kw) => lower.includes(kw))) return 'deep'
    if (quickKeywords.some((kw) => lower.includes(kw)) && prompt.length < 50) return 'quick'
    return 'medium'
}
