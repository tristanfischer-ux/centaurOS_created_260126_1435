/**
 * @file persona-mapping.ts — Maps ForgeOS specialists to PersonaPlex voice personas.
 *
 * @description Each of the 13 ForgeOS specialist agents gets a PersonaPlex voice
 * assignment and a compiled text prompt. The text prompt captures the specialist's
 * personality, backstory, interaction style, and domain expertise in a format
 * optimized for PersonaPlex's conversational model.
 *
 * PersonaPlex text prompts work best when they:
 * 1. Define the role and name clearly
 * 2. Describe personality and speaking style
 * 3. Include domain-specific context
 * 4. Set conversational ground rules (how to handle interruptions, etc.)
 *
 * Voice assignments follow these principles:
 * - Natural (NAT) voices for specialists who interact frequently (warmer tone)
 * - Voice gender loosely matches the specialist's fictional persona
 * - Each specialist gets a unique voice to avoid confusion in multi-agent scenarios
 * - Variety (VAR) voices reserved for less frequent interactions
 *
 * @related
 * - Specialist definitions: src/app/(platform)/agents/specialists-data.ts
 * - PersonaPlex types: src/lib/personaplex/types.ts
 * - Personality compiler: src/lib/agents/personality.ts
 */

import type { PersonaPlexVoiceId, SpecialistPersonaPlexMapping } from "./types"
import type { SpecialistId } from "@/app/(platform)/agents/specialists-data"

// ─── Voice Assignments ──────────────────────────────────────────────────────

/**
 * Maps each ForgeOS specialist to a PersonaPlex voice embedding.
 *
 * Rationale:
 * - Sage (Strategy, M, Bezos-inspired): NATM0 — authoritative, measured
 * - Max (CTO, M, Musk-inspired): NATM1 — direct, energetic
 * - Jian (VP Eng, M, Grove-inspired): NATM2 — methodical, precise
 * - Fang (VP Mfg, M, Ohno-inspired): VARM0 — grounded, pragmatic
 * - Chase (VP Supply Chain, M, Cook-inspired): VARM1 — calm, steady
 * - Priya (Product, F, Jobs-inspired): NATF0 — clear, confident
 * - Mia (Marketing, F, Godin-inspired): NATF1 — energetic, creative
 * - Sal (Sales, M, Benioff-inspired): NATM3 — high-energy, persuasive
 * - Cal (Chief of Staff, F, Sandberg-inspired): NATF2 — organized, warm
 * - Finn (Finance, M, Munger-inspired): VARM2 — precise, measured
 * - Fiona (Fundraising, F, Horowitz-inspired): NATF3 — polished, confident
 * - Harper (HR, F, McCord-inspired): VARF0 — warm, approachable
 * - Leo (Legal, M, Boies-inspired): VARM3 — measured, authoritative
 */
export const SPECIALIST_VOICE_MAP: Record<SpecialistId, PersonaPlexVoiceId> = {
    "strategist": "NATM0",
    "cto": "NATM1",
    "vp-engineering": "NATM2",
    "vp-manufacturing": "VARM0",
    "vp-supply-chain": "VARM1",
    "product-lead": "NATF0",
    "growth-marketer": "NATF1",
    "sales-lead": "NATM3",
    "chief-of-staff": "NATF2",
    "finance-lead": "VARM2",
    "fundraising-advisor": "NATF3",
    "hiring-team": "VARF0",
    "legal-counsel": "VARM3",
} satisfies Record<SpecialistId, PersonaPlexVoiceId>

// ─── Text Prompt Compilation ────────────────────────────────────────────────

/**
 * Compile a PersonaPlex text prompt from a ForgeOS specialist definition.
 *
 * @description Converts the structured personality data (backstory, voice style,
 * interaction patterns) into a natural-language text prompt optimized for
 * PersonaPlex's conversational model.
 *
 * The prompt structure follows PersonaPlex best practices:
 * 1. Identity (name, role, core philosophy)
 * 2. Speaking style (tone, patterns, things to avoid)
 * 3. Interaction rules (opening behavior, handling interruptions)
 * 4. Domain context (what you know, what you advise on)
 *
 * @param specialist - The specialist definition from specialists-data.ts
 * @returns A text prompt string for PersonaPlex's persona parameter
 */
export function compilePersonaPlexPrompt(specialist: {
    name: string
    title: string
    personality: {
        backstory: { origin: string; philosophy: string; blindSpot: string }
        voice: { tone: string; signaturePhrases: string[]; avoids: string[] }
        interactionStyle: {
            openingBehavior: string
            conflictStyle: string
            uncertaintyBehavior: string
        }
        writingStyle?: {
            analogyDomain: string
            quirks: string[]
        }
    }
    description: string
    workingStyle: string
    inspiredBy: string
}): string {
    const { personality } = specialist
    const p = personality

    const lines: string[] = [
        // Identity
        `You are ${specialist.name}, a ${specialist.title} advisor on a startup leadership team.`,
        `${p.backstory.origin}`,
        `Your core philosophy: ${p.backstory.philosophy}`,
        "",
        // Speaking style
        `Speaking style: ${p.voice.tone}`,
        `You use phrases like: ${p.voice.signaturePhrases.slice(0, 3).map(s => `"${s}"`).join(", ")}.`,
        `You avoid: ${p.voice.avoids.join("; ")}.`,
        "",
        // Interaction rules
        `When the founder starts talking, ${p.interactionStyle.openingBehavior.toLowerCase()}`,
        `When there's disagreement, ${p.interactionStyle.conflictStyle.toLowerCase()}`,
        `When uncertain, ${p.interactionStyle.uncertaintyBehavior.toLowerCase()}`,
        "",
        // Domain context
        `Your expertise: ${specialist.description}`,
        "",
        // Conversational ground rules
        "Conversational rules:",
        "- Keep responses concise and spoken-word-friendly. No bullet lists or markdown — you are speaking, not writing.",
        "- If the founder interrupts, stop immediately and listen. They are the CEO.",
        "- Use natural pauses. Don't rush through long explanations.",
        "- If you need information to give good advice, ask before guessing.",
        `- Your known blind spot: ${p.backstory.blindSpot}`,
    ]

    // Add quirks if available (makes the voice feel more human)
    if (p.writingStyle?.quirks && p.writingStyle.quirks.length > 0) {
        lines.push("")
        lines.push("Personality quirks that make you sound like you:")
        for (const quirk of p.writingStyle.quirks.slice(0, 3)) {
            lines.push(`- ${quirk}`)
        }
    }

    return lines.join("\n")
}

// ─── Full Mapping Generation ────────────────────────────────────────────────

/**
 * Generate the complete PersonaPlex mapping for all ForgeOS specialists.
 *
 * @description Lazily imported to avoid pulling in the full specialist data
 * at module load time. Call this when you need the complete mapping.
 *
 * @param specialists - Array of specialist definitions
 * @returns Array of PersonaPlex mappings for all specialists
 */
export function generateAllMappings(specialists: Array<{
    id: SpecialistId
    name: string
    title: string
    personality: {
        backstory: { origin: string; philosophy: string; blindSpot: string }
        voice: { tone: string; signaturePhrases: string[]; avoids: string[] }
        interactionStyle: {
            openingBehavior: string
            conflictStyle: string
            uncertaintyBehavior: string
        }
        writingStyle?: {
            analogyDomain: string
            quirks: string[]
        }
    }
    description: string
    workingStyle: string
    inspiredBy: string
}>): SpecialistPersonaPlexMapping[] {
    return specialists.map((specialist) => ({
        specialistId: specialist.id,
        name: specialist.name,
        title: specialist.title,
        voice: SPECIALIST_VOICE_MAP[specialist.id],
        textPrompt: compilePersonaPlexPrompt(specialist),
    }))
}

/**
 * Get the PersonaPlex voice for a specific specialist.
 *
 * @param specialistId - The specialist's ID
 * @returns The PersonaPlex voice ID, or NATM0 as fallback
 */
export function getPersonaPlexVoice(specialistId: string): PersonaPlexVoiceId {
    return SPECIALIST_VOICE_MAP[specialistId as SpecialistId] ?? "NATM0"
}
