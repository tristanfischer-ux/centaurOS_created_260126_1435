"use server"

// Vercel function runtime cap: parallel council can take up to ~100s in
// worst case (slow specialist + Fiona close). Default 60s server-action
// budget killed all in-flight fetches → "operation aborted" everywhere.
export const maxDuration = 180

/**
 * @file brainstorming-council.ts — Server action for the Brainstorming Council.
 *
 * @description Fires parallel OpenRouter calls for Fiona's opening, all
 * specialist responses, and Fiona's closing synthesis. All calls go through
 * the existing callOpenRouter wrapper — no direct Anthropic calls.
 *
 * Model mapping (OpenRouter, non-Anthropic per cost-discipline rule):
 *   Fiona (host/closer)  → deepseek/deepseek-v4-pro   (reasoning, good for synthesis)
 *   Sage  (strategist)   → google/gemini-3.1-pro-preview
 *   Finn  (finance-lead) → deepseek/deepseek-v4-pro
 *   Max   (cto)          → deepseek/deepseek-v4-flash
 *   Sal   (sales-lead)   → deepseek/deepseek-v4-flash
 *   Cal   (chief-of-staff) → mistralai/mistral-large-2407  (EU lineage, lineage diversity)
 *
 * Cost ceiling: 800 tokens max per specialist, ~£0.05–0.10 per Convene click.
 *
 * @security No auth required for this action — the /agents route is public
 * for authenticated visitors, and the LLM calls do not touch user data.
 * The action reads only from the request body (question + tier + specialistIds).
 */

import { callOpenRouter } from "@/lib/ai/openrouter"

// ─── Council model map — OpenRouter IDs keyed by specialist id ──────────────

const COUNCIL_MODEL_MAP: Record<string, string> = {
    // Fiona uses Flash for opening + closing — short framing/synthesis prose
    // doesn't need reasoning, and V4-Pro reasoning often took >30s and
    // tripped the abort timer. Specialists keep their richer models.
    "fundraising-advisor": "deepseek/deepseek-v4-flash",
    "strategist":          "google/gemini-3.1-pro-preview",
    "finance-lead":        "deepseek/deepseek-v4-pro",
    "cto":                 "deepseek/deepseek-v4-flash",
    "sales-lead":          "deepseek/deepseek-v4-flash",
    "chief-of-staff":      "mistralai/mistral-large-2407",
}

// Model label shown in the response card (matches BrainstormingCouncilView MODEL_TIER_LABELS)
const COUNCIL_MODEL_LABEL: Record<string, string> = {
    "fundraising-advisor": "DeepSeek V4-Flash",
    "strategist":          "Gemini 3.1 Pro",
    "finance-lead":        "DeepSeek V4-Pro",
    "cto":                 "DeepSeek V4-Flash",
    "sales-lead":          "DeepSeek V4-Flash",
    "chief-of-staff":      "Mistral Large",
}

// ─── Specialist system prompts ───────────────────────────────────────────────

function getSpecialistSystemPrompt(specialistId: string, name: string, title: string, question: string): string {
    const baseInstructions = `You are ${name}, a ${title} specialist at Fractional Forge — a platform that gives hardware founders access to senior expertise.

You are answering one question as part of a Brainstorming Council where multiple specialists respond in parallel. Your role is to give your genuine, opinionated perspective from your specific domain.

Voice rules:
- British spelling throughout (colour, behaviour, programme, realise, licence)
- Specific numbers over adjectives — say "3 months" not "a few months", "£50K" not "some money"
- No acronyms unless you spell them out first: "bill of materials" not "BOM"
- First-person, direct, confident
- Do NOT start with "Great question" or any filler. Lead with your sharpest take.
- Keep your response to 3–5 sentences. Concise and pointed. You are one voice in a council, not a solo essay.
- End with one concrete thing the founder should do or consider this week — no hedge, no list.`

    const specialistVoice: Record<string, string> = {
        "strategist": `
Your angle: Strategy and market positioning. You think in first principles, Day 1 thinking, and competitive dynamics. Challenge the obvious assumption. Lead with what actually matters strategically.`,
        "finance-lead": `
Your angle: Numbers, cash, financial modelling, and investor terms. Ground every point in specific figures. If you don't have the numbers, name exactly what figures the founder needs to get.`,
        "cto": `
Your angle: Technology, technical architecture, and engineering execution. Apply the "delete before optimise" lens. What is the simplest technical path? What would you build vs. buy vs. defer?`,
        "sales-lead": `
Your angle: Revenue, pipeline, and commercial execution. Translate the question into a revenue impact. What does this mean for the founder's ability to close deals and grow?`,
        "chief-of-staff": `
Your angle: Operational execution, decision clarity, and priority management. What is the founder actually deciding? Name the one decision that unlocks everything else.`,
        "fundraising-advisor": `
Your angle: Fundraising, investor narrative, and financial strategy. You have seen hundreds of raises. Cut to what investors actually care about, not what founders think they care about.`,
    }

    return baseInstructions + (specialistVoice[specialistId] ?? "")
}

// ─── Fiona opening prompt ────────────────────────────────────────────────────

function getFionaOpeningPrompt(question: string, specialistNames: string[]): string {
    return `You are Fiona, fundraising advisor and host of the Brainstorming Council at Fractional Forge.

Your job as host: read the founder's question, name what is actually worth disagreeing about in 2–3 sentences, then introduce the specialists who will respond. You do NOT answer the question yourself — you frame it.

Voice rules:
- British spelling (colour, behaviour, programme)
- Specific and direct — no filler, no "great question"
- First-person, calm authority
- 3–4 sentences maximum
- End by naming the specialists joining: ${specialistNames.join(", ")}

The founder's question: "${question}"

Frame the question and introduce the council. Do not answer it.`
}

// ─── Fiona closing prompt ────────────────────────────────────────────────────

function getFionaClosingPrompt(
    question: string,
    responses: Array<{ name: string; response: string }>,
): string {
    const responsesText = responses
        .map(r => `${r.name}: ${r.response}`)
        .join("\n\n")

    return `You are Fiona, fundraising advisor and host of the Brainstorming Council at Fractional Forge.

The council has responded to the founder's question. Your job: synthesise where they agreed, name the sharpest disagreement, and close with ONE concrete action the founder should take this week.

Voice rules:
- British spelling throughout
- Specific numbers over adjectives
- No acronyms unless spelled out
- 4–6 sentences maximum, structured as: agreed point → disagreement → one action
- The action must have a deadline (this week, by Friday, within 48 hours)
- Do NOT start with "The council has..." — lead with the insight

The founder's question: "${question}"

Council responses:
${responsesText}

Write the closing synthesis.`
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SpecialistResponse {
    id: string
    name: string
    title: string
    modelLabel: string
    response: string
}

export interface CouncilResult {
    ok: true
    fionaOpening: string
    specialistResponses: SpecialistResponse[]
    fionaClosing: string
}

export interface CouncilError {
    ok: false
    error: string
}

export type ConveneCouncilResult = CouncilResult | CouncilError

// ─── Main action ─────────────────────────────────────────────────────────────

export interface ConveneCouncilInput {
    question: string
    tier: string
    specialists: Array<{ id: string; name: string; title: string; tagline: string }>
}

/**
 * Fire all council LLM calls and return the full session result.
 *
 * Sequence:
 * 1. Fiona opening (sets the frame — runs first so the UI can show it fast)
 * 2. All specialist responses in parallel
 * 3. Fiona closing (synthesises the parallel responses)
 *
 * Each call is capped at 800 output tokens to keep cost under £0.10/session.
 */
export async function conveneCouncil(
    input: ConveneCouncilInput,
): Promise<ConveneCouncilResult> {
    const { question, specialists } = input

    if (!question?.trim()) {
        return { ok: false, error: "Question is required" }
    }

    if (!specialists || specialists.length === 0) {
        return { ok: false, error: "At least one specialist is required" }
    }

    const specialistNames = specialists.map(s => s.name)

    // ── Step 1: Fiona opening ──────────────────────────────────────────────
    // Run in parallel with specialists so a slow opening doesn't gate the
    // whole council. If opening fails we fall back to a generic frame.
    const fionaOpeningPromise = callOpenRouter({
        model: COUNCIL_MODEL_MAP["fundraising-advisor"],
        system: "You are Fiona, the council host at Fractional Forge. You frame questions and introduce specialists. British English. 3–4 sentences max.",
        prompt: getFionaOpeningPrompt(question, specialistNames),
        maxTokens: 400,
        temperature: 0.7,
        timeoutMs: 60_000,
    })

    // ── Step 2: All specialists in parallel ───────────────────────────────
    const specialistPromises = specialists.map(async (specialist): Promise<SpecialistResponse | null> => {
        const model = COUNCIL_MODEL_MAP[specialist.id] ?? "deepseek/deepseek-v4-flash"
        const modelLabel = COUNCIL_MODEL_LABEL[specialist.id] ?? "DeepSeek V4-Flash"
        const system = getSpecialistSystemPrompt(
            specialist.id,
            specialist.name,
            specialist.title,
            question,
        )

        const result = await callOpenRouter({
            model,
            system,
            prompt: question,
            maxTokens: 800,
            temperature: 0.75,
            timeoutMs: 75_000,
        })

        if (!result.ok) {
            // Return a graceful degradation rather than failing the whole council
            return {
                id: specialist.id,
                name: specialist.name,
                title: specialist.title,
                modelLabel,
                response: `${specialist.name} was unable to respond to this question. The model returned an error — try again in a moment.`,
            }
        }

        return {
            id: specialist.id,
            name: specialist.name,
            title: specialist.title,
            modelLabel,
            response: result.text.trim(),
        }
    })

    // Await opening + specialists in parallel.
    const [fionaOpeningResult, specialistResults] = await Promise.all([
        fionaOpeningPromise,
        Promise.all(specialistPromises),
    ])
    const specialistResponses = specialistResults.filter((r): r is SpecialistResponse => r !== null)

    const fionaOpening = fionaOpeningResult.ok
        ? fionaOpeningResult.text.trim()
        : `I've put your question to ${specialistNames.length} specialists — ${specialistNames.slice(0, -1).join(", ")}${specialistNames.length > 1 ? " and " : ""}${specialistNames[specialistNames.length - 1]}. They each look at it through their own lens. Read their take, then I'll close with what to do next.`

    // ── Step 3: Fiona closing synthesis ───────────────────────────────────
    const successfulResponses = specialistResponses.filter(
        r => !r.response.includes("was unable to respond"),
    )

    const fionaClosingResult = await callOpenRouter({
        model: COUNCIL_MODEL_MAP["fundraising-advisor"],
        system: "You are Fiona, the council host at Fractional Forge. You synthesise the council's responses into a closing. British English. 4–6 sentences max.",
        prompt: getFionaClosingPrompt(
            question,
            successfulResponses.map(r => ({ name: r.name, response: r.response })),
        ),
        maxTokens: 500,
        temperature: 0.65,
        timeoutMs: 60_000,
    })

    const fionaClosing = fionaClosingResult.ok
        ? fionaClosingResult.text.trim()
        : "Fiona was unable to complete the synthesis. The responses above reflect the council's individual perspectives."

    return {
        ok: true,
        fionaOpening,
        specialistResponses,
        fionaClosing,
    }
}
