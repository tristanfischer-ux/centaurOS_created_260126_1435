/**
 * @file models.ts — Central manifest of LLM model IDs used across ForgeOS.
 *
 * @description Single source of truth for every Anthropic, Google, OpenAI, and
 * DeepSeek model ID the app calls. Upgrading a model means bumping one entry
 * here, NOT scattering changes across 35 files.
 *
 * ## When to update this file
 *
 * 1. Anthropic/Google/OpenAI ships a newer model you want to adopt.
 * 2. A provider deprecates a model you were using.
 * 3. A benchmark run proves a newer model is better for a specialist (see
 *    CLAUDE.md "Specialist Configuration Protocol" — specialist-tier model
 *    promotion is benchmark-gated; the manifest reflects the decision after
 *    the benchmark run, not before).
 *
 * ## What the automated monitor does
 *
 * `.github/workflows/check-model-versions.yml` runs weekly on Mondays. It
 * queries each provider's models endpoint and compares against this manifest.
 * If a provider has a newer version of a model family we use (e.g. Opus 4.8
 * ships while we're on 4.7), the workflow opens a GitHub issue summarising
 * what's newer, which files reference the old version, and what the one-line
 * manifest change would look like. The workflow NEVER auto-upgrades — model
 * swaps go through code review.
 *
 * @related
 * - Upgrade history: commits that bumped specific aliases (see git blame).
 * - Benchmark gate: experiments/autoagent-strategy-specialist/benchmark/
 */

/** Claude model IDs. Anthropic's model string format is `claude-<family>-<major>-<minor>[-<timestamp>]`. */
export const ANTHROPIC_MODELS = {
  /** Highest-capability Claude model. Default for CAD Lab, design reconciliation,
   *  vision scoring, specialist overview generation. Bumped 2026-04-18 from 4-6. */
  opus: "claude-opus-4-7",
  /** Fast, balanced. Default for commodity generation tasks. */
  sonnet: "claude-sonnet-4-6",
  /** Cheap + fast. Default for classification, short summaries, embeddings-adjacent. */
  haiku: "claude-haiku-4-5-20251001",
} as const

export type AnthropicModelId = (typeof ANTHROPIC_MODELS)[keyof typeof ANTHROPIC_MODELS]

/** Google Gemini model IDs. Used as fallback in the CAD Lab breakdown pipeline
 *  and for image generation (nanobanana / gemini-pro-preview). */
export const GOOGLE_MODELS = {
  gemini_pro: "gemini-3.1-pro-preview",
  /** Cheap, fast flash tier. Bumped 2026-05-29 from gemini-2.5-flash — Gemini 3.5 Flash is GA. */
  gemini_flash: "gemini-3.5-flash",
  /** Cheapest tier — classification, extraction, supplier enrichment. The flash-lite family
   *  tops out at 3.1 (no 3.5-lite exists). Used by scripts/ingest/enrich-new-suppliers.ts. */
  gemini_flash_lite: "gemini-3.1-flash-lite",
} as const

export type GoogleModelId = (typeof GOOGLE_MODELS)[keyof typeof GOOGLE_MODELS]

/** OpenAI model IDs. Used as final-fallback in CAD Lab breakdown. */
export const OPENAI_MODELS = {
  gpt5: "gpt-5.5",
  /** GPT-4.1 mini — Sal (sales-lead) primary as of 2026-04-25 swap. */
  gpt41_mini: "gpt-4.1-mini",
} as const

export type OpenAIModelId = (typeof OPENAI_MODELS)[keyof typeof OPENAI_MODELS]

/** DeepSeek model IDs. Used for specialists switched off Claude after the
 *  April 7 2026 cross-model benchmark (see CLAUDE.md). */
export const DEEPSEEK_MODELS = {
  v4: "deepseek-v4",
  /** V4-Pro reasoning routed via Together — Finn (finance-lead) primary as of 2026-04-25. */
  v4_pro_together: "deepseek-ai/DeepSeek-V4-Pro",
} as const

export type DeepSeekModelId = (typeof DEEPSEEK_MODELS)[keyof typeof DEEPSEEK_MODELS]

/** Qwen model IDs. Routed via DashScope (Alibaba publisher) or Together (mirror). */
export const QWEN_MODELS = {
  /** Fang (vp-manufacturing) primary as of 2026-04-25 swap. */
  qwen3_235b: "qwen3-235b-a22b",
} as const

export type QwenModelId = (typeof QWEN_MODELS)[keyof typeof QWEN_MODELS]

/** OpenRouter model IDs — the PDF-generation ENGINE (`scripts/`) routes every LLM
 *  call through OpenRouter and is deliberately Anthropic-free. These are the
 *  canonical current ids (verified against openrouter.ai/api/v1/models 2026-05-29).
 *
 *  This block is the single place to bump the engine's models. It is enforced by
 *  `scripts/check-ai-models.sh` (the SessionStart hook now scans `scripts/` too, so a
 *  stale hardcoded id surfaces immediately). It is intentionally NOT wired into the
 *  weekly `/models` drift monitor: OpenRouter version labels are non-semantic
 *  (`x-ai/grok-4.20` sorts above `x-ai/grok-4.3` under tuple comparison) and would
 *  produce false "newer version" alerts. Bump these by hand when the routing docs
 *  (`~/.claude/docs/model-routing.md`) record a benchmark-backed promotion. */
export const OPENROUTER_MODELS = {
  // Frontier reasoning / second opinion
  gemini_pro:        "google/gemini-3.1-pro-preview",
  gpt5:              "openai/gpt-5.5",        // best coder/reasoner; high hallucination — cross-check facts
  // Honest review / adversarial / schema enforcement (low hallucination)
  grok:              "x-ai/grok-4.3",
  mimo:              "xiaomi/mimo-v2.5-pro",
  glm:               "z-ai/glm-5.2",
  // Structured reasoning + prose
  deepseek_pro:      "deepseek/deepseek-v4-pro",
  deepseek_flash:    "deepseek/deepseek-v4-flash",
  kimi:              "moonshotai/kimi-k2.6",
  qwen_max:          "qwen/qwen3.7-max",      // long-context (1M); replaced 3.6 Max 2026-05-24
  // Cheap bulk: classification / extraction / enrichment
  gemini_flash:      "google/gemini-3.5-flash",
  gemini_flash_lite: "google/gemini-3.1-flash-lite",
  gpt_mini:          "openai/gpt-4.1-mini",
} as const

export type OpenRouterModelId = (typeof OPENROUTER_MODELS)[keyof typeof OPENROUTER_MODELS]

/** Combined manifest — convenience for the monitor workflow and for code that
 *  wants one object to introspect. Keep this as the SINGLE shape the GitHub
 *  Action reads. Changing the shape requires updating the workflow too. */
export const MODELS = {
  anthropic: ANTHROPIC_MODELS,
  google: GOOGLE_MODELS,
  openai: OPENAI_MODELS,
  deepseek: DEEPSEEK_MODELS,
  qwen: QWEN_MODELS,
} as const

/** Version metadata — one entry per alias. Consumed by the weekly version
 *  monitor to decide whether a provider's newer model should prompt a PR.
 *  The monitor pattern-matches against the `family` field to detect newer
 *  versions (e.g. anthropic opus family → look for any claude-opus-*-* with
 *  a higher trailing version tuple). */
export const MODEL_METADATA = {
  "claude-opus-4-7":           { provider: "anthropic", family: "claude-opus", version: [4, 7] },
  "claude-sonnet-4-6":         { provider: "anthropic", family: "claude-sonnet", version: [4, 6] },
  "claude-haiku-4-5-20251001": { provider: "anthropic", family: "claude-haiku", version: [4, 5] },
  "gemini-3.1-pro-preview":    { provider: "google",    family: "gemini-pro", version: [3, 1] },
  "gemini-3.5-flash":          { provider: "google",    family: "gemini-flash", version: [3, 5] },
  "gemini-3.1-flash-lite":     { provider: "google",    family: "gemini-flash-lite", version: [3, 1] },
  "gpt-5.5":                   { provider: "openai",    family: "gpt-5", version: [5, 5] },
  "gpt-5.4":                   { provider: "openai",    family: "gpt-5", version: [5, 4] },
  "gpt-4.1-mini":              { provider: "openai",    family: "gpt-4.1-mini", version: [4, 1] },
  "deepseek-v4":               { provider: "deepseek",  family: "deepseek-v", version: [4, 0] },
  "deepseek-ai/DeepSeek-V4-Pro": { provider: "together", family: "deepseek-v4-pro", version: [4, 0] },
  "qwen3-235b-a22b":           { provider: "qwen",      family: "qwen3-235b", version: [3, 0] },
} as const satisfies Record<string, { provider: string; family: string; version: readonly [number, number] }>
