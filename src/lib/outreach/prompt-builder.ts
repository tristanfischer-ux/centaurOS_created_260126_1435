/**
 * @file prompt-builder.ts
 *
 * @description Builds structured prompts for Sal (sales specialist) to generate
 * cold email sequences. Composites campaign context, contact data, and knowledge
 * base entries into a prompt that requests JSON-formatted email output.
 *
 * @related
 * - Sal's personality: src/app/(platform)/agents/specialists-data.ts (sales-lead)
 * - Prompt library: src/app/(platform)/agents/lib/prompt-library.ts
 * - Server actions: src/actions/outreach.ts
 */

import type { Campaign, Contact, OutreachKBEntry } from "@/types/outreach"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromptInput {
    campaign: Campaign
    contact: Contact
    knowledgeBase: OutreachKBEntry[]
}

export interface ParsedEmail {
    sequence_position: number
    sequence_label: string
    subject: string
    subject_variants: string[]
    body: string
    send_delay_days: number
}

// ─── Prompt Builder ─────────────────────────────────────────────────────────

/**
 * Builds a complete outreach prompt for Sal to generate an email sequence.
 *
 * @param input - Campaign context, contact data, and knowledge base entries
 * @returns Structured prompt string requesting JSON email array
 */
export function buildOutreachPrompt({ campaign, contact, knowledgeBase }: PromptInput): {
    systemPrompt: string
    userPrompt: string
} {
    // Build KB context
    const kbContext = knowledgeBase.length > 0
        ? knowledgeBase.map(kb => `[${kb.category.toUpperCase()}] ${kb.title}:\n${kb.content}`).join("\n\n---\n\n")
        : "No knowledge base entries available. Use the campaign context and contact details to personalize."

    const systemPrompt = `You are Sal, an elite B2B sales outreach specialist. You combine Dan Kennedy's direct response copywriting with Alex Hormozi's value-first methodology. Your cold outreach doesn't feel like cold outreach — it feels like a gift from someone who can help.

CORE RULES:
- Never use: "I hope this email finds you well", "Just following up", "Circling back", "Touching base"
- Never start an email with "I" — always start with THEM
- Every email must stand alone (recipient may only read one)
- Use the prospect's first name only, never full name
- No exclamation marks in subject lines
- Use ONLY facts provided — never fabricate company details, metrics, or events
- Keep emails between 60-90 words (opener/value-add/case study) or 40-60 words (breakup)

OUTPUT FORMAT:
You MUST respond with ONLY a JSON array. No markdown, no explanation, no preamble.
Each object in the array represents one email in the sequence with these fields:
- sequence_position (number): 1, 2, 3, etc.
- sequence_label (string): "Opener", "Value-Add", "Case Study", "Breakup", etc.
- subject (string): Primary subject line
- subject_variants (string[]): 2 A/B test variant subject lines
- body (string): Full email body text
- send_delay_days (number): Days after the previous email (0 for first email)`

    const contactDetails = [
        `Name: ${contact.first_name} ${contact.last_name}`,
        contact.job_title && `Title: ${contact.job_title}`,
        contact.company_name && `Company: ${contact.company_name}`,
        contact.industry && `Industry: ${contact.industry}`,
        contact.company_size && `Company Size: ${contact.company_size}`,
        contact.funding_stage && `Funding Stage: ${contact.funding_stage}`,
        contact.tech_stack?.length > 0 && `Tech Stack: ${contact.tech_stack.join(", ")}`,
        contact.signals?.length > 0 && `Buying Signals: ${contact.signals.join(", ")}`,
        contact.pain_points?.length > 0 && `Pain Points: ${contact.pain_points.join(", ")}`,
        contact.research_brief && `Research Brief: ${contact.research_brief}`,
        contact.recommended_angle && `Recommended Angle: ${contact.recommended_angle}`,
    ].filter(Boolean).join("\n")

    const campaignContext = [
        `Campaign: ${campaign.name}`,
        `Tone: ${campaign.tone}`,
        `Sequence Length: ${campaign.sequence_length} emails`,
        campaign.product_context && `Product Context: ${campaign.product_context}`,
        campaign.icp_description && `ICP Description: ${campaign.icp_description}`,
        campaign.value_props?.length > 0 && `Value Propositions:\n${campaign.value_props.map((vp, i) => `  ${i + 1}. ${vp}`).join("\n")}`,
        campaign.case_studies?.length > 0 && `Case Studies:\n${campaign.case_studies.map((cs, i) => `  ${i + 1}. ${cs}`).join("\n")}`,
    ].filter(Boolean).join("\n")

    const userPrompt = `Generate a ${campaign.sequence_length}-email outreach sequence for this prospect.

── CAMPAIGN CONTEXT ──
${campaignContext}

── PROSPECT DETAILS ──
${contactDetails}

── KNOWLEDGE BASE ──
${kbContext}

Generate the ${campaign.sequence_length}-email sequence as a JSON array. Remember: ONLY output the JSON array, nothing else.`

    return { systemPrompt, userPrompt }
}

// ─── Research Prompt ────────────────────────────────────────────────────────

export interface ResearchResult {
    research_brief: string
    pain_points: string[]
    signals: string[]
    tech_stack: string[]
    recommended_angle: string
    score: number
    score_reasoning: string
}

/**
 * Builds a prompt for Sal to research a contact and produce enrichment data.
 */
export function buildResearchPrompt(contact: Contact, campaign: Campaign): {
    systemPrompt: string
    userPrompt: string
} {
    const systemPrompt = `You are Sal, an elite B2B sales researcher. Your job is to analyze a prospect and produce structured research that will power a cold email campaign. You combine publicly available signals with strategic sales intelligence.

OUTPUT FORMAT:
You MUST respond with ONLY a JSON object. No markdown, no explanation, no preamble.
The JSON object must have these fields:
- research_brief (string): 2-3 sentence summary of who this person is and why they're a good prospect
- pain_points (string[]): 2-5 likely pain points based on their role, company, and industry
- signals (string[]): 1-4 buying signals or triggers (growth, hiring, funding, tech changes, etc.)
- tech_stack (string[]): 0-5 likely technologies based on their company and role
- recommended_angle (string): The single best angle for a cold email approach
- score (number): 1-10 fit score for this campaign's ICP
- score_reasoning (string): 1-2 sentence explanation of the score`

    const contactDetails = [
        `Name: ${contact.first_name} ${contact.last_name}`,
        contact.job_title && `Title: ${contact.job_title}`,
        contact.company_name && `Company: ${contact.company_name}`,
        contact.email && `Email: ${contact.email}`,
        contact.linkedin_url && `LinkedIn: ${contact.linkedin_url}`,
        contact.industry && `Industry: ${contact.industry}`,
        contact.company_size && `Company Size: ${contact.company_size}`,
        contact.company_domain && `Domain: ${contact.company_domain}`,
        contact.funding_stage && `Funding Stage: ${contact.funding_stage}`,
    ].filter(Boolean).join("\n")

    const campaignContext = [
        campaign.product_context && `Product: ${campaign.product_context}`,
        campaign.icp_description && `ICP: ${campaign.icp_description}`,
        campaign.value_props?.length > 0 && `Value Props: ${campaign.value_props.join("; ")}`,
    ].filter(Boolean).join("\n")

    const userPrompt = `Research this prospect and produce enrichment data for a cold outreach campaign.

── PROSPECT ──
${contactDetails}

── CAMPAIGN CONTEXT ──
${campaignContext || "No campaign context provided. Infer from the prospect's details."}

Respond with ONLY the JSON object.`

    return { systemPrompt, userPrompt }
}

/**
 * Parses the AI research response into structured data.
 */
export function parseResearchResponse(aiOutput: string): ResearchResult {
    let jsonStr = aiOutput.trim()

    // Strip markdown code blocks if present
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim()
    }

    // Find the JSON object boundaries
    const objStart = jsonStr.indexOf("{")
    const objEnd = jsonStr.lastIndexOf("}")

    if (objStart === -1 || objEnd === -1 || objEnd <= objStart) {
        throw new Error("No valid JSON object found in AI research response")
    }

    jsonStr = jsonStr.slice(objStart, objEnd + 1)
    const parsed = JSON.parse(jsonStr)

    return {
        research_brief: String(parsed.research_brief || ""),
        pain_points: Array.isArray(parsed.pain_points) ? parsed.pain_points.map(String) : [],
        signals: Array.isArray(parsed.signals) ? parsed.signals.map(String) : [],
        tech_stack: Array.isArray(parsed.tech_stack) ? parsed.tech_stack.map(String) : [],
        recommended_angle: String(parsed.recommended_angle || ""),
        score: typeof parsed.score === "number" ? parsed.score : 5,
        score_reasoning: String(parsed.score_reasoning || ""),
    }
}

// ─── Response Parser ────────────────────────────────────────────────────────

/**
 * Extracts email objects from AI response text.
 * Handles both clean JSON and JSON embedded in markdown code blocks.
 *
 * @param aiOutput - Raw AI response text
 * @returns Array of parsed emails
 * @throws Error if no valid JSON array found
 */
export function parseSequenceResponse(aiOutput: string): ParsedEmail[] {
    // Try to find JSON array in the output
    let jsonStr = aiOutput.trim()

    // Strip markdown code blocks if present
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim()
    }

    // Find the JSON array boundaries
    const arrayStart = jsonStr.indexOf("[")
    const arrayEnd = jsonStr.lastIndexOf("]")

    if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
        throw new Error("No valid JSON array found in AI response")
    }

    jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1)

    const parsed = JSON.parse(jsonStr)

    if (!Array.isArray(parsed)) {
        throw new Error("Parsed response is not an array")
    }

    return parsed.map((email: Record<string, unknown>, index: number) => ({
        sequence_position: typeof email.sequence_position === "number" ? email.sequence_position : index + 1,
        sequence_label: String(email.sequence_label || ""),
        subject: String(email.subject || ""),
        subject_variants: Array.isArray(email.subject_variants)
            ? email.subject_variants.map(String)
            : [],
        body: String(email.body || ""),
        send_delay_days: typeof email.send_delay_days === "number" ? email.send_delay_days : (index === 0 ? 0 : 3),
    }))
}
