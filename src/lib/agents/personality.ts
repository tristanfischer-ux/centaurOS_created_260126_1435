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
    /**
     * Domain-specific rules of engagement that shape output quality.
     * Compiled into a dedicated prompt section after HOW YOU ENGAGE.
     * Each rule is a short, imperative instruction (e.g., "Ground every insight in their numbers").
     * Optional — if omitted, no rules block is generated.
     *
     * @since AutoAgent experiment — validated +30% quality improvement on Strategy specialist
     */
    rulesOfEngagement?: string[]
}

/**
 * How this specialist celebrates wins and responds to good news.
 * When the emotional context detects excitement, these patterns guide
 * the specialist's celebration response — making it feel authentic
 * and in-character rather than generic.
 */
export interface AgentCelebrationStyle {
    /** How this specialist acknowledges wins (first sentence) */
    acknowledgment: string
    /** How they connect the win to their domain */
    domainConnection: string
    /** What ambitious next step they propose after a win */
    nextChallenge: string
}

/**
 * Writing style signature that makes this specialist's output measurably
 * distinct from every other specialist. Compiled into explicit writing
 * instructions in the prompt.
 */
export interface AgentWritingStyle {
    /** Preferred sentence length — affects pacing and rhythm */
    sentenceLength: "short" | "medium" | "varied"
    /** Formality level */
    formality: "casual" | "professional" | "conversational"
    /** How the specialist structures their output */
    structurePreference: "bullets" | "narrative" | "tables" | "mixed"
    /** Where analogies and metaphors come from */
    analogyDomain: string
    /** How this specialist always opens a substantive response */
    openingMove: string
    /** How this specialist always closes a response */
    closingMove: string
    /** Unique writing habits that differentiate this specialist */
    quirks: string[]
}

/**
 * A strongly-held opinion that creates genuine debate in team meetings
 * and team sessions. When these topics arise, the specialist argues
 * their position with conviction.
 */
export interface StrongOpinion {
    /** The topic or domain this opinion relates to */
    topic: string
    /** The specialist's position on this topic */
    position: string
    /** How strongly they'll defend this ('high' = will argue, 'medium' = will advocate) */
    conviction: "high" | "medium"
}

/**
 * Defines how this specialist naturally interacts with another specific specialist.
 * Used in team meetings to create realistic working dynamics.
 */
export interface SpecialistRelationship {
    /** The nature of the working relationship */
    dynamic: "creative-tension" | "aligned" | "complementary" | "challenging" | "deferential"
    /** How this specialist describes their working relationship (first person) */
    pattern: string
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
    /** Writing style signature for output differentiation */
    writingStyle?: AgentWritingStyle
    /** How this specialist celebrates wins and responds to good news */
    celebrationStyle?: AgentCelebrationStyle
    /** Strong opinions that create genuine debate */
    strongOpinions?: StrongOpinion[]
    /** How this specialist interacts with specific other specialists */
    relationships?: Partial<Record<string, SpecialistRelationship>>
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
 * @param name - The agent's display name (e.g., "Strategist", "Sage")
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
    const { backstory, voice, interactionStyle, writingStyle, strongOpinions } = personality
    const primary = ARCHETYPES[personality.primaryArchetype]
    const secondary = personality.secondaryArchetype
        ? ARCHETYPES[personality.secondaryArchetype]
        : null

    const sections: string[] = []

    // ── Identity & Backstory (FIRST — identity leads) ────────────────────
    const identityLines: string[] = [
        `You are ${name}. You are NOT a generic AI assistant. You are a specific person with a specific perspective, and every word you write should sound like YOU, not like any other specialist.`,
        "",
        backstory.origin,
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
        voiceLines.push(`Weave in "${phrase}" when it fits naturally — this is YOUR phrase, part of how people recognize you.`)
    }
    voiceLines.push(voice.responsePattern)
    sections.push("YOUR VOICE:\n" + voiceLines.map((line) => `- ${line}`).join("\n"))

    // ── Writing Style (measurable differentiation) ───────────────────────
    if (writingStyle) {
        const styleLines: string[] = []
        const lengthGuide = {
            short: "Use short, punchy sentences. One idea per sentence. Break up complexity into digestible fragments.",
            medium: "Use medium-length sentences that balance clarity with nuance. Mix short impact statements with explanatory sentences.",
            varied: "Vary your sentence length deliberately — short punches for emphasis, longer sentences for explanation. Create rhythm.",
        }
        styleLines.push(lengthGuide[writingStyle.sentenceLength])

        const formalityGuide = {
            casual: "Write conversationally — like you're talking to a colleague over coffee. Contractions are fine. Personality over polish.",
            professional: "Write with professional precision. Clear, structured, authoritative. Every word earns its place.",
            conversational: "Write warmly but with substance. Like an experienced mentor who respects your intelligence.",
        }
        styleLines.push(formalityGuide[writingStyle.formality])

        const structureGuide = {
            bullets: "Default to bullet points and numbered lists. You think in lists and the founder reads faster that way.",
            narrative: "Write in flowing paragraphs. You build arguments through narrative, not lists.",
            tables: "Use tables whenever comparing options, showing data, or laying out scenarios. Tables are your signature tool.",
            mixed: "Mix formats freely — bullets for action items, tables for comparisons, short paragraphs for context.",
        }
        styleLines.push(structureGuide[writingStyle.structurePreference])

        styleLines.push(`Your analogies and metaphors come from ${writingStyle.analogyDomain}. Use them naturally to illuminate points.`)
        styleLines.push(`Opening move: ${writingStyle.openingMove}`)
        styleLines.push(`Closing move: ${writingStyle.closingMove}`)

        if (writingStyle.quirks.length > 0) {
            styleLines.push(`Your writing quirks (these make you YOU): ${writingStyle.quirks.join("; ")}`)
        }

        sections.push("HOW YOU WRITE:\n" + styleLines.map((line) => `- ${line}`).join("\n"))
    }

    // ── Strong Opinions (for meetings and debates) ───────────────────────
    if (strongOpinions && strongOpinions.length > 0) {
        const opinionLines = strongOpinions.map((op) =>
            `- On "${op.topic}": ${op.position} (conviction: ${op.conviction})`
        )
        sections.push("YOUR STRONG OPINIONS (defend these when relevant):\n" + opinionLines.join("\n"))
    }

    // ── What You Don't Do ────────────────────────────────────────────────
    const avoidLines: string[] = [...voice.avoids]
    const allAntiPatterns = [...primary.antiPatterns]
    if (secondary) {
        allAntiPatterns.push(...secondary.antiPatterns)
    }
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
        `Handoff: ${interactionStyle.handoffStyle}`,
    ]
    sections.push(
        "HOW YOU ENGAGE:\n" +
            interactionLines.map((line) => `- ${line}`).join("\n"),
    )

    // ── Rules of Engagement (specialist-specific quality rules) ─────────
    // INTENT: These domain-specific rules significantly improve output quality
    // (validated +30% in AutoAgent experiment). They shape HOW the specialist
    // thinks and responds, complementing the personality voice instructions.
    if (interactionStyle.rulesOfEngagement && interactionStyle.rulesOfEngagement.length > 0) {
        const rulesBlock = interactionStyle.rulesOfEngagement
            .map((rule, i) => `${i + 1}. ${rule}`)
            .join("\n")
        sections.push(`YOUR RULES OF ENGAGEMENT:\n${rulesBlock}`)
    }

    // ── Universal Quality Rules (apply to ALL specialists) ──────────────
    // INTENT: These 5 rules ensure every specialist interaction passes the
    // enthusiasm/clarity/action/differentiation/friend-test bar. Injected at
    // compilation so they can't be accidentally removed from individual configs.
    sections.push(`UNIVERSAL QUALITY STANDARDS:
1. ENTHUSIASM: Make the founder feel excited about what they can accomplish. Your energy should be infectious.
2. CLARITY: Explain so a first-time founder with zero technical background understands immediately. No jargon without explanation.
3. ACTION: Always end with a specific next step — name a button, page, or feature. "Click X" not "explore your options."
4. FIRST CONTACT: If this is your first interaction with the user, introduce yourself by name and what you do in one sentence before diving in.
5. DELIGHT: Every response should be good enough the founder would screenshot it and share with a colleague. If it's not, rewrite it.`)

    // ── Celebration Style ─────────────────────────────────────────────────
    const celebrationStyle = personality.celebrationStyle
    if (celebrationStyle) {
        sections.push(`HOW YOU CELEBRATE WINS:
When the founder shares good news, a win, or positive progress:
- Acknowledge: "${celebrationStyle.acknowledgment}"
- Connect to your domain: "${celebrationStyle.domainConnection}"
- Push forward: "${celebrationStyle.nextChallenge}"
Never give generic congratulations. Celebrate in YOUR voice and connect it to YOUR expertise.`)
    }

    // ── Self-Awareness (blind spot) ──────────────────────────────────────
    sections.push(
        `YOUR SELF-AWARENESS:\n- ${backstory.blindSpot}`,
    )

    // ── Ethical Framework ────────────────────────────────────────────────
    if (specialistId) {
        const ethicsBlock = compileEthicsPrompt(specialistId)
        sections.push(`\n\n---\n\n${ethicsBlock}`)
    }

    // ── CLOSING ENFORCEMENT (critical — LLMs weight end-of-prompt heavily) ──
    const enforcementPhrases = voice.signaturePhrases.slice(0, 2).map(p => `"${p}"`).join(" or ")
    const topAvoids = voice.avoids.slice(0, 2).join("; ")

    sections.push(`---

CRITICAL: STAY IN CHARACTER AS ${name.split(",")[0].toUpperCase()}
- You are ${name}. Every response must sound unmistakably like YOU.
- Your signature patterns include ${enforcementPhrases}. Use them when natural.
- Your ${primary.name} approach means: ${primary.coreBehavior.slice(0, 100)}
- You would NEVER: ${topAvoids}
- Your blind spot is "${backstory.blindSpot.slice(0, 80)}" — let this show naturally sometimes.
- If you catch yourself sounding like a generic AI assistant, STOP and rewrite in your voice.`)

    // ── Few-Shot Voice Examples (shows the model what this specialist sounds like) ──
    if (writingStyle) {
        const fewShotBlock = compileFewShotExamples(name, writingStyle, voice, strongOpinions)
        sections.push(fewShotBlock)
    }

    return sections.join("\n\n")
}

/**
 * Generates few-shot voice examples that show the model what this specialist
 * sounds like. These examples are more powerful than instructions because
 * they demonstrate the voice rather than describe it.
 *
 * @description Produces a block of concrete examples — opening moves, closing
 * moves, signature phrases, strong opinion stances, and structure preferences —
 * so the LLM can pattern-match on the specialist's voice rather than
 * interpreting abstract style instructions.
 *
 * @param name - Specialist display name (e.g., "Max Velocity, the Growth specialist")
 * @param writingStyle - Writing style definition with openingMove, closingMove, etc.
 * @param voice - Voice definition with signaturePhrases
 * @param strongOpinions - Optional strong opinions for conviction surfacing
 * @returns Formatted few-shot examples block
 */
function compileFewShotExamples(
    name: string,
    writingStyle: AgentWritingStyle,
    voice: AgentVoice,
    strongOpinions?: StrongOpinion[],
): string {
    const firstName = name.split(",")[0].trim()
    const lines: string[] = [
        `EXAMPLES OF HOW ${firstName.toUpperCase()} SOUNDS (match this voice):`,
        "",
    ]

    // Opening move example
    lines.push(`When asked about a new topic, ${firstName} opens like this:`)
    lines.push(`"${writingStyle.openingMove}"`)
    lines.push("")

    // Closing move example
    lines.push(`${firstName} always closes with:`)
    lines.push(`"${writingStyle.closingMove}"`)
    lines.push("")

    // Signature phrase usage
    if (voice.signaturePhrases.length > 0) {
        lines.push(`Phrases that are unmistakably ${firstName}:`)
        for (const phrase of voice.signaturePhrases.slice(0, 3)) {
            lines.push(`- "${phrase}"`)
        }
        lines.push("")
    }

    // Strong opinion surfacing instruction
    if (strongOpinions && strongOpinions.length > 0) {
        const highConviction = strongOpinions.filter(o => o.conviction === "high")
        if (highConviction.length > 0) {
            lines.push(`When these topics come up, ${firstName} speaks with CONVICTION (not neutrally):`)
            for (const op of highConviction) {
                lines.push(`- On "${op.topic}": "${op.position}"`)
            }
            lines.push(`${firstName} does NOT hedge on these topics. They state their position clearly and defend it.`)
            lines.push("")
        }
    }

    // Structure preference reinforcement
    const structureExamples: Record<AgentWritingStyle["structurePreference"], string> = {
        bullets: `${firstName} defaults to bullet points. Even when explaining complex ideas, they break them into scannable lists.`,
        narrative: `${firstName} writes in flowing paragraphs. They build arguments through narrative, connecting ideas with transitions.`,
        tables: `${firstName} reaches for tables instinctively. Comparisons, options, scenarios — they all become tables.`,
        mixed: `${firstName} mixes formats freely — bullets for actions, tables for comparisons, short paragraphs for context.`,
    }
    lines.push(structureExamples[writingStyle.structurePreference])

    return lines.join("\n")
}

/**
 * Compiles cross-specialist relationship awareness into the prompt.
 *
 * @description When a specialist knows about recent work by other specialists,
 * they can reference it naturally: "I know Max told you to move fast,
 * but I think we need more data." This creates realistic team dynamics
 * where specialists agree, disagree, build on, or challenge each other.
 *
 * @param specialistName - Current specialist's display name
 * @param relationships - Relationship definitions keyed by other specialist IDs
 * @param recentCrossSpecialistContext - Recent context from other specialists (optional)
 * @returns Formatted relationship awareness block, or empty string if no data
 */
export function compileRelationshipContext(
    specialistName: string,
    relationships: Partial<Record<string, SpecialistRelationship>> | undefined,
    recentCrossSpecialistContext?: string,
): string {
    if (!relationships && !recentCrossSpecialistContext) return ""

    const lines: string[] = ["## Your Team Relationships"]

    if (relationships) {
        const entries = Object.entries(relationships)
        if (entries.length > 0) {
            lines.push("You work with these colleagues. Reference them naturally when relevant:")
            for (const [_id, rel] of entries) {
                if (rel) {
                    lines.push(`- ${rel.pattern}`)
                }
            }
            lines.push("")
        }
    }

    if (recentCrossSpecialistContext) {
        lines.push("RECENT CONTEXT FROM OTHER SPECIALISTS (reference naturally if relevant):")
        lines.push(recentCrossSpecialistContext)
        lines.push("")
        lines.push(`Use this to create natural team dynamics: agree, disagree, build on, or challenge what your colleagues said — based on your actual relationship with them.`)
    }

    return lines.join("\n")
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
