/**
 * OpenRouter model registry for pdf-engine-v2.
 *
 * Centralised place for model IDs and capability helpers. Use these constants
 * instead of inlining model slugs at callsites — that way model upgrades only
 * touch one file.
 *
 * Pricing + benchmark data: see ~/.claude/docs/benchmark-data-2026-05.md
 */

// ─── Frontier models (high intelligence, high cost) ─────────────────────────

/** GPT-5.5 xhigh — top intelligence (60), 94% hallucination risk. Avoid for facts. */
export const GPT_5_5_XHIGH = 'openai/gpt-5.5'

/** Gemini 3.1 Pro Preview — #1 Omniscience (+33), 50% hallucination, best raw knowledge. */
export const GEMINI_3_1_PRO = 'google/gemini-3.1-pro-preview'

/** Claude Opus 4.7 — #2 Omniscience (+26), 36% hallucination, best agentic intelligence. */
export const CLAUDE_OPUS_4_7 = 'anthropic/claude-opus-4-7'

/** Grok 4.3 — joint-lowest hallucination (25%), IFBench #1, +18 Omniscience. Honest workhorse. */
export const GROK_4_3 = 'x-ai/grok-4.3'

// ─── Asian-lineage models (training-data diversity) ─────────────────────────

/** MiMo V2.5 Pro (Xiaomi) — 25% hallucination, +4 Omniscience, consumer-electronics manufacturing prior. */
export const MIMO_V2_5_PRO = 'xiaomi/mimo-v2.5-pro'

/** Qwen 3.6 Max Preview (Alibaba) — 46% hallucination, +4 Omniscience, B2B supply chain prior. NOTE: intermittent OpenRouter HTTP 400 — drawer forgeos_gotchas_a19eb8ce377fa87d. */
export const QWEN_3_6_MAX = 'qwen/qwen3.6-max-preview'

/** Kimi K2.6 (Moonshot) — 44% hallucination, long-context lineage. NOTE: intermittent OpenRouter unavailability — drawer forgeos_gotchas_a19eb8ce377fa87d. */
export const KIMI_K2_6 = 'moonshotai/kimi-k2.6'

/** GLM-5.1 (Zhipu / Tsinghua) — 29% hallucination, IFBench top, schema-strict. Good judge. */
export const GLM_5_1 = 'z-ai/glm-5.1'

// ─── Mid-tier / efficient models ────────────────────────────────────────────

/** Claude Sonnet 4.6 — 51 intelligence, IFBench mid. Independent vendor breadth check. */
export const CLAUDE_SONNET_4_6 = 'anthropic/claude-sonnet-4-6'

/** Claude Haiku 4.5 — 26% hallucination (surprisingly honest), 106 tok/s, £0.66/M.
 *  Best cheap option for plausibility / fact-check tasks where honesty matters. */
export const CLAUDE_HAIKU_4_5 = 'anthropic/claude-haiku-4.5'

// ─── Fast extraction / data-ops models (added 2026-05-13) ────────────────────

/**
 * Gemini 3.1 Flash-Lite — GA 2026-05-08.
 *
 * **The fast-cheap workhorse for extraction, plausibility checks, and high-volume
 * structured data ops in the pipeline.** Use this instead of DeepSeek V4-Flash
 * (96% hallucination — disqualified for extraction-from-search use cases).
 *
 * Capabilities:
 *   • 329 tok/s output speed (2.5× Gemini 2.5 Flash)
 *   • 1M token context window
 *   • Multimodal native (text + image + video + audio)
 *   • Dynamic thinking levels: minimal | low | medium | high
 *     (trade reasoning depth ↔ latency ↔ cost per call)
 *   • 86.9% GPQA Diamond despite "Lite" branding
 *   • **Native Grounding with Google Search** — the API can cross-reference
 *     real-time web data before answering. For factual queries this drops the
 *     effective hallucination rate near zero by externalising the knowledge check.
 *
 * **Hallucination rate: 8.2%** (per independent hallucination-leaderboard tracking
 * as of 2026-05). Best in the cheap tier — better than Claude Haiku 4.5 (26%),
 * Grok 4.3 (25%), MiMo V2.5 Pro (25%). Google specifically targeted this by
 * making the model refuse-to-answer rather than bluff when parametric knowledge
 * is missing (the "Omniscience Bluffing Factor" they explicitly fixed in 3.1).
 *
 * Pricing (per 1M tokens):
 *   • Input (text/image/video): $0.25  ← cheapest in our short-list
 *   • Input (audio):            $0.50
 *   • Output:                   $1.50
 *   • Cache hit:                $0.025  (90% savings on repetitive prompts)
 *
 * Best fit in this pipeline:
 *   • Stage 13 Assembly Partner Discovery — extract company names from search results
 *   • Stage 7 plausibility check — use `thinking_level: 'medium'` + grounding=true
 *     for "does this character_id correspond to a real part?" verdicts. This single
 *     call replaces the previously-planned dual-prong (LLM + Tavily) approach when
 *     real-time web grounding is sufficient.
 *   • Stage 0.5 brief expansion — replaces DeepSeek V4-Flash
 *   • High-volume corpus search result summarisation
 *
 * Thinking-level trade-offs in this pipeline:
 *   • 'minimal' — pure paraphrase / format transformation. ~£0.0003/call.
 *   • 'low'     — extraction from already-trusted source text (Tavily results, BoM rows). Default.
 *   • 'medium'  — plausibility check, multi-hop reasoning on structured data.
 *   • 'high'    — generation of investment-grade prose; complex schema enforcement.
 *
 * Not ideal for: investment-grade prose generation (still use Grok 4.3 + Gemini 3.1 Pro
 * + Claude Opus for breadth and 25% hallucination), grammar-rule violation analysis
 * (use Claude Opus 4.7 for agentic intelligence).
 */
export const GEMINI_3_1_FLASH_LITE = 'google/gemini-3.1-flash-lite'

// ─── Disqualified for factual tasks (high hallucination — do NOT use as judge or fact-extractor) ──

/** DeepSeek V4 Pro — 94% hallucination, -10 Omniscience. Disqualified. */
export const DEEPSEEK_V4_PRO_DO_NOT_USE = 'deepseek/deepseek-v4-pro'

/** DeepSeek V4 Flash — 96% hallucination, -23 Omniscience. Disqualified. */
export const DEEPSEEK_V4_FLASH_DO_NOT_USE = 'deepseek/deepseek-v4-flash'

// ─── Helper: minimal OpenRouter call for fast extraction ────────────────────

export interface FastExtractOpts {
  /** Reasoning depth for Gemini 3.1 Flash-Lite. Default 'low' for extraction tasks. */
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'
  /**
   * Enable Gemini 3.1 Flash-Lite native Grounding with Google Search.
   * When true, the model cross-references real-time web data before answering.
   * Effectively drops hallucination rate near zero for factual queries.
   * Use for: Stage 7 plausibility checks, vendor catalog verification,
   * assembly-partner spot checks. Adds ~£0.001/call for the grounded lookup.
   * Default: false (caller opts in).
   */
  groundWithGoogleSearch?: boolean
  /** Sampling temperature. Default 0 for deterministic extraction. */
  temperature?: number
  /** Output token cap. Default 32_000. */
  maxTokens?: number
  /** Optional system prompt. */
  systemPrompt?: string
  /** Optional model override (default Gemini 3.1 Flash-Lite). */
  model?: string
  /** Timeout in ms. Default 60_000 (Flash-Lite is fast; this is a hard cap). */
  timeoutMs?: number
}

/**
 * Call Gemini 3.1 Flash-Lite (or another fast extraction model) via OpenRouter.
 *
 * Throws on non-200 response or finish_reason !== 'stop'. The throw signal
 * lets caller fall back to a different model — typical pattern is
 * `await callFastExtract(...).catch(() => callFastExtract(..., { model: GROK_4_3 }))`.
 *
 * No JSON parsing — returns raw text. Caller is responsible for parse + validation.
 *
 * @example
 *   const text = await callFastExtract(
 *     'Extract company names from these search results: <results>',
 *     { systemPrompt: 'Output ONLY a JSON array of company names. Do NOT invent.', maxTokens: 8_000 }
 *   )
 */
export async function callFastExtract(
  userContent: string,
  opts: FastExtractOpts = {},
): Promise<string> {
  const model = opts.model ?? GEMINI_3_1_FLASH_LITE
  const messages: Array<{ role: 'system' | 'user'; content: string }> = []
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt })
  messages.push({ role: 'user', content: userContent })

  // AbortController + setTimeout — NOT AbortSignal.timeout (Vercel unreliable per MEMORY.md).
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000)

  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens ?? 32_000,
        // Gemini 3.1 Flash-Lite specific options (no-op on other models).
        ...(model === GEMINI_3_1_FLASH_LITE
          ? {
              // thinking_level — default 'low' for extraction; 'medium' for plausibility
              // judgement; 'minimal' for pure paraphrase; 'high' for complex schema.
              thinking_level: opts.thinkingLevel ?? 'low',
              // Grounding with Google Search — drops effective hallucination near zero
              // for factual queries by cross-referencing real-time web data. Caller
              // opts in via groundWithGoogleSearch=true (e.g. plausibility check,
              // vendor-catalog verification, assembly-partner spot check).
              ...(opts.groundWithGoogleSearch
                ? { google_search_grounding: { enabled: true } }
                : {}),
            }
          : {}),
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`OpenRouter status ${response.status} from ${model}`)
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  }
  const choice = json.choices?.[0]
  const finishReason = choice?.finish_reason
  if (finishReason && finishReason !== 'stop' && finishReason !== 'tool_calls') {
    console.error(
      `[fast-extract] TRUNCATION DETECTED: finish_reason='${finishReason}' model=${model} (raise max_tokens?)`,
    )
    throw new Error(`finish_reason='${finishReason}' (likely truncation)`)
  }
  return (choice?.message?.content ?? '').trim()
}
