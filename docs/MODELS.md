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

## Live model landscape — checked 2026-06-18 against OpenRouter `/models` (NOT the stale May benchmark)
> **Method (do this, don't trust a dated benchmark doc — new models ship weekly):** `GET https://openrouter.ai/api/v1/models`, sort by `created`. The May-2026 benchmark above is a quality *reference* only; for *availability* always re-query live.

Newer models now available that postdate the May benchmark AND the registry's current choices:

| Model | Released | Newer than (chain uses) | ctx | $in/$out /M | Note |
|---|---|---|---|---|---|
| `z-ai/glm-5.2` | 2026-06-16 | glm-5.1 | **1M** (↑ from 202K) | 1.40 / 4.40 | Same lineage, newer, 5× context — natural upgrade for the schema/tool-use role. Already partly referenced in the registry (`GLM_5_2`) |
| `moonshotai/kimi-k2.7-code` | 2026-06-12 | kimi-k2.6 | 262K | 0.74 / 3.50 | **CODE-specialised — no general `kimi-k2.7` exists.** Evaluate vs k2.6 on the emission task; don't blind-swap a general role onto a code model |
| `qwen/qwen3.7-plus` | 2026-06-03 | qwen3.7-max | 1M | 0.32 / 1.28 | Newer + ~4× cheaper, but "plus" ≠ "max" tier — evaluate, don't assume stronger |
| `minimax/minimax-m3` | 2026-05-31 | m2.7 (benchmark) | 1M | 0.30 / 1.20 | New generation, very cheap — candidate for high-volume extraction roles |
| `x-ai/grok-build-0.1` | 2026-05-20 | — | 256K | 1.00 / 2.00 | New agentic "build" model; specialised, NOT a grok-4.3 replacement |
| `google/gemini-3.5-flash` | 2026-05-19 | gemini-3-flash | 1M | 1.50 / 9.00 | Current-gen flash (already the physics-critic model) |

**No `gemini-3.5-pro`, `grok-4.4`, `gpt-5.6`, or `deepseek-v5`.** The brief/reasoner role (`gemini-3.1-pro-preview`) and judge role (`grok-4.3`) are still the newest in their tiers.

⚠️ **Availability ≠ quality.** The catalogue confirms these exist + their date/price/context. It does NOT prove they're *better* — there is no published benchmark for glm-5.2 / kimi-k2.7 / qwen3.7-plus / minimax-m3 in our data yet (all postdate the May AA run). **Before swapping any into the chain: get fresh Artificial Analysis numbers OR A/B on the real chain task + scorecard-gate. Never swap on recency alone.**

## ✅ APPLIED 2026-06-18 (Tristan-directed)
- **Kimi K2.6 → `moonshotai/kimi-k2.7-code`** across the chain: registry constant `KIMI_K2_7`, the emitter ensemble (`stage-rl-council.ts:131`), pricing map (`action-logger.ts`), tests + harness scripts. (No general K2.7 exists — the code variant fits the structured-output ensemble.)
- **GLM was already on `z-ai/glm-5.2`** in the chain (`GLM_5_2` constant); only the stale "GLM-5.1" comment was corrected. The 22 `glm-5.1` refs are app-side `cad-lab`, NOT the chain.
- **Smoke-validated** (direct OpenRouter probe — BoM extraction + JSON + the 94/0.93=101.1 arithmetic step): glm-5.2, kimi-k2.7-code, minimax-m3, qwen3.7-plus, gemini-3.1-flash-lite — **all 5 PASS**, byte-identical clean JSON.
- **Cheap-model quality check:** `minimax-m3` ($0.30/$1.20) and `qwen3.7-plus` ($0.32/$1.28) are **quality-competent** on structured extraction — identical to the incumbent `gemini-3.1-flash-lite`. BUT not cheaper than flash-lite for that role; their edge is 1M context. No reason to swap the extract role — consider them only for long-context jobs. (One task — does NOT test hard reasoning/physics.)
- **STILL PENDING:** a full chain A/B + scorecard-gate to confirm the Kimi swap doesn't regress dossier quality (smoke ≠ end-to-end). Flag for the next chain run.

## Recommended changes (remaining — each needs an A/B + scorecard-gate to validate)

1. **GLM-5.1 → `z-ai/glm-5.2` for the schema/tool-use + glm ensemble seat.** *(confidence: moderate-high)* — Same Zhipu lineage, 2-days-newer, **5× context (202K→1M)**, modest price bump. Lowest-risk adoption (same family). The registry already declares `GLM_5_2`; finish the migration of the `glm-5.1` references. Validate tool-use/JSON discipline didn't regress.
2. **Physics critic: benchmark `gemini-3.5-flash` vs `gemini-3.1-pro-preview`.** *(confidence: moderate — softened after live check)* — `gemini-3.5-flash` is a *current-gen* flash (2026-05-19), not the old "Gemini 3 Flash", so it's better than I first assumed. But it's still a flash tier on a first-principles-physics gate ("never ship a part the engine KNOWS will fail", gate 33) where pro-tier reasoners lead CritPt. A/B the two on real physics critiques; if `3.1-pro` wins, switch (cost is trivial — few calls/dossier). Either way, promote the hardcoded string at `radical/physics-critic.ts:58` into a named registry constant.
3. **Kimi: A/B `kimi-k2.7-code` vs `kimi-k2.6` on the emission task only.** *(confidence: low — needs testing)* — 2.7 is code-specialised; the emitter produces structured engineering specs (code-like), so it *might* help, but it's not a clean general upgrade. Don't swap blind.
4. **Evaluate `minimax-m3` / `qwen3.7-plus` for high-volume cheap roles** (fast-extract, classification) — both new, 1M context, ~$0.30/M. Could cut extraction cost; needs a quality check vs `gemini-3.1-flash-lite`.
5. **Council seats: ≥3 lineages, all >70% non-hallucination, Anthropic-free.** Ideal panel: Grok 4.3 + Gemini 3.1 Pro + **GLM-5.2** + MiMo-V2.5-Pro. Verify the live `advisor-engagement.ts` seats.
6. **Keep `gemini-3.1-pro-preview` (brief+reasoner) and `grok-4.3` (judge/emit/audit) — still the newest in their tiers.** No `gemini-3.5-pro`/`grok-4.4` exists. MiMo-V2.5-Pro stays the honest-review anchor (also the cheapest output at $0.87/M).

### Separate (app-side, NOT the dossier chain)
Several `src/actions/cad-lab-*.ts` + `brainstorming-council.ts` calls still use `deepseek/deepseek-v4-pro`/`-flash` for verdict/cost/report/advisor roles. The benchmark flags these at **94-96% hallucination** — fine for prose/structured-only, risky for any judgement acted on. Migrate the judgement ones to `mimo-v2.5-pro` (honest) or `grok-4.3`. This is the CAD-lab product, separate from the engineering-dossier chain the rest of this doc covers.

## How to change a model
1. Edit the constant in `src/lib/pdf-engine-v2/lib/openrouter-models.ts` (the registry).
2. For the physics critic, also fix the hardcoded string `radical/physics-critic.ts:58`.
3. **Validate before trusting:** model swaps change output quality — run a full chain + scorecard-gate (re-render + re-ledger + re-score) and confirm no regression vs the last-good baseline (`feedback_scorecard_gate_anti_regression`). Do NOT swap a working model out before the replacement wins.
