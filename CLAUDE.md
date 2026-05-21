# ForgeOS (CentaurOS) — Agent Directives

> **Architecture:** See [ARCHITECTURE.md](./ARCHITECTURE.md).
> **Lessons learned:** See [tasks/lessons.md](./tasks/lessons.md) — read at session start, update after every correction.
> **Sub-agent model selection:** See `~/.claude/CLAUDE.md` for auto-toggle rules. Re-grep `src/lib/agents/specialists-config.ts` if uncertain.

---

## STOP HUNTING — read these BEFORE searching the filesystem

**API keys** → [`./API_KEYS.md`](./API_KEYS.md). ~30 services, ~150 keys, 15 file locations. Check first; if it's wrong, fix it before moving on.

**Databases** → [`./DATABASES.md`](./DATABASES.md). 7 SQLite databases + 6 Supabase projects. **The 30k-supplier database is `~/.forge-truth/forge-truth.db` table `companies` (27,953 rows)** with profile filters `bess-supplier-discovery-20260422` (330 BESS rows), `manufacturing` (11,586), `cleantech-uk` (4,224). The investor SQLite is misleadingly named `forge-capital-corrupted.db` but is fully functional. Crawler corpus (99 GB) at `~/Developer/Forge-Capital/nightshift/crawler/corpus.db`.

**Cross-references in MemPalace**:
- `forge_capital_env_paths_two_locations` — secrets in TWO places, check `~/secrets/` FIRST
- `forge_capital_corpus_db_location` — corpus.db is NOT in `~/.forge-capital/`
- `forgeos_supabase_project_ids` — TWO Supabase projects easily confused
- `database_reconciliation_2026_04_29` — 7 stores, 2 overlaps, one-writer rule

Both reference files were regenerated 2026-05-17 by discovery agents. If they look stale, re-run the same prompts (in the session conversation log).

---

## Reference Documents — Read When Relevant

| When the task involves... | Read |
|---|---|
| Debugging autopilot / pipeline / production failures | `~/.claude/docs/forgeos/forgeos-debugging.md` |
| Implementation, autonomous execution, iteration loops, database security | `~/.claude/docs/forgeos/forgeos-execution-standards.md` |
| Dispatching sub-agents, parallel work, briefing templates | `~/.claude/docs/forgeos/forgeos-subagent-rules.md` |
| UI components, layout, colours, spacing, forms, design philosophy | `~/.claude/docs/forgeos/forgeos-design-system.md` |
| TypeScript patterns, imports, error handling, documentation | `~/.claude/docs/forgeos/forgeos-code-standards.md` |
| Specialist configs, model swaps, benchmarking, live mapping table | `~/.claude/docs/forgeos/forgeos-specialist-protocol.md` |
| Architecture decisions, schema changes, security review | `~/.claude/docs/forgeos/forgeos-red-team.md` |
| Building or porting from a static HTML mockup | `~/.claude/docs/mockups.md` |

---

## ForgeOS PDF Engine — Mistakes to Avoid (codified 2026-05-13)

Read these BEFORE editing the radical pipeline or running an iter loop:

1. **Always run `RADICAL_PHASE_3_PER_MODULE=true` AND `PA_PIPELINE=true`** to invoke Stage 1.7 module decomposition. Without these flags, the legacy Phase 1 single-shot path runs and Stage 1.7 + Piece 1E/1F/1G never fire. Drawer: `forgeos_gotchas_a0e8bad14e3acb02`.

2. **Grep ALL consumers of shared resources BEFORE editing one.** VENDOR_CATALOG has TWO consumers (`demo/resolution.ts` legacy + `stages/4b-radical-resolution.ts` production). MAX_DISTRIBUTOR_CALLS lives in both. Editing one without the other = silent half-fix. Drawer: `forgeos_gotchas_239b3de81b31f922` + `dual_write_completeness_grep_pattern`.

3. **The 102-leaf BoM cap comes from `radical/character-hierarchy.ts` WORDS[] table** (lines 416-636), NOT the hardcoded JSON skeleton in `phase-0-slice/`. The JSON only fires with `RADICAL_PHASE_0_SLICE=true` debug flag. Drawer: `forgeos_gotchas_c6d5b80b64b076ac`.

4. **Stage 1.7 emission architecture: monolith, NOT tier-split.** Plan v3's 5-tier split was rejected — cross-level coherence weaker, 4× more expensive, 7× slower than monolith + multi-emitter ensemble. Drawer: `forgeos_decisions_38d4817270ba7b1b`.

5. **6 emitters + 2 judges + tiebreak rule for Stage 1.7** when `RADICAL_MULTI_EMITTER=true`. Word inclusion = UNION (any emitter's word gets in), NOT majority — different LLMs use different character_id names for the same part. Quantity-modifier majority-vote per R-C2 stays. Drawer: `forgeos_decisions_60f80e92ac5d3959`.

6. **§4.5 binding contract**: each sub-module = English sentence + RAD syntax + grammar links. `english_sentence` + `rad_syntax` MUST propagate from emission → SubModuleSpec → sentence-generator → §4.5 PDF renderer. Field-drop on the way is the most common defeat-the-purpose. Grep before merging anything that touches SubModuleSpec.

7. **Token budgets: 150_000 everywhere in pdf-engine-v2.** Never propose smaller "to be safe." Truncation is more expensive than unused tokens. Drawer: `forgeos_gotchas_282dc33826c87c30`.

8. **iter-N script copies STALE radical-phase5-state-*.json if the run dies upstream.** If a pipeline dies at PA Stage 3 Research Synthesis (intermittent MiMo JSON parse), the script will copy the PREVIOUS iter's snapshot and the watcher will report success. Always verify state.json timestamp + log shows `[pipeline] === Phase 5` before trusting iter results.

9. **`moonshotai/kimi-k2.6` is intermittently unavailable on OpenRouter** (council-scorer.ts:342 has the comment). 6-emitter ensemble's ≥3-of-6 quorum handles this. If both Kimi + Qwen fail simultaneously, fall back to a 4-emitter run.

10. **Multimodal scorer** (`scripts/score-radical-pdfs-multimodal.py`) hardcodes 10 baseline slugs — symlink your output dir to `rs-bess` (or appropriate slug) before running. Requires `ANTHROPIC_API_KEY` despite the engine pipeline being Anthropic-free (separate concern — evaluation tooling exception). Drawers: `forgeos_gotchas_29241216203faf3c` + `forgeos_decisions_6d7f3576ca4695a8`.

11. **Every chain commit MUST add a regression-harness invariant OR carry a `regression-harness: no-invariant-needed because <reason>` line in the commit body.** Codified 2026-05-21 after the three-chain loop (HAPS/BESS/VF) revealed that fixes were not being mechanically guarded — successive iterations kept surfacing the SAME bug families (unit-mismatch, cost overrun, hero-pipeline). The `regression-harness:` line is grep-able from `git log --grep`; CI can later promote it to a hard pre-commit gate. Invariants live in `scripts/regression-harness.tsx` (universal I1-I9 + class-specific buckets like VF.canopy_preserved, BESS.cell_fields). When you fix a bug, add an invariant that would have caught it; that way iter-N catches iter-(N+1) regressions automatically instead of waiting for the next visual inspection. Drawer: `forgeos_gotchas_d6c11208fbd5059f` (unit-family recurrence motivates this).

12. **The unit-family bug is a known recurring family — pre-emptively grep all consumers of `parsedBrief.constraints.target_performance` whenever you touch ANY one of them.** Three confirmed hits in 24 hours (2026-05-20 cover-side `class-price-bands.ts:102`; Physics Repair `universal-arithmetic-gates.ts:839`; G0.5 `1.8-brief-target-reconciliation.ts`). A 4th hit is highly likely in `stages/0.1-physics-ledger.ts`, `radical/physics-critic.ts`, `radical/design-decisions.ts`, or `deployment-envelopes.ts`. Pattern: read brief value as bare number, compare against design value assuming one fixed unit. Fix template: use the exported `targetPerformanceValueAs(state, targetUnit)` helper from `class-price-bands.ts`; check brief's declared unit family BEFORE comparing; skip mappings whose family doesn't match. Drawer: `forgeos_gotchas_d6c11208fbd5059f`.

---

## Engine action logs — REQUIRED for diagnosis (Tristan 2026-05-14)

Every engine run MUST emit an append-only `actions.jsonl` to the iter output dir. One JSONL record per atomic action (LLM call, gate evaluation, state save, repair). Records carry: timestamp, step_name, action_type, model + finish_reason + tokens + cost (for LLM calls), gate_name + score + reasons (for gates), before_hash + after_hash + key_changes (e.g. `cell_count: 4900 → 3500`) for repairs.

Without action logs, regressions like iter-12A's 4900→3500 cell-count break are diagnosed by hand-diffing 200 KB JSON files at each stage. With action logs, the diagnostic CLI reports "R2 (Grok 4.3) changed cell_count at step 6.2: 4900 → 3500" instantly.

Apply: any new pipeline script in `scripts/` or new orchestrator path in `src/lib/pdf-engine-v2/` MUST append to `actions.jsonl` at every step. A diagnostic CLI (`scripts/diagnose-run.tsx <iter-dir>`) reads the log + each saved state to produce a "what changed when, by whom, why" timeline.

Drawer: `forgeos_decisions_1579854d0a2206e9`.

---

## Company Identity

- **CORRECT:** "Fractional Forge" (company), "ForgeOS" (product), "Forge teams" (users)
- **WRONG:** Centaur Dynamics, CentaurOS, Centaur teams
- Apply to: page titles, UI copy, meta tags, documentation
- Do NOT change: git repo URLs, migration files, foundry IDs, font/image filenames, Sentry project, Docker names
<!-- autoskills:start -->
<!-- autoskills:end -->
