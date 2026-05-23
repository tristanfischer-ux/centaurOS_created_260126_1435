/**
 * src/lib/pdf-engine-v2/llm-config.ts
 *
 * P2-2 (2026-05-23): centralised LLM temperature/seed/top-p configuration
 * per pipeline stage. WIRING_GAPS cross-cut #16 noted 13+ call sites with
 * inconsistent temperatures (0, 0.1, 0.2, 0.3, 0.4) producing different
 * reviewer/cost-stack/PDF output across runs. Reproducibility was poor and
 * the council-scorer reward signal was noisy.
 *
 * Discipline:
 *   - Deterministic stages (parser, scorer) use temperature 0 + seed when
 *     supported, so the same input produces the same output bit-for-bit.
 *   - Reviewers run at low temperature (0.1) for occasional alternate
 *     phrasings without semantic drift.
 *   - Generator at moderate temperature (0.2) for surface variation;
 *     diversity_scan at 0.4 for the alt-design candidate.
 *
 * Seeds: OpenRouter forwards `seed` to providers that support it
 * (Anthropic doesn't; OpenAI/Google do for greedy decoding). Setting a
 * fixed seed has no effect for unsupported providers — safe to include.
 *
 * To migrate a call site: replace inline `temperature: X` with
 * `...LLM_CONFIG.<stage>` so the temperature, seed, and any future
 * provider params (top_p, frequency_penalty) come from one place.
 */

export interface StageConfig {
  /** Sampling temperature — 0 for greedy, 0.1-0.4 for controlled variation. */
  temperature: number
  /** Optional fixed seed for deterministic-supported providers (OpenAI/Google). */
  seed: number | null
}

export const LLM_CONFIG = {
  /** Stage 1 brief parser — strict structured extraction, must be deterministic. */
  brief_parser: { temperature: 0, seed: 42 } as StageConfig,

  /** Brief-rewrite when revision loop iterates — small variation acceptable. */
  brief_rewriter: { temperature: 0.1, seed: null } as StageConfig,

  /** R1/R4 reviewers + plausibility critics — low variation, no fixed seed
   *  (we want different reviewers' independent looks, not identical replays). */
  reviewer: { temperature: 0.1, seed: null } as StageConfig,

  /** Physics critic — must be reproducible per design state to function as a
   *  stable gate signal. Greedy + fixed seed. */
  physics_critic: { temperature: 0, seed: 42 } as StageConfig,

  /** Generator — moderate variation for design synthesis. */
  generator: { temperature: 0.2, seed: null } as StageConfig,

  /** Generator alt-candidate diversity scan — higher temperature to explore
   *  meaningfully different topologies, not just rephrasings. */
  generator_diversity: { temperature: 0.4, seed: null } as StageConfig,

  /** Scorer (best-of-N rank, council vote) — must be deterministic for the
   *  scorer to be a stable reward signal in RL / iteration loops. */
  scorer: { temperature: 0, seed: 42 } as StageConfig,

  /** Specialist agents (cost-repair, brief-prose-validate, cross-module-
   *  validate) — low variation for consistent edits across runs. */
  specialist: { temperature: 0, seed: 42 } as StageConfig,

  /** Brief targets reconciliation — small variation tolerable as the LLM
   *  emits a structured JSON edit; greedy would be fine too. */
  brief_reconciliation: { temperature: 0.1, seed: null } as StageConfig,
} as const

export type StageName = keyof typeof LLM_CONFIG
