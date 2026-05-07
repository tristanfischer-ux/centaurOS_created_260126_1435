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
 * Model mapping (OpenRouter, diverse multi-lineage per Artificial Analysis
 *   Intelligence Index May 2026 — see COUNCIL_MODEL_MAP below for full table):
 *   Cal   (chief-of-staff)  → deepseek/deepseek-v4-flash
 *   Sage  (strategist)      → google/gemini-3.1-pro-preview
 *   Fiona (fundraising)     → anthropic/claude-opus-4.7
 *   Finn  (finance-lead)    → moonshotai/kimi-k2.6
 *   Fang  (vp-manufacturing)→ deepseek/deepseek-v4-flash
 *   Max   (cto)             → deepseek/deepseek-v4-pro
 *   Priya (product-lead)    → qwen/qwen3.6-max-preview
 *   Mia   (growth-marketer) → deepseek/deepseek-v4-flash
 *   Sal   (sales-lead)      → deepseek/deepseek-v4-flash
 *   Jian  (vp-engineering)  → deepseek/deepseek-v4-flash
 *   Harper (hiring-team)    → moonshotai/kimi-k2.6
 *   Leo   (legal-counsel)   → z-ai/glm-5.1
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
import { createAdminClient } from "@/lib/supabase/admin"

// ─── Council model map — OpenRouter IDs keyed by specialist id ──────────────
//
// Lineage diversity principle (Artificial Analysis Intelligence Index, May 2026):
// A same-lineage council is an echo chamber. Every specialist slot pulls from
// a DIFFERENT model family so blind spots from one training lineage are caught
// by another. The table below spans six lineages:
//   China DeepSeek → deepseek/deepseek-v4-flash (proven reliable on this OpenRouter account,
//                                                  clean prose output, cheap at $0.14/$0.28/M)
//   US Google  → google/gemini-3.1-pro-preview (HLE 45%, Intelligence 57 — best reasoner)
//   US Anthropic → anthropic/claude-opus-4.7  (Fiona: +0.21 composite benchmark win)
//   China Moonshot → moonshotai/kimi-k2.6     (Intelligence 54, different RLHF lineage)
//   China DeepSeek → deepseek/deepseek-v4-pro (structured reasoning, Intelligence 52)
//   China Alibaba  → qwen/qwen3.6-max-preview (IFBench 77%, Intelligence 52)
//   China Zhipu    → z-ai/glm-5.1            (tool-use 98%, non-hallucination 74%)
//
// NOTE 2026-05-02: xiaomi/mimo-v2.5-pro was blocked on OpenRouter provider
// allow-list, causing Cal and 4 other specialists to 404. Replaced with
// deepseek/deepseek-v4-flash which is confirmed working on this account.
//
// IMPORTANT — prose vs reasoning models:
//   deepseek/deepseek-v4-pro returns reasoning chain in `reasoning_content`, not
//   `content`. The callOpenRouter wrapper must extract BOTH fields (see memory:
//   forgeos_deepseek_reasoning_content_separate_field.md).
//   moonshotai/kimi-k2.6 uses the `reasoning` field — always pass max_tokens>=4096.
//   All specialists below already use maxTokens:4096 (W51 fix).
//
// Note on V4-Flash removal: V4-Flash was previously the default for 10 of 13
// specialists, creating a same-family echo chamber. V4-Pro replaces it for Max
// (cto) only — as a structured reasoning upgrade, not a prose model. All other
// slots are now on non-DeepSeek models.

const COUNCIL_MODEL_MAP: Record<string, string> = {
    // US xAI — Grok 4.3: fastest frontier model, Intelligence 55, tool-use 98%.
    // Best host/opener: very fast response time, follows format precisely.
    // Swapped from V4-Flash 2026-05-03 per Tristan — V4-Flash was stalling.
    "chief-of-staff":      "x-ai/grok-4.3",

    // US Google — Gemini 3.1 Pro: Intelligence 57, HLE 45% (#1 hardest problems).
    // Best strategic reasoner. Kept from prior mapping (no regression risk).
    "strategist":          "google/gemini-3.1-pro-preview",

    // DeepSeek V4-Pro via OpenRouter: structured reasoning at £0.005/call vs Opus £0.090.
    // Fiona's fundraising synthesis works well with structured JSON output — no need for frontier model.
    "fundraising-advisor": "deepseek/deepseek-v4-pro",

    // China Moonshot — Kimi K2.6: Intelligence 54, different RLHF lineage from
    // DeepSeek/Alibaba/Xiaomi. $1.70/M. Reasoning model — uses `reasoning` field;
    // max_tokens>=4096 is already set in all callers (W51 fix).
    "finance-lead":        "moonshotai/kimi-k2.6",

    // China DeepSeek — V4-Flash: proven reliable on this OpenRouter account, clean prose output.
    // Grounds manufacturing claims in reality rather than optimism.
    "vp-manufacturing":    "deepseek/deepseek-v4-flash",

    // China DeepSeek — V4-Pro: Intelligence 52, structured reasoner. Upgrade from
    // V4-Flash for Max (cto) only — the engineering domain benefits from deeper
    // reasoning. NOTE: returns reasoning in `reasoning_content` not `content`.
    "cto":                 "deepseek/deepseek-v4-pro",

    // China Alibaba — Qwen 3.6 Max Preview: Intelligence 52, IFBench 77%.
    // Different Alibaba lineage adds genuine diversity vs Moonshot/DeepSeek/Xiaomi.
    "product-lead":        "qwen/qwen3.6-max-preview",

    // China DeepSeek — V4-Flash: proven reliable on this OpenRouter account, clean prose output.
    // Used when Cal isn't in the session. Cheap generalist prose.
    "growth-marketer":     "deepseek/deepseek-v4-flash",
    "sales-lead":          "deepseek/deepseek-v4-flash",

    // China DeepSeek — V4-Flash: proven reliable on this OpenRouter account, clean prose output.
    // Engineering and manufacturing share the same DeepSeek lineage for prose.
    "vp-engineering":      "deepseek/deepseek-v4-flash",

    // China Moonshot — Kimi K2.6 (same as Finn): Intelligence 54, different lineage.
    "hiring-team":         "moonshotai/kimi-k2.6",

    // China Zhipu (Tsinghua-derived) — GLM-5.1: Intelligence 51, non-hallucination
    // 74%, tool-use 98% (#1 tied). Best model for precise legal reasoning — won't
    // invent statutes or fabricate case law.
    "legal-counsel":       "z-ai/glm-5.1",

    // vp-supply-chain retains Gemini 3.1 Pro (same strategic-reasoning lineage
    // as Sage; supply-chain decisions are reasoning-heavy).
    "vp-supply-chain":     "google/gemini-3.1-pro-preview",
}

// Model label shown in the response card
const COUNCIL_MODEL_LABEL: Record<string, string> = {
    "chief-of-staff":      "Grok 4.3",
    "fundraising-advisor": "Claude Opus 4.7",
    "strategist":          "Gemini 3.1 Pro",
    "finance-lead":        "Kimi K2.6",
    "cto":                 "DeepSeek V4-Pro",
    "sales-lead":          "DeepSeek V4-Flash",
    "vp-manufacturing":    "DeepSeek V4-Flash",
    "vp-supply-chain":     "Gemini 3.1 Pro",
    "product-lead":        "Qwen 3.6 Max",
    "growth-marketer":     "DeepSeek V4-Flash",
    "vp-engineering":      "DeepSeek V4-Flash",
    "hiring-team":         "Kimi K2.6",
    "legal-counsel":       "GLM-5.1",
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
    "vp-manufacturing":    "BUILD THIS WEEK:",
    "vp-supply-chain":     "PROCURE THIS WEEK:",
    "product-lead":        "SHIP THIS SPRINT:",
    "growth-marketer":     "RUN THIS EXPERIMENT:",
    "vp-engineering":      "MERGE THIS WEEK:",
    "hiring-team":         "HIRE FOR THIS:",
    "legal-counsel":       "PROTECT THIS WEEK:",
}

// ─── Fiona grounding — FTS investor lookup ────────────────────────────────────

/**
 * Fetches up to 5 real UK investor names from marketplace_listing_pages
 * whose scraped text matches the question via Postgres full-text search.
 *
 * Returns a compact KNOWN_FUNDS block (one line per fund) ready to inject
 * into Fiona's system prompt. Returns an empty string when no relevant
 * UK funds with cheque data are found — caller skips the block entirely.
 *
 * Runs inside getSpecialistRound1Response for fundraising-advisor only.
 * Because the view fires all R1 calls in parallel (including Cal's framing),
 * this 30 ms FTS call adds zero net latency: Fiona's LLM call is ~3–5 s.
 *
 * Reusable by Sage / Sal / Chase later — different grounding sources will
 * need different helpers.
 */
async function getGroundedFundContext(question: string): Promise<string> {
    try {
        const supabase = createAdminClient()

        // Step 1: FTS over marketplace_listing_pages for Finance category.
        // Cast as never because match_listings_pages_fts was added after the
        // last database.types.ts regeneration (same pattern as investors.ts).
        const ftsResult = await (supabase as unknown as {
            rpc: (
                name: string,
                args: Record<string, unknown>
            ) => Promise<{
                data: Array<{ listing_id: string }> | null
                error: { message: string } | null
            }>
        }).rpc('match_listings_pages_fts', {
            p_query: question,
            p_category: 'Finance',
            p_limit: 20,
        })

        if (ftsResult.error || !ftsResult.data || ftsResult.data.length === 0) {
            return ''
        }

        const listingIds = ftsResult.data.map(r => r.listing_id)

        // Step 2: Fetch the matching listings from marketplace_listings,
        // filtering to UK-domiciled funds with cheque data in attributes.
        const { data: listings, error: listingError } = await supabase
            .from('marketplace_listings')
            .select('id, title, description, country_iso, attributes')
            .in('id', listingIds)
            .eq('category', 'Finance')
            .or('country_iso.eq.GB,country_iso.is.null')
            .limit(20)

        if (listingError || !listings || listings.length === 0) {
            return ''
        }

        // Step 3: Filter to rows that have cheque_range_gbp populated in
        // attributes and a non-empty title (firm_name equivalent).
        type ListingRow = {
            id: string
            title: string
            description: string | null
            country_iso: string | null
            attributes: Record<string, unknown> | null
        }
        const qualified = (listings as ListingRow[]).filter(l => {
            const attrs = l.attributes ?? {}
            const cheque = attrs.cheque_range_gbp as { min?: number | null; max?: number | null } | null | undefined
            return l.title && cheque && (cheque.min != null || cheque.max != null)
        })

        if (qualified.length === 0) {
            return ''
        }

        // Step 4: Map each to a compact one-line summary. Cap at 5.
        const lines: string[] = qualified.slice(0, 5).map(l => {
            const attrs = l.attributes ?? {}
            const cheque = attrs.cheque_range_gbp as { min?: number | null; max?: number | null } | null | undefined
            const stageFocus = Array.isArray(attrs.stage_focus)
                ? (attrs.stage_focus as string[]).slice(0, 2).join(', ')
                : typeof attrs.stage_focus === 'string'
                  ? attrs.stage_focus
                  : 'stage unknown'
            const minK = cheque?.min != null ? `£${Math.round(cheque.min / 1000)}K` : null
            const maxK = cheque?.max != null ? `£${Math.round(cheque.max / 1000)}K` : null
            const chequeStr = minK && maxK ? `${minK}–${maxK}` : (minK ?? maxK ?? 'cheque unspecified')
            const thesis = typeof attrs.investment_thesis === 'string'
                ? attrs.investment_thesis.trim().slice(0, 120)
                : (l.description ?? '').trim().slice(0, 120)
            return `- ${l.title} (${stageFocus}, ${chequeStr})${thesis ? ` — ${thesis}` : ''}`
        })

        const names = qualified.slice(0, 5).map(l => l.title).join(', ')
        console.info(`[BrainstormCouncil] Grounded Fiona with ${lines.length} funds: ${names}`)

        return lines.join('\n')
    } catch (err) {
        // Non-fatal — Fiona degrades gracefully to generic advice.
        console.warn('[BrainstormCouncil] getGroundedFundContext failed (non-fatal):', String(err))
        return ''
    }
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
        "vp-manufacturing": `
Your angle: Manufacturing, production processes, and factory economics. Think in lead times, yield rates, tooling cost, and minimum order quantities. Name the unit economics that change the decision.`,
        "vp-supply-chain": `
Your angle: Supply chain, procurement, and logistics. Who are the real suppliers? What is the actual lead time? Where is the single point of failure? Translate the question into sourcing risk.`,
        "product-lead": `
Your angle: Product management, feature prioritisation, and user requirements. What does the customer actually need? What is the minimum viable change that unlocks the most value?`,
        "growth-marketer": `
Your angle: Growth, marketing, and customer acquisition. Where does revenue come from? What is the channel that works at this stage? Name the one growth lever the founder should pull this week.`,
        "vp-engineering": `
Your angle: Engineering execution, team velocity, and technical debt. What slows down the build? What is the architectural decision that cannot be undone? Translate the question into engineering effort.`,
        "hiring-team": `
Your angle: People, hiring, culture, and organisational design. Who does the founder need in the room? What is the hiring decision that changes the trajectory? Name the role and why it matters now.`,
        "legal-counsel": `
Your angle: Legal risk, contracts, intellectual property, and regulatory compliance. What is the exposure? What clause or structure protects the founder? Be specific — "get legal advice" is not an answer.`,
    }

    return baseInstructions + (specialistVoice[specialistId] ?? "")
}

// ─── Cal opening prompt ──────────────────────────────────────────────────────
// W68: Cal (Chief of Staff) is now the host, replacing Fiona.

function getCalOpeningPrompt(question: string, specialistNames: string[]): string {
    return `You are Cal, Chief of Staff and host of the Brainstorming Council at Fractional Forge.

Your job as host: read the founder's question, name what is actually worth disagreeing about in 2–3 sentences, then introduce the specialists who will respond. You do NOT answer the question yourself — you frame it.

Voice rules:
- British spelling (colour, behaviour, programme)
- Specific and direct — no filler, no "great question"
- First-person, calm authority — you are the person in the room who noticed what others missed
- 3–4 sentences maximum
- End by naming the specialists joining: ${specialistNames.join(", ")}

The founder's question: "${question}"

Frame the question and introduce the council. Do not answer it.`
}

// ─── Cal closing prompt ───────────────────────────────────────────────────────
// W68: Cal (Chief of Staff) is now the host, replacing Fiona.

function getCalClosingPrompt(
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

    return `You are Cal, Chief of Staff and host of the Brainstorming Council at Fractional Forge.

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

// ─── Per-stage server actions (W77: Cal-first progressive reveal) ────────────
// These granular actions let the client orchestrate the sequence:
// Cal framing → R1 specialists one-by-one → R2 specialists → Cal closing.
// Each action is a thin wrapper around the shared prompt/model logic above.

/**
 * W77: Return only Cal's opening framing. Called first, before any
 * specialist calls fire. The client shows Cal's card then gates R1 on
 * this resolving.
 */
export async function getCalFraming(
    question: string,
    specialistNames: string[],
): Promise<{ ok: true; framing: string } | { ok: false; error: string }> {
    if (!question?.trim()) return { ok: false, error: "Question is required" }
    const model = COUNCIL_MODEL_MAP["chief-of-staff"]
    console.info("[getCalFraming] START model=%s question=%s", model, question.slice(0, 60))
    const t0 = Date.now()
    try {
        const result = await callOpenRouter({
            model,
            system: "You are Cal, Chief of Staff and council host at Fractional Forge. You frame questions and introduce specialists. British English. 3–4 sentences max.",
            prompt: getCalOpeningPrompt(question, specialistNames),
            maxTokens: 1200,
            temperature: 0.7,
            timeoutMs: 30_000,
        })
        console.info("[getCalFraming] DONE ok=%s elapsed=%dms", result.ok, Date.now() - t0)
        if (!result.ok) {
            console.warn("[getCalFraming] OpenRouter error: %s", (result as { error: string }).error)
            const fallback = `I've put your question to ${specialistNames.length} specialists — ${specialistNames.slice(0, -1).join(", ")}${specialistNames.length > 1 ? " and " : ""}${specialistNames[specialistNames.length - 1]}. They each look at it through their own lens. Read their take, then I'll close with what to do next.`
            return { ok: true, framing: fallback }
        }
        return { ok: true, framing: result.text.trim() }
    } catch (err) {
        console.error("[getCalFraming] EXCEPTION elapsed=%dms error=%s", Date.now() - t0, err instanceof Error ? err.message : String(err))
        const fallback = `I've put your question to ${specialistNames.length} specialists — ${specialistNames.slice(0, -1).join(", ")}${specialistNames.length > 1 ? " and " : ""}${specialistNames[specialistNames.length - 1]}. They each look at it through their own lens. Read their take, then I'll close with what to do next.`
        return { ok: true, framing: fallback }
    }
}

/**
 * W77: Return a single specialist's Round 1 response.
 * The client fires one of these per specialist after Cal's framing returns,
 * all in parallel. Each resolves independently so cards appear one by one
 * as the fastest model finishes first.
 */
export async function getSpecialistRound1Response(
    question: string,
    specialist: { id: string; name: string; title: string; tagline: string },
): Promise<{ ok: true; response: SpecialistResponse } | { ok: false; error: string }> {
    if (!question?.trim()) return { ok: false, error: "Question is required" }
    const model = COUNCIL_MODEL_MAP[specialist.id] ?? "deepseek/deepseek-v4-flash"
    const modelLabel = COUNCIL_MODEL_LABEL[specialist.id] ?? "DeepSeek V4-Flash"
    let system = getSpecialistSystemPrompt(specialist.id, specialist.name, specialist.title, question)

    // ── Fiona grounding — inject real UK investor names to prevent hallucination
    // Run FTS lookup in parallel with the LLM call: await it here because
    // getGroundedFundContext is fast (~30 ms Postgres FTS) and must complete
    // before we build the system prompt. Net latency impact is negligible
    // because Fiona's LLM call (DeepSeek V4-Flash) takes 3–5 s — the FTS
    // resolves long before the streaming response starts.
    if (specialist.id === 'fundraising-advisor') {
        const knownFunds = await getGroundedFundContext(question)
        if (knownFunds) {
            system +=
                `\n\nThe following UK investors have public theses that may be relevant to this discussion. You may cite them BY NAME only if they actually fit the founder's situation. If none fit, do NOT name funds — speak generically about fund types and stages instead. Hallucinating fund names is a hard failure.\n\nKNOWN_FUNDS:\n${knownFunds}`
        }
    }

    const result = await callOpenRouter({
        model,
        system,
        prompt: question,
        maxTokens: 4096,
        temperature: 0.75,
        timeoutMs: 75_000,
    })
    if (!result.ok) {
        return {
            ok: true,
            response: {
                id: specialist.id,
                name: specialist.name,
                title: specialist.title,
                modelLabel,
                response: `${specialist.name} was unable to respond to this question. The model returned an error — try again in a moment.`,
            },
        }
    }
    return {
        ok: true,
        response: {
            id: specialist.id,
            name: specialist.name,
            title: specialist.title,
            modelLabel,
            response: result.text.trim(),
        },
    }
}

/**
 * W77: Return a single specialist's Round 2 response.
 * Called after all R1 responses are in. Same one-by-one reveal pattern
 * as R1 — each resolves independently.
 */
export async function getSpecialistRound2Response(
    question: string,
    specialist: { id: string; name: string; title: string },
    ownRound1Response: string,
    peersRound1: Array<{ name: string; response: string }>,
): Promise<{ ok: true; id: string; round2Response: string } | { ok: false; error: string }> {
    if (!question?.trim()) return { ok: false, error: "Question is required" }
    const model = COUNCIL_MODEL_MAP[specialist.id] ?? "deepseek/deepseek-v4-flash"
    const round2Prompt = buildRound2Prompt(specialist, ownRound1Response, peersRound1)
    const result = await callOpenRouter({
        model,
        system: getSpecialistSystemPrompt(specialist.id, specialist.name, specialist.title, question),
        prompt: round2Prompt,
        maxTokens: 4096,
        temperature: 0.72,
        timeoutMs: 90_000,
    })
    if (!result.ok) return { ok: false, error: result.error ?? "Round 2 call failed" }
    return { ok: true, id: specialist.id, round2Response: result.text.trim() }
}

/**
 * W77: Return Cal's closing synthesis. Called after all R1 (and R2 when
 * applicable) responses are in.
 */
export async function getCalClosingResponse(
    question: string,
    round1Responses: Array<{ name: string; response: string }>,
    round2Responses: Array<{ name: string; response: string }>,
): Promise<{ ok: true; closing: string } | { ok: false; error: string }> {
    if (!question?.trim()) return { ok: false, error: "Question is required" }
    const result = await callOpenRouter({
        model: COUNCIL_MODEL_MAP["chief-of-staff"],
        system: "You are Cal, Chief of Staff and council host at Fractional Forge. You synthesise the council's responses into a closing. British English. 4–6 sentences max.",
        prompt: getCalClosingPrompt(question, round1Responses, round2Responses),
        maxTokens: 1500,
        temperature: 0.65,
        timeoutMs: 60_000,
    })
    if (!result.ok) {
        return { ok: true, closing: "Cal was unable to complete the synthesis. The responses above reflect the council's individual perspectives." }
    }
    return { ok: true, closing: result.text.trim() }
}

// ─── Legacy bulk action (kept for compatibility — not used by the view) ───────

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
 *
 * @deprecated Use the per-stage actions (getCalFraming, getSpecialistRound1Response,
 * getSpecialistRound2Response, getCalClosingResponse) for progressive reveal.
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

    // ── Step 1: Cal opening ───────────────────────────────────────────────
    // W68: Cal (Chief of Staff) is now the host, replacing Fiona.
    // Run in parallel with specialists so a slow opening doesn't gate the
    // whole council. If opening fails we fall back to a generic frame.
    const fionaOpeningPromise = callOpenRouter({
        model: COUNCIL_MODEL_MAP["chief-of-staff"],
        system: "You are Cal, Chief of Staff and council host at Fractional Forge. You frame questions and introduce specialists. British English. 3–4 sentences max.",
        prompt: getCalOpeningPrompt(question, specialistNames),
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

    // W68: host is now Cal
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
        model: COUNCIL_MODEL_MAP["chief-of-staff"],
        system: "You are Cal, Chief of Staff and council host at Fractional Forge. You synthesise the council's responses into a closing. British English. 4–6 sentences max.",
        prompt: getCalClosingPrompt(
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
