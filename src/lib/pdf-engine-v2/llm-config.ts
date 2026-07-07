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

  /** Brief-rewrite when revision loop iterates — small variation, but SEEDED so the same
   *  brief rewrites the same way run-to-run (determinism #86; Tristan 2026-06-29). */
  brief_rewriter: { temperature: 0.1, seed: 42 } as StageConfig,

  /** R1/R4 reviewers + plausibility critics — low variation, now SEEDED (determinism #86).
   *  A fixed seed does NOT collapse R1≡R4: each reviewer has a DIFFERENT prompt, so they
   *  still give independent looks — the seed only makes EACH reviewer reproducible across
   *  runs (same prompt + same seed → same look), which is what same-brief→same-scorecard needs. */
  reviewer: { temperature: 0.1, seed: 42 } as StageConfig,

  /** Physics critic — must be reproducible per design state to function as a
   *  stable gate signal. Greedy + fixed seed. */
  physics_critic: { temperature: 0, seed: 42 } as StageConfig,

  /** Generator — moderate variation for design synthesis, now SEEDED (determinism #86;
   *  Tristan 2026-06-29). This is the biggest cross-run variance source — an unseeded
   *  temp-0.2 generator produced DIFFERENT equipment sets run-to-run (v36 vs v37: v37 grew a
   *  Cip Tank + Cleaning Tank v36 lacked). The fixed seed keeps the moderate-temp exploration
   *  but makes it the SAME exploration each run, so the same brief yields the same design. */
  generator: { temperature: 0.2, seed: 42 } as StageConfig,

  /** Generator alt-candidate diversity scan — higher temperature to explore meaningfully
   *  different topologies. DELIBERATELY UNSEEDED: this stage is called N× IN ONE RUN to build a
   *  diverse candidate ENSEMBLE; a single fixed seed would collapse all N candidates to one
   *  identical output, killing the ensemble. (Per-member seeding seed=42+i would give in-run
   *  diversity AND cross-run reproducibility — a future refinement if the caller threads an index.) */
  generator_diversity: { temperature: 0.4, seed: null } as StageConfig,

  /** Scorer (best-of-N rank, council vote) — must be deterministic for the
   *  scorer to be a stable reward signal in RL / iteration loops. */
  scorer: { temperature: 0, seed: 42 } as StageConfig,

  /** Specialist agents (cost-repair, brief-prose-validate, cross-module-
   *  validate) — low variation for consistent edits across runs. */
  specialist: { temperature: 0, seed: 42 } as StageConfig,

  /** Brief targets reconciliation — emits a structured JSON edit; SEEDED so the same brief
   *  reconciles the same way each run (determinism #86; Tristan 2026-06-29). */
  brief_reconciliation: { temperature: 0.1, seed: 42 } as StageConfig,

  /** Phase 2 repair — gate-driven design patches. SEEDED + greedy so the same
   *  design + same failed gates produce identical repair patches across runs
   *  (determinism #86; Tristan 2026-07-07). Without this, Phase 2 was the #1
   *  source of non-determinism: it called OpenRouter directly (bypassing
   *  callLlm's cache), so every run got different patches even with temp=0. */
  phase2_repair: { temperature: 0, seed: 42 } as StageConfig,
} as const

export type StageName = keyof typeof LLM_CONFIG
