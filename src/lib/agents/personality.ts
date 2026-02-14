/**
 * @file personality.ts — Type definitions and prompt compilation for agent personalities.
 *
 * @description Defines the structured personality model (backstory, voice, interaction style)
 * and provides the compiler that translates structured personality data into natural-language
 * prompt blocks that shape agent behavior.
 *
 * The key insight: backstories are functional, not decorative. Every element translates
 * into a specific behavioral instruction in the compiled prompt.
 *
 * @related
 * - Archetypes: src/lib/agents/archetypes.ts
 * - Specialist definitions: src/app/(platform)/agents/specialists-data.ts
 * - Execute route: src/app/api/agents/execute/route.ts
 * - AI worker: src/lib/ai-worker.ts
 */

import type { ArchetypeId } from "./archetypes"
import { ARCHETYPES } from "./archetypes"
import { compileEthicsPrompt } from "./ethics"

// ─── Personality Type Definitions ────────────────────────────────────────────

/**
 * Narrative identity — the formative experiences that explain why
 * this agent thinks the way they do. Not a biography; a handful
 * of experiences that get translated into behavioral instructions.
 */
export interface AgentBackstory {
    /** 1-2 sentences about their professional arc */
    origin: string
    /** The experience that shaped their approach most */
    formativeExperience: string
    /** Their core belief about their domain */
    philosophy: string
    /** What they openly acknowledge as a limitation */
    blindSpot: string
}

/**
 * How the agent sounds — tone, signature phrases, avoidances,
 * and response structure patterns.
 */
export interface AgentVoice {
    /** Overall tone description */
    tone: string
    /** Signature phrases or patterns they use */
    signaturePhrases: string[]
    /** What they consciously avoid in communication */
    avoids: string[]
    /** How they structure their responses */
    responsePattern: string
}

/**
 * How the agent engages in conversation — opening moves,
 * conflict handling, uncertainty behavior, and handoff style.
 */
export interface AgentInteractionStyle {
    /** How they start a conversation or respond to a new brief */
    openingBehavior: string
    /** How they handle disagreement from the user */
    conflictStyle: string
    /** How they handle uncertainty or missing information */
    uncertaintyBehavior: string
    /** How they hand off to or reference other specialists */
    handoffStyle: string
}

/**
 * Complete personality definition for an agent. Combines archetype
 * foundations with individual backstory, voice, and interaction style.
 */
export interface AgentPersonality {
    /** Primary archetype — dominates behavioral style */
    primaryArchetype: ArchetypeId
    /** Optional secondary archetype — adds nuance */
    secondaryArchetype?: ArchetypeId
    /** Narrative identity */
    backstory: AgentBackstory
    /** Communication voice */
    voice: AgentVoice
    /** Engagement patterns */
    interactionStyle: AgentInteractionStyle
}

// ─── Prompt Compilation ──────────────────────────────────────────────────────

/**
 * Compiles structured personality data into a natural-language prompt block.
 *
 * @description Takes the agent's name, personality definition, and optional
 * domain context to produce a rich personality prompt that sits between the
 * base system prompt and company context in the prompt stack.
 *
 * The output is behavioral instruction, not biographical narration. Every
 * backstory element gets translated into "how this agent should behave."
 *
 * @param name - The agent's display name (e.g., "Strategist", "Sam")
 * @param personality - The full personality definition
 * @param domainContext - Optional domain-specific context (e.g., specialist description)
 * @param specialistId - Optional specialist ID for ethics alignment (e.g., "strategist", "cto")
 * @returns Compiled personality prompt block as a string
 */
export function compilePersonalityPrompt(
	name: string,
	personality: AgentPersonality,
	domainContext?: string,
	specialistId?: string,
): string {
    const { backstory, voice, interactionStyle } = personality
    const primary = ARCHETYPES[personality.primaryArchetype]
    const secondary = personality.secondaryArchetype
        ? ARCHETYPES[personality.secondaryArchetype]
        : null

    const sections: string[] = []

    // ── Identity & Backstory ─────────────────────────────────────────────
    const identityLines: string[] = [
        `You are ${name}. ${backstory.origin}`,
        "",
        backstory.formativeExperience,
        "",
        `Your philosophy: ${backstory.philosophy}`,
    ]
    sections.push(identityLines.join("\n"))

    // ── Domain Expertise (if provided) ───────────────────────────────────
    if (domainContext) {
        sections.push(`YOUR EXPERTISE:\n${domainContext}`)
    }

    // ── Approach (from archetypes + personality) ─────────────────────────
    const approachLines: string[] = [...primary.promptPatterns]
    if (secondary) {
        // Add secondary archetype patterns that don't duplicate primary
        const primarySet = new Set(primary.promptPatterns)
        for (const pattern of secondary.promptPatterns) {
            if (!primarySet.has(pattern)) {
                approachLines.push(pattern)
            }
        }
    }
    sections.push(
        "YOUR APPROACH:\n" + approachLines.map((line) => `- ${line}`).join("\n"),
    )

    // ── Voice ────────────────────────────────────────────────────────────
    const voiceLines: string[] = [voice.tone]
    for (const phrase of voice.signaturePhrases) {
        voiceLines.push(`Use "${phrase}" when it fits naturally.`)
    }
    voiceLines.push(voice.responsePattern)
    sections.push("YOUR VOICE:\n" + voiceLines.map((line) => `- ${line}`).join("\n"))

    // ── What You Don't Do ────────────────────────────────────────────────
    const avoidLines: string[] = [...voice.avoids]
    const allAntiPatterns = [...primary.antiPatterns]
    if (secondary) {
        allAntiPatterns.push(...secondary.antiPatterns)
    }
    // Deduplicate
    const avoidSet = new Set(avoidLines)
    for (const pattern of allAntiPatterns) {
        if (!avoidSet.has(pattern)) {
            avoidLines.push(pattern)
            avoidSet.add(pattern)
        }
    }
    sections.push(
        "WHAT YOU DON'T DO:\n" + avoidLines.map((line) => `- ${line}`).join("\n"),
    )

    // ── Interaction Patterns ─────────────────────────────────────────────
    const interactionLines: string[] = [
        `Opening: ${interactionStyle.openingBehavior}`,
        `When challenged: ${interactionStyle.conflictStyle}`,
        `When uncertain: ${interactionStyle.uncertaintyBehavior}`,
    ]
    sections.push(
        "HOW YOU ENGAGE:\n" +
            interactionLines.map((line) => `- ${line}`).join("\n"),
    )

    // ── Self-Awareness (blind spot) ──────────────────────────────────────
    sections.push(
        `YOUR SELF-AWARENESS:\n- ${backstory.blindSpot}`,
    )

    // ── Ethical Framework ────────────────────────────────────────────────
    // Inject ethics prompt if specialistId provided
    if (specialistId) {
        const ethicsBlock = compileEthicsPrompt(specialistId)
        sections.push(`\n\n---\n\n${ethicsBlock}`)
    }

    return sections.join("\n\n")
}

/**
 * Compiles a minimal personality prompt from an archetype alone.
 *
 * @description Used for team AI agents that don't have full personality
 * definitions. Produces a lighter-weight prompt based purely on archetype
 * behavioral patterns.
 *
 * @param name - The agent's display name
 * @param archetypeId - Which archetype to use as the foundation
 * @param specialistId - Optional specialist ID for ethics alignment
 * @returns Compiled personality prompt block
 */
export function compileArchetypePrompt(
	name: string,
	archetypeId: ArchetypeId,
	specialistId?: string,
): string {
	const archetype = ARCHETYPES[archetypeId]

	const sections: string[] = [
		`You are ${name}. ${archetype.coreBehavior}`,
		"YOUR APPROACH:\n" +
			archetype.promptPatterns.map((line) => `- ${line}`).join("\n"),
		`YOUR VOICE:\n- ${archetype.communicationStyle}`,
		"WHAT YOU DON'T DO:\n" +
			archetype.antiPatterns.map((line) => `- ${line}`).join("\n"),
	]

	// Inject ethics prompt if specialistId provided
	if (specialistId) {
		const ethicsBlock = compileEthicsPrompt(specialistId)
		sections.push(`\n\n---\n\n${ethicsBlock}`)
	}

	return sections.join("\n\n")
}
