# MODELS.md — which LLM runs each non-deterministic chain stage

> **Single source of truth (the registry):** `src/lib/pdf-engine-v2/lib/openrouter-models.ts` — change a model THERE, not at call sites.
> **The pipeline is Anthropic-free in production.** Everything below runs via **OpenRouter**. The `CLAUDE_*` constants in the registry are for evaluation/comparison only (the one real Anthropic dependency is the out-of-pipeline `scripts/score-radical-pdfs-multimodal.py` eval tool).
> **Benchmark basis:** `~/.claude/docs/benchmark-data-2026-05.md` (Artificial Analysis, 2026-05-13) + routing rules `~/.claude/docs/model-routing.md`.
> Last audited: 2026-06-18.

## The deterministic half uses NO LLM
Blender geometry, the 8 drawing generators (`draw_*.py`), the 35 gates, `parts_ledger.py`, and the `engineering-contract.ts` / `requirements_bom.py` sizing maths are pure code. Models below apply ONLY to the non-deterministic stages.

## Per-stage model map (verified 2026-06-18)

| Stage / role | Model | Where set | Benchmark fit |
|---|---|---|---|
| **Brief parse / generation** | `google/gemini-3.1-pro-preview` | `stages/0-brief-generation.ts:294` | ✅ #1 reasoner (HLE 45%, SciCode 59%), highest Omniscience (+33) |
| **Brief expansion — thin→detailed (#118)** | `google/gemini-3.1-pro-preview` | `brief-expander.ts:54` (`EXPAND_MODEL`, cached once/run) | ✅ best reasoner; correct for "expand the spec" |
| Brief light-extract pass | `google/gemini-3.1-flash-lite` | `stages/0.5-brief-expansion.ts` | ✅ fine for cheap structured pulls |
| Fast-extract default (workhorse) | `google/gemini-3.1-flash-lite` | `lib/openrouter-models.ts` (`callFastExtract`) | ✅ ok for extraction (not facts) |
| **Module/word emission (Stage 1.7) + repair** | `x-ai/grok-4.3` default; **ensemble** pool: `moonshotai/kimi-k2.6`, `qwen/qwen3.7-max`, `z-ai/glm-5.2`, `xiaomi/mimo-v2.5-pro`, gemini | `lib/emitter-completion.ts` | ✅ Grok #1 tool-use (98%) + instruction-following (81%), 75% non-hallucination |
| Judge / critic / scoring | `x-ai/grok-4.3` | `lib/emitter-completion.ts`, council | ✅ honest adversary |
| **Semantic self-audit (≥8 floor judge)** | `x-ai/grok-4.3` | `SELF_AUDIT_MODEL` env, default in `semantic-self-audit.ts:339` | ✅ honest, low-hallucination |
| **Physics critic + auto-correct (gate 33)** | `google/gemini-3.5-flash` | `radical/physics-critic.ts:58` (`FLASH_LITE_MODEL`) | ⚠️ **MISMATCH — see upgrades** |
| Council / advisor panel | `x-ai/grok-4.3` + `google/gemini-3.1-flash-lite` | `lib/advisor-engagement.ts` | ◑ ok; could add MiMo/GLM for lineage diversity |
| Research synthesis / honest anchor | `xiaomi/mimo-v2.5-pro` | research stages | ✅ non-hallucination 75%, long-context #1 |
| High-intelligence spot stages | `openai/gpt-5.5`, `gpt-5.4`, `gpt-4.1-mini` | various | ⚠️ GPT-5.5 ~94% hallucination — coding/generation ONLY, cross-check |
| Multimodal / vision scoring | `qwen/qwen3-vl-235b` | image stages | ✅ MMMU-Pro near-top |
| ~~DeepSeek V4 pro/flash~~ | `*_DO_NOT_USE` constants | registry | ✅ correctly retired in the chain (94-96% hallucination) |

## The premise check (high confidence)
**The chain is already on the current model generation.** The May-2026 leaderboard's top models *are* what the registry uses — Gemini 3.1 Pro, Grok 4.3, GPT-5.5/5.4, MiMo-V2.5-Pro, GLM-5.1/5.2, Kimi K2.6, Qwen3.7-Max. There is **no newer tier to jump to** in the benchmark data. So the wins are **role-fit fixes, not version bumps.**

## Recommended changes (grounded, not yet applied — need a chain run to validate per the scorecard-gate rule)

1. **Physics critic: `gemini-3.5-flash` → `gemini-3.1-pro-preview` (or `gpt-5.5` with cross-check).** *(confidence: high on the tier argument)* — Physics first-principles reasoning (CritPt) is dominated by reasoners (GPT-5.5 31%, Gemini 3.1 Pro 27%, GPT-5.4 23%); a *flash* tier is structurally the wrong tool for "never ship a part the engine KNOWS will fail" (gate 33), regardless of the exact flash version. Gemini 3.1 Pro is already the chain's reasoner, has the **lowest hallucination** of the frontier (+33 Omniscience), and costs ~$1.74/M — a few calls/dossier, so accuracy ≫ the 4× cost. Edit `radical/physics-critic.ts:58` AND promote it to a named registry constant (it's currently a hardcoded string not in `openrouter-models.ts`).
2. **Council seats: ensure ≥3 lineages, all >70% non-hallucination.** *(confidence: moderate)* — Ideal Anthropic-free panel: Grok 4.3 + Gemini 3.1 Pro + GLM-5.1 + MiMo-V2.5-Pro (routing-doc rule: mix lineages, prefer non-hallucination >70%). Verify the live `advisor-engagement.ts` seats.
3. **Keep Gemini 3.1 Pro for brief + reasoning, Grok 4.3 for judge/emit/audit, MiMo for honest review** — these are already optimal per the benchmark; do NOT change them.

### Separate (app-side, NOT the dossier chain)
Several `src/actions/cad-lab-*.ts` + `brainstorming-council.ts` calls still use `deepseek/deepseek-v4-pro`/`-flash` for verdict/cost/report/advisor roles. The benchmark flags these at **94-96% hallucination** — fine for prose/structured-only, risky for any judgement acted on. Migrate the judgement ones to `mimo-v2.5-pro` (honest) or `grok-4.3`. This is the CAD-lab product, separate from the engineering-dossier chain the rest of this doc covers.

## How to change a model
1. Edit the constant in `src/lib/pdf-engine-v2/lib/openrouter-models.ts` (the registry).
2. For the physics critic, also fix the hardcoded string `radical/physics-critic.ts:58`.
3. **Validate before trusting:** model swaps change output quality — run a full chain + scorecard-gate (re-render + re-ledger + re-score) and confirm no regression vs the last-good baseline (`feedback_scorecard_gate_anti_regression`). Do NOT swap a working model out before the replacement wins.
