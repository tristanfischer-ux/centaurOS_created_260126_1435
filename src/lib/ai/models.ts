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
  gemini_flash: "gemini-2.5-flash",
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
  "gemini-2.5-flash":          { provider: "google",    family: "gemini-flash", version: [2, 5] },
  "gpt-5.5":                   { provider: "openai",    family: "gpt-5", version: [5, 5] },
  "gpt-5.4":                   { provider: "openai",    family: "gpt-5", version: [5, 4] },
  "gpt-4.1-mini":              { provider: "openai",    family: "gpt-4.1-mini", version: [4, 1] },
  "deepseek-v4":               { provider: "deepseek",  family: "deepseek-v", version: [4, 0] },
  "deepseek-ai/DeepSeek-V4-Pro": { provider: "together", family: "deepseek-v4-pro", version: [4, 0] },
  "qwen3-235b-a22b":           { provider: "qwen",      family: "qwen3-235b", version: [3, 0] },
} as const satisfies Record<string, { provider: string; family: string; version: readonly [number, number] }>
