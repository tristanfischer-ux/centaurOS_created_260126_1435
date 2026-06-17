# OpenRouter Model ID Audit — 2026-06-17

**Scope:** READ-ONLY audit of every OpenRouter model slug referenced in `src/` and `scripts/`, cross-referenced against the LIVE OpenRouter catalogue (`https://openrouter.ai/api/v1/models`, fetched 2026-06-17, 337 models).

**Constraint honoured:** production generation pipeline (`scripts/serial-design-chain*.tsx` + emitters) is deliberately Anthropic-free. No recommendation below introduces an Anthropic model into production generation. Anthropic appears only in (a) the multimodal scorer (documented eval exception), (b) brainstorming-council (an explicit multi-lineage council seat), (c) Telegram specialist chat, and (d) Blender-scene authoring scripts — all flagged, none changed-by-recommendation into the gen path.

**No code was edited. No git command was run.** This is a recommendation report only.

---

## How to read the status column

- **CURRENT** — slug is live AND is the newest sensible version for its role. Leave as-is.
- **SUPERSEDED** — slug is live but a newer same-family version now exists on OpenRouter. Upgrade is optional (benchmark-gated per `models.ts` policy) unless noted.
- **REMOVED / INVALID** — slug is NOT in the live catalogue. Will 404 at call time. Must change.
- **PARTIAL-SLUG** — the grep captured a truncated slug (e.g. `mistralai/mistral-large` with trailing context); the full literal in source is verified separately in the notes.

Confidence: **high** unless stated. All presence/absence checks are deterministic against the fetched JSON.

---

## TOP PRIORITY UPDATES

Ordered: breakages first, then clear stale aliases, then high-value upgrades.

### P0 — Will 404 / mis-resolve at call time (fix to avoid silent failure)

| # | current slug | file:line(s) | role | problem | recommended |
|---|---|---|---|---|---|
| P0-1 | `deepseek/deepseek-chat` | `src/lib/per-stage-loop/adapters/*.ts` (9 files: bom-master:219, finn-cost:389, illustration:396, layout:39, max-decompose:185, proofreader-self-review:381, risks-register:165, sizing:37, supplier-match:334), `src/lib/sizing/auto-adjust.ts:263`, `src/lib/cad-lab/api-helpers.ts:654`, `src/lib/telegram/specialist-chat.ts:196` | per-stage-loop adapters (Max-decompose, Finn-cost, sizing, BoM, supplier, layout, proofreader, risks, illustration) | `deepseek/deepseek-chat` resolves to **DeepSeek V3 (created 2024-12-26)** — two major generations behind. The engine's canonical DeepSeek is `deepseek-v4-pro` / `deepseek-v4-flash`. This alias is stale, not removed, so it silently runs an old model. | `deepseek/deepseek-v4-flash` (cheap/structured) or `deepseek/deepseek-v4-pro` (reasoning), matching the per-adapter need. **MED confidence** on which tier per adapter — these are production-gen adapters, so confirm tier before swapping. |
| P0-2 | `anthropic/claude-opus-4-7`, `anthropic/claude-sonnet-4-6` (HYPHEN form) sent to OpenRouter | `src/lib/pdf-engine-v2/lib/openrouter-models.ts:20,42` (exported consts `CLAUDE_OPUS_4_7`, `CLAUDE_SONNET_4_6`); `scripts/serial-design-chain-v2.tsx:153` is dot-form OK, but `scripts/test-k10-prompt-addenda-multiemit.tsx:83` uses hyphen | OpenRouter-routed Anthropic constants | OpenRouter's catalogue only has the **dot** form (`anthropic/claude-opus-4.7`, `anthropic/claude-sonnet-4.6`). The **hyphen** form (`-4-7`, `-4-6`) is the *native Anthropic SDK* convention and **404s on OpenRouter**. The `openrouter-models.ts` CLAUDE_* consts appear currently UNREFERENCED by pdf-engine-v2 routing (latent), so no live breakage today — but they are a trap for the next caller. | If kept: `anthropic/claude-opus-4.7` / `anthropic/claude-sonnet-4.6` (dot). NOTE: these are eval/council-adjacent, NOT gen-path — do not wire into generation. **high** confidence on the slug-form bug. |
| P0-3 | `qwen/qwen3.5-405b` | `src/lib/pdf-engine-v2/lib/action-logger.ts:81` | pricing-table key only (cost attribution) | NOT in live catalogue. Cosmetic only (pricing lookup, not routing) — a missing key just omits the cost estimate. Low urgency but it is a dead slug. | Drop or replace with a live Qwen the engine uses (`qwen/qwen3.7-max`, `qwen/qwen3.6-max-preview`). **high** |
| P0-4 | `qwen/qwen-3.6-plus` | `scripts/serial-design-chain-v2.tsx:160` (in a comment documenting a past FATAL), and grep shows it as a documented dead ID | comment / historical note | Already documented as an invalid ID that FATAL'd iter-57 (the active const is `qwen/qwen3.7-max` on :162). Confirm no live reference remains. | No action if comment-only. **high** |
| P0-5 | `google/gemini-pro` | `src/lib/pdf-engine-v2/sanitiser.test.ts:94` | TEST fixture string | NOT in live catalogue (the bare `google/gemini-pro` slug is retired). Test-only — harmless, but a stale literal. | Leave (test fixture) or bump to `google/gemini-3.1-pro-preview` for realism. **high** |

### P1 — Clear same-family upgrades now available (benchmark-gate per policy, but strong candidates)

| # | current slug | file:line(s) | role | newer slug (live) | reason | conf |
|---|---|---|---|---|---|---|
| P1-1 | `z-ai/glm-5.1` | `src/lib/ai/models.ts:103`; `openrouter-models.ts:37`; `council-scorer.ts:393`; `action-logger.ts:76`; `stage-rl-council.ts:130`; `brief-rl-iterate.ts:168`; `decompose-rl-iterate.ts:212`; `feasibility-full-rl.ts:260`; `feasibility-rl-iterate.ts:207`; `sizing-rl-iterate.ts:191`; `pure-search-feasibility-test.ts:52`; `score-brief-only.ts:62`; `serial-design-chain-v2.tsx:152`; `serial-design-chain.tsx`(via const); `test-roundtrip-diff.ts:58`; `verify-action-log.tsx:50`; `brainstorming-council.ts:35,63,128` | schema/JSON-strict reviewer (R2 in the RL councils), council judge | **`z-ai/glm-5.2`** (created 2026-06-16, ctx 1,048,576) | Same Zhipu family, **released yesterday**, and a **5× context jump** (202,752 → 1,048,576). GLM is used as the strict-schema reviewer across ~18 files — its 202K context cap has historically been a squeeze on enriched designs. 5.2 directly relieves that. **This is the single highest-leverage upgrade** given GLM's footprint. Swap in lockstep across all listed files (see "Lockstep" section). | **high** the slug exists; **med** that 5.2 ≥ 5.1 on schema discipline (benchmark before mass-swap, but the context relief alone justifies it for the long-context RL reviewers). |
| P1-2 | `minimax/minimax-m2.7` | `src/lib/pdf-engine-v2/lib/action-logger.ts:88` (pricing key); `src/app/api/agents/execute/route.ts` (the `minimax/qwen` grep hit is a FALSE POSITIVE — a file path, not a model) | pricing-table key (M2.7); MiniMax tier in specialist config (`minimax` tier) | **`minimax/minimax-m3`** (created 2026-05-31, ctx 1,048,576) | M3 supersedes M2.7 (M2.7 = 2026-03-18, ctx 204,800). 5× context. MiniMax is the "high-volume batch" specialist tier. | **high** slug exists; **med** on quality delta — MiniMax tier is low-stakes batch, safe to bump. |
| P1-3 | `qwen/qwen3.6-max-preview` | `src/lib/pdf-engine-v2/lib/action-logger.ts:80` (pricing key); `scripts/test-k10-prompt-addenda-multiemit.tsx:84`; `scripts/verify-action-log.tsx:50` | Qwen long-context seat (older preview) | **`qwen/qwen3.7-max`** (created 2026-05-21, ctx 1,000,000) — ALREADY the canonical const in `models.ts:108` + `openrouter-models.ts:31` | The engine already standardised on `qwen3.7-max` (see `models.ts`). The lingering `qwen3.6-max-preview` references are stragglers that should converge to 3.7-max for consistency. | **high** |

### P2 — Anthropic eval-path freshness (NOT gen-path; informational)

These are the documented Anthropic exceptions. Opus 4.8 now exists; whether to bump is a judgement call for eval tooling, NOT a production-gen change.

| # | current slug | file:line(s) | role | newer slug (live) | note | conf |
|---|---|---|---|---|---|---|
| P2-1 | `anthropic/claude-opus-4-7` | `scripts/score-radical-pdfs-multimodal.py:14,66,166,171,1353` | **multimodal PDF scorer** (documented Anthropic eval exception — uses `ANTHROPIC_API_KEY`, native SDK, hyphen slug is CORRECT for native SDK) | `claude-opus-4.8` exists (2026-05-27) on OpenRouter; native SDK equivalent `claude-opus-4-8` | This is the eval scorer, NOT generation. Native-SDK hyphen form is correct here. Bump to Opus 4.8 only if you want the scorer on the latest judge. Keep it OUT of the gen pipeline. | **high** it's eval-only; **low** on whether 4.8 changes scoring materially. |
| P2-2 | `anthropic/claude-opus-4.7` (dot, OpenRouter) | `src/actions/brainstorming-council.ts:26,59` | brainstorming-council Opus seat (explicit multi-lineage council — a product surface, not the dossier-gen chain) | `anthropic/claude-opus-4.8` (2026-05-27, live on OpenRouter) | The council deliberately mixes lineages incl. one Anthropic seat. Bumping 4.7→4.8 keeps that seat current. This is a Forge advisory-council product surface, distinct from the Anthropic-free DOSSIER generation chain. | **high** slug live; **med** benefit. |
| P2-3 | `anthropic/claude-sonnet-4.6` / `claude-opus-4.7` | `scripts/generate-blender-scene.tsx:17,18,38`; `scripts/author-blender-scene.tsx:49,62` (note: those two also list `openai/gpt-5.5` + `google/gemini` as the actual primaries) | Blender-scene AUTHORING scripts (CAD render code-gen, dev tooling) | dot-form Opus 4.8 / Sonnet 4.6 are current | Render-script authoring, not dossier prose generation. Low stakes. Sonnet 4.6 is already current (no newer Sonnet on OpenRouter — `claude-sonnet-4.6` 2026-02-17 is the newest Sonnet). | **high** |

---

## LEAVE AS-IS (verified CURRENT — newest sensible version for the role)

| slug | why it's still best | live created |
|---|---|---|
| `openai/gpt-5.5` | Newest GPT-5 line on OpenRouter is 5.5 (2026-04-24). There is **no gpt-5.6 / gpt-6**. `gpt-5.5-pro` exists but is a heavier/pricier tier, not a drop-in. CURRENT. | 2026-04-24 |
| `google/gemini-3.1-pro-preview` | Still the **newest Gemini Pro** — there is NO `gemini-3.5-pro` or `gemini-4-pro` on OpenRouter (3.5 only exists in the *flash* tier). CURRENT for the frontier-reasoning role. | 2026-02-19 |
| `google/gemini-3.5-flash` | Newest Flash (2026-05-19). CURRENT. | 2026-05-19 |
| `google/gemini-3.1-flash-lite` | **Newest flash-lite** — no `gemini-3.5-flash-lite` exists (only a `-preview` predecessor). `models.ts:52` comment is correct. CURRENT. | 2026-05-07 |
| `x-ai/grok-4.3` | **Newest general Grok** (2026-05-01). `grok-4.20` is OLDER (2026-03-31) despite the higher-looking minor; `grok-build-0.1` is a narrow build-agent, not a general model. `models.ts:93` comment about tuple-sort confusion is accurate. CURRENT. | 2026-05-01 |
| `deepseek/deepseek-v4-pro` | Newest DeepSeek (2026-04-24). No V5. CURRENT (where intentionally used; disqualified-for-facts per routing docs but that's a usage policy, not staleness). | 2026-04-24 |
| `deepseek/deepseek-v4-flash` | Newest DeepSeek flash (2026-04-24). CURRENT. | 2026-04-24 |
| `xiaomi/mimo-v2.5-pro` | Newest MiMo (2026-04-22). No v2.6/v3. CURRENT. | 2026-04-22 |
| `qwen/qwen3.7-max` | Newest Qwen *max* (2026-05-21). `qwen3.7-plus` (2026-06-03) is newer-dated but a *different tier* (plus≠max), not a strict upgrade. CURRENT for the 1M-context max role. | 2026-05-21 |
| `openai/gpt-4.1-mini` | Still live (2025-04-14); the cheap classification/extraction workhorse across marketplace + knowledge-vault + products. No mini regression. CURRENT (could consider `gpt-5.4-mini`/`-nano` but that's a re-tier, not a staleness fix). | 2025-04-14 |
| `openai/gpt-5.4` | Live (2026-03-05). Used across `the-forge/services/*` (CAD/CFD/FEA/thermal/scan), `ai-worker`, telegram, reports, outreach, smart-goals, strategic-planner, evaluator. 5.5 exists but is pricier; 5.4 is a deliberate cost/quality point. Not stale — same-family 5.5 is an *optional* upgrade, not required. | 2026-03-05 |
| `openai/gpt-5` (bare) | `src/lib/cad-lab/api-helpers.ts:544` — live (2025-08-07). Older but valid. Could bump to 5.4/5.5 for consistency; not broken. **LOW priority.** | 2025-08-07 |
| `moonshotai/kimi-k2.6` | Live (2026-04-20). NOTE: `kimi-k2.7-code` (2026-06-12) is newer BUT it is a **code-specialised** variant (262K ctx, coding-tuned) — NOT a general-purpose drop-in for Kimi's scientific/council role here. There is no general `kimi-k2.7`. **Leave k2.6** unless a coding-specific seat wants k2.7-code. | 2026-04-20 |
| `meta-llama/llama-4-maverick` | Live (2025-04-05). Used ONLY as a documented *fallback alternate* in `council-scorer.ts:391` comment (not an active judge). CURRENT-enough as a fallback. | 2025-04-05 |
| `mistralai/mistral-large` | `council-scorer.ts:398` — appears in a COMMENT documenting why Mistral Large was REMOVED as a judge (HTTP 400s, iter-09). Not an active reference. The bare `mistralai/mistral-large` (2024-02-26) is live but legacy; `mistral-large-2512` is newer. No action — it's historical commentary. | 2024-02-26 |
| `google/gemini-2.5-flash`, `google/gemini-2.5-flash-lite` | `action-logger.ts:71,72` (pricing keys) + `sanitiser.test.ts` (test). Live, legacy, pricing/test only. Harmless. | 2025-06/07 |
| `deepseek/deepseek-r1` | `openrouter.ts:96` — referenced only in a `REASONING_MODEL_PATTERNS` substring guard + comment ("superseded by v4-pro, kept for safety"). Live (2025-01-20). Pattern-guard only, not routed. Leave. | 2025-01-20 |
| `qwen/qwen3-235b-a22b` | `models.ts:80` (Fang specialist), `cad-lab-reviews.ts:459`, `fang-engineering-review.ts:25,398`. Live (2025-04-28). Benchmark-validated specialist choice (2026-04-25). Newer Qwens exist but this was a deliberate benchmark pick — leave unless re-benchmarked. | 2025-04-28 |
| `qwen/qwen3-vl-235b-a22b-instruct` | `score-radical-pdfs-multimodal.py:180,1353` — multimodal eval scorer vision model. Live (2025-09-24). CURRENT for that eval role. | 2025-09-24 |

---

## LOCKSTEP SWAPS (dual-write gotcha — change ALL or none)

Per the project's repeated dual-write lesson (`forgeos_dual_write_completeness_grep_pattern`, CLAUDE.md "grep ALL consumers before editing one"): several slugs appear in **multiple files** and MUST be swapped together, or you get a silent half-fix where one path runs the new model and another runs the old.

1. **`z-ai/glm-5.1` → `z-ai/glm-5.2`** (P1-1) touches ~18 locations. The canonical definitions are `src/lib/ai/models.ts:103` and `src/lib/pdf-engine-v2/lib/openrouter-models.ts:37` (exported const `GLM_5_1`). **Many callsites inline the literal `'z-ai/glm-5.1'` instead of importing the const** (e.g. all the `*-rl-iterate.ts`, `stage-rl-council.ts:130`, `score-brief-only.ts:62`, `serial-design-chain-v2.tsx:152`). A swap must update the const AND every inlined literal. Grep `z-ai/glm-5.1` repo-wide before declaring done. Also bump the **pricing key** in `action-logger.ts:76`.

2. **`deepseek/deepseek-chat` → `deepseek/deepseek-v4-*`** (P0-1) touches 9 per-stage-loop adapters + auto-adjust + api-helpers + telegram. These are independent literals (no shared const) — every one must be edited. Decide tier per adapter (flash vs pro).

3. **`qwen/qwen3.6-max-preview` → `qwen/qwen3.7-max`** (P1-3): pricing key (`action-logger.ts:80`) + 2 test scripts. The production const is already 3.7-max; only stragglers remain.

4. **Anthropic dot/hyphen normalisation** (P0-2): the engine has BOTH forms. For any path that routes to **OpenRouter**, the slug MUST be dot-form (`claude-opus-4.7`). For any path using the **native Anthropic SDK** (the multimodal scorer, `specialists-config` claude-tier via the app's Anthropic client), hyphen-form (`claude-opus-4-7`) is correct. Do NOT blindly global-replace — the correct form depends on the transport. The two live mismatches to fix are the OpenRouter-routed hyphen consts in `openrouter-models.ts:20,42` (latent, but a trap).

---

## Anthropic-in-pipeline flags (per the audit brief)

The brief asked to flag any Anthropic model in the production GENERATION pipeline. Findings:

- **Production dossier-generation chain** (`scripts/serial-design-chain-v2.tsx` model block lines 142-162): active models are `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `grok-4.3`, `glm-5.1`, `qwen3.7-max`. **RESOLVED (high confidence):** `HAIKU_4_5` (`anthropic/claude-haiku-4.5`, line 153) is a **DEAD constant** — it was swapped OUT of the R3 reviewer slot on 2026-05-15 and replaced by `QWEN_3_7_MAX` (see the comment at lines 154-162). It now survives only as (a) the unused const definition, (b) a `MAX_TOKENS_BY_MODEL` entry at line 172, and (c) stale prose in code comments + the reviewer prompt template ("R3 (Haiku 4.5)", "Grok, GLM, Haiku, Flash-Lite" at lines 9/1035). The R3 reviewer is now Qwen 3.7 Max. **NO Anthropic model is actively invoked in the dossier-generation chain — the Anthropic-free rule holds.** Cleanup opportunity (cosmetic): delete the dead `HAIKU_4_5` const + its token-map entry and correct the stale "Haiku" mentions in the comments/prompt, so the next reader isn't misled into thinking Haiku is an active reviewer.
- **brainstorming-council.ts** (Opus 4.7 seat): this is the advisory-council PRODUCT, not dossier generation — the Anthropic-free rule is about dossier gen. Acceptable, but noted.
- **score-radical-pdfs-multimodal.py** (Opus 4.7): documented eval exception, uses ANTHROPIC_API_KEY natively. Acceptable per MEMORY.md item #10.
- **telegram/specialist-chat.ts** + **generate/author-blender-scene.tsx**: chat + render-authoring, not dossier gen. Acceptable.

No NEW Anthropic model is recommended for the generation pipeline by this report.

---

## False positives excluded from the model inventory

These grep hits are NOT model IDs (file paths / unrelated strings), excluded from all tables above:
- `microsoft/connect`, `microsoft/callback`, `microsoft/tokens`, `microsoft/client`, `microsoft/tokens.ts`, `microsoft/client.ts` — Microsoft Graph OAuth route paths (`src/app/api/microsoft/*`, `src/lib/microsoft/*`, sheets-sync).
- `minimax/qwen` (`src/app/api/agents/execute/route.ts:1228`) — a path/identifier fragment, not a slug.
- `minimax/video-01` (`src/lib/ai-providers/types.ts:223`) — a video-model type literal in an AI-providers abstraction (MiniMax video); not part of the LLM council/emitter set. Live MiniMax video models exist but are out of scope for this text-LLM audit.

---

## Catalogue snapshot used (newest-per-family, live 2026-06-17)

```
anthropic: claude-fable-5 (06-09), claude-opus-4.8 / -4.8-fast (05-27), claude-opus-4.7 (04-16), claude-sonnet-4.6 (02-17), claude-haiku-4.5 (2025-10-15)
google:    gemini-3.5-flash (05-19), gemini-3.1-flash-lite (05-07), gemini-3.1-pro-preview (02-19)  [NO 3.5-pro, NO gemini-4]
x-ai:      grok-4.3 (05-01)  [grok-4.20 is OLDER; grok-build-0.1 is a build agent]
openai:    gpt-5.5 / gpt-5.5-pro (04-24), gpt-5.4 + 5.4-mini/nano/pro (03-05/03-17)  [NO gpt-5.6 / gpt-6]
deepseek:  deepseek-v4-pro / v4-flash (04-24)  [deepseek-chat = V3, 2024-12-26 — STALE alias]
qwen:      qwen3.7-plus (06-03), qwen3.7-max (05-21), qwen3.6-max-preview (04-27)
z-ai:      glm-5.2 (06-16), glm-5.1 (04-07)
xiaomi:    mimo-v2.5-pro / mimo-v2.5 (04-22)
moonshot:  kimi-k2.7-code (06-12, CODE-only), kimi-k2.6 (04-20)
minimax:   minimax-m3 (05-31), minimax-m2.7 (03-18)
mistral:   mistral-medium-3-5 (04-30), mistral-large-2512 (2025-12-01); bare mistral-large = 2024 legacy
meta:      llama-4-maverick / -scout (2025-04-05) — newest Llama on OpenRouter
```

---

## Summary of recommended actions (for the orchestrator to apply)

1. **Fix `deepseek/deepseek-chat` (V3) → `deepseek-v4-flash`/`-pro`** in 12 files (9 are production-gen per-stage-loop adapters). [P0-1]
2. **Normalise OpenRouter-routed Anthropic hyphen slugs to dot form** in `openrouter-models.ts:20,42` (latent trap; the gen-path one on `serial-design-chain-v2.tsx:153` is already dot-form). [P0-2]
3. **`z-ai/glm-5.1` → `z-ai/glm-5.2`** across ~18 files in lockstep (biggest win: 5× context for the schema reviewers). Benchmark first if cautious; the context relief alone helps the long-context RL reviewers. [P1-1]
4. **`minimax/minimax-m2.7` → `minimax/minimax-m3`** (pricing key + MiniMax tier). [P1-2]
5. **Converge `qwen/qwen3.6-max-preview` → `qwen/qwen3.7-max`** (stragglers; prod const already 3.7-max). [P1-3]
6. **Verify (don't blind-swap) whether `HAIKU_4_5` is invoked in the dossier-gen path** — if yes, that's an Anthropic-free-rule violation to resolve. [gen-path flag]
7. Drop dead pricing/test slugs `qwen3.5-405b`, `google/gemini-pro`, `qwen-3.6-plus` at convenience. [P0-3/4/5]
8. Optional eval-tooling freshness: Opus 4.7 → 4.8 in the multimodal scorer + brainstorming-council Opus seat (NOT gen-path). [P2]

**Everything in "LEAVE AS-IS" is genuinely current** — notably the frontier seats (gpt-5.5, gemini-3.1-pro-preview, grok-4.3, deepseek-v4-pro/flash, mimo-v2.5-pro, qwen3.7-max, kimi-k2.6) are all the newest sensible version for their role. The codebase's frontier choices are NOT stale; the staleness is concentrated in (a) the `deepseek-chat` V3 alias, (b) GLM-5.1→5.2, and (c) minor pricing-table/straggler slugs.
