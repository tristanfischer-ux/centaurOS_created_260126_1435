/**
 * @file knowledge-extraction.ts — Post-conversation knowledge extraction.
 *
 * @description After each specialist conversation, extracts key facts using
 * heuristic pattern matching and stores them in the knowledge base.
 *
 * DECISION: Uses pattern matching rather than an LLM call for extraction.
 * This is simpler, cheaper, and faster. The patterns cover the most common
 * high-value facts a founder would share. Can be upgraded to LLM-based
 * extraction later if recall proves insufficient.
 */

import { upsertKnowledge, type KnowledgeType } from "./knowledge-base"

interface ExtractedFact {
    type: KnowledgeType
    key: string
    value: string
    confidence: number
}

/**
 * Extract knowledge from a conversation and persist to the knowledge base.
 *
 * @param foundryId - The foundry ID
 * @param specialistId - The specialist ID
 * @param threadId - The thread ID (for source tracking)
 * @param userMessage - The user's message
 * @param assistantResponse - The specialist's response
 */
export async function extractAndStoreKnowledge(
    foundryId: string,
    specialistId: string,
    threadId: string,
    userMessage: string,
    assistantResponse: string
): Promise<void> {
    try {
        const facts = extractFactsFromConversation(userMessage, assistantResponse)

        for (const fact of facts) {
            await upsertKnowledge(foundryId, specialistId, {
                knowledgeType: fact.type,
                key: fact.key,
                value: fact.value,
                confidence: fact.confidence,
                source: "conversation",
                sourceThreadId: threadId,
            })
        }

        if (facts.length > 0) {
            console.info(`[KnowledgeExtraction] Stored ${facts.length} facts for ${specialistId}`)
        }
    } catch (err) {
        console.warn("[KnowledgeExtraction] Failed:", err)
    }
}

/**
 * Extract structured facts from conversation text using pattern matching.
 *
 * @description Uses heuristic pattern matching to extract key facts without
 * requiring an additional LLM call. Looks for common patterns like:
 * - "Our revenue is..." / "We make..."
 * - "The team has..." / "We have X employees"
 * - "We decided to..." / "Let's go with..."
 * - Numbers with context (percentages, dollar amounts, counts)
 *
 * @param userMessage - The user's raw message text
 * @param _assistantResponse - The assistant response (reserved for future use)
 * @returns Array of extracted facts
 */
function extractFactsFromConversation(
    userMessage: string,
    _assistantResponse: string
): ExtractedFact[] {
    const facts: ExtractedFact[] = []

    // Revenue/financial patterns
    const revenueMatch = userMessage.match(/(?:revenue|ARR|MRR|making|earn)\s+(?:is\s+)?(?:about\s+)?(\$[\d,.]+[KkMmBb]?|\d+[KkMmBb])/i)
    if (revenueMatch) {
        facts.push({ type: "metric", key: "Revenue", value: revenueMatch[1], confidence: 0.9 })
    }

    // Team size
    const teamMatch = userMessage.match(/(?:we have|team (?:is|of)|(\d+)\s+(?:people|employees|team members|engineers|devs))/i)
    if (teamMatch) {
        const size = teamMatch[1] || userMessage.match(/(\d+)\s+(?:people|employees|team members)/i)?.[1]
        if (size) {
            facts.push({ type: "metric", key: "Team size", value: `${size} people`, confidence: 0.85 })
        }
    }

    // Funding
    const fundingMatch = userMessage.match(/(?:raised|funding|round)\s+(?:of\s+)?(\$[\d,.]+[KkMmBb]?)\s*(?:seed|series\s*[A-D]|pre-seed)?/i)
    if (fundingMatch) {
        facts.push({ type: "fact", key: "Funding", value: fundingMatch[0].trim(), confidence: 0.9 })
    }

    // Decisions (from user messages)
    const decisionPatterns = [
        /(?:we(?:'ve)? decided|let'?s go with|we'?re going (?:to|with)|I want to)\s+(.{10,100})/i,
    ]
    for (const pattern of decisionPatterns) {
        const match = userMessage.match(pattern)
        if (match) {
            facts.push({ type: "decision", key: `Decision: ${match[1].slice(0, 50)}`, value: match[1], confidence: 0.75 })
            break
        }
    }

    // Goals mentioned by user
    const goalMatch = userMessage.match(/(?:goal is|aiming for|target(?:ing)?|trying to)\s+(.{10,100})/i)
    if (goalMatch) {
        facts.push({ type: "goal", key: `Goal: ${goalMatch[1].slice(0, 50)}`, value: goalMatch[1], confidence: 0.7 })
    }

    // Preferences
    const prefMatch = userMessage.match(/(?:I (?:prefer|like|want)|please (?:always|don't|never))\s+(.{10,80})/i)
    if (prefMatch) {
        facts.push({ type: "preference", key: `Preference: ${prefMatch[1].slice(0, 50)}`, value: prefMatch[1], confidence: 0.8 })
    }

    return facts
}
