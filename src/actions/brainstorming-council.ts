"use server"

// Vercel function runtime cap is set on the hosting page (agents/page.tsx)
// because "use server" files reject non-async exports — adding
// `export const maxDuration = 180` here breaks the whole module export.
// See MEMORY.md: forgeos_use_server_non_async_exports.

/**
 * @file brainstorming-council.ts — Server action for the Brainstorming Council.
 *
 * @description Fires parallel OpenRouter calls for Fiona's opening, all
 * specialist responses (Round 1), optional Round 2 (when tier !== 'quick'),
 * and Fiona's closing synthesis. All calls go through the existing
 * callOpenRouter wrapper — no direct Anthropic calls.
 *
 * Round structure (W50):
 *   tier='quick'    → 1 round (2 specialists)
 *   tier='full'     → 2 rounds (3 specialists)
 *   tier='deep'     → 2 rounds (4 specialists)
 *   tier='strategy' → 2 rounds (5 specialists)
 *
 * Model mapping (OpenRouter, non-Anthropic per cost-discipline rule):
 *   Fiona (host/closer)    → deepseek/deepseek-v4-flash
 *   Sage  (strategist)     → google/gemini-3.1-pro-preview
 *   Finn  (finance-lead)   → deepseek/deepseek-v4-flash
 *   Max   (cto)            → deepseek/deepseek-v4-flash
 *   Sal   (sales-lead)     → deepseek/deepseek-v4-flash
 *   Cal   (chief-of-staff) → mistralai/mistral-large-2407
 *
 * W51 fix: specialist maxTokens raised from 800 → 4096 so Gemini 3.1 Pro
 * (a reasoning model) has enough budget for its internal reasoning trace
 * before the visible response. At 800 tokens Gemini's visible answer was
 * cut at ~150 chars mid-sentence ("I see" truncation).
 *
 * @security No auth required for this action — the /agents route is public
 * for authenticated visitors, and the LLM calls do not touch user data.
 * The action reads only from the request body (question + tier + specialistIds).
 */

import { callOpenRouter } from "@/lib/ai/openrouter"

// ─── Council model map — OpenRouter IDs keyed by specialist id ──────────────

const COUNCIL_MODEL_MAP: Record<string, string> = {
    // All specialists use V4-Flash or Mistral/Gemini for clean prose output.
    // V4-Pro is reasoning-mode and leaks chain-of-thought into the visible
    // response when asked for short prose (verified 2026-04-26: Finn dumped
    // his entire trace including "I am Finn... Key points I might hit...
    // Sharpest take..." into the user-facing card). Per cost-discipline
    // rule: V4-Pro is for STRUCTURED reasoning only, never prose.
    "fundraising-advisor": "deepseek/deepseek-v4-flash",
    "strategist":          "google/gemini-3.1-pro-preview",
    "finance-lead":        "deepseek/deepseek-v4-flash",
    "cto":                 "deepseek/deepseek-v4-flash",
    "sales-lead":          "deepseek/deepseek-v4-flash",
    "chief-of-staff":      "mistralai/mistral-large-2407",
}

// Model label shown in the response card (matches BrainstormingCouncilView MODEL_TIER_LABELS)
const COUNCIL_MODEL_LABEL: Record<string, string> = {
    "fundraising-advisor": "DeepSeek V4-Flash",
    "strategist":          "Gemini 3.1 Pro",
    "finance-lead":        "DeepSeek V4-Flash",
    "cto":                 "DeepSeek V4-Flash",
    "sales-lead":          "DeepSeek V4-Flash",
    "chief-of-staff":      "Mistral Large",
}

// W50: Signature close headers used in Round 2 prompts so each specialist
// maintains their domain-specific voice format per personality.ts conventions.
const ROUND2_CLOSE_HEADER: Record<string, string> = {
    "strategist":          "WHAT TO DO MONDAY MORNING:",
    "finance-lead":        "THE NUMBERS THAT MATTER:",
    "cto":                 "SHIP THIS WEEK:",
    "sales-lead":          "SEND THIS TODAY:",
    "chief-of-staff":      "NEXT CONCRETE ACTION:",
    "fundraising-advisor": "WHAT INVESTORS WANT TO SEE:",
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
    round1Responses: Array<{ name: string; response: string }>,
    round2Responses: Array<{ name: string; response: string }>,
): string {
    const round1Text = round1Responses
        .map(r => `${r.name}: ${r.response}`)
        .join("\n\n")

    let councilText: string
    if (round2Responses.length > 0) {
        const round2Text = round2Responses
            .map(r => `${r.name}: ${r.response}`)
            .join("\n\n")
        councilText = `ROUND 1 — initial views:\n${round1Text}\n\nROUND 2 — after seeing peers:\n${round2Text}`
    } else {
        councilText = round1Text
    }

    return `You are Fiona, fundraising advisor and host of the Brainstorming Council at Fractional Forge.

The council has responded to the founder's question${round2Responses.length > 0 ? " across two rounds of discussion" : ""}. Your job: synthesise where they agreed, name the sharpest disagreement, and close with ONE concrete action the founder should take this week.

CRITICAL OUTPUT RULES:
- Output ONLY the final synthesis prose. Do NOT include any reasoning, deliberation, "we need to", "let me think", "the founder should", meta-commentary, or working-out.
- 4–6 sentences MAXIMUM. If you write more, you have failed.
- Structured as: agreed point → disagreement → one action with deadline
- British spelling throughout
- Specific numbers over adjectives
- No acronyms unless spelled out first
- The action must name a deadline (this week, by Friday, within 48 hours)
- Do NOT start with "The council has..." or "We need to..." — lead with the insight

The founder's question: "${question}"

Council responses:
${councilText}

Output the closing synthesis now. Prose only. No reasoning trace.`
}

// ─── Round 2 prompt builder ──────────────────────────────────────────────────

/**
 * W50: Build the Round 2 prompt for a single specialist.
 *
 * Each specialist receives:
 *  - All peers' Round 1 responses (everyone except themselves)
 *  - Their own Round 1 response for continuity
 *  - Instruction to update their view in 2–3 paragraphs max
 *  - Their domain-specific signature close header
 */
function buildRound2Prompt(
    specialist: { id: string; name: string; title: string },
    ownRound1Response: string,
    peersRound1: Array<{ name: string; response: string }>,
): string {
    const peersText = peersRound1
        .map(p => `${p.name}: ${p.response}`)
        .join("\n\n")

    const closeHeader = ROUND2_CLOSE_HEADER[specialist.id] ?? "NEXT STEP:"

    return `You are ${specialist.name}, a ${specialist.title} specialist at Fractional Forge. This is Round 2 of a Brainstorming Council.

Your Round 1 response:
${ownRound1Response}

Your peers' Round 1 responses:
${peersText}

Having read what your peers said, update your view. What changes in light of their takes? What do you hold firm on? Where do you now see the sharpest disagreement or the clearest opportunity?

Voice rules:
- British spelling (colour, behaviour, programme)
- Specific numbers over adjectives
- First-person, direct, confident
- Do NOT repeat yourself verbatim from Round 1 — advance the discussion
- 2–3 paragraphs maximum. You are updating, not starting over.
- End with: ${closeHeader} followed by one concrete action (one sentence, one deadline).`
}

// ─── Types ───────────────────────────────────────────────────────────────────
// All type/interface declarations moved to ./brainstorming-council-types.ts.
// "use server" files can ONLY export async functions — even `export type`
// re-exports can silently strip ALL exports from the compiled module
// (Vercel build error 2026-04-26 NIGHT, ~50 min broken builds). Consumers
// import types DIRECTLY from ./brainstorming-council-types instead.
import type {
    SpecialistResponse,
    CouncilResult,
    CouncilError,
    ConveneCouncilInput,
    ConveneCouncilResult,
} from "./brainstorming-council-types"

/**
 * Fire all council LLM calls and return the full session result.
 *
 * W50 sequence (tier-aware two-round design):
 * 1. Fiona opening + Round 1 specialists fire in parallel
 * 2. [tier !== 'quick' only] Round 2 — each specialist sees all peers' R1
 *    responses + their own, fires update in parallel
 * 3. Fiona closing synthesises R1 + R2 (when present)
 *
 * W51 fix: specialist maxTokens raised from 800 → 4096.
 * Root cause: Gemini 3.1 Pro is a reasoning model. It spends ~600-800
 * tokens on an internal thinking trace BEFORE emitting visible text.
 * At maxTokens=800 the visible response was cut at ~150 chars mid-sentence
 * ("I see" truncation). 4096 gives all specialists full headroom.
 */
export async function conveneCouncil(
    input: ConveneCouncilInput,
): Promise<ConveneCouncilResult> {
    const { question, tier, specialists } = input

    if (!question?.trim()) {
        return { ok: false, error: "Question is required" }
    }

    if (!specialists || specialists.length === 0) {
        return { ok: false, error: "At least one specialist is required" }
    }

    // W50: 'quick' tier (2 specialists) = 1 round only (low cost, low latency).
    // All other tiers get 2 rounds.
    const useRound2 = tier !== "quick"

    const specialistNames = specialists.map(s => s.name)

    // ── Step 1: Fiona opening ──────────────────────────────────────────────
    // Run in parallel with specialists so a slow opening doesn't gate the
    // whole council. If opening fails we fall back to a generic frame.
    const fionaOpeningPromise = callOpenRouter({
        model: COUNCIL_MODEL_MAP["fundraising-advisor"],
        system: "You are Fiona, the council host at Fractional Forge. You frame questions and introduce specialists. British English. 3–4 sentences max.",
        prompt: getFionaOpeningPrompt(question, specialistNames),
        maxTokens: 1200,
        temperature: 0.7,
        timeoutMs: 60_000,
    })

    // ── Step 2: All specialists fire Round 1 in parallel ──────────────────
    // W51: maxTokens raised from 800 → 4096.
    // Gemini 3.1 Pro (strategist) is a reasoning model: it consumes
    // ~600-800 tokens on an internal thinking trace before emitting visible
    // text. At 800 tokens total budget the visible output was cut mid-sentence.
    // 4096 gives Gemini adequate headroom for its reasoning + a full response.
    // Other models (V4-Flash, Mistral Large) are prose models and benefit
    // from the higher cap regardless.
    const specialistRound1Promises = specialists.map(async (specialist): Promise<SpecialistResponse | null> => {
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
            maxTokens: 4096, // W51: was 800 — raised for Gemini 3.1 Pro reasoning budget
            temperature: 0.75,
            timeoutMs: 75_000,
        })

        if (!result.ok) {
            // Return graceful degradation rather than failing the whole council
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

    // Await opening + Round 1 in parallel.
    const [fionaOpeningResult, round1Results] = await Promise.all([
        fionaOpeningPromise,
        Promise.all(specialistRound1Promises),
    ])
    const round1Responses = round1Results.filter((r): r is SpecialistResponse => r !== null)

    const fionaOpening = fionaOpeningResult.ok
        ? fionaOpeningResult.text.trim()
        : `I've put your question to ${specialistNames.length} specialists — ${specialistNames.slice(0, -1).join(", ")}${specialistNames.length > 1 ? " and " : ""}${specialistNames[specialistNames.length - 1]}. They each look at it through their own lens. Read their take, then I'll close with what to do next.`

    // Filter out error responses before Round 2 / Fiona closing
    const successfulRound1 = round1Responses.filter(
        r => !r.response.includes("was unable to respond"),
    )

    // ── Step 3: Round 2 (tier-aware) ──────────────────────────────────────
    // W50: Only fire when tier !== 'quick' and at least 2 specialists
    // returned successfully in Round 1 (need peers to cross-pollinate).
    // Each specialist sees ALL peers' R1 responses + their own, then
    // emits a 2–3 paragraph update with their signature close header.
    let specialistResponsesWithRound2: SpecialistResponse[] = round1Responses

    if (useRound2 && successfulRound1.length >= 2) {
        const round2Promises = successfulRound1.map(async (specialist): Promise<SpecialistResponse> => {
            // Build peers list: all successful R1 responders except this specialist
            const peers = successfulRound1
                .filter(r => r.id !== specialist.id)
                .map(r => ({ name: r.name, response: r.response }))

            const round2Prompt = buildRound2Prompt(
                { id: specialist.id, name: specialist.name, title: specialist.title },
                specialist.response,
                peers,
            )

            const model = COUNCIL_MODEL_MAP[specialist.id] ?? "deepseek/deepseek-v4-flash"

            const result = await callOpenRouter({
                model,
                system: getSpecialistSystemPrompt(
                    specialist.id,
                    specialist.name,
                    specialist.title,
                    question,
                ),
                prompt: round2Prompt,
                maxTokens: 4096,
                temperature: 0.72,
                timeoutMs: 90_000,
            })

            return {
                ...specialist,
                round2Response: result.ok ? result.text.trim() : undefined,
            }
        })

        const round2Results = await Promise.all(round2Promises)

        // Merge round2Responses back onto the full round1Responses array
        // (including any error slots that didn't participate in Round 2)
        const round2Map = new Map(round2Results.map(r => [r.id, r.round2Response]))
        specialistResponsesWithRound2 = round1Responses.map(r => ({
            ...r,
            round2Response: round2Map.get(r.id),
        }))
    }

    // ── Step 4: Fiona closing synthesis ───────────────────────────────────
    // W50: Pass R1 and R2 (when present) so Fiona's synthesis reflects the
    // full debate arc, including how views evolved between rounds.
    const r2ForFiona = specialistResponsesWithRound2
        .filter(r => r.round2Response)
        .map(r => ({ name: r.name, response: r.round2Response! }))

    const fionaClosingResult = await callOpenRouter({
        model: COUNCIL_MODEL_MAP["fundraising-advisor"],
        system: "You are Fiona, the council host at Fractional Forge. You synthesise the council's responses into a closing. British English. 4–6 sentences max.",
        prompt: getFionaClosingPrompt(
            question,
            successfulRound1.map(r => ({ name: r.name, response: r.response })),
            r2ForFiona,
        ),
        maxTokens: 1500,
        temperature: 0.65,
        timeoutMs: 60_000,
    })

    const fionaClosing = fionaClosingResult.ok
        ? fionaClosingResult.text.trim()
        : "Fiona was unable to complete the synthesis. The responses above reflect the council's individual perspectives."

    return {
        ok: true,
        fionaOpening,
        specialistResponses: specialistResponsesWithRound2,
        fionaClosing,
        hadRound2: useRound2 && r2ForFiona.length > 0,
    }
}
