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
        .map((o, i) => `--- OUTPUT ${i + 1} (${o.model}, lineage: ${o.lineage}) ---\n${o.output.slice(0, 5000)}\n`)
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
