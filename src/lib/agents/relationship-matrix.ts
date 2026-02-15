/**
 * @file relationship-matrix.ts
 *
 * @description Compiles inter-specialist relationship dynamics into prompt
 * context for team meetings and council debates. This makes specialists
 * reference their working relationships naturally — creating genuine tension,
 * alignment, and collaboration patterns that feel like a real team.
 *
 * Instead of polite strangers, specialists have working relationships:
 * - Sam pushes for bold moves; Eli asks "can we afford it?"
 * - Zara wants to delete features; Priya wants to add them
 * - Nate and Mia are the revenue machine — pipeline + closing
 *
 * @related
 * - Specialist definitions: src/app/(platform)/agents/specialists-data.ts
 * - Team meeting: src/app/(platform)/agents/team-meeting-dialog.tsx
 * - Council: src/app/api/agents/council/route.ts
 */

import { getSpecialistById, SPECIALISTS } from "@/app/(platform)/agents/specialists-data"
import type { SpecialistId } from "@/app/(platform)/agents/specialists-data"

/**
 * Compiles the relationship context for a specialist in a multi-specialist
 * conversation (meeting or council debate).
 *
 * @description Generates a prompt block that tells the specialist how they
 * relate to each other participant. This creates natural dynamics:
 * - "Sam and I think alike on first principles" → aligned, builds on ideas
 * - "Eli keeps me honest on numbers" → creative tension, respectful pushback
 * - "I set direction; Dev executes" → complementary, delegation patterns
 *
 * @param specialistId - The specialist being prompted
 * @param participantIds - All specialist IDs in this conversation
 * @returns Compiled relationship context block, or empty string if no relationships defined
 */
export function compileRelationshipContext(
    specialistId: SpecialistId | string,
    participantIds: string[],
): string {
    const specialist = getSpecialistById(specialistId)
    if (!specialist) return ""

    const relationships = specialist.personality.relationships
    if (!relationships || Object.keys(relationships).length === 0) return ""

    const otherParticipants = participantIds.filter((id) => id !== specialistId)
    const relevantRelationships: string[] = []

    for (const otherId of otherParticipants) {
        const rel = relationships[otherId]
        if (rel) {
            const otherSpec = getSpecialistById(otherId)
            const otherName = otherSpec?.name ?? otherId
            relevantRelationships.push(`- **${otherName}**: ${rel.pattern} (dynamic: ${rel.dynamic})`)
        }
    }

    if (relevantRelationships.length === 0) return ""

    return `## Your Working Relationships in This Room
These are real working relationships — reference them naturally in discussion.
${relevantRelationships.join("\n")}`
}

/**
 * Compiles strong opinions context for a specialist when the meeting topic
 * intersects with one of their strongly-held positions.
 *
 * @description Checks if any of the specialist's strong opinions match
 * the meeting topic keywords. If so, injects the opinion as a behavioral
 * directive so the specialist argues their position with conviction.
 *
 * @param specialistId - The specialist being prompted
 * @param topic - The meeting/debate topic
 * @returns Compiled strong opinions block, or empty string if no match
 */
export function compileStrongOpinionsContext(
    specialistId: SpecialistId | string,
    topic: string,
): string {
    const specialist = getSpecialistById(specialistId)
    if (!specialist) return ""

    const opinions = specialist.personality.strongOpinions
    if (!opinions || opinions.length === 0) return ""

    const topicLower = topic.toLowerCase()
    const relevantOpinions = opinions.filter((op) => {
        const topicWords = op.topic.toLowerCase().split(/\s+/)
        return topicWords.some((word) => topicLower.includes(word))
    })

    if (relevantOpinions.length === 0) return ""

    const lines = relevantOpinions.map((op) => {
        const conviction = op.conviction === "high"
            ? "You feel strongly about this — argue it with conviction."
            : "You believe this but are open to being convinced otherwise."
        return `- On "${op.topic}": ${op.position}\n  ${conviction}`
    })

    return `## Your Strong Opinions on This Topic
These are positions you hold. If they're relevant to the discussion, voice them:
${lines.join("\n")}`
}

/**
 * Builds a complete inter-specialist dynamics block for team meetings
 * and council debates. Combines relationship context and strong opinions.
 *
 * @param specialistId - The specialist being prompted
 * @param participantIds - All specialist IDs in the conversation
 * @param topic - The meeting/debate topic
 * @returns Complete dynamics prompt block
 */
export function compileInterSpecialistDynamics(
    specialistId: SpecialistId | string,
    participantIds: string[],
    topic: string,
): string {
    const blocks: string[] = []

    const relationshipBlock = compileRelationshipContext(specialistId, participantIds)
    if (relationshipBlock) blocks.push(relationshipBlock)

    const opinionsBlock = compileStrongOpinionsContext(specialistId, topic)
    if (opinionsBlock) blocks.push(opinionsBlock)

    return blocks.join("\n\n")
}
