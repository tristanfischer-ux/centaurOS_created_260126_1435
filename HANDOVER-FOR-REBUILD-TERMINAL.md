# Handover — Brainstorming Council + Specialist Model Mapping

**Date:** 2026-04-25
**From:** the parallel terminal that was working on `main` overnight
**For:** the terminal rebuilding the entire app

This is what you need to know about decisions, mockups, and production swaps that landed in the last 8 hours, so you don't unwittingly regress them in the rebuild.

---

## 1. New product concept: Brainstorming Council

A new UX pattern for `/agents`. **Don't lose this in the rebuild — Tristan signed off on the V1 mockup.**

**What it is:** when a founder enters brainstorm mode, the response isn't a single specialist's answer. It's a council:
1. **Fiona (Fundraising)** opens the question with framing — assumptions, dimensions worth disagreeing on. Powered by **Claude Opus 4.7**.
2. **3–5 relevant specialists fire in parallel**, each with their character voice + a model lineage badge ("DeepSeek V4-Pro", "Mistral Large 2", "Qwen 3 235B", etc.). Each gives a distinct angle.
3. **Fiona closes** with synthesis: "they all agree on X, the strongest dissent is Y, your next concrete action is Z." Powered by **Claude Opus 4.7**.

**Mockup:** `BRAINSTORM-COUNCIL-MOCKUP-V1.html` at the repo root. 7,795px tall, light theme, all states (populated, empty, mid-fire-with-timeout). Open it in a browser before you wire the production page.

**Sample question pre-filled in the mockup:** "Should I raise £2M now or hit 100 paying users first?" Council members in the demo: Sage / Finn / Sal / Max. The yellow "Sage and Finn disagree on..." strip is intentional — surfacing dissent is the whole point.

**Six open questions in the mockup's "Design Notes" section** that you should answer before production wiring:
1. Should the model badge be visible to free-tier users? (Possibly clashes with the "13 specialists, not 13 AI agents" rule from CLAUDE.md.)
2. Does Fiona always host, or does the question pick the best framer?
3. Council size fixed-4 or dynamic 3–5?
4. Layout: 2×2 grid (chosen for 1200px readability) or horizontal row?
5. How do timeouts fall back? Currently the mockup shows "Sage done, Max thinking, Finn timed out" as a partial state.
6. Cost per brainstorm: blended **~£1.00–£1.20/session** (cheap-council ~£0.80, premium-council with Sage + Cal in middle ~£1.35 — both are on Opus 4.7). Pro-tier paywall? Free for Enterprise? Earlier £0.90 estimate was wrong because the audit revealed Sage and Cal already run on Opus.

**Where it slots in the rebuild:** under `/agents` (the new "brainstorming-first landing" already in main per commit `b93bde36`). It's an alternative interaction mode — the existing single-specialist chat stays.

---

## 2. Specialist→model mapping changes (5 swaps applied tonight)

This is the production state of model assignments per specialist as of tonight. **The CLAUDE.md "Baseline Scores (April 5, 2026)" table is now stale on these rows — trust this doc instead.**

Each swap was benchmarked through `experiments/autoagent-strategy-specialist/benchmark/runner_multi.py` (a new multi-provider sidecar to `runner.py`, also dropped tonight). Keep/discard rule: composite ≥ baseline-0.2 AND voice ≥ 4.0.

| Specialist | ID | Old | **New** | Why |
|---|---|---|---|---|
| Mia | growth-marketer | Sonnet 4 | **Claude Haiku 4.5** | composite +0.06, voice +0.10, **~5× cheaper** |
| Sal | sales-lead | Sonnet 4 | **gpt-4.1-mini** | composite +0.07, voice -0.05, **~10× cheaper** |
| Fang | vp-manufacturing | DeepSeek V4 | **Qwen 3 235B** | composite +0.10ish, voice **5.00** (best Fang ever measured) — Chinese training corpus has real manufacturing depth |
| Fiona | fundraising-advisor | Sonnet 4 | **Claude Opus 4.7** | **+0.21 composite, +0.35 voice** — cleanest win in the suite. Also doubles as Brainstorming Council host. |
| Finn | finance-lead | Opus 4 | **DeepSeek V4-Pro (Together AI)** | composite +0.19, voice +0.05, **~8× cheaper than Opus** |

**Untouched / corrected after live config audit (don't accidentally touch in rebuild):**

The fresh audit of `specialists-config.ts` + `failover.ts` revealed the CLAUDE.md "April 5" baseline table was wrong on multiple specialists. Live state below — trust this:

| Specialist | Lives at (live) | Why kept |
|---|---|---|
| Max (CTO) | **Gemini 3.1 Pro** (`google` tier) | V4-Pro spike: -0.03 quality, 2.2× more expensive, 2.5× slower. V4 also rejected. Gemini wins. |
| Jian (VP Eng) | DeepSeek V4 (`deepseek`) | Already optimal — composite 4.45, voice 4.85. |
| Chase (VP Supply) | **Gemini 3.1 Pro** (`google`) | Llama 3.3/4 70B catastrophic: -1.19 composite, voice 2.40. Llama can't hold persona depth. |
| Priya (Product) | DeepSeek V4 (`deepseek`) | Already optimal — composite 4.51 (highest in fleet). |
| Cal (Chief of Staff) | **Claude Opus 4.7** (`claude`) | Synthesis-heavy. The `claude` tier resolves to Opus 4.7 (not Sonnet) — has been for some time. |
| Harper (HR) | **DeepSeek V4** (`deepseek`) | Re-benchmark candidate (empathy might need Claude) but currently on V4. |
| Sage (Strategy) | **Claude Opus 4.7** (`claude`) | Proposed Mistral Large 2 swap blocked: no `MISTRAL_API_KEY` or `OPENROUTER_API_KEY` in env. Sage stays on Opus until key arrives — note: Mistral would be a quality downgrade for raw scores; the swap rationale is council diversity not better synthesis. |
| Leo (Legal) | **Claude Opus 4.7** (`claude`) | Was already on Opus. The "Sonnet→Opus benchmark" agent discovered this — `claude` tier had been Opus all along. Tristan's risk-call retroactively confirmed by what was already deployed. |

**Cost sketch:** the 5 applied swaps net out to a real reduction (Mia/Sal/Fang/Finn cheaper, Fiona more expensive but lower call volume). Specifics in the commit message of the apply commit (`feat(specialists): apply 5 benchmark-validated model swaps`).

---

## 3. Critical infrastructure precondition: streamDeepSeek max_tokens cap

**Read this before touching any DeepSeek call site in the rebuild.**

`src/lib/ai-providers/registry.ts` — function `streamDeepSeek` previously clamped `max_tokens` at 8192. **V4-Pro reasoning_content blows past 8192 mid-stream and silently truncates.** Per `~/.claude/projects/-Users-tristanfischer/memory/forgeos_deepseek_max_tokens_cap.md` (now 2 instances):
- Original cap was the V4-Flash bug (commit `c7ae580b`)
- V4-Pro inherits it and is BLOCKED until raised

The apply-tonight commit raises it to 16384 (or 32768 if API supports — agent verifies before commit). **If you're rewriting the registry, keep the cap at 16384 minimum and keep the comment explaining why.**

---

## 4. DEEPSEEK_API_KEY production hygiene

Memory drawer: `~/.claude/projects/-Users-tristanfischer/memory/forgeos_prod_deepseek_key_has_trailing_literal_newline.md`

The production `DEEPSEEK_API_KEY` previously had a literal `\n` suffix that `.trim()` doesn't strip. All DeepSeek-tier specialists returned 401. The apply-tonight agent grep-checks before swapping Finn — if it's still broken, the apply will halt with a BLOCKERS file and Tristan needs to remove + re-add the key in the Vercel Production env (Preview was fixed last week).

**If you regenerate `.env` files in the rebuild, paste the key without trailing whitespace.** Use `vercel env pull` then strip any trailing `\n` before re-adding.

---

## 5. Investor-search infra (recently fixed, don't regress)

Two fixes landed earlier tonight on `main`. Both have memory drawers — do not undo:

- **`94b14d74`** — `src/actions/investors.ts:733` and `src/actions/public-investor-preview.ts:291` swapped `nomicEmbedQuery` (768-dim) → `embedQuery` (1536-dim OpenAI). pgvector RPC requires matching dim. See `embedding_dim_mismatch_recurring_failure.md` (now 5 instances).
- **`f1fde3b1`** — same files: `match_marketplace_listings_v2` paginated calls dropped from `PAGES = 8` → `PAGES = 2`. Postgres `statement_timeout` (57014) at 8 × 1000 × 1536-dim cosine scans. See `forgeos_pgvector_statement_timeout.md`.

**Universal rule going into the rebuild:** every OpenAI `embeddings.create` call MUST pass `dimensions: 1536` explicitly. The default isn't guaranteed and drifts under provider conditions. Check returned vector length, throw on mismatch, never silent-fall back to keyword.

---

## 6. GPT-5.4 selective downgrade (commit `48612942`)

28 of 77 gpt-5.4 references downgraded to gpt-4.1-mini or claude-haiku-4-5 — utility paths only. **49 specialist-tied sites kept on gpt-5.4 deliberately** (brainstorming quality matters per Tristan).

If your rebuild touches any of these files, **keep them on gpt-5.4** (not 4.1-mini):
- `src/actions/canvas.ts`, `strategic-planner.ts`, `smart-goals.ts`, `transcript-to-strategy.ts`, `analyze-business-plan.ts`
- `src/lib/ai-worker.ts`, `src/actions/tasks.ts` (trackAIUsage tags)
- `src/actions/cad-lab.ts`, `src/lib/cad-lab/api-helpers.ts`, `src/lib/cad-lab/multi-model-consensus.ts`
- `src/app/(platform)/the-forge/services/{fea,cfd,thermal}-generator.ts`, `scan.ts`, `convergence-controller.ts`
- `src/lib/agents/evaluator.ts`, `intelligence-sweep-orchestrator.ts`, `sweep-orchestrator.ts`, `speculative-prompt.ts`
- `src/lib/agent-memory/observer.ts`, `reflector.ts`
- `src/lib/telegram/ai-processor.ts`
- `src/lib/red-team/prompts.ts` (BEAR persona = Max)
- `src/app/api/agents/execute/route.ts` (specialist tier fallback chains)
- `src/app/(platform)/agents/brief-specialist-dialog.tsx` (UI default)

Fully downgraded sites (4.1-mini/Haiku) — **don't accidentally upgrade back to 5.4 in the rebuild:**
- `src/app/api/marketplace/{ai-search,compare,forge-match,talent-match}/route.ts`
- `src/app/api/team/compare/route.ts`
- `src/app/api/voice-to-task/route.ts`, `src/app/api/rfq/voice/route.ts`
- `src/lib/knowledge-vault/{connector,extractor,document-extractor}.ts`
- `src/actions/assess-coverage.ts`, `generate-advisory-answer.ts`
- `src/lib/reports/summary-generator.ts` (Haiku, daily-pulse summary)

Per memory drawer `forgeos_gpt54_default_overkill.md`: **default new sites to gpt-4.1-mini** for structured/utility work; reserve 5.4 for specialist-owned chains.

---

## 7. Useful memory drawers worth re-reading

In `~/.claude/projects/-Users-tristanfischer/memory/`:
- `forgeos_two_push_scripts_one_table.md` — `13-push-forgeos.js` (investors → Finance) vs `35-nightshift-push-updates.py` (companies → Services/Products). Different DBs. Live Nightshift DB lives at the Tauri app bundle path.
- `forgeos_supplier_push_misleading_counter.md` — "X/N new pushes" counter is INSERT-only. UPDATEs invisible. Grep `PATCH ... -> 204` to see real progress.
- `forgeos_pgvector_statement_timeout.md` — cap PAGES at 2 for `match_marketplace_listings_v2` callers.
- `embedding_dim_mismatch_recurring_failure.md` — 5 instances now. Always pass `dimensions: 1536` explicitly + length-check.
- `forgeos_gpt54_default_overkill.md` — model selection rule of thumb.
- `forgeos_deepseek_max_tokens_cap.md` — the streamDeepSeek cap precondition.

---

## 8. What's still pending / blocked

- **Sage Mistral validation** — blocked on `MISTRAL_API_KEY` or `OPENROUTER_API_KEY` in env. Tristan to provide. **Important:** Sage is currently on Opus 4.7, so a Mistral swap would be a quality downgrade for raw rubric scores — the rationale is *council diversity* (different national/RLHF lineage), not better synthesis. Frame it that way before applying.
- **NIM API key** — Tristan to sign up at build.nvidia.com for the "free Blackwell" V4-Pro route. The Finn swap currently routes through Together AI's DeepSeek-V4-Pro (paid) until the NIM key arrives.
- **Telegram specialist routing** — `src/lib/telegram/specialist-chat.ts` has hardcoded claude/minimax routing pair. The new tiers (qwen-235b, gpt-mini, haiku, deepseek-v4-pro) all route to MiniMax in Telegram chats. Out of scope for the swap commits but worth fixing if Telegram chat is part of the rebuild.

---

## 9. Active background processes (do not kill)

- **PID 2357** — `research/40-import-fca-register-uk.py` (FCA UK fund-manager register import). ~12h elapsed. Alphabet sweep at prefix `iev*`, 244K unique FRNs collected, will start /Permission filtering once discovery ends.
- **PID 18203** — `research/17-unified-pipeline.py --force --order-by-staleness --limit 5000` (deep enrichment chain). ~8h elapsed. ~370/5000 firms verified+synthesized, rate ~50/hr.
- **`com.forgecapital.openai-embed-nightly`** — launchd, fires 06:50 BST daily. Re-embeds `investors_mirror` with OpenAI 1536-dim. Idempotent.
- **`com.forgecapital.dashboard-server`** — launchd, KeepAlive=true. PID 95331 currently. Don't `nohup` a sibling — it'll EADDRINUSE.

---

## 10. The single most-important thing

**Read `tasks/lessons.md` at the start of every session in the rebuild terminal.** Every correction, every "TRIED X, USE Y" rule, every gotcha worth keeping is there. Project CLAUDE.md says it; this handover repeats it because the rebuild work will trip these without the rules in front of you.

— end of handover —
