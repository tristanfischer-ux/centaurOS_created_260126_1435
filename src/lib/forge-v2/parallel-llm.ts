/**
 * @file parallel-llm.ts — Parallel-and-compare multi-model pattern
 *
 * @description Runs 3 models from DIFFERENT lineages on the SAME prompt,
 * then uses a cheap judge model (gpt-4.1-mini) to select or synthesise
 * the best output. This is fundamentally different from primary+fallback:
 *
 *   primary+fallback = reliability (if model A fails, try model B)
 *   parallel-and-compare = quality (run A+B+C, pick the best)
 *
 * Each individual model call has its own error handling — one model
 * failing does not block the others. The judge only fires if 2+
 * models return successfully.
 *
 * Used by content-producing autopilot stages where lineage diversity
 * produces measurably better outputs:
 *   - Max (concept synthesis)
 *   - Sizing (engineering calculations)
 *   - Bill of materials (component selection)
 *   - Finn (cost estimation)
 *   - Fang (engineering review)
 */

import { callOpenAI, callGemini, callTogether } from "@/lib/cad-lab/api-helpers"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

// ── Types ─────────────────────────────────────────────────────────────

export interface ModelConfig {
    id: string
    displayName: string
    lineage: string
    call: (system: string, user: string) => Promise<string>
}

export interface ParallelLLMResult {
    bestOutput: string
    winnerModel: string
    selectionReason: string
    allOutputs: Array<{ model: string; output: string; error?: string }>
    judgeUsed: boolean
}

// ── Model presets ─────────────────────────────────────────────────────

function makeOpenAIModel(modelId: string, displayName: string): ModelConfig {
    return {
        id: modelId,
        displayName,
        lineage: "OpenAI (US)",
        call: async (system, user) => {
            const isReasoning = modelId.startsWith("gpt-5") || modelId.startsWith("o3") || modelId.startsWith("o4")
            const { text } = await callOpenAI(system, user, modelId, isReasoning ? 16384 : 8192, 180_000)
            return text
        },
    }
}

function makeGeminiModel(modelId: string, displayName: string): ModelConfig {
    return {
        id: modelId,
        displayName,
        lineage: "Google (US)",
        call: async (system, user) => {
            const { text } = await callGemini(system, user, modelId, 16384, 180_000)
            return text
        },
    }
}

function makeDeepSeekModel(): ModelConfig {
    return {
        id: "deepseek-v4-pro",
        displayName: "DeepSeek V4-Pro",
        lineage: "DeepSeek (China)",
        call: async (system, user) => {
            const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
            if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured")
            const response = await fetchWithTimeout(
                "https://api.deepseek.com/v1/chat/completions",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model: "deepseek-reasoner",
                        max_tokens: 16384,
                        temperature: 0.2,
                        messages: [
                            { role: "system", content: system },
                            { role: "user", content: user },
                        ],
                    }),
                },
                180_000,
            )
            if (!response.ok) {
                const errText = await response.text()
                throw new Error(`DeepSeek API error (${response.status}): ${errText.slice(0, 300)}`)
            }
            const data = await response.json()
            // DeepSeek reasoning models put text in reasoning_content, not content
            const content = data.choices?.[0]?.message?.content ?? ""
            const reasoning = data.choices?.[0]?.message?.reasoning_content ?? ""
            return content || reasoning
        },
    }
}

function makeQwenModel(): ModelConfig {
    return {
        id: "qwen3-235b-a22b",
        displayName: "Qwen 3 235B",
        lineage: "Alibaba (China)",
        call: async (system, user) => {
            const { text } = await callTogether(system, user, "Qwen/Qwen3-235B-A22B", 8192, 180_000)
            return text
        },
    }
}

// ── Stage-specific model triads ───────────────────────────────────────

/**
 * Each stage gets 3 models from 3 different lineages. The rotation
 * ensures no two stages use the exact same triad, maximising the
 * diversity of perspectives across the pipeline.
 */
export const STAGE_MODEL_TRIADS: Record<string, ModelConfig[]> = {
    // Chase (research synthesis) — factual diversity catches hallucinated sources
    waiting_chase: [
        makeOpenAIModel("gpt-5.5", "GPT-5.5"),
        makeDeepSeekModel(),
        makeGeminiModel("gemini-3.1-pro-preview", "Gemini 3.1 Pro"),
    ],
    // Max (concept synthesis) — creative diversity matters most
    waiting_max: [
        makeOpenAIModel("gpt-5.5", "GPT-5.5"),
        makeDeepSeekModel(),
        makeGeminiModel("gemini-3.1-pro-preview", "Gemini 3.1 Pro"),
    ],
    // Sizing (engineering calculations) — cross-validation of numbers
    waiting_sizing: [
        makeOpenAIModel("gpt-5.5", "GPT-5.5"),
        makeQwenModel(),
        makeGeminiModel("gemini-3.1-pro-preview", "Gemini 3.1 Pro"),
    ],
    // Bill of materials (component selection) — different knowledge bases
    waiting_bom: [
        makeOpenAIModel("gpt-5.5", "GPT-5.5"),
        makeDeepSeekModel(),
        makeQwenModel(),
    ],
    // Finn (cost estimation) — financial figures need verification
    waiting_finn: [
        makeOpenAIModel("gpt-5.5", "GPT-5.5"),
        makeDeepSeekModel(),
        makeGeminiModel("gemini-3.1-pro-preview", "Gemini 3.1 Pro"),
    ],
    // Fang (engineering review) — adversarial review benefits from diversity
    running_fang_reviews: [
        makeQwenModel(),
        makeDeepSeekModel(),
        makeGeminiModel("gemini-3.1-pro-preview", "Gemini 3.1 Pro"),
    ],
    // Proofreading (synthesis + fact-check) — same triad as Chase/Max/Finn
    proofreading: [
        makeOpenAIModel("gpt-5.5", "GPT-5.5"),
        makeDeepSeekModel(),
        makeGeminiModel("gemini-3.1-pro-preview", "Gemini 3.1 Pro"),
    ],
}

// ── DB grounding tables per stage ─────────────────────────────────────

/**
 * Maps each parallel-compare stage to the database tables it should
 * query for grounding data. This ensures outputs are validated against
 * real supplier, material, and standards data rather than hallucinated.
 */
export const STAGE_DB_GROUNDING: Record<string, string[]> = {
    waiting_chase: ["marketplace_listings"],
    waiting_max: ["design_standards"],
    waiting_sizing: ["material_properties", "design_standards"],
    waiting_bom: ["material_properties", "marketplace_listings", "process_capabilities"],
    waiting_finn: ["marketplace_listings"],
    running_fang_reviews: ["material_properties", "design_standards", "process_capabilities", "marketplace_listings"],
    // Proofreading reads from the project record directly — no additional table grounding needed
    proofreading: [],
}

// ── DB grounding data loader ──────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin"

export async function loadGroundingData(
    stage: string,
    projectId: string,
): Promise<string> {
    const tables = STAGE_DB_GROUNDING[stage]
    if (!tables?.length) return ""

    const admin = createAdminClient()
    const sections: string[] = []

    // Get project domain for relevant filtering
    const { data: project } = await admin
        .from("cad_lab_projects")
        .select("name, brief")
        .eq("id", projectId)
        .maybeSingle()
    const projectName = project?.name ?? "unknown"

    for (const table of tables) {
        try {
            switch (table) {
                case "material_properties": {
                    const { data } = await admin
                        .from("material_properties")
                        .select("name, category, density_kg_m3, tensile_strength_mpa, thermal_conductivity, cost_per_kg_usd, notes")
                        .limit(50)
                    if (data?.length) {
                        sections.push(
                            `\n--- MATERIAL PROPERTIES DATABASE (${data.length} materials) ---\n` +
                            `Use these real material values for grounding. Do NOT invent material properties.\n` +
                            JSON.stringify(data, null, 1).slice(0, 4000),
                        )
                    }
                    break
                }
                case "design_standards": {
                    const { data } = await admin
                        .from("design_standards")
                        .select("standard_code, title, domain, description, applicability")
                        .limit(30)
                    if (data?.length) {
                        sections.push(
                            `\n--- DESIGN STANDARDS DATABASE (${data.length} standards) ---\n` +
                            `Reference these real standards. Do NOT fabricate standard codes.\n` +
                            JSON.stringify(data, null, 1).slice(0, 4000),
                        )
                    }
                    break
                }
                case "process_capabilities": {
                    const { data } = await admin
                        .from("process_capabilities")
                        .select("process_name, material_compatibility, tolerance_mm, max_size, lead_time_days, cost_rating, notes")
                        .limit(30)
                    if (data?.length) {
                        sections.push(
                            `\n--- PROCESS CAPABILITIES DATABASE (${data.length} processes) ---\n` +
                            `Use these real manufacturing process specs for design-for-manufacturing assessments.\n` +
                            JSON.stringify(data, null, 1).slice(0, 3000),
                        )
                    }
                    break
                }
                case "marketplace_listings": {
                    // Get relevant supplier listings matching project domain
                    const { data } = await admin
                        .from("marketplace_listings")
                        .select("id, title, category, country, attributes")
                        .in("category", ["Products", "Services"])
                        .limit(30)
                    if (data?.length) {
                        sections.push(
                            `\n--- SUPPLIER DATABASE SAMPLE (${data.length} of 8,264+ listings) ---\n` +
                            `Real suppliers from the marketplace. Use for sourcing validation.\n` +
                            JSON.stringify(data.map((d) => ({ id: d.id, title: d.title, category: d.category, country: d.country })), null, 1).slice(0, 3000),
                        )
                    }
                    break
                }
            }
        } catch (err) {
            console.warn(`[parallel-llm] Failed to load grounding from ${table} for project ${projectId}:`, err instanceof Error ? err.message : err)
        }
    }

    if (!sections.length) return ""
    return `\n\n=== DATABASE GROUNDING (real production data — use for validation) ===\n` +
        `Project: ${projectName}\n` +
        sections.join("\n") +
        `\n=== END DATABASE GROUNDING ===\n`
}

// ── Core parallel-and-compare function ────────────────────────────────

/**
 * Runs 3 models from different lineages on the same prompt in parallel,
 * then uses gpt-4.1-mini to pick or synthesise the best output.
 *
 * @param systemPrompt - The system prompt for all 3 models
 * @param userPrompt - The user prompt for all 3 models (should include DB grounding)
 * @param stage - The autopilot stage (determines which model triad to use)
 * @param selectionCriteria - What makes one output "better" for the judge
 * @returns The best output plus all outputs for transparency
 */
export async function runParallelAndCompare(
    systemPrompt: string,
    userPrompt: string,
    stage: string,
    selectionCriteria: string,
): Promise<ParallelLLMResult> {
    const models = STAGE_MODEL_TRIADS[stage]
    if (!models?.length) {
        throw new Error(`[parallel-llm] No model triad configured for stage: ${stage}`)
    }

    console.info(`[parallel-llm] Starting parallel-and-compare for stage ${stage} with ${models.length} models: ${models.map((m) => m.displayName).join(", ")}`)

    // Run all 3 models in parallel
    const results = await Promise.allSettled(
        models.map(async (model) => {
            const start = Date.now()
            try {
                const output = await model.call(systemPrompt, userPrompt)
                const elapsed = Date.now() - start
                console.info(`[parallel-llm] ${model.displayName} completed in ${elapsed}ms (${output.length} chars)`)
                return { model: model.displayName, lineage: model.lineage, output, error: undefined }
            } catch (err) {
                const elapsed = Date.now() - start
                const errMsg = err instanceof Error ? err.message : String(err)
                console.warn(`[parallel-llm] ${model.displayName} failed after ${elapsed}ms: ${errMsg}`)
                return { model: model.displayName, lineage: model.lineage, output: "", error: errMsg }
            }
        }),
    )

    const allOutputs = results.map((r) =>
        r.status === "fulfilled"
            ? r.value
            : { model: "unknown", lineage: "unknown", output: "", error: r.reason?.message ?? "unknown error" },
    )

    const successfulOutputs = allOutputs.filter((o) => o.output.length > 100 && !o.error)

    // If only 1 model succeeded, use it directly (no judge needed)
    if (successfulOutputs.length <= 1) {
        const best = successfulOutputs[0] ?? allOutputs[0]
        console.info(`[parallel-llm] Only ${successfulOutputs.length} model(s) succeeded for stage ${stage}. Using ${best.model} directly.`)
        return {
            bestOutput: best.output,
            winnerModel: best.model,
            selectionReason: `Only ${successfulOutputs.length} model(s) returned usable output; ${best.model} used directly.`,
            allOutputs: allOutputs.map((o) => ({ model: o.model, output: o.output.slice(0, 500), error: o.error })),
            judgeUsed: false,
        }
    }

    // Use gpt-4.1-mini as cheap judge to pick the best
    const judgeSystem = `You are comparing ${successfulOutputs.length} outputs for a hardware product development pipeline stage.
Your job is to select the BEST output based on: ${selectionCriteria}

Return ONLY valid JSON:
{
  "winner": <1-based index of the best output>,
  "reason": "<1-2 sentences explaining why this output is best>",
  "synthesis_needed": false
}

If the best output can be significantly improved by incorporating specific elements from the others, set synthesis_needed to true and add:
  "synthesised_output": "<the improved version combining the best elements>"

Be decisive. Pick one winner. Only synthesise if the combination is clearly better than any individual.`

    const judgeUser = successfulOutputs
        .map((o, i) => `--- OUTPUT ${i + 1} (${o.model}, lineage: ${o.lineage}) ---\n${o.output.slice(0, 12000)}\n`)
        .join("\n")

    try {
        const { text: judgeText } = await callOpenAI(judgeSystem, judgeUser, "gpt-4.1-mini", 8192, 60_000)
        const cleaned = judgeText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
        const judgeResult = JSON.parse(cleaned) as {
            winner: number
            reason: string
            synthesis_needed: boolean
            synthesised_output?: string
        }

        const winnerIdx = Math.max(0, Math.min(judgeResult.winner - 1, successfulOutputs.length - 1))
        const winner = successfulOutputs[winnerIdx]

        const bestOutput = judgeResult.synthesis_needed && judgeResult.synthesised_output
            ? judgeResult.synthesised_output
            : winner.output

        console.info(`[parallel-llm] Judge selected ${winner.model} for stage ${stage}. Reason: ${judgeResult.reason}`)

        return {
            bestOutput,
            winnerModel: judgeResult.synthesis_needed ? `synthesised (led by ${winner.model})` : winner.model,
            selectionReason: judgeResult.reason,
            allOutputs: allOutputs.map((o) => ({ model: o.model, output: o.output.slice(0, 500), error: o.error })),
            judgeUsed: true,
        }
    } catch (judgeErr) {
        // Judge failed — fall back to the longest response among successful outputs
        // (longest = most thorough; better than defaulting to the first arbitrarily)
        const fallback = successfulOutputs.reduce((best, current) =>
            current.output.length > best.output.length ? current : best,
        )
        console.log(`[parallel-llm] Judge failed for stage ${stage}; falling back to longest response from ${fallback.model} (${fallback.output.length} chars). Judge error: ${judgeErr instanceof Error ? judgeErr.message : judgeErr}`)
        return {
            bestOutput: fallback.output,
            winnerModel: fallback.model,
            selectionReason: `Judge model failed; selected longest response (${fallback.output.length} chars) from ${fallback.model} as most thorough fallback.`,
            allOutputs: allOutputs.map((o) => ({ model: o.model, output: o.output.slice(0, 500), error: o.error })),
            judgeUsed: false,
        }
    }
}

// ── Chase 10-model multi-lineage lineup ──────────────────────────────

/**
 * 10 models from 10 different training lineages for Chase (Stage 1).
 * Lineage diversity is the primary mechanism for catching hallucinated
 * sources and achieving factual cross-validation on research synthesis.
 */
function buildChaseFullLineup(): ModelConfig[] {
    return [
        // 1. US OpenAI — strongest general-purpose frontier
        makeOpenAIModel("gpt-5.5", "GPT-5.5"),
        // 2. China DeepSeek — deep reasoning, different RLHF priors
        makeDeepSeekModel(),
        // 3. US Google — best long-document research synthesis
        makeGeminiModel("gemini-3.1-pro-preview", "Gemini 3.1 Pro"),
        // 4. China Moonshot — different open-weight lineage, multimodal
        {
            id: "moonshotai/kimi-k2.6",
            displayName: "Kimi K2.6",
            lineage: "Moonshot (China)",
            call: async (system, user) => {
                const apiKey = process.env.OPENROUTER_API_KEY?.trim()
                if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured")
                const response = await fetchWithTimeout(
                    "https://openrouter.ai/api/v1/chat/completions",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                        body: JSON.stringify({
                            model: "moonshotai/kimi-k2.6",
                            max_tokens: 16000,
                            temperature: 0.2,
                            messages: [
                                { role: "system", content: system },
                                { role: "user", content: user },
                            ],
                        }),
                    },
                    180_000,
                )
                if (!response.ok) {
                    const errText = await response.text()
                    throw new Error(`Kimi K2.6 error (${response.status}): ${errText.slice(0, 300)}`)
                }
                const data = await response.json()
                const content = data.choices?.[0]?.message?.content ?? ""
                const reasoning = data.choices?.[0]?.message?.reasoning_content ?? ""
                return content || reasoning
            },
        },
        // 5. China Alibaba MoE — Qwen 3 235B, strong JSON + logic
        makeQwenModel(),
        // 6. US xAI — adversarial lineage, willing to challenge consensus
        {
            id: "x-ai/grok-4.3",
            displayName: "Grok 4.3",
            lineage: "xAI (US)",
            call: async (system, user) => {
                const apiKey = process.env.OPENROUTER_API_KEY?.trim()
                if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured")
                const response = await fetchWithTimeout(
                    "https://openrouter.ai/api/v1/chat/completions",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                        body: JSON.stringify({
                            model: "x-ai/grok-4.3",
                            max_tokens: 16000,
                            temperature: 0.2,
                            messages: [
                                { role: "system", content: system },
                                { role: "user", content: user },
                            ],
                        }),
                    },
                    180_000,
                )
                if (!response.ok) {
                    const errText = await response.text()
                    throw new Error(`Grok-3 error (${response.status}): ${errText.slice(0, 300)}`)
                }
                const data = await response.json()
                return data.choices?.[0]?.message?.content ?? ""
            },
        },
        // 7. EU Mistral — different non-US priors, catches US-default assumptions
        {
            id: "mistralai/mistral-large-2407",
            displayName: "Mistral Large",
            lineage: "Mistral (EU)",
            call: async (system, user) => {
                const apiKey = process.env.OPENROUTER_API_KEY?.trim()
                if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured")
                const response = await fetchWithTimeout(
                    "https://openrouter.ai/api/v1/chat/completions",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                        body: JSON.stringify({
                            model: "mistralai/mistral-large-2407",
                            max_tokens: 16000,
                            temperature: 0.2,
                            messages: [
                                { role: "system", content: system },
                                { role: "user", content: user },
                            ],
                        }),
                    },
                    180_000,
                )
                if (!response.ok) {
                    const errText = await response.text()
                    throw new Error(`Mistral Large error (${response.status}): ${errText.slice(0, 300)}`)
                }
                const data = await response.json()
                return data.choices?.[0]?.message?.content ?? ""
            },
        },
        // 8. China Alibaba 1M-context — Qwen3.6-Plus, ideal for long research prompts
        {
            id: "qwen/qwen3.6-plus",
            displayName: "Qwen3.6-Plus",
            lineage: "Alibaba 1M-ctx (China)",
            call: async (system, user) => {
                const apiKey = process.env.OPENROUTER_API_KEY?.trim()
                if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured")
                const response = await fetchWithTimeout(
                    "https://openrouter.ai/api/v1/chat/completions",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                        body: JSON.stringify({
                            model: "qwen/qwen3.6-plus",
                            max_tokens: 16000,
                            temperature: 0.2,
                            messages: [
                                { role: "system", content: system },
                                { role: "user", content: user },
                            ],
                        }),
                    },
                    180_000,
                )
                if (!response.ok) {
                    const errText = await response.text()
                    throw new Error(`Qwen3.6-Plus error (${response.status}): ${errText.slice(0, 300)}`)
                }
                const data = await response.json()
                const content = data.choices?.[0]?.message?.content ?? ""
                const reasoning = data.choices?.[0]?.message?.reasoning_content ?? ""
                return content || reasoning
            },
        },
        // 9. China DeepSeek Flash — faster DeepSeek tier, different temperature regime
        {
            id: "deepseek/deepseek-v4-flash",
            displayName: "DeepSeek V4-Flash",
            lineage: "DeepSeek Flash (China)",
            call: async (system, user) => {
                const apiKey = process.env.OPENROUTER_API_KEY?.trim()
                if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured")
                const response = await fetchWithTimeout(
                    "https://openrouter.ai/api/v1/chat/completions",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                        body: JSON.stringify({
                            model: "deepseek/deepseek-v4-flash",
                            max_tokens: 16000,
                            temperature: 0.2,
                            messages: [
                                { role: "system", content: system },
                                { role: "user", content: user },
                            ],
                        }),
                    },
                    180_000,
                )
                if (!response.ok) {
                    const errText = await response.text()
                    throw new Error(`DeepSeek V4-Flash error (${response.status}): ${errText.slice(0, 300)}`)
                }
                const data = await response.json()
                const content = data.choices?.[0]?.message?.content ?? ""
                const reasoning = data.choices?.[0]?.message?.reasoning_content ?? ""
                return content || reasoning
            },
        },
        // 10. US Google Flash — faster Gemini tier, different reasoning path
        makeGeminiModel("gemini-2.5-flash", "Gemini 2.5 Flash"),
    ]
}

// ── Tournament bracket judge helper ──────────────────────────────────

async function judgeGroup(
    candidates: Array<{ model: string; lineage: string; output: string }>,
    selectionCriteria: string,
    roundLabel: string,
): Promise<{ model: string; lineage: string; output: string }> {
    if (candidates.length === 1) return candidates[0]

    const judgeSystem = `You are comparing ${candidates.length} research outputs for a hardware product development pipeline.

Evaluate each output on these 5 dimensions:
1. SOURCE DIVERSITY — Does it include academic papers (with DOIs), patents (with patent numbers), government/standards documents, company primary sources, and market reports? More source categories = better.
2. COMPETITOR ANALYSIS — Are there 8+ named competitors with measurable differentiators (quantitative specs, not generic adjectives)? Is the competitor table complete (not truncated)?
3. REGULATORY COVERAGE — Are specific standard numbers cited (e.g. IEC 62619, UL 9540A)? Are certification pathways named with test labs, timelines, and cost estimates?
4. MARKET SIZING — Are TAM/SAM/SOM figures sourced (not invented)? Are growth rates cited from named reports?
5. RESEARCH DEPTH — Are claims backed by evidence, or are they generic statements? Does it read like a literature review or a blog post?

Additional criteria: ${selectionCriteria}

Pick the candidate that scores highest ACROSS ALL 5 dimensions. If one candidate has clearly better sources but weaker analysis, prefer the one with better sources — downstream stages can improve analysis but cannot invent sources.

Return ONLY a JSON object with no markdown fences: { "winner": <1-based index>, "reason": "<1-2 sentences citing which dimensions decided it>" }`

    const judgeUser = candidates
        .map((c, i) => `--- OUTPUT ${i + 1} (${c.model}, lineage: ${c.lineage}) ---\n${c.output.slice(0, 12000)}\n`)
        .join("\n")

    try {
        const { text: judgeText } = await callOpenAI(judgeSystem, judgeUser, "gpt-4.1-mini", 4096, 60_000)
        const cleaned = judgeText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
        const result = JSON.parse(cleaned) as { winner: number; reason: string }
        const winnerIdx = Math.max(0, Math.min(result.winner - 1, candidates.length - 1))
        console.info(`[parallel-llm] ${roundLabel}: judge picked candidate ${result.winner} (${candidates[winnerIdx].model}). Reason: ${result.reason}`)
        return candidates[winnerIdx]
    } catch (err) {
        // Judge failed — pick longest response as fallback
        const fallback = candidates.reduce((best, c) => c.output.length > best.output.length ? c : best)
        console.warn(`[parallel-llm] ${roundLabel}: judge failed, using longest response (${fallback.model}, ${fallback.output.length} chars). Error: ${err instanceof Error ? err.message : err}`)
        return fallback
    }
}

/**
 * Runs 10 models from different lineages in parallel for Chase (Stage 1),
 * then uses a tournament bracket with gpt-4.1-mini as judge to select the best.
 *
 * Tournament structure:
 *   Round 1: 4 groups of ~2-3 models each → 4 group winners
 *   Round 2 (final): 4 group winners → 1 overall winner
 *
 * Requires at least 5 successful responses to proceed. If fewer succeed,
 * falls back to whatever we have (or the single-model path if only 1 succeeded).
 *
 * @param systemPrompt - The system prompt for all models
 * @param userPrompt   - The user prompt (should include DB grounding)
 * @param selectionCriteria - What makes one output "better" for the judge
 * @returns The winning output with metadata
 */
export async function runChaseMultiLineage(
    systemPrompt: string,
    userPrompt: string,
    selectionCriteria: string,
): Promise<ParallelLLMResult> {
    const models = buildChaseFullLineup()
    const MIN_SUCCESSFUL = 5

    console.info(`[parallel-llm] Chase multi-lineage: launching ${models.length} models in parallel — ${models.map((m) => m.displayName).join(", ")}`)

    const PER_MODEL_TIMEOUT_MS = 120_000 // 120s per model — prevents one slow model from blocking the entire function

    // Run all models in parallel, collect results gracefully
    const settled = await Promise.allSettled(
        models.map(async (model) => {
            const start = Date.now()
            try {
                const output = await Promise.race([
                    model.call(systemPrompt, userPrompt),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error(`Timeout after ${PER_MODEL_TIMEOUT_MS / 1000}s`)), PER_MODEL_TIMEOUT_MS),
                    ),
                ])
                const elapsed = Date.now() - start
                console.info(`[parallel-llm] Chase ${model.displayName} completed in ${elapsed}ms (${output.length} chars)`)
                return { model: model.displayName, lineage: model.lineage, output, error: undefined }
            } catch (err) {
                const elapsed = Date.now() - start
                const errMsg = err instanceof Error ? err.message : String(err)
                console.warn(`[parallel-llm] Chase ${model.displayName} failed after ${elapsed}ms: ${errMsg}`)
                return { model: model.displayName, lineage: model.lineage, output: "", error: errMsg }
            }
        }),
    )

    const allOutputs = settled.map((r) =>
        r.status === "fulfilled"
            ? r.value
            : { model: "unknown", lineage: "unknown", output: "", error: r.reason?.message ?? "unknown error" },
    )

    const successful = allOutputs.filter((o) => o.output.length > 100 && !o.error)

    console.info(`[parallel-llm] Chase multi-lineage: ${successful.length}/${models.length} models returned usable output`)

    // Not enough successful responses — use what we have with a warning
    if (successful.length < MIN_SUCCESSFUL) {
        console.warn(`[parallel-llm] Chase multi-lineage: only ${successful.length} models succeeded (minimum ${MIN_SUCCESSFUL}). Proceeding with available responses.`)
    }

    // If only 1 (or 0) succeeded, skip tournament entirely
    if (successful.length <= 1) {
        const best = successful[0] ?? allOutputs[0]
        return {
            bestOutput: best.output,
            winnerModel: best.model,
            selectionReason: `Only ${successful.length} model(s) returned usable output; ${best.model} used directly.`,
            allOutputs: allOutputs.map((o) => ({ model: o.model, output: o.output.slice(0, 500), error: o.error })),
            judgeUsed: false,
        }
    }

    // If 5 or fewer succeeded, skip tournament and do a single judge call
    if (successful.length <= 5) {
        console.info(`[parallel-llm] Chase: ${successful.length} successful — direct judge call (no tournament needed)`)
        const winner = await judgeGroup(successful as Array<{ model: string; lineage: string; output: string }>, selectionCriteria, "Direct judge")
        return {
            bestOutput: winner.output,
            winnerModel: winner.model,
            selectionReason: `Direct judge (${successful.length} models): ${winner.model} selected.`,
            allOutputs: allOutputs.map((o) => ({ model: o.model, output: o.output.slice(0, 500), error: o.error })),
            judgeUsed: true,
        }
    }

    // Tournament bracket: split into 4 groups, judge each group, then judge the 4 winners
    const successfulCandidates = successful as Array<{ model: string; lineage: string; output: string }>
    const groupCount = 4
    const groups: Array<Array<{ model: string; lineage: string; output: string }>> = [[], [], [], []]
    successfulCandidates.forEach((c, i) => groups[i % groupCount].push(c))

    console.info(`[parallel-llm] Chase tournament Round 1: ${groupCount} groups of sizes [${groups.map((g) => g.length).join(", ")}]`)

    // Round 1: judge each group in parallel
    const round1Winners = await Promise.all(
        groups
            .filter((g) => g.length > 0)
            .map((group, i) => judgeGroup(group, selectionCriteria, `Round 1 Group ${i + 1}`)),
    )

    console.info(`[parallel-llm] Chase tournament Round 2 (final): ${round1Winners.length} finalists — ${round1Winners.map((w) => w.model).join(", ")}`)

    // Round 2 (final): judge the group winners
    const overallWinner = await judgeGroup(round1Winners, selectionCriteria, "Round 2 Final")

    console.info(`[parallel-llm] Chase multi-lineage winner: ${overallWinner.model}`)

    // ── Synthesis step: take TOP 3 outputs and ask gpt-4.1-mini to synthesise
    // the best elements of all three into a final output. This produces richer
    // research than any single model alone (council recommendation 2026-04-30).
    //
    // The top-3 candidates are: the overall winner + the other Round 1 group
    // winners (since they were the best from their respective lineage groups).
    // We cap at 3 to keep the synthesis prompt focused.
    let finalOutput = overallWinner.output
    let winnerModelLabel = overallWinner.model

    const top3Candidates = [overallWinner, ...round1Winners.filter(w => w.model !== overallWinner.model)].slice(0, 3)

    if (top3Candidates.length >= 2) {
        try {
            const synthSystem = `You are a world-class hardware product research analyst. You will be given ${top3Candidates.length} research reports on the same product from different AI research models. Your task is to synthesise the BEST ELEMENTS from all of them into a single, unified research report that is strictly better than any individual input.

You are synthesising the best Chase research output from ${top3Candidates.length} independent models. Do NOT pick a single winner — instead, for EACH section of the report, take the strongest version from whichever model produced it:
- Competitors: use whichever model listed the most competitors with the best quantitative data (specific metrics, not adjectives)
- Regulatory: use whichever model cited the most specific standard numbers and certification pathways (e.g. "IEC 62619:2022" not "battery safety standards")
- Sources/Bibliography: MERGE all unique sources from all ${top3Candidates.length} models (deduplicate by DOI/URL) — the combined source list must be richer than any single model's list
- Market sizing: use whichever model provided the most granular TAM/SAM/SOM with methodology and named sources
- Technical specifications: use whichever model provided the most specific numbers with units

Additional rules:
- Preserve factual specificity: keep specific numbers, regulations, competitor names, market figures, patent numbers, DOIs
- Resolve contradictions by picking the most credible/specific claim
- The output must be structured as a single coherent research report, not a comparison
- Do NOT mention that this is synthesised from multiple sources
- Never truncate — the combined report should be longer than any single input; if space is needed, drop the least relevant competitor rather than cutting mid-table
- Output ONLY the final synthesised research text, nothing else`

            const synthUser = `Synthesise these ${top3Candidates.length} research reports into the best possible single report:\n\n` +
                top3Candidates.map((c, i) => `=== REPORT ${i + 1} (${c.model}) ===\n${c.output}`).join("\n\n")

            const { text: synthesised } = await callOpenAI(synthSystem, synthUser, "gpt-4.1-mini", 8192, 120_000)

            if (synthesised && synthesised.length > 500) {
                console.info(
                    `[parallel-llm] Chase synthesis: merged top-${top3Candidates.length} (${top3Candidates.map(c => c.model).join(", ")}) → ${synthesised.length} chars`,
                )
                finalOutput = synthesised
                winnerModelLabel = `synthesised(top-${top3Candidates.length}: ${overallWinner.model}+)`
            }
        } catch (synthErr) {
            // Non-fatal: synthesis failed, fall back to tournament winner
            console.warn(
                `[parallel-llm] Chase synthesis failed (non-fatal), using tournament winner:`,
                synthErr instanceof Error ? synthErr.message : synthErr,
            )
        }
    }

    return {
        bestOutput: finalOutput,
        winnerModel: winnerModelLabel,
        selectionReason: `Tournament bracket (${successfulCandidates.length} models, ${round1Winners.length} finalists): ${overallWinner.model} won → synthesised with top-${top3Candidates.length}.`,
        allOutputs: allOutputs.map((o) => ({ model: o.model, output: o.output.slice(0, 500), error: o.error })),
        judgeUsed: true,
    }
}

// ── Convenience wrapper matching callClaude/callOpenAI signature ─────

/**
 * Drop-in replacement for callClaude / callOpenAI in specialist functions.
 * Runs 3 models in parallel, picks the best, returns { text, tokensIn, tokensOut }
 * so the caller's JSON parsing logic works unchanged.
 *
 * Also injects database grounding data into the user prompt automatically
 * if the stage has configured grounding tables.
 */
export async function callParallelAndCompare(
    systemPrompt: string,
    userPrompt: string,
    stage: string,
    selectionCriteria: string,
    projectId?: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
    // Inject database grounding if configured for this stage
    let groundedUserPrompt = userPrompt
    if (projectId) {
        try {
            const groundingData = await loadGroundingData(stage, projectId)
            if (groundingData) {
                groundedUserPrompt = userPrompt + groundingData
                console.info(`[parallel-llm] Injected DB grounding (${groundingData.length} chars) for stage ${stage}, project ${projectId}`)
            }
        } catch (err) {
            console.warn(`[parallel-llm] DB grounding failed (non-fatal):`, err instanceof Error ? err.message : err)
        }
    }

    const result = await runParallelAndCompare(systemPrompt, groundedUserPrompt, stage, selectionCriteria)

    console.info(
        `[parallel-llm] callParallelAndCompare result for stage ${stage}: ` +
        `winner=${result.winnerModel}, judgeUsed=${result.judgeUsed}, ` +
        `reason=${result.selectionReason.slice(0, 100)}`,
    )

    return {
        text: result.bestOutput,
        tokensIn: 0,
        tokensOut: 0,
    }
}
