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

## Chain exit codes (canonical — P2-5 2026-05-23)

Worker treats any non-zero exit as a failed run, but the code is preserved
in `pdf_engine_runs.error_log` for diagnosis. Worker retry policy may
eventually differ per code (currently uniform: no retry).

| Code | Meaning | Source |
|---|---|---|
| 0 | Success — PDF rendered + integrity-verified + BoM-quality passed | normal completion |
| 1 | Unexpected error (catch-all + bad CLI args) | `main().catch` or `process.argv` |
| 2 | Brief refinement loop exhausted — original brief unfixable | Stage 2.6, line ~1992 |
| 3 | G0.5 reconciliation halt — brief-vs-design scale mismatch | Stage 7.5, line ~2778 |
| 5 | Render subprocess failed — react-pdf crashed | Stage 48, line ~3983 |
| 6 | PDF integrity check failed (size < 1 KB OR header ≠ %PDF-) | Stage 48.5, lines ~4002/4012/4019 |
| 7 | Orchestrator hard fail (when engineeringContract present but tool plan crashed) | Stage 17.5, line ~2360 |
| 10 | BoM-quality audit FAILED — macros orphaned, line totals absurd, cover ≠ sub-totals | Stage 49b (audit-pdf-bom.ts), Tristan-driven 2026-05-23 |
| 11 | Layout overlap audit FAILED — text spans render at same X+Y position | Stage 49.5 (audit-pdf-layout.py), Option B 2026-05-24 |
| 12 | Numeric-claim drift detector FAILED — orchestrator-computed count diverges from BoM-emitted quantity > 20% (e.g. PyBaMM bms_slave_count=313 in narrative, BoM word qty=165) | Stage 49.7 (numeric-claim-drift-detector.ts), Tristan-driven 2026-05-24 after BESS L17 council |
| 13 | Parts-spec validator FAILED — pinned part claims spec ≥1.5× manufacturer datasheet (e.g. Schaltbau C310 claimed 1500 A, real 500 A) | Stage 49.6 (parts-spec-validator.ts), Tristan-driven 2026-05-24 after BESS L17 council |
| 14 | Sizing-vs-design audit FAILED — component rated < 50% of design continuous load × 1.25 safety factor (e.g. AC filter inductor 100 A on 1804 A continuous AC) | Stage 49.8 (sizing-vs-design-audit.ts), Tristan-driven 2026-05-24 after BESS L18 Physics Critic HIGH |

Codes 4, 8, 9 are reserved (4: brief-rewrite unfixable distinct from refinement halt; 8 was used pre-P2-5 for integrity, now mapped to 6).

When adding a new fatal exit, allocate the next free code AND update this table.

---

## Self-reinforcing PDF-quality loop (CANONICAL — codified 2026-05-23 after Tristan-flagged wind L20; gate 3 added 2026-05-24; gates 4+5 added 2026-05-24 after BESS L17 council; gate 6 added 2026-05-24 after BESS L18 Physics Critic HIGH)

**The chain is not acceptable until ALL SIX of these audits PASS:**

1. `scripts/audit-pdf-run.ts` — measures **DESIGN FIDELITY** (Physics Critic dimensions, density, brief-vs-contract scale, visual overlap). Threshold: F-1 brief_to_design_fidelity ≥ 6, no HIGH-severity engineering issues.

2. `scripts/audit-pdf-bom.ts` — measures **BoM QUALITY** + **cost-stack reconciliation**. Threshold: zero HIGH findings on B-2..B-5.
   - B-2 macro → BoM module sub-total propagation (orphaned macro = FAIL)
   - B-3 cover total ≡ Σ module sub-totals (within 10%)
   - B-4 per-line industry-floor sanity per class (`CLASS_MIN_UNIT_PRICES`)
   - B-5 module proportion vs class industry shares (`CLASS_MODULE_SHARES`)
   - B-6 PDF text extraction sanity (informational)

3. `scripts/audit-pdf-layout.py` — measures **LAYOUT INTEGRITY** via PyMuPDF bbox geometry. Threshold: zero overlap findings. Flags any pair of text spans whose bounding boxes intersect by >50% X-share AND >40% Y-share. Distinguishes legitimate side-by-side column layouts (table headers at same Y but different X — pass) from real overlaps (two text lines at the same Y AND same X — fail). Substring-inside ligature artefacts filtered. Codified 2026-05-24 after BESS L7 surfaced the wrap={false} smear for the 4th time despite three incremental render-minimal-pdf.tsx patches (lines 3742, 4144, P1-6 sweep); option B (build detector) replaces option A (patch per incident).

4. `scripts/lib/parts-spec-validator.ts` — measures **PIN-CLAIM CORRECTNESS** of every emitted real industrial part. Threshold: zero HIGH findings (claim ≥ 1.5× authoritative datasheet spec). Reads modifier_characters from each word (manufacturer + part_number + rating_primary / capacity / dimension / form) and cross-checks against a curated KNOWN_PART_AUTHORITATIVE table seeded from manufacturer datasheets. Codified 2026-05-24 after BESS L17 council found Schaltbau C310 mis-rated 3× (1500 A claimed, real 500 A), Pfannenberg CC 90.000 mis-rated 5.5× (50 kW claimed, real 9 kW @ 35°C), Bussmann 170M6810 wrong part for 200 A class (real 1250 A fuse). Root cause: deterministic-emitter.ts inline-claims specs without datasheet cross-check; the validator closes that gap universally across all 35 archetypes.

5. `scripts/lib/numeric-claim-drift-detector.ts` — measures **NARRATIVE-vs-BoM CONSISTENCY**. Threshold: zero HIGH findings (drift > 20% between orchestrator-computed count and BoM word quantity). Walks every numeric count in state.orchestratorContract.quantities (e.g. `bms_slave_count = 313`), matches by name-substring to a BoM word, compares the contract value vs the BoM `quantity` modifier. Codified 2026-05-24 after BESS L17 PDF showed "PyBaMM sizing requires 313 BMS slave boards" in narrative + "165x Custom 24-channel cell-voltage + temperature board" in BoM — a 1.9× drift the reader could not reconcile. Root cause: orchestrator tools and deterministic-emitter use different assumptions (12-channel vs 24-channel slaves); nothing reconciles them post-emission. Universal across all 35 archetypes.

6. `scripts/lib/sizing-vs-design-audit.ts` — measures **SIZING-vs-DESIGN-LOAD CORRECTNESS**. Threshold: zero HIGH findings (component rated < 50% of design continuous load × 1.25 safety factor). For every word with a current rating, matches against a SIZING_RULES table (sub_module pattern → continuous load source + safety factor), computes the expected rating from state.orchestratorContract.quantities (bus_continuous_current_a, continuous_power_kw, dc_bus_voltage_v) and flags any word under threshold. Codified 2026-05-24 after BESS L18 Physics Critic flagged PCS AC filter inductor rated 100 A for a 1 MW PCS at 400 V 3-phase (continuous AC = 1443 A, required with 1.25× margin = 1804 A; 18× undersized). Root cause: deterministic-emitter.ts has HARDCODED current ratings on many components that should be CALCULATED from design parameters. Distinct from gate 13 (parts-spec validator) which catches WRONG SPEC CLAIM on a real part — gate 6 catches UNDERSIZED component regardless of part identity. Universal across all 35 archetypes; pre-charge contactors, busbars, and isolation monitors excluded (different sizing rules).

**Why all six are required**: Physics Critic measures _design fidelity to brief_ — does the design honour stated rated_power, voltage, geometry? It does NOT audit BoM LINE TOTALS or whether cover-page total reconciles with the BoM section. The wind L20 chain scored F-1 9/10 on fidelity while shipping foundation £24k for a 6 MW gravity base, blade £15, hub £45. The BoM-quality audit catches LINE-TOTAL bugs but does NOT measure whether the rendered PDF is readable — BESS L7 passed gates 1+2 while page 24 showed multi-line text stacked at the same Y coordinate. The layout-integrity audit catches that smear but does NOT verify pinned-part claims match manufacturer datasheets — BESS L17 passed gates 1+2+3 while shipping Schaltbau C310 at 1500 A (real 500 A) and Pfannenberg CC 90.000 at 50 kW (real 9 kW). The pin-claim validator catches that but does NOT detect when narrative and BoM disagree on the same quantity — BESS L17 also had narrative "313 BMS slaves" while BoM said 165. The drift detector catches that but does NOT verify the component is sized for the design load — BESS L18 passed gates 1+2+3+4+5 while shipping a 100 A AC filter inductor on a 1804 A continuous AC bus. Six independent quality dimensions: fidelity, cost-stack reconciliation, layout integrity, pin-claim correctness, narrative-BoM consistency, sizing-vs-design correctness; all six must gate.

**The agent must NEVER trust chain stdout logs alone**. Every chain run:

1. Open the resulting `chain-v2.pdf` (via pdftotext extraction of cover lines + BoM sub-totals + sample line items per module).
2. Verify cover Raw materials BoM ≈ Σ of module sub-totals shown in the BoM table.
3. Verify per-line items pass class-specific industry floors (e.g. utility wind blade ≥ £100k each — anything 1000× under is wrong).
4. Confirm `audit-pdf-run.ts`, `audit-pdf-bom.ts`, `audit-pdf-layout.py`, AND `parts-spec-validator.ts` all exit 0.
5. Only THEN declare the chain validated.

When `audit-pdf-bom` reports orphaned macros, the macro→word matcher in `scripts/render-minimal-pdf.tsx:885-927` is the first suspect — it uses fuzzy token-matching that fails when macro names contain qualifier tokens (assembly, drivetrain, gravity, onshore, bedplate, scale, panel). Fix paths: (a) lower matcher threshold + strip qualifier tokens, (b) rename macros in engineering-contract.ts to match word_ids exactly, (c) widen cost-repair UP-cap for the class.

Drawer: `drawer_forgeos_decisions_219fa79b7ec290b7` — the workflow rule that drove this codification.

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
